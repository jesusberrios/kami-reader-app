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
    ScrollView, // Asegúrate de importar ScrollView
} from 'react-native';
import axios from 'axios';
import { DrawerActions } from '@react-navigation/native';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
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
import { getCachedData, setCacheData } from '../utils/cacheUtils'; // <-- ¡IMPORTANTE!

// Constants
const windowWidth = Dimensions.get('window').width;
const itemWidth = windowWidth * 0.32;
const itemHeight = itemWidth * 1.5;
const adUnitId = __DEV__ ? TestIds.BANNER : 'ca-app-pub-6584977537844104/1888694522';
const APP_IDS = {
    ios: '5cd6ecff-6004-4696-b780-172ff5ca8a22',
    android: 'com.sukisoft.kamireader' // Asegúrate de cambiar esto por el ID de tu paquete Android
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
};

type NewsItem = {
    id: string;
    title: string;
    message: string;
    createdAt?: any; // Añadido para el NewsDetailScreen
};

const HomeScreen = ({ navigation }: any) => {
    // State
    const [topSafe, setTopSafe] = useState<Chapter[]>([]);
    const [topErotic, setTopErotic] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(true); // Controla la carga inicial completa de la pantalla
    const [refreshing, setRefreshing] = useState(false); // Controla el estado de refresco manual
    const [news, setNews] = useState<NewsItem[]>([]);
    const [plan, setPlan] = useState<'free' | 'premium'>('free');
    const [email, setEmail] = useState('');
    const [updateModalVisible, setUpdateModalVisible] = useState(false);
    const [minVersion, setMinVersion] = useState('');
    const [currentVersion, setCurrentVersion] = useState('');
    // Nuevo estado para gestionar la carga de cómics específicamente (para indicadores de carga más granulares)
    const [comicsLoading, setComicsLoading] = useState(true);

    // Refs and hooks
    const insets = useSafeAreaInsets();
    const headerRef = useRef<View>(null);
    const isMounted = useRef(true); // Para evitar actualizaciones de estado en componentes desmontados

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
            console.error("Error checking app version:", error);
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
        setComicsLoading(true); // Inicia el indicador de carga de cómics
        try {
            // 1. Intentar cargar desde la caché
            const cachedComics = await getCachedData('topComics');
            if (cachedComics) {
                if (isMounted.current) {
                    setTopSafe(cachedComics.safe);
                    setTopErotic(cachedComics.erotic);
                    console.log('Comics loaded from cache.');
                    setComicsLoading(false); // La carga desde caché es instantánea
                }
                // Si se carga desde caché, no hacemos la petición API a menos que se refresque
                return;
            }

            // 2. Si no hay caché o está expirada, hacer la petición API
            console.log('Fetching comics from API...');
            const res = await axios.get('https://api.comick.fun/chapter/', {
                params: {
                    page: 1,
                    order: 'new',
                    tachiyomi: true,
                    type: ['manga', 'manhwa', 'manhua'],
                    accept_erotic_content: true,
                    // Si la API soporta un 'limit', añádelo aquí para reducir la carga
                    // limit: 20, // Ejemplo: buscar 20 elementos para filtrar a 10 de cada tipo
                },
                timeout: 5000 // Reducido el tiempo de espera a 5 segundos
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

                // 3. Guardar en caché los datos recién obtenidos
                await setCacheData('topComics', { safe: safeComics, erotic: eroticComics });
            }
        } catch (error) {
            console.error('Error fetching top comics:', error);
            // Considera mostrar un mensaje de error al usuario aquí
        } finally {
            if (isMounted.current) {
                setComicsLoading(false); // Siempre desactiva el indicador de carga de cómics
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
            console.error('Error fetching user plan:', error);
        }
    }, []);

    const fetchNews = useCallback(async () => {
        try {
            // 1. Intentar cargar desde la caché
            const cachedNews = await getCachedData('appNews');
            if (cachedNews) {
                if (isMounted.current) {
                    setNews(cachedNews);
                    console.log('News loaded from cache.');
                }
                return;
            }

            // 2. Si no hay caché o está expirada, hacer la petición a Firestore
            console.log('Fetching news from Firestore...');
            const snapshot = await getDocs(collection(db, 'notifications'));
            if (isMounted.current) {
                const fetchedNews = snapshot.docs.map(doc => ({
                    ...doc.data(),
                    id: doc.id,
                    createdAt: doc.data().createdAt || null // Asegura que createdAt se incluya
                } as NewsItem));
                setNews(fetchedNews);
                // 3. Guardar en caché los datos recién obtenidos
                await setCacheData('appNews', fetchedNews);
            }
        } catch (error) {
            console.error('Error fetching news:', error);
        }
    }, []);

    // Función para cargar los datos iniciales (noticias, plan, cómics)
    const loadInitialData = useCallback(async () => {
        setLoading(true); // Activa el indicador de carga de la pantalla completa
        // Fetch datos no-comic primero (generalmente más rápidos)
        await Promise.all([
            fetchNews(),
            fetchUserPlan()
        ]);
        // Luego fetch comics (que tienen su propio indicador de carga más granular)
        await fetchTopComics();

        if (isMounted.current) {
            setLoading(false); // Desactiva el indicador de carga de la pantalla completa
        }
    }, [fetchNews, fetchUserPlan, fetchTopComics]);


    // Effects
    useEffect(() => {
        checkAppVersion();
        loadInitialData(); // Llama a la nueva función de carga de datos iniciales

        return () => {
            isMounted.current = false; // Limpieza para evitar fugas de memoria y errores
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
        setRefreshing(true); // Activa el indicador de refresco
        // Refresca todos los datos (esto ignorará la caché y forzará peticiones a la API)
        await Promise.all([
            fetchTopComics(), // Esta llamada ahora irá a la API si la caché está expirada o no existe
            fetchNews(),      // Esta llamada también
            fetchUserPlan()
        ]);
        if (isMounted.current) {
            setRefreshing(false); // Desactiva el indicador de refresco
            AccessibilityInfo.isScreenReaderEnabled().then((isEnabled) => {
                if (isEnabled) {
                    AccessibilityInfo.announceForAccessibility("Contenido actualizado.");
                }
            });
        }
    }, [fetchTopComics, fetchNews, fetchUserPlan]);

    const handleComicPress = useCallback((slug: string) => {
        navigation.navigate('Details', { slug });
    }, [navigation]);

    const handleNewsPress = useCallback((newsItem: NewsItem) => {
        // Asegúrate de tener una pantalla 'NewsDetail' configurada en tu navegador
        navigation.navigate('NewsDetail', { newsItem });
    }, [navigation]);


    // getItemLayout for FlatList optimization
    const getItemLayout = useCallback((data: any, index: any) => (
        { length: itemHeight + 15, offset: (itemHeight + 15) * index, index } // 15 es para marginRight
    ), []);

    // Render functions
    const renderNewsItem = useCallback(({ item }: { item: NewsItem }) => (
        <TouchableOpacity
            style={styles.newsItem}
            onPress={() => handleNewsPress(item)} // Añade el onPress para navegar a la noticia
            activeOpacity={0.7}
            accessibilityLabel={`Abrir noticia: ${item.title}`}
        >
            <Text style={styles.newsTitle}>{item.title}</Text>
            {/* Puedes procesar el HTML de item.message aquí si es necesario, o usar un componente HTML */}
            <Text style={styles.newsContent} numberOfLines={3}>
                {item.message.replace(/<[^>]*>/g, '')} {/* Elimina etiquetas HTML básicas para la vista previa */}
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
                defaultSource={require('../../assets/auth-bg.png')} // Asegúrate de que esta ruta sea correcta
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
            {item.lang && (
                <View style={styles.languageBadge}>
                    <Text style={styles.languageText}>{getFlagEmoji(item.lang)}</Text>
                </View>
            )}

            {/* Updated At Badge */}
            {item.updated_at && (
                <View style={styles.updatedAtBadge}>
                    <Text style={styles.updatedAtText}>{formatTimeAgo(item.updated_at)}</Text>
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

    // Pantalla de carga inicial (mientras se cargan las noticias y el plan)
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
                {/* ScrollView principal para todo el contenido deslizable */}
                <ScrollView
                    contentContainerStyle={styles.scrollViewContent} // <-- Usamos este estilo para el padding inferior
                    refreshControl={ // <--- RefreshControl como prop del ScrollView
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor="#FF6B6B"
                            title="Actualizando contenido..."
                            titleColor="#FFF"
                            // backgroundColor="#0F0F1A" // Opcional: color de fondo del pull-to-refresh
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
                                getItemLayout={getItemLayout} // Añadido para rendimiento
                                removeClippedSubviews={true} // Considerar para Android
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
                                    getItemLayout={getItemLayout} // Añadido para rendimiento
                                    removeClippedSubviews={true} // Considerar para Android
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
                    clientId={email} // Opcional si es el usuario de soporte
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

// Styles
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F0F1A',
    },
    safeArea: {
        flex: 1,
    },
    // Estilo para el contentContainerStyle del ScrollView para el padding inferior
    scrollViewContent: {
        paddingBottom: 20, // Ajusta este valor si aún ves el corte. Puede que necesites más.
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
        height: itemHeight, // Dale una altura para evitar cambios de layout al cargar
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
    adBannerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingVertical: 10,
    },
});

export default React.memo(HomeScreen);