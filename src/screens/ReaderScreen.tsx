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
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { FlashList } from "@shopify/flash-list";
import { doc, getDoc, updateDoc, setDoc, collection } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import {
    MobileAds,
    BannerAd,
    BannerAdSize,
    InterstitialAd,
    AdEventType,
    TestIds
} from 'react-native-google-mobile-ads';
import { useAlertContext } from '../contexts/AlertContext'; // Importar el hook de alerta

const { width: screenWidth } = Dimensions.get('window');
const AD_UNIT_ID = __DEV__ ? TestIds.BANNER : 'ca-app-pub-6584977537844104/1888694522';
const INTERSTITIAL_AD_ID = __DEV__ ? TestIds.INTERSTITIAL : 'ca-app-pub-6584977537844104/5402087604';

MobileAds().initialize();

let interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_ID, {
    requestNonPersonalizedAdsOnly: true,
});

const AUTO_HIDE_DELAY = 5000;
const INTERSTITIAL_SHOW_INTERVAL = 120 * 1000;

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
    const [comicInfo, setComicInfo] = useState<{ hid: string; title: string;} | null>(null);

    const lastInterstitialShowTime = useRef(Date.now());
    const adTimerRef = useRef<NodeJS.Timeout | null>(null);

    const [showTranslateOverlay, setShowTranslateOverlay] = useState(false);

    const controlsOpacity = useRef(new Animated.Value(1)).current;
    const insets = useSafeAreaInsets();
    const flashListRef = useRef<FlashList<any>>(null);
    const startTimeRef = useRef(0);
    const autoHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Usar el contexto de alerta
    const { alertError } = useAlertContext();

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
                loadInterstitialAd();
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
                unsubscribeOpened();
                unsubscribeError();
            };
        }
        if (plan === 'premium' && adTimerRef.current) {
            clearInterval(adTimerRef.current);
            adTimerRef.current = null;
        }
    }, [plan, loadInterstitialAd]);

    const showInterstitial = useCallback(() => {
        if (plan === 'free' && interstitial.loaded) {
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
                    else setPlan('free');
                } else {
                    setPlan('free');
                }
            } catch (err) {
                console.error('Error fetching user plan:', err);
                alertError("No se pudo verificar el estado de la cuenta.");
                setPlan('free');
            }
        };
        fetchPlan();
    }, [alertError]);

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
    // Función para agregar/actualizar manga en progreso
    const addMangaToInProgress = useCallback(async (mangaHid: string, mangaTitle: string, chapterHid: string, chapterNumber: string, mangaCover_url: string) => {
        try {
            const user = auth.currentUser;
            if (!user || plan !== 'premium') return;

            const mangaDocRef = doc(db, 'users', user.uid, 'inProgressManga', mangaHid);

            await setDoc(mangaDocRef, {
                mangaHid: mangaHid,
                mangaTitle: mangaTitle,
                coverUrl: mangaCover_url,
                slug: mangaHid,
                startedAt: new Date(),
                lastReadChapterHid: chapterHid,
                lastReadChapterNumber: chapterNumber,
                lastUpdated: new Date()
            }, { merge: true });

            console.log('Manga agregado a inProgress:', mangaHid);

        } catch (error) {
            console.error('Error adding manga to inProgress:', error);
        }
    }, [plan]);
    // Función para marcar capítulo como leído (actualizada)
    const markChapterAsRead = useCallback(async (chapterHid: string, chapterChap: string) => {
        try {
            const user = auth.currentUser;
            if (!user || plan !== 'premium') return;

            // Obtener información del cómic
            const chapterResponse = await fetch(`https://api.comick.fun/chapter/${chapterHid}/?tachiyomi=true`);
            if (!chapterResponse.ok) return;

            const chapterData = await chapterResponse.json();
            if (!chapterData.chapter?.md_comics?.slug) return;

            const comicSlug = chapterData.chapter.md_comics.slug;

            // Obtener detalles del cómic
            const comicResponse = await fetch(`https://api.comick.fun/v1.0/comic/${comicSlug}/?tachiyomi=true`);
            if (!comicResponse.ok) return;

            const comicData = await comicResponse.json();
            const comicInfo = {
                hid: comicData.comic.hid,
                title: comicData.comic.title,
                cover_url: comicData.comic.cover_url // 👈 agregar cover_url
            };

            setComicInfo(comicInfo);

            // Marcar capítulo como leído en readComics
            const comicReadDocRef = doc(db, 'users', user.uid, 'readComics', comicInfo.hid);
            const chaptersReadCollectionRef = collection(comicReadDocRef, 'chaptersRead');
            const chapterReadDocRef = doc(chaptersReadCollectionRef, chapterHid);

            await setDoc(chapterReadDocRef, {
                readAt: new Date(),
                chap: chapterChap
            });

            // Actualizar último capítulo leído
            await setDoc(comicReadDocRef, {
                lastReadChapter: {
                    chap: chapterChap,
                    hid: chapterHid,
                    readAt: new Date(),
                },
                comicTitle: comicInfo.title,
                coverUrl: comicInfo.cover_url, // 👈 usar cover_url
                slug: comicInfo.hid,
            }, { merge: true });

            console.log(comicInfo);

            // Agregar/actualizar en inProgressManga
            await addMangaToInProgress(comicInfo.hid, comicInfo.title, chapterHid, chapterChap, comicInfo.cover_url);

            console.log('Capítulo marcado como leído y progreso guardado:', chapterHid);

        } catch (error) {
            console.error('Error marcando capítulo como leído:', error);
        }
    }, [plan, addMangaToInProgress]);

    useEffect(() => {
        startTimeRef.current = Date.now();
        return () => {
            const duration = Date.now() - startTimeRef.current;
            if (duration > 1000) saveReadingTimeToFirestore(duration);
        };
    }, [currentHid, saveReadingTimeToFirestore]);

    // En fetchChapterData, actualiza la llamada a markChapterAsRead:
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

                // Marcar automáticamente como leído al cargar el capítulo
                if (plan === 'premium' && data.chapter?.chap) {
                    markChapterAsRead(currentHid, data.chapter.chap);
                }

                imgs.slice(0, 3).forEach((img: any) => Image.prefetch(img.url));
            } else {
                alertError("No se encontraron imágenes para este capítulo.");
            }
        } catch (error: any) {
            console.error('Error fetching chapter data:', error);
            alertError(`No se pudo cargar el capítulo: ${error.message || 'Error desconocido'}`);
        } finally {
            setLoadingChapter(false);
            flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
    }, [currentHid, controlsOpacity, plan, markChapterAsRead, alertError]);

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