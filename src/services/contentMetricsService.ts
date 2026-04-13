import { collection, doc, getDoc, getDocs, increment, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/config';

export type ReadingMetrics = {
    totalRead: number;
    totalReadingTimeMs: number;
    favorites: number;
};

export type WatchingMetrics = {
    totalWatched: number;
    totalWatchingTimeMs: number;
    favorites: number;
};

const safeNumber = (value: any) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const getReadingMetrics = async (userId: string): Promise<ReadingMetrics> => {
    const userDocRef = doc(db, 'users', userId);
    const favoritesRef = collection(db, 'users', userId, 'favorites');
    const readMangaRef = collection(db, 'users', userId, 'readComics');
    const readMangaQuery = query(readMangaRef, where('isFullMangaRead', '==', true));

    const [userDocSnap, favoritesSnap, readMangaSnap] = await Promise.all([
        getDoc(userDocRef),
        getDocs(favoritesRef),
        getDocs(readMangaQuery),
    ]);

    return {
        totalRead: readMangaSnap.size,
        totalReadingTimeMs: safeNumber(userDocSnap.data()?.totalReadingTime),
        favorites: favoritesSnap.size,
    };
};

export const getWatchingMetrics = async (userId: string): Promise<WatchingMetrics> => {
    const userDocRef = doc(db, 'users', userId);
    const animeFavoritesRef = collection(db, 'users', userId, 'animeFavorites');
    const watchedAnimeRef = collection(db, 'users', userId, 'watchedAnime');
    const watchedAnimeQuery = query(watchedAnimeRef, where('isCompleted', '==', true));

    const [userDocSnap, animeFavoritesSnap, watchedAnimeSnap] = await Promise.all([
        getDoc(userDocRef),
        getDocs(animeFavoritesRef),
        getDocs(watchedAnimeQuery),
    ]);

    return {
        totalWatched: watchedAnimeSnap.size,
        totalWatchingTimeMs: safeNumber(userDocSnap.data()?.totalWatchingTime),
        favorites: animeFavoritesSnap.size,
    };
};

export const recordReadingTimeMetric = async (userId: string, durationMs: number) => {
    const normalizedDuration = Math.max(0, Math.floor(durationMs));
    if (!normalizedDuration) return;

    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, {
        totalReadingTime: increment(normalizedDuration),
    });
};

export const recordWatchingTimeMetric = async (userId: string, durationMs: number) => {
    const normalizedDuration = Math.max(0, Math.floor(durationMs));
    if (!normalizedDuration) return;

    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, {
        totalWatchingTime: increment(normalizedDuration),
    });
};
