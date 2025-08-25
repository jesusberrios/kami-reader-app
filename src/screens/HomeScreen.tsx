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
} from 'react-native';
import axios from 'axios';
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

// Types
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
            // console.error("Error checking app version:", error); // Removed log
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
    const fetchTopComics = useCallback(async () => {
        setComicsLoading(true);
        try {
            const cachedComics = await getCachedData('topComics');
            if (cachedComics) {
                if (isMounted.current) {
                    setTopSafe(cachedComics.safe);
                    setTopErotic(cachedComics.erotic);
                    setComicsLoading(false);
                }
                return;
            }

            const res = await axios.get('https://api.comick.fun/chapter/', {
                params: {
                    page: 1,
                    order: 'new',
                    tachiyomi: true,
                    type: ['manga', 'manhwa', 'manhua'],
                    accept_erotic_content: true,
                },
                timeout: 5000
            });

            if (isMounted.current) {
                const comicsData = res.data.map((item: any) => ({
                    hid: item.hid,
                    title: item.md_comics.title || 'Sin título',
                    lang: item.lang,
                    updated_at: item.updated_at,
                    cover: item.md_comics.cover_url || 'https://via.placeholder.com/150x200?text=No+Cover',
                    slug: item.md_comics.slug,
                    content_rating: item.md_comics.content_rating,
                }));

                const safeComics = comicsData.filter((comic: any) => comic.content_rating === 'safe').slice(0, 10);
                const eroticComics = comicsData.filter((comic: any) => comic.content_rating === 'erotica').slice(0, 10);

                setTopSafe(safeComics);
                setTopErotic(eroticComics);

                await setCacheData('topComics', { safe: safeComics, erotic: eroticComics });
            }
        } catch (error) {
            // console.error('Error fetching top comics:', error); // Removed log
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
            // console.error('Error fetching user plan:', error); // Removed log
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
            // console.error('Error fetching news:', error); // Removed log
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

            // console.log('Number of documents found in subcollection:', querySnapshot.size); // Removed log
            if (querySnapshot.empty) {
                // console.log('Subcollection "inProgressManga" is EMPTY for this user.'); // Removed log
            }

            const readingProgressData: { slug: string; lastReadChapterNumber: number; coverUrl: string }[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data() as { lastReadChapterNumber?: number; coverUrl?: string };

                const comicSlug = doc.id; // Use the document ID as the slug
                // console.log(data, 'Document data for slug:', comicSlug); // Removed log

                if (comicSlug) {
                    readingProgressData.push({
                        slug: comicSlug,
                        lastReadChapterNumber: data.lastReadChapterNumber || 0,
                        coverUrl: data.coverUrl || ''
                    });
                    // console.log(`Added slug from subcollection doc ID: ${comicSlug}, Chapter: ${data.lastReadChapterNumber}, Cover: ${data.coverUrl}`); // Removed log
                } else {
                    // console.warn(`Document ${doc.id} in inProgressManga subcollection has no valid slug (document ID is empty).`); // Removed log
                }
            });

            // console.log('Collected readingProgressData:', readingProgressData); // Removed log

            if (readingProgressData.length === 0) {
                // console.log('No valid reading progress data collected. Setting continue reading comics to empty.'); // Removed log
                setContinueReadingComics([]);
                return;
            }

            const comicsToDisplay: Chapter[] = [];
            for (const progressItem of readingProgressData) {
                const slug = progressItem.slug;
                const lastReadChapterNumber = progressItem.lastReadChapterNumber;
                const coverUrl = progressItem.coverUrl;

                // console.log(`Fetching details for comic slug from Comick.fun: ${slug}`); // Removed log
                const comicDetailsRes = await axios.get(`https://api.comick.fun/comic/${slug}`);

                if (comicDetailsRes.data && comicDetailsRes.data.comic) {
                    // console.log(`Details fetched for ${slug}. Title: ${comicDetailsRes.data.comic.title}`); // Removed log
                    comicsToDisplay.push({
                        hid: comicDetailsRes.data.comic.hid,
                        title: comicDetailsRes.data.comic.title,
                        cover: coverUrl || comicDetailsRes.data.comic.cover_url || 'https://via.placeholder.com/150x200?text=No+Cover',
                        slug: comicDetailsRes.data.comic.slug,
                        content_rating: comicDetailsRes.data.comic.content_rating,
                        lang: comicDetailsRes.data.comic.lang || 'en',
                        updated_at: new Date().toISOString(),
                        lastReadChapter: `Cap. ${lastReadChapterNumber}`
                    });
                } else {
                    // console.warn(`Failed to fetch details for comic slug: ${slug}. Response data:`, comicDetailsRes.data); // Removed log
                }
            }
            // console.log('Final comicsToDisplay array:', comicsToDisplay.map(c => c.title)); // Removed log
            if (isMounted.current) {
                setContinueReadingComics(comicsToDisplay);
            }
        } catch (error) {
            // console.error('Error fetching continue reading comics from user inProgressManga subcollection:', error); // Removed log
            if (isMounted.current) {
                setContinueReadingComics([]);
            }
        }
    }, []);

    // Función para cargar los datos iniciales (noticias, plan, cómics)
    const loadInitialData = useCallback(async () => {
        setLoading(true);
        await Promise.all([
            fetchNews(),
            fetchUserPlan(),
            fetchContinueReadingComics(), // Fetch continue reading data
        ]);
        await fetchTopComics();

        if (isMounted.current) {
            setLoading(false);
        }
    }, [fetchNews, fetchUserPlan, fetchTopComics, fetchContinueReadingComics]);


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
            fetchTopComics(),
            fetchNews(),
            fetchUserPlan(),
            fetchContinueReadingComics(), // Refresh continue reading data too
        ]);
        if (isMounted.current) {
            setRefreshing(false);
            AccessibilityInfo.isScreenReaderEnabled().then((isEnabled) => {
                if (isEnabled) {
                    AccessibilityInfo.announceForAccessibility("Contenido actualizado.");
                }
            });
        }
    }, [fetchTopComics, fetchNews, fetchUserPlan, fetchContinueReadingComics]);

    const handleComicPress = useCallback((slug: string) => {
        navigation.navigate('Details', { slug });
    }, [navigation]);

    const handleNewsPress = useCallback((newsItem: NewsItem) => {
        navigation.navigate('NewsDetail', { newsItem });
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

    const renderSectionHeader = useCallback((icon: string, title: string, color: string) => (
        <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name={icon as any} size={24} color={color} />
            <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
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

                    {/* News Section */}
                    {news.length > 0 && (
                        <View style={styles.sectionContainer}>
                            {renderSectionHeader('newspaper', 'Noticias', '#FF6B6B')}
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

                    {/* Continue Reading Section */}
                    {continueReadingComics.length > 0 && (
                        <View style={styles.sectionContainer}>
                            {renderSectionHeader('book-open-outline', 'En Curso', '#4CAF50')}
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
                        {renderSectionHeader('shield-check', 'Top Seguros', '#6B8AFD')}
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
                            {renderSectionHeader('fire', 'Top Eróticos', '#FF6B6B')}
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
        marginBottom: 10,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 15,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginLeft: 10,
        fontFamily: 'Roboto-Bold',
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
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#2A2A3B',
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
    adBannerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingVertical: 10,
    },
});

export default React.memo(HomeScreen);