import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AppState,
    AppStateStatus,
    View,
    Text,
    Image as RNImage,
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
import { collection, doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { useAlertContext } from '../contexts/AlertContext';
import { backendUrl } from '../config/backend';
import {
    recordReadingTime,
    recordReadingTimeAndSyncAchievements,
    syncFullMangaReadState,
} from '../services/readingStatsService';

const { width: screenWidth } = Dimensions.get('window');
const { height: screenHeight } = Dimensions.get('window');
const REQUEST_TIMEOUT_MS = 8000;
const AUTO_HIDE_DELAY = 4500;
const IMAGE_PREFETCH_WINDOW = 6;
const INITIAL_IMAGE_WARM_COUNT = 7;
const READING_SYNC_INTERVAL_MS = 60000;
const MIN_READING_SYNC_MS = 10000;
const PROGRESS_SAVE_DEBOUNCE_MS = 900;
const RESUME_SCROLL_DELAY_MS = 180;
const CHAPTER_PREFETCH_AHEAD = 1;
const VERTICAL_END_THRESHOLD_PX = 48;

const AD_UNIT_ID = __DEV__ ? TestIds.BANNER : 'ca-app-pub-6584977537844104/1888694522';
MobileAds().initialize();

type ReaderImage = {
    id: string;
    url: string;
    page: number;
    w: number;
    h: number;
    hasIntrinsicSize: boolean;
};

type ChapterMeta = {
    slug: string;
    chapterSlug: string;
    title?: string;
    number?: string;
};

type SavedReadingPosition = {
    imageIndex: number;
    imagePage: number;
    scrollOffset?: number;
};

type ChapterBundle = {
    compositeSlug: string;
    images: ReaderImage[];
    chapterTitle: string;
    currentChapter: ChapterMeta | null;
    nextCompositeSlug: string | null;
    prevCompositeSlug: string | null;
    chapterIndex: number;
    totalChapters: number;
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

const LEGACY_SOURCE_MAP: Record<string, string> = {
    lectormangaa: 'manhwaonline',
};

const normalizeMangaToken = (rawToken: string) => {
    const token = String(rawToken || '').trim();
    if (!token) return '';

    const normalized = token.replace(/^lectormangaa__/i, 'manhwaonline__');
    if (normalized.includes('__')) {
        const [source, ...rest] = normalized.split('__');
        const mappedSource = LEGACY_SOURCE_MAP[source.toLowerCase()] || source.toLowerCase();
        return `${mappedSource}__${rest.join('__')}`;
    }

    const legacyIdx = normalized.indexOf(':');
    if (legacyIdx > 0) {
        const source = normalized.slice(0, legacyIdx).toLowerCase();
        const slug = normalized.slice(legacyIdx + 1);
        if (slug) {
            const mappedSource = LEGACY_SOURCE_MAP[source] || source;
            return `${mappedSource}__${slug}`;
        }
    }

    return normalized;
};

const normalizeCompositeSlug = (rawComposite: string) => {
    const raw = String(rawComposite || '').trim();
    if (!raw) return '';

    if (raw.includes('/')) {
        const idx = raw.indexOf('/');
        const mangaToken = normalizeMangaToken(raw.slice(0, idx));
        const chapterSlug = raw.slice(idx + 1);
        return mangaToken && chapterSlug ? `${mangaToken}/${chapterSlug}` : raw;
    }

    // Legacy fallback: source:slug:chapter
    const parts = raw.split(':');
    if (parts.length >= 3) {
        const source = parts.shift() || '';
        const chapterSlug = parts.pop() || '';
        const slug = parts.join(':');
        if (source && slug && chapterSlug) {
            return `${normalizeMangaToken(`${source}:${slug}`)}/${chapterSlug}`;
        }
    }

    return raw;
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
    const initialRatio = useMemo(() => {
        if (item.hasIntrinsicSize && item.w > 0 && item.h > 0) {
            return item.h / item.w;
        }
        return null;
    }, [item.hasIntrinsicSize, item.w, item.h]);
    const [ratio, setRatio] = useState<number | null>(initialRatio);
    const height = useMemo(() => {
        if (!ratio || !Number.isFinite(ratio) || ratio <= 0) {
            return 24;
        }
        return Math.max(1, screenWidth * ratio);
    }, [ratio]);
    const adjustedRatioRef = useRef(false);

    useEffect(() => {
        setRatio(initialRatio);
        adjustedRatioRef.current = false;

        if (item.hasIntrinsicSize) {
            return;
        }

        let active = true;
        RNImage.getSize(
            item.url,
            (loadedWidth, loadedHeight) => {
                if (!active) return;
                if (loadedWidth <= 0 || loadedHeight <= 0) return;

                adjustedRatioRef.current = true;
                setRatio(loadedHeight / loadedWidth);
            },
            () => {
                // Leave the minimal placeholder height until expo-image reports dimensions.
            }
        );

        return () => {
            active = false;
        };
    }, [item.url, initialRatio, item.hasIntrinsicSize]);

    const handleImageLoad = useCallback((event: any) => {
        if (item.hasIntrinsicSize) return;
        if (adjustedRatioRef.current) return;

        const loadedWidth = Number(event?.source?.width || 0);
        const loadedHeight = Number(event?.source?.height || 0);
        if (loadedWidth <= 0 || loadedHeight <= 0) return;

        const loadedRatio = loadedHeight / loadedWidth;
        // Avoid frequent relayouts while scrolling; only correct if clearly off.
        if (!ratio || Math.abs(loadedRatio - ratio) > 0.02) {
            setRatio(loadedRatio);
            adjustedRatioRef.current = true;
        }
    }, [item.hasIntrinsicSize, ratio]);

    return (
        <View style={styles.imageContainer}>
            <Image
                source={{ uri: item.url }}
                style={{ width: screenWidth, height }}
                contentFit="cover"
                transition={0}
                cachePolicy="memory-disk"
                recyclingKey={item.url}
                priority={index < 4 ? 'high' : 'normal'}
                onLoad={handleImageLoad}
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

    const [currentCompositeSlug, setCurrentCompositeSlug] = useState(() => normalizeCompositeSlug(initialCompositeSlug));
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
    const [currentChapterMeta, setCurrentChapterMeta] = useState<ChapterMeta | null>(null);

    const flashListRef = useRef<any>(null);
    const controlsOpacity = useRef(new Animated.Value(1)).current;
    const autoHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prefetchedUrlsRef = useRef<Set<string>>(new Set());
    const imagesRef = useRef<ReaderImage[]>([]);
    const prefetchInFlightRef = useRef(false);
    const lastPrefetchStartRef = useRef(-1);
    const chapterSwitchInProgressRef = useRef(false);
    const readingSessionStartedAtRef = useRef<number | null>(null);
    const readingSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isReaderFocusedRef = useRef(false);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const currentVisibleImageIndexRef = useRef(0);
    const currentScrollOffsetRef = useRef(0);
    const pendingResumeIndexRef = useRef<number | null>(null);
    const pendingResumeOffsetRef = useRef<number | null>(null);
    const shouldResumeFromProgressRef = useRef(readerParams.resumeFromProgress === true);
    const progressSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedProgressKeyRef = useRef('');
    const mangaDataCacheRef = useRef<any | null>(null);
    const chapterBundleCacheRef = useRef<Map<string, ChapterBundle>>(new Map());
    const sessionChapterProgressRef = useRef<Map<string, SavedReadingPosition>>(new Map());
    const verticalAdvanceTriggeredRef = useRef(false);

    const parsed = useMemo(() => parseComposite(currentCompositeSlug), [currentCompositeSlug]);

    useEffect(() => {
        imagesRef.current = images;
    }, [images]);

    const warmImageUrls = useCallback(async (urls: string[]) => {
        const pending = urls.filter(Boolean).filter((url) => {
            if (prefetchedUrlsRef.current.has(url)) return false;
            prefetchedUrlsRef.current.add(url);
            return true;
        });

        if (!pending.length) return;
        await Promise.all(pending.map((url) => Image.prefetch(url)));
    }, []);

    const getMangaData = useCallback(async () => {
        if (mangaDataCacheRef.current) {
            return mangaDataCacheRef.current;
        }

        const mangaData = await fetchJsonWithTimeout(backendUrl(`/manga/${encodeURIComponent(parsed.mangaSlug)}`));
        mangaDataCacheRef.current = mangaData;
        return mangaData;
    }, [parsed.mangaSlug]);

    const buildChapterBundle = useCallback((compositeSlug: string, imagesData: any, mangaData: any): ChapterBundle => {
        const composite = parseComposite(compositeSlug);
        const duplicateCount = new Map<string, number>();
        const imgs: ReaderImage[] = (imagesData.images || []).reduce((acc: ReaderImage[], img: any, idx: number) => {
            const url = String(img?.url || '').trim();
            if (!url) return acc;

            const page = Number(img.page || idx + 1);
            const baseKey = `${page}:${url}`;
            const seen = duplicateCount.get(baseKey) || 0;
            duplicateCount.set(baseKey, seen + 1);

            acc.push({
                id: `${composite.chapterSlug}:${idx}:${seen}:${baseKey}`,
                url,
                page,
                w: Number(img.w || 800),
                h: Number(img.h || 1200),
                hasIntrinsicSize: Number(img.w || 0) > 0 && Number(img.h || 0) > 0,
            });

            return acc;
        }, []);

        const chapters: ChapterMeta[] = (mangaData.manga?.chapters || []).map((ch: any) => ({
            slug: ch.slug,
            chapterSlug: ch.chapterSlug,
            title: ch.title || '',
            number: ch.number || '',
        }));

        const currentIndex = chapters.findIndex((ch) => ch.chapterSlug === composite.chapterSlug);
        const currentChapter = currentIndex >= 0 ? chapters[currentIndex] : null;
        const nextChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
        const prevChapter = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

        return {
            compositeSlug,
            images: imgs,
            chapterTitle: currentChapter ? `Cap. ${currentChapter.number || ''} ${currentChapter.title || ''}`.trim() : 'Capitulo',
            currentChapter,
            nextCompositeSlug: nextChapter?.slug || null,
            prevCompositeSlug: prevChapter?.slug || null,
            chapterIndex: currentIndex,
            totalChapters: chapters.length,
        };
    }, []);

    const fetchChapterBundle = useCallback(async (compositeSlug: string, options?: { forceRefresh?: boolean }) => {
        const normalizedCompositeSlug = normalizeCompositeSlug(compositeSlug);
        if (!options?.forceRefresh) {
            const cachedBundle = chapterBundleCacheRef.current.get(normalizedCompositeSlug);
            if (cachedBundle) {
                return cachedBundle;
            }
        }

        const composite = parseComposite(normalizedCompositeSlug);
        const [imagesData, mangaData] = await Promise.all([
            fetchJsonWithTimeout(backendUrl(`/chapter/${encodeURIComponent(composite.mangaSlug)}/${encodeURIComponent(composite.chapterSlug)}/images`)),
            getMangaData(),
        ]);
        const bundle = buildChapterBundle(normalizedCompositeSlug, imagesData, mangaData);
        if (!bundle.images.length) {
            throw new Error('No se encontraron imagenes para este capitulo.');
        }

        chapterBundleCacheRef.current.set(normalizedCompositeSlug, bundle);
        return bundle;
    }, [buildChapterBundle, getMangaData]);

    const prefetchAdjacentChapters = useCallback(async (bundle: ChapterBundle) => {
        const compositesToPrefetch = [bundle.nextCompositeSlug, bundle.prevCompositeSlug]
            .filter(Boolean)
            .slice(0, CHAPTER_PREFETCH_AHEAD * 2) as string[];

        await Promise.all(compositesToPrefetch.map(async (compositeSlug) => {
            if (chapterBundleCacheRef.current.has(compositeSlug)) {
                return;
            }
            try {
                const prefetchedBundle = await fetchChapterBundle(compositeSlug);
                await warmImageUrls(prefetchedBundle.images.slice(0, 3).map((img) => img.url));
            } catch {
                // ignore prefetch errors
            }
        }));
    }, [fetchChapterBundle, warmImageUrls]);

    const persistReadingPosition = useCallback(async (imageIndex?: number) => {
        const user = auth.currentUser;
        if (!user || plan !== 'premium' || !parsed.mangaSlug || !currentChapterMeta || !imagesRef.current.length) {
            return;
        }

        const safeIndex = Math.max(0, Math.min(
            Number.isFinite(imageIndex as number) ? Number(imageIndex) : currentVisibleImageIndexRef.current,
            imagesRef.current.length - 1,
        ));
        const currentImage = imagesRef.current[safeIndex];
        if (!currentImage) return;

        const scrollOffset = Math.max(0, currentScrollOffsetRef.current || 0);
        sessionChapterProgressRef.current.set(currentCompositeSlug, {
            imageIndex: safeIndex,
            imagePage: currentImage.page,
            scrollOffset,
        });

        const progressKey = [
            parsed.mangaSlug,
            currentChapterMeta.slug,
            safeIndex,
            currentImage.page,
            Math.round(scrollOffset),
        ].join(':');

        if (lastSavedProgressKeyRef.current === progressKey) {
            return;
        }

        lastSavedProgressKeyRef.current = progressKey;

        const comicReadDocRef = doc(db, 'users', user.uid, 'readComics', parsed.mangaSlug);
        const inProgressDocRef = doc(db, 'users', user.uid, 'inProgressManga', parsed.mangaSlug);
        const batch = writeBatch(db);

        const lastReadChapterData = {
            slug: currentChapterMeta.slug,
            chapterSlug: currentChapterMeta.chapterSlug,
            number: currentChapterMeta.number || '',
            title: currentChapterMeta.title || '',
            imageIndex: safeIndex,
            imagePage: currentImage.page,
            scrollOffset,
            imageUrl: currentImage.url,
            readAt: serverTimestamp(),
        };

        batch.set(comicReadDocRef, {
            slug: parsed.mangaSlug,
            lastReadChapter: lastReadChapterData,
        }, { merge: true });

        batch.set(inProgressDocRef, {
            slug: parsed.mangaSlug,
            lastReadChapterHid: currentChapterMeta.slug,
            lastReadChapterSlug: currentChapterMeta.chapterSlug,
            lastReadChapterNumber: currentChapterMeta.number || '',
            lastReadImageIndex: safeIndex,
            lastReadImagePage: currentImage.page,
            lastReadScrollOffset: scrollOffset,
            lastReadImageUrl: currentImage.url,
            lastUpdated: serverTimestamp(),
        }, { merge: true });

        await batch.commit();
    }, [currentChapterMeta, currentCompositeSlug, parsed.mangaSlug, plan]);

    const scheduleProgressSave = useCallback((imageIndex?: number) => {
        if (progressSaveTimeoutRef.current) {
            clearTimeout(progressSaveTimeoutRef.current);
        }

        progressSaveTimeoutRef.current = setTimeout(() => {
            persistReadingPosition(imageIndex).catch(() => {
                // silently ignored to avoid interrupting reading
            });
        }, PROGRESS_SAVE_DEBOUNCE_MS);
    }, [persistReadingPosition]);

    const flushReadingTime = useCallback(async () => {
        const startedAt = readingSessionStartedAtRef.current;
        const user = auth.currentUser;
        if (!startedAt || !user) {
            readingSessionStartedAtRef.current = user ? Date.now() : null;
            return;
        }

        const elapsedMs = Date.now() - startedAt;
        readingSessionStartedAtRef.current = Date.now();

        if (elapsedMs < MIN_READING_SYNC_MS) return;

        try {
            await recordReadingTime(user.uid, elapsedMs);
        } catch {
            // silently ignored to avoid interrupting reading
        }
    }, []);

    const resumeReadingSession = useCallback(() => {
        if (!auth.currentUser) return;
        readingSessionStartedAtRef.current = Date.now();
    }, []);

    useFocusEffect(
        useCallback(() => {
            isReaderFocusedRef.current = true;
            NativeModules.ImmersiveModule?.hideNavigationBar?.();
            StatusBar.setHidden(true, 'slide');

            resumeReadingSession();
            readingSyncIntervalRef.current = setInterval(() => {
                flushReadingTime();
            }, READING_SYNC_INTERVAL_MS);

            return () => {
                isReaderFocusedRef.current = false;
                if (readingSyncIntervalRef.current) {
                    clearInterval(readingSyncIntervalRef.current);
                    readingSyncIntervalRef.current = null;
                }
                const user = auth.currentUser;
                const remainingMs = Math.max(Date.now() - (readingSessionStartedAtRef.current || Date.now()), 0);
                if (user && remainingMs >= MIN_READING_SYNC_MS) {
                    recordReadingTimeAndSyncAchievements(user.uid, remainingMs).catch(() => {
                        // silently ignored to avoid interrupting reading
                    });
                }
                readingSessionStartedAtRef.current = null;
                NativeModules.ImmersiveModule?.showNavigationBar?.();
                StatusBar.setHidden(false, 'slide');
            };
        }, [flushReadingTime, resumeReadingSession])
    );

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            const previousAppState = appStateRef.current;
            appStateRef.current = nextAppState;

            if (!isReaderFocusedRef.current) return;

            if (previousAppState === 'active' && nextAppState.match(/inactive|background/)) {
                if (progressSaveTimeoutRef.current) {
                    clearTimeout(progressSaveTimeoutRef.current);
                    progressSaveTimeoutRef.current = null;
                }
                persistReadingPosition().catch(() => {
                    // silently ignored to avoid interrupting reading
                });
                flushReadingTime();
                readingSessionStartedAtRef.current = null;
            }

            if (nextAppState === 'active' && !readingSessionStartedAtRef.current) {
                resumeReadingSession();
            }
        });

        return () => {
            subscription.remove();
        };
    }, [flushReadingTime, persistReadingPosition, resumeReadingSession]);

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

        const cachedBundle = chapterBundleCacheRef.current.get(currentCompositeSlug);
        setLoadingChapter(!cachedBundle);
        setImages([]);
        setCurrentChapterMeta(null);

        try {
            const bundle = cachedBundle || await fetchChapterBundle(currentCompositeSlug);
            const mangaData = await getMangaData();
            const imgs = bundle.images;

            prefetchedUrlsRef.current.clear();
            lastPrefetchStartRef.current = -1;
            await warmImageUrls(imgs.slice(0, INITIAL_IMAGE_WARM_COUNT).map((img) => img.url));
            let resumePosition: SavedReadingPosition | null = null;
            const sessionProgress = sessionChapterProgressRef.current.get(currentCompositeSlug) || null;

            if (shouldResumeFromProgressRef.current) {
                const user = auth.currentUser;
                if (user && bundle.currentChapter?.slug) {
                    const progressSnap = await getDoc(doc(db, 'users', user.uid, 'readComics', parsed.mangaSlug));
                    if (progressSnap.exists()) {
                        const savedLastRead = progressSnap.data()?.lastReadChapter;
                        const savedSlug = String(savedLastRead?.slug || '').trim();
                        const savedImageIndex = Number(savedLastRead?.imageIndex);
                        const savedImagePage = Number(savedLastRead?.imagePage);
                        const savedScrollOffset = Number(savedLastRead?.scrollOffset);

                        if (savedSlug && savedSlug === bundle.currentChapter.slug) {
                            resumePosition = {
                                imageIndex: Number.isFinite(savedImageIndex) ? savedImageIndex : 0,
                                imagePage: Number.isFinite(savedImagePage) ? savedImagePage : 1,
                                scrollOffset: Number.isFinite(savedScrollOffset) ? savedScrollOffset : undefined,
                            };
                        }
                    }
                }
                shouldResumeFromProgressRef.current = false;
            } else if (sessionProgress) {
                resumePosition = sessionProgress;
            }

            if (plan === 'premium' && bundle.currentChapter?.slug) {
                const user = auth.currentUser;
                if (user) {
                    const mangaInfo = mangaData?.manga || {};
                    const comicReadDocRef = doc(db, 'users', user.uid, 'readComics', parsed.mangaSlug);
                    const safeChapterId = String(bundle.currentChapter.chapterSlug || bundle.currentChapter.slug || '').trim();
                    if (!safeChapterId) {
                        throw new Error('No se pudo determinar el chapterSlug para guardar progreso.');
                    }
                    const chapterReadDocRef = doc(collection(comicReadDocRef, 'chaptersRead'), safeChapterId);
                    const inProgressDocRef = doc(db, 'users', user.uid, 'inProgressManga', parsed.mangaSlug);

                    await Promise.all([
                        setDoc(chapterReadDocRef, {
                            chapterSlug: safeChapterId,
                            slug: bundle.currentChapter.slug,
                            number: bundle.currentChapter.number || '',
                            title: bundle.currentChapter.title || '',
                            readAt: serverTimestamp(),
                        }, { merge: true }),
                        setDoc(comicReadDocRef, {
                            comicTitle: mangaInfo.title || parsed.mangaSlug,
                            coverUrl: mangaInfo.cover || '',
                            slug: parsed.mangaSlug,
                            isFullMangaRead: false,
                            lastReadChapter: {
                                slug: bundle.currentChapter.slug,
                                chapterSlug: safeChapterId,
                                number: bundle.currentChapter.number || '',
                                title: bundle.currentChapter.title || '',
                                readAt: serverTimestamp(),
                            },
                        }, { merge: true }),
                        setDoc(inProgressDocRef, {
                            mangaTitle: mangaInfo.title || parsed.mangaSlug,
                            coverUrl: mangaInfo.cover || '',
                            slug: parsed.mangaSlug,
                            source: mangaInfo.source || '',
                            lastReadChapterHid: bundle.currentChapter.slug,
                            lastReadChapterSlug: bundle.currentChapter.slug,
                            lastReadChapterNumber: bundle.currentChapter.number || '',
                            lastUpdated: serverTimestamp(),
                            startedAt: serverTimestamp(),
                        }, { merge: true }),
                    ]);

                    await syncFullMangaReadState(
                        user.uid,
                        parsed.mangaSlug,
                        (mangaData.manga?.chapters || []).map((chapter: any) => chapter.chapterSlug || chapter.slug),
                        {
                            comicTitle: mangaInfo.title || parsed.mangaSlug,
                            coverUrl: mangaInfo.cover || '',
                            slug: parsed.mangaSlug,
                        },
                    );
                }
            }

            setChapterTitle(bundle.chapterTitle);
            setCurrentChapterMeta(bundle.currentChapter ? {
                slug: bundle.currentChapter.slug,
                chapterSlug: bundle.currentChapter.chapterSlug,
                title: bundle.currentChapter.title || '',
                number: bundle.currentChapter.number || '',
            } : null);
            setChapterIndex(bundle.chapterIndex);
            setTotalChapters(bundle.totalChapters);
            setNextCompositeSlug(bundle.nextCompositeSlug);
            setPrevCompositeSlug(bundle.prevCompositeSlug);
            setImages(imgs);
            currentVisibleImageIndexRef.current = resumePosition
                ? Math.max(0, Math.min(resumePosition.imageIndex, imgs.length - 1))
                : 0;
            currentScrollOffsetRef.current = resumePosition?.scrollOffset || 0;
            pendingResumeIndexRef.current = currentVisibleImageIndexRef.current;
            pendingResumeOffsetRef.current = typeof resumePosition?.scrollOffset === 'number' ? resumePosition.scrollOffset : null;
            lastSavedProgressKeyRef.current = '';
            verticalAdvanceTriggeredRef.current = false;
            prefetchImages(imgs, INITIAL_IMAGE_WARM_COUNT);
            prefetchAdjacentChapters(bundle).catch(() => {
                // ignore background prefetch errors
            });
        } catch (error: any) {
            alertError(error.message || 'No se pudo cargar el capitulo.');
        } finally {
            setLoadingChapter(false);
        }
    }, [alertError, currentCompositeSlug, fetchChapterBundle, getMangaData, parsed.mangaSlug, prefetchAdjacentChapters, prefetchImages, plan, warmImageUrls]);

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
            if (progressSaveTimeoutRef.current) clearTimeout(progressSaveTimeoutRef.current);
        };
    }, [resetAutoHide]);

    useEffect(() => {
        if (loadingChapter || !images.length || pendingResumeIndexRef.current == null) {
            return;
        }

        const targetIndex = Math.max(0, Math.min(pendingResumeIndexRef.current, images.length - 1));
        const targetOffset = pendingResumeOffsetRef.current;
        const timeoutId = setTimeout(() => {
            try {
                if (typeof targetOffset === 'number' && targetOffset > 0) {
                    flashListRef.current?.scrollToOffset?.({ offset: targetOffset, animated: false });
                } else {
                    flashListRef.current?.scrollToIndex?.({ index: targetIndex, animated: false, viewPosition: 0 });
                }
            } catch {
                flashListRef.current?.scrollToOffset?.({ offset: 0, animated: false });
            }
            pendingResumeIndexRef.current = null;
            pendingResumeOffsetRef.current = null;
        }, RESUME_SCROLL_DELAY_MS);

        return () => clearTimeout(timeoutId);
    }, [images, loadingChapter]);

    const changeChapter = (compositeSlug: string | null) => {
        if (!compositeSlug) return;
        if (progressSaveTimeoutRef.current) {
            clearTimeout(progressSaveTimeoutRef.current);
            progressSaveTimeoutRef.current = null;
        }
        persistReadingPosition(currentVisibleImageIndexRef.current).catch(() => {
            // silently ignored to avoid interrupting reading
        });
        setCurrentCompositeSlug(normalizeCompositeSlug(compositeSlug));
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
        if (verticalAdvanceTriggeredRef.current) return;

        verticalAdvanceTriggeredRef.current = true;
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

    const renderImageItem = useCallback(({ item, index }: { item: ReaderImage; index: number }) => {
        return <ReaderImageItem item={item} index={index} />;
    }, []);

    const handleViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
        const minVisibleIndex = viewableItems.reduce((acc, it) => {
            if (it.index == null) return acc;
            if (acc === -1) return it.index;
            return Math.min(acc, it.index);
        }, -1);
        const maxVisibleIndex = viewableItems.reduce((acc, it) => {
            if (it.index == null) return acc;
            return Math.max(acc, it.index);
        }, -1);

        if (minVisibleIndex >= 0) {
            currentVisibleImageIndexRef.current = minVisibleIndex;
            scheduleProgressSave(minVisibleIndex);
        }

        if (maxVisibleIndex >= 0) {
            prefetchImages(imagesRef.current, maxVisibleIndex + 1);
        }
    }).current;

    const handleScroll = useCallback((event: any) => {
        const offsetY = Number(event?.nativeEvent?.contentOffset?.y || 0);
        const layoutHeight = Number(event?.nativeEvent?.layoutMeasurement?.height || 0);
        const contentHeight = Number(event?.nativeEvent?.contentSize?.height || 0);

        currentScrollOffsetRef.current = Math.max(0, offsetY);

        if (chapterChangeMode !== 'vertical' || loadingChapter || !nextCompositeSlug || chapterSwitchInProgressRef.current) {
            return;
        }

        const distanceToEnd = contentHeight - (offsetY + layoutHeight);
        if (distanceToEnd <= VERTICAL_END_THRESHOLD_PX && maxSafeIndex(imagesRef.current.length - 1) === currentVisibleImageIndexRef.current) {
            handleVerticalEndReached();
            return;
        }

        if (distanceToEnd > VERTICAL_END_THRESHOLD_PX * 4) {
            verticalAdvanceTriggeredRef.current = false;
        }
    }, [chapterChangeMode, handleVerticalEndReached, loadingChapter, nextCompositeSlug]);

    const maxSafeIndex = (value: number) => Math.max(0, value);

    return (
        <View style={styles.container}>
            <StatusBar hidden={true} translucent backgroundColor="transparent" barStyle="light-content" />

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
                                keyExtractor={(item) => item.id}
                                renderItem={renderImageItem}
                                showsVerticalScrollIndicator={false}
                                removeClippedSubviews={true}
                                onScrollBeginDrag={hudLocked ? undefined : showAndResetControls}
                                onMomentumScrollBegin={hudLocked ? undefined : showAndResetControls}
                                drawDistance={screenHeight * 1.15}
                                getItemType={() => 0}
                                maxItemsInRecyclePool={22}
                                maintainVisibleContentPosition={{ disabled: true }}
                                onViewableItemsChanged={handleViewableItemsChanged}
                                onScroll={handleScroll}
                                viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
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
                        keyExtractor={(item) => item.id}
                        renderItem={renderImageItem}
                        showsVerticalScrollIndicator={false}
                        removeClippedSubviews={true}
                        onScrollBeginDrag={hudLocked ? undefined : showAndResetControls}
                        onMomentumScrollBegin={hudLocked ? undefined : showAndResetControls}
                        drawDistance={screenHeight * 1.15}
                        getItemType={() => 0}
                        maxItemsInRecyclePool={22}
                        maintainVisibleContentPosition={{ disabled: true }}
                        onViewableItemsChanged={handleViewableItemsChanged}
                        onScroll={handleScroll}
                        viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
                        scrollEventThrottle={16}
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
