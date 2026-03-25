import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Image,
    SafeAreaView,
    StatusBar,
    Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/config';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useAlertContext } from '../contexts/AlertContext';

type FavoriteItem = {
    id: string;
    comicTitle: string;
    coverUrl: string;
    slug: string;
    content_rating?: string;
    source?: string;
};

export default function FavoritesScreen() {
    const navigation = useNavigation<any>();
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);
    const insets = useSafeAreaInsets();
    const { alertConfirm, alertError, alertSuccess } = useAlertContext();

    // Efecto para autenticación
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            setCurrentUserUid(user ? user.uid : null);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    // Efecto para cargar favoritos
    useEffect(() => {
        if (!currentUserUid) {
            setFavorites([]);
            setLoading(false);
            return;
        }

        const favoritesCollectionRef = collection(db, 'users', currentUserUid, 'favorites');
        const favoritesQuery = query(favoritesCollectionRef, orderBy('favoritedAt', 'desc'));
        const unsubscribe = onSnapshot(
            favoritesQuery,
            (querySnapshot) => {
                const favs: FavoriteItem[] = [];
                querySnapshot.forEach((document) => {
                    const data = document.data();
                    favs.push({
                        id: document.id,
                        comicTitle: data.comicTitle,
                        coverUrl: data.coverUrl,
                        slug: data.slug,
                        content_rating: data.content_rating,
                        source: data.source,
                    });
                });
                setFavorites(favs);
                setLoading(false);
            },
            (error) => {
                alertError("No se pudieron cargar los favoritos.");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [currentUserUid, alertError]);

    // Handlers memoizados
    const handleFavoritePress = useCallback((slug: string) => {
        navigation.navigate('Details', { slug });
    }, [navigation]);

    const handleRemoveFavorite = useCallback((item: FavoriteItem) => {
        if (!currentUserUid) {
            alertError('No se pudo eliminar el favorito.');
            return;
        }

        alertConfirm(
            `¿Quieres quitar "${item.comicTitle}" de tus favoritos?`,
            async () => {
                try {
                    setRemovingId(item.id);
                    await deleteDoc(doc(db, 'users', currentUserUid, 'favorites', item.id));
                    alertSuccess('Manga eliminado de favoritos.');
                } catch {
                    alertError('No se pudo eliminar el favorito.');
                } finally {
                    setRemovingId(null);
                }
            },
            'Eliminar favorito',
            'Eliminar',
            'Cancelar'
        );
    }, [alertConfirm, alertError, alertSuccess, currentUserUid]);

    const handleGoBack = useCallback(() => {
        navigation.goBack();
    }, [navigation]);

    const handleAuthNavigation = useCallback(() => {
        navigation.navigate('Auth');
    }, [navigation]);

    const handleLibraryNavigation = useCallback(() => {
        navigation.navigate('Library');
    }, [navigation]);

    // Componentes memoizados
    const renderFavoriteItem = useCallback(({ item }: { item: FavoriteItem }) => (
        <View style={styles.item}>
            <TouchableOpacity
                style={styles.itemPressable}
                onPress={() => handleFavoritePress(item.slug)}
                activeOpacity={0.82}
            >
                <Image
                    source={{ uri: item.coverUrl }}
                    style={styles.coverImage}
                    resizeMode="cover"
                />
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.8)']}
                    style={styles.imageGradient}
                />
                <View style={styles.itemContent}>
                    <View style={styles.itemMetaRow}>
                        <View style={styles.sourcePill}>
                            <Text style={styles.sourcePillText}>{item.source || 'zonatmo'}</Text>
                        </View>
                        {item.content_rating === 'erotica' && (
                            <View style={styles.eroticBadge}>
                                <Text style={styles.eroticBadgeText}>18+</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.title} numberOfLines={2}>{item.comicTitle}</Text>
                    <Text style={styles.itemHint}>Toca para abrir detalles</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color="#FF6B6B" />
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.removeButton, removingId === item.id && styles.removeButtonDisabled]}
                onPress={() => handleRemoveFavorite(item)}
                disabled={removingId === item.id}
                accessibilityLabel={`Quitar ${item.comicTitle} de favoritos`}
            >
                {removingId === item.id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                ) : (
                    <>
                        <Ionicons name="trash-outline" size={18} color="#FFF" />
                        <Text style={styles.removeButtonText}>Eliminar</Text>
                    </>
                )}
            </TouchableOpacity>
        </View>
    ), [handleFavoritePress, handleRemoveFavorite, removingId]);

    const renderListHeader = useMemo(() => {
        if (favorites.length === 0) return null;

        return (
            <LinearGradient colors={['rgba(255,107,107,0.18)', 'rgba(107,138,253,0.12)']} style={styles.summaryCard}>
                <View style={styles.summaryIconWrap}>
                    <Ionicons name="heart" size={22} color="#FFB3B3" />
                </View>
                <View style={styles.summaryTextWrap}>
                    <Text style={styles.summaryTitle}>Tu colección guardada</Text>
                    <Text style={styles.summarySubtitle}>
                        {favorites.length} {favorites.length === 1 ? 'favorito listo para releer.' : 'favoritos listos para releer.'}
                    </Text>
                </View>
            </LinearGradient>
        );
    }, [favorites.length]);

    const renderEmptyState = useMemo(() => (
        <View style={styles.emptyContent}>
            <Ionicons name="heart-dislike-outline" size={80} color="#B0BEC5" />
            <Text style={styles.emptyStateText}>Aún no tienes cómics favoritos</Text>
            <Text style={styles.emptyStateSubText}>Guarda tus cómics favoritos para encontrarlos fácilmente</Text>
            <TouchableOpacity
                style={styles.browseButton}
                onPress={handleLibraryNavigation}
                accessible
                accessibilityLabel="Explorar cómics"
            >
                <Text style={styles.browseButtonText}>Explorar Cómics</Text>
            </TouchableOpacity>
        </View>
    ), [handleLibraryNavigation]);

    const renderAuthRequired = useMemo(() => (
        <View style={styles.emptyStateContainer}>
            <Ionicons name="person-circle-outline" size={80} color="#B0BEC5" />
            <Text style={styles.emptyStateText}>Inicia sesión para guardar y ver tus favoritos</Text>
            <TouchableOpacity
                style={styles.loginButton}
                onPress={handleAuthNavigation}
                accessible
                accessibilityLabel="Ir a la pantalla de inicio de sesión"
            >
                <Text style={styles.loginButtonText}>Iniciar Sesión</Text>
            </TouchableOpacity>
        </View>
    ), [handleAuthNavigation]);

    const renderTopBar = useMemo(() => (
        <View style={styles.topBar}>
            <TouchableOpacity
                onPress={handleGoBack}
                style={styles.backButton}
                accessible
                accessibilityLabel="Volver atrás"
            >
                <Ionicons name="arrow-back" size={28} color="#FF6B6B" />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>Mis Favoritos</Text>
        </View>
    ), [handleGoBack]);

    // Estados de carga y contenido
    if (loading) {
        return (
            <LinearGradient colors={['#0F0F1A', '#252536']} style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FF6B6B" />
                <Text style={styles.loadingText}>Cargando favoritos...</Text>
            </LinearGradient>
        );
    }

    if (!currentUserUid) {
        return (
            <LinearGradient colors={['#0F0F1A', '#252536']} style={styles.container}>
                <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
                <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
                    {renderTopBar}
                    {renderAuthRequired}
                </SafeAreaView>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={['#0F0F1A', '#252536']} style={styles.container}>
            <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
            <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
                {renderTopBar}

                {favorites.length === 0 ? (
                    renderEmptyState
                ) : (
                    <FlatList
                        data={favorites}
                        keyExtractor={(item) => item.id}
                        renderItem={renderFavoriteItem}
                        ListHeaderComponent={renderListHeader}
                        contentContainerStyle={styles.flatListContent}
                        showsVerticalScrollIndicator={false}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={5}
                    />
                )}
            </SafeAreaView>
        </LinearGradient>
    );
}

