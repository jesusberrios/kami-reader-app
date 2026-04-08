import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TextInput,
    TouchableOpacity,
    Modal,
    ScrollView,
    Dimensions,
    StatusBar,
    Platform,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useAlertContext } from '../contexts/AlertContext';
import { usePersonalization } from '../contexts/PersonalizationContext';
import { backendUrl } from '../config/backend';
import { getProviderAliasLabel, normalizeProviderSource } from '../utils/providerBranding';

const REQUEST_TIMEOUT_MS = 8000;
const PAGE_LIMIT = 32;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const LIBRARY_CACHE_TTL_MS = 2 * 60 * 1000;

type Comic = {
    slug: string;
    title: string;
    cover: string;
    source: string;
    score?: string;
    totalChapters?: number;
    description?: string;
    status?: string;
    statusLabel?: string;
    contentRating?: string;
    genres?: string[];
    badges?: string[];
    normalizedTitle?: string;
    normalizedDescription?: string;
    normalizedSlug?: string;
};

type SortKey = 'default' | 'title_asc' | 'title_desc' | 'score_desc';
type SourceKey = 'all' | 'zonatmo' | 'visormanga' | 'manhwaweb' | 'zonaikigai';
type StatusKey = 'all' | 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';
type RatingKey = 'all' | 'safe' | 'suggestive' | 'erotica';

type FilterOption = {
    label: string;
    value: string;
};

const { width } = Dimensions.get('window');

const SORT_OPTIONS: FilterOption[] = [
    { label: 'Más recientes', value: 'default' },
    { label: 'Título A-Z', value: 'title_asc' },
    { label: 'Título Z-A', value: 'title_desc' },
    { label: 'Mejor puntuados', value: 'score_desc' },
];

const SOURCE_OPTIONS: FilterOption[] = [
    { label: 'Todas', value: 'all' },
    { label: 'Luna Atlas', value: 'zonatmo' },
    { label: 'Neko Shelf', value: 'visormanga' },
    { label: 'Kumo Verse', value: 'manhwaweb' },
    { label: 'Yoru Realm', value: 'zonaikigai' },
];

const STATUS_OPTIONS: FilterOption[] = [
    { label: 'Todos', value: 'all' },
    { label: 'En curso', value: 'ongoing' },
    { label: 'Completado', value: 'completed' },
    { label: 'En pausa', value: 'hiatus' },
    { label: 'Cancelado', value: 'cancelled' },
    { label: 'Desconocido', value: 'unknown' },
];

const RATING_OPTIONS: FilterOption[] = [
    { label: 'Todos', value: 'all' },
    { label: 'Seguro', value: 'safe' },
    { label: 'Suggestivo', value: 'suggestive' },
    { label: '18+', value: 'erotica' },
];

const getStatusLabel = (value?: string, fallbackLabel?: string) => {
    if (fallbackLabel) return fallbackLabel;
    const raw = String(value || '').toLowerCase();
    if (raw.includes('ongoing') || raw.includes('curso')) return 'En curso';
    if (raw.includes('completed') || raw.includes('finaliz') || raw.includes('complet')) return 'Finalizado';
    if (raw.includes('hiatus') || raw.includes('pausa')) return 'En pausa';
    if (raw.includes('cancel')) return 'Cancelado';
    return 'Desconocido';
};

const getStatusBadgeLabel = (item: Comic) => {
    const label = getStatusLabel(item.status, item.statusLabel);
    if (label !== 'Desconocido') return label;
    if (Number(item.totalChapters || 0) > 0) return `Cap. ${item.totalChapters}`;
    if (String(item.contentRating || '').toLowerCase() === 'erotica') return '18+';
    return 'Actualizado';
};

const getStatusBadgeStyles = (value?: string) => {
    const raw = String(value || '').toLowerCase();
    if (raw.includes('completed') || raw.includes('finaliz') || raw.includes('complet')) {
        return { backgroundColor: 'rgba(76, 217, 100, 0.88)', textColor: '#F4FFF6' };
    }
    if (raw.includes('hiatus') || raw.includes('pausa')) {
        return { backgroundColor: 'rgba(255, 179, 71, 0.92)', textColor: '#1A1200' };
    }
    if (raw.includes('cancel')) {
        return { backgroundColor: 'rgba(229, 57, 53, 0.9)', textColor: '#FFECEC' };
    }
    return { backgroundColor: 'rgba(66, 165, 245, 0.9)', textColor: '#ECF6FF' };
};

const STOP_WORDS = new Set(['the', 'of', 'a', 'an', 'la', 'el', 'los', 'las', 'de', 'del', 'y']);

const normalizeText = (value: string) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

const tokenize = (value: string) =>
    normalizeText(value)
        .split(/[^a-z0-9]+/)
        .map((x) => x.trim())
        .filter((x) => x.length > 1 && !STOP_WORDS.has(x));

const mapApiComic = (item: any): Comic => {
    const title = item.title || 'Sin título';
    const description = item.description || '';
    return {
        slug: item.slug,
        title,
        cover: item.cover || '',
        source: normalizeProviderSource(item.source),
        score: item.score || '0.0',
        totalChapters: item.totalChapters || 0,
        description,
        status: item.status || 'unknown',
        statusLabel: item.statusLabel || '',
        contentRating: item.contentRating || 'safe',
        genres: Array.isArray(item.genres) ? item.genres : [],
        badges: Array.isArray(item.badges) ? item.badges : [],
        normalizedTitle: normalizeText(title),
        normalizedDescription: normalizeText(description),
        normalizedSlug: normalizeText(String(item.slug || '').replace(/^[a-z0-9_]+__/, '').replace(/-/g, ' ')),
    };
};

const buildSearchCacheKey = (
    query: string,
    page: number,
    source: SourceKey,
    status: StatusKey,
    rating: RatingKey,
    sort: SortKey,
) => `${normalizeText(query)}|p:${page}|s:${source}|st:${status}|r:${rating}|o:${sort}`;

