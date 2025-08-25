import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    SafeAreaView,
    TextInput,
    TouchableOpacity,
    Modal,
    ScrollView,
    Dimensions,
    StatusBar,
    Platform
} from 'react-native';
import { DrawerActions } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DrawerToggle from '../components/drawerToggle';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useAlertContext } from '../contexts/AlertContext'; // Importar el contexto de alertas

type Comic = {
    hid: string;
    slug: string;
    title: string;
    cover_url: string;
    demographic?: number;
    country?: string;
    status?: number;
    genres?: string[];
};

type SelectedFilters = {
    genres: string[];
    demographic: string | null;
    country: string | null;
    status: string | null;
    content_rating: string;
    sort: string;
    [key: string]: any;
};

type FilterOption = {
    label: string;
    value: string | number;
};

const PAGE_LIMIT = 20;
const { width } = Dimensions.get('window');

const LibraryScreen = ({ navigation }: any) => {
    const [comics, setComics] = useState<Comic[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const insets = useSafeAreaInsets();

    // Obtener las funciones de alerta del contexto
    const { alertError } = useAlertContext();

    const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>({
        genres: [],
        demographic: null,
        country: null,
        status: null,
        content_rating: 'safe',
        sort: 'view',
    });

    const filterOptions = {
        genres: [
            { label: 'Acción', value: 'action' },
            { label: 'Aventura', value: 'adventure' },
            { label: 'Drama', value: 'drama' },
            { label: 'Fantasía', value: 'fantasy' },
            { label: 'Comedia', value: 'comedy' },
            { label: 'Romance', value: 'romance' },
            { label: 'Terror', value: 'horror' },
            { label: 'Deportes', value: 'sports' },
            { label: 'BL', value: 'yaoi' }
        ],
        demographic: [
            { label: 'Shounen', value: 1 },
            { label: 'Shoujo', value: 2 },
            { label: 'Seinen', value: 3 },
            { label: 'Josei', value: 4 },
        ],
        country: [
            { label: 'Japón', value: 'jp' },
            { label: 'Corea', value: 'kr' },
            { label: 'China', value: 'cn' },
            { label: 'Otros', value: 'other' },
        ],
        status: [
            { label: 'En curso', value: 1 },
            { label: 'Completado', value: 2 },
            { label: 'Cancelado', value: 3 },
            { label: 'En pausa', value: 4 },
        ],
        content_rating: [
            { label: 'Seguro', value: 'safe' },
            { label: 'Sugestivo', value: 'suggestive' },
            { label: 'Erótico', value: 'erotica' },
        ],
        sort: [
            { label: 'Más vistos', value: 'view' },
            { label: 'Recientes', value: 'created_at' },
            { label: 'Mejor valorados', value: 'rating' },
            { label: 'Más seguidos', value: 'follow' },
        ],
    };

    useEffect(() => {
        loadTrendingComics();
    }, []);

    const loadTrendingComics = async () => {
        setPage(1);
        setHasMore(true);
        setComics([]);
        fetchComics({ q: '', page: 1, replace: true });
    };

    const fetchComics = async ({
        q,
        page,
        replace = false,
    }: {
        q: string;
        page: number;
        replace?: boolean;
    }) => {
        try {
            if (replace) {
                setLoading(true);
                setComics([]);
            } else {
                setIsFetchingMore(true);
            }
            setError(null);

            const params: any = {
                tachiyomi: 'true',
                limit: PAGE_LIMIT.toString(),
                page: page.toString(),
                sort: selectedFilters.sort,
                content_rating: selectedFilters.content_rating,
            };

            if (q.trim() !== '') {
                params.q = q.trim();
            } else {
                if (selectedFilters.demographic) {
                    params.demographic = selectedFilters.demographic;
                }
                if (selectedFilters.country) {
                    params.country = selectedFilters.country;
                }
                if (selectedFilters.status) {
                    params.status = selectedFilters.status;
                }
                if (selectedFilters.genres.length > 0) {
                    params.genres = selectedFilters.genres.join(',');
                }
            }

            const query = new URLSearchParams(params);
            const url = `https://api.comick.fun/v1.0/search?${query.toString()}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

            const data = await response.json();

            const comicsList = data.map((comic: any) => ({
                hid: comic.hid,
                slug: comic.slug,
                title: comic.title,
                cover_url: comic.md_covers?.[0]?.b2key
                    ? `https://meo.comick.pictures/${comic.md_covers[0].b2key}`
                    : 'https://via.placeholder.com/150x200?text=No+Cover',
                demographic: comic.demographic,
                country: comic.country,
                status: comic.status,
                genres: comic.genres,
            }));

            setComics(prev => {
                const existingHids = new Set(prev.map(comic => comic.hid));
                const uniqueNewComics = comicsList.filter((comic: Comic) => !existingHids.has(comic.hid));
                return replace ? uniqueNewComics : [...prev, ...uniqueNewComics];
            });

            setHasMore(comicsList.length === PAGE_LIMIT);
            setPage(page);
        } catch (e: any) {
            setError(e.message);
            alertError("Error al cargar los cómics. Por favor, intenta nuevamente.");
        } finally {
            setLoading(false);
            setIsFetchingMore(false);
        }
    };

    const searchComics = () => {
        setPage(1);
        setHasMore(true);
        setComics([]);
        fetchComics({ q: searchQuery, page: 1, replace: true });
    };

    const loadMore = useCallback(() => {
        if (loading || isFetchingMore || !hasMore) return;
        const nextPage = page + 1;
        fetchComics({ q: searchQuery, page: nextPage });
    }, [loading, isFetchingMore, hasMore, page, searchQuery, selectedFilters]);

    const resetSearch = () => {
        setSearchQuery('');
        setSelectedFilters({
            genres: [],
            demographic: null,
            country: null,
            status: null,
            content_rating: 'safe',
            sort: 'view',
        });
        loadTrendingComics();
    };

    const toggleFilter = (type: string, value: any) => {
        if (type === 'genres') {
            const newGenres = selectedFilters.genres.includes(value)
                ? selectedFilters.genres.filter((g: string) => g !== value)
                : [...selectedFilters.genres, value];
            setSelectedFilters({ ...selectedFilters, genres: newGenres });
        } else {
            setSelectedFilters({
                ...selectedFilters,
                [type]: selectedFilters[type] === value ? null : value,
            });
        }
    };

    const applyFilters = () => {
        setShowFilters(false);
        setPage(1);
        setHasMore(true);
        setComics([]);
        fetchComics({ q: searchQuery, page: 1, replace: true });
    };

    const renderFilterButton = (type: string, options: FilterOption[]) => (
        <View style={styles.filterGroup}>
            <Text style={styles.filterGroupTitle}>{type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}</Text>
            <View style={styles.filterOptions}>
                {options.map((option) => (
                    <TouchableOpacity
                        key={String(option.value)}
                        style={[
                            styles.filterOption,
                            (type === 'genres'
                                ? selectedFilters.genres.includes(String(option.value))
                                : selectedFilters[type] === option.value) && styles.selectedFilterOption,
                        ]}
                        onPress={() => toggleFilter(type, option.value)}
                    >
                        <Text style={[
                            styles.filterOptionText,
                            (type === 'genres'
                                ? selectedFilters.genres.includes(String(option.value))
                                : selectedFilters[type] === option.value) && styles.selectedFilterOptionText,
                        ]}>
                            {option.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

    const getGenreDisplayName = (genreSlug: string) => {
        const found = filterOptions.genres.find(g => g.value.toLowerCase() === genreSlug.toLowerCase());
        return found ? found.label : genreSlug;
    };

    const getStatusText = (statusCode: number) => {
        const found = filterOptions.status.find(s => s.value === statusCode);
        return found ? found.label : 'Desconocido';
    };

    if (loading && page === 1) {
        return (
            <LinearGradient colors={['#0F0F15', '#20202A']} style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FF5252" />
                <Text style={styles.loadingText}>Cargando cómics...</Text>
            </LinearGradient>
        );
    }

    if (error && page === 1) {
        return (
            <LinearGradient colors={['#0F0F15', '#20202A']} style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle" size={40} color="#FF5252" />
                <Text style={styles.errorText}>Error al cargar los cómics</Text>
                <Text style={styles.errorSubText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadTrendingComics}>
                    <Text style={styles.retryButtonText}>Reintentar</Text>
                </TouchableOpacity>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={['#0F0F15', '#20202A']} style={styles.container}>
            <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
            <SafeAreaView style={[styles.safeArea, { paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top }]}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
                        style={styles.menuButton}
                    >
                        <DrawerToggle />
                    </TouchableOpacity>
                    <Text style={styles.title}>Biblioteca</Text>
                    <TouchableOpacity
                        onPress={() => setShowFilters(true)}
                        style={styles.filterButton}
                    >
                        <MaterialCommunityIcons name="filter" size={24} color="#FF5252" />
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
                            onSubmitEditing={searchComics}
                            returnKeyType="search"
                        />
                        {searchQuery !== '' && (
                            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchButton}>
                                <MaterialCommunityIcons name="close-circle" size={20} color="#888" />
                            </TouchableOpacity>
                        )}
                    </View>
                    <TouchableOpacity style={styles.searchButton} onPress={searchComics}>
                        <Text style={styles.searchButtonText}>Buscar</Text>
                    </TouchableOpacity>
                </View>

                {/* Active Filters */}
                {(selectedFilters.demographic || selectedFilters.country || selectedFilters.status || selectedFilters.genres.length > 0) && (
                    <View style={styles.activeFiltersContainer}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersScrollContent}>
                            {selectedFilters.demographic && (
                                <View style={styles.activeFilter}>
                                    <Text style={styles.activeFilterText}>
                                        {filterOptions.demographic.find(f => String(f.value) === selectedFilters.demographic)?.label}
                                    </Text>
                                    <TouchableOpacity onPress={() => toggleFilter('demographic', selectedFilters.demographic)}>
                                        <MaterialCommunityIcons name="close-circle" size={16} color="#FF5252" style={styles.removeFilterIcon} />
                                    </TouchableOpacity>
                                </View>
                            )}
                            {selectedFilters.country && (
                                <View style={styles.activeFilter}>
                                    <Text style={styles.activeFilterText}>
                                        {filterOptions.country.find(f => f.value === selectedFilters.country)?.label}
                                    </Text>
                                    <TouchableOpacity onPress={() => toggleFilter('country', selectedFilters.country)}>
                                        <MaterialCommunityIcons name="close-circle" size={16} color="#FF5252" style={styles.removeFilterIcon} />
                                    </TouchableOpacity>
                                </View>
                            )}
                            {selectedFilters.status && (
                                <View style={styles.activeFilter}>
                                    <Text style={styles.activeFilterText}>
                                        {filterOptions.status.find(f => String(f.value) === selectedFilters.status)?.label}
                                    </Text>
                                    <TouchableOpacity onPress={() => toggleFilter('status', selectedFilters.status)}>
                                        <MaterialCommunityIcons name="close-circle" size={16} color="#FF5252" style={styles.removeFilterIcon} />
                                    </TouchableOpacity>
                                </View>
                            )}
                            {selectedFilters.genres.map((genre: string) => (
                                <View key={genre} style={styles.activeFilter}>
                                    <Text style={styles.activeFilterText}>{getGenreDisplayName(genre)}</Text>
                                    <TouchableOpacity onPress={() => toggleFilter('genres', genre)}>
                                        <MaterialCommunityIcons name="close-circle" size={16} color="#FF5252" style={styles.removeFilterIcon} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                            <TouchableOpacity onPress={resetSearch} style={styles.clearAllFiltersButton}>
                                <Text style={styles.clearAllFiltersText}>Limpiar Todos</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                )}

                {/* Comics List */}
                <FlatList
                    data={comics}
                    keyExtractor={(item) => item.hid}
                    contentContainerStyle={styles.comicsList}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    ListFooterComponent={
                        isFetchingMore ? (
                            <ActivityIndicator style={{ marginVertical: 20 }} size="large" color="#FF5252" />
                        ) : null
                    }
                    ListEmptyComponent={() =>
                        !loading ? (
                            <View style={styles.emptyContainer}>
                                <MaterialCommunityIcons name="book-alert" size={50} color="#666" />
                                <Text style={styles.emptyText}>No se encontraron cómics</Text>
                                <TouchableOpacity style={styles.resetButton} onPress={resetSearch}>
                                    <Text style={styles.resetButtonText}>Mostrar todos</Text>
                                </TouchableOpacity>
                            </View>
                        ) : null
                    }
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.comicGridItem} onPress={() => navigation.navigate('Details', { slug: item.slug })}>
                            <Image
                                source={{ uri: item.cover_url }}
                                style={styles.comicCover}
                                contentFit="cover"
                                placeholder={{ uri: 'https://via.placeholder.com/150x200?text=No+Cover' }}
                            />
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.8)']}
                                style={styles.comicTitleGradient}
                            >
                                <Text style={styles.comicGridTitle} numberOfLines={2}>{item.title}</Text>
                            </LinearGradient>
                            <View style={styles.comicBadgesGrid}>
                                {item.status && (
                                    <View style={[
                                        styles.comicGridBadge,
                                        item.status === 1 && styles.statusOngoing,
                                        item.status === 2 && styles.statusCompleted,
                                        item.status === 3 && styles.statusCancelled,
                                        item.status === 4 && styles.statusHiatus,
                                    ]}>
                                        <Text style={styles.comicGridBadgeText}>
                                            {getStatusText(item.status)}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                    )}
                />

                {/* Filters Modal */}
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
                                    <Text style={styles.modalTitle}>Filtros</Text>
                                    <TouchableOpacity onPress={() => setShowFilters(false)} style={styles.closeModalButton}>
                                        <MaterialCommunityIcons name="close" size={26} color="#FF5252" />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView style={styles.filtersContainer} contentContainerStyle={styles.filtersScrollContent}>
                                    {renderFilterButton('sort', filterOptions.sort)}
                                    {renderFilterButton('content_rating', filterOptions.content_rating)}
                                    {renderFilterButton('demographic', filterOptions.demographic)}
                                    {renderFilterButton('country', filterOptions.country)}
                                    {renderFilterButton('status', filterOptions.status)}
                                    {renderFilterButton('genres', filterOptions.genres)}
                                </ScrollView>

                                <View style={styles.modalFooter}>
                                    <TouchableOpacity style={styles.resetFiltersButton} onPress={resetSearch}>
                                        <Text style={styles.resetFiltersText}>Restablecer</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.applyFiltersButton} onPress={applyFilters}>
                                        <Text style={styles.applyFiltersText}>Aplicar Filtros</Text>
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
    menuButton: {
        padding: 5,
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
    comicBadgesGrid: {
        position: 'absolute',
        top: 8,
        left: 8,
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    comicGridBadge: {
        backgroundColor: 'rgba(255, 82, 82, 0.7)',
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 5,
        marginRight: 5,
        marginBottom: 5,
    },
    comicGridBadgeText: {
        color: '#FFFFFF',
        fontFamily: 'Roboto-Medium',
        fontSize: 10,
    },
    statusOngoing: {
        backgroundColor: '#4CAF50',
    },
    statusCompleted: {
        backgroundColor: '#2196F3',
    },
    statusCancelled: {
        backgroundColor: '#F44336',
    },
    statusHiatus: {
        backgroundColor: '#FFC107',
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