import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    Image,
    ScrollView,
    ActivityIndicator,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Share,
    StatusBar,
    RefreshControl,
    Dimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { db, auth } from '../firebase/config';
import { doc, setDoc, deleteDoc, onSnapshot, collection, getDoc, serverTimestamp } from 'firebase/firestore';
import { RootStackParamList } from '../navigation/types';
import { useAlertContext } from '../contexts/AlertContext';
import { usePersonalization } from '../contexts/PersonalizationContext';
import { backendUrl } from '../config/backend';
import { syncFullMangaReadState } from '../services/readingStatsService';
import { getProviderAliasLabel } from '../utils/providerBranding';

const REQUEST_TIMEOUT_MS = 8000;
const SCREEN_WIDTH = Dimensions.get('window').width;
const COVER_WIDTH = Math.min(176, SCREEN_WIDTH * 0.42);
const COVER_HEIGHT = Math.min(260, COVER_WIDTH * 1.45);

type Chapter = {
    slug: string;
    chapterSlug: string;
    number?: string;
    title?: string;
    releaseDate?: string;
    lang?: string;
    groupName?: string;
};

type Manga = {
    slug: string;
    title: string;
    cover: string;
    description?: string;
    source: string;
    status?: string;
    statusLabel?: string;
    country?: string;
    language?: string;
    contentRating?: string;
    genres?: string[];
    badges?: string[];
    score?: string;
    totalChapters?: number;
    authors?: string[];
    artists?: string[];
    chapters: Chapter[];
};

type LastReadChapterInfo = {
    slug: string;
    number?: string;
    imageIndex?: number;
    imagePage?: number;
};