const buildLibraryCacheKey = (
    page: number,
    source: SourceKey,
    status: StatusKey,
    rating: RatingKey,
    sort: SortKey,
) => `lib|p:${page}|s:${source}|st:${status}|r:${rating}|o:${sort}`;

const applyRelevanceFilter = (list: Comic[], query: string): Comic[] => {
    const q = normalizeText(query);
    const qTokens = tokenize(query);

    if (!q || qTokens.length === 0) return list;

    const ranked = list.map((item) => {
        const title = item.normalizedTitle || normalizeText(item.title || '');
        const desc = item.normalizedDescription || normalizeText(item.description || '');
        const slug = item.normalizedSlug || normalizeText(String(item.slug || '').replace(/^[a-z0-9_]+__/, '').replace(/-/g, ' '));

        let score = 0;
        let matched = 0;

        if (title === q) score += 300;
        else if (title.startsWith(q)) score += 180;
        else if (title.includes(q)) score += 120;

        if (slug === q) score += 240;
        else if (slug.startsWith(q)) score += 140;
        else if (slug.includes(q)) score += 80;

        for (const token of qTokens) {
            if (title.includes(token)) {
                score += 20;
                matched += 1;
            } else if (slug.includes(token)) {
                score += 12;
                matched += 1;
            } else if (desc.includes(token)) {
                score += 6;
                matched += 1;
            }
        }

        return { item, score, matched };
    });

    const positives = ranked
        .filter((x) => x.score > 0 || x.matched > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.item);

    return positives.length > 0 ? positives : list;
};

