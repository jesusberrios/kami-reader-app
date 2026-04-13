import { collection, deleteDoc, doc, getDoc, getDocs, increment, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { EVENT_ACHIEVEMENTS } from '../config/eventCatalog';

type ReadComicMetadata = {
    comicTitle: string;
    coverUrl: string;
    slug: string;
};

export type ReaderAchievement = {
    id: string;
    name: string;
    icon: string;
    description: string;
    target: number;
    valueType: 'totalRead' | 'hoursSpent' | 'favorites' | 'coinsEarned';
    minHoursSpent?: number;
};

export type ReadingStats = {
    totalRead: number;
    mangaCompleted: number;
    animeCompleted: number;
    totalReadingTimeMs: number;
    totalWatchingTimeMs: number;
    totalTimeSpentMs: number;
    hoursSpent: number;
    favorites: number;
    mangaFavorites: number;
    animeFavorites: number;
    coinsEarned: number;
};

export const READER_ACHIEVEMENTS: ReaderAchievement[] = [
    {
        id: 'first-read',
        name: 'Primera Serie',
        icon: 'book-outline',
        description: 'Completa tu primera serie (manga o anime).',
        target: 1,
        valueType: 'totalRead',
    },
    {
        id: 'avid-reader',
        name: 'Explorador Frecuente',
        icon: 'library-outline',
        description: 'Completa 5 series entre manga y anime.',
        target: 5,
        valueType: 'totalRead',
    },
    {
        id: 'bookworm',
        name: 'Otaku Constante',
        icon: 'flame-outline',
        description: 'Completa 20 series entre manga y anime.',
        target: 20,
        valueType: 'totalRead',
    },
    {
        id: 'marathon',
        name: 'Maratonista',
        icon: 'time-outline',
        description: 'Acumula 10 horas entre lectura y reproduccion.',
        target: 10,
        valueType: 'hoursSpent',
    },
    {
        id: 'collector',
        name: 'Coleccionista',
        icon: 'heart-outline',
        description: 'Guarda 10 favoritos entre manga y anime.',
        target: 10,
        valueType: 'favorites',
    },
    ...EVENT_ACHIEVEMENTS,
];

export const formatReadingTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return '0m';
};

export const getUserReadingStats = async (userId: string): Promise<ReadingStats> => {
    const userDocRef = doc(db, 'users', userId);
    const favoritesRef = collection(db, 'users', userId, 'favorites');
    const animeFavoritesRef = collection(db, 'users', userId, 'animeFavorites');
    const readComicsRef = collection(db, 'users', userId, 'readComics');
    const watchedAnimeRef = collection(db, 'users', userId, 'watchedAnime');
    const readComicsQuery = query(readComicsRef, where('isFullMangaRead', '==', true));
    const watchedAnimeQuery = query(watchedAnimeRef, where('isCompleted', '==', true));

    const [userDocSnap, favoritesSnap, animeFavoritesSnap, readComicsSnap, watchedAnimeSnap] = await Promise.all([
        getDoc(userDocRef),
        getDocs(favoritesRef),
        getDocs(animeFavoritesRef),
        getDocs(readComicsQuery),
        getDocs(watchedAnimeQuery),
    ]);

    const totalReadingTimeMs = Number(userDocSnap.data()?.totalReadingTime || 0);
    const totalWatchingTimeMs = Number(userDocSnap.data()?.totalWatchingTime || 0);
    const coinsEarned = Number(userDocSnap.data()?.coins || 0);
    const mangaCompleted = readComicsSnap.size;
    const animeCompleted = watchedAnimeSnap.size;
    const mangaFavorites = favoritesSnap.size;
    const animeFavorites = animeFavoritesSnap.size;
    const totalTimeSpentMs = totalReadingTimeMs + totalWatchingTimeMs;

    return {
        totalRead: mangaCompleted + animeCompleted,
        mangaCompleted,
        animeCompleted,
        totalReadingTimeMs,
        totalWatchingTimeMs,
        totalTimeSpentMs,
        hoursSpent: totalTimeSpentMs / (1000 * 60 * 60),
        favorites: mangaFavorites + animeFavorites,
        mangaFavorites,
        animeFavorites,
        coinsEarned,
    };
};

