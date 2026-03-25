import { collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/config';

export type ReaderAchievement = {
    id: string;
    name: string;
    icon: string;
    description: string;
    target: number;
    valueType: 'totalRead' | 'hoursSpent' | 'favorites';
};

export type ReadingStats = {
    totalRead: number;
    totalReadingTimeMs: number;
    hoursSpent: number;
    favorites: number;
};

export const READER_ACHIEVEMENTS: ReaderAchievement[] = [
    {
        id: 'first-read',
        name: 'Primer Capitulo',
        icon: 'book-outline',
        description: 'Completa tu primera lectura.',
        target: 1,
        valueType: 'totalRead',
    },
    {
        id: 'avid-reader',
        name: 'Lector Frecuente',
        icon: 'library-outline',
        description: 'Completa 5 mangas.',
        target: 5,
        valueType: 'totalRead',
    },
    {
        id: 'bookworm',
        name: 'Devorador de Mangas',
        icon: 'flame-outline',
        description: 'Completa 20 mangas.',
        target: 20,
        valueType: 'totalRead',
    },
    {
        id: 'marathon',
        name: 'Maratonista',
        icon: 'time-outline',
        description: 'Acumula 10 horas de lectura.',
        target: 10,
        valueType: 'hoursSpent',
    },
    {
        id: 'collector',
        name: 'Coleccionista',
        icon: 'heart-outline',
        description: 'Guarda 10 favoritos.',
        target: 10,
        valueType: 'favorites',
    },
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
    const readComicsRef = collection(db, 'users', userId, 'readComics');
    const readComicsQuery = query(readComicsRef, where('isFullMangaRead', '==', true));

    const [userDocSnap, favoritesSnap, readComicsSnap] = await Promise.all([
        getDoc(userDocRef),
        getDocs(favoritesRef),
        getDocs(readComicsQuery),
    ]);

    const totalReadingTimeMs = Number(userDocSnap.data()?.totalReadingTime || 0);

    return {
        totalRead: readComicsSnap.size,
        totalReadingTimeMs,
        hoursSpent: totalReadingTimeMs / (1000 * 60 * 60),
        favorites: favoritesSnap.size,
    };
};

export const getAchievementProgress = (achievement: ReaderAchievement, stats: ReadingStats): number => {
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

    const normalizedCurrent = [...currentUnlocked].sort().join(',');
    const normalizedNext = [...unlockedIds].sort().join(',');

    if (normalizedCurrent === normalizedNext) return;

    await updateDoc(userDocRef, {
        achievementsUnlocked: unlockedIds,
    });
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
