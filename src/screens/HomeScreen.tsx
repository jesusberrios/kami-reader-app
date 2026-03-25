import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    Image,
    StyleSheet,
    SafeAreaView,
    ActivityIndicator,
    Dimensions,
    TouchableOpacity,
    AccessibilityInfo,
    Platform,
    RefreshControl,
    ScrollView,
    Linking,
} from 'react-native';
import { DrawerActions } from '@react-navigation/native';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'; // Removed query, where as they are not needed for this subcollection fetch
import { db } from '../firebase/config';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { getAuth } from 'firebase/auth';
import DrawerToggle from '../components/drawerToggle';
import { getAppVersion } from '../utils/versionUtils';
import UpdateRequiredModal from '../components/updateRequiredModal';
import FloatingChatBubble from '../components/floatingChatBubble';
import { getLatestManga } from '../services/backendApi';

// Import the new utilities
import { getFlagEmoji, formatTimeAgo } from '../utils/flagUtils';
// Import the new cache utilities
import { getCachedData, setCacheData } from '../utils/cacheUtils';

// Constants
const windowWidth = Dimensions.get('window').width;
const itemWidth = windowWidth * 0.32;
const itemHeight = itemWidth * 1.5;
const adUnitId = __DEV__ ? TestIds.BANNER : 'ca-app-pub-6584977537844104/1888694522';
const APP_IDS = {
    ios: '5cd6ecff-6004-4696-b780-172ff5ca8a22',
    android: 'com.yourusername.kamireader' // Asegúrate de cambiar esto por el ID de tu paquete Android
};
const DONATION_URL = process.env.EXPO_PUBLIC_DONATION_URL || 'https://ko-fi.com/sukisoft';

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
    return { backgroundColor: 'rgba(66, 165, 245, 0.9)', textColor: '#ECF6FF' };
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
    content_rating: string;
    lang: string;
    updated_at: any;
    lastReadChapter?: string; // Add this for "Continue Reading"
};

type NewsItem = {
    id: string;
    title: string;
    message: string;
    createdAt?: any;
};

