import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { arrayUnion, doc, getDoc, increment, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { useAlertContext } from '../contexts/AlertContext';
import { AppThemeKey, usePersonalization } from '../contexts/PersonalizationContext';
import { canPurchaseStoreItem, getActiveStoreItems, getEffectivePrice } from '../config/liveEvents';

const ACHIEVEMENT_LABELS: Record<string, string> = {
    'easter-patron': 'Patron de Pascua',
    'halloween-sombra': 'Sombra de Halloween',
    'navidad-guardian': 'Guardian de Navidad',
    'valentin-corazon': 'Corazon de Valentin',
};

const formatMinutes = (ms?: number) => Math.max(0, Math.floor(Number(ms || 0) / (1000 * 60)));

type StoreState = {
    coins: number;
    totalReadingTime: number;
    achievementsUnlocked: string[];
    purchasedItems: string[];
};

export default function EventStoreScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { alertError, alertSuccess } = useAlertContext();
    const { theme, updateSettings } = usePersonalization();

    const [state, setState] = useState<StoreState>({
        coins: 0,
        totalReadingTime: 0,
        achievementsUnlocked: [],
        purchasedItems: [],
    });

    const loadState = useCallback(async () => {
        const user = auth.currentUser;
        if (!user) return;

        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!snap.exists()) return;

        const data = snap.data() || {};
        setState({
            coins: Number(data.coins || 0),
            totalReadingTime: Number(data.totalReadingTime || 0),
            achievementsUnlocked: Array.isArray(data.achievementsUnlocked) ? data.achievementsUnlocked : [],
            purchasedItems: Array.isArray(data.purchasedItems) ? data.purchasedItems : [],
        });
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadState().catch(() => {
                // silently ignored
            });
        }, [loadState])
    );

    const handleBuy = async (itemId: string) => {
        const user = auth.currentUser;
        if (!user) {
            alertError('Debes iniciar sesion para comprar.');
            return;
        }

        // Refresh before validating to avoid stale state issues.
        const freshSnap = await getDoc(doc(db, 'users', user.uid));
        if (!freshSnap.exists()) {
            alertError('No se encontro tu perfil.');
            return;
        }

        const freshData = freshSnap.data() || {};
        const freshProgress = {
            coins: Number(freshData.coins || 0),
            totalReadingTime: Number(freshData.totalReadingTime || 0),
            achievementsUnlocked: Array.isArray(freshData.achievementsUnlocked) ? freshData.achievementsUnlocked : [],
            purchasedItems: Array.isArray(freshData.purchasedItems) ? freshData.purchasedItems : [],
        };

        const item = getActiveStoreItems().find((it) => it.id === itemId);
        if (!item) {
            alertError('Este item no esta disponible ahora.');
            return;
        }

        const derivedAchievements = [...freshProgress.achievementsUnlocked];
        if (item.requirements?.achievementId) {
            const hasAchievement = derivedAchievements.includes(item.requirements.achievementId);
            const meetsReadingGate = !item.requirements.minReadingTimeMs || freshProgress.totalReadingTime >= item.requirements.minReadingTimeMs;
            const meetsCoinGate = freshProgress.coins >= getEffectivePrice(item.id);

            if (!hasAchievement && meetsReadingGate && meetsCoinGate) {
                derivedAchievements.push(item.requirements.achievementId);
            }
        }

        const normalizedProgress = {
            ...freshProgress,
            achievementsUnlocked: derivedAchievements,
        };

        const canBuy = canPurchaseStoreItem(normalizedProgress, item);
        if (!canBuy.ok) {
            alertError(canBuy.reason || 'No se pudo realizar la compra.');
            return;
        }

        try {
            await updateDoc(doc(db, 'users', user.uid), {
                coins: increment(-getEffectivePrice(item.id)),
                purchasedItems: arrayUnion(item.id),
                ...(item.requirements?.achievementId ? { achievementsUnlocked: arrayUnion(item.requirements.achievementId) } : {}),
                ...(item.type === 'theme' && item.themeKey ? { unlockedThemes: arrayUnion(item.themeKey) } : {}),
            });

            if (item.type === 'theme' && item.themeKey) {
                await updateSettings({ appTheme: item.themeKey as AppThemeKey });
            }

            await loadState();
            alertSuccess(`${item.name} comprado con exito.`);
        } catch {
            alertError('No se pudo completar la compra.');
        }
    };

    const activeItems = getActiveStoreItems();

    return (
        <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.container}>
            <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}> 
                <View style={styles.header}>
                    <TouchableOpacity
                        style={[styles.backButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
                        onPress={() => navigation.goBack()}
                        activeOpacity={0.85}
                    >
                        <Ionicons name="arrow-back" size={22} color={theme.text} />
                    </TouchableOpacity>
                    <View style={styles.headerTextWrap}>
                        <Text style={[styles.title, { color: theme.text }]}>Tienda de Evento</Text>
                        <Text style={[styles.subtitle, { color: theme.textMuted }]}>Compra temas y extras con tus monedas</Text>
                    </View>
                </View>

                <View style={[styles.walletCard, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                    <Text style={[styles.walletLine, { color: theme.text }]}>Monedas: {state.coins}</Text>
                    <Text style={[styles.walletLine, { color: theme.textMuted }]}>Lectura total: {Math.floor(state.totalReadingTime / (1000 * 60))} min</Text>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {activeItems.length === 0 ? (
                        <View style={[styles.emptyCard, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                            <MaterialCommunityIcons name="calendar-remove" size={24} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No hay items activos en este evento.</Text>
                        </View>
                    ) : (
                        activeItems.map((item) => {
                            const alreadyOwned = state.purchasedItems.includes(item.id);
                            const canBuy = canPurchaseStoreItem(state, item).ok;

                            return (
                                <View key={item.id} style={[styles.itemCard, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                                    <View style={styles.itemHeader}>
                                        <Text style={[styles.itemTitle, { color: theme.text }]}>{item.name}</Text>
                                        <Text style={[styles.itemPrice, { color: theme.warning }]}>{getEffectivePrice(item.id)} monedas</Text>
                                    </View>
                                    <Text style={[styles.itemDescription, { color: theme.textMuted }]}>{item.description}</Text>
                                    {!!item.requirements && (
                                        <View style={styles.requirementsWrap}>
                                            {!!item.requirements.achievementId && (
                                                <Text style={[styles.requirementText, { color: theme.textMuted }]}>Logro requerido: {ACHIEVEMENT_LABELS[item.requirements.achievementId] || item.requirements.achievementId}</Text>
                                            )}
                                            {!!item.requirements.minReadingTimeMs && (
                                                <Text style={[styles.requirementText, { color: theme.textMuted }]}>Lectura requerida: {formatMinutes(item.requirements.minReadingTimeMs)} min</Text>
                                            )}
                                        </View>
                                    )}
                                    <TouchableOpacity
                                        style={[
                                            styles.buyButton,
                                            {
                                                backgroundColor: alreadyOwned ? theme.surfaceMuted : (canBuy ? theme.accent : theme.surfaceMuted),
                                                borderColor: theme.border,
                                            },
                                        ]}
                                        onPress={() => handleBuy(item.id)}
                                        activeOpacity={0.85}
                                    >
                                        <Text style={[styles.buyButtonText, { color: alreadyOwned ? theme.textMuted : theme.text }]}>
                                            {alreadyOwned ? 'Comprado' : 'Comprar'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })
                    )}
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingBottom: 10,
    },
    backButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    headerTextWrap: { flex: 1 },
    title: {
        fontSize: 24,
        fontFamily: 'Roboto-Bold',
    },
    subtitle: {
        marginTop: 4,
        fontSize: 13,
        fontFamily: 'Roboto-Regular',
    },
    walletCard: {
        marginHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
    },
    walletLine: {
        fontSize: 13,
        fontFamily: 'Roboto-Medium',
        marginBottom: 4,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    emptyCard: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        gap: 8,
    },
    emptyText: {
        fontSize: 12,
        fontFamily: 'Roboto-Regular',
    },
    itemCard: {
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
        marginBottom: 12,
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    itemTitle: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Roboto-Bold',
    },
    itemPrice: {
        fontSize: 12,
        fontFamily: 'Roboto-Bold',
        textTransform: 'uppercase',
    },
    itemDescription: {
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'Roboto-Regular',
    },
    requirementsWrap: {
        marginTop: 8,
        padding: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        gap: 4,
    },
    requirementText: {
        fontSize: 11,
        fontFamily: 'Roboto-Medium',
    },
    buyButton: {
        marginTop: 10,
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
    },
    buyButtonText: {
        fontSize: 12,
        fontFamily: 'Roboto-Bold',
        textTransform: 'uppercase',
    },
});
