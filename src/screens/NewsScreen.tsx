import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    FlatList,
    RefreshControl,
    SafeAreaView,
    StatusBar,
    Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePersonalization } from '../contexts/PersonalizationContext';
import {
    formatNotificationDate,
    getNotificationDateValue,
    isNotificationOld,
    normalizeNotification,
    sortNotificationsByDateDesc,
} from '../utils/notificationUtils';

type NewsItem = {
    id: string;
    title: string;
    message: string;
    date?: any;
    createdAt?: any;
    isNew?: boolean;
};

const NewsScreen = () => {
    const { theme } = usePersonalization();
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [mode, setMode] = useState<'recent' | 'old'>('recent');

    const loadNews = useCallback(async () => {
        try {
            const snapshot = await getDocs(collection(db, 'notifications'));
            const list: NewsItem[] = sortNotificationsByDateDesc(snapshot.docs.map((d) => normalizeNotification({
                id: d.id,
                ...(d.data() as Omit<NewsItem, 'id'>),
            })));
            setNews(list);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadNews();
    }, [loadNews]);

    const sortedNews = useMemo(() => {
        return sortNotificationsByDateDesc(news).filter((item) => {
            return mode === 'recent' ? !isNotificationOld(item) : isNotificationOld(item);
        });
    }, [news, mode]);

    if (loading) {
        return (
            <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text style={styles.loadingText}>Cargando noticias...</Text>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.container}>
            <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}> 
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Noticias</Text>
                    <View style={{ width: 34 }} />
                </View>

                <View style={styles.modeRow}>
                    <TouchableOpacity
                        style={[styles.modeButton, mode === 'recent' && styles.modeButtonActive]}
                        onPress={() => setMode('recent')}
                    >
                        <Text style={[styles.modeText, mode === 'recent' && styles.modeTextActive]}>Recientes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.modeButton, mode === 'old' && styles.modeButtonActive]}
                        onPress={() => setMode('old')}
                    >
                        <Text style={[styles.modeText, mode === 'old' && styles.modeTextActive]}>Antiguas</Text>
                    </TouchableOpacity>
                </View>

                <FlatList
                    data={sortedNews}
                    keyExtractor={(item) => item.id}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadNews(); }} tintColor={theme.accent} />}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={<Text style={styles.emptyText}>{mode === 'recent' ? 'No hay noticias nuevas.' : 'No hay noticias antiguas.'}</Text>}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.card}
                            onPress={() => navigation.navigate('NewsDetail', { newsItem: item })}
                        >
                            <Text style={styles.cardTitle} numberOfLines={2}>{item.title || 'Sin título'}</Text>
                            <Text style={styles.cardDate}>{formatNotificationDate(getNotificationDateValue(item))}</Text>
                            <Text style={styles.cardBody} numberOfLines={3}>{String(item.message || '').replace(/<[^>]*>/g, '')}</Text>
                        </TouchableOpacity>
                    )}
                />
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 10, color: '#FF6B6B', fontSize: 16 },
    headerRow: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: { padding: 5 },
    headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '700' },
    modeRow: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        marginTop: 8,
        marginBottom: 8,
    },
    modeButton: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    modeButtonActive: {
        backgroundColor: 'rgba(255,107,107,0.2)',
        borderColor: '#FF6B6B',
    },
    modeText: { color: '#C5C5D6', fontWeight: '600' },
    modeTextActive: { color: '#FFF' },
    listContent: { padding: 16, paddingBottom: 28, gap: 12 },
    card: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    cardTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    cardDate: { color: '#FFB3B3', fontSize: 12, marginTop: 4, marginBottom: 8 },
    cardBody: { color: '#E0E0E0', fontSize: 14, lineHeight: 20 },
    emptyText: { color: '#B9B9CF', textAlign: 'center', marginTop: 24 },
});

export default NewsScreen;