const HomeScreen = ({ navigation }: any) => {
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

    // Refs and hooks
    const insets = useSafeAreaInsets();
    const headerRef = useRef<View>(null);
    const isMounted = useRef(true);

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
        }
    }, []);

    const fetchNews = useCallback(async () => {
        try {
            const cachedNews = await getCachedData('appNews');
            if (cachedNews) {
                if (isMounted.current) {
                    setNews(cachedNews);
                }
                return;
            }

            const snapshot = await getDocs(collection(db, 'notifications'));
            if (isMounted.current) {
                const fetchedNews = snapshot.docs.map(doc => ({
                    ...doc.data(),
                    id: doc.id,
                    createdAt: doc.data().createdAt || null
                } as NewsItem));
                setNews(fetchedNews);
                await setCacheData('appNews', fetchedNews);
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
                lastReadChapterNumber: number;
                coverUrl: string;
            }[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data() as {
                    lastReadChapterNumber?: number;
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
                        source: String(data.source || 'zonatmo'),
                        lastReadChapterNumber: data.lastReadChapterNumber || 0,
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
                content_rating: 'safe',
                lang: 'es-419',
                updated_at: new Date().toISOString(),
                lastReadChapter: `Cap. ${progressItem.lastReadChapterNumber}`,
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

    const fetchLatestMangas = useCallback(async (options?: { forceRefresh?: boolean }) => {
        setLatestLoading(true);
        try {
            const res = await getLatestManga({ page: 1, limit: 24 }, {
                ttlMs: 60 * 1000,
                forceRefresh: options?.forceRefresh === true,
            });
            
            if (isMounted.current && Array.isArray(res?.results)) {
                setLatestMangas(res.results);
            }
        } catch (error) {
            // silencioso si el backend no está disponible
        } finally {
            if (isMounted.current) setLatestLoading(false);
        }
    }, []);

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

    const handleComicPress = useCallback((slug: string) => {
        navigation.navigate('Details', { slug });
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
            onPress={() => handleComicPress(item.slug)}
            activeOpacity={0.7}
            accessibilityLabel={`Ver detalles de ${item.title}`}
        >
            <Image
                source={{ uri: item.cover }}
                style={styles.cover}
                resizeMode="cover"
                defaultSource={require('../../assets/auth-bg.png')}
            />
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                style={styles.comicGradient}
            />
            <Text style={styles.comicTitle} numberOfLines={2}>{item.title}</Text>

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
            <LinearGradient colors={['#0F0F1A', '#252536']} style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FF6B6B" />
                <Text style={styles.loadingText}>Cargando contenido...</Text>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={['#0F0F1A', '#252536']} style={styles.container}>
            <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
                <ScrollView
                    contentContainerStyle={styles.scrollViewContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor="#FF6B6B"
                            title="Actualizando contenido..."
                            titleColor="#FFF"
                        />
                    }
                >
                    {/* Header */}
                    <View style={styles.headerContainer} ref={headerRef}>
                        <TouchableOpacity
                            onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
                            style={styles.menuButton}
                            accessibilityLabel="Abrir menú"
                        >
                            <DrawerToggle />
                        </TouchableOpacity>
                        <View style={styles.headerContent}>
                            <Text style={styles.header}>Bienvenido</Text>
                        </View>
                    </View>

                    <LinearGradient colors={['#FF6B6B22', '#6B8AFD18']} style={styles.heroCard}>
                        <View style={styles.heroIconWrap}>
                            <MaterialCommunityIcons name="compass-rose" size={24} color="#FFD4D4" />
                        </View>
                        <View style={styles.heroTextWrap}>
                            <Text style={styles.heroTitle}>Explora nuevos mangas</Text>
                            <Text style={styles.heroSubtitle}>Top por rating, recientes y tus lecturas en progreso en un solo lugar.</Text>
                        </View>
                    </LinearGradient>

                    <TouchableOpacity style={styles.donationCard} onPress={handleOpenDonation} activeOpacity={0.85}>
                        <LinearGradient colors={['#F59E0B33', '#FB718533']} style={StyleSheet.absoluteFill} />
                        <View style={styles.donationTopRow}>
                            <MaterialCommunityIcons name="gift-outline" size={22} color="#FFD599" />
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
                                    <MaterialCommunityIcons name="newspaper" size={24} color="#FF6B6B" />
                                    <View style={styles.newsHeaderTextWrap}>
                                        <Text style={[styles.sectionTitle, { color: '#FF6B6B' }]}>Noticias</Text>
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
                        {renderSectionHeader('clock-outline', 'Recientes', '#FFB347', 'Ultimas publicaciones')}
                        {latestLoading ? (
                            <ActivityIndicator size="small" color="#FFB347" style={styles.sectionLoadingIndicator} />
                        ) : (
                            <FlatList
                                data={latestMangas}
                                keyExtractor={(item) => `${item.source || 'zonatmo'}:${item.slug}`}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.comicItem}
                                        onPress={() => navigation.navigate('Details', { slug: item.slug })}
                                        activeOpacity={0.7}
                                        accessibilityLabel={`Ver detalles de ${item.title}`}
                                    >
                                        <Image
                                            source={{ uri: item.cover }}
                                            style={styles.cover}
                                            resizeMode="cover"
                                            defaultSource={require('../../assets/auth-bg.png')}
                                        />
                                        <LinearGradient
                                            colors={['transparent', 'rgba(0,0,0,0.8)']}
                                            style={styles.comicGradient}
                                        />
                                        <Text style={styles.comicTitle} numberOfLines={2}>{item.title}</Text>
                                        {item.score && item.score !== '0.0' && (
                                            <View style={styles.scoreBadge}>
                                                <MaterialCommunityIcons name="star" size={10} color="#FFD700" />
                                                <Text style={styles.scoreText}>{item.score}</Text>
                                            </View>
                                        )}
                                        <View style={[
                                            styles.statusTag,
                                            { backgroundColor: getStatusBadgeStyles(item.status).backgroundColor },
                                        ]}>
                                            <Text style={[
                                                styles.statusTagText,
                                                { color: getStatusBadgeStyles(item.status).textColor },
                                            ]}>
                                                {getStatusLabel(item.status, item.statusLabel)}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                )}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.comicsList}
                                initialNumToRender={3}
                                maxToRenderPerBatch={5}
                                windowSize={7}
                                getItemLayout={getItemLayout}
                                removeClippedSubviews={true}
                            />
                        )}
                    </View>

                    {/* Continue Reading Section */}
                    {continueReadingComics.length > 0 && (
                        <View style={styles.sectionContainer}>
                            {renderSectionHeader('book-open-outline', 'En Curso', '#4CAF50', 'Retoma donde te quedaste')}
                            {comicsLoading ? ( // You might want a separate loading state for this or reuse comicsLoading
                                <ActivityIndicator size="small" color="#4CAF50" style={styles.sectionLoadingIndicator} />
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
                                    removeClippedSubviews={true}
                                />
                            )}
                        </View>
                    )}

                    {/* Top Safe Comics */}
                    <View style={styles.sectionContainer}>
                        {renderSectionHeader('shield-check', 'Top Seguros', '#6B8AFD', 'Mangas -18 (sin contenido erotico)')}
                        {comicsLoading ? (
                            <ActivityIndicator size="small" color="#6B8AFD" style={styles.sectionLoadingIndicator} />
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
                                removeClippedSubviews={true}
                            />
                        )}
                    </View>

                    {/* Top Erotic Comics */}
                    {topErotic.length > 0 && (
                        <View style={styles.sectionContainer}>
                            {renderSectionHeader('fire', 'Top Eroticos', '#FF6B6B', 'Mangas +18')}
                            {comicsLoading ? (
                                <ActivityIndicator size="small" color="#FF6B6B" style={styles.sectionLoadingIndicator} />
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
                                    removeClippedSubviews={true}
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
    menuButton: {
        marginRight: 15,
        padding: 5,
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
        marginRight: 15,
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
        top: 8,
        left: 8,
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
        top: 8,
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
        left: 8,
        borderRadius: 8,
        paddingHorizontal: 6,
        paddingVertical: 3,
    },
    statusTagText: {
        fontSize: 9,
        fontFamily: 'Roboto-Bold',
        textTransform: 'uppercase',
    },
    adBannerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingVertical: 10,
    },
});

export default React.memo(HomeScreen);