const PROD_BACKEND_URL = 'https://backend-kami-api-production.up.railway.app';
const LOCAL_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_LOCAL_URL || 'http://192.168.1.134:3000';
const FORCED_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export const BACKEND_URL = (FORCED_BACKEND_URL || (__DEV__ ? LOCAL_BACKEND_URL : PROD_BACKEND_URL)).trim();

const dedupe = (values: string[]) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const normalized = String(value || '').trim().replace(/\/$/, '');
        if (!normalized) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return out;
};

export const BACKEND_URL_CANDIDATES = dedupe(
    FORCED_BACKEND_URL
        ? [FORCED_BACKEND_URL]
        : (__DEV__ ? [LOCAL_BACKEND_URL, 'http://10.0.2.2:3000'] : [PROD_BACKEND_URL, LOCAL_BACKEND_URL])
);

export const backendUrl = (path: string) => {
    const base = String(BACKEND_URL || '').replace(/\/$/, '');
    const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
};

export const backendUrlFromBase = (baseUrl: string, path: string) => {
    const base = String(baseUrl || '').replace(/\/$/, '');
    const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
};
