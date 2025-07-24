import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Image,
    SafeAreaView,
    Alert,
    AccessibilityInfo,
    StatusBar,
    Platform,
    Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/config';
import { collection, onSnapshot } from 'firebase/firestore';

type FavoriteItem = {
    id: string;
    comicTitle: string;
    coverUrl: string;
    slug: string;
    content_rating?: string; // Added optional field for content rating
};

const windowWidth = Dimensions.get('window').width;
const itemWidth = windowWidth * 0.9; // Wider items for better display

export default function FavoritesScreen() {
    const navigation = useNavigation<any>();
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);
    const insets = useSafeAreaInsets();

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            setCurrentUserUid(user ? user.uid : null);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!currentUserUid) {
            setFavorites([]);
            setLoading(false);
            return;
        }

        const favoritesCollectionRef = collection(db, 'users', currentUserUid, 'favorites');
        const unsubscribe = onSnapshot(
            favoritesCollectionRef,
            (querySnapshot) => {
                const favs: FavoriteItem[] = [];
                querySnapshot.forEach((document) => {
                    favs.push({
                        id: document.id,
                        comicTitle: document.data().comicTitle,
                        coverUrl: document.data().coverUrl,
                        slug: document.data().slug,
                        content_rating: document.data().content_rating,
                    });
                });
                setFavorites(favs);
                setLoading(false);
            },
            (error) => {
                console.error("Error fetching favorites: ", error);
                Alert.alert("Error", "No se pudieron cargar los favoritos.");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [currentUserUid]);

    const handleFavoritePress = (slug: string) => {
        navigation.navigate('Details', { slug });
    };

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
            <LinearGradient colors={['#0F0F1A', '#252536']} style={styles.emptyStateContainer}>
                <Ionicons name="person-circle-outline" size={80} color="#B0BEC5" />
                <Text style={styles.emptyStateText}>Inicia sesión para guardar y ver tus favoritos</Text>
                <TouchableOpacity
                    style={styles.loginButton}
                    onPress={() => navigation.navigate('Auth')}
                    accessible
                    accessibilityLabel="Ir a la pantalla de inicio de sesión"
                >
                    <Text style={styles.loginButtonText}>Iniciar Sesión</Text>
                </TouchableOpacity>
            </LinearGradient>
        );
    }

    if (favorites.length === 0) {
        return (
            <LinearGradient colors={['#0F0F1A', '#252536']} style={styles.container}>
                <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
                <SafeAreaView style={[styles.safeArea, { paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : insets.top }]}>
                    <View style={styles.topBar}>
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            style={styles.backButton}
                            accessible
                            accessibilityLabel="Volver atrás"
                        >
                            <Ionicons name="arrow-back" size={28} color="#FF6B6B" />
                        </TouchableOpacity>
                        <Text style={styles.topBarTitle}>Mis Favoritos</Text>
                    </View>
                    <View style={styles.emptyContent}>
                        <Ionicons name="heart-dislike-outline" size={80} color="#B0BEC5" />
                        <Text style={styles.emptyStateText}>Aún no tienes cómics favoritos</Text>
                        <Text style={styles.emptyStateSubText}>Guarda tus cómics favoritos para encontrarlos fácilmente</Text>
                        <TouchableOpacity
                            style={styles.browseButton}
                            onPress={() => navigation.navigate('Library')}
                            accessible
                            accessibilityLabel="Explorar cómics"
                        >
                            <Text style={styles.browseButtonText}>Explorar Cómics</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={['#0F0F1A', '#252536']} style={styles.container}>
            <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
            <SafeAreaView style={[styles.safeArea, { paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : insets.top }]}>
                <View style={styles.topBar}>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={styles.backButton}
                        accessible
                        accessibilityLabel="Volver atrás"
                    >
                        <Ionicons name="arrow-back" size={28} color="#FF6B6B" />
                    </TouchableOpacity>
                    <Text style={styles.topBarTitle}>Mis Favoritos</Text>
                </View>

                <FlatList
                    data={favorites}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.item}
                            onPress={() => handleFavoritePress(item.slug)}
                            activeOpacity={0.7}
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
                                <Text style={styles.title} numberOfLines={2}>{item.comicTitle}</Text>
                                {item.content_rating === 'erotica' && (
                                    <View style={styles.eroticBadge}>
                                        <Text style={styles.eroticBadgeText}>18+</Text>
                                    </View>
                                )}
                            </View>
                            <Ionicons name="chevron-forward" size={24} color="#FF6B6B" />
                        </TouchableOpacity>
                    )}
                    contentContainerStyle={styles.flatListContent}
                    showsVerticalScrollIndicator={false}
                />
            </SafeAreaView>
        </LinearGradient>
    );
}

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
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        marginBottom: 15,
        overflow: 'hidden',
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
    title: {
        color: '#FFFFFF',
        fontSize: 18,
        fontFamily: 'Roboto-Bold',
        marginBottom: 5,
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
});