import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    StyleSheet,
    Dimensions,
    TouchableOpacity,
    StatusBar,
    Animated,
    Alert,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { FlashList } from "@shopify/flash-list";
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import {
    MobileAds,
    BannerAd,
    BannerAdSize,
    InterstitialAd,
    AdEventType,
    TestIds
} from 'react-native-google-mobile-ads';

const { width: screenWidth } = Dimensions.get('window');
const AD_UNIT_ID = __DEV__ ? TestIds.BANNER : 'ca-app-pub-6584977537844104/1888694522';
const INTERSTITIAL_AD_ID = __DEV__ ? TestIds.INTERSTITIAL : 'ca-app-pub-6584977537844104/5402087604';

MobileAds().initialize();

let interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_ID, {
    requestNonPersonalizedAdsOnly: true,
});

const AUTO_HIDE_DELAY = 5000; // ms para ocultar controles después de no tocar nada
const INTERSTITIAL_SHOW_INTERVAL = 120 * 1000; // 2 minuto en milisegundos

const ScreenReader = () => {
    const route = useRoute<RouteProp<RootStackParamList, 'Reader'>>();
    const navigation = useNavigation();
    const { hid: initialHid } = route.params;

    const [currentHid, setCurrentHid] = useState(initialHid);
    const [images, setImages] = useState<any[]>([]);
    const [loadingChapter, setLoadingChapter] = useState(true);
    const [chapterTitle, setChapterTitle] = useState('');
    const [nextHid, setNextHid] = useState<string | null>(null);
    const [prevHid, setPrevHid] = useState<string | null>(null);
    const [showControls, setShowControls] = useState(true);
    const [plan, setPlan] = useState<'free' | 'premium'>('free');

    const lastInterstitialShowTime = useRef(Date.now());
    const adTimerRef = useRef<NodeJS.Timeout | null>(null);

    const [showTranslateOverlay, setShowTranslateOverlay] = useState(false);

    const controlsOpacity = useRef(new Animated.Value(1)).current;
    const insets = useSafeAreaInsets();
    const flashListRef = useRef<FlashList<any>>(null);
    const startTimeRef = useRef(0);
    const autoHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);


    const loadInterstitialAd = useCallback(() => {
        if (plan === 'free') {
            console.log('[Ad] Attempting to load interstitial ad...');
            interstitial.load();
        }
    }, [plan]);

    useEffect(() => {
        if (plan === 'free') {
            const unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
                console.log('[Ad] Interstitial ad loaded!');
            });
            const unsubscribeClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
                console.log('[Ad] Interstitial ad closed. Preloading next ad.');
                lastInterstitialShowTime.current = Date.now();
                loadInterstitialAd(); // Preload the next ad immediately after one is closed
            });
            const unsubscribeOpened = interstitial.addAdEventListener(AdEventType.OPENED, () => {
                console.log('[Ad] Interstitial ad OPENED! (User is seeing the ad)');
            });
            const unsubscribeError = interstitial.addAdEventListener(AdEventType.ERROR, (error) => {
                console.error('[Ad] Interstitial Ad Error:', error);
                loadInterstitialAd();
            });

            loadInterstitialAd();

            return () => {
                unsubscribeLoaded();
                unsubscribeClosed();
                unsubscribeOpened(); // Limpia también este listener
                unsubscribeError();
            };
        }
        if (plan === 'premium' && adTimerRef.current) {
            clearInterval(adTimerRef.current);
            adTimerRef.current = null;
        }
    }, [plan, loadInterstitialAd]);


    const showInterstitial = useCallback(() => {
        if (plan === 'free' && interstitial.loaded) { // <--- Usar .loaded
            const now = Date.now();
            const timeSinceLastAd = now - lastInterstitialShowTime.current;

            if (timeSinceLastAd >= INTERSTITIAL_SHOW_INTERVAL) {
                console.log('[Ad] Showing interstitial ad...');
                interstitial.show();
            } else {
                console.log(`[Ad] Not enough time passed (${(timeSinceLastAd / 1000).toFixed(1)}s) since last ad.`);
            }
        } else {
            console.log('[Ad] Interstitial not loaded or user is premium. Not showing ad.');
            // Si el anuncio no está cargado, intenta cargarlo de nuevo para la próxima vez
            if (plan === 'free' && !interstitial.loaded) {
                console.log('[Ad] Interstitial not ready, attempting to reload for next time.');
                loadInterstitialAd();
            }
        }
    }, [plan, loadInterstitialAd]);

    useEffect(() => {
        if (plan === 'free') {
            if (adTimerRef.current) clearInterval(adTimerRef.current);

            adTimerRef.current = setInterval(() => {
                showInterstitial();
            }, INTERSTITIAL_SHOW_INTERVAL);

            return () => {
                if (adTimerRef.current) clearInterval(adTimerRef.current);
            };
        } else if (adTimerRef.current) {
            clearInterval(adTimerRef.current);
            adTimerRef.current = null;
        }
    }, [plan, showInterstitial]);

    useEffect(() => {
        const fetchPlan = async () => {
            try {
                const user = auth.currentUser;
                if (!user) return;
                const docRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.accountType === 'premium') setPlan('premium');
                    else setPlan('free'); // Asegúrate de establecer 'free' si no es premium
                } else {
                    setPlan('free'); // Por defecto si no existe el documento del usuario
                }
            } catch (err) {
                console.error('Error fetching user plan:', err);
                Alert.alert("Error", "No se pudo verificar el estado de la cuenta.");
                setPlan('free'); // En caso de error, asume 'free' para no bloquear la app
            }
        };
        fetchPlan();
    }, []);

    const saveReadingTimeToFirestore = useCallback(async (timeInMs: number) => {
        try {
            const user = auth.currentUser;
            if (!user) return;

            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            let currentTotalReadingTime = 0;

            if (userDoc.exists()) {
                currentTotalReadingTime = userDoc.data()?.totalReadingTime || 0;
            }

            await updateDoc(userDocRef, {
                totalReadingTime: currentTotalReadingTime + timeInMs,
            });
        } catch (error) {
            console.error('Error saving reading time:', error);
        }
    }, []);

    useEffect(() => {
        startTimeRef.current = Date.now();
        return () => {
            const duration = Date.now() - startTimeRef.current;
            if (duration > 1000) saveReadingTimeToFirestore(duration);
        };
    }, [currentHid, saveReadingTimeToFirestore]);

    const fetchChapterData = useCallback(async () => {
        setLoadingChapter(true);
        setShowControls(true);
        controlsOpacity.setValue(1);
        setImages([]);

        try {
            const response = await fetch(`https://api.comick.fun/chapter/${currentHid}/?tachiyomi=true`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();

            if (data?.chapter?.images) {
                const imgs = data.chapter.images.map((imgObj: any) => ({
                    url: imgObj.url,
                    w: imgObj.w,
                    h: imgObj.h,
                    loading: true,
                }));
                setImages(imgs);
                setChapterTitle(data.chapter.title || `Capítulo ${data.chapter.chap}`);
                setNextHid(data.next?.hid || null);
                setPrevHid(data.prev?.hid || null);

                imgs.slice(0, 3).forEach((img: any) => Image.prefetch(img.url));
            } else {
                Alert.alert("Error", "No se encontraron imágenes para este capítulo.");
            }
        } catch (error: any) {
            console.error('Error fetching chapter data:', error);
            Alert.alert("Error", `No se pudo cargar el capítulo: ${error.message || 'Error desconocido'}`);
        } finally {
            setLoadingChapter(false);
            flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
    }, [currentHid, controlsOpacity]);

    useEffect(() => {
        fetchChapterData();
    }, [fetchChapterData]);

    const onImageLoad = useCallback((url: string) => {
        setImages((prev: any) => prev.map((img: any) => img.url === url ? { ...img, loading: false } : img));
    }, []);

    const renderImageItem = useCallback(({ item }: any) => {
        const displayHeight = screenWidth * (item.h / item.w);
        return (
            <View style={styles.imageContainer}>
                <Image
                    source={{ uri: item.url }}
                    style={{ width: screenWidth, height: displayHeight }}
                    contentFit="cover"
                    transition={0}
                    onLoad={() => onImageLoad(item.url)}
                    onError={(e) => console.error('Image loading error:', item.url, e)}
                />
                {item.loading && (
                    <View style={[styles.imageLoadingIndicator, { width: screenWidth, height: displayHeight }]}>
                        <ActivityIndicator size="small" color="#FF5555" />
                    </View>
                )}
            </View>
        );
    }, [onImageLoad]);

    const resetAutoHide = () => {
        if (autoHideTimeoutRef.current) clearTimeout(autoHideTimeoutRef.current);
        autoHideTimeoutRef.current = setTimeout(() => {
            Animated.timing(controlsOpacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start(() => setShowControls(false));
        }, AUTO_HIDE_DELAY);
    };

    const showAndResetControls = () => {
        if (!showControls) {
            setShowControls(true);
            Animated.timing(controlsOpacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
        resetAutoHide();
    };

    const onScreenTouch = () => {
        if (!showTranslateOverlay) {
            showAndResetControls();
        }
    };

    const changeChapter = (hid: string | null) => {
        if (!hid) return;
        setCurrentHid(hid);
        flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
    };

    const toggleTranslateComponent = () => {
        setShowTranslateOverlay(prev => !prev);
        if (!showTranslateOverlay) {
            if (autoHideTimeoutRef.current) clearTimeout(autoHideTimeoutRef.current);
        } else {
            resetAutoHide();
        }
        showAndResetControls();
    };

    return (
        <View style={styles.container} onTouchStart={onScreenTouch}>

            <StatusBar
                translucent
                backgroundColor="transparent"
                barStyle="light-content"
                animated
            />

            {showControls && (
                <Animated.View style={[styles.topBar, { opacity: controlsOpacity, paddingTop: insets.top }]}>
                    <LinearGradient
                        colors={['rgba(0,0,0,0.7)', 'transparent']}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.topBarContent}>
                        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Volver">
                            <Ionicons name="arrow-back" size={28} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.chapterTitle} accessibilityRole="header" accessibilityLabel={`Título capítulo: ${chapterTitle}`}>
                            {chapterTitle}
                        </Text>
                        <View style={styles.controlsRight}>
                            <TouchableOpacity onPress={() => changeChapter(prevHid)} disabled={!prevHid} accessibilityLabel="Capítulo anterior">
                                <Ionicons name="chevron-back" size={28} color={prevHid ? "#fff" : "#555"} />
                            </TouchableOpacity>
                            {/* <TouchableOpacity onPress={toggleTranslateComponent} accessibilityLabel="Mostrar traducción">
                                <Ionicons name="language" size={28} color="#fff" />
                            </TouchableOpacity> */}
                            <TouchableOpacity onPress={() => changeChapter(nextHid)} disabled={!nextHid} accessibilityLabel="Capítulo siguiente">
                                <Ionicons name="chevron-forward" size={28} color={nextHid ? "#fff" : "#555"} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </Animated.View>
            )}

            {loadingChapter && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#FF5555" />
                </View>
            )}

            <FlashList
                ref={flashListRef}
                data={images}
                estimatedItemSize={400}
                keyExtractor={(item) => item.url}
                renderItem={renderImageItem}
                removeClippedSubviews={true}
                showsVerticalScrollIndicator={false}
                onScrollBeginDrag={showAndResetControls}
            />

            {plan === 'free' && (
                <View style={[styles.bannerContainer, { bottom: insets.bottom + 5 }]}>
                    <BannerAd
                        unitId={AD_UNIT_ID}
                        size={BannerAdSize.ADAPTIVE_BANNER}
                        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
                    />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111',
    },
    topBar: {
        position: 'absolute',
        width: '100%',
        zIndex: 10,
        paddingHorizontal: 15,
        paddingBottom: 8,
    },
    topBarContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    chapterTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        flex: 1,
        marginHorizontal: 10,
        textAlign: 'center',
    },
    controlsRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    imageContainer: {
        marginBottom: 0,
        backgroundColor: '#222',
    },
    imageLoadingIndicator: {
        position: 'absolute',
        top: 0,
        left: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20,
    },
    bannerContainer: {
        position: 'absolute',
        alignSelf: 'center',
        width: '100%',
        maxWidth: 468,
    },
    translateOverlayBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 25,
    },
});

export default ScreenReader;