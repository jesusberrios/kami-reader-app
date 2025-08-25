import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    Image,
    ScrollView,
    ActivityIndicator,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Platform,
    Share,
    AccessibilityInfo,
    StatusBar,
    Dimensions,
    RefreshControl
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { db, auth } from '../firebase/config';
import { doc, setDoc, deleteDoc, onSnapshot, collection, getDocs, getDoc, serverTimestamp } from 'firebase/firestore';
import { RootStackParamList } from '../navigation/types';
import { useAlertContext } from '../contexts/AlertContext';

type DetailsScreenRouteProp = RouteProp<RootStackParamList, 'Details'>;

type ComicDetails = {
    hid: string;
    slug: string;
    title: string;
    cover_url: string;
    desc?: string;
    country?: string;
    status?: number;
    chapter_count?: number;
    last_chapter?: number;
    bayesian_rating?: string;
    rating_count?: number;
    follow_count?: number;
    authors?: { name: string; slug: string }[];
    artists?: { name: string; slug: string }[];
    md_comic_md_genres?: { md_genres: { name: string } }[];
    md_titles?: { title: string; lang: string }[];
};

type Chapter = {
    hid: string;
    chap: string;
    lang: string;
    vol?: string;
    title?: string;
    group_name?: string[];
    created_at: string;
    updated_at: string;
    up_count: number;
    isRead?: boolean;
};