// Estilos optimizados
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
        marginTop: 15,
        fontSize: 16,
        color: '#FF6B6B',
        fontFamily: 'Roboto-Medium',
    },
    emptyStateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyStateText: {
        color: '#E0E0E0',
        fontSize: 20,
        textAlign: 'center',
        marginTop: 20,
        fontFamily: 'Roboto-Medium',
        lineHeight: 28,
    },
    emptyStateSubText: {
        color: '#B0B0B0',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 10,
        fontFamily: 'Roboto-Regular',
        lineHeight: 22,
        maxWidth: '80%',
    },
    loginButton: {
        marginTop: 30,
        backgroundColor: '#FF6B6B',
        paddingVertical: 14,
        paddingHorizontal: 40,
        borderRadius: 25,
        shadowColor: '#FF6B6B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 6,
    },
    loginButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontFamily: 'Roboto-Bold',
    },
    browseButton: {
        marginTop: 30,
        backgroundColor: '#6B8AFD',
        paddingVertical: 14,
        paddingHorizontal: 40,
        borderRadius: 25,
        shadowColor: '#6B8AFD',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 6,
    },
    browseButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontFamily: 'Roboto-Bold',
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        position: 'relative',
    },
    backButton: {
        position: 'absolute',
        left: 20,
        zIndex: 10,
    },
    topBarTitle: {
        color: '#FFFFFF',
        fontSize: 24,
        fontFamily: 'Roboto-Bold',
        flex: 1,
        textAlign: 'center',
    },
    flatListContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
    },
    summaryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingVertical: 16,
        marginBottom: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    summaryIconWrap: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,107,107,0.22)',
        marginRight: 12,
    },
    summaryTextWrap: {
        flex: 1,
    },
    summaryTitle: {
        color: '#FFFFFF',
        fontSize: 17,
        fontFamily: 'Roboto-Bold',
    },
    summarySubtitle: {
        marginTop: 4,
        color: '#C7CAD7',
        fontSize: 13,
        fontFamily: 'Roboto-Regular',
    },
    item: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        marginBottom: 15,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    itemPressable: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 120,
        position: 'relative',
    },
    coverImage: {
        width: 80,
        height: '100%',
        backgroundColor: '#333',
    },
    imageGradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '40%',
    },
    itemContent: {
        flex: 1,
        paddingHorizontal: 15,
        justifyContent: 'center',
    },
    itemMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    sourcePill: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: 'rgba(107, 138, 253, 0.22)',
        borderWidth: 1,
        borderColor: 'rgba(107, 138, 253, 0.35)',
    },
    sourcePillText: {
        color: '#C9D4FF',
        fontSize: 11,
        fontFamily: 'Roboto-Bold',
        textTransform: 'uppercase',
    },
    title: {
        color: '#FFFFFF',
        fontSize: 18,
        fontFamily: 'Roboto-Bold',
        marginBottom: 5,
    },
    itemHint: {
        color: '#A9B0C5',
        fontSize: 13,
        fontFamily: 'Roboto-Regular',
    },
    eroticBadge: {
        backgroundColor: 'rgba(255, 107, 107, 0.9)',
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        alignSelf: 'flex-start',
    },
    eroticBadgeText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontFamily: 'Roboto-Bold',
    },
    removeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#FF6B6B',
        paddingVertical: 12,
    },
    removeButtonDisabled: {
        opacity: 0.7,
    },
    removeButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: 'Roboto-Bold',
    },
});