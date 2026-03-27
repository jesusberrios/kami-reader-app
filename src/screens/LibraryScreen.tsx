import React, { useEffect, useState, useCallback, useRef } from 'react';
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
    Platform
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useAlertContext } from '../contexts/AlertContext';
import { backendUrl } from '../config/backend';
import { getProviderAliasLabel, normalizeProviderSource } from '../utils/providerBranding';

const REQUEST_TIMEOUT_MS = 8000;
const PAGE_LIMIT = 24;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

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
};

type SortKey = 'default' | 'title_asc' | 'title_desc' | 'score_desc';
type SourceKey = 'all' | 'zonatmo' | 'visormanga' | 'manhwaonline';
type StatusKey = 'all' | 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';
type RatingKey = 'all' | 'safe' | 'suggestive' | 'erotica';

type FilterOption = {
    label: string;
    value: string;
};

const { width } = Dimensions.get('window');

const SORT_OPTIONS: FilterOption[] = [
    { label: 'Por defecto', value: 'default' },
    { label: 'Título A-Z', value: 'title_asc' },
    { label: 'Título Z-A', value: 'title_desc' },
    { label: 'Mejor puntuados', value: 'score_desc' },
];

const SOURCE_OPTIONS: FilterOption[] = [
    { label: 'Todas', value: 'all' },
    { label: 'Catalogo A', value: 'zonatmo' },
    { label: 'Catalogo B', value: 'visormanga' },
    { label: 'Catalogo C', value: 'manhwaonline' },
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

const applyRelevanceFilter = (list: Comic[], query: string): Comic[] => {
    const q = normalizeText(query);
    const qTokens = tokenize(query);

    if (!q || qTokens.length === 0) return list;

    const ranked = list.map((item) => {
        const title = item.normalizedTitle || normalizeText(item.title || '');
        const desc = item.normalizedDescription || normalizeText(item.description || '');

        let score = 0;
        let matched = 0;

        if (title.includes(q)) score += 100;

        for (const token of qTokens) {
            if (title.includes(token)) {
                score += 16;
                matched += 1;
            } else if (desc.includes(token)) {
                score += 6;
                matched += 1;
            }
        }

        return { item, score, matched };
    });

    const minMatches = Math.max(1, Math.ceil(qTokens.length * 0.6));

    return ranked
        .filter((x) => x.score >= 100 || x.matched >= minMatches)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.item);
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
    const isMounted = useRef(true);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const requestIdRef = useRef(0);
    const allComicsRef = useRef<Comic[]>([]);
    const searchCacheRef = useRef<Map<string, { timestamp: number; results: Comic[]; totalPages?: number }>>(new Map());

    const { alertError } = useAlertContext();

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

            const data = await fetchJsonWithTimeout(`${backendUrl('/latest')}${query.toString() ? `?${query.toString()}` : ''}`);
            const list: Comic[] = (data.results || []).map(mapApiComic);

            const totalPagesRaw = Number(data?.pagination?.totalPages);
            const nextHasMore = Number.isFinite(totalPagesRaw)
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

    const handleLoadMore = useCallback(() => {
        if (loading || isFetchingMore || !hasMore) return;

        const nextPage = currentPage + 1;
        if (committedSearchQuery.trim()) {
            searchComics({ page: nextPage, append: true });
        } else {
            loadLatest({ page: nextPage, append: true });
        }
    }, [loading, isFetchingMore, hasMore, currentPage, committedSearchQuery, searchComics, loadLatest]);

    const applyFilters = useCallback(() => {
        setSelectedSort(pendingSort);
        setSelectedSource(pendingSource);
        setSelectedStatus(pendingStatus);
        setSelectedRating(pendingRating);
        setShowFilters(false);
        applyFiltersAndSort(allComics, pendingSort, pendingSource, pendingStatus, pendingRating);
    }, [pendingSort, pendingSource, pendingStatus, pendingRating, allComics, applyFiltersAndSort]);

    const resetFilters = useCallback(() => {
        setPendingSort('default');
        setSelectedSort('default');
        setPendingSource('all');
        setSelectedSource('all');
        setPendingStatus('all');
        setSelectedStatus('all');
        setPendingRating('all');
        setSelectedRating('all');
        setShowFilters(false);
        applyFiltersAndSort(allComics, 'default', 'all', 'all', 'all');
    }, [allComics, applyFiltersAndSort]);

    if (loading && comics.length === 0) {
        return (
            <LinearGradient colors={['#0F0F15', '#20202A']} style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FF5252" />
                <Text style={styles.loadingText}>Cargando mangas...</Text>
            </LinearGradient>
        );
    }

    if (error && comics.length === 0) {
        return (
            <LinearGradient colors={['#0F0F15', '#20202A']} style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle" size={40} color="#FF5252" />
                <Text style={styles.errorText}>No se pudo conectar</Text>
                <Text style={styles.errorSubText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={() => loadLatest({ page: 1, append: false })}>
                    <Text style={styles.retryButtonText}>Reintentar</Text>
                </TouchableOpacity>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={['#0F0F15', '#20202A']} style={styles.container}>
            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerSideSpacer} />
                    <Text style={styles.title}>Biblioteca</Text>
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
                            (selectedSort !== 'default' || selectedSource !== 'all' || selectedStatus !== 'all' || selectedRating !== 'all') && styles.filterButtonActive,
                        ]}
                    >
                        <MaterialCommunityIcons
                            name="filter"
                            size={24}
                            color={(selectedSort !== 'default' || selectedSource !== 'all' || selectedStatus !== 'all' || selectedRating !== 'all') ? '#FFF' : '#FF5252'}
                        />
                    </TouchableOpacity>
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <View style={styles.searchInputContainer}>
                        <MaterialCommunityIcons name="magnify" size={20} color="#888" style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Buscar cómics..."
                            placeholderTextColor="#888"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            onSubmitEditing={runSearch}
                            returnKeyType="search"
                        />
                        {searchQuery !== '' && (
                            <TouchableOpacity onPress={() => { setSearchQuery(''); setCommittedSearchQuery(''); loadLatest({ page: 1, append: false }); }} style={styles.clearSearchButton}>
                                <MaterialCommunityIcons name="close-circle" size={20} color="#888" />
                            </TouchableOpacity>
                        )}
                    </View>
                    <TouchableOpacity style={styles.searchButton} onPress={runSearch}>
                        <Text style={styles.searchButtonText}>Buscar</Text>
                    </TouchableOpacity>
                </View>

                {/* Active Filters */}
                {/* Sort indicator */}
                {(selectedSort !== 'default' || selectedSource !== 'all' || selectedStatus !== 'all' || selectedRating !== 'all') && (
                    <View style={styles.activeFiltersContainer}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersScrollContent}>
                            {selectedSort !== 'default' && (
                                <View style={styles.activeFilter}>
                                    <Text style={styles.activeFilterText}>{SORT_OPTIONS.find(o => o.value === selectedSort)?.label}</Text>
                                </View>
                            )}
                            {selectedSource !== 'all' && (
                                <View style={styles.activeFilter}>
                                    <Text style={styles.activeFilterText}>{SOURCE_OPTIONS.find(o => o.value === selectedSource)?.label}</Text>
                                </View>
                            )}
                            {selectedStatus !== 'all' && (
                                <View style={styles.activeFilter}>
                                    <Text style={styles.activeFilterText}>{STATUS_OPTIONS.find(o => o.value === selectedStatus)?.label}</Text>
                                </View>
                            )}
                            {selectedRating !== 'all' && (
                                <View style={styles.activeFilter}>
                                    <Text style={styles.activeFilterText}>{RATING_OPTIONS.find(o => o.value === selectedRating)?.label}</Text>
                                </View>
                            )}
                            <TouchableOpacity onPress={resetFilters} style={styles.clearAllFiltersButton}>
                                <Text style={styles.clearAllFiltersText}>Limpiar</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                )}

                {/* Comics List */}
                <FlatList
                    data={comics}
                    keyExtractor={(item) => `${item.source}:${item.slug}`}
                    contentContainerStyle={styles.comicsList}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.4}
                    ListFooterComponent={
                        isFetchingMore ? (
                            <ActivityIndicator style={{ marginVertical: 20 }} size="large" color="#FF5252" />
                        ) : null
                    }
                    ListEmptyComponent={() =>
                        !loading ? (
                            <View style={styles.emptyContainer}>
                                <MaterialCommunityIcons name="book-alert" size={50} color="#666" />
                                <Text style={styles.emptyText}>No se encontraron mangas</Text>
                                <TouchableOpacity style={styles.resetButton} onPress={() => loadLatest({ page: 1, append: false })}>
                                    <Text style={styles.resetButtonText}>Mostrar recientes</Text>
                                </TouchableOpacity>
                            </View>
                        ) : null
                    }
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.comicGridItem}
                            onPress={() => navigation.navigate('Details', { slug: item.slug })}
                        >
                            <Image
                                source={{ uri: item.cover }}
                                style={styles.comicCover}
                                contentFit="cover"
                                placeholder={require('../../assets/auth-bg.png')}
                            />
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.85)']}
                                style={styles.comicTitleGradient}
                            >
                                <Text style={styles.comicGridTitle} numberOfLines={2}>{item.title}</Text>
                            </LinearGradient>
                            <View style={styles.providerBadge}>
                                <Text style={styles.providerBadgeText}>{getProviderAliasLabel(item.source)}</Text>
                            </View>
                            {item.score && item.score !== '0.0' && (
                                <View style={styles.scoreBadge}>
                                    <MaterialCommunityIcons name="star" size={10} color="#FFD700" />
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

                {/* Sort Modal */}
                <Modal
                    visible={showFilters}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setShowFilters(false)}
                >
                    <View style={styles.modalOverlay}>
                        <LinearGradient colors={['#181820', '#2A2A36']} style={styles.modalContainer}>
                            <SafeAreaView style={styles.modalSafeArea}>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>Ordenar</Text>
                                    <TouchableOpacity onPress={() => setShowFilters(false)} style={styles.closeModalButton}>
                                        <MaterialCommunityIcons name="close" size={26} color="#FF5252" />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView style={styles.filtersContainer} contentContainerStyle={styles.filtersScrollContent}>
                                    <View style={styles.filterGroup}>
                                        <Text style={styles.filterGroupTitle}>Orden</Text>
                                        <View style={styles.filterOptions}>
                                            {SORT_OPTIONS.map((option) => (
                                                <TouchableOpacity
                                                    key={option.value}
                                                    style={[
                                                        styles.filterOption,
                                                        pendingSort === option.value && styles.selectedFilterOption,
                                                    ]}
                                                    onPress={() => setPendingSort(option.value as SortKey)}
                                                >
                                                    <Text style={[
                                                        styles.filterOptionText,
                                                        pendingSort === option.value && styles.selectedFilterOptionText,
                                                    ]}>
                                                        {option.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    <View style={styles.filterGroup}>
                                        <Text style={styles.filterGroupTitle}>Fuente</Text>
                                        <View style={styles.filterOptions}>
                                            {SOURCE_OPTIONS.map((option) => (
                                                <TouchableOpacity
                                                    key={option.value}
                                                    style={[
                                                        styles.filterOption,
                                                        pendingSource === option.value && styles.selectedFilterOption,
                                                    ]}
                                                    onPress={() => setPendingSource(option.value as SourceKey)}
                                                >
                                                    <Text style={[
                                                        styles.filterOptionText,
                                                        pendingSource === option.value && styles.selectedFilterOptionText,
                                                    ]}>
                                                        {option.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    <View style={styles.filterGroup}>
                                        <Text style={styles.filterGroupTitle}>Estado</Text>
                                        <View style={styles.filterOptions}>
                                            {STATUS_OPTIONS.map((option) => (
                                                <TouchableOpacity
                                                    key={option.value}
                                                    style={[
                                                        styles.filterOption,
                                                        pendingStatus === option.value && styles.selectedFilterOption,
                                                    ]}
                                                    onPress={() => setPendingStatus(option.value as StatusKey)}
                                                >
                                                    <Text style={[
                                                        styles.filterOptionText,
                                                        pendingStatus === option.value && styles.selectedFilterOptionText,
                                                    ]}>
                                                        {option.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    <View style={styles.filterGroup}>
                                        <Text style={styles.filterGroupTitle}>Clasificacion</Text>
                                        <View style={styles.filterOptions}>
                                            {RATING_OPTIONS.map((option) => (
                                                <TouchableOpacity
                                                    key={option.value}
                                                    style={[
                                                        styles.filterOption,
                                                        pendingRating === option.value && styles.selectedFilterOption,
                                                    ]}
                                                    onPress={() => setPendingRating(option.value as RatingKey)}
                                                >
                                                    <Text style={[
                                                        styles.filterOptionText,
                                                        pendingRating === option.value && styles.selectedFilterOptionText,
                                                    ]}>
                                                        {option.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                </ScrollView>

                                <View style={styles.modalFooter}>
                                    <TouchableOpacity style={styles.resetFiltersButton} onPress={resetFilters}>
                                        <Text style={styles.resetFiltersText}>Restablecer</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.applyFiltersButton} onPress={applyFilters}>
                                        <Text style={styles.applyFiltersText}>Aplicar</Text>
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