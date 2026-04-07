import { backendUrl } from '../config/backend';

type QueryValue = string | number | boolean | null | undefined;
type Query = Record<string, QueryValue>;

type FetchOptions = {
    timeoutMs?: number;
    ttlMs?: number;
    forceRefresh?: boolean;
};

type CacheEntry<T> = {
    ts: number;
    data: T;
};

const DEFAULT_TIMEOUT_MS = 8000;
const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const MAX_MEMORY_CACHE_ENTRIES = 240;

const trimMemoryCacheIfNeeded = () => {
    if (memoryCache.size <= MAX_MEMORY_CACHE_ENTRIES) return;

    // Remove the oldest entries first to keep memory bounded.
    const overflow = memoryCache.size - MAX_MEMORY_CACHE_ENTRIES;
    const iterator = memoryCache.keys();
    for (let i = 0; i < overflow; i += 1) {
        const next = iterator.next();
        if (next.done) break;
        memoryCache.delete(next.value);
    }
};

const buildQueryString = (query?: Query) => {
    if (!query) return '';
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || String(value).trim() === '') continue;
        params.append(key, String(value));
    }

    return params.toString();
};

const buildKey = (path: string, query?: Query) => {
    const qs = buildQueryString(query);
    return `${path}${qs ? `?${qs}` : ''}`;
};

const fetchJson = async <T>(path: string, query?: Query, options?: FetchOptions): Promise<T> => {
    const timeoutMs = Number(options?.timeoutMs || DEFAULT_TIMEOUT_MS);
    const ttlMs = Math.max(0, Number(options?.ttlMs || 0));
    const forceRefresh = options?.forceRefresh === true;

    const key = buildKey(path, query);

    if (!forceRefresh && ttlMs > 0) {
        const cached = memoryCache.get(key) as CacheEntry<T> | undefined;
        if (cached && Date.now() - cached.ts <= ttlMs) {
            return cached.data;
        }
    }

    const inFlightRequest = inFlight.get(key) as Promise<T> | undefined;
    if (inFlightRequest) return inFlightRequest;

    const queryString = buildQueryString(query);
    const url = `${backendUrl(path)}${queryString ? `?${queryString}` : ''}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let requestPromise;
    requestPromise = (async () => {
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
            const data = (await response.json()) as T;

            if (ttlMs > 0) {
                memoryCache.set(key, { ts: Date.now(), data });
                trimMemoryCacheIfNeeded();
            }

            return data;
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                throw new Error('Tiempo de espera agotado. No se pudo conectar al backend.');
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
            if (inFlight.get(key) === requestPromise) {
                inFlight.delete(key);
            }
        }
    })();

    inFlight.set(key, requestPromise as Promise<unknown>);
    return requestPromise;
};

export const getLatestManga = (query?: Query, options?: FetchOptions) =>
    fetchJson<{ results?: any[]; pagination?: { totalPages?: number } }>('/latest', query, options);

export const getMangaDetails = (slug: string, options?: FetchOptions) =>
    fetchJson<{ manga?: any }>(`/manga/${encodeURIComponent(slug)}`, undefined, options);

export const getChapterImages = (mangaSlug: string, chapterSlug: string, options?: FetchOptions) =>
    fetchJson<{ images?: any[] }>(
        `/chapter/${encodeURIComponent(mangaSlug)}/${encodeURIComponent(chapterSlug)}/images`,
        undefined,
        options
    );

export const searchManga = (query?: Query, options?: FetchOptions) =>
    fetchJson<{ results?: any[]; pagination?: { totalPages?: number } }>('/search', query, options);
