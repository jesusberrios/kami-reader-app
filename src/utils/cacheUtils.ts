// utils/cacheUtils.js
import AsyncStorage from '@react-native-async-storage/async-storage';

// Tiempo de expiración de la caché: 5 minutos (5 * 60 * 1000 milisegundos)
const CACHE_EXPIRATION_TIME = 5 * 60 * 1000;

export const getCachedData = async (key: any) => {
    try {
        const cachedString = await AsyncStorage.getItem(key);
        if (cachedString) {
            const { data, timestamp } = JSON.parse(cachedString);
            // Verifica si la caché no ha expirado
            if (Date.now() - timestamp < CACHE_EXPIRATION_TIME) {
                console.log(`[Cache] Hit for ${key}`);
                return data;
            } else {
                console.log(`[Cache] Expired for ${key}. Clearing...`);
                await AsyncStorage.removeItem(key); // Limpia la caché expirada
            }
        }
    } catch (error) {
        console.error(`[Cache Error] Failed to get cached data for ${key}:`, error);
    }
    return null; // Retorna null si no hay caché, hay un error o está expirada
};

export const setCacheData = async (key: any, data: any) => {
    try {
        const timestamp = Date.now();
        const dataToCache = JSON.stringify({ data, timestamp });
        await AsyncStorage.setItem(key, dataToCache);
        console.log(`[Cache] Set for ${key}`);
    } catch (error) {
        console.error(`[Cache Error] Failed to set cached data for ${key}:`, error);
    }
};

// Opcional: Función para limpiar una caché específica (útil para debug o logout)
export const clearCache = async (key: any) => {
    try {
        await AsyncStorage.removeItem(key);
        console.log(`[Cache] Cleared ${key}`);
    } catch (error) {
        console.error(`[Cache Error] Failed to clear cache for ${key}:`, error);
    }
};

// Opcional: Función para limpiar toda la caché
export const clearAllCache = async () => {
    try {
        await AsyncStorage.clear();
        console.log("[Cache] All cache cleared.");
    } catch (error) {
        console.error("[Cache Error] Failed to clear all cache:", error);
    }
};