const fetchJsonWithTimeout = async (url: string, timeoutMs = REQUEST_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
        return await res.json();
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            throw new Error('Tiempo de espera agotado. No se pudo conectar al backend.');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

const normalizeStatus = (value?: string) => {
    const raw = String(value || '').toLowerCase();
    if (raw.includes('completed') || raw.includes('finaliz') || raw.includes('complet')) return 'Completado';
    if (raw.includes('ongoing') || raw.includes('curso')) return 'En curso';
    if (raw.includes('hiatus') || raw.includes('pausa')) return 'En pausa';
    if (raw.includes('cancel')) return 'Cancelado';
    return 'Desconocido';
};

const buildCoverImageSource = (cover: string, source?: string) => {
    const uri = String(cover || '').trim();
    if (!uri) return { uri };

    const normalizedSource = String(source || '').toLowerCase().trim();
    if (normalizedSource !== 'zonatmoorg') {
        return { uri };
    }

    return {
        uri,
        headers: {
            Referer: 'https://zonatmo.org/',
            Origin: 'https://zonatmo.org',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
    };
};

const DetailsScreen: React.FC = () => {
    const { theme } = usePersonalization();
    const route = useRoute();
    const detailsParams = (route.params ?? {}) as RootStackParamList['Details'];
    const { slug = '' } = detailsParams;

    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { alertError, alertSuccess } = useAlertContext();

    const [manga, setManga] = useState<Manga | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);
    const [isPremium, setIsPremium] = useState<boolean | null>(null);
    const [isFavorite, setIsFavorite] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const [readChapterSlugs, setReadChapterSlugs] = useState<Set<string>>(new Set());
    const [lastReadChapterInfo, setLastReadChapterInfo] = useState<LastReadChapterInfo | null>(null);
    const [isMangaRead, setIsMangaRead] = useState(false);

    const [selectedLanguage, setSelectedLanguage] = useState('all');
    const [selectedGroup, setSelectedGroup] = useState('all');
    const [chapterOrder, setChapterOrder] = useState<'desc' | 'asc'>('desc');
    const [descriptionExpanded, setDescriptionExpanded] = useState(false);

    const continueReading = useCallback(() => {
        if (!lastReadChapterInfo?.slug) return;
        navigation.navigate('Reader', {
            hid: lastReadChapterInfo.slug,
            resumeFromProgress: true,
        });
    }, [lastReadChapterInfo?.slug, navigation]);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            setCurrentUserUid(user ? user.uid : null);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!currentUserUid) {
            setIsPremium(false);
            return;
        }
        const userDocRef = doc(db, 'users', currentUserUid);
        const unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
            setIsPremium(docSnap.exists() ? docSnap.data()?.accountType === 'premium' : false);
        }, () => setIsPremium(false));
        return unsubscribeProfile;
    }, [currentUserUid]);

    const loadManga = useCallback(async () => {
        if (!slug) {
            setError('No se encontró el slug del manga.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const data = await fetchJsonWithTimeout(backendUrl(`/manga/${encodeURIComponent(slug)}`));
            const raw = data?.manga;
            if (!raw) throw new Error('Respuesta inválida del backend.');

            const mappedChapters: Chapter[] = (raw.chapters || []).map((ch: any) => ({
                slug: ch.slug,
                chapterSlug: ch.chapterSlug,
                number: ch.number || '',
                title: ch.title || '',
                releaseDate: ch.releaseDate || '',
                lang: ch.lang || raw.language || 'es-419',
                groupName: ch.groupName || '',
            }));

            const genres = Array.isArray(raw.genres)
                ? Array.from(new Set(raw.genres.map((g: any) => String(g || '').trim()).filter(Boolean)))
                : [];
            const badges = Array.isArray(raw.badges)
                ? Array.from(new Set(raw.badges.map((b: any) => String(b || '').trim()).filter(Boolean)))
                : [];

            setManga({
                slug: raw.slug,
                title: raw.title || 'Sin titulo',
                cover: raw.cover || '',
                description: raw.description || '',
                source: raw.source || 'zonatmo',
                status: raw.status || 'unknown',
                statusLabel: raw.statusLabel || '',
                country: raw.country || 'unknown',
                language: raw.language || 'es-419',
                contentRating: raw.contentRating || 'safe',
                genres,
                badges,
                score: raw.score || '0.0',
                totalChapters: raw.totalChapters || mappedChapters.length,
                authors: Array.isArray(raw.authors) ? raw.authors : [],
                artists: Array.isArray(raw.artists) ? raw.artists : [],
                chapters: mappedChapters,
            });
        } catch (e: any) {
            setError(e.message || 'Error cargando detalles.');
            alertError(e.message || 'Error cargando detalles.');
        } finally {
            setLoading(false);
        }
    }, [slug, alertError]);

    useEffect(() => {
        loadManga();
    }, [loadManga]);

    useEffect(() => {
        if (!currentUserUid || !manga?.slug) {
            setIsFavorite(false);
            return;
        }
        const favoriteDocRef = doc(db, 'users', currentUserUid, 'favorites', manga.slug);
        const unsub = onSnapshot(favoriteDocRef, (docSnap) => setIsFavorite(docSnap.exists()), () => setIsFavorite(false));
        return unsub;
    }, [currentUserUid, manga?.slug]);

    useEffect(() => {
        if (!currentUserUid || !manga?.slug || !isPremium) {
            setReadChapterSlugs(new Set());
            return;
        }

        const comicReadDocRef = doc(db, 'users', currentUserUid, 'readComics', manga.slug);
        const chaptersReadCollectionRef = collection(comicReadDocRef, 'chaptersRead');
        const unsub = onSnapshot(chaptersReadCollectionRef, (querySnapshot) => {
            const slugs = new Set<string>();
            querySnapshot.forEach((s) => {
                const data = s.data() as { chapterSlug?: string; slug?: string };
                const key = String(data?.chapterSlug || data?.slug || s.id || '').trim();
                if (key) slugs.add(key);
            });
            setReadChapterSlugs(slugs);
        }, () => setReadChapterSlugs(new Set()));

        return unsub;
    }, [currentUserUid, manga?.slug, isPremium]);

    useEffect(() => {
        if (!currentUserUid || !manga?.slug || !isPremium) {
            setLastReadChapterInfo(null);
            setIsMangaRead(false);
            return;
        }

        const comicReadDocRef = doc(db, 'users', currentUserUid, 'readComics', manga.slug);
        const unsub = onSnapshot(comicReadDocRef, (docSnap) => {
            if (!docSnap.exists()) {
                setLastReadChapterInfo(null);
                setIsMangaRead(false);
                return;
            }
            const data = docSnap.data();
            const storedLastRead = data?.lastReadChapter || null;
            const parsedLastRead = storedLastRead ? {
                slug: String(storedLastRead.slug || '').trim(),
                number: String(storedLastRead.number || '').trim(),
                imageIndex: Number.isFinite(Number(storedLastRead.imageIndex)) ? Number(storedLastRead.imageIndex) : undefined,
                imagePage: Number.isFinite(Number(storedLastRead.imagePage)) ? Number(storedLastRead.imagePage) : undefined,
            } : null;
            setLastReadChapterInfo(parsedLastRead?.slug ? parsedLastRead : null);
            setIsMangaRead(data?.isFullMangaRead === true);
        }, () => {
            setLastReadChapterInfo(null);
            setIsMangaRead(false);
        });

        return unsub;
    }, [currentUserUid, manga?.slug, isPremium]);

    const availableLanguages = useMemo(() => {
        const langs = new Set<string>();
        (manga?.chapters || []).forEach((ch) => {
            const lang = String(ch.lang || '').trim();
            if (lang) langs.add(lang);
        });
        return ['all', ...Array.from(langs)];
    }, [manga?.chapters]);

    const availableGroups = useMemo(() => {
        const groups = new Set<string>();
        (manga?.chapters || []).forEach((ch) => {
            const g = String(ch.groupName || '').trim();
            if (g) groups.add(g);
        });
        return ['all', ...Array.from(groups)];
    }, [manga?.chapters]);

    const filteredChapters = useMemo(() => {
        const list = [...(manga?.chapters || [])]
            .filter((ch) => selectedLanguage === 'all' || String(ch.lang || '').toLowerCase() === selectedLanguage.toLowerCase())
            .filter((ch) => selectedGroup === 'all' || String(ch.groupName || '') === selectedGroup);

        list.sort((a, b) => {
            const na = Number(a.number || 0);
            const nb = Number(b.number || 0);
            if (chapterOrder === 'asc') return na - nb;
            return nb - na;
        });

        return list;
    }, [manga?.chapters, selectedLanguage, selectedGroup, chapterOrder]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await loadManga();
        } finally {
            setRefreshing(false);
        }
    }, [loadManga]);

    const toggleFavorite = useCallback(async () => {
        if (!currentUserUid) {
            alertError('Debes iniciar sesion para usar favoritos.');
            return;
        }
        if (isPremium === false) {
            alertError('Funcion disponible solo para usuarios Premium.');
            return;
        }
        if (!manga?.slug) return;

        setFavoriteLoading(true);
        try {
            const favoriteDocRef = doc(db, 'users', currentUserUid, 'favorites', manga.slug);
            if (isFavorite) {
                await deleteDoc(favoriteDocRef);
                alertSuccess('Manga eliminado de favoritos.');
            } else {
                await setDoc(favoriteDocRef, {
                    comicTitle: manga.title,
                    coverUrl: manga.cover,
                    slug: manga.slug,
                    content_rating: manga.contentRating || 'safe',
                    source: manga.source,
                    favoritedAt: serverTimestamp(),
                });
                alertSuccess('Manga agregado a favoritos.');
            }
        } catch (e: any) {
            alertError(`No se pudo actualizar favoritos: ${e.message || 'error'}`);
        } finally {
            setFavoriteLoading(false);
        }
    }, [currentUserUid, isPremium, manga, isFavorite, alertError, alertSuccess]);

    const updateInProgress = useCallback(async (chapter: Chapter) => {
        if (!currentUserUid || !manga) return;
        const safeChapterId = String(chapter.chapterSlug || chapter.slug || '').trim();
        const inProgressDocRef = doc(db, 'users', currentUserUid, 'inProgressManga', manga.slug);
        await setDoc(inProgressDocRef, {
            mangaTitle: manga.title,
            coverUrl: manga.cover,
            slug: manga.slug,
            source: manga.source,
            lastReadChapterHid: chapter.slug,
            lastReadChapterSlug: safeChapterId,
            lastReadChapterNumber: chapter.number || '',
            lastUpdated: serverTimestamp(),
            startedAt: serverTimestamp(),
        }, { merge: true });
    }, [currentUserUid, manga]);

    const toggleChapterRead = useCallback(async (chapter: Chapter, currentlyRead: boolean) => {
        if (!currentUserUid || !manga?.slug || !isPremium) return;

        const comicReadDocRef = doc(db, 'users', currentUserUid, 'readComics', manga.slug);
        const safeChapterId = String(chapter.chapterSlug || chapter.slug || '').trim();
        if (!safeChapterId) return;
        const chapterReadDocRef = doc(collection(comicReadDocRef, 'chaptersRead'), safeChapterId);

        if (currentlyRead) {
            await deleteDoc(chapterReadDocRef);
            await syncFullMangaReadState(
                currentUserUid,
                manga.slug,
                (manga.chapters || []).map((mangaChapter) => mangaChapter.chapterSlug || mangaChapter.slug),
                {
                    comicTitle: manga.title,
                    coverUrl: manga.cover,
                    slug: manga.slug,
                },
            );
            return;
        }

        await setDoc(chapterReadDocRef, {
            chapterSlug: safeChapterId,
            slug: chapter.slug,
            number: chapter.number || '',
            title: chapter.title || '',
            readAt: serverTimestamp(),
        }, { merge: true });

        await setDoc(comicReadDocRef, {
            comicTitle: manga.title,
            coverUrl: manga.cover,
            slug: manga.slug,
            isFullMangaRead: false,
            lastReadChapter: {
                slug: chapter.slug,
                chapterSlug: safeChapterId,
                number: chapter.number || '',
                title: chapter.title || '',
                readAt: serverTimestamp(),
            },
        }, { merge: true });

        await syncFullMangaReadState(
            currentUserUid,
            manga.slug,
            (manga.chapters || []).map((mangaChapter) => mangaChapter.chapterSlug || mangaChapter.slug),
            {
                comicTitle: manga.title,
                coverUrl: manga.cover,
                slug: manga.slug,
            },
        );

        await updateInProgress(chapter);
    }, [currentUserUid, manga, isPremium, updateInProgress]);

    const toggleMangaReadStatus = useCallback(async () => {
        if (!currentUserUid || !manga?.slug) {
            alertError('Debes iniciar sesion para usar esta funcion.');
            return;
        }
        if (!isPremium) {
            alertError('Funcion disponible solo para usuarios Premium.');
            return;
        }

        const comicReadDocRef = doc(db, 'users', currentUserUid, 'readComics', manga.slug);
        if (isMangaRead) {
            await setDoc(comicReadDocRef, { isFullMangaRead: false }, { merge: true });
            alertSuccess('Manga marcado como no leido.');
        } else {
            await setDoc(comicReadDocRef, {
                isFullMangaRead: true,
                comicTitle: manga.title,
                coverUrl: manga.cover,
                slug: manga.slug,
            }, { merge: true });
            alertSuccess('Manga marcado como leido.');
        }
    }, [currentUserUid, manga, isPremium, isMangaRead, alertError, alertSuccess]);

    const onShare = useCallback(async () => {
        if (!manga) return;
        const message = `${manga.title}\n\nLeelo en KamiReader`;
        try {
            await Share.share({ message, title: manga.title });
        } catch (error: any) {
            alertError(error.message || 'No se pudo compartir');
        }
    }, [manga, alertError]);

    const goToReader = useCallback(async (chapter: Chapter) => {
        navigation.navigate('Reader', { hid: chapter.slug, resumeFromProgress: false });
        if (isPremium) {
            const chapterReadKey = String(chapter.chapterSlug || chapter.slug || '').trim();
            await toggleChapterRead(chapter, readChapterSlugs.has(chapterReadKey));
        }
    }, [navigation, isPremium, toggleChapterRead, readChapterSlugs]);

    const renderChapterItem = useCallback((chapter: Chapter, index: number) => {
        const chapterReadKey = String(chapter.chapterSlug || chapter.slug || '').trim();
        const isRead = isPremium === true && readChapterSlugs.has(chapterReadKey);
        const uniqueKey = `${chapter.chapterSlug || chapter.slug}__${chapter.groupName || 'default'}__${chapter.lang || 'default'}__${index}`;
        const chapterNum = Number(chapter.number);
        const chapterNumLabel = Number.isFinite(chapterNum) ? String(chapterNum) : '?';
        const rawTitle = String(chapter.title || '').replace(/\s+/g, ' ').trim();
        const hasDuplicatedPrefix = new RegExp(`^cap[ií]tulo\s*${String(chapterNumLabel).replace('.', '\\.')}(\b|\s*)`, 'i').test(rawTitle);
        const cleanTitle = hasDuplicatedPrefix ? rawTitle.replace(/^cap[ií]tulo\s*[\d.]+\s*[-:]?\s*/i, '').trim() : rawTitle;
        const finalTitle = cleanTitle ? `Capitulo ${chapterNumLabel} - ${cleanTitle}` : `Capitulo ${chapterNumLabel}`;
        
        return (
            <TouchableOpacity key={uniqueKey} style={[styles.chapterItem, isRead && styles.chapterItemRead]} onPress={() => goToReader(chapter)}>
                <View style={styles.chapterLeftBlock}>
                    <View style={[styles.chapterNumberPill, isRead && styles.chapterNumberPillRead]}>
                        <Text style={styles.chapterNumberPillText}>{chapterNumLabel}</Text>
                    </View>
                    <View style={styles.chapterItemContent}>
                        <Text style={styles.chapterTitle} numberOfLines={1}>{finalTitle}</Text>
                        <View style={styles.chapterMetaRow}>
                            {!!chapter.lang && <Text style={styles.chapterMetaPill}>{chapter.lang.toUpperCase()}</Text>}
                            {!!chapter.groupName && <Text style={styles.chapterMetaPill}>{chapter.groupName}</Text>}
                        </View>
                    </View>
                </View>
                <Ionicons name={isRead ? 'checkmark-circle' : 'chevron-forward'} size={22} color={isRead ? theme.success : theme.accent} />
            </TouchableOpacity>
        );
    }, [isPremium, readChapterSlugs, goToReader, theme.accent, theme.success]);

    if (loading) {
        return (
            <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.center}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text style={[styles.loadingText, { color: theme.text }]}>Cargando detalles...</Text>
            </LinearGradient>
        );
    }

    if (error || !manga) {
        return (
            <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.center}>
                <Text style={[styles.errorText, { color: theme.danger }]}>{error || 'No se pudo cargar el manga.'}</Text>
                <TouchableOpacity style={[styles.retryButton, { backgroundColor: theme.accent }]} onPress={loadManga}>
                    <Text style={styles.retryButtonText}>Reintentar</Text>
                </TouchableOpacity>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.container}>
            <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
            <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
                >
                    <View style={[styles.heroCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={styles.headerContainer}>
                            <Image source={buildCoverImageSource(manga.cover, manga.source)} style={[styles.coverImage, { borderColor: theme.border }]} resizeMode="cover" />
                            <View style={styles.infoCard}>
                                <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{manga.title}</Text>

                                <View style={styles.quickMetaRow}>
                                    <Text style={[styles.quickMetaChip, { color: theme.text, backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>{getProviderAliasLabel(manga.source)}</Text>
                                    {manga.statusLabel && manga.statusLabel !== 'Desconocido' && <Text style={[styles.quickMetaChip, { color: theme.text, backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>{manga.statusLabel}</Text>}
                                    <Text style={[styles.quickMetaChip, { color: theme.text, backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>{manga.contentRating || 'safe'}</Text>
                                </View>

                                <View style={styles.infoGrid}>
                                    <View style={[styles.infoPill, { backgroundColor: theme.card }]}><Text style={[styles.infoPillLabel, { color: theme.textMuted }]}>Capitulos</Text><Text style={[styles.infoPillValue, { color: theme.text }]}>{manga.totalChapters || manga.chapters.length}</Text></View>
                                    <View style={[styles.infoPill, { backgroundColor: theme.card }]}><Text style={[styles.infoPillLabel, { color: theme.textMuted }]}>Score</Text><Text style={[styles.infoPillValue, { color: theme.text }]}>{manga.score || '0.0'}</Text></View>
                                    <View style={[styles.infoPill, { backgroundColor: theme.card }]}><Text style={[styles.infoPillLabel, { color: theme.textMuted }]}>Idioma</Text><Text style={[styles.infoPillValue, { color: theme.text }]}>{(manga.language || 'es').toUpperCase()}</Text></View>
                                </View>
                            </View>
                        </View>
                    </View>

                    {!!manga.badges?.length && (
                        <View style={styles.section}>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Etiquetas</Text>
                            <View style={styles.badgesRow}>
                                {manga.badges.map((badge, idx) => (
                                    <View key={`${badge}-${idx}`} style={[styles.badge, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
                                        <Text style={styles.badgeEmoji}>✨</Text>
                                        <Text style={[styles.badgeText, { color: theme.text }]} numberOfLines={1}>{badge}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {!!manga.genres?.length && (
                        <View style={styles.section}>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Generos</Text>
                            <View style={styles.genreContainer}>
                                {manga.genres.map((g, idx) => (
                                    <View key={`${g}-${idx}`} style={[styles.genreTag, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}><Text style={[styles.genreText, { color: theme.text }]}>{g}</Text></View>
                                ))}
                            </View>
                        </View>
                    )}

                    {!!manga.description && (
                        <View style={styles.section}>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Descripcion</Text>
                            <View style={[styles.descriptionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
                                <Text style={[styles.sectionText, { color: theme.textMuted }]} numberOfLines={descriptionExpanded ? undefined : 7}>
                                    {manga.description.replace(/<[^>]*>/g, '')}
                                </Text>
                                <TouchableOpacity style={styles.expandDescriptionButton} onPress={() => setDescriptionExpanded((v) => !v)}>
                                    <Text style={[styles.expandDescriptionText, { color: theme.text }]}>{descriptionExpanded ? 'Ver menos' : 'Ver mas'}</Text>
                                    <Ionicons name={descriptionExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={[styles.actionButton, styles.commentsButton]} onPress={() => navigation.navigate('Comments' as never, { mangaTitle: manga.title })}>
                            <Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.text} />
                            <Text style={styles.actionButtonText}>Comentarios</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.actionButton} onPress={onShare}>
                            <Ionicons name="share-social-outline" size={20} color={theme.text} />
                            <Text style={styles.actionButtonText}>Compartir</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionButton, isPremium === false && styles.actionButtonLocked]}
                            onPress={toggleFavorite}
                            disabled={favoriteLoading || isPremium === false || !currentUserUid}
                        >
                            {favoriteLoading ? (
                                <ActivityIndicator size="small" color={theme.text} />
                            ) : (
                                <>
                                    <Ionicons name={isFavorite ? 'bookmark' : 'bookmark-outline'} size={20} color={theme.text} />
                                    <Text style={styles.actionButtonText}>{isFavorite ? 'Favorito' : 'Agregar Favorito'}</Text>
                                </>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: isMangaRead ? theme.success : theme.accentStrong }, isPremium === false && styles.actionButtonLocked]}
                            onPress={toggleMangaReadStatus}
                            disabled={isPremium === false || !currentUserUid}
                        >
                            <Ionicons name={isMangaRead ? 'book' : 'book-outline'} size={20} color={theme.text} />
                            <Text style={styles.actionButtonText}>{isMangaRead ? 'Leído' : 'Marcar Leído'}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.filtersRow}>
                        <TouchableOpacity style={styles.filterChip} onPress={() => {
                            const idx = availableLanguages.indexOf(selectedLanguage);
                            const next = availableLanguages[(idx + 1) % availableLanguages.length] || 'all';
                            setSelectedLanguage(next);
                        }}>
                            <Text style={styles.filterChipText}>Idioma: {selectedLanguage}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.filterChip} onPress={() => {
                            const idx = availableGroups.indexOf(selectedGroup);
                            const next = availableGroups[(idx + 1) % availableGroups.length] || 'all';
                            setSelectedGroup(next);
                        }}>
                            <Text style={styles.filterChipText}>Grupo: {selectedGroup}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.filterChip} onPress={() => setChapterOrder((p) => p === 'asc' ? 'desc' : 'asc')}>
                            <Text style={styles.filterChipText}>Orden: {chapterOrder === 'asc' ? 'Asc' : 'Desc'}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Capitulos</Text>
                        {filteredChapters.length === 0 ? (
                            <Text style={[styles.sectionText, { color: theme.textMuted }]}>No hay capitulos para los filtros seleccionados.</Text>
                        ) : (
                            filteredChapters.map((ch, idx) => renderChapterItem(ch, idx))
                        )}
                    </View>
                </ScrollView>

                {isPremium && lastReadChapterInfo?.slug && (
                    <TouchableOpacity
                        style={[styles.floatingContinueButton, { bottom: insets.bottom + 18 }]}
                        onPress={continueReading}
                        activeOpacity={0.9}
                        accessibilityLabel="Continuar lectura desde la última imagen guardada"
                    >
                        <LinearGradient colors={[theme.accent, theme.accentStrong]} style={styles.floatingContinueGradient}>
                            <Ionicons name="play" size={18} color={theme.text} />
                            <View style={styles.floatingContinueTextWrap}>
                                <Text style={styles.floatingContinueTitle}>Continuar lectura</Text>
                                <Text style={styles.floatingContinueSubtitle} numberOfLines={1}>
                                    {`Cap. ${lastReadChapterInfo.number || '?'}${lastReadChapterInfo.imagePage ? ` · Img. ${lastReadChapterInfo.imagePage}` : ''}`}
                                </Text>
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>
                )}
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: { paddingBottom: 120 },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    loadingText: { marginTop: 12, color: '#E0E0E0', fontSize: 16 },
    errorText: { color: '#FF6B6B', fontSize: 16, textAlign: 'center' },
    retryButton: {
        marginTop: 16,
        backgroundColor: '#FF5252',
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    retryButtonText: { color: '#FFF', fontWeight: '700' },
    heroCard: {
        marginHorizontal: 12,
        marginTop: 10,
        padding: 12,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: 12,
    },
    coverImage: {
        width: COVER_WIDTH,
        height: COVER_HEIGHT,
        borderRadius: 14,
        backgroundColor: '#2A2A34',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
    },
    infoCard: {
        flex: 1,
        minHeight: 0,
        padding: 2,
        justifyContent: 'flex-start',
    },
    title: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: '700',
        lineHeight: 28,
    },
    quickMetaRow: {
        marginTop: 10,
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 6,
        columnGap: 6,
    },
    quickMetaChip: {
        color: '#FFD8D8',
        backgroundColor: 'rgba(255, 82, 82, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(255, 82, 82, 0.5)',
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
        fontSize: 11,
        fontWeight: '600',
        maxWidth: '100%',
        flexShrink: 1,
    },
    infoGrid: {
        marginTop: 10,
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 8,
        columnGap: 8,
    },
    infoPill: {
        width: '47.5%',
        backgroundColor: '#262633',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 8,
    },
    infoPillLabel: {
        color: '#AFAFC2',
        fontSize: 10,
        textTransform: 'uppercase',
    },
    infoPillValue: {
        color: '#E8E8F2',
        fontSize: 12,
        marginTop: 2,
        fontWeight: '600',
    },
    descriptionPreview: {
        marginTop: 10,
        color: '#CFCFE0',
        fontSize: 13,
        lineHeight: 18,
    },
    floatingContinueButton: {
        position: 'absolute',
        right: 16,
        maxWidth: SCREEN_WIDTH - 32,
        borderRadius: 999,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 12,
        elevation: 10,
    },
    floatingContinueGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 10,
    },
    floatingContinueTextWrap: {
        flexShrink: 1,
    },
    floatingContinueTitle: {
        color: '#201600',
        fontWeight: '800',
        fontSize: 13,
    },
    floatingContinueSubtitle: {
        color: 'rgba(32,22,0,0.78)',
        fontSize: 11,
        marginTop: 1,
        fontWeight: '600',
    },
    badgesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 12,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 215, 0, 0.12)',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 215, 0, 0.3)',
        gap: 8,
        maxWidth: '45%',
    },
    badgeEmoji: {
        fontSize: 14,
        marginRight: 2,
    },
    badgeText: { color: '#FFD54F', fontSize: 12, fontWeight: '600', flex: 1 },
    section: {
        marginTop: 14,
        paddingHorizontal: 16,
    },
    sectionTitle: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    sectionText: {
        color: '#D0D0DA',
        fontSize: 14,
        lineHeight: 22,
    },
    descriptionCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
        borderRadius: 12,
        padding: 12,
    },
    expandDescriptionButton: {
        marginTop: 10,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255, 82, 82, 0.18)',
        borderWidth: 1,
        borderColor: 'rgba(255, 82, 82, 0.45)',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    expandDescriptionText: {
        color: '#FFD6D6',
        fontSize: 12,
        fontWeight: '700',
    },
    genreContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    genreTag: {
        backgroundColor: '#2B2B38',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    genreText: {
        color: '#FFF',
        fontSize: 12,
    },
    buttonRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginTop: 16,
        gap: 8,
    },
    actionButton: {
        width: '48%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FF5252',
        borderRadius: 12,
        paddingVertical: 11,
        paddingHorizontal: 10,
        gap: 6,
        minHeight: 48,
    },
    actionButtonLocked: {
        opacity: 0.45,
    },
    actionButtonText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '700',
        flexShrink: 1,
        textAlign: 'center',
    },
    commentsButton: {
        backgroundColor: '#7E57C2',
    },
    actionButtonActive: {
        backgroundColor: '#C62828',
    },
    filtersRow: {
        marginTop: 14,
        paddingHorizontal: 16,
        flexDirection: 'row',
        gap: 8,
    },
    filterChip: {
        flex: 1,
        backgroundColor: '#222230',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: '#3A3A4A',
    },
    filterChipText: {
        color: '#E0E0E0',
        fontSize: 12,
        textAlign: 'center',
    },
    chapterItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        padding: 12,
        marginBottom: 10,
    },
    chapterItemRead: {
        borderWidth: 1,
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.14)',
    },
    chapterLeftBlock: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 8,
        gap: 10,
    },
    chapterNumberPill: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#2E2E3B',
        borderWidth: 1,
        borderColor: '#48485A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    chapterNumberPillRead: {
        backgroundColor: '#2E5031',
        borderColor: '#4CAF50',
    },
    chapterNumberPillText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '700',
    },
    chapterItemContent: { flex: 1 },
    chapterTitle: { color: '#FFF', fontSize: 14, fontWeight: '600' },
    chapterMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    chapterMetaPill: {
        color: '#CFCFE2',
        backgroundColor: '#2F2F3D',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 3,
        fontSize: 11,
    },
});

export default DetailsScreen;
