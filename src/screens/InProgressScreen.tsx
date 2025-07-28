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
    AccessibilityInfo, // Keep for potential future use if needed, though not directly used for delete
    StatusBar,
    Platform,
    Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/config';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore'; // Import doc and deleteDoc

// Define the type for an in-progress item
type InProgressItem = {
    id: string; // This will be the mangaHid
    mangaTitle: string;
    coverUrl: string; // Assuming you'll store coverUrl in inProgressManga
    slug: string; // Assuming you'll store slug in inProgressManga
    lastReadChapterHid?: string;
    lastReadChapterNumber?: string;
    startedAt?: string; // Stored as a timestamp, but fetched as string for display
};

const windowWidth = Dimensions.get('window').width;
const itemWidth = windowWidth * 0.9; // Wider items for better display

export default function InProgressScreen() {
    const navigation = useNavigation<any>();
    const [inProgressComics, setInProgressComics] = useState<InProgressItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);
    const insets = useSafeAreaInsets();

    // Effect to listen for authentication state changes
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            setCurrentUserUid(user ? user.uid : null);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    // Effect to fetch in-progress comics when currentUserUid changes
    useEffect(() => {
        if (!currentUserUid) {
            setInProgressComics([]);
            setLoading(false);
            return;
        }

        const inProgressCollectionRef = collection(db, 'users', currentUserUid, 'inProgressManga');
        // Order by 'startedAt' or 'lastReadChapter.readAt' for meaningful order
        const q = query(inProgressCollectionRef, orderBy('startedAt', 'desc')); // Or 'lastReadChapter.readAt'

        const unsubscribe = onSnapshot(
            q,
            (querySnapshot) => {
                const inProgress: InProgressItem[] = [];
                querySnapshot.forEach((document) => {
                    const data = document.data();
                    inProgress.push({
                        id: document.id, // The document ID is the mangaHid
                        mangaTitle: data.mangaTitle,
                        coverUrl: data.coverUrl, // Ensure you save this when adding to inProgressManga
                        slug: data.slug,    // Ensure you save this when adding to inProgressManga
                        lastReadChapterHid: data.lastReadChapterHid,
                        lastReadChapterNumber: data.lastReadChapterNumber,
                        startedAt: data.startedAt?.toDate().toLocaleString(), // Convert Firestore Timestamp to readable string
                    });
                });
                setInProgressComics(inProgress);
                setLoading(false);
            },
            (error) => {
                console.error("Error fetching in-progress comics: ", error);
                Alert.alert("Error", "No se pudieron cargar los cómics en curso.");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [currentUserUid]);

    // Handle press on an in-progress comic item
    const handleInProgressPress = (slug: string) => {
        navigation.navigate('Details', { slug });
    };

    // --- New function to handle deletion ---
    const handleDeleteComic = (mangaId: string, mangaTitle: string) => {
        if (!currentUserUid) {
            Alert.alert("Error", "No se pudo eliminar el cómic. No hay usuario autenticado.");
            return;
        }

        Alert.alert(
            "Confirmar Eliminación",
            `¿Estás seguro de que quieres eliminar "${mangaTitle}" de tus cómics en curso?`,
            [
                {
                    text: "Cancelar",
                    style: "cancel"
                },
                {
                    text: "Eliminar",
                    onPress: async () => {
                        try {
                            const comicRef = doc(db, 'users', currentUserUid, 'inProgressManga', mangaId);
                            await deleteDoc(comicRef);
                            Alert.alert("Éxito", `'${mangaTitle}' ha sido eliminado.`);
                        } catch (error) {
                            console.error("Error deleting comic: ", error);
                            Alert.alert("Error", `No se pudo eliminar '${mangaTitle}'.`);
                        }
                    },
                    style: "destructive"
                }
            ],
            { cancelable: true }
        );
    };

    // --- Loading State ---
    if (loading) {
        return (
            <LinearGradient colors={['#0F0F1A', '#252536']} style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#6B8AFD" />
                <Text style={styles.loadingText}>Cargando cómics en curso...</Text>
            </LinearGradient>
        );
    }

    // --- Not Logged In State ---
    if (!currentUserUid) {
        return (
            <LinearGradient colors={['#0F0F1A', '#252536']} style={styles.emptyStateContainer}>
                <Ionicons name="person-circle-outline" size={80} color="#B0BEC5" />
                <Text style={styles.emptyStateText}>Inicia sesión para ver tus cómics en curso</Text>
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

    // --- No In-Progress Comics State ---
    if (inProgressComics.length === 0) {
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
                            <Ionicons name="arrow-back" size={28} color="#6B8AFD" />
                        </TouchableOpacity>
                        <Text style={styles.topBarTitle}>En Curso</Text>
                    </View>
                    <View style={styles.emptyContent}>
                        <Ionicons name="book-outline" size={80} color="#B0BEC5" />
                        <Text style={styles.emptyStateText}>No tienes cómics en curso</Text>
                        <Text style={styles.emptyStateSubText}>Empieza a leer un cómic y lo verás aquí</Text>
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

    // --- Display In-Progress Comics ---
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
                        <Ionicons name="arrow-back" size={28} color="#6B8AFD" />
                    </TouchableOpacity>
                    <Text style={styles.topBarTitle}>En Curso</Text>
                </View>

                <FlatList
                    data={inProgressComics}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.item}
                            onPress={() => handleInProgressPress(item.slug)}
                            activeOpacity={0.7}
                            accessible
                            accessibilityLabel={`Continuar leyendo ${item.mangaTitle}`}
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
                                <Text style={styles.title} numberOfLines={2}>{item.mangaTitle}</Text>
                                {item.lastReadChapterNumber && (
                                    <Text style={styles.lastReadText}>
                                        Último leído: Capítulo {item.lastReadChapterNumber}
                                    </Text>
                                )}
                                {item.startedAt && (
                                    <Text style={styles.startedAtText}>
                                        Iniciado el: {item.startedAt}
                                    </Text>
                                )}
                            </View>
                            {/* New Delete Button */}
                            <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={() => handleDeleteComic(item.id, item.mangaTitle)}
                                accessible
                                accessibilityLabel={`Eliminar ${item.mangaTitle} de cómics en curso`}
                            >
                                <Ionicons name="trash-outline" size={24} color="#FF6B6B" />
                            </TouchableOpacity>
                            <Ionicons name="chevron-forward" size={24} color="#6B8AFD" style={styles.forwardIcon} />
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
        color: '#6B8AFD', // Changed color to match new theme
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
        backgroundColor: '#6B8AFD', // Changed color
        paddingVertical: 14,
        paddingHorizontal: 40,
        borderRadius: 25,
        shadowColor: '#6B8AFD', // Changed color
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
        backgroundColor: '#FF6B6B', // Changed color
        paddingVertical: 14,
        paddingHorizontal: 40,
        borderRadius: 25,
        shadowColor: '#FF6B6B', // Changed color
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
    lastReadText: {
        color: '#B0B0B0',
        fontSize: 14,
        fontFamily: 'Roboto-Regular',
        marginTop: 2,
    },
    startedAtText: {
        color: '#B0B0B0',
        fontSize: 12,
        fontFamily: 'Roboto-Regular',
        marginTop: 4,
    },
    // New styles for the delete button and to adjust the forward icon
    deleteButton: {
        padding: 10,
        marginRight: 5,
    },
    forwardIcon: {
        paddingRight: 15, // Adjust spacing for the forward arrow
    }
});