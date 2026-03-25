import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    StatusBar,
    Platform,
    ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type NewsItem = {
    id: string;
    title: string;
    message: string;
    createdAt?: any;
};

const toMillis = (value: any) => {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (value?.seconds) return Number(value.seconds) * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value: any) => {
    const ms = toMillis(value);
    if (!ms) return 'Sin fecha';
    const date = new Date(ms);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const NewsDetailScreen = () => {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();

    const newsItem: NewsItem | undefined = route?.params?.newsItem;

    return (
        <LinearGradient colors={['#0F0F1A', '#252536']} style={styles.container}>
            <SafeAreaView style={[styles.safeArea, { paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top }]}> 
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Detalle</Text>
                    <View style={{ width: 34 }} />
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.title}>{newsItem?.title || 'Sin título'}</Text>
                    <Text style={styles.date}>{formatDate(newsItem?.createdAt)}</Text>
                    <View style={styles.bodyCard}>
                        <Text style={styles.bodyText}>{String(newsItem?.message || '').replace(/<[^>]*>/g, '')}</Text>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    headerRow: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: { padding: 5 },
    headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '700' },
    scrollContent: { padding: 16, paddingBottom: 30 },
    title: { color: '#FFF', fontSize: 24, fontWeight: '700' },
    date: { color: '#FFB3B3', fontSize: 12, marginTop: 8, marginBottom: 14 },
    bodyCard: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    bodyText: { color: '#E0E0E0', fontSize: 15, lineHeight: 23 },
});

export default NewsDetailScreen;