type LastReadChapterInfo = {
    chap: string;
    hid: string;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHAPTERS_PER_PAGE = 100;
const INITIAL_GROUP_FETCH_LIMIT = 200;
const AVAILABLE_LANGUAGES = ['es-419', 'es-LA', 'en', 'ja', 'zh'];

const DetailsScreen: React.FC = () => {
    const route = useRoute<DetailsScreenRouteProp>();
    const { slug = '' } = route.params;

    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { alertError, alertSuccess, alertConfirm } = useAlertContext();

    const [comic, setComic] = useState<ComicDetails | null>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loadingComic, setLoadingComic] = useState<boolean>(true);
    const [loadingChapters, setLoadingChapters] = useState<boolean>(false);
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const [comicError, setComicError] = useState<string | null>(null);
    const [chaptersError, setChaptersError] = useState<string | null>(null);

    const [currentPage, setCurrentPage] = useState<number>(1);
    const [hasMoreChapters, setHasMoreChapters] = useState<boolean>(true);

    const [chapterOrder, setChapterOrder] = useState<0 | 1>(0);
    const [selectedLanguage, setSelectedLanguage] = useState<string>('es');
    const [availableGroups, setAvailableGroups] = useState<string[]>(['Todos']);
    const [selectedGroup, setSelectedGroup] = useState<string>('Todos');

    const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);
    const [isPremium, setIsPremium] = useState<boolean | null>(null);
    const [isFavorite, setIsFavorite] = useState<boolean>(false);
    const [favoriteLoading, setFavoriteLoading] = useState<boolean>(false);
    const [readChaptersHids, setReadChaptersHids] = useState<Set<string>>(new Set());
    const [lastReadChapterInfo, setLastReadChapterInfo] = useState<LastReadChapterInfo | null>(null);
    const [isMangaRead, setIsMangaRead] = useState<boolean>(false);
    const [loadingAllChapters, setLoadingAllChapters] = useState<boolean>(false);

    // Efectos para autenticación y datos de usuario
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            setCurrentUserUid(user ? user.uid : null);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!currentUserUid) {
            setIsPremium(false);
            return;
        }

        const userDocRef = doc(db, 'users', currentUserUid);
        const unsubscribeProfile = onSnapshot(userDocRef,
            (docSnap) => {
                setIsPremium(docSnap.exists() ? docSnap.data()?.accountType === 'premium' : false);
            },
            (error) => {
                console.error("Error fetching user profile:", error);
                setIsPremium(false);
            }
        );
        return unsubscribeProfile;
    }, [currentUserUid]);

    useEffect(() => {
        if (!currentUserUid || !comic?.hid) {
            setIsFavorite(false);
            return;
        }

        const favoriteDocRef = doc(db, 'users', currentUserUid, 'favorites', comic.hid);
        const unsubscribeFavorite = onSnapshot(favoriteDocRef,
            (docSnap) => setIsFavorite(docSnap.exists()),
            (error) => {
                console.error("Error listening to favorite status:", error);
                setIsFavorite(false);
            }
        );
        return unsubscribeFavorite;
    }, [currentUserUid, comic?.hid]);

    useEffect(() => {
        if (!currentUserUid || !comic?.hid) {
            setReadChaptersHids(new Set());
            return;
        }

        const comicReadDocRef = doc(db, 'users', currentUserUid, 'readComics', comic.hid);
        const chaptersReadCollectionRef = collection(comicReadDocRef, 'chaptersRead');

        const unsubscribeReadChapters = onSnapshot(chaptersReadCollectionRef,
            (querySnapshot) => {
                const readHids = new Set<string>();
                querySnapshot.forEach((doc) => readHids.add(doc.id));
                setReadChaptersHids(readHids);
            },
            (error) => {
                console.error("Error listening to read chapters:", error);
                setReadChaptersHids(new Set());
            }
        );
        return unsubscribeReadChapters;
    }, [currentUserUid, comic?.hid]);

    useEffect(() => {
        if (!currentUserUid || !comic?.hid || !isPremium) {
            setLastReadChapterInfo(null);
            setIsMangaRead(false);
            return;
        }

        const comicReadDocRef = doc(db, 'users', currentUserUid, 'readComics', comic.hid);
        const unsubscribe = onSnapshot(comicReadDocRef,
            (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setLastReadChapterInfo(data?.lastReadChapter || null);
                    setIsMangaRead(data?.isFullMangaRead === true);
                } else {
                    setLastReadChapterInfo(null);
                    setIsMangaRead(false);
                }
            },
            (error) => {
                console.error("Error listening to comic read status:", error);
                setLastReadChapterInfo(null);
                setIsMangaRead(false);
            }
        );
        return unsubscribe;
    }, [currentUserUid, comic?.hid, isPremium]);

    // Memoizar funciones de utilidad
    const getStatusText = useCallback((statusCode: number | undefined) => {
        switch (statusCode) {
            case 1: return 'En curso';
            case 2: return 'Completado';
            case 3: return 'Cancelado';
            case 4: return 'En pausa';
            default: return 'Desconocido';
        }
    }, []);

    const formatIsoDateString = useCallback((isoString: string) => {
        const date = new Date(isoString);
        const options: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short',
            timeZone: 'UTC',
        };
        return date.toLocaleString('es-ES', options);
    }, []);

    // Fetch de datos del cómic
    useEffect(() => {
        if (!slug) {
            setComicError("Error: No se encontró el identificador del cómic (slug).");
            setLoadingComic(false);
            return;
        }

        const fetchComicDetails = async () => {
            try {
                setLoadingComic(true);
                setComicError(null);

                const response = await fetch(`https://api.comick.fun/v1.0/comic/${slug}/?tachiyomi=true`);
                if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

                const data = await response.json();
                setComic(data.comic);
            } catch (e: any) {
                setComicError(e.message || 'Error desconocido al cargar detalles del cómic');
            } finally {
                setLoadingComic(false);
            }
        };

        fetchComicDetails();
    }, [slug]);

    // Fetch de grupos
    const fetchAllGroupNames = useCallback(async (comicHid: string) => {
        try {
            const url = `https://api.comick.fun/comic/${comicHid}/chapters?page=1&limit=${INITIAL_GROUP_FETCH_LIMIT}&lang=${selectedLanguage}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Error HTTP: ${response.status} fetching groups`);

            const data = await response.json();
            const fetchedChapters: Chapter[] = data.chapters || [];

            const uniqueGroups = new Set<string>();
            fetchedChapters.forEach(chap => {
                if (chap.group_name?.length) {
                    chap.group_name.forEach(group => uniqueGroups.add(group));
                }
            });

            const sortedGroups = ['Todos', ...Array.from(uniqueGroups).sort()];
            setAvailableGroups(sortedGroups);

            if (!sortedGroups.includes(selectedGroup)) {
                setSelectedGroup('Todos');
            }
        } catch (e: any) {
            console.error('Error fetching group names:', e.message);
        }
    }, [selectedLanguage, selectedGroup]);

    useEffect(() => {
        if (comic?.hid) {
            fetchAllGroupNames(comic.hid);
        }
    }, [comic?.hid, fetchAllGroupNames]);

    // Fetch de capítulos
    const fetchAllChapters = useCallback(async (comicHid: string, order: 0 | 1, language: string, group: string) => {
        setLoadingAllChapters(true);
        setChaptersError(null);

        try {
            let allChapters: Chapter[] = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const chapterUrl = `https://api.comick.fun/comic/${comicHid}/chapters?page=${page}&limit=${CHAPTERS_PER_PAGE}&lang=${language}&chap-order=${order}`;
                const response = await fetch(chapterUrl);
                if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

                const data = await response.json();
                const chaptersThisPage: Chapter[] = data.chapters || [];

                if (chaptersThisPage.length === 0) {
                    hasMore = false;
                    break;
                }

                let filteredChapters = chaptersThisPage;
                if (group !== 'Todos') {
                    filteredChapters = chaptersThisPage.filter(chapter =>
                        chapter.group_name?.includes(group)
                    );
                }

                allChapters = [...allChapters, ...filteredChapters];

                if (chaptersThisPage.length < CHAPTERS_PER_PAGE) {
                    hasMore = false;
                } else {
                    page++;
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Eliminar duplicados
            const uniqueChaptersMap = new Map<string, Chapter>();
            allChapters.forEach(chapter => {
                const key = `${chapter.chap}-${chapter.group_name?.[0] || ''}`;
                if (!uniqueChaptersMap.has(key)) {
                    uniqueChaptersMap.set(key, chapter);
                }
            });

            setChapters(Array.from(uniqueChaptersMap.values()));
            setHasMoreChapters(false);
        } catch (e: any) {
            setChaptersError(e.message || 'Error desconocido al cargar capítulos');
        } finally {
            setLoadingAllChapters(false);
            setLoadingChapters(false);
        }
    }, []);

    const fetchChapters = useCallback(async (page: number, order: 0 | 1, language: string, group: string, reset: boolean = false) => {
        if (!comic?.hid) return;

        setLoadingChapters(true);
        setChaptersError(null);

        try {
            const chapterUrl = `https://api.comick.fun/comic/${comic.hid}/chapters?page=${page}&limit=${CHAPTERS_PER_PAGE}&lang=${language}&chap-order=${order}`;
            const response = await fetch(chapterUrl);
            if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

            const data = await response.json();
            let allChaptersFetchedThisPage: Chapter[] = data.chapters || [];

            // Eliminar duplicados
            const uniqueChapterMap = new Map<string, Chapter>();
            allChaptersFetchedThisPage.forEach(chapter => {
                const key = `${chapter.chap}-${chapter.group_name?.[0] || ''}`;
                if (!uniqueChapterMap.has(key)) {
                    uniqueChapterMap.set(key, chapter);
                }
            });
            let deduplicatedChapters = Array.from(uniqueChapterMap.values());

            // Filtrar por grupo si es necesario
            let filteredChaptersForDisplay = deduplicatedChapters;
            if (group !== 'Todos') {
                filteredChaptersForDisplay = deduplicatedChapters.filter(chapter =>
                    chapter.group_name?.includes(group)
                );
            }

            setChapters(prevChapters => {
                if (reset) return filteredChaptersForDisplay;

                const existingChapterKeys = new Set(prevChapters.map(chap =>
                    `${chap.chap}-${chap.group_name?.[0] || ''}`
                ));

                const newUniqueChapters = filteredChaptersForDisplay.filter(chapter => {
                    const key = `${chapter.chap}-${chapter.group_name?.[0] || ''}`;
                    return !existingChapterKeys.has(key);
                });

                return [...prevChapters, ...newUniqueChapters];
            });

            setHasMoreChapters(allChaptersFetchedThisPage.length === CHAPTERS_PER_PAGE);
        } catch (e: any) {
            setChaptersError(e.message || 'Error desconocido al cargar capítulos');
        } finally {
            setLoadingChapters(false);
        }
    }, [comic?.hid]);

    // Efecto para cargar capítulos
    useEffect(() => {
        if (!comic?.hid) return;

        setChapters([]);
        setCurrentPage(1);
        setHasMoreChapters(true);

        if (selectedGroup !== 'Todos') {
            fetchAllChapters(comic.hid, chapterOrder, selectedLanguage, selectedGroup);
        } else {
            fetchChapters(1, chapterOrder, selectedLanguage, selectedGroup, true);
        }
    }, [comic?.hid, chapterOrder, selectedLanguage, selectedGroup, fetchChapters, fetchAllChapters]);

    useEffect(() => {
        if (currentPage > 1 && selectedGroup === 'Todos') {
            fetchChapters(currentPage, chapterOrder, selectedLanguage, selectedGroup);
        }
    }, [currentPage, chapterOrder, selectedLanguage, selectedGroup, fetchChapters]);

    // Handlers
    const handleLoadMore = () => {
        if (!loadingChapters && hasMoreChapters && selectedGroup === 'Todos') {
            setCurrentPage(prevPage => prevPage + 1);
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        if (comic?.hid) {
            setChapters([]);
            setCurrentPage(1);
            setHasMoreChapters(true);

            if (selectedGroup !== 'Todos') {
                fetchAllChapters(comic.hid, chapterOrder, selectedLanguage, selectedGroup).finally(() => {
                    setRefreshing(false);
                });
            } else {
                fetchChapters(1, chapterOrder, selectedLanguage, selectedGroup, true).finally(() => {
                    setRefreshing(false);
                });
            }
        } else {
            setRefreshing(false);
        }
    }, [comic?.hid, chapterOrder, selectedLanguage, selectedGroup, fetchChapters, fetchAllChapters]);

    const handleViewComments = () => {
        navigation.navigate('Comments', { mangaTitle: comic?.title });
    };

    const toggleLanguage = () => {
        const languages = ['es', 'es-LA', 'en', 'ja', 'zh'];
        const currentIndex = languages.indexOf(selectedLanguage === 'es-419' ? 'es-LA' : selectedLanguage);
        const nextIndex = (currentIndex + 1) % languages.length;
        const nextLanguage = languages[nextIndex];
        setSelectedLanguage(nextLanguage === 'es-LA' ? 'es-419' : nextLanguage);
    };

    const toggleGroup = () => {
        const currentIndex = availableGroups.indexOf(selectedGroup);
        const nextIndex = (currentIndex + 1) % availableGroups.length;
        const nextGroup = availableGroups[nextIndex];
        setSelectedGroup(nextGroup);

        if (comic?.hid) {
            setChapters([]);
            setCurrentPage(1);
            setHasMoreChapters(true);

            if (nextGroup !== 'Todos') {
                fetchAllChapters(comic.hid, chapterOrder, selectedLanguage, nextGroup);
            } else {
                fetchChapters(1, chapterOrder, selectedLanguage, nextGroup, true);
            }
        }
    };

    const onShare = async () => {
        try {
            const playStoreLink = 'https://play.google.com/store/apps/details?id=com.yourusername.kamireader';
            const message = `¡Descarga Kamireader para leer tus cómics favoritos!\n\nAndroid: ${playStoreLink}`;

            const result = await Share.share({
                message,
                title: '¡Descarga Kamireader!',
                url: playStoreLink,
            });

            if (result.action === Share.sharedAction) {
                // Opcional: manejar acciones después de compartir
            }
        } catch (error: any) {
            alertError(error.message || 'Error al compartir');
        }
    };

    const toggleFavorite = async () => {
        if (!currentUserUid) {
            alertError("Debes iniciar sesión para usar esta función.");
            return;
        }

        if (isPremium === false) {
            alertError("Esta función está disponible solo para usuarios Premium.");
            return;
        }
        if (!comic?.hid) {
            alertError("No se puede añadir a favoritos sin el ID del cómic.");
            return;
        }

        setFavoriteLoading(true);
        try {
            const favoriteDocRef = doc(db, 'users', currentUserUid, 'favorites', comic.hid);

            if (isFavorite) {
                await deleteDoc(favoriteDocRef);
                alertSuccess("Cómic eliminado de tus favoritos.");
            } else {
                await setDoc(favoriteDocRef, {
                    favoritedAt: new Date(),
                    comicTitle: comic.title,
                    coverUrl: comic.cover_url,
                    slug: comic.slug,
                });
                alertSuccess("Cómic añadido a tus favoritos.");
            }
        } catch (e: any) {
            console.error("Error toggling favorite:", e);
            alertError(`No se pudo actualizar favoritos: ${e.message}`);
        } finally {
            setFavoriteLoading(false);
        }
    };

    const updateLastReadChapterForComic = useCallback(async (comicHid: string, uid: string) => {
        const chaptersReadCollectionRef = collection(db, 'users', uid, 'readComics', comicHid, 'chaptersRead');
        try {
            const querySnapshot = await getDocs(chaptersReadCollectionRef);
            let highestChap: number = -1;
            let lastReadHid: string | null = null;
            let lastReadChapString: string | null = null;

            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const chapNum = parseFloat(data.chap || '0');
                if (!isNaN(chapNum) && chapNum > highestChap) {
                    highestChap = chapNum;
                    lastReadHid = docSnap.id;
                    lastReadChapString = data.chap;
                }
            });

            const comicReadDocRef = doc(db, 'users', uid, 'readComics', comicHid);
            if (lastReadHid && lastReadChapString) {
                await setDoc(comicReadDocRef, {
                    lastReadChapter: {
                        chap: lastReadChapString,
                        hid: lastReadHid,
                        readAt: new Date(),
                    },
                    comicTitle: comic?.title,
                    coverUrl: comic?.cover_url,
                    slug: comic?.slug,
                }, { merge: true });
            } else {
                await setDoc(comicReadDocRef, {
                    lastReadChapter: null,
                    comicTitle: comic?.title,
                    coverUrl: comic?.cover_url,
                    slug: comic?.slug,
                }, { merge: true });
            }
        } catch (error) {
            console.error("Error updating last read chapter for comic:", error);
        }
    }, [comic]);

    const toggleReadStatus = async (chapterHid: string, chapterChap: string, currentIsRead: boolean) => {
        if (!currentUserUid) return;
        if (isPremium === false) return;
        if (!comic?.hid) {
            alertError("No se puede marcar el capítulo sin el ID del cómic.");
            return;
        }

        try {
            const comicReadDocRef = doc(db, 'users', currentUserUid, 'readComics', comic.hid);
            const chaptersReadCollectionRef = collection(comicReadDocRef, 'chaptersRead');
            const chapterReadDocRef = doc(chaptersReadCollectionRef, chapterHid);

            const inProgressMangaDocRef = doc(db, 'users', currentUserUid, 'inProgressManga', comic.hid);

            if (currentIsRead) {
                await deleteDoc(chapterReadDocRef);
                alertSuccess("Capítulo marcado como no leído.");

                await updateLastReadChapterForComic(comic.hid, currentUserUid);

                if (lastReadChapterInfo?.hid === chapterHid) {
                    const remainingReadChaptersSnapshot = await getDocs(chaptersReadCollectionRef);
                    let newLastReadHid: string | null = null;
                    let newLastReadChapNumber: string | null = null;
                    let highestChapNum = -1;

                    remainingReadChaptersSnapshot.forEach(docSnap => {
                        const data = docSnap.data();
                        const chapNum = parseFloat(data.chap || '0');
                        if (!isNaN(chapNum) && chapNum > highestChapNum) {
                            highestChapNum = chapNum;
                            newLastReadHid = docSnap.id;
                            newLastReadChapNumber = data.chap;
                        }
                    });

                    if (newLastReadHid && newLastReadChapNumber) {
                        await setDoc(inProgressMangaDocRef, {
                            lastReadChapterHid: newLastReadHid,
                            lastReadChapterNumber: newLastReadChapNumber,
                        }, { merge: true });
                    } else {
                        await setDoc(inProgressMangaDocRef, {
                            lastReadChapterHid: null,
                            lastReadChapterNumber: null,
                        }, { merge: true });
                    }
                }
            } else {
                await setDoc(chapterReadDocRef, { readAt: new Date(), chap: chapterChap });
                alertSuccess("Capítulo marcado como leído.");
                
                await updateLastReadChapterForComic(comic.hid, currentUserUid);

                await setDoc(inProgressMangaDocRef, {
                    lastReadChapterHid: chapterHid,
                    lastReadChapterNumber: chapterChap,
                }, { merge: true });
            }
        } catch (e: any) {
            console.error("Error toggling read status:", e);
            alertError(`No se pudo actualizar el estado de lectura: ${e.message}`);
        }
    };

    const addMangaToInProgress = async (mangaHid: string, mangaTitle: string) => {
        if (!currentUserUid) return;
        if (!comic || !comic.cover_url || !comic.slug) {
            alertError("No se pudo obtener la información completa del cómic para guardarlo.");
            return;
        }

        const mangaDocRef = doc(db, 'users', currentUserUid, 'inProgressManga', mangaHid);

        try {
            await setDoc(mangaDocRef, {
                mangaHid,
                mangaTitle,
                coverUrl: comic.cover_url,
                slug: comic.slug,
                startedAt: serverTimestamp(),
                lastReadChapterHid: null,
                lastReadChapterNumber: null,
            }, { merge: true });
        } catch (error) {
            console.error("Error adding manga to inProgressManga:", error);
            alertError(`No se pudo guardar el progreso: ${error}`);
        }
    };

    const toggleMangaReadStatus = async () => {
        if (!currentUserUid) {
            alertError("Debes iniciar sesión para usar esta función.");
            return;
        }
        if (isPremium === null) {
            alertError("Por favor, espera mientras verificamos tu estado Premium.");
            return;
        }
        if (isPremium === false) {
            alertError("Esta función está disponible solo para usuarios Premium.");
            return;
        }
        if (!comic?.hid) {
            alertError("No se puede marcar el manga sin el ID del cómic.");
            return;
        }

        try {
            const comicReadDocRef = doc(db, 'users', currentUserUid, 'readComics', comic.hid);

            if (isMangaRead) {
                await deleteDoc(comicReadDocRef);
                alertSuccess("Manga marcado como no leído y capítulos desmarcados.");
            } else {
                let lastChapterHid: string | null = null;
                let lastChapterChap: string | null = null;

                if (chapters.length > 0) {
                    const sortedChapters = [...chapters].sort((a, b) => parseFloat(b.chap) - parseFloat(a.chap));
                    lastChapterHid = sortedChapters[0].hid;
                    lastChapterChap = sortedChapters[0].chap;
                }

                await setDoc(comicReadDocRef, {
                    isFullMangaRead: true,
                    lastReadChapter: lastChapterHid && lastChapterChap ? {
                        chap: lastChapterChap,
                        hid: lastChapterHid,
                        readAt: new Date(),
                    } : null,
                    comicTitle: comic.title,
                    coverUrl: comic.cover_url,
                    slug: comic.slug,
                }, { merge: true });

                alertSuccess("Manga marcado como leído.");
            }
        } catch (e: any) {
            console.error("Error toggling manga read status:", e);
            if (e.code === 'permission-denied') {
                alertError("No tienes permiso para realizar esta acción. Verifica tus reglas de seguridad de Firestore.");
            } else {
                alertError(`No se pudo actualizar el estado de lectura del manga: ${e.message}`);
            }
        }
    };

    const toggleChapterOrder = () => {
        setChapterOrder(prevOrder => (prevOrder === 0 ? 1 : 0));
    };

    // Renderizado de elementos de lista
    const renderChapterItem = useCallback(({ item }: { item: Chapter }) => {
        const isChapterRead = readChaptersHids.has(item.hid);

        return (
            <TouchableOpacity
                style={[styles.chapterItem, isChapterRead && styles.chapterItemRead]}
                onPress={() => {
                    if (isChapterRead) {
                        alertConfirm(
                            `¿Estás seguro de que quieres desmarcar el Capítulo ${item.chap} como no leído?`,
                            () => toggleReadStatus(item.hid, item.chap, true),
                            "Desmarcar como leído",
                            "Sí, desmarcar",
                            "Cancelar"
                        );
                    } else {
                        navigation.navigate('Reader', { hid: item.hid });
                        if (comic && comic.hid && comic.title && currentUserUid) {
                            toggleReadStatus(item.hid, item.chap, false);
                            addMangaToInProgress(comic.hid, comic.title);
                        }
                    }
                }}
                accessible={true}
                accessibilityLabel={`Capítulo ${item.chap} ${item.title || ''}. ${isChapterRead ? 'Ya leído, tocar para desmarcar' : 'Tocar para leer'}`}
                accessibilityRole="button"
            >
                <View style={styles.chapterItemContent}>
                    <Text style={styles.chapterTitle} numberOfLines={1} ellipsizeMode="tail">
                        Capítulo {item.chap}
                        {item.title ? <Text style={styles.chapterSubtitle}> - {item.title}</Text> : ''}
                    </Text>
                    <View style={styles.chapterInfoRow}>
                        {Array.isArray(item.group_name) && item.group_name.length > 0 && (
                            <Text style={styles.chapterGroup} numberOfLines={1} ellipsizeMode="tail">
                                {item.group_name.join(', ')}
                            </Text>
                        )}
                        <Text style={styles.chapterLang}>
                            {item.lang.toUpperCase()}
                        </Text>
                    </View>
                    <Text style={styles.chapterDate}>
                        Publicado: {formatIsoDateString(item.created_at)}
                    </Text>
                </View>
                {isChapterRead ? (
                    <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                ) : (
                    <Ionicons name="chevron-forward-outline" size={24} color="#FF5252" />
                )}
            </TouchableOpacity>
        );
    }, [readChaptersHids, comic, currentUserUid, formatIsoDateString, toggleReadStatus, addMangaToInProgress, alertConfirm, navigation]);

    // Memoizar componentes costosos
    const memoizedChapterList = useMemo(() => (
        <FlatList
            data={chapters}
            keyExtractor={(item) => item.hid}
            renderItem={renderChapterItem}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={() => (
                loadingChapters ? (
                    <ActivityIndicator size="small" color="#FF5252" style={styles.loadingMore} />
                ) : null
            )}
            ListEmptyComponent={() => (
                !loadingChapters && !chaptersError && !loadingAllChapters && (
                    <Text style={styles.emptyChaptersText}>No hay capítulos disponibles en el idioma seleccionado.</Text>
                )
            )}
            scrollEnabled={false}
        />
    ), [chapters, loadingChapters, chaptersError, loadingAllChapters, renderChapterItem, handleLoadMore]);

    const memoizedComicDetails = useMemo(() => {
        if (!comic) return null;

        return (
            <>
                <View style={styles.headerContainer}>
                    <Image
                        source={{ uri: comic.cover_url }}
                        style={styles.coverImage}
                        resizeMode="cover"
                    />
                    <View style={styles.infoColumn}>
                        <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
                            {comic.title}
                        </Text>

                        <View style={styles.infoRow}>
                            <Ionicons name="earth-outline" size={16} color="#FF5252" />
                            <Text style={styles.infoText}>
                                {comic.country?.toUpperCase() || 'Desconocido'}
                            </Text>
                        </View>

                        <View style={styles.infoRow}>
                            <Ionicons name="time-outline" size={16} color="#FF5252" />
                            <Text style={styles.infoText}>
                                {getStatusText(comic.status)}
                            </Text>
                        </View>

                        <View style={styles.infoRow}>
                            <Ionicons name="layers-outline" size={16} color="#FF5252" />
                            <Text style={styles.infoText}>
                                {comic.chapter_count || 0} capítulos
                            </Text>
                        </View>

                        <View style={styles.infoRow}>
                            <Ionicons name="star-outline" size={16} color="#FF5252" />
                            <Text style={styles.infoText}>
                                {comic.bayesian_rating ? parseFloat(comic.bayesian_rating).toFixed(2) : 'N/A'} ({comic.rating_count?.toLocaleString() || '0'} votos)
                            </Text>
                        </View>

                        <View style={styles.infoRow}>
                            <Ionicons name="heart-outline" size={16} color="#FF5252" />
                            <Text style={styles.infoText}>
                                {comic.follow_count?.toLocaleString() || '0'} seguidores
                            </Text>
                        </View>

                        {isPremium && lastReadChapterInfo && (
                            <View style={styles.lastReadContainer}>
                                <Ionicons name="book-outline" size={18} color="#FFD700" />
                                <Text style={styles.lastReadText}>
                                    Último leído: Capítulo {lastReadChapterInfo.chap}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => navigation.navigate('Reader', { hid: lastReadChapterInfo.hid })}
                                    style={styles.goToLastReadButton}
                                    accessible={true}
                                    accessibilityLabel={`Ir al capítulo ${lastReadChapterInfo.chap}`}
                                    accessibilityRole="button"
                                >
                                    <Ionicons name="arrow-forward-circle-outline" size={20} color="#FFD700" />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>

                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={onShare}
                        accessible={true}
                        accessibilityLabel="Compartir cómic"
                        accessibilityRole="button"
                    >
                        <Ionicons name="share-social-outline" size={20} color="#FFF" />
                        <Text style={styles.actionButtonText}>Compartir</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.actionButton,
                            isPremium === false && styles.actionButtonLocked,
                            isFavorite && styles.actionButtonActive,
                        ]}
                        onPress={toggleFavorite}
                        disabled={favoriteLoading || isPremium === null || !currentUserUid || isPremium === false}
                        accessible={true}
                        accessibilityLabel={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
                        accessibilityRole="button"
                    >
                        {favoriteLoading ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <>
                                <Ionicons
                                    name={isFavorite ? "bookmark" : "bookmark-outline"}
                                    size={20}
                                    color="#FFF"
                                />
                                <Text style={styles.actionButtonText}>
                                    {isPremium === false ? 'Premium' : (isFavorite ? 'Favorito' : 'Favoritos')}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>

                    {isPremium !== null && (
                        <TouchableOpacity
                            style={[
                                styles.actionButton,
                                isPremium === false && styles.actionButtonLocked,
                                { backgroundColor: isMangaRead ? '#673AB7' : '#2196F3' }
                            ]}
                            onPress={toggleMangaReadStatus}
                            disabled={isPremium === null || !currentUserUid || isPremium === false}
                            accessible={true}
                            accessibilityLabel={
                                isPremium
                                    ? `Marcar manga como ${isMangaRead ? 'no leído' : 'leído'}`
                                    : 'Función Premium: Marcar manga como leído'
                            }
                            accessibilityRole="button"
                        >
                            {isPremium === null || !currentUserUid ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <>
                                    <Ionicons
                                        name={isMangaRead ? "book" : "book-outline"}
                                        size={20}
                                        color="#FFF"
                                    />
                                    <Text style={styles.actionButtonText}>
                                        {isPremium === false ? 'Premium' : (isMangaRead ? 'Leído' : 'Marcar Leído')}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}
                </View>

                {(comic.authors?.length ?? 0) > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="person-outline" size={20} color="#FF5252" />
                            <Text style={styles.subtitle}>Autor(es)</Text>
                        </View>
                        <Text style={styles.sectionContent}>
                            {comic.authors?.map((author: any) => author.name).join(', ')}
                        </Text>
                    </View>
                )}

                {(comic.artists?.length ?? 0) > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="color-palette-outline" size={20} color="#FF5252" />
                            <Text style={styles.subtitle}>Artista(s)</Text>
                        </View>
                        <Text style={styles.sectionContent}>
                            {comic.artists?.map((artist: any) => artist.name).join(', ')}
                        </Text>
                    </View>
                )}

                {(comic.md_comic_md_genres ?? []).length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="pricetags-outline" size={20} color="#FF5252" />
                            <Text style={styles.subtitle}>Géneros</Text>
                        </View>
                        <View style={styles.genreContainer}>
                            {(comic.md_comic_md_genres ?? []).map((genre: any, index: number) => (
                                <View key={index} style={styles.genreTag}>
                                    <Text style={styles.genreText}>{genre.md_genres.name}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {comic.desc && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="document-text-outline" size={20} color="#FF5252" />
                            <Text style={styles.subtitle}>Descripción</Text>
                        </View>
                        <Text style={styles.sectionContent}>
                            {comic.desc.replace(/<[^>]*>?/gm, '')}
                        </Text>
                    </View>
                )}
            </>
        );
    }, [comic, isPremium, lastReadChapterInfo, isFavorite, favoriteLoading, currentUserUid, isMangaRead, getStatusText, onShare, toggleFavorite, toggleMangaReadStatus, navigation]);

    return (
        <LinearGradient colors={['#1A1A24', '#2C2C38']} style={styles.container}>
            <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
            <SafeAreaView style={[styles.safeArea, { paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : insets.top }]}>
                {loadingComic || isPremium === null ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color="#FF5252" />
                        <Text style={styles.loadingText}>Cargando detalles del cómic...</Text>
                        {isPremium === null && <Text style={styles.loadingText}>Verificando estado premium...</Text>}
                    </View>
                ) : comicError ? (
                    <View style={styles.center}>
                        <Text style={styles.errorText}>Error: {comicError}</Text>
                    </View>
                ) : !comic ? (
                    <View style={styles.center}>
                        <Text style={styles.errorText}>No se encontraron detalles para este cómic.</Text>
                    </View>
                ) : (
                    <ScrollView
                        style={styles.scrollViewContent}
                        contentContainerStyle={styles.scrollViewContainer}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                colors={['#FF5252']}
                                tintColor={'#FF5252'}
                            />
                        }
                    >
                        <View style={styles.topBar}>
                            <TouchableOpacity
                                onPress={() => {
                                    navigation.goBack();
                                    AccessibilityInfo.isScreenReaderEnabled().then((isEnabled) => {
                                        if (isEnabled) {
                                            AccessibilityInfo.announceForAccessibility("Volver atrás");
                                        }
                                    });
                                }}
                                style={styles.backButton}
                                accessible={true}
                                accessibilityLabel="Volver atrás"
                                accessibilityRole="button"
                            >
                                <Ionicons name="arrow-back" size={28} color="#FF5252" />
                            </TouchableOpacity>
                            <Text style={styles.topBarTitle} numberOfLines={1} ellipsizeMode="tail">
                                {comic.title}
                            </Text>
                        </View>

                        {memoizedComicDetails}

                        <TouchableOpacity
                            style={styles.commentsButton}
                            onPress={handleViewComments}
                        >
                            <LinearGradient
                                colors={['#FF5252', '#FF1744']}
                                style={styles.commentsButtonGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <View style={styles.commentsButtonContent}>
                                    <Ionicons name="chatbubble-ellipses-outline" size={20} color="#FFF" />
                                    <Text style={styles.commentsButtonText}>Ver Comentarios</Text>
                                    <View style={styles.commentsCountBadge}>
                                        <Text style={styles.commentsCountText}>NEW</Text>
                                    </View>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>

                        <View style={styles.section}>
                            <View style={styles.chapterHeader}>
                                <View style={styles.sectionHeader}>
                                    <Ionicons name="list-outline" size={20} color="#FF5252" />
                                    <Text style={styles.subtitle}>Capítulos</Text>
                                </View>
                                <View style={styles.chapterControls}>
                                    <TouchableOpacity
                                        style={styles.filterButton}
                                        onPress={toggleChapterOrder}
                                        accessible={true}
                                        accessibilityLabel={`Ordenar capítulos ${chapterOrder === 0 ? 'ascendente' : 'descendente'}`}
                                        accessibilityRole="button"
                                    >
                                        <Ionicons
                                            name={chapterOrder === 0 ? "arrow-up-circle-outline" : "arrow-down-circle-outline"}
                                            size={18}
                                            color="#FF5252"
                                        />
                                        <Text style={styles.filterButtonText}>
                                            {chapterOrder === 0 ? 'Asc.' : 'Desc.'}
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.filterButton}
                                        onPress={toggleLanguage}
                                        accessible={true}
                                        accessibilityLabel={`Cambiar idioma. Actual: ${selectedLanguage}`}
                                        accessibilityRole="button"
                                    >
                                        <Ionicons name="language-outline" size={18} color="#FF5252" />
                                        <Text style={styles.filterButtonText}>
                                            {(selectedLanguage === 'es-419' ? 'es-LA' : selectedLanguage).toUpperCase()}
                                        </Text>
                                    </TouchableOpacity>

                                    {availableGroups.length > 1 && (
                                        <TouchableOpacity
                                            style={styles.filterButton}
                                            onPress={toggleGroup}
                                            accessible={true}
                                            accessibilityLabel={`Cambiar grupo. Actual: ${selectedGroup}`}
                                            accessibilityRole="button"
                                        >
                                            <Ionicons name="people-outline" size={18} color="#FF5252" />
                                            <Text style={styles.filterButtonText} numberOfLines={1} ellipsizeMode="tail">
                                                {selectedGroup.length > 10 ? selectedGroup.substring(0, 7) + '...' : selectedGroup}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>

                            {loadingAllChapters && (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator size="small" color="#FF5252" />
                                    <Text style={styles.loadingText}>Cargando todos los capítulos...</Text>
                                </View>
                            )}

                            {chaptersError && <Text style={styles.errorText}>{chaptersError}</Text>}
                            {memoizedChapterList}
                        </View>
                    </ScrollView>
                )}
            </SafeAreaView>
        </LinearGradient>
    );
};

// Estilos (sin cambios)
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    scrollViewContent: {
        flexGrow: 1,
    },
    scrollViewContainer: {
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1A1A24',
    },
    loadingText: {
        color: '#FFFFFF',
        marginTop: 10,
        fontSize: 16,
        fontFamily: 'Roboto-Medium',
    },
    errorText: {
        color: '#FF5252',
        fontSize: 16,
        textAlign: 'center',
        fontFamily: 'Roboto-Regular',
        marginVertical: 20,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        marginBottom: 16,
    },
    backButton: {
        position: 'absolute',
        left: 0,
        padding: 8,
        zIndex: 1,
    },
    topBarTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
        fontFamily: 'Roboto-Bold',
        flex: 1,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    headerContainer: {
        flexDirection: 'row',
        marginBottom: 20,
        backgroundColor: 'rgba(30, 30, 30, 0.8)',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 6,
    },
    coverImage: {
        width: SCREEN_WIDTH * 0.35,
        height: SCREEN_WIDTH * 0.35 * 1.5,
        borderRadius: 8,
        marginRight: 16,
        backgroundColor: '#333',
    },
    infoColumn: {
        flex: 1,
        justifyContent: 'space-between',
    },
    title: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
        fontFamily: 'Roboto-Bold',
        marginBottom: 8,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    infoText: {
        color: '#E0E0E0',
        fontSize: 14,
        marginLeft: 6,
        fontFamily: 'Roboto-Regular',
    },
    lastReadContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 215, 0, 0.15)',
        borderRadius: 20,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginTop: 8,
        marginBottom: 4,
    },
    lastReadText: {
        color: '#FFD700',
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: 'Roboto-Bold',
        marginLeft: 8,
        flex: 1,
    },
    goToLastReadButton: {
        paddingLeft: 8,
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#4CAF50',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 25,
        flex: 1,
        marginHorizontal: 4,
    },
    actionButtonText: {
        color: '#FFFFFF',
        marginLeft: 8,
        fontWeight: 'bold',
        fontSize: 14,
        fontFamily: 'Roboto-Bold',
    },
    actionButtonActive: {
        backgroundColor: '#FF5252',
    },
    actionButtonLocked: {
        backgroundColor: '#6A6A6A',
        opacity: 0.7,
    },
    section: {
        marginBottom: 10,
        backgroundColor: 'rgba(30, 30, 30, 0.8)',
        borderRadius: 12,
        padding: 16,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    subtitle: {
        color: '#FF5252',
        fontSize: 18,
        fontWeight: 'bold',
        fontFamily: 'Roboto-Bold',
        marginLeft: 8,
    },
    sectionContent: {
        color: '#E0E0E0',
        fontSize: 14,
        lineHeight: 20,
        fontFamily: 'Roboto-Regular',
    },
    genreContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    genreTag: {
        backgroundColor: '#333333',
        borderRadius: 16,
        paddingVertical: 6,
        paddingHorizontal: 12,
        marginRight: 8,
        marginBottom: 8,
    },
    genreText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontFamily: 'Roboto-Medium',
    },
    chapterHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    chapterControls: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        flexShrink: 1,
        gap: 6,
    },
    filterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 82, 82, 0.15)',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 82, 82, 0.4)',
    },
    filterButtonText: {
        color: '#FFD1D1',
        marginLeft: 6,
        fontSize: 12,
        fontFamily: 'Roboto-Medium',
    },
    chapterItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
    },
    chapterItemRead: {
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        borderLeftWidth: 4,
        borderLeftColor: '#4CAF50',
    },
    chapterItemContent: {
        flex: 1,
        marginRight: 12,
    },
    chapterTitle: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: 'Roboto-Bold',
        marginBottom: 4,
    },
    chapterSubtitle: {
        color: '#E0E0E0',
        fontSize: 13,
        fontFamily: 'Roboto-Regular',
    },
    chapterInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
        flexWrap: 'wrap',
    },
    chapterGroup: {
        color: '#B0B0B0',
        fontSize: 12,
        fontFamily: 'Roboto-Regular',
        marginRight: 8,
        flexShrink: 1,
    },
    chapterLang: {
        color: '#FF5252',
        fontSize: 12,
        fontWeight: 'bold',
        fontFamily: 'Roboto-Bold',
        marginRight: 8,
    },
    chapterDate: {
        color: '#B0B0B0',
        fontSize: 11,
        fontFamily: 'Roboto-Regular',
    },
    loadingMore: {
        marginVertical: 16,
        alignItems: 'center',
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
    },
    emptyChaptersText: {
        color: '#E0E0E0',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 16,
        fontFamily: 'Roboto-Regular',
    },
    commentsButton: {
        borderRadius: 25,
        overflow: 'hidden',
        marginVertical: 15,
        shadowColor: '#FF5252',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 6,
    },
    commentsButtonGradient: {
        paddingVertical: 12,
        paddingHorizontal: 20,
    },
    commentsButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    commentsButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
        marginLeft: 8,
        fontFamily: 'Roboto-Bold',
    },
    commentsCountBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 12,
        paddingVertical: 2,
        paddingHorizontal: 8,
        marginLeft: 10,
    },
    commentsCountText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: 'bold',
    },
});

export default React.memo(DetailsScreen);