import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    StyleSheet,
    Dimensions,
    TouchableOpacity,
    StatusBar,
    Animated,
    RefreshControl,
    NativeModules,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { BannerAd, BannerAdSize, MobileAds, TestIds } from 'react-native-google-mobile-ads';
import { FlingGestureHandler, Directions, State } from 'react-native-gesture-handler';
import { auth, db } from '../firebase/config';
import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAlertContext } from '../contexts/AlertContext';
import { backendUrl } from '../config/backend';

const { width: screenWidth } = Dimensions.get('window');
const { height: screenHeight } = Dimensions.get('window');
const REQUEST_TIMEOUT_MS = 8000;
const AUTO_HIDE_DELAY = 4500;
const IMAGE_PREFETCH_WINDOW = 2;

const AD_UNIT_ID = __DEV__ ? TestIds.BANNER : 'ca-app-pub-6584977537844104/1888694522';
MobileAds().initialize();

type ReaderImage = {
    id: string;
    url: string;
    page: number;
    w: number;
    h: number;
};

type ChapterMeta = {
    slug: string;
    chapterSlug: string;
    title?: string;
    number?: string;
};

type ChapterChangeMode = 'horizontal' | 'vertical';

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

const parseComposite = (compositeSlug: string) => {
    const idx = String(compositeSlug || '').indexOf('/');
    if (idx === -1) return { mangaSlug: '', chapterSlug: '' };
    return {
        mangaSlug: compositeSlug.slice(0, idx),
        chapterSlug: compositeSlug.slice(idx + 1),
    };
};

const ReaderImageItem = React.memo(({ item, index }: { item: ReaderImage; index: number }) => {
    const initialRatio = item.w > 0 ? (item.h / item.w) : (1200 / 800);
    const [ratio, setRatio] = useState(initialRatio);
    const height = screenWidth * ratio;

    useEffect(() => {
        setRatio(initialRatio);
    }, [initialRatio, item.url]);

    return (
        <View style={styles.imageContainer}>
            <Image
                source={{ uri: item.url }}
                style={{ width: screenWidth, height }}
                contentFit="contain"
                transition={0}
                cachePolicy="disk"
                recyclingKey={item.url}
                priority={index < 4 ? 'high' : 'normal'}
                onLoad={(event) => {
                    const width = Number(event?.source?.width || 0);
                    const imageHeight = Number(event?.source?.height || 0);
                    if (width > 0 && imageHeight > 0) {
                        setRatio(imageHeight / width);
                    }
                }}
            />
        </View>
    );
});

