import { BACKEND_URL_CANDIDATES, backendUrlFromBase } from '../config/backend';

type QueryValue = string | number | boolean | null | undefined;
type Query = Record<string, QueryValue>;

type FetchOptions = {
    timeoutMs?: number;
    ttlMs?: number;
    forceRefresh?: boolean;
    strictStreams?: boolean;
    streamMode?: 'native' | 'web';
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
    const candidates = Array.isArray(BACKEND_URL_CANDIDATES) && BACKEND_URL_CANDIDATES.length > 0
        ? BACKEND_URL_CANDIDATES
        : [];

    let requestPromise;
    requestPromise = (async () => {
        let lastError: any = null;
        try {
            for (let i = 0; i < candidates.length; i += 1) {
                const baseUrl = candidates[i];
                const url = `${backendUrlFromBase(baseUrl, path)}${queryString ? `?${queryString}` : ''}`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

                try {
                    const response = await fetch(url, { signal: controller.signal });
                    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
                    const data = (await response.json()) as T;

                    if (ttlMs > 0) {
                        memoryCache.set(key, { ts: Date.now(), data });
                        trimMemoryCacheIfNeeded();
                    }

                    if (i > 0) {
                        console.log(`[backendApi] Failover success via ${baseUrl}`);
                    }

                    return data;
                } catch (error: any) {
                    lastError = error;
                    const isAbort = error?.name === 'AbortError';
                    const isLastCandidate = i === candidates.length - 1;
                    if (!isLastCandidate) {
                        console.warn(`[backendApi] Candidate failed (${baseUrl}): ${isAbort ? 'timeout' : (error?.message || 'network_error')}`);
                    }
                } finally {
                    clearTimeout(timeoutId);
                }
            }

            if (lastError?.name === 'AbortError') {
                throw new Error('Tiempo de espera agotado. No se pudo conectar al backend.');
            }

            throw lastError || new Error('No se pudo conectar al backend.');
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                throw new Error('Tiempo de espera agotado. No se pudo conectar al backend.');
            }
            throw error;
        } finally {
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

export const getLatestAnime = (query?: Query, options?: FetchOptions) =>
    fetchJson<{ results?: any[]; pagination?: { totalPages?: number } }>('/anime/latest', query, options);

export const getAnimeDetails = (slug: string, options?: FetchOptions) =>
    fetchJson<{ anime?: any }>(`/anime/${encodeURIComponent(slug)}`, undefined, options);

export const getAnimeEpisodes = (slug: string, options?: FetchOptions) =>
    fetchJson<{ episodes?: any[] }>(`/anime/${encodeURIComponent(slug)}/episodes`, undefined, options);

export const getEpisodeStreams = (animeSlug: string, episodeSlug: string, options?: FetchOptions) =>
    fetchJson<{ streams?: any[] }>(
        `/anime/${encodeURIComponent(animeSlug)}/episodes/${encodeURIComponent(episodeSlug)}/streams`,
        {
            strict: options?.strictStreams === true ? 1 : 0,
            mode: options?.streamMode || undefined,
            t: options?.forceRefresh ? Date.now() : undefined,
        },
        options
    );

export const searchAnime = (query?: Query, options?: FetchOptions) =>
    fetchJson<{ results?: any[]; pagination?: { totalPages?: number } }>('/anime/search', query, options);
