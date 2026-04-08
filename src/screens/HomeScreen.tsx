import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    Dimensions,
    TouchableOpacity,
    AccessibilityInfo,
    Platform,
    RefreshControl,
    ScrollView,
    Linking,
    AppState,
    AppStateStatus,
} from 'react-native';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'; // Removed query, where as they are not needed for this subcollection fetch
import { db } from '../firebase/config';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { getAuth } from 'firebase/auth';
import { getAppVersion } from '../utils/versionUtils';
import UpdateRequiredModal from '../components/updateRequiredModal';
import FloatingChatBubble from '../components/floatingChatBubble';
import { usePersonalization } from '../contexts/PersonalizationContext';
import { getLatestManga } from '../services/backendApi';
import { Image as ExpoImage } from 'expo-image';

// Import the new utilities
import { getFlagEmoji, formatTimeAgo } from '../utils/flagUtils';
// Import the new cache utilities
import { getCachedData, setCacheData } from '../utils/cacheUtils';
import { getProviderAliasLabel, normalizeProviderSource } from '../utils/providerBranding';
import { filterNotificationsForHome, normalizeNotification } from '../utils/notificationUtils';

// Constants
const windowWidth = Dimensions.get('window').width;
const itemWidth = windowWidth * 0.32;
const itemHeight = itemWidth * 1.5;
const CAROUSEL_ITEM_SPACING = 15;
const CAROUSEL_SNAP_INTERVAL = itemWidth + CAROUSEL_ITEM_SPACING;
const adUnitId = __DEV__ ? TestIds.BANNER : 'ca-app-pub-6584977537844104/1888694522';
const APP_IDS = {
    ios: '5cd6ecff-6004-4696-b780-172ff5ca8a22',
    android: 'com.yourusername.kamireader' // Asegúrate de cambiar esto por el ID de tu paquete Android
};
const DONATION_URL = process.env.EXPO_PUBLIC_DONATION_URL || 'https://ko-fi.com/sukisoft';
const HOME_LATEST_AUTO_REFRESH_MS = 45 * 1000;

const getStatusLabel = (value?: string, fallbackLabel?: string) => {
    const raw = String(value || '').toLowerCase();
    if (fallbackLabel) return fallbackLabel;
    if (raw.includes('ongoing') || raw.includes('curso')) return 'En curso';
    if (raw.includes('completed') || raw.includes('finaliz') || raw.includes('complet')) return 'Finalizado';
    if (raw.includes('hiatus') || raw.includes('pausa')) return 'En pausa';
    if (raw.includes('cancel')) return 'Cancelado';
    return 'Desconocido';
};

const getStatusBadgeStyles = (value?: string) => {
    const raw = String(value || '').toLowerCase();
    if (raw.includes('completed') || raw.includes('finaliz') || raw.includes('complet')) {
        return { backgroundColor: 'rgba(76, 217, 100, 0.85)', textColor: '#F4FFF6' };
    }
    if (raw.includes('hiatus') || raw.includes('pausa')) {
        return { backgroundColor: 'rgba(255, 179, 71, 0.9)', textColor: '#1A1200' };
    }
    if (raw.includes('cancel')) {
        return { backgroundColor: 'rgba(229, 57, 53, 0.9)', textColor: '#FFECEC' };
    }
    return { backgroundColor: 'rgba(158, 158, 158, 0.82)', textColor: '#F2F2F2' };
};

const getStatusBadgeLabel = (item: LatestManga) => {
    const label = getStatusLabel(item.status, item.statusLabel);
    if (label !== 'Desconocido') return label;
    if (Number(item.totalChapters || 0) > 0) return `Cap. ${item.totalChapters}`;
    if (String(item.contentRating || '').toLowerCase() === 'erotica') return '18+';
    return 'Actualizado';
};

// Types
type LatestManga = {
    slug: string;
    title: string;
    cover: string;
    source: string;
    score: string;
    totalChapters: number;
    status?: string;
    statusLabel?: string;
    contentRating?: string;
    language?: string;
};

type Chapter = {
    hid: string;
    title: string;
    cover: string;
    slug: string;
    source?: string;
    content_rating: string;
    lang: string;
    updated_at: any;
    lastReadChapter?: string;
    lastReadChapterHid?: string;
    lastReadImagePage?: number;
};

type NewsItem = {
    id: string;
    title: string;
    message: string;
    date?: any;
    createdAt?: any;
    isNew?: boolean;
};