const ReaderScreen = () => {
    const route = useRoute();
    const navigation = useNavigation<any>();
    const readerParams = (route.params ?? {}) as RootStackParamList['Reader'];
    const { hid: initialCompositeSlug } = readerParams;

    const { alertError } = useAlertContext();
    const insets = useSafeAreaInsets();

    const [currentCompositeSlug, setCurrentCompositeSlug] = useState(initialCompositeSlug);
    const [images, setImages] = useState<ReaderImage[]>([]);
    const [chapterTitle, setChapterTitle] = useState('Capitulo');
    const [loadingChapter, setLoadingChapter] = useState(true);
    const [nextCompositeSlug, setNextCompositeSlug] = useState<string | null>(null);
    const [prevCompositeSlug, setPrevCompositeSlug] = useState<string | null>(null);
    const [showControls, setShowControls] = useState(true);
    const [plan, setPlan] = useState<'free' | 'premium'>('free');
    const [chapterChangeMode, setChapterChangeMode] = useState<ChapterChangeMode>('horizontal');
    const [chapterIndex, setChapterIndex] = useState(-1);
    const [totalChapters, setTotalChapters] = useState(0);
    const [hudLocked, setHudLocked] = useState(false);
    const [prevChapterRefreshing, setPrevChapterRefreshing] = useState(false);

    const flashListRef = useRef<FlashList<ReaderImage>>(null);
    const controlsOpacity = useRef(new Animated.Value(1)).current;
    const autoHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prefetchedUrlsRef = useRef<Set<string>>(new Set());
    const imagesRef = useRef<ReaderImage[]>([]);
    const prefetchInFlightRef = useRef(false);
    const lastPrefetchStartRef = useRef(-1);
    const chapterSwitchInProgressRef = useRef(false);

    const parsed = useMemo(() => parseComposite(currentCompositeSlug), [currentCompositeSlug]);

    useEffect(() => {
        imagesRef.current = images;
    }, [images]);

    useFocusEffect(
        useCallback(() => {
            NativeModules.ImmersiveModule?.hideNavigationBar?.();
            return () => {
                NativeModules.ImmersiveModule?.showNavigationBar?.();
            };
        }, [])
    );

    useEffect(() => {
        const fetchUserReaderSettings = async () => {
            const user = auth.currentUser;
            if (!user) {
                setPlan('free');
                setChapterChangeMode('horizontal');
                return;
            }
            try {
                const snap = await getDoc(doc(db, 'users', user.uid));
                if (!snap.exists()) {
                    setPlan('free');
                    setChapterChangeMode('horizontal');
                    return;
                }

                const data = snap.data();
                setPlan(data?.accountType === 'premium' ? 'premium' : 'free');
                setChapterChangeMode(data?.chapterChangeMode === 'vertical' ? 'vertical' : 'horizontal');
            } catch {
                setPlan('free');
                setChapterChangeMode('horizontal');
            }
        };
        fetchUserReaderSettings();
    }, []);

    const prefetchImages = useCallback(async (imageList: ReaderImage[], startIndex: number, count: number = IMAGE_PREFETCH_WINDOW) => {
        if (prefetchInFlightRef.current) return;
        if (startIndex <= lastPrefetchStartRef.current) return;

        const batch = imageList.slice(startIndex, startIndex + count);
        const pending = batch
            .map((img) => img.url)
            .filter((url) => {
                if (prefetchedUrlsRef.current.has(url)) return false;
                prefetchedUrlsRef.current.add(url);
                return true;
            });

        if (!pending.length) {
            lastPrefetchStartRef.current = startIndex;
            return;
        }

        prefetchInFlightRef.current = true;
        try {
            await Promise.all(pending.map((url) => Image.prefetch(url)));
            lastPrefetchStartRef.current = startIndex;
        } finally {
            prefetchInFlightRef.current = false;
        }
    }, []);

    const loadChapterData = useCallback(async () => {
        if (!parsed.mangaSlug || !parsed.chapterSlug) {
            alertError('Slug de capitulo invalido.');
            setLoadingChapter(false);
            return;
        }

        setLoadingChapter(true);
        setImages([]);

        try {
            const [imagesData, mangaData] = await Promise.all([
                fetchJsonWithTimeout(backendUrl(`/chapter/${encodeURIComponent(parsed.mangaSlug)}/${encodeURIComponent(parsed.chapterSlug)}/images`)),
                fetchJsonWithTimeout(backendUrl(`/manga/${encodeURIComponent(parsed.mangaSlug)}`)),
            ]);

            const duplicateCount = new Map<string, number>();
            const imgs: ReaderImage[] = (imagesData.images || []).reduce((acc: ReaderImage[], img: any, idx: number) => {
                const url = String(img?.url || '').trim();
                if (!url) return acc;

                const page = Number(img.page || idx + 1);
                const baseKey = `${page}:${url}`;
                const seen = duplicateCount.get(baseKey) || 0;
                duplicateCount.set(baseKey, seen + 1);

                acc.push({
                    id: `${parsed.chapterSlug}:${idx}:${seen}:${baseKey}`,
                    url,
                    page,
                    w: Number(img.w || 800),
                    h: Number(img.h || 1200),
                });

                return acc;
            }, []);

            if (!imgs.length) {
                throw new Error('No se encontraron imagenes para este capitulo.');
            }

            const chapters: ChapterMeta[] = (mangaData.manga?.chapters || []).map((ch: any) => ({
                slug: ch.slug,
                chapterSlug: ch.chapterSlug,
                title: ch.title || '',
                number: ch.number || '',
            }));

            const currentIndex = chapters.findIndex((ch) => ch.chapterSlug === parsed.chapterSlug);
            const currentChapter = currentIndex >= 0 ? chapters[currentIndex] : null;
            const nextChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
            const prevChapter = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

            if (plan === 'premium' && currentChapter?.slug) {
                const user = auth.currentUser;
                if (user) {
                    const mangaInfo = mangaData?.manga || {};
                    const comicReadDocRef = doc(db, 'users', user.uid, 'readComics', parsed.mangaSlug);
                    const safeChapterId = String(currentChapter.chapterSlug || currentChapter.slug || '').trim();
                    if (!safeChapterId) {
                        throw new Error('No se pudo determinar el chapterSlug para guardar progreso.');
                    }
                    const chapterReadDocRef = doc(collection(comicReadDocRef, 'chaptersRead'), safeChapterId);
                    const inProgressDocRef = doc(db, 'users', user.uid, 'inProgressManga', parsed.mangaSlug);

                    await Promise.all([
                        setDoc(chapterReadDocRef, {
                            chapterSlug: safeChapterId,
                            slug: currentChapter.slug,
                            number: currentChapter.number || '',
                            title: currentChapter.title || '',
                            readAt: serverTimestamp(),
                        }, { merge: true }),
                        setDoc(comicReadDocRef, {
                            comicTitle: mangaInfo.title || parsed.mangaSlug,
                            coverUrl: mangaInfo.cover || '',
                            slug: parsed.mangaSlug,
                            isFullMangaRead: false,
                            lastReadChapter: {
                                slug: currentChapter.slug,
                                number: currentChapter.number || '',
                                readAt: serverTimestamp(),
                            },
                        }, { merge: true }),
                        setDoc(inProgressDocRef, {
                            mangaTitle: mangaInfo.title || parsed.mangaSlug,
                            coverUrl: mangaInfo.cover || '',
                            slug: parsed.mangaSlug,
                            source: mangaInfo.source || '',
                            lastReadChapterSlug: currentChapter.slug,
                            lastReadChapterNumber: currentChapter.number || '',
                            lastUpdated: serverTimestamp(),
                            startedAt: serverTimestamp(),
                        }, { merge: true }),
                    ]);
                }
            }

            setChapterTitle(currentChapter ? `Cap. ${currentChapter.number || ''} ${currentChapter.title || ''}`.trim() : 'Capitulo');
            setChapterIndex(currentIndex);
            setTotalChapters(chapters.length);
            setNextCompositeSlug(nextChapter?.slug || null);
            setPrevCompositeSlug(prevChapter?.slug || null);
            setImages(imgs);
            prefetchedUrlsRef.current.clear();
            lastPrefetchStartRef.current = -1;
            prefetchImages(imgs, 0);
            flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
        } catch (error: any) {
            alertError(error.message || 'No se pudo cargar el capitulo.');
        } finally {
            setLoadingChapter(false);
        }
    }, [parsed.mangaSlug, parsed.chapterSlug, alertError, prefetchImages, plan]);

    useEffect(() => {
        loadChapterData();
    }, [loadChapterData]);

    const resetAutoHide = useCallback(() => {
        if (autoHideTimeoutRef.current) clearTimeout(autoHideTimeoutRef.current);
        autoHideTimeoutRef.current = setTimeout(() => {
            Animated.timing(controlsOpacity, {
                toValue: 0,
                duration: 180,
                useNativeDriver: true,
            }).start(() => setShowControls(false));
        }, AUTO_HIDE_DELAY);
    }, [controlsOpacity]);

    const showAndResetControls = useCallback(() => {
        if (!showControls) {
            setShowControls(true);
            Animated.timing(controlsOpacity, {
                toValue: 1,
                duration: 180,
                useNativeDriver: true,
            }).start();
        }
        resetAutoHide();
    }, [controlsOpacity, resetAutoHide, showControls]);

    useEffect(() => {
        resetAutoHide();
        return () => {
            if (autoHideTimeoutRef.current) clearTimeout(autoHideTimeoutRef.current);
        };
    }, [resetAutoHide]);

    const changeChapter = (compositeSlug: string | null) => {
        if (!compositeSlug) return;
        setCurrentCompositeSlug(compositeSlug);
    };

    const handleSwipeLeft = useCallback(({ nativeEvent }: any) => {
        if (nativeEvent.state === State.END) {
            showAndResetControls();
            changeChapter(nextCompositeSlug);
        }
    }, [nextCompositeSlug, showAndResetControls]);

    const handleSwipeRight = useCallback(({ nativeEvent }: any) => {
        if (nativeEvent.state === State.END) {
            showAndResetControls();
            changeChapter(prevCompositeSlug);
        }
    }, [prevCompositeSlug, showAndResetControls]);

    const handleVerticalEndReached = useCallback(() => {
        if (chapterChangeMode !== 'vertical') return;
        if (loadingChapter) return;
        if (!nextCompositeSlug) return;
        if (chapterSwitchInProgressRef.current) return;

        chapterSwitchInProgressRef.current = true;
        showAndResetControls();
        changeChapter(nextCompositeSlug);
    }, [chapterChangeMode, loadingChapter, nextCompositeSlug, showAndResetControls]);

    const handlePullToPrevChapter = useCallback(() => {
        if (!prevCompositeSlug || chapterSwitchInProgressRef.current) return;
        chapterSwitchInProgressRef.current = true;
        setPrevChapterRefreshing(true);
        changeChapter(prevCompositeSlug);
    }, [prevCompositeSlug]);

    const handleHudToggle = useCallback(() => {
        if (hudLocked) {
            setHudLocked(false);
            showAndResetControls();
        } else {
            setHudLocked(true);
            if (autoHideTimeoutRef.current) clearTimeout(autoHideTimeoutRef.current);
            Animated.timing(controlsOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
                .start(() => setShowControls(false));
        }
    }, [hudLocked, controlsOpacity, showAndResetControls]);

    useEffect(() => {
        chapterSwitchInProgressRef.current = false;
        setPrevChapterRefreshing(false);
    }, [currentCompositeSlug]);

    const renderImageItem = useCallback(({ item, index }: { item: ReaderImage; index: number }) => <ReaderImageItem item={item} index={index} />, []);

    const handleViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
        const maxVisibleIndex = viewableItems.reduce((acc, it) => {
            if (it.index == null) return acc;
            return Math.max(acc, it.index);
        }, -1);

        if (maxVisibleIndex >= 0) {
            prefetchImages(imagesRef.current, maxVisibleIndex + 1);
        }
    }).current;

    return (
        <View style={styles.container}>
            <StatusBar translucent backgroundColor="transparent" barStyle="light-content" animated />

            {showControls && (
                <Animated.View style={[styles.topBar, { opacity: controlsOpacity, paddingTop: insets.top }]}>
                    <LinearGradient colors={['rgba(0,0,0,0.72)', 'transparent']} style={StyleSheet.absoluteFill} />
                    <View style={styles.topBarContent}>
                        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Volver">
                            <Ionicons name="arrow-back" size={28} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.chapterTitle} numberOfLines={1}>{chapterTitle}</Text>
                        <View style={styles.topBarSpacer} />
                    </View>
                </Animated.View>
            )}

            {loadingChapter && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#FF5555" />
                </View>
            )}

            {chapterChangeMode === 'horizontal' ? (
                <FlingGestureHandler direction={Directions.LEFT} onHandlerStateChange={handleSwipeLeft}>
                    <FlingGestureHandler direction={Directions.RIGHT} onHandlerStateChange={handleSwipeRight}>
                        <View style={styles.readerContent}>
                            <FlashList
                                key={currentCompositeSlug}
                                ref={flashListRef}
                                data={images}
                                estimatedItemSize={Math.max(520, screenHeight)}
                                keyExtractor={(item) => item.id}
                                renderItem={renderImageItem}
                                removeClippedSubviews
                                showsVerticalScrollIndicator={false}
                                onScrollBeginDrag={hudLocked ? undefined : showAndResetControls}
                                onMomentumScrollBegin={hudLocked ? undefined : showAndResetControls}
                                drawDistance={screenHeight}
                                onViewableItemsChanged={handleViewableItemsChanged}
                                viewabilityConfig={{ itemVisiblePercentThreshold: 15 }}
                                scrollEventThrottle={16}
                            />
                        </View>
                    </FlingGestureHandler>
                </FlingGestureHandler>
            ) : (
                <View style={styles.readerContent}>
                    <FlashList
                        key={currentCompositeSlug}
                        ref={flashListRef}
                        data={images}
                        estimatedItemSize={Math.max(520, screenHeight)}
                        keyExtractor={(item) => item.id}
                        renderItem={renderImageItem}
                        removeClippedSubviews
                        showsVerticalScrollIndicator={false}
                        onScrollBeginDrag={hudLocked ? undefined : showAndResetControls}
                        onMomentumScrollBegin={hudLocked ? undefined : showAndResetControls}
                        drawDistance={screenHeight}
                        onViewableItemsChanged={handleViewableItemsChanged}
                        viewabilityConfig={{ itemVisiblePercentThreshold: 15 }}
                        scrollEventThrottle={16}
                        onEndReached={handleVerticalEndReached}
                        onEndReachedThreshold={0.2}
                        refreshControl={
                            prevCompositeSlug ? (
                                <RefreshControl
                                    refreshing={prevChapterRefreshing}
                                    onRefresh={handlePullToPrevChapter}
                                    colors={['#FF5555']}
                                />
                            ) : undefined
                        }
                    />
                </View>
            )}

            {showControls && (
                <Animated.View style={[styles.bottomBar, { opacity: controlsOpacity, paddingBottom: insets.bottom + (plan === 'free' ? 62 : 6) }]}>
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.72)']} style={StyleSheet.absoluteFill} />
                    <View style={styles.bottomBarContent}>
                        {chapterIndex >= 0 && totalChapters > 0 && (
                            <Text style={styles.chapterCounter}>
                                {totalChapters - chapterIndex} / {totalChapters}
                            </Text>
                        )}
                        <TouchableOpacity onPress={handleHudToggle} style={styles.hudToggleBtn} accessibilityLabel="Ocultar controles">
                            <Ionicons name="eye-off-outline" size={20} color="rgba(255,255,255,0.65)" />
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            )}

            {hudLocked && (
                <TouchableOpacity
                    style={[styles.hudUnlockHint, { bottom: insets.bottom + (plan === 'free' ? 62 : 10) }]}
                    onPress={handleHudToggle}
                    activeOpacity={0.8}
                >
                    <View style={styles.hudUnlockBar} />
                </TouchableOpacity>
            )}

            {plan === 'free' && (
                <View style={[styles.bannerContainer, { bottom: insets.bottom + 5 }]}>
                    <BannerAd
                        unitId={AD_UNIT_ID}
                        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
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
        paddingHorizontal: 14,
        paddingBottom: 8,
    },
    topBarContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    chapterTitle: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
        flex: 1,
        marginHorizontal: 10,
        textAlign: 'center',
    },
    topBarSpacer: {
        width: 28,
        height: 28,
    },
    readerContent: {
        flex: 1,
    },
    imageContainer: {
        marginBottom: 0,
        backgroundColor: '#111',
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.75)',
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
    bottomBar: {
        position: 'absolute',
        width: '100%',
        bottom: 0,
        zIndex: 10,
        paddingTop: 36,
        paddingHorizontal: 16,
    },
    bottomBarContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    chapterCounter: {
        flex: 1,
        color: 'rgba(255,255,255,0.72)',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    hudToggleBtn: {
        padding: 8,
    },
    hudUnlockHint: {
        position: 'absolute',
        alignSelf: 'center',
        width: 48,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20,
    },
    hudUnlockBar: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.22)',
    },
});

export default ReaderScreen;
