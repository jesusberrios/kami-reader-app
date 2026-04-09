import React, { useCallback, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { AppThemeKey, usePersonalization } from '../contexts/PersonalizationContext';
import { useAlertContext } from '../contexts/AlertContext';
import { auth, db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { getThemeStoreItem, getAnyEventActive, isEventActive, getCompanionStoreItems, EASTER_EVENT_ID, HALLOWEEN_EVENT_ID, XMAS_EVENT_ID, VALENTINES_EVENT_ID, EASTER_ACHIEVEMENT_ID, HALLOWEEN_ACHIEVEMENT_ID, XMAS_ACHIEVEMENT_ID, VALENTINES_ACHIEVEMENT_ID } from '../config/liveEvents';
import { EVENT_THEME_OPTIONS } from '../config/eventCatalog';

const themeOptions: Array<{ key: AppThemeKey; title: string; subtitle: string; preview: [string, string]; eventId?: string }> = [
    { key: 'classic', title: 'Clásico', subtitle: 'Rojo Kami tradicional', preview: ['#FF8A65', '#FF5252'] },
    { key: 'midnight-plum', title: 'Oscuro con morado', subtitle: 'Contraste ciruela', preview: ['#C084FC', '#7C3AED'] },
    { key: 'emerald-night', title: 'Oscuro con verde', subtitle: 'Tono esmeralda profundo', preview: ['#49C795', '#1F9D68'] },
    ...EVENT_THEME_OPTIONS as Array<{ key: AppThemeKey; title: string; subtitle: string; preview: [string, string]; eventId?: string }>,
];

const EVENT_ACHIEVEMENTS = [
    EASTER_ACHIEVEMENT_ID,
    HALLOWEEN_ACHIEVEMENT_ID,
    XMAS_ACHIEVEMENT_ID,
    VALENTINES_ACHIEVEMENT_ID,
];

type ThemeUnlockStatus = {
    coins: number;
    readingTimeMs: number;
    achievementsUnlocked: string[];
    purchasedItems: string[];
};

export default function PersonalizationScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { alertSuccess, alertError } = useAlertContext();
    const { settings, theme, updateSettings, isThemeUnlocked } = usePersonalization();
    const [unlockStatus, setUnlockStatus] = useState<ThemeUnlockStatus>({
        coins: 0,
        readingTimeMs: 0,
        achievementsUnlocked: [],
        purchasedItems: [],
    });

    const refreshUnlockStatus = useCallback(async () => {
        const user = auth.currentUser;
        if (!user) return;

        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!snap.exists()) return;

        const data = snap.data() || {};
        const achievements = Array.isArray(data.achievementsUnlocked) ? data.achievementsUnlocked : [];
        const purchasedItems = Array.isArray(data.purchasedItems) ? data.purchasedItems : [];

        setUnlockStatus({
            coins: Number(data.coins || 0),
            readingTimeMs: Number(data.totalReadingTime || 0),
            achievementsUnlocked: achievements,
            purchasedItems,
        });
    }, []);

    const navigateToEventStore = useCallback(() => {
        const nav: any = navigation;
        const target = 'EventStore';

        const ownRouteNames = nav?.getState?.()?.routeNames;
        if (Array.isArray(ownRouteNames) && ownRouteNames.includes(target)) {
            nav.navigate(target);
            return;
        }

        let parent = nav?.getParent?.();
        while (parent) {
            const routeNames = parent?.getState?.()?.routeNames;
            if (Array.isArray(routeNames) && routeNames.includes(target)) {
                parent.navigate(target);
                return;
            }
            parent = parent?.getParent?.();
        }
    }, [navigation]);

    useFocusEffect(
        useCallback(() => {
            refreshUnlockStatus().catch(() => {
                // silently ignored
            });
        }, [refreshUnlockStatus])
    );

    const handleThemeChange = async (themeKey: AppThemeKey) => {
        try {
            await updateSettings({ appTheme: themeKey });
            alertSuccess('Tema actualizado');
        } catch {
            alertError('No se pudo actualizar el tema');
        }
    };

    const handleReadingMode = async (mode: 'horizontal' | 'vertical') => {
        try {
            await updateSettings({ chapterChangeMode: mode });
            alertSuccess('Dirección de lectura actualizada');
        } catch {
            alertError('No se pudo actualizar la dirección de lectura');
        }
    };

    const handleToggle = async (key: 'reduceMotion' | 'compactCards', value: boolean) => {
        try {
            await updateSettings({ [key]: value });
        } catch {
            alertError('No se pudo guardar la preferencia');
        }
    };

    return (
        <LinearGradient colors={[theme.background, theme.backgroundSecondary]} style={styles.container}>
            <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <TouchableOpacity style={[styles.headerButton, { borderColor: theme.border, backgroundColor: theme.surface }]} onPress={() => navigation.goBack()} activeOpacity={0.82}>
                        <Ionicons name="arrow-back" size={22} color={theme.text} />
                    </TouchableOpacity>
                    <View style={styles.headerTextWrap}>
                        <Text style={[styles.title, { color: theme.text }]}>Personalización</Text>
                        <Text style={[styles.subtitle, { color: theme.textMuted }]}>Ajusta la apariencia y tu forma de leer</Text>
                    </View>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    <View style={[styles.sectionCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Temas</Text>
                        <ScrollView style={styles.themeListScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                            {themeOptions
                                .filter((option) => {
                                    if (!option.eventId) return true;
                                    const storeItem = getThemeStoreItem(option.key);
                                    const isPurchased = storeItem ? unlockStatus.purchasedItems.includes(storeItem.id) : false;
                                    return isPurchased || isEventActive(option.eventId);
                                })
                                .map((option) => {
                                const selected = settings.appTheme === option.key;
                                const themeStoreItem = getThemeStoreItem(option.key);
                                const locked = themeStoreItem
                                    ? !unlockStatus.purchasedItems.includes(themeStoreItem.id)
                                    : !isThemeUnlocked(option.key);

                                return (
                                    <TouchableOpacity
                                        key={option.key}
                                        style={[
                                            styles.themeOption,
                                            {
                                                backgroundColor: selected ? theme.accentSoft : theme.surface,
                                                borderColor: selected ? theme.accent : theme.border,
                                            },
                                        ]}
                                        onPress={() => {
                                            if (!locked) {
                                                handleThemeChange(option.key);
                                                return;
                                            }
                                            navigateToEventStore();
                                        }}
                                        activeOpacity={0.84}
                                    >
                                        <LinearGradient colors={option.preview} style={styles.themePreview} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                                        <View style={styles.themeTextWrap}>
                                            <Text style={[styles.themeTitle, { color: theme.text }]}>{option.title}</Text>
                                            <Text style={[styles.themeSubtitle, { color: theme.textMuted }]}>
                                                {locked
                                                    ? `${option.subtitle} · Compralo en la tienda del evento`
                                                    : option.subtitle}
                                            </Text>
                                        </View>
                                        {selected && <Ionicons name="checkmark-circle" size={22} color={theme.accent} />}
                                        {locked && <Ionicons name="lock-closed" size={18} color={theme.warning} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {getAnyEventActive() ? (
                    <View style={[styles.sectionCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Tienda de evento</Text>
                        <Text style={[styles.helpText, { color: theme.textMuted }]}>Compra temas y extras con monedas. Si compras durante el evento, se quedan permanentemente en tu cuenta.</Text>
                        {(() => {
                            const completedEventAchievements = EVENT_ACHIEVEMENTS.filter((id) =>
                                unlockStatus.achievementsUnlocked.includes(id)
                            ).length;
                            return (
                        <View style={[styles.storeQuickStats, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                            <Text style={[styles.storeQuickStat, { color: theme.text }]}>Monedas: {unlockStatus.coins}</Text>
                            <Text style={[styles.storeQuickStat, { color: theme.textMuted }]}>Lectura total: {Math.floor(unlockStatus.readingTimeMs / (1000 * 60))} min</Text>
                            <Text style={[styles.storeQuickStat, { color: completedEventAchievements > 0 ? theme.success : theme.warning }]}>Logros de evento: {completedEventAchievements}/{EVENT_ACHIEVEMENTS.length}</Text>
                        </View>
                            );
                        })()}
                        <TouchableOpacity
                            style={[styles.openStoreButton, { backgroundColor: theme.accent, borderColor: theme.border }]}
                            activeOpacity={0.85}
                            onPress={navigateToEventStore}
                        >
                            <MaterialCommunityIcons name="storefront-outline" size={18} color={theme.text} />
                            <Text style={[styles.openStoreButtonText, { color: theme.text }]}>Abrir tienda de evento</Text>
                        </TouchableOpacity>
                    </View>
                    ) : null}

                    {(() => {
                        const companionItems = getCompanionStoreItems().filter((it) =>
                            unlockStatus.purchasedItems.includes(it.id)
                        );
                        return (
                            <View style={[styles.sectionCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>Mascotas</Text>
                                <Text style={[styles.helpText, { color: theme.textMuted }]}>Elige qué mascota acompañarte durante la navegación. Toca la activa para desactivarla.</Text>
                                {companionItems.length === 0 ? (
                                    <Text style={[styles.helpText, { color: theme.textMuted, marginTop: 8 }]}>Aún no tienes mascotas. Consíguelas en la tienda de eventos.</Text>
                                ) : (
                                    companionItems.map((item) => {
                                        const isSelected = settings.selectedCompanionKey === item.companionKey;
                                        return (
                                            <TouchableOpacity
                                                key={item.id}
                                                style={[
                                                    styles.companionRow,
                                                    {
                                                        backgroundColor: isSelected ? theme.accentSoft : theme.surface,
                                                        borderColor: isSelected ? theme.accent : theme.border,
                                                    },
                                                ]}
                                                activeOpacity={0.8}
                                                onPress={() =>
                                                    updateSettings({
                                                        selectedCompanionKey: isSelected ? null : item.companionKey ?? null,
                                                    })
                                                }
                                            >
                                                <MaterialCommunityIcons
                                                    name="paw"
                                                    size={20}
                                                    color={isSelected ? theme.accent : theme.textMuted}
                                                />
                                                <Text style={[styles.companionName, { color: isSelected ? theme.text : theme.textMuted }]}>
                                                    {item.name}
                                                </Text>
                                                {isSelected && (
                                                    <Ionicons name="checkmark-circle" size={20} color={theme.accent} style={{ marginLeft: 'auto' }} />
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })
                                )}
                            </View>
                        );
                    })()}

                    <View style={[styles.sectionCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Lectura</Text>
                        <View style={styles.modeRow}>
                            <TouchableOpacity
                                style={[
                                    styles.modeOption,
                                    {
                                        backgroundColor: settings.chapterChangeMode === 'horizontal' ? theme.accentSoft : theme.surface,
                                        borderColor: settings.chapterChangeMode === 'horizontal' ? theme.accent : theme.border,
                                    },
                                ]}
                                onPress={() => handleReadingMode('horizontal')}
                            >
                                <Ionicons name="swap-horizontal" size={18} color={settings.chapterChangeMode === 'horizontal' ? theme.text : theme.textMuted} />
                                <Text style={[styles.modeLabel, { color: settings.chapterChangeMode === 'horizontal' ? theme.text : theme.textMuted }]}>Horizontal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.modeOption,
                                    {
                                        backgroundColor: settings.chapterChangeMode === 'vertical' ? theme.accentSoft : theme.surface,
                                        borderColor: settings.chapterChangeMode === 'vertical' ? theme.accent : theme.border,
                                    },
                                ]}
                                onPress={() => handleReadingMode('vertical')}
                            >
                                <Ionicons name="swap-vertical" size={18} color={settings.chapterChangeMode === 'vertical' ? theme.text : theme.textMuted} />
                                <Text style={[styles.modeLabel, { color: settings.chapterChangeMode === 'vertical' ? theme.text : theme.textMuted }]}>Vertical</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.helpText, { color: theme.textMuted }]}>Horizontal para cambiar capitulo manualmente. Vertical para avanzar al terminar.</Text>
                    </View>

                    <View style={[styles.sectionCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Opciones extra</Text>

                        <View style={styles.preferenceRow}>
                            <View style={styles.preferenceCopy}>
                                <Text style={[styles.preferenceTitle, { color: theme.text }]}>Reducir animaciones</Text>
                                <Text style={[styles.preferenceSubtitle, { color: theme.textMuted }]}>Pensado para una navegación más sobria y directa.</Text>
                            </View>
                            <Switch
                                value={settings.reduceMotion}
                                onValueChange={(value) => handleToggle('reduceMotion', value)}
                                trackColor={{ false: '#4B5563', true: theme.accent }}
                                thumbColor="#FFFFFF"
                            />
                        </View>

                        <View style={[styles.preferenceDivider, { backgroundColor: theme.border }]} />

                        <View style={styles.preferenceRow}>
                            <View style={styles.preferenceCopy}>
                                <Text style={[styles.preferenceTitle, { color: theme.text }]}>Tarjetas compactas</Text>
                                <Text style={[styles.preferenceSubtitle, { color: theme.textMuted }]}>Preparado para listas más densas en futuras vistas.</Text>
                            </View>
                            <Switch
                                value={settings.compactCards}
                                onValueChange={(value) => handleToggle('compactCards', value)}
                                trackColor={{ false: '#4B5563', true: theme.accent }}
                                thumbColor="#FFFFFF"
                            />
                        </View>
                    </View>

                    <View style={[styles.noteCard, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}> 
                        <MaterialCommunityIcons name="palette-outline" size={20} color={theme.accent} />
                        <Text style={[styles.noteText, { color: theme.textMuted }]}>El tema se refleja en la app. Reducir animaciones y tarjetas compactas ya impactan la experiencia de Biblioteca y sirven como base para extender la personalización al resto de vistas.</Text>
                    </View>
                </ScrollView>
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingBottom: 10,
    },
    headerButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    headerTextWrap: {
        flex: 1,
    },
    title: {
        fontSize: 24,
        fontFamily: 'Roboto-Bold',
    },
    subtitle: {
        marginTop: 4,
        fontSize: 13,
        fontFamily: 'Roboto-Regular',
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 24,
        gap: 14,
    },
    sectionCard: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: 'Roboto-Bold',
        marginBottom: 12,
    },
    themeListScroll: {
        maxHeight: 250,
    },
    themeOption: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
    },
    themePreview: {
        width: 44,
        height: 44,
        borderRadius: 12,
        marginRight: 12,
    },
    themeTextWrap: {
        flex: 1,
    },
    themeTitle: {
        fontSize: 15,
        fontFamily: 'Roboto-Bold',
    },
    themeSubtitle: {
        marginTop: 4,
        fontSize: 12,
        fontFamily: 'Roboto-Regular',
    },
    modeRow: {
        flexDirection: 'row',
        gap: 10,
    },
    modeOption: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 14,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    modeLabel: {
        fontSize: 13,
        fontFamily: 'Roboto-Bold',
    },
    helpText: {
        marginTop: 10,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'Roboto-Regular',
    },
    preferenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    preferenceCopy: {
        flex: 1,
    },
    preferenceTitle: {
        fontSize: 14,
        fontFamily: 'Roboto-Bold',
    },
    preferenceSubtitle: {
        marginTop: 4,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'Roboto-Regular',
    },
    preferenceDivider: {
        height: 1,
        marginVertical: 14,
    },
    noteCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
    },
    noteText: {
        flex: 1,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'Roboto-Regular',
    },
    storeQuickStats: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginTop: 4,
        marginBottom: 10,
    },
    storeQuickStat: {
        fontSize: 12,
        fontFamily: 'Roboto-Regular',
        marginBottom: 4,
    },
    openStoreButton: {
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 11,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    openStoreButtonText: {
        fontSize: 12,
        fontFamily: 'Roboto-Bold',
        textTransform: 'uppercase',
    },
    storeItemCard: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
    },
    storeItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
        gap: 8,
    },
    storeItemTitle: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Roboto-Bold',
    },
    storeItemPrice: {
        fontSize: 12,
        fontFamily: 'Roboto-Bold',
        textTransform: 'uppercase',
    },
    storeItemDescription: {
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'Roboto-Regular',
    },
    storeBuyButton: {
        marginTop: 10,
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 9,
        alignItems: 'center',
    },
    storeBuyButtonText: {
        fontSize: 12,
        fontFamily: 'Roboto-Bold',
        textTransform: 'uppercase',
    },
    companionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginTop: 8,
    },
    companionName: {
        fontSize: 14,
        fontFamily: 'Roboto-Medium',
    },
});