const fetchJsonWithTimeout = async (url: string, timeoutMs = REQUEST_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
        return await res.json();
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            throw new Error('Tiempo de espera agotado. No se pudo conectar al backend.');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

const sortComics = (list: Comic[], sort: SortKey): Comic[] => {
    const copy = [...list];
    switch (sort) {
        case 'title_asc': return copy.sort((a, b) => a.title.localeCompare(b.title));
        case 'title_desc': return copy.sort((a, b) => b.title.localeCompare(a.title));
        case 'score_desc': return copy.sort((a, b) => parseFloat(b.score || '0') - parseFloat(a.score || '0'));
        default: return copy;
    }
};

const filterAndSortComics = (
    list: Comic[],
    sort: SortKey,
    source: SourceKey,
    status: StatusKey,
    rating: RatingKey,
) => {
    let result = [...list];
    if (source !== 'all') result = result.filter((x) => normalizeProviderSource(x.source) === source);
    if (status !== 'all') result = result.filter((x) => (x.status || 'unknown') === status);
    if (rating !== 'all') result = result.filter((x) => (x.contentRating || 'safe') === rating);
    return sortComics(result, sort);
};

const mergeUniqueComics = (base: Comic[], incoming: Comic[]) => {
    const map = new Map<string, Comic>();
    for (const item of base) map.set(`${item.source}:${item.slug}`, item);
    for (const item of incoming) map.set(`${item.source}:${item.slug}`, item);
    return Array.from(map.values());
};

const LibraryScreen = ({ navigation }: any) => {
    const { theme, settings } = usePersonalization();
    const [allComics, setAllComics] = useState<Comic[]>([]);
    const [comics, setComics] = useState<Comic[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [committedSearchQuery, setCommittedSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [selectedSort, setSelectedSort] = useState<SortKey>('default');
    const [pendingSort, setPendingSort] = useState<SortKey>('default');
    const [selectedSource, setSelectedSource] = useState<SourceKey>('all');
    const [pendingSource, setPendingSource] = useState<SourceKey>('all');
    const [selectedStatus, setSelectedStatus] = useState<StatusKey>('all');
    const [pendingStatus, setPendingStatus] = useState<StatusKey>('all');
    const [selectedRating, setSelectedRating] = useState<RatingKey>('all');
    const [pendingRating, setPendingRating] = useState<RatingKey>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [showScrollTop, setShowScrollTop] = useState(false);
    const isMounted = useRef(true);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const requestIdRef = useRef(0);
    const allComicsRef = useRef<Comic[]>([]);
    const listRef = useRef<FlatList<Comic>>(null);
    const lastScrollOffsetRef = useRef(0);
    const searchCacheRef = useRef<Map<string, { timestamp: number; results: Comic[]; totalPages?: number }>>(new Map());
    const libraryCacheRef = useRef<Map<string, { timestamp: number; results: Comic[]; hasMore: boolean }>>(new Map());

    const { alertError } = useAlertContext();

    const activeFilterCount = useMemo(
        () => [selectedSort !== 'default', selectedSource !== 'all', selectedStatus !== 'all', selectedRating !== 'all'].filter(Boolean).length,
        [selectedSort, selectedSource, selectedStatus, selectedRating]
    );

    const compactCoverHeight = useMemo(() => {
        const baseWidth = (width / 2) - (settings.compactCards ? 18 : 20);
        return settings.compactCards ? baseWidth * 1.25 : baseWidth * 1.5;
    }, [settings.compactCards]);

    useEffect(() => {
        isMounted.current = true;
        loadLatest();
        return () => {
            isMounted.current = false;
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        };
    }, []);

    useEffect(() => {
        allComicsRef.current = allComics;
    }, [allComics]);

    const applyFiltersAndSort = useCallback((
        list: Comic[],
        sort: SortKey,
        source: SourceKey,
        status: StatusKey,
        rating: RatingKey,
    ) => {
        const filtered = filterAndSortComics(list, sort, source, status, rating);
        if (isMounted.current) setComics(filtered);
    }, []);

    const loadLatest = useCallback(async (options?: { page?: number; append?: boolean }) => {
        const page = options?.page ?? 1;
        const append = options?.append ?? false;
        const cacheKey = buildLibraryCacheKey(page, selectedSource, selectedStatus, selectedRating, selectedSort);

        const cached = libraryCacheRef.current.get(cacheKey);
        const isCacheFresh = !!cached && (Date.now() - cached.timestamp) <= LIBRARY_CACHE_TTL_MS;

        if (isCacheFresh && cached) {
            const merged = append ? mergeUniqueComics(allComicsRef.current, cached.results) : cached.results;
            allComicsRef.current = merged;
            if (isMounted.current) {
                setAllComics(merged);
                applyFiltersAndSort(merged, selectedSort, selectedSource, selectedStatus, selectedRating);
                setCurrentPage(page);
                setHasMore(cached.hasMore);
            }
            return;
        }

        if (append) setIsFetchingMore(true);
        else setLoading(true);

        setError(null);
        try {
            const query = new URLSearchParams();
            if (selectedSource !== 'all') query.append('source', selectedSource);
            if (selectedStatus !== 'all') query.append('status', selectedStatus);
            if (selectedRating !== 'all') query.append('contentRating', selectedRating);
            if (selectedSort !== 'default') query.append('sort', selectedSort);
            query.append('page', String(page));
            query.append('limit', String(PAGE_LIMIT));

            const data = await fetchJsonWithTimeout(`${backendUrl('/library')}${query.toString() ? `?${query.toString()}` : ''}`);
            const list: Comic[] = (data.results || []).map(mapApiComic);

            const hasMoreRaw = data?.pagination?.hasMore;
            const totalPagesRaw = Number(data?.pagination?.totalPages);
            const nextHasMore = typeof hasMoreRaw === 'boolean'
                ? hasMoreRaw
                : Number.isFinite(totalPagesRaw)
                    ? page < totalPagesRaw
                    : list.length >= PAGE_LIMIT;

            if (isMounted.current) {
                const merged = append ? mergeUniqueComics(allComicsRef.current, list) : list;
                allComicsRef.current = merged;
                setAllComics(merged);
                applyFiltersAndSort(merged, selectedSort, selectedSource, selectedStatus, selectedRating);
                setCurrentPage(page);
                setHasMore(nextHasMore);
            }

            libraryCacheRef.current.set(cacheKey, {
                timestamp: Date.now(),
                results: list,
                hasMore: nextHasMore,
            });

            // Warm next page in cache so infinite-scroll feels instant.
            if (!append && nextHasMore) {
                const nextPage = page + 1;
                const nextKey = buildLibraryCacheKey(nextPage, selectedSource, selectedStatus, selectedRating, selectedSort);
                const nextCached = libraryCacheRef.current.get(nextKey);
                const nextFresh = !!nextCached && (Date.now() - nextCached.timestamp) <= LIBRARY_CACHE_TTL_MS;
                if (!nextFresh) {
                    const nextQuery = new URLSearchParams();
                    if (selectedSource !== 'all') nextQuery.append('source', selectedSource);
                    if (selectedStatus !== 'all') nextQuery.append('status', selectedStatus);
                    if (selectedRating !== 'all') nextQuery.append('contentRating', selectedRating);
                    if (selectedSort !== 'default') nextQuery.append('sort', selectedSort);
                    nextQuery.append('page', String(nextPage));
                    nextQuery.append('limit', String(PAGE_LIMIT));

                    fetchJsonWithTimeout(`${backendUrl('/library')}${nextQuery.toString() ? `?${nextQuery.toString()}` : ''}`)
                        .then((nextData) => {
                            const nextList: Comic[] = (nextData.results || []).map(mapApiComic);
                            const hasMoreValue = typeof nextData?.pagination?.hasMore === 'boolean'
                                ? nextData.pagination.hasMore
                                : nextList.length >= PAGE_LIMIT;
                            libraryCacheRef.current.set(nextKey, {
                                timestamp: Date.now(),
                                results: nextList,
                                hasMore: hasMoreValue,
                            });
                        })
                        .catch(() => {});
                }
            }
        } catch (e: any) {
            setError(e.message);
            alertError('No se pudo conectar al servidor. Verifica tu conexión.');
        } finally {
            if (isMounted.current) {
                setLoading(false);
                setIsFetchingMore(false);
            }
        }
    }, [selectedSort, selectedSource, selectedStatus, selectedRating, applyFiltersAndSort]);

    const searchComics = useCallback(async (options?: { page?: number; append?: boolean; query?: string }) => {
        const page = options?.page ?? 1;
        const append = options?.append ?? false;
        const q = (options?.query ?? committedSearchQuery).trim();
        const requestId = append ? requestIdRef.current : ++requestIdRef.current;
        if (!q) {
            loadLatest({ page: 1, append: false });
            return;
        }

        if (q.length < 2) {
            if (isMounted.current) {
                setLoading(false);
                setIsFetchingMore(false);
                setError(null);
                setAllComics([]);
                setComics([]);
                allComicsRef.current = [];
                setHasMore(false);
                setCurrentPage(1);
            }
            return;
        }

        if (append) setIsFetchingMore(true);
        else setLoading(true);

        setError(null);
        try {
            const cacheKey = buildSearchCacheKey(q, page, selectedSource, selectedStatus, selectedRating, selectedSort);
            const cached = searchCacheRef.current.get(cacheKey);
            const isCacheFresh = !!cached && (Date.now() - cached.timestamp) <= SEARCH_CACHE_TTL_MS;

            if (isCacheFresh && cached) {
                const nextHasMoreFromCache = typeof cached.totalPages === 'number'
                    ? page < cached.totalPages
                    : cached.results.length >= PAGE_LIMIT;

                if (isMounted.current && requestId === requestIdRef.current) {
                    const merged = append ? mergeUniqueComics(allComicsRef.current, cached.results) : cached.results;
                    allComicsRef.current = merged;
                    setAllComics(merged);
                    applyFiltersAndSort(merged, selectedSort, selectedSource, selectedStatus, selectedRating);
                    setCurrentPage(page);
                    setHasMore(nextHasMoreFromCache);
                }

                if (isMounted.current && requestId === requestIdRef.current) {
                    setLoading(false);
                    setIsFetchingMore(false);
                }
                return;
            }

            const query = new URLSearchParams({ title: q });
            if (selectedSource !== 'all') query.append('source', selectedSource);
            if (selectedStatus !== 'all') query.append('status', selectedStatus);
            if (selectedRating !== 'all') query.append('contentRating', selectedRating);
            if (selectedSort !== 'default') query.append('sort', selectedSort);
            query.append('page', String(page));
            query.append('limit', String(PAGE_LIMIT));

            const data = await fetchJsonWithTimeout(`${backendUrl('/search')}?${query.toString()}`);
            const list: Comic[] = (data.results || []).map(mapApiComic);

            const relevant = applyRelevanceFilter(list, q);
            const totalPagesRaw = Number(data?.pagination?.totalPages);
            const nextHasMore = Number.isFinite(totalPagesRaw)
                ? page < totalPagesRaw
                : relevant.length >= PAGE_LIMIT;

            if (isMounted.current && requestId === requestIdRef.current) {
                searchCacheRef.current.set(cacheKey, {
                    timestamp: Date.now(),
                    results: relevant,
                    totalPages: Number.isFinite(totalPagesRaw) ? totalPagesRaw : undefined,
                });

                const merged = append ? mergeUniqueComics(allComicsRef.current, relevant) : relevant;
                allComicsRef.current = merged;
                setAllComics(merged);
                applyFiltersAndSort(merged, selectedSort, selectedSource, selectedStatus, selectedRating);
                setCurrentPage(page);
                setHasMore(nextHasMore);
            }
        } catch (e: any) {
            if (isMounted.current && requestId === requestIdRef.current) {
                setError(e.message);
            }
        } finally {
            if (isMounted.current && requestId === requestIdRef.current) {
                setLoading(false);
                setIsFetchingMore(false);
            }
        }
    }, [committedSearchQuery, selectedSort, selectedSource, selectedStatus, selectedRating, applyFiltersAndSort, loadLatest]);

    const runSearch = useCallback(() => {
        const q = searchQuery.trim();
        setCurrentPage(1);
        setHasMore(true);

        if (!q) {
            setCommittedSearchQuery('');
            loadLatest({ page: 1, append: false });
            return;
        }

        setCommittedSearchQuery(q);
        searchComics({ page: 1, append: false, query: q });
    }, [searchQuery, loadLatest, searchComics]);

    useEffect(() => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

        searchDebounceRef.current = setTimeout(() => {
            const normalizedQuery = searchQuery.trim();

            if (!normalizedQuery && committedSearchQuery) {
                setCommittedSearchQuery('');
                loadLatest({ page: 1, append: false });
                return;
            }

            if (normalizedQuery.length >= 2 && normalizedQuery !== committedSearchQuery) {
                setCommittedSearchQuery(normalizedQuery);
                searchComics({ page: 1, append: false, query: normalizedQuery });
            }
        }, settings.reduceMotion ? 120 : 220);

        return () => {
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        };
    }, [searchQuery, committedSearchQuery, loadLatest, searchComics, settings.reduceMotion]);

    const handleLoadMore = useCallback(() => {
        if (loading || isFetchingMore || !hasMore) return;

        const nextPage = currentPage + 1;
        if (committedSearchQuery.trim()) {
            searchComics({ page: nextPage, append: true });
        } else {
            loadLatest({ page: nextPage, append: true });
        }
    }, [loading, isFetchingMore, hasMore, currentPage, committedSearchQuery, searchComics, loadLatest]);

    const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const nextOffset = Math.max(0, Number(event.nativeEvent.contentOffset.y || 0));
        const shouldShow = nextOffset > 420;
        if (shouldShow !== showScrollTop) {
            setShowScrollTop(shouldShow);
        }
        lastScrollOffsetRef.current = nextOffset;
    }, [showScrollTop]);

    const scrollToTop = useCallback(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, []);

    const reloadWithFilters = useCallback(async (
        sort: SortKey,
        source: SourceKey,
        status: StatusKey,
        rating: RatingKey,
        queryText?: string,
    ) => {
        const trimmedQuery = String(queryText || '').trim();
        setCurrentPage(1);
        setHasMore(true);
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (trimmedQuery) params.append('title', trimmedQuery);
            if (source !== 'all') params.append('source', source);
            if (status !== 'all') params.append('status', status);
            if (rating !== 'all') params.append('contentRating', rating);
            if (sort !== 'default') params.append('sort', sort);
            params.append('page', '1');
            params.append('limit', String(PAGE_LIMIT));

            const endpoint = trimmedQuery ? '/search' : '/library';
            const data = await fetchJsonWithTimeout(`${backendUrl(endpoint)}?${params.toString()}`);
            const mapped = (data.results || []).map(mapApiComic);
            const list = trimmedQuery ? applyRelevanceFilter(mapped, trimmedQuery) : mapped;
            const hasMoreRaw = data?.pagination?.hasMore;
            const totalPagesRaw = Number(data?.pagination?.totalPages);

            if (!isMounted.current) return;
            allComicsRef.current = list;
            setAllComics(list);
            setComics(list);
            setCurrentPage(1);
            setHasMore(typeof hasMoreRaw === 'boolean' ? hasMoreRaw : (Number.isFinite(totalPagesRaw) ? 1 < totalPagesRaw : list.length >= PAGE_LIMIT));
        } catch (e: any) {
            if (isMounted.current) setError(e.message);
        } finally {
            if (isMounted.current) {
                setLoading(false);
                setIsFetchingMore(false);
            }
        }
    }, []);

    const applyFilters = useCallback(() => {
        const sourceChanged = pendingSource !== selectedSource;
        const requiresServerReload = sourceChanged || committedSearchQuery.trim().length > 0;

        setSelectedSort(pendingSort);
        setSelectedSource(pendingSource);
        setSelectedStatus(pendingStatus);
        setSelectedRating(pendingRating);
        // Apply instantly to current in-memory list for responsive UI while backend refresh runs.
        applyFiltersAndSort(allComicsRef.current, pendingSort, pendingSource, pendingStatus, pendingRating);
        setShowFilters(false);
        if (requiresServerReload) {
            reloadWithFilters(pendingSort, pendingSource, pendingStatus, pendingRating, committedSearchQuery);
        }
    }, [pendingSort, pendingSource, selectedSource, pendingStatus, pendingRating, committedSearchQuery, reloadWithFilters, applyFiltersAndSort]);

    const resetFilters = useCallback(() => {
        const sourceChanged = selectedSource !== 'all';
        const requiresServerReload = sourceChanged || committedSearchQuery.trim().length > 0;

        setPendingSort('default');
        setSelectedSort('default');
        setPendingSource('all');
        setSelectedSource('all');
        setPendingStatus('all');
        setSelectedStatus('all');
        setPendingRating('all');
        setSelectedRating('all');
        applyFiltersAndSort(allComicsRef.current, 'default', 'all', 'all', 'all');
        setShowFilters(false);
        if (requiresServerReload) {
            reloadWithFilters('default', 'all', 'all', 'all', committedSearchQuery);
        }
    }, [selectedSource, committedSearchQuery, reloadWithFilters, applyFiltersAndSort]);

    const removeSingleFilter = useCallback((type: 'sort' | 'source' | 'status' | 'rating') => {
        const nextSort: SortKey = type === 'sort' ? 'default' : selectedSort;
        const nextSource: SourceKey = type === 'source' ? 'all' : selectedSource;
        const nextStatus: StatusKey = type === 'status' ? 'all' : selectedStatus;
        const nextRating: RatingKey = type === 'rating' ? 'all' : selectedRating;
        const sourceChanged = nextSource !== selectedSource;
        const requiresServerReload = sourceChanged || committedSearchQuery.trim().length > 0;

        setPendingSort(nextSort);
        setSelectedSort(nextSort);
        setPendingSource(nextSource);
        setSelectedSource(nextSource);
        setPendingStatus(nextStatus);
        setSelectedStatus(nextStatus);
        setPendingRating(nextRating);
        setSelectedRating(nextRating);
        applyFiltersAndSort(allComicsRef.current, nextSort, nextSource, nextStatus, nextRating);
        if (requiresServerReload) {
            reloadWithFilters(nextSort, nextSource, nextStatus, nextRating, committedSearchQuery);
        }
    }, [selectedSort, selectedSource, selectedStatus, selectedRating, committedSearchQuery, reloadWithFilters, applyFiltersAndSort]);

    if (loading && comics.length === 0) {
        return (
            <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text style={styles.loadingText}>Cargando mangas...</Text>
            </LinearGradient>
        );
    }

    if (error && comics.length === 0) {
        return (
            <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle" size={40} color={theme.danger} />
                <Text style={styles.errorText}>No se pudo conectar</Text>
                <Text style={styles.errorSubText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={() => loadLatest({ page: 1, append: false })}>
                    <Text style={styles.retryButtonText}>Reintentar</Text>
                </TouchableOpacity>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.container}>
            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerSideSpacer} />
                    <Text style={[styles.title, { color: theme.text }]}>Biblioteca</Text>
                    <TouchableOpacity
                        onPress={() => {
                            setPendingSort(selectedSort);
                            setPendingSource(selectedSource);
                            setPendingStatus(selectedStatus);
                            setPendingRating(selectedRating);
                            setShowFilters(true);
                        }}
                        style={[
                            styles.filterButton,
                            { backgroundColor: activeFilterCount > 0 ? theme.accent : theme.accentSoft, borderColor: theme.accent },
                            (selectedSort !== 'default' || selectedSource !== 'all' || selectedStatus !== 'all' || selectedRating !== 'all') && styles.filterButtonActive,
                        ]}
                    >
                        <MaterialCommunityIcons
                            name="filter"
                            size={24}
                            color={(selectedSort !== 'default' || selectedSource !== 'all' || selectedStatus !== 'all' || selectedRating !== 'all') ? theme.text : theme.accent}
                        />
                    </TouchableOpacity>
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <View style={[styles.searchInputContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <MaterialCommunityIcons name="magnify" size={20} color={theme.textMuted} style={styles.searchIcon} />
                        <TextInput
                            style={[styles.searchInput, { color: theme.text }]}
                            placeholder="Buscar por título o descripción..."
                            placeholderTextColor={theme.textMuted}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            onSubmitEditing={runSearch}
                            returnKeyType="search"
                        />
                        {searchQuery !== '' && (
                            <TouchableOpacity onPress={() => { setSearchQuery(''); setCommittedSearchQuery(''); loadLatest({ page: 1, append: false }); }} style={styles.clearSearchButton}>
                                <MaterialCommunityIcons name="close-circle" size={20} color={theme.textMuted} />
                            </TouchableOpacity>
                        )}
                    </View>
                    <TouchableOpacity style={[styles.searchButton, { backgroundColor: theme.accent, shadowColor: theme.accent }]} onPress={runSearch}>
                        <Text style={[styles.searchButtonText, { color: theme.text }]}>{committedSearchQuery ? 'Actualizar' : 'Buscar'}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.resultsMetaRow}>
                    <Text style={[styles.resultsMetaText, { color: theme.textMuted }]}>
                        {committedSearchQuery ? `Resultados para "${committedSearchQuery}"` : 'Explora los más recientes'} · {comics.length} títulos
                    </Text>
                    {settings.compactCards ? <Text style={[styles.resultsMetaText, { color: theme.accent, textAlign: 'right' }]}>Modo compacto</Text> : null}
                </View>

                {/* Active Filters */}
                {/* Sort indicator */}
                {(selectedSort !== 'default' || selectedSource !== 'all' || selectedStatus !== 'all' || selectedRating !== 'all') && (
                    <View style={styles.activeFiltersContainer}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersScrollContent}>
                            {selectedSort !== 'default' && (
                                <TouchableOpacity style={[styles.activeFilter, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]} onPress={() => removeSingleFilter('sort')}>
                                    <Text style={[styles.activeFilterText, { color: theme.accent }]}>{SORT_OPTIONS.find(o => o.value === selectedSort)?.label}</Text>
                                </TouchableOpacity>
                            )}
                            {selectedSource !== 'all' && (
                                <TouchableOpacity style={[styles.activeFilter, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]} onPress={() => removeSingleFilter('source')}>
                                    <Text style={[styles.activeFilterText, { color: theme.accent }]}>{SOURCE_OPTIONS.find(o => o.value === selectedSource)?.label}</Text>
                                </TouchableOpacity>
                            )}
                            {selectedStatus !== 'all' && (
                                <TouchableOpacity style={[styles.activeFilter, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]} onPress={() => removeSingleFilter('status')}>
                                    <Text style={[styles.activeFilterText, { color: theme.accent }]}>{STATUS_OPTIONS.find(o => o.value === selectedStatus)?.label}</Text>
                                </TouchableOpacity>
                            )}
                            {selectedRating !== 'all' && (
                                <TouchableOpacity style={[styles.activeFilter, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]} onPress={() => removeSingleFilter('rating')}>
                                    <Text style={[styles.activeFilterText, { color: theme.accent }]}>{RATING_OPTIONS.find(o => o.value === selectedRating)?.label}</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={resetFilters} style={[styles.clearAllFiltersButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                <Text style={[styles.clearAllFiltersText, { color: theme.textMuted }]}>Limpiar</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                )}

                {/* Comics List */}
                <FlatList
                    ref={listRef}
                    data={comics}
                    keyExtractor={(item) => `${item.source}:${item.slug}`}
                    contentContainerStyle={styles.comicsList}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    initialNumToRender={8}
                    maxToRenderPerBatch={10}
                    windowSize={7}
                    updateCellsBatchingPeriod={50}
                    removeClippedSubviews={Platform.OS === 'android'}
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.4}
                    onScroll={handleListScroll}
                    scrollEventThrottle={16}
                    ListFooterComponent={
                        isFetchingMore ? (
                            <ActivityIndicator style={{ marginVertical: 20 }} size="large" color={theme.accent} />
                        ) : null
                    }
                    ListEmptyComponent={() =>
                        !loading ? (
                            <View style={styles.emptyContainer}>
                                <MaterialCommunityIcons name="book-alert" size={50} color={theme.textMuted} />
                                <Text style={[styles.emptyText, { color: theme.text }]}>No se encontraron mangas</Text>
                                <TouchableOpacity style={[styles.resetButton, { backgroundColor: theme.accent }]} onPress={() => loadLatest({ page: 1, append: false })}>
                                    <Text style={[styles.resetButtonText, { color: theme.text }]}>Mostrar recientes</Text>
                                </TouchableOpacity>
                            </View>
                        ) : null
                    }
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.comicGridItem, { backgroundColor: theme.surface, width: settings.compactCards ? (width / 2) - 18 : (width / 2) - 20 }]}
                            onPress={() => navigation.navigate('Details', { slug: item.slug })}
                        >
                            <Image
                                source={{ uri: item.cover }}
                                style={[styles.comicCover, { height: compactCoverHeight, backgroundColor: theme.surfaceMuted }]}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                placeholder={require('../../assets/auth-bg.png')}
                            />
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.85)']}
                                style={styles.comicTitleGradient}
                            >
                                <Text style={[styles.comicGridTitle, { color: theme.text, fontSize: settings.compactCards ? 13 : 14 }]} numberOfLines={settings.compactCards ? 1 : 2}>{item.title}</Text>
                            </LinearGradient>
                            <View style={[styles.providerBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                <Text style={[styles.providerBadgeText, { color: theme.text }]}>{getProviderAliasLabel(item.source)}</Text>
                            </View>
                            {item.score && item.score !== '0.0' && (
                                <View style={styles.scoreBadge}>
                                    <MaterialCommunityIcons name="star" size={10} color={theme.warning} />
                                    <Text style={styles.scoreText}>{item.score}</Text>
                                </View>
                            )}
                            <View
                                style={[
                                    styles.statusBadge,
                                    { backgroundColor: getStatusBadgeStyles(item.status).backgroundColor },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.statusBadgeText,
                                        { color: getStatusBadgeStyles(item.status).textColor },
                                    ]}
                                >
                                    {getStatusBadgeLabel(item)}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}
                />

                {showScrollTop && (
                    <TouchableOpacity
                        onPress={scrollToTop}
                        activeOpacity={0.9}
                        style={styles.scrollTopButtonWrap}
                        accessibilityRole="button"
                        accessibilityLabel="Volver arriba"
                    >
                        <LinearGradient
                            colors={[theme.accent, theme.accentStrong]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[
                                styles.scrollTopButton,
                                {
                                    borderColor: theme.border,
                                    shadowColor: theme.accent,
                                },
                            ]}
                        >
                            <View style={[styles.scrollTopButtonIconWrap, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                                <MaterialCommunityIcons name="arrow-up-thin" size={22} color={theme.text} />
                            </View>
                            <Text style={[styles.scrollTopButtonLabel, { color: theme.text }]}>Arriba</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}

                {/* Sort Modal */}
                <Modal
                    visible={showFilters}
                    animationType={settings.reduceMotion ? 'none' : 'slide'}
                    transparent={true}
                    onRequestClose={() => setShowFilters(false)}
                >
                    <View style={styles.modalOverlay}>
                        <LinearGradient colors={[theme.backgroundSecondary, theme.card]} style={styles.modalContainer}>
                            <SafeAreaView style={styles.modalSafeArea}>
                                <View style={styles.modalHeader}>
                                    <Text style={[styles.modalTitle, { color: theme.text }]}>Filtros</Text>
                                    <TouchableOpacity onPress={() => setShowFilters(false)} style={styles.closeModalButton}>
                                        <MaterialCommunityIcons name="close" size={26} color={theme.accent} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView style={styles.filtersContainer} contentContainerStyle={styles.filtersScrollContent}>
                                    <View style={styles.filterGroup}>
                                        <Text style={[styles.filterGroupTitle, { color: theme.accent }]}>Orden</Text>
                                        <View style={styles.filterOptions}>
                                            {SORT_OPTIONS.map((option) => (
                                                <TouchableOpacity
                                                    key={option.value}
                                                    style={[
                                                        styles.filterOption,
                                                        { backgroundColor: theme.surface, borderColor: theme.border },
                                                        pendingSort === option.value && styles.selectedFilterOption,
                                                        pendingSort === option.value && { backgroundColor: theme.accent, borderColor: theme.accent },
                                                    ]}
                                                    onPress={() => setPendingSort(option.value as SortKey)}
                                                >
                                                    <Text style={[
                                                        styles.filterOptionText,
                                                        { color: theme.textMuted },
                                                        pendingSort === option.value && styles.selectedFilterOptionText,
                                                        pendingSort === option.value && { color: theme.text },
                                                    ]}>
                                                        {option.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    <View style={styles.filterGroup}>
                                        <Text style={[styles.filterGroupTitle, { color: theme.accent }]}>Fuente</Text>
                                        <View style={styles.filterOptions}>
                                            {SOURCE_OPTIONS.map((option) => (
                                                <TouchableOpacity
                                                    key={option.value}
                                                    style={[
                                                        styles.filterOption,
                                                        { backgroundColor: theme.surface, borderColor: theme.border },
                                                        pendingSource === option.value && styles.selectedFilterOption,
                                                        pendingSource === option.value && { backgroundColor: theme.accent, borderColor: theme.accent },
                                                    ]}
                                                    onPress={() => setPendingSource(option.value as SourceKey)}
                                                >
                                                    <Text style={[
                                                        styles.filterOptionText,
                                                        { color: theme.textMuted },
                                                        pendingSource === option.value && styles.selectedFilterOptionText,
                                                        pendingSource === option.value && { color: theme.text },
                                                    ]}>
                                                        {option.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    <View style={styles.filterGroup}>
                                        <Text style={[styles.filterGroupTitle, { color: theme.accent }]}>Estado</Text>
                                        <View style={styles.filterOptions}>
                                            {STATUS_OPTIONS.map((option) => (
                                                <TouchableOpacity
                                                    key={option.value}
                                                    style={[
                                                        styles.filterOption,
                                                        { backgroundColor: theme.surface, borderColor: theme.border },
                                                        pendingStatus === option.value && styles.selectedFilterOption,
                                                        pendingStatus === option.value && { backgroundColor: theme.accent, borderColor: theme.accent },
                                                    ]}
                                                    onPress={() => setPendingStatus(option.value as StatusKey)}
                                                >
                                                    <Text style={[
                                                        styles.filterOptionText,
                                                        { color: theme.textMuted },
                                                        pendingStatus === option.value && styles.selectedFilterOptionText,
                                                        pendingStatus === option.value && { color: theme.text },
                                                    ]}>
                                                        {option.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    <View style={styles.filterGroup}>
                                        <Text style={[styles.filterGroupTitle, { color: theme.accent }]}>Clasificación</Text>
                                        <View style={styles.filterOptions}>
                                            {RATING_OPTIONS.map((option) => (
                                                <TouchableOpacity
                                                    key={option.value}
                                                    style={[
                                                        styles.filterOption,
                                                        { backgroundColor: theme.surface, borderColor: theme.border },
                                                        pendingRating === option.value && styles.selectedFilterOption,
                                                        pendingRating === option.value && { backgroundColor: theme.accent, borderColor: theme.accent },
                                                    ]}
                                                    onPress={() => setPendingRating(option.value as RatingKey)}
                                                >
                                                    <Text style={[
                                                        styles.filterOptionText,
                                                        { color: theme.textMuted },
                                                        pendingRating === option.value && styles.selectedFilterOptionText,
                                                        pendingRating === option.value && { color: theme.text },
                                                    ]}>
                                                        {option.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                </ScrollView>

                                <View style={styles.modalFooter}>
                                    <TouchableOpacity style={[styles.resetFiltersButton, { borderColor: theme.accent }]} onPress={resetFilters}>
                                        <Text style={[styles.resetFiltersText, { color: theme.accent }]}>Restablecer</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.applyFiltersButton, { backgroundColor: theme.accent, shadowColor: theme.accent }]} onPress={applyFilters}>
                                        <Text style={[styles.applyFiltersText, { color: theme.text }]}>Aplicar</Text>
                                    </TouchableOpacity>
                                </View>
                            </SafeAreaView>
                        </LinearGradient>
                    </View>
                </Modal>
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#FF5252',
        marginTop: 10,
        fontSize: 16,
        fontFamily: 'Roboto-Medium',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        color: '#FF5252',
        fontSize: 20,
        fontFamily: 'Roboto-Bold',
        marginTop: 15,
    },
    errorSubText: {
        color: '#AAA',
        fontSize: 14,
        fontFamily: 'Roboto-Regular',
        marginTop: 5,
        textAlign: 'center',
    },
    retryButton: {
        marginTop: 20,
        backgroundColor: '#FF5252',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        shadowColor: '#FF5252',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    retryButtonText: {
        color: '#FFF',
        fontFamily: 'Roboto-Medium',
        fontSize: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 15,
        paddingBottom: 10,
        backgroundColor: 'rgba(15, 15, 21, 0.8)',
        borderBottomWidth: 0,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
    },
    headerSideSpacer: {
        width: 48,
    },
    title: {
        fontSize: 26,
        fontFamily: 'Roboto-Bold',
        color: '#FFFFFF',
        textShadowColor: 'rgba(0, 0, 0, 0.2)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 2,
    },
    filterButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 82, 82, 0.1)',
        borderWidth: 1,
        borderColor: '#FF5252',
    },
    filterButtonActive: {
        backgroundColor: '#FF5252',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    searchInputContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 25,
        paddingHorizontal: 15,
        marginRight: 10,
        borderWidth: 1,
        borderColor: 'transparent',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    searchIcon: {
        marginRight: 10,
        color: '#BBB',
    },
    searchInput: {
        flex: 1,
        color: '#FFFFFF',
        paddingVertical: 12,
        fontFamily: 'Roboto-Regular',
    },
    clearSearchButton: {
        padding: 5,
    },
    searchButton: {
        backgroundColor: '#FF5252',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 25,
        shadowColor: '#FF5252',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    searchButtonText: {
        color: '#FFFFFF',
        fontFamily: 'Roboto-Medium',
    },
    resultsMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginTop: -10,
        marginBottom: 12,
        gap: 12,
    },
    resultsMetaText: {
        fontSize: 12,
        fontFamily: 'Roboto-Medium',
        flex: 1,
    },
    activeFiltersContainer: {
        paddingLeft: 20,
        marginBottom: 15,
    },
    activeFiltersScrollContent: {
        paddingRight: 20,
    },
    activeFilter: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 82, 82, 0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#FF5252',
        height: 35,
    },
    activeFilterText: {
        color: '#FF5252',
        fontFamily: 'Roboto-Medium',
        fontSize: 12,
    },
    removeFilterIcon: {
        marginLeft: 5,
    },
    clearAllFiltersButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginRight: 10,
        justifyContent: 'center',
        height: 35,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#888',
    },
    clearAllFiltersText: {
        color: '#AAA',
        fontFamily: 'Roboto-Medium',
        fontSize: 12,
    },
    comicsList: {
        paddingHorizontal: 10,
        paddingBottom: 20,
    },
    row: {
        justifyContent: 'space-between',
        marginBottom: 15,
    },
    comicGridItem: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        overflow: 'hidden',
        width: (width / 2) - 20,
        marginHorizontal: 5,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    comicCover: {
        width: '100%',
        height: ((width / 2) - 20) * 1.5,
        backgroundColor: '#333',
    },
    comicTitleGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 10,
        paddingTop: 30,
        paddingBottom: 8,
    },
    comicGridTitle: {
        color: '#FFFFFF',
        fontFamily: 'Roboto-Bold',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 4,
    },
    scrollTopButtonWrap: {
        position: 'absolute',
        right: 16,
        bottom: 98,
    },
    scrollTopButton: {
        minWidth: 112,
        height: 48,
        borderRadius: 24,
        borderWidth: 1,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        elevation: 9,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.38,
        shadowRadius: 9,
    },
    scrollTopButtonIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollTopButtonLabel: {
        fontFamily: 'Roboto-Bold',
        fontSize: 13,
        letterSpacing: 0.4,
    },
    scoreBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.65)',
        borderRadius: 10,
        paddingHorizontal: 5,
        paddingVertical: 3,
    },
    scoreText: {
        fontSize: 10,
        color: '#FFD700',
        fontFamily: 'Roboto-Medium',
        marginLeft: 2,
    },
    providerBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: 'rgba(10,10,16,0.82)',
        borderColor: 'rgba(255,255,255,0.24)',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 3,
        maxWidth: '64%',
    },
    providerBadgeText: {
        color: '#F4F6FF',
        fontSize: 10,
        fontFamily: 'Roboto-Bold',
    },
    statusBadge: {
        position: 'absolute',
        bottom: 45,
        left: 8,
        borderRadius: 5,
        paddingHorizontal: 6,
        paddingVertical: 3,
    },
    statusBadgeText: {
        fontFamily: 'Roboto-Bold',
        fontSize: 10,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
        minHeight: 200,
    },
    emptyText: {
        color: '#666',
        fontFamily: 'Roboto-Regular',
        fontSize: 16,
        marginTop: 10,
        textAlign: 'center',
    },
    resetButton: {
        marginTop: 20,
        backgroundColor: '#FF5252',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
    },
    resetButtonText: {
        color: '#FFF',
        fontFamily: 'Roboto-Medium',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        width: '100%',
        height: '80%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: 'hidden',
    },
    modalSafeArea: {
        flex: 1,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    modalTitle: {
        color: '#FFFFFF',
        fontSize: 22,
        fontFamily: 'Roboto-Bold',
    },
    closeModalButton: {
        padding: 5,
    },
    filtersContainer: {
        flex: 1,
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    filtersScrollContent: {
        paddingBottom: 20,
    },
    filterGroup: {
        marginBottom: 20,
    },
    filterGroupTitle: {
        color: '#FF5252',
        fontSize: 16,
        fontFamily: 'Roboto-Bold',
        marginBottom: 10,
    },
    filterOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    filterOption: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 8,
        marginRight: 10,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    selectedFilterOption: {
        backgroundColor: '#FF5252',
        borderColor: '#FF5252',
    },
    filterOptionText: {
        color: '#EEE',
        fontFamily: 'Roboto-Medium',
        fontSize: 13,
    },
    selectedFilterOptionText: {
        color: '#FFFFFF',
    },
    modalFooter: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    resetFiltersButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#FF5252',
        paddingHorizontal: 30,
        paddingVertical: 12,
        borderRadius: 25,
    },
    resetFiltersText: {
        color: '#FF5252',
        fontFamily: 'Roboto-Medium',
        fontSize: 16,
    },
    applyFiltersButton: {
        backgroundColor: '#FF5252',
        paddingHorizontal: 30,
        paddingVertical: 12,
        borderRadius: 25,
        shadowColor: '#FF5252',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    applyFiltersText: {
        color: '#FFFFFF',
        fontFamily: 'Roboto-Medium',
        fontSize: 16,
    },
});

export default LibraryScreen;