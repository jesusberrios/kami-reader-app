import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Image,
    StatusBar,
    Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/config';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { useAlertContext } from '../contexts/AlertContext';
import { usePersonalization } from '../contexts/PersonalizationContext';
import { getProviderAliasLabel } from '../utils/providerBranding';

// Define the type for an in-progress item
type InProgressItem = {
    id: string;
    mangaTitle: string;
    coverUrl: string;
    slug: string;
    source?: string;
    lastReadChapterHid?: string;
    lastReadChapterNumber?: string;
    lastReadImagePage?: number;
    startedAt?: string;
    activityText?: string;
    sortTimestamp?: number;
};

const formatRelativeDate = (date?: Date | null) => {
    if (!date) return 'Actualizado recientemente';
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

    if (diffMinutes < 60) return `Hace ${diffMinutes} min`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `Hace ${diffDays} d`;

    return date.toLocaleDateString();
};

export default function InProgressScreen() {
    const { theme } = usePersonalization();
    const navigation = useNavigation<any>();
    const [inProgressComics, setInProgressComics] = useState<InProgressItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);
    const insets = useSafeAreaInsets();

    const { alertError, alertSuccess, alertConfirm } = useAlertContext();

    const handleAuthNavigation = useCallback(() => {
        auth.signOut().catch(() => {
            // ignore: auth state listener will redirect when needed
        });
    }, []);

    const summaryGradientColors = useMemo(
        () => [
            `rgba(${parseInt(theme.accent.slice(1, 3), 16)}, ${parseInt(theme.accent.slice(3, 5), 16)}, ${parseInt(theme.accent.slice(5, 7), 16)}, 0.2)`,
            `rgba(${parseInt(theme.accentStrong.slice(1, 3), 16)}, ${parseInt(theme.accentStrong.slice(3, 5), 16)}, ${parseInt(theme.accentStrong.slice(5, 7), 16)}, 0.1)`,
        ],
        [theme.accent, theme.accentStrong]
    );

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            setCurrentUserUid(user ? user.uid : null);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!currentUserUid) {
            setInProgressComics([]);
            setLoading(false);
            return;
        }

        const inProgressCollectionRef = collection(db, 'users', currentUserUid, 'inProgressManga');

        const unsubscribe = onSnapshot(
            inProgressCollectionRef,
            (querySnapshot) => {
                const inProgress: InProgressItem[] = [];
                querySnapshot.forEach((document) => {
                    const data = document.data();
                    const lastUpdatedDate = data.lastUpdated?.toDate?.() || data.startedAt?.toDate?.() || null;
                    const startedAtDate = data.startedAt?.toDate?.() || null;
                    inProgress.push({
                        id: document.id,
                        mangaTitle: data.mangaTitle,
                        coverUrl: data.coverUrl,
                        slug: data.slug,
                        source: data.source || 'zonatmo',
                        lastReadChapterHid: data.lastReadChapterHid,
                        lastReadChapterNumber: data.lastReadChapterNumber,
                        lastReadImagePage: Number.isFinite(Number(data.lastReadImagePage)) ? Number(data.lastReadImagePage) : undefined,
                        startedAt: startedAtDate ? startedAtDate.toLocaleDateString() : undefined,
                        activityText: formatRelativeDate(lastUpdatedDate),
                        sortTimestamp: lastUpdatedDate ? lastUpdatedDate.getTime() : 0,
                    });
                });
                inProgress.sort((a, b) => (b.sortTimestamp || 0) - (a.sortTimestamp || 0));
                setInProgressComics(inProgress);
                setLoading(false);
            },
            () => {
                alertError("No se pudieron cargar los cómics en curso.");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [currentUserUid, alertError]);

    const handleInProgressPress = useCallback((item: InProgressItem) => {
        if (item.lastReadChapterHid) {
            navigation.navigate('Reader', { hid: item.lastReadChapterHid, resumeFromProgress: true });
            return;
        }
        navigation.navigate('Details', { slug: item.slug });
    }, [navigation]);

    const handleDeleteComic = useCallback((mangaId: string, mangaTitle: string) => {
        if (!currentUserUid) {
            alertError("No se pudo eliminar el cómic. No hay usuario autenticado.");
            return;
        }

        setTimeout(() => {
            alertConfirm(
                `¿Estás seguro de que quieres eliminar "${mangaTitle}" de tus cómics en curso?`,
                async () => {
                    try {
                        setRemovingId(mangaId);
                        const comicRef = doc(db, 'users', currentUserUid, 'inProgressManga', mangaId);
                        await deleteDoc(comicRef);
                        alertSuccess(`'${mangaTitle}' ha sido eliminado.`);
                    } catch {
                        alertError(`No se pudo eliminar '${mangaTitle}'.`);
                    } finally {
                        setRemovingId(null);
                    }
                },
                'Confirmar Eliminación',
                'Sí, eliminar',
                'Cancelar'
            );
        }, 80);
    }, [alertConfirm, alertError, alertSuccess, currentUserUid]);

    const renderTopBar = useMemo(() => (
        <View style={styles.topBar}>
            <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.backButton}
                accessible
                accessibilityLabel="Volver atrás"
            >
                <Ionicons name="arrow-back" size={28} color={theme.accent} />
            </TouchableOpacity>
            <Text style={[styles.topBarTitle, { color: theme.text }]}>En Curso</Text>
        </View>
    ), [navigation, theme.accent, theme.text]);

    const renderSummaryHeader = useMemo(() => {
        if (inProgressComics.length === 0) return null;

        return (
            <LinearGradient colors={summaryGradientColors as [string, string]} style={[styles.summaryCard, { borderColor: theme.border }]}>
                <View style={[styles.summaryIconWrap, { backgroundColor: theme.accentSoft }] }>
                    <Ionicons name="time-outline" size={22} color={theme.text} />
                </View>
                <View style={styles.summaryTextWrap}>
                    <Text style={[styles.summaryTitle, { color: theme.text }]}>Sigue donde te quedaste</Text>
                    <Text style={[styles.summarySubtitle, { color: theme.textMuted }]}>
                        {inProgressComics.length} {inProgressComics.length === 1 ? 'serie activa' : 'series activas'} en tu historial reciente.
                    </Text>
                </View>
            </LinearGradient>
        );
    }, [inProgressComics.length, summaryGradientColors, theme.accentSoft, theme.border, theme.text, theme.textMuted]);

    const renderInProgressItem = useCallback(({ item }: { item: InProgressItem }) => (
        <View style={[styles.item, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TouchableOpacity
                style={styles.itemMainPressable}
                onPress={() => handleInProgressPress(item)}
                activeOpacity={0.82}
                accessible
                accessibilityLabel={`Continuar leyendo ${item.mangaTitle}`}
            >
                {item.coverUrl && (
                    <Image
                        source={{ uri: item.coverUrl }}
                        style={styles.coverImage}
                        resizeMode="cover"
                    />
                )}
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.8)']}
                    style={styles.imageGradient}
                />
                <View style={styles.itemContent}>
                    <View style={styles.itemMetaRow}>
                        <View style={[styles.sourcePill, { backgroundColor: theme.accentSoft, borderColor: theme.accent }] }>
                            <Text style={[styles.sourcePillText, { color: theme.text }]}>{getProviderAliasLabel(item.source)}</Text>
                        </View>
                        <Text style={[styles.activityText, { color: theme.textMuted }]}>{item.activityText}</Text>
                    </View>
                    <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{item.mangaTitle}</Text>
                    {item.lastReadChapterNumber ? (
                        <Text style={[styles.lastReadText, { color: theme.text }]}>
                            {`Capítulo actual: ${item.lastReadChapterNumber}${item.lastReadImagePage ? ` · Img. ${item.lastReadImagePage}` : ''}`}
                        </Text>
                    ) : (
                        <Text style={[styles.lastReadText, { color: theme.textMuted }]}>Progreso guardado sin número de capítulo</Text>
                    )}
                    {item.startedAt && (
                        <Text style={[styles.startedAtText, { color: theme.textMuted }]}>Agregado el {item.startedAt}</Text>
                    )}
                </View>
            </TouchableOpacity>

            <View style={styles.itemActionsRow}>
                <TouchableOpacity
                    style={[styles.continueButton, { backgroundColor: theme.accent }]}
                    onPress={() => handleInProgressPress(item)}
                    accessibilityLabel={`Abrir ${item.mangaTitle}`}
                >
                    <Ionicons name="play" size={16} color={theme.text} />
                    <Text style={[styles.continueButtonText, { color: theme.text }]}>Continuar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.deleteButton, { backgroundColor: theme.danger }, removingId === item.id && styles.deleteButtonDisabled]}
                    onPress={() => handleDeleteComic(item.id, item.mangaTitle)}
                    disabled={removingId === item.id}
                    accessibilityLabel={`Eliminar ${item.mangaTitle} de cómics en curso`}
                >
                    {removingId === item.id ? (
                        <ActivityIndicator size="small" color={theme.text} />
                    ) : (
                        <>
                            <Ionicons name="trash-outline" size={18} color={theme.text} />
                            <Text style={[styles.deleteButtonText, { color: theme.text }]}>Quitar</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    ), [handleDeleteComic, handleInProgressPress, removingId, theme.accent, theme.border, theme.danger, theme.surface, theme.text, theme.textMuted, theme.accentSoft]);

    if (loading) {
        return (
            <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.accentStrong} />
                <Text style={[styles.loadingText, { color: theme.accent }]}>Cargando cómics en curso...</Text>
            </LinearGradient>
        );
    }

    if (!currentUserUid) {
        return (
            <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.emptyStateContainer}>
                <Ionicons name="person-circle-outline" size={80} color={theme.textMuted} />
                <Text style={[styles.emptyStateText, { color: theme.text }]}>Inicia sesión para ver tus cómics en curso</Text>
                <TouchableOpacity
                    style={[styles.loginButton, { backgroundColor: theme.accent, shadowColor: theme.accent }]}
                    onPress={handleAuthNavigation}
                    accessible
                    accessibilityLabel="Ir a la pantalla de inicio de sesión"
                >
                    <Text style={[styles.loginButtonText, { color: theme.text }]}>Iniciar Sesión</Text>
                </TouchableOpacity>
            </LinearGradient>
        );
    }

    if (inProgressComics.length === 0) {
        return (
            <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.container}>
                <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
                <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
                    {renderTopBar}
                    <View style={styles.emptyContent}>
                        <Ionicons name="book-outline" size={80} color={theme.textMuted} />
                        <Text style={[styles.emptyStateText, { color: theme.text }]}>No tienes cómics en curso</Text>
                        <Text style={[styles.emptyStateSubText, { color: theme.textMuted }]}>Empieza a leer un cómic y lo verás aquí</Text>
                        <TouchableOpacity
                            style={[styles.browseButton, { backgroundColor: theme.accentStrong, shadowColor: theme.accentStrong }]}
                            onPress={() => navigation.navigate('Library')}
                            accessible
                            accessibilityLabel="Explorar cómics"
                        >
                            <Text style={[styles.browseButtonText, { color: theme.text }]}>Explorar Cómics</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.container}>
            <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
            <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
                {renderTopBar}

                <FlatList
                    data={inProgressComics}
                    keyExtractor={(item) => item.id}
                    renderItem={renderInProgressItem}
                    ListHeaderComponent={renderSummaryHeader}
                    contentContainerStyle={styles.flatListContent}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={6}
                    maxToRenderPerBatch={6}
                    updateCellsBatchingPeriod={40}
                    windowSize={7}
                    removeClippedSubviews={Platform.OS === 'android'}
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
        color: '#6B8AFD',
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
    loginButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontFamily: 'Roboto-Bold',
    },
    browseButton: {
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
        borderColor: 'rgba(255,255,255,0.06)',
    },
    summaryIconWrap: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(107,138,253,0.22)',
        alignItems: 'center',
        justifyContent: 'center',
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
    itemMainPressable: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        minHeight: 120,
        paddingLeft: 12,
        paddingRight: 12,
        paddingVertical: 10,
        position: 'relative',
    },
    coverImage: {
        width: 80,
        height: 104,
        backgroundColor: '#333',
        borderRadius: 12,
        marginRight: 10,
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
        paddingRight: 4,
        paddingTop: 8,
        justifyContent: 'flex-start',
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
        backgroundColor: 'rgba(107,138,253,0.22)',
        borderWidth: 1,
        borderColor: 'rgba(107,138,253,0.35)',
    },
    sourcePillText: {
        color: '#C9D4FF',
        fontSize: 11,
        fontFamily: 'Roboto-Bold',
        textTransform: 'uppercase',
    },
    activityText: {
        color: '#A9B0C5',
        fontSize: 12,
        fontFamily: 'Roboto-Medium',
    },
    title: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: 'Roboto-Bold',
        marginBottom: 4,
        lineHeight: 22,
    },
    lastReadText: {
        color: '#D7DAE5',
        fontSize: 14,
        fontFamily: 'Roboto-Medium',
        marginTop: 2,
    },
    startedAtText: {
        color: '#B0B0B0',
        fontSize: 12,
        fontFamily: 'Roboto-Regular',
        marginTop: 4,
    },
    itemActionsRow: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 12,
    },
    continueButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#6B8AFD',
        paddingVertical: 11,
        borderRadius: 12,
    },
    continueButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: 'Roboto-Bold',
    },
    deleteButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#FF6B6B',
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderRadius: 12,
    },
    deleteButtonDisabled: {
        opacity: 0.7,
    },
    deleteButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: 'Roboto-Bold',
    },
});