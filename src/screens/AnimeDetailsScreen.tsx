import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Image, Linking, Share, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePersonalization } from '../contexts/PersonalizationContext';
import { useAlertContext } from '../contexts/AlertContext';
import { getAnimeDetails, getAnimeEpisodes } from '../services/backendApi';
import { auth, db } from '../firebase/config';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

const AnimeDetailsScreen: React.FC = () => {
    const { theme } = usePersonalization();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { alertError } = useAlertContext();
    const slug = String(route.params?.slug || '').trim();

    const [anime, setAnime] = useState<any | null>(null);
    const [episodes, setEpisodes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFavorite, setIsFavorite] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const [watchedEpisodeIds, setWatchedEpisodeIds] = useState<Set<string>>(new Set());
    const currentUserUid = String(auth.currentUser?.uid || '').trim();

    const loadAnime = useCallback(async () => {
        if (!slug) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [detailsRes, episodesRes] = await Promise.all([
                getAnimeDetails(slug),
                getAnimeEpisodes(slug),
            ]);
            setAnime(detailsRes?.anime || null);
            setEpisodes(Array.isArray(episodesRes?.episodes) ? episodesRes.episodes : []);
        } catch (error: any) {
            alertError(error?.message || 'No se pudo cargar el anime.');
        } finally {
            setLoading(false);
        }
    }, [alertError, slug]);

    useEffect(() => {
        loadAnime();
    }, [loadAnime]);

    useEffect(() => {
        let mounted = true;

        const loadUserAnimeState = async () => {
            if (!currentUserUid || !slug) {
                if (mounted) {
                    setIsFavorite(false);
                    setWatchedEpisodeIds(new Set());
                }
                return;
            }

            try {
                const favoriteRef = doc(db, 'users', currentUserUid, 'animeFavorites', slug);
                const favoriteSnap = await getDoc(favoriteRef);

                const watchedRef = collection(db, 'users', currentUserUid, 'watchedAnime');
                const watchedQuery = query(watchedRef, where('animeSlug', '==', slug));
                const watchedSnap = await getDocs(watchedQuery);
                const watched = new Set<string>();
                watchedSnap.forEach((d) => {
                    const data = d.data() || {};
                    const episodeId = String(data?.episodeSlug || '').trim();
                    if (episodeId) watched.add(episodeId);
                });

                if (mounted) {
                    setIsFavorite(favoriteSnap.exists());
                    setWatchedEpisodeIds(watched);
                }
            } catch (_) {
                if (mounted) {
                    setIsFavorite(false);
                    setWatchedEpisodeIds(new Set());
                }
            }
        };

        loadUserAnimeState();
        return () => {
            mounted = false;
        };
    }, [currentUserUid, slug]);

    const toggleFavorite = useCallback(async () => {
        if (!currentUserUid || !slug || !anime) {
            alertError('Inicia sesion para administrar favoritos de anime.');
            return;
        }

        setFavoriteLoading(true);
        try {
            const favoriteRef = doc(db, 'users', currentUserUid, 'animeFavorites', slug);
            if (isFavorite) {
                await deleteDoc(favoriteRef);
                setIsFavorite(false);
            } else {
                await setDoc(favoriteRef, {
                    animeSlug: slug,
                    animeTitle: String(anime?.title || '').trim() || slug,
                    coverUrl: String(anime?.cover || '').trim(),
                    source: String(anime?.source || '').trim(),
                    favoritedAt: serverTimestamp(),
                });
                setIsFavorite(true);
            }
        } catch (error: any) {
            alertError(error?.message || 'No se pudo actualizar favoritos de anime.');
        } finally {
            setFavoriteLoading(false);
        }
    }, [alertError, anime, currentUserUid, isFavorite, slug]);

    const onShare = useCallback(async () => {
        if (!anime) return;
        try {
            const title = String(anime?.title || 'Anime').trim();
            const message = `${title}\n\nMira este anime en Kami Reader.`;
            await Share.share({ title, message });
        } catch (error: any) {
            alertError(error?.message || 'No se pudo compartir el anime.');
        }
    }, [alertError, anime]);

    const markEpisodeAsWatched = useCallback(async (episode: any) => {
        if (!currentUserUid || !slug || !anime) return;

        const episodeSlug = String(episode?.episodeSlug || episode?.slug || '').trim();
        if (!episodeSlug) return;

        const watchedId = `${slug}__${episodeSlug}`;
        const watchedRef = doc(db, 'users', currentUserUid, 'watchedAnime', watchedId);
        const inProgressRef = doc(db, 'users', currentUserUid, 'inProgressAnime', slug);

        await Promise.all([
            setDoc(watchedRef, {
                animeSlug: slug,
                episodeSlug,
                episodeTitle: String(episode?.title || '').trim() || `Episodio ${episode?.number || ''}`,
                watchedAt: serverTimestamp(),
                isCompleted: true,
                source: String(anime?.source || '').trim(),
            }, { merge: true }),
            setDoc(inProgressRef, {
                animeSlug: slug,
                animeTitle: String(anime?.title || '').trim() || slug,
                coverUrl: String(anime?.cover || '').trim(),
                lastEpisodeSlug: episodeSlug,
                lastEpisodeNumber: Number(episode?.number || 0),
                updatedAt: serverTimestamp(),
                source: String(anime?.source || '').trim(),
            }, { merge: true }),
        ]);

        setWatchedEpisodeIds((prev) => {
            const next = new Set(prev);
            next.add(episodeSlug);
            return next;
        });
    }, [anime, currentUserUid, slug]);

    const header = useMemo(() => {
        if (!anime) return null;
        return (
            <LinearGradient colors={[theme.accentSoft, theme.backgroundSecondary]} style={styles.heroCard}>
                {anime.cover ? (
                    <Image source={{ uri: anime.cover }} style={styles.cover} resizeMode="cover" />
                ) : (
                    <View style={[styles.cover, { backgroundColor: theme.surface }]} />
                )}
                <View style={styles.heroText}>
                    <Text style={[styles.title, { color: theme.text }]}>{anime.title || 'Anime'}</Text>
                    <Text style={[styles.description, { color: theme.textMuted }]} numberOfLines={4}>
                        {anime.description || 'Sin descripción disponible.'}
                    </Text>
                    <View style={styles.metaRow}>
                        <View style={[styles.badge, { backgroundColor: theme.surface }]}>
                            <Text style={[styles.badgeText, { color: theme.text }]}>{episodes.length} episodios</Text>
                        </View>
                    </View>
                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={styles.actionButton} onPress={onShare}>
                            <Ionicons name="share-social-outline" size={16} color={theme.accent} />
                            <Text style={[styles.actionButtonText, { color: theme.text }]}>Compartir</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionButton} onPress={toggleFavorite} disabled={favoriteLoading}>
                            <Ionicons name={isFavorite ? 'bookmark' : 'bookmark-outline'} size={16} color={theme.accent} />
                            <Text style={[styles.actionButtonText, { color: theme.text }]}>{isFavorite ? 'Favorito' : 'Agregar Favorito'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </LinearGradient>
        );
    }, [anime, episodes.length, isFavorite, favoriteLoading, onShare, theme.accent, theme.accentSoft, theme.backgroundSecondary, theme.surface, theme.text, theme.textMuted, toggleFavorite]);

    return (
        <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={theme.background} />
            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
                <View style={[styles.topBar, { paddingTop: insets.top > 0 ? 8 : 14 }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={26} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.topBarTitle, { color: theme.text }]}>Anime</Text>
                </View>

                {loading ? (
                    <View style={styles.loadingWrap}>
                        <ActivityIndicator size="large" color={theme.accent} />
                        <Text style={[styles.loadingText, { color: theme.textMuted }]}>Cargando anime...</Text>
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        {header}
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Episodios</Text>
                            <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>Toca uno para abrir el reproductor</Text>
                        </View>
                        {episodes.map((episode) => (
                            <TouchableOpacity
                                key={episode.id || episode.episodeSlug || episode.slug}
                                style={[styles.episodeRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                onPress={async () => {
                                    try {
                                        await markEpisodeAsWatched(episode);
                                    } catch (_) {
                                        // Keep navigation responsive even when tracking fails.
                                    }

                                    navigation.navigate('Player', {
                                        animeSlug: slug,
                                        episodeSlug: episode.episodeSlug || episode.slug,
                                        startAtMs: 0,
                                    });
                                }}
                            >
                                <View style={[styles.episodeIndex, { backgroundColor: theme.accentSoft }]}>
                                    <Text style={[styles.episodeIndexText, { color: theme.text }]}>{episode.number || '•'}</Text>
                                </View>
                                <View style={styles.episodeTextWrap}>
                                    <Text style={[styles.episodeTitle, { color: theme.text }]} numberOfLines={1}>
                                        {episode.title || `Episodio ${episode.number || ''}`}
                                    </Text>
                                    <Text style={[styles.episodeMeta, { color: theme.textMuted }]} numberOfLines={1}>
                                        {`Capitulo ${episode.number || episode.episodeSlug || episode.slug || 'N/A'}`}
                                    </Text>
                                </View>
                                {watchedEpisodeIds.has(String(episode.episodeSlug || episode.slug || '').trim()) && (
                                    <Ionicons name="checkmark-done-circle" size={20} color={theme.success} style={styles.watchedIcon} />
                                )}
                                <Ionicons name="play-circle-outline" size={22} color={theme.accent} />
                            </TouchableOpacity>
                        ))}
                        {episodes.length === 0 && (
                            <View style={styles.emptyWrap}>
                                <Text style={[styles.emptyText, { color: theme.textMuted }]}>No se encontraron episodios.</Text>
                            </View>
                        )}
                    </ScrollView>
                )}
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
    backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
    topBarTitle: { marginLeft: 12, fontSize: 22, fontFamily: 'Roboto-Bold' },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 10, fontSize: 14, fontFamily: 'Roboto-Regular' },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 28 },
    heroCard: { borderRadius: 18, padding: 14, flexDirection: 'row', gap: 14, marginBottom: 18 },
    cover: { width: 110, height: 156, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
    heroText: { flex: 1, minWidth: 0 },
    title: { fontSize: 22, fontFamily: 'Roboto-Bold' },
    description: { marginTop: 8, fontSize: 13, lineHeight: 19, fontFamily: 'Roboto-Regular' },
    metaRow: { flexDirection: 'row', marginTop: 12 },
    badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
    badgeText: { fontSize: 12, fontFamily: 'Roboto-Bold' },
    buttonRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 8 },
    actionButton: {
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    actionButtonText: { fontSize: 12, fontFamily: 'Roboto-Bold' },
    sectionHeader: { marginTop: 6, marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontFamily: 'Roboto-Bold' },
    sectionSubtitle: { marginTop: 4, fontSize: 12, fontFamily: 'Roboto-Regular' },
    episodeRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10 },
    episodeIndex: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    episodeIndexText: { fontSize: 14, fontFamily: 'Roboto-Bold' },
    episodeTextWrap: { flex: 1, minWidth: 0 },
    episodeTitle: { fontSize: 15, fontFamily: 'Roboto-Medium' },
    episodeMeta: { marginTop: 4, fontSize: 11, fontFamily: 'Roboto-Regular' },
    watchedIcon: { marginRight: 8 },
    emptyWrap: { paddingVertical: 28, alignItems: 'center' },
    emptyText: { fontSize: 13, fontFamily: 'Roboto-Regular' },
});

export default AnimeDetailsScreen;
