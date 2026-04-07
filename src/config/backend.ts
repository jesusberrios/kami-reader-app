const PROD_BACKEND_URL = 'https://backend-kami-api-production.up.railway.app';
const LOCAL_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_LOCAL_URL || 'http://192.168.1.20:3000';
const FORCED_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export const BACKEND_URL = (FORCED_BACKEND_URL || (__DEV__ ? LOCAL_BACKEND_URL : PROD_BACKEND_URL)).trim();

export const backendUrl = (path: string) => {
    const base = String(BACKEND_URL || '').replace(/\/$/, '');
    const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
};
