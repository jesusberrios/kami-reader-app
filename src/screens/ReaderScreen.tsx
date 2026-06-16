import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AppState,
    AppStateStatus,
    Platform,
    View,
    Text,
    ActivityIndicator,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Animated,
    NativeModules,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BannerAd, BannerAdSize, MobileAds, TestIds } from 'react-native-google-mobile-ads';
import { auth, db } from '../firebase/config';
import { collection, doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { useAlertContext } from '../contexts/AlertContext';
import { BACKEND_URL, backendUrl } from '../config/backend';
import {
    awardReadingCoinAndSyncAchievements,
    recordReadingTime,
    recordReadingTimeAndSyncAchievements,
    syncFullMangaReadState,
} from '../services/readingStatsService';


const REQUEST_TIMEOUT_MS = 8000;
const AUTO_HIDE_DELAY = 4500;
const READING_SYNC_INTERVAL_MS = 60000;
const MIN_READING_SYNC_MS = 10000;
const PROGRESS_SAVE_DEBOUNCE_MS = 900;
const MAX_CHAPTER_BUNDLE_CACHE = 18;
const MIN_VERTICAL_SCROLL_TO_ARM_ADVANCE_PX = 72;
const PROD_WEB_READER_BASE_URL = 'https://suki-s-soft.github.io/sukisoft-web/reader';
const FORCED_WEB_READER_BASE_URL = process.env.EXPO_PUBLIC_WEB_READER_URL || '';
const LOCAL_WEB_READER_BASE_URL = process.env.EXPO_PUBLIC_WEB_READER_LOCAL_URL || '';

const resolveDevWebReaderBaseUrl = () => {
    const explicitLocal = String(LOCAL_WEB_READER_BASE_URL || '').trim();
    if (explicitLocal) return explicitLocal;

    try {
        const backend = new URL(String(BACKEND_URL || '').trim());
        const backendHost = String(backend.hostname || '').trim();
        if (backendHost) {
            return `http://${backendHost}:53613/reader`;
        }
    } catch {
        // Ignore and fallback to platform defaults.
    }

    if (Platform.OS === 'android') {
        return 'http://10.0.2.2:53613/reader';
    }

    return 'http://localhost:53613/reader';
};

const WEB_READER_BASE_URL = (
    FORCED_WEB_READER_BASE_URL ||
    (__DEV__ ? resolveDevWebReaderBaseUrl() : PROD_WEB_READER_BASE_URL)
).trim();

const AD_UNIT_ID = __DEV__ ? TestIds.BANNER : 'ca-app-pub-6584977537844104/1888694522';
MobileAds().initialize();

type ChapterMeta = {
    slug: string;
    chapterSlug: string;
    title?: string;
    number?: string;
};

type SavedReadingPosition = {
    imageIndex: number;
    scrollOffset?: number;
};

type ChapterBundle = {
    compositeSlug: string;
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
        if (!res.ok) {
            const status = Number(res.status || 0);
            if (status === 404) throw new Error('No se encontro el capitulo o las imagenes ya no estan disponibles.');
            if (status === 429) throw new Error('Demasiadas solicitudes. Intenta nuevamente en unos segundos.');
            if (status >= 500) throw new Error('El servidor esta tardando en responder. Intenta nuevamente.');
            throw new Error(`Error HTTP: ${status}`);
        }
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
    lectormangaa: 'manhwaweb',
    manhwaonline: 'manhwaweb',
};

const normalizeMangaToken = (rawToken: string) => {
    const token = String(rawToken || '').trim();
    if (!token) return '';

    const normalized = token
        .replace(/^lectormangaa__/i, 'manhwaweb__')
        .replace(/^manhwaonline__/i, 'manhwaweb__');
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

const buildWebReaderUrl = (
    mangaSlug: string,
    chapterSlug: string,
    options?: {
        chapterChangeMode?: ChapterChangeMode;
        resumeIndex?: number;
        resumeOffset?: number;
    },
) => {
    if (!mangaSlug || !chapterSlug) return null;

    const params = new URLSearchParams({
        backend: backendUrl(''),
        manga: mangaSlug,
        chapter: chapterSlug,
        mode: options?.chapterChangeMode || 'horizontal',
    });

    if (Number.isFinite(options?.resumeIndex) && Number(options?.resumeIndex) >= 0) {
        params.set('resumeIndex', String(Math.max(0, Number(options?.resumeIndex))));
    }

    if (Number.isFinite(options?.resumeOffset) && Number(options?.resumeOffset) > 0) {
        params.set('resumeOffset', String(Math.max(0, Math.round(Number(options?.resumeOffset)))));
    }
    console.log(`${WEB_READER_BASE_URL}#${params.toString()}`);
    
    return `${WEB_READER_BASE_URL}#${params.toString()}`;
};

const trimChapterBundleCache = (cache: Map<string, ChapterBundle>) => {
    if (cache.size <= MAX_CHAPTER_BUNDLE_CACHE) return;
    const overflow = cache.size - MAX_CHAPTER_BUNDLE_CACHE;
    const keys = cache.keys();
    for (let i = 0; i < overflow; i += 1) {
        const next = keys.next();
        if (next.done) break;
        cache.delete(next.value);
    }
};

const ReaderScreen = () => {
    const route = useRoute();
    const navigation = useNavigation<any>();
    const readerParams = (route.params ?? {}) as RootStackParamList['Reader'];
    const { hid: initialCompositeSlug } = readerParams;

    const { alertError } = useAlertContext();
    const insets = useSafeAreaInsets();

    const [currentCompositeSlug, setCurrentCompositeSlug] = useState(() => normalizeCompositeSlug(initialCompositeSlug));
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
    const [currentChapterMeta, setCurrentChapterMeta] = useState<ChapterMeta | null>(null);
    const [chapterLoadError, setChapterLoadError] = useState('');
    const [webViewUrl, setWebViewUrl] = useState<string | null>(null);

    const controlsOpacity = useRef(new Animated.Value(1)).current;
    const autoHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const chapterSwitchInProgressRef = useRef(false);
    const readingSessionStartedAtRef = useRef<number | null>(null);
    const readingSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isReaderFocusedRef = useRef(false);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const currentVisibleImageIndexRef = useRef(0);
    const currentMaxVisibleImageIndexRef = useRef(0);
    const currentScrollOffsetRef = useRef(0);
    const shouldResumeFromProgressRef = useRef(readerParams.resumeFromProgress === true);
    const progressSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedProgressKeyRef = useRef('');
    const mangaDataCacheRef = useRef<any | null>(null);
    const chapterBundleCacheRef = useRef<Map<string, ChapterBundle>>(new Map());
    const loadRequestIdRef = useRef(0);
    const sessionChapterProgressRef = useRef<Map<string, SavedReadingPosition>>(new Map());
    const verticalAdvanceTriggeredRef = useRef(false);
    const verticalAutoAdvanceArmedRef = useRef(false);

    const parsed = useMemo(() => parseComposite(currentCompositeSlug), [currentCompositeSlug]);

    const enterReaderImmersiveMode = useCallback(() => {
        NativeModules.ImmersiveModule?.hideNavigationBar?.();
        StatusBar.setHidden(true, 'slide');
    }, []);

    const exitReaderImmersiveMode = useCallback(() => {
        NativeModules.ImmersiveModule?.showNavigationBar?.();
        StatusBar.setHidden(false, 'slide');
    }, []);

    const handleWebViewShouldStart = useCallback((request: any) => {
        const current = String(webViewUrl || '').replace(/\/+$/, '');
        const next = String(request?.url || '').replace(/\/+$/, '');
        if (!current || !next) return false;
        if (next === current) return true;
        // Android strips the fragment (#hash) from request.url in shouldOverrideUrlLoading.
        // Allow the load if the base path matches to avoid blocking the initial page load.
        const nextBase = next.split('#')[0].replace(/\/+$/, '');
        const currentBase = current.split('#')[0].replace(/\/+$/, '');
        return !!(nextBase && currentBase && nextBase === currentBase);
    }, [webViewUrl]);

    const handleWebViewLoadError = useCallback((_event: any) => {
        const message = String(_event?.nativeEvent?.description || '').trim();
        setChapterLoadError(message || 'No se pudo cargar el lector web.');
    }, []);

    const getMangaData = useCallback(async () => {
        if (mangaDataCacheRef.current) {
            return mangaDataCacheRef.current;
        }

        const mangaData = await fetchJsonWithTimeout(backendUrl(`/manga/${encodeURIComponent(parsed.mangaSlug)}`));
        mangaDataCacheRef.current = mangaData;
        return mangaData;
    }, [parsed.mangaSlug]);

    const buildChapterBundle = useCallback((compositeSlug: string, mangaData: any): ChapterBundle => {
        const composite = parseComposite(compositeSlug);

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

        const mangaData = await getMangaData();
        const bundle = buildChapterBundle(normalizedCompositeSlug, mangaData);

        chapterBundleCacheRef.current.set(normalizedCompositeSlug, bundle);
        trimChapterBundleCache(chapterBundleCacheRef.current);
        return bundle;
    }, [buildChapterBundle, getMangaData]);

    const persistReadingPosition = useCallback(async (imageIndex?: number) => {
        const user = auth.currentUser;
        if (!user || plan !== 'premium' || !parsed.mangaSlug || !currentChapterMeta) {
            return;
        }

        const safeIndex = Math.max(0,
            Number.isFinite(imageIndex as number) ? Number(imageIndex) : currentVisibleImageIndexRef.current,
        );
        const scrollOffset = Math.max(0, currentScrollOffsetRef.current || 0);

        sessionChapterProgressRef.current.set(currentCompositeSlug, {
            imageIndex: safeIndex,
            scrollOffset,
        });

        const progressKey = [
            parsed.mangaSlug,
            currentChapterMeta.slug,
            safeIndex,
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
            scrollOffset,
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
            lastReadScrollOffset: scrollOffset,
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
            enterReaderImmersiveMode();

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
                exitReaderImmersiveMode();
            };
        }, [enterReaderImmersiveMode, exitReaderImmersiveMode, flushReadingTime, resumeReadingSession])
    );

    useEffect(() => {
        return () => {
            // Fail-safe: always restore bars if the screen is unmounted abruptly.
            exitReaderImmersiveMode();
        };
    }, [exitReaderImmersiveMode]);

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

    const loadChapterData = useCallback(async () => {
        const requestId = ++loadRequestIdRef.current;
        if (!parsed.mangaSlug || !parsed.chapterSlug) {
            alertError('Slug de capitulo invalido.');
            setLoadingChapter(false);
            return;
        }

        const cachedBundle = chapterBundleCacheRef.current.get(currentCompositeSlug) || null;
        setLoadingChapter(true);
        setChapterLoadError('');

        try {
            const bundle = cachedBundle || await fetchChapterBundle(currentCompositeSlug);
            const mangaData = await getMangaData();
            if (requestId !== loadRequestIdRef.current) return;

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
                        const savedScrollOffset = Number(savedLastRead?.scrollOffset);

                        if (savedSlug && savedSlug === bundle.currentChapter.slug) {
                            resumePosition = {
                                imageIndex: Number.isFinite(savedImageIndex) ? savedImageIndex : 0,
                                scrollOffset: Number.isFinite(savedScrollOffset) ? savedScrollOffset : undefined,
                            };
                        }
                    }
                }
                shouldResumeFromProgressRef.current = false;
            } else if (sessionProgress) {
                resumePosition = sessionProgress;
            }

            if (bundle.currentChapter?.slug) {
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
                    const chapterReadSnap = await getDoc(chapterReadDocRef);
                    const isFirstChapterRead = !chapterReadSnap.exists();

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
                            lastReadChapterSlug: safeChapterId,
                            lastReadChapterNumber: bundle.currentChapter.number || '',
                            lastUpdated: serverTimestamp(),
                            startedAt: serverTimestamp(),
                        }, { merge: true }),
                    ]);

                    if (isFirstChapterRead) {
                        await awardReadingCoinAndSyncAchievements(user.uid, 1);
                    }

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

            if (requestId !== loadRequestIdRef.current) return;

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

            currentVisibleImageIndexRef.current = resumePosition
                ? Math.max(0, resumePosition.imageIndex)
                : 0;
            currentMaxVisibleImageIndexRef.current = currentVisibleImageIndexRef.current;
            currentScrollOffsetRef.current = resumePosition?.scrollOffset || 0;

            lastSavedProgressKeyRef.current = '';
            verticalAdvanceTriggeredRef.current = false;
            verticalAutoAdvanceArmedRef.current = false;
        } catch (error: any) {
            setWebViewUrl(null);
            if (requestId !== loadRequestIdRef.current) return;
            const message = error?.message || 'No se pudo cargar el capitulo.';
            setChapterLoadError(message);
            alertError(message);
        } finally {
            if (requestId === loadRequestIdRef.current) {
                setLoadingChapter(false);
            }
        }
    }, [alertError, currentCompositeSlug, fetchChapterBundle, getMangaData, parsed.chapterSlug, parsed.mangaSlug, plan]);

    useEffect(() => {
        loadChapterData();
        return () => {
            // Invalidate pending chapter loads on unmount/slug change.
            loadRequestIdRef.current += 1;
        };
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
        if (loadingChapter || !parsed.mangaSlug || !parsed.chapterSlug) return;

        const url = buildWebReaderUrl(parsed.mangaSlug, parsed.chapterSlug, {
            chapterChangeMode,
            resumeIndex: currentVisibleImageIndexRef.current,
            resumeOffset: currentScrollOffsetRef.current,
        });
        if (url) setWebViewUrl(url);
    }, [loadingChapter, chapterChangeMode, parsed.mangaSlug, parsed.chapterSlug]);

    const changeChapter = useCallback((compositeSlug: string | null) => {
        if (!compositeSlug) return;
        const normalized = normalizeCompositeSlug(compositeSlug);
        if (!normalized || normalized === currentCompositeSlug) return;
        if (progressSaveTimeoutRef.current) {
            clearTimeout(progressSaveTimeoutRef.current);
            progressSaveTimeoutRef.current = null;
        }
        persistReadingPosition(currentVisibleImageIndexRef.current).catch(() => {
            // silently ignored to avoid interrupting reading
        });
        setCurrentCompositeSlug(normalized);
    }, [currentCompositeSlug, persistReadingPosition]);

    const handleVerticalEndReached = useCallback(() => {
        if (chapterChangeMode !== 'vertical') return;
        if (loadingChapter) return;
        if (!nextCompositeSlug) return;
        if (!verticalAutoAdvanceArmedRef.current) return;
        if (chapterSwitchInProgressRef.current) return;
        if (verticalAdvanceTriggeredRef.current) return;

        verticalAdvanceTriggeredRef.current = true;
        chapterSwitchInProgressRef.current = true;
        showAndResetControls();
        changeChapter(nextCompositeSlug);
    }, [chapterChangeMode, loadingChapter, nextCompositeSlug, showAndResetControls, changeChapter]);

    const handlePullToPrevChapter = useCallback(() => {
        if (!prevCompositeSlug || chapterSwitchInProgressRef.current) return;
        chapterSwitchInProgressRef.current = true;
        changeChapter(prevCompositeSlug);
    }, [prevCompositeSlug, changeChapter]);

    const handleWebViewMessage = useCallback((event: any) => {
        const raw = String(event?.nativeEvent?.data || '').trim();
        if (!raw) return;

        let type = raw;
        let payload: Record<string, any> | null = null;
        try {
            const parsedData = JSON.parse(raw);
            type = String(parsedData?.type || raw);
            payload = parsedData && typeof parsedData === 'object' ? parsedData : null;
        } catch {
            // plain string payload
        }

        if (type === 'progress') {
            const imageIndex = Number(payload?.imageIndex);
            const maxVisibleImageIndex = Number(payload?.maxVisibleImageIndex);
            const scrollOffset = Number(payload?.scrollOffset);

            if (Number.isFinite(imageIndex) && imageIndex >= 0) {
                const safeIndex = Math.max(0, Math.round(imageIndex));
                currentVisibleImageIndexRef.current = safeIndex;
                scheduleProgressSave(safeIndex);
            }

            if (Number.isFinite(maxVisibleImageIndex) && maxVisibleImageIndex >= 0) {
                currentMaxVisibleImageIndexRef.current = Math.max(
                    currentMaxVisibleImageIndexRef.current,
                    Math.max(0, Math.round(maxVisibleImageIndex)),
                );
            }

            if (Number.isFinite(scrollOffset) && scrollOffset >= 0) {
                currentScrollOffsetRef.current = Math.max(0, scrollOffset);
                if (chapterChangeMode === 'vertical' && scrollOffset > MIN_VERTICAL_SCROLL_TO_ARM_ADVANCE_PX) {
                    verticalAutoAdvanceArmedRef.current = true;
                }
            }

            return;
        }

        if (type === 'tap') {
            if (hudLocked) return;
            if (showControls) {
                if (autoHideTimeoutRef.current) clearTimeout(autoHideTimeoutRef.current);
                Animated.timing(controlsOpacity, {
                    toValue: 0,
                    duration: 180,
                    useNativeDriver: true,
                }).start(() => setShowControls(false));
                return;
            }
            showAndResetControls();
            return;
        }

        if (type === 'swipeLeft') {
            if (chapterChangeMode !== 'horizontal') return;
            showAndResetControls();
            changeChapter(nextCompositeSlug);
            return;
        }

        if (type === 'swipeRight') {
            if (chapterChangeMode !== 'horizontal') return;
            showAndResetControls();
            changeChapter(prevCompositeSlug);
            return;
        }

        if (type === 'chapterNext') {
            if (chapterChangeMode !== 'vertical') return;
            showAndResetControls();
            changeChapter(nextCompositeSlug);
            return;
        }

        if (type === 'chapterPrev') {
            if (chapterChangeMode !== 'vertical') return;
            showAndResetControls();
            handlePullToPrevChapter();
            return;
        }

        if (type === 'nearEnd') {
            if (chapterChangeMode !== 'vertical') return;
            handleVerticalEndReached();
            return;
        }

        if (type === 'nearTopPull') {
            if (chapterChangeMode !== 'vertical') return;
            handlePullToPrevChapter();
        }
    }, [
        chapterChangeMode,
        changeChapter,
        controlsOpacity,
        handlePullToPrevChapter,
        handleVerticalEndReached,
        hudLocked,
        nextCompositeSlug,
        prevCompositeSlug,
        scheduleProgressSave,
        showAndResetControls,
        showControls,
    ]);

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
        verticalAutoAdvanceArmedRef.current = false;
        setWebViewUrl(null);
    }, [currentCompositeSlug]);

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

            {!!chapterLoadError && !loadingChapter && (
                <View style={styles.errorOverlay}>
                    <View style={styles.errorCard}>
                        <Ionicons name="warning-outline" size={26} color="#FFD166" />
                        <Text style={styles.errorTitle}>No se pudo cargar el capitulo</Text>
                        <Text style={styles.errorMessage}>{chapterLoadError}</Text>
                        <TouchableOpacity style={styles.errorRetryButton} onPress={loadChapterData} activeOpacity={0.85}>
                            <Text style={styles.errorRetryText}>Reintentar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <View style={styles.readerContent}>
                {webViewUrl ? (
                    <WebView
                        source={{ uri: webViewUrl }}
                        style={{ flex: 1 }}
                        onLoad={showAndResetControls}
                        onError={handleWebViewLoadError}
                        onHttpError={handleWebViewLoadError}
                        onMessage={handleWebViewMessage}
                        onShouldStartLoadWithRequest={handleWebViewShouldStart}
                        setSupportMultipleWindows={false}
                        javaScriptEnabled={true}
                        startInLoadingState={true}
                        renderLoading={() => <ActivityIndicator size="large" color="#FF5555" style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} />}
                        showsVerticalScrollIndicator={false}
                        bounces={false}
                        overScrollMode="never"
                    />
                ) : null}
            </View>

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
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20,
    },
    errorOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.62)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 21,
        paddingHorizontal: 20,
    },
    errorCard: {
        width: '100%',
        maxWidth: 420,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
        backgroundColor: 'rgba(20,20,20,0.94)',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 18,
        gap: 8,
    },
    errorTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        textAlign: 'center',
    },
    errorMessage: {
        color: 'rgba(255,255,255,0.82)',
        fontSize: 13,
        lineHeight: 18,
        textAlign: 'center',
    },
    errorRetryButton: {
        marginTop: 6,
        backgroundColor: '#FF5555',
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    errorRetryText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
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
