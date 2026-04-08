import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Platform,
    ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePersonalization } from '../contexts/PersonalizationContext';
import { formatNotificationDate, getNotificationDateValue } from '../utils/notificationUtils';

type NewsItem = {
    id: string;
    title: string;
    message: string;
    date?: any;
    createdAt?: any;
    isNew?: boolean;
};

const NewsDetailScreen = () => {
    const { theme } = usePersonalization();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();

    const newsItem: NewsItem | undefined = route?.params?.newsItem;

    return (
        <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.container}>
            <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}> 
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Detalle</Text>
                    <View style={{ width: 34 }} />
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.title}>{newsItem?.title || 'Sin título'}</Text>
                    <Text style={styles.date}>{formatNotificationDate(getNotificationDateValue(newsItem))}</Text>
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
