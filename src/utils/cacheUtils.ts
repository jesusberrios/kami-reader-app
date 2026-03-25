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
                return data;
            } else {
                await AsyncStorage.removeItem(key); // Limpia la caché expirada
            }
        }
    } catch {
        // silently ignored
    }
    return null; // Retorna null si no hay caché, hay un error o está expirada
};

export const setCacheData = async (key: any, data: any) => {
    try {
        const timestamp = Date.now();
        const dataToCache = JSON.stringify({ data, timestamp });
        await AsyncStorage.setItem(key, dataToCache);
    } catch {
        // silently ignored
    }
};

// Opcional: Función para limpiar una caché específica (útil para debug o logout)
export const clearCache = async (key: any) => {
    try {
        await AsyncStorage.removeItem(key);
    } catch {
        // silently ignored
    }
};

// Opcional: Función para limpiar toda la caché
export const clearAllCache = async () => {
    try {
        await AsyncStorage.clear();
    } catch {
        // silently ignored
    }
};