const HomeScreen = ({ navigation }: any) => {
    const { theme } = usePersonalization();
    // State
    const [topSafe, setTopSafe] = useState<Chapter[]>([]);
    const [topErotic, setTopErotic] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [plan, setPlan] = useState<'free' | 'premium'>('free');
    const [email, setEmail] = useState('');
    const [updateModalVisible, setUpdateModalVisible] = useState(false);
    const [minVersion, setMinVersion] = useState('');
    const [currentVersion, setCurrentVersion] = useState('');
    const [comicsLoading, setComicsLoading] = useState(true);
    const [continueReadingComics, setContinueReadingComics] = useState<Chapter[]>([]); // New state for continue reading
    const [latestMangas, setLatestMangas] = useState<LatestManga[]>([]);
    const [latestLoading, setLatestLoading] = useState(true);
    const [homeNotice, setHomeNotice] = useState('');

    // Refs and hooks
    const headerRef = useRef<View>(null);
    const isMounted = useRef(true);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const latestAutoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Version check
    const checkAppVersion = useCallback(async () => {
        try {
            const appVersion = getAppVersion();
            setCurrentVersion(appVersion);

            const paramsDoc = await getDoc(doc(db, "parameters", "appSettings"));
            if (paramsDoc.exists()) {
                const requiredVersion = paramsDoc.data().minAppVersion;
                setMinVersion(requiredVersion);

                if (isVersionOutdated(appVersion, requiredVersion)) {
                    setUpdateModalVisible(true);
                }
            }
        } catch (error) {
        }
    }, []);

    const isVersionOutdated = (current: string, required: string): boolean => {
        const currentParts = current.split('.').map(Number);
        const requiredParts = required.split('.').map(Number);

        for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
            const currentPart = currentParts[i] || 0;
            const requiredPart = requiredParts[i] || 0;

            if (currentPart < requiredPart) return true;
            if (currentPart > requiredPart) return false;
        }

        return false;
    };

    // Data fetching
    const fetchTopComics = useCallback(async (options?: { forceRefresh?: boolean }) => {
        setComicsLoading(true);
        try {
            const forceRefresh = options?.forceRefresh === true;
            const cachedComics = forceRefresh ? null : await getCachedData('topComics');
            if (cachedComics) {
                if (isMounted.current) {
                    setTopSafe(cachedComics.safe);
                    setTopErotic(cachedComics.erotic);
                    setComicsLoading(false);
                }
                return;
            }

            const topMixedRes = await getLatestManga({
                page: 1,
                limit: 60,
                sort: 'score_desc',
            }, {
                ttlMs: 2 * 60 * 1000,
                forceRefresh,
            });

            if (isMounted.current) {
                const mapBackendComic = (item: any) => ({
                    hid: `${item.source || 'zonatmo'}:${item.slug || ''}`,
                    title: item.title || 'Sin título',
                    source: normalizeProviderSource(item.source),
                    lang: item.language || 'es-419',
                    updated_at: item.updatedAt || new Date().toISOString(),
                    cover: item.cover || 'https://via.placeholder.com/150x200?text=No+Cover',
                    slug: item.slug || '',
                    content_rating: item.contentRating || 'safe',
                });

                const mixedComics = (topMixedRes?.results || []).map(mapBackendComic);
                const eroticRaw = mixedComics.filter((comic: any) => comic.content_rating === 'erotica');

                // Top seguros = no erotico (+18)
                const safeComics = mixedComics
                    .filter((comic: any) => comic.content_rating !== 'erotica')
                    .slice(0, 10);

                const eroticComics = eroticRaw.slice(0, 10);

                setTopSafe(safeComics);
                setTopErotic(eroticComics);

                await setCacheData('topComics', { safe: safeComics, erotic: eroticComics });
            }
        } catch (error) {
            if (isMounted.current) {
                setHomeNotice('No pudimos actualizar Top ahora. Revisa tu conexion y vuelve a intentar.');
            }
        } finally {
            if (isMounted.current) {
                setComicsLoading(false);
            }
        }
    }, []);

    const fetchUserPlan = useCallback(async () => {
        try {
            const auth = getAuth();
            const user = auth.currentUser;
            if (user) {
                const docRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists() && isMounted.current) {
                    setEmail(docSnap.data().email);
                    setPlan(docSnap.data().accountType || 'free');
                }
            }
        } catch (error) {
            if (isMounted.current) {
                setHomeNotice('No pudimos cargar noticias nuevas en este momento.');
            }
        }
    }, []);

    const fetchNews = useCallback(async () => {
        try {
            const cachedNews = await getCachedData('appNews');
            if (cachedNews) {
                if (isMounted.current) {
                    setNews(filterNotificationsForHome((cachedNews as NewsItem[]).map((item) => normalizeNotification(item))));
                }
                return;
            }

            const snapshot = await getDocs(collection(db, 'notifications'));
            if (isMounted.current) {
                const normalizedNews = snapshot.docs.map(doc => normalizeNotification({
                    ...doc.data(),
                    id: doc.id,
                } as NewsItem));
                const fetchedNews = filterNotificationsForHome(normalizedNews);
                setNews(fetchedNews);
                await setCacheData('appNews', normalizedNews);
            }
        } catch (error) {
        }
    }, []);

    const fetchContinueReadingComics = useCallback(async () => {
        try {
            const auth = getAuth();
            const user = auth.currentUser;
            if (!user) {
                setContinueReadingComics([]);
                return;
            }

            // --- CORRECT WAY: Target the subcollection directly ---
            const userInProgressRef = collection(db, 'users', user.uid, 'inProgressManga');

            const querySnapshot = await getDocs(userInProgressRef);

            const readingProgressData: {
                slug: string;
                title: string;
                source: string;
                lastReadChapterHid?: string;
                lastReadChapterNumber: number;
                lastReadImagePage?: number;
                coverUrl: string;
            }[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data() as {
                    lastReadChapterHid?: string;
                    lastReadChapterNumber?: number;
                    lastReadImagePage?: number;
                    coverUrl?: string;
                    slug?: string;
                    mangaTitle?: string;
                    comicTitle?: string;
                    source?: string;
                };

                const comicSlug = String(data.slug || doc.id || '').trim();
                if (comicSlug) {
                    readingProgressData.push({
                        slug: comicSlug,
                        title: String(data.mangaTitle || data.comicTitle || comicSlug)
                            .replace(/-/g, ' ')
                            .replace(/\b\w/g, (s) => s.toUpperCase()),
                        source: normalizeProviderSource(data.source),
                        lastReadChapterHid: String(data.lastReadChapterHid || '').trim() || undefined,
                        lastReadChapterNumber: data.lastReadChapterNumber || 0,
                        lastReadImagePage: Number.isFinite(Number(data.lastReadImagePage)) ? Number(data.lastReadImagePage) : undefined,
                        coverUrl: data.coverUrl || ''
                    });
                } else {
                }
            });

            if (readingProgressData.length === 0) {
                setContinueReadingComics([]);
                return;
            }

            const comicsToDisplay: Chapter[] = readingProgressData.map((progressItem) => ({
                hid: `${progressItem.source}:${progressItem.slug}`,
                title: progressItem.title || 'Manga',
                cover: progressItem.coverUrl || 'https://via.placeholder.com/150x200?text=No+Cover',
                slug: progressItem.slug,
                source: normalizeProviderSource(progressItem.source),
                content_rating: 'safe',
                lang: 'es-419',
                updated_at: new Date().toISOString(),
                lastReadChapterHid: progressItem.lastReadChapterHid,
                lastReadImagePage: progressItem.lastReadImagePage,
                lastReadChapter: `Cap. ${progressItem.lastReadChapterNumber}${progressItem.lastReadImagePage ? ` · Img. ${progressItem.lastReadImagePage}` : ''}`,
            }));
            if (isMounted.current) {
                setContinueReadingComics(comicsToDisplay);
            }
        } catch (error) {
            if (isMounted.current) {
                setContinueReadingComics([]);
            }
        }
    }, []);

    const fetchLatestMangas = useCallback(async (options?: { forceRefresh?: boolean; silent?: boolean }) => {
        const silent = options?.silent === true;
        if (!silent) setLatestLoading(true);
        try {
            const res = await getLatestManga({ page: 1, limit: 10 }, {
                ttlMs: 60 * 1000,
                forceRefresh: options?.forceRefresh === true,
            });
            
            if (isMounted.current && Array.isArray(res?.results)) {
                setLatestMangas(res.results.slice(0, 10));
            }
        } catch (error) {
            if (isMounted.current) {
                setHomeNotice('La seccion de recientes esta temporalmente no disponible.');
            }
        } finally {
            if (isMounted.current && !silent) setLatestLoading(false);
        }
    }, []);

    const refreshLatestInBackground = useCallback(() => {
        if (!isMounted.current) return;
        fetchLatestMangas({ forceRefresh: true, silent: true });
    }, [fetchLatestMangas]);

    // Función para cargar los datos iniciales (noticias, plan, cómics)
    const loadInitialData = useCallback(async () => {
        setLoading(true);
        await Promise.all([
            fetchNews(),
            fetchUserPlan(),
            fetchContinueReadingComics(),
            fetchLatestMangas(),
        ]);
        await fetchTopComics();

        if (isMounted.current) {
            setLoading(false);
        }
    }, [fetchNews, fetchUserPlan, fetchTopComics, fetchContinueReadingComics, fetchLatestMangas]);


    // Effects
    useEffect(() => {
        checkAppVersion();
        loadInitialData();

        return () => {
            isMounted.current = false;
        };
    }, [checkAppVersion, loadInitialData]);

    useEffect(() => {
        const startPolling = () => {
            if (latestAutoRefreshIntervalRef.current) return;
            latestAutoRefreshIntervalRef.current = setInterval(() => {
                if (appStateRef.current !== 'active') return;
                refreshLatestInBackground();
            }, HOME_LATEST_AUTO_REFRESH_MS);
        };

        const stopPolling = () => {
            if (!latestAutoRefreshIntervalRef.current) return;
            clearInterval(latestAutoRefreshIntervalRef.current);
            latestAutoRefreshIntervalRef.current = null;
        };

        const subscription = AppState.addEventListener('change', (nextState) => {
            const prevState = appStateRef.current;
            appStateRef.current = nextState;

            if (nextState === 'active') {
                startPolling();
                if (prevState !== 'active') {
                    refreshLatestInBackground();
                }
                return;
            }

            if (nextState.match(/inactive|background/)) {
                stopPolling();
            }
        });

        if (appStateRef.current === 'active') {
            startPolling();
        }

        return () => {
            subscription.remove();
            stopPolling();
        };
    }, [refreshLatestInBackground]);

    useEffect(() => {
        if (!loading && isMounted.current) {
            const announceContentLoaded = () => {
                AccessibilityInfo.isScreenReaderEnabled().then((isEnabled) => {
                    if (isEnabled) {
                        AccessibilityInfo.announceForAccessibility("Contenido principal cargado.");
                        if (Platform.OS === 'android' && headerRef.current) {
                            headerRef.current.setNativeProps({
                                accessible: true,
                                importantForAccessibility: 'yes',
                                accessibilityLabel: "Inicio, contenido principal",
                            });
                        }
                    }
                });
            };

            const timeoutId = setTimeout(announceContentLoaded, 500);
            return () => clearTimeout(timeoutId);
        }
    }, [loading]);

    // Handlers
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        setHomeNotice('');
        await Promise.all([
            fetchTopComics({ forceRefresh: true }),
            fetchNews(),
            fetchUserPlan(),
            fetchContinueReadingComics(),
            fetchLatestMangas({ forceRefresh: true }),
        ]);
        if (isMounted.current) {
            setRefreshing(false);
            AccessibilityInfo.isScreenReaderEnabled().then((isEnabled) => {
                if (isEnabled) {
                    AccessibilityInfo.announceForAccessibility("Contenido actualizado.");
                }
            });
        }
    }, [fetchTopComics, fetchNews, fetchUserPlan, fetchContinueReadingComics, fetchLatestMangas]);

    const handleComicPress = useCallback((item: Chapter) => {
        if (item.lastReadChapterHid) {
            navigation.navigate('Reader', { hid: item.lastReadChapterHid, resumeFromProgress: true });
            return;
        }
        navigation.navigate('Details', { slug: item.slug });
    }, [navigation]);

    const handleNewsPress = useCallback((newsItem: NewsItem) => {
        navigation.navigate('NewsDetail', { newsItem });
    }, [navigation]);

    const handleOpenDonation = useCallback(async () => {
        try {
            const supported = await Linking.canOpenURL(DONATION_URL);
            if (supported) {
                await Linking.openURL(DONATION_URL);
                return;
            }
            navigation.navigate('Payment');
        } catch {
            navigation.navigate('Payment');
        }
    }, [navigation]);


    // getItemLayout for FlatList optimization
    const getItemLayout = useCallback((data: any, index: any) => (
        { length: itemHeight + 15, offset: (itemHeight + 15) * index, index }
    ), []);

    // Render functions
    const renderNewsItem = useCallback(({ item }: { item: NewsItem }) => (
        <TouchableOpacity
            style={styles.newsItem}
            onPress={() => handleNewsPress(item)}
            activeOpacity={0.7}
            accessibilityLabel={`Abrir noticia: ${item.title}`}
        >
            <Text style={styles.newsTitle}>{item.title}</Text>
            <Text style={styles.newsContent} numberOfLines={3}>
                {item.message.replace(/<[^>]*>/g, '')}
            </Text>
        </TouchableOpacity>
    ), [handleNewsPress]);

    const renderComicItem = useCallback(({ item }: { item: Chapter }) => (
        <TouchableOpacity
            style={styles.comicItem}
            onPress={() => handleComicPress(item)}
            activeOpacity={0.7}
            accessibilityLabel={item.lastReadChapterHid ? `Continuar leyendo ${item.title}` : `Ver detalles de ${item.title}`}
        >
            <ExpoImage
                source={{ uri: item.cover }}
                style={styles.cover}
                contentFit="cover"
                placeholder={require('../../assets/auth-bg.png')}
                cachePolicy="memory-disk"
                transition={120}
            />
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                style={styles.comicGradient}
            />
            <Text style={styles.comicTitle} numberOfLines={2}>{item.title}</Text>

            <View style={styles.providerBadge}>
                <Text style={styles.providerBadgeText}>
                    {getProviderAliasLabel(item.source || item.hid?.split(':')?.[0])}
                </Text>
            </View>

            {/* Erotic Badge */}
            {item.content_rating === 'erotica' && (
                <View style={styles.eroticBadge}>
                    <MaterialCommunityIcons name="fire" size={14} color="white" />
                </View>
            )}

            {/* Language Badge */}
            {/* Language Badge */}
            {item.lang && (
                <View style={styles.languageBadge}>
                    <Text style={styles.languageText}>
                        {item.lang === 'es-419' ? '🇲🇽' : getFlagEmoji(item.lang)}
                    </Text>
                </View>
            )}

            {/* Updated At / Last Read Chapter Badge */}
            {item.lastReadChapter && ( // Show last read chapter if it's a "continue reading" item
                <View style={styles.lastReadChapterBadge}>
                    <Text style={styles.lastReadChapterText}>{item.lastReadChapter}</Text>
                </View>
            )}
        </TouchableOpacity>
    ), [handleComicPress]);

    const renderLatestItem = useCallback(({ item }: { item: LatestManga }) => (
        <TouchableOpacity
            style={styles.comicItem}
            onPress={() => navigation.navigate('Details', { slug: item.slug })}
            activeOpacity={0.7}
            accessibilityLabel={`Ver detalles de ${item.title}`}
        >
            <ExpoImage
                source={{ uri: item.cover }}
                style={styles.cover}
                contentFit="cover"
                placeholder={require('../../assets/auth-bg.png')}
                cachePolicy="memory-disk"
                transition={120}
            />
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                style={styles.comicGradient}
            />
            <Text style={styles.comicTitle} numberOfLines={2}>{item.title}</Text>
            <View style={styles.latestTopBadgesRow}>
                <View style={styles.latestProviderBadge}>
                    <Text style={styles.providerBadgeText} numberOfLines={1}>
                        {getProviderAliasLabel(item.source)}
                    </Text>
                </View>
                <View style={[
                    styles.latestStatusTag,
                    { backgroundColor: getStatusBadgeStyles(item.status).backgroundColor },
                ]}>
                    <Text
                        style={[
                            styles.statusTagText,
                            { color: getStatusBadgeStyles(item.status).textColor },
                        ]}
                        numberOfLines={1}
                    >
                        {getStatusBadgeLabel(item)}
                    </Text>
                </View>
            </View>
            {item.score && item.score !== '0.0' && (
                <View style={styles.scoreBadge}>
                    <MaterialCommunityIcons name="star" size={10} color={theme.warning} />
                    <Text style={styles.scoreText}>{item.score}</Text>
                </View>
            )}
        </TouchableOpacity>
    ), [navigation, theme.warning]);

    const renderSectionHeader = useCallback((icon: string, title: string, color: string, subtitle?: string) => (
        <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name={icon as any} size={24} color={color} />
            <View style={styles.sectionHeaderTextWrap}>
                <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
                {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
            </View>
        </View>
    ), []);

    if (loading) {
        return (
            <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text style={styles.loadingText}>Cargando contenido...</Text>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.container}>
            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
                <ScrollView
                    contentContainerStyle={styles.scrollViewContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={theme.accent}
                            title="Actualizando contenido..."
                            titleColor={theme.text}
                        />
                    }
                >
                    {/* Header */}
                    <View style={styles.headerContainer} ref={headerRef}>
                        <View style={styles.headerContent}>
                            <Text style={styles.header}>Bienvenido</Text>
                        </View>
                    </View>

                    <LinearGradient colors={[theme.accentSoft, 'rgba(107,138,253,0.18)']} style={styles.heroCard}>
                        <View style={styles.heroIconWrap}>
                            <MaterialCommunityIcons name="compass-rose" size={24} color={theme.accent} />
                        </View>
                        <View style={styles.heroTextWrap}>
                            <Text style={styles.heroTitle}>Explora nuevos mangas</Text>
                            <Text style={styles.heroSubtitle}>Top por rating, recientes y tus lecturas en progreso en un solo lugar.</Text>
                        </View>
                    </LinearGradient>

                    {!!homeNotice && (
                        <View style={[styles.noticeCard, { borderColor: theme.warning, backgroundColor: `${theme.warning}22` }]}>
                            <MaterialCommunityIcons name="wifi-alert" size={18} color={theme.warning} />
                            <Text style={styles.noticeText}>{homeNotice}</Text>
                        </View>
                    )}

                    <TouchableOpacity style={styles.donationCard} onPress={handleOpenDonation} activeOpacity={0.85}>
                        <LinearGradient colors={['#F59E0B33', '#FB718533']} style={StyleSheet.absoluteFill} />
                        <View style={styles.donationTopRow}>
                            <MaterialCommunityIcons name="gift-outline" size={22} color={theme.warning} />
                            <Text style={styles.donationTitle}>Donaciones</Text>
                        </View>
                        <Text style={styles.donationText}>
                            Ayudanos a sostener el backend y mantener actualizaciones en tiempo real.
                        </Text>
                        <View style={styles.donationButton}>
                            <Text style={styles.donationButtonText}>Apoyar proyecto</Text>
                        </View>
                    </TouchableOpacity>

                    {/* News Section */}
                    {news.length > 0 && (
                        <View style={styles.sectionContainer}>
                            <View style={styles.newsHeaderRow}>
                                <View style={styles.newsHeaderLeft}>
                                        <MaterialCommunityIcons name="newspaper" size={24} color={theme.accent} />
                                    <View style={styles.newsHeaderTextWrap}>
                                            <Text style={[styles.sectionTitle, { color: theme.accent }]}>Noticias</Text>
                                        <Text style={styles.sectionSubtitle}>Actualizaciones del equipo</Text>
                                    </View>
                                </View>
                                <TouchableOpacity style={styles.viewAllButton} onPress={() => navigation.navigate('News')}>
                                    <Text style={styles.viewAllText}>Ver todas</Text>
                                </TouchableOpacity>
                            </View>
                            <FlatList
                                data={news}
                                keyExtractor={(item) => item.id}
                                renderItem={renderNewsItem}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.newsList}
                                initialNumToRender={2}
                                maxToRenderPerBatch={3}
                                windowSize={5}
                            />
                        </View>
                    )}

                    {/* Latest Mangas Section */}
                    <View style={styles.sectionContainer}>
                        {renderSectionHeader('clock-outline', 'Recientes', theme.warning, 'Ultimas publicaciones')}
                        {latestLoading ? (
                            <ActivityIndicator size="small" color={theme.warning} style={styles.sectionLoadingIndicator} />
                        ) : (
                            <FlatList
                                data={latestMangas}
                                keyExtractor={(item) => `${item.source || 'zonatmo'}:${item.slug}`}
                                renderItem={renderLatestItem}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.comicsList}
                                initialNumToRender={3}
                                maxToRenderPerBatch={5}
                                windowSize={7}
                                getItemLayout={getItemLayout}
                                removeClippedSubviews={Platform.OS === 'android'}
                                nestedScrollEnabled
                                decelerationRate="fast"
                                snapToInterval={CAROUSEL_SNAP_INTERVAL}
                                snapToAlignment="start"
                                disableIntervalMomentum
                            />
                        )}
                    </View>

                    {/* Continue Reading Section */}
                    {continueReadingComics.length > 0 && (
                        <View style={styles.sectionContainer}>
                            {renderSectionHeader('book-open-outline', 'En Curso', theme.success, 'Retoma donde te quedaste')}
                            {comicsLoading ? ( // You might want a separate loading state for this or reuse comicsLoading
                                <ActivityIndicator size="small" color={theme.success} style={styles.sectionLoadingIndicator} />
                            ) : (
                                <FlatList
                                    data={continueReadingComics}
                                    keyExtractor={(item) => item.hid}
                                    renderItem={renderComicItem}
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.comicsList}
                                    initialNumToRender={3}
                                    maxToRenderPerBatch={5}
                                    windowSize={7}
                                    getItemLayout={getItemLayout}
                                    removeClippedSubviews={Platform.OS === 'android'}
                                    nestedScrollEnabled
                                    decelerationRate="fast"
                                    snapToInterval={CAROUSEL_SNAP_INTERVAL}
                                    snapToAlignment="start"
                                    disableIntervalMomentum
                                />
                            )}
                        </View>
                    )}

                    {/* Top Safe Comics */}
                    <View style={styles.sectionContainer}>
                        {renderSectionHeader('shield-check', 'Top Seguros', theme.accentStrong, 'Mangas -18 (sin contenido erotico)')}
                        {comicsLoading ? (
                            <ActivityIndicator size="small" color={theme.accentStrong} style={styles.sectionLoadingIndicator} />
                        ) : (
                            <FlatList
                                data={topSafe}
                                keyExtractor={(item) => item.hid}
                                renderItem={renderComicItem}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.comicsList}
                                initialNumToRender={3}
                                maxToRenderPerBatch={5}
                                windowSize={7}
                                getItemLayout={getItemLayout}
                                removeClippedSubviews={Platform.OS === 'android'}
                                nestedScrollEnabled
                                decelerationRate="fast"
                                snapToInterval={CAROUSEL_SNAP_INTERVAL}
                                snapToAlignment="start"
                                disableIntervalMomentum
                            />
                        )}
                    </View>

                    {/* Top Erotic Comics */}
                    {topErotic.length > 0 && (
                        <View style={styles.sectionContainer}>
                            {renderSectionHeader('fire', 'Top Eroticos', theme.accent, 'Mangas +18')}
                            {comicsLoading ? (
                                <ActivityIndicator size="small" color={theme.accent} style={styles.sectionLoadingIndicator} />
                            ) : (
                                <FlatList
                                    data={topErotic}
                                    keyExtractor={(item) => item.hid}
                                    renderItem={renderComicItem}
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.comicsList}
                                    initialNumToRender={3}
                                    maxToRenderPerBatch={5}
                                    windowSize={7}
                                    getItemLayout={getItemLayout}
                                    removeClippedSubviews={Platform.OS === 'android'}
                                    nestedScrollEnabled
                                    decelerationRate="fast"
                                    snapToInterval={CAROUSEL_SNAP_INTERVAL}
                                    snapToAlignment="start"
                                    disableIntervalMomentum
                                />
                            )}
                        </View>
                    )}

                    {/* Ad Banner */}
                    {plan === 'free' && (
                        <View style={styles.adBannerContainer}>
                            <BannerAd
                                unitId={adUnitId}
                                size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                                onAdLoaded={() => {
                                    AccessibilityInfo.isScreenReaderEnabled().then((isEnabled) => {
                                        if (isEnabled) AccessibilityInfo.announceForAccessibility("Anuncio cargado.");
                                    });
                                }}
                            />
                        </View>
                    )}
                </ScrollView>
                {/* <FloatingChatBubble
                    clientId={email}
                /> */}
                {/* Update Required Modal */}
                <UpdateRequiredModal
                    visible={updateModalVisible}
                    currentVersion={currentVersion}
                    minVersion={minVersion}
                    iosAppId={APP_IDS.ios}
                    androidPackageName={APP_IDS.android}
                />
            </SafeAreaView>
        </LinearGradient>
    );
};