export const getAchievementProgress = (achievement: ReaderAchievement, stats: ReadingStats): number => {
    if (achievement.minHoursSpent && stats.hoursSpent < achievement.minHoursSpent) {
        return 0;
    }

    const value = achievement.valueType === 'hoursSpent'
        ? stats.hoursSpent
        : stats[achievement.valueType];

    if (achievement.target <= 0) return 0;
    return Math.min(value / achievement.target, 1);
};

export const getUnlockedAchievementIds = (stats: ReadingStats): string[] => {
    return READER_ACHIEVEMENTS
        .filter((achievement) => getAchievementProgress(achievement, stats) >= 1)
        .map((achievement) => achievement.id);
};

export const syncUserAchievements = async (userId: string, unlockedIds: string[]) => {
    const userDocRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userDocRef);
    const currentUnlocked = Array.isArray(userSnap.data()?.achievementsUnlocked)
        ? userSnap.data()?.achievementsUnlocked
        : [];

    const mergedUnlocked = Array.from(new Set([...currentUnlocked, ...unlockedIds]));

    const normalizedCurrent = [...currentUnlocked].sort().join(',');
    const normalizedNext = [...mergedUnlocked].sort().join(',');

    if (normalizedCurrent === normalizedNext) return;

    await updateDoc(userDocRef, {
        achievementsUnlocked: mergedUnlocked,
    });
};

export const recordReadingTime = async (userId: string, durationMs: number) => {
    const normalizedDuration = Math.max(0, Math.floor(durationMs));
    if (!normalizedDuration) return;

    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, {
        totalReadingTime: increment(normalizedDuration),
    });
};

export const recordReadingTimeAndSyncAchievements = async (userId: string, durationMs: number) => {
    await recordReadingTime(userId, durationMs);
    const stats = await getUserReadingStats(userId);
    const unlockedIds = getUnlockedAchievementIds(stats);
    await syncUserAchievements(userId, unlockedIds);
};

export const awardReadingCoinAndSyncAchievements = async (userId: string, amount = 1) => {
    const normalizedAmount = Math.max(0, Math.floor(amount));
    if (!normalizedAmount) return;

    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, {
        coins: increment(normalizedAmount),
    });

    const stats = await getUserReadingStats(userId);
    const unlockedIds = getUnlockedAchievementIds(stats);
    await syncUserAchievements(userId, unlockedIds);
};

export const syncFullMangaReadState = async (
    userId: string,
    mangaSlug: string,
    chapterIds: string[],
    metadata: ReadComicMetadata,
) => {
    const normalizedChapterIds = chapterIds.map((chapterId) => String(chapterId || '').trim()).filter(Boolean);
    const comicReadDocRef = doc(db, 'users', userId, 'readComics', mangaSlug);
    const chaptersReadSnap = await getDocs(collection(comicReadDocRef, 'chaptersRead'));
    const readChapterIds = new Set(chaptersReadSnap.docs.map((chapterDoc) => String(chapterDoc.id || '').trim()).filter(Boolean));
    const isFullMangaRead = normalizedChapterIds.length > 0 && normalizedChapterIds.every((chapterId) => readChapterIds.has(chapterId));

    await setDoc(comicReadDocRef, {
        ...metadata,
        isFullMangaRead,
    }, { merge: true });

    const stats = await getUserReadingStats(userId);
    const unlockedIds = getUnlockedAchievementIds(stats);
    await syncUserAchievements(userId, unlockedIds);

    return isFullMangaRead;
};

export const resetUserReadingStats = async (userId: string) => {
    const userDocRef = doc(db, 'users', userId);
    const readComicsRef = collection(db, 'users', userId, 'readComics');
    const readComicsSnap = await getDocs(readComicsRef);

    await Promise.all(readComicsSnap.docs.map((readDoc) => deleteDoc(readDoc.ref)));

    await updateDoc(userDocRef, {
        totalReadingTime: 0,
        achievementsUnlocked: [],
    });
};
