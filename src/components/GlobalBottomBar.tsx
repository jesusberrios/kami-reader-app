import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePersonalization } from '../contexts/PersonalizationContext';

const withAlpha = (hexColor: string, alpha: number) => {
    const sanitized = String(hexColor || '').replace('#', '');
    if (sanitized.length !== 6) return `rgba(10, 10, 16, ${alpha})`;

    const red = parseInt(sanitized.slice(0, 2), 16);
    const green = parseInt(sanitized.slice(2, 4), 16);
    const blue = parseInt(sanitized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

type BottomRoute = 'Library' | 'AddFriends' | 'Home' | 'Profile';

type GlobalBottomBarProps = {
    currentRouteName?: string;
    visible: boolean;
    settingsActive?: boolean;
    socialPendingCount?: number;
    onNavigate: (routeName: BottomRoute) => void;
    onOpenDrawer: () => void;
};

const items = [
    { key: 'Library' as const, label: 'Biblioteca', icon: 'bookshelf' },
    { key: 'AddFriends' as const, label: 'Social', icon: 'account-group-outline' },
    { key: 'Home' as const, label: 'Inicio', icon: 'home-variant' },
    { key: 'Profile' as const, label: 'Perfil', icon: 'account-circle-outline' },
];

function GlobalBottomBar({ currentRouteName, visible, settingsActive = false, socialPendingCount = 0, onNavigate, onOpenDrawer }: GlobalBottomBarProps) {
    const insets = useSafeAreaInsets();
    const { theme } = usePersonalization();

    if (!visible) return null;

    // Barra flotante con fondo tematico uniforme para evitar cortes visuales.
    return (
        <View pointerEvents="box-none" style={[styles.absoluteOverlay, { bottom: 0, left: 0, right: 0 }]}> 
            <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: Math.max(insets.bottom, 10) + 86,
                    backgroundColor: withAlpha(theme.backgroundSecondary, 0.98),
                }}
            />
            <LinearGradient
                colors={[withAlpha(theme.card, 0.96), withAlpha(theme.backgroundSecondary, 0.96)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                    styles.container,
                    {
                        borderColor: withAlpha(theme.border, 0.9),
                        marginBottom: Math.max(insets.bottom, 6),
                        marginHorizontal: 12,
                        width: 'auto',
                        alignSelf: 'center',
                        maxWidth: 700,
                    },
                ]}
            >
                {items.map((item) => {
                    const isHome = item.key === 'Home';
                    const isActive = currentRouteName === item.key;

                    if (isHome) {
                        return (
                            <TouchableOpacity
                                key={item.key}
                                style={styles.homeSlot}
                                activeOpacity={0.88}
                                onPress={() => onNavigate(item.key)}
                            >
                                <LinearGradient
                                    colors={isActive ? [theme.accent, theme.accentStrong] : [theme.accent, theme.accentStrong]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={[styles.homeButton, { borderColor: theme.backgroundSecondary }]}
                                >
                                    <MaterialCommunityIcons name={item.icon as any} size={26} color={theme.text} />
                                </LinearGradient>
                                <Text style={[styles.homeLabel, { color: theme.text }]}>{item.label}</Text>
                            </TouchableOpacity>
                        );
                    }

                    return (
                        <TouchableOpacity
                            key={item.key}
                            style={[styles.item, isActive && styles.itemActive]}
                            activeOpacity={0.78}
                            onPress={() => onNavigate(item.key)}
                        >
                            <View style={styles.itemInner}>
                                <View style={[styles.activeMarker, isActive && styles.activeMarkerVisible, isActive && { backgroundColor: theme.accent }]} />
                                {item.key === 'AddFriends' && socialPendingCount > 0 && (
                                    <View style={[styles.socialOrb, { backgroundColor: theme.accent, shadowColor: theme.accent }]}>
                                        <View style={[styles.socialOrbInner, { backgroundColor: withAlpha(theme.backgroundSecondary, 0.9) }]} />
                                        <View style={[styles.socialBadge, { borderColor: theme.backgroundSecondary, backgroundColor: theme.danger }]}>
                                            <Text style={styles.socialBadgeText}>{socialPendingCount > 99 ? '99+' : socialPendingCount}</Text>
                                        </View>
                                    </View>
                                )}
                                <MaterialCommunityIcons
                                    name={item.icon as any}
                                    size={22}
                                    color={isActive ? theme.accent : theme.textMuted}
                                />
                                <Text style={[styles.itemLabel, { color: theme.textMuted }, isActive && styles.itemLabelActive, isActive && { color: theme.accent }]}>{item.label}</Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}

                <TouchableOpacity style={[styles.item, settingsActive && styles.itemActive]} activeOpacity={0.78} onPress={onOpenDrawer}>
                    <View style={styles.itemInner}>
                        <View style={[styles.activeMarker, settingsActive && styles.activeMarkerVisible, settingsActive && { backgroundColor: theme.accent }]} />
                        <MaterialCommunityIcons name="cog-outline" size={22} color={settingsActive ? theme.accent : theme.textMuted} />
                        <Text style={[styles.itemLabel, { color: settingsActive ? theme.accent : theme.textMuted }]}>Ajustes</Text>
                    </View>
                </TouchableOpacity>
            </LinearGradient>
        </View>
    );
}

export default React.memo(GlobalBottomBar);

const styles = StyleSheet.create({
    absoluteOverlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        pointerEvents: 'box-none',
    },
    wrap: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'flex-end',
        pointerEvents: 'box-none',
    },
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 32,
        minHeight: 48,
        paddingHorizontal: 10,
        borderWidth: 1.5,
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
        elevation: 12,
        backgroundColor: 'transparent',
        marginBottom: 0,
        width: '100%',
        alignSelf: 'center',
        maxWidth: 700,
    },
    item: {
        flex: 1,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 4,
        marginHorizontal: 2,
        borderRadius: 18,
        backgroundColor: 'transparent',
    },
    itemActive: {
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    itemInner: {
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        position: 'relative',
    },
    activeMarker: {
        width: 20,
        height: 2,
        borderRadius: 999,
        marginBottom: 4,
        backgroundColor: 'transparent',
    },
    activeMarkerVisible: {
        backgroundColor: '#FF7A7A',
    },
    itemLabel: {
        fontSize: 11,
        fontWeight: '700',
        textAlign: 'center',
    },
    itemLabelActive: {},
    socialOrb: {
        position: 'absolute',
        top: -2,
        right: -8,
        width: 11,
        height: 11,
        borderRadius: 999,
        shadowOpacity: 0.65,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
        elevation: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    socialOrbInner: {
        width: 5,
        height: 5,
        borderRadius: 999,
    },
    socialBadge: {
        position: 'absolute',
        top: -9,
        right: -11,
        minWidth: 16,
        height: 16,
        borderRadius: 999,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
    },
    socialBadgeText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: '800',
    },
    homeSlot: {
        flex: 1,
        alignItems: 'center',
        marginTop: -18,
    },
    homeButton: {
        width: 54,
        height: 54,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
    },
    homeLabel: {
        marginTop: 4,
        marginBottom: 6,
        fontSize: 11,
        fontWeight: '800',
        textAlign: 'center',
    },
});