// Styles (unchanged)
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F0F1A',
    },
    safeArea: {
        flex: 1,
    },
    scrollViewContent: {
        paddingBottom: 20,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 15,
        fontSize: 16,
        color: '#FF6B6B',
        fontFamily: 'Roboto-Medium',
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 15,
        paddingBottom: 10,
    },
    headerContent: {
        flex: 1,
    },
    header: {
        fontSize: 28,
        fontWeight: 'bold',
        color: 'white',
        fontFamily: 'Roboto-Bold',
    },
    sectionContainer: {
        marginBottom: 14,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 10,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingRight: 20,
    },
    newsHeaderRow: {
        paddingHorizontal: 20,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    newsHeaderLeft: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
    },
    newsHeaderTextWrap: {
        marginLeft: 10,
        flex: 1,
        minWidth: 0,
    },
    sectionHeaderTextWrap: {
        marginLeft: 10,
        flex: 1,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        fontFamily: 'Roboto-Bold',
    },
    sectionSubtitle: {
        marginTop: 2,
        color: '#B9B9CF',
        fontSize: 12,
        fontFamily: 'Roboto-Regular',
    },
    viewAllButton: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        flexShrink: 0,
    },
    viewAllText: {
        color: '#FFE0E0',
        fontSize: 12,
        fontFamily: 'Roboto-Medium',
    },
    heroCard: {
        marginHorizontal: 20,
        marginBottom: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    heroIconWrap: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroTextWrap: {
        flex: 1,
    },
    heroTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: 'Roboto-Bold',
    },
    heroSubtitle: {
        color: '#D3D3E6',
        fontSize: 12,
        fontFamily: 'Roboto-Regular',
        marginTop: 4,
        lineHeight: 18,
    },
    noticeCard: {
        marginHorizontal: 20,
        marginBottom: 16,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    noticeText: {
        flex: 1,
        color: '#FFEFD9',
        fontSize: 12,
        lineHeight: 17,
        fontFamily: 'Roboto-Medium',
    },
    donationCard: {
        marginHorizontal: 20,
        marginBottom: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        padding: 14,
        overflow: 'hidden',
    },
    donationTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    donationTitle: {
        color: '#FFF7E6',
        fontSize: 16,
        fontFamily: 'Roboto-Bold',
    },
    donationText: {
        marginTop: 8,
        color: '#FFE7C2',
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'Roboto-Regular',
    },
    donationButton: {
        marginTop: 10,
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    donationButtonText: {
        color: '#FFF3DD',
        fontSize: 12,
        fontFamily: 'Roboto-Medium',
    },
    sectionLoadingIndicator: {
        marginTop: 10,
        marginBottom: 10,
        height: itemHeight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    newsList: {
        paddingHorizontal: 20,
    },
    newsItem: {
        width: windowWidth * 0.85,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 18,
        marginRight: 15,
        borderLeftWidth: 4,
        borderLeftColor: '#FF6B6B',
    },
    newsTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: 'white',
        fontFamily: 'Roboto-Bold',
        marginBottom: 8,
    },
    newsContent: {
        fontSize: 15,
        color: '#E0E0E0',
        fontFamily: 'Roboto-Regular',
        lineHeight: 22,
    },
    comicsList: {
        paddingHorizontal: 20,
    },
    comicItem: {
        width: itemWidth,
        marginRight: CAROUSEL_ITEM_SPACING,
        borderRadius: 14,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#2A2A3B',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    cover: {
        width: '100%',
        height: itemHeight,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    comicGradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '40%',
    },
    comicTitle: {
        position: 'absolute',
        bottom: 10,
        left: 10,
        right: 10,
        fontSize: 14,
        color: 'white',
        fontFamily: 'Roboto-Medium',
        textShadowColor: 'rgba(0, 0, 0, 0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    eroticBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(255, 107, 107, 0.9)',
        borderRadius: 10,
        padding: 4,
        zIndex: 1,
    },
    languageBadge: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 3,
        zIndex: 1,
    },
    languageText: {
        fontSize: 14,
        color: 'white',
    },
    updatedAtBadge: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 3,
        zIndex: 1,
    },
    updatedAtText: {
        fontSize: 10,
        color: '#E0E0E0',
        fontFamily: 'Roboto-Regular',
    },
    lastReadChapterBadge: { // New style for "last read chapter" badge
        position: 'absolute',
        bottom: 8,
        left: 8,
        backgroundColor: 'rgba(76, 175, 80, 0.9)', // Green color for "continue reading"
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 3,
        zIndex: 1,
    },
    lastReadChapterText: { // Text style for the new badge
        fontSize: 10,
        color: 'white',
        fontFamily: 'Roboto-Medium',
    },
    scoreBadge: {
        position: 'absolute',
        top: 32,
        right: 8,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.65)',
        borderRadius: 10,
        paddingHorizontal: 5,
        paddingVertical: 3,
        zIndex: 1,
    },
    scoreText: {
        fontSize: 10,
        color: '#FFD700',
        fontFamily: 'Roboto-Medium',
        marginLeft: 2,
    },
    statusTag: {
        position: 'absolute',
        top: 8,
        right: 8,
        borderRadius: 8,
        paddingHorizontal: 6,
        paddingVertical: 3,
        zIndex: 1,
    },
    statusTagText: {
        fontSize: 9,
        fontFamily: 'Roboto-Bold',
        textTransform: 'uppercase',
    },
    providerBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: 'rgba(10, 10, 16, 0.82)',
        borderColor: 'rgba(255,255,255,0.24)',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 3,
        maxWidth: '64%',
    },
    providerBadgeText: {
        color: '#F4F6FF',
        fontSize: 10,
        fontWeight: '700',
    },
    latestTopBadgesRow: {
        position: 'absolute',
        top: 8,
        left: 8,
        right: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        columnGap: 6,
        zIndex: 2,
    },
    latestProviderBadge: {
        backgroundColor: 'rgba(10, 10, 16, 0.82)',
        borderColor: 'rgba(255,255,255,0.24)',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 3,
        maxWidth: '52%',
    },
    latestStatusTag: {
        borderRadius: 8,
        paddingHorizontal: 6,
        paddingVertical: 3,
        maxWidth: '46%',
    },
    adBannerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingVertical: 10,
    },
});

export default React.memo(HomeScreen);