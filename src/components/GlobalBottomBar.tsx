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
    onNavigate: (routeName: BottomRoute) => void;
    onOpenDrawer: () => void;
};

const items = [
    { key: 'Library' as const, label: 'Biblioteca', icon: 'bookshelf' },
    { key: 'AddFriends' as const, label: 'Social', icon: 'account-group-outline' },
    { key: 'Home' as const, label: 'Inicio', icon: 'home-variant' },
    { key: 'Profile' as const, label: 'Perfil', icon: 'account-circle-outline' },
];

export default function GlobalBottomBar({ currentRouteName, visible, settingsActive = false, onNavigate, onOpenDrawer }: GlobalBottomBarProps) {
    const insets = useSafeAreaInsets();
    const { theme } = usePersonalization();

    if (!visible) return null;

    // Barra absolutamente flotante, sin reservar espacio y con fondo reservado transparente
    return (
        <View pointerEvents="box-none" style={[styles.absoluteOverlay, { bottom: 0, left: 0, right: 0 }]}> 
            {/* Espacio reservado transparente para no tapar contenido */}
            <View style={{ height: Math.max(insets.bottom, 10) + 64, backgroundColor: 'transparent', width: '100%', position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 0 }} pointerEvents="none" />
            <LinearGradient
                colors={[withAlpha(theme.background, 0.12), 'rgba(0,0,0,0.04)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                    styles.container,
                    {
                        borderColor: withAlpha(theme.text, 0.06),
                        marginBottom: Math.max(insets.bottom, 10),
                        marginHorizontal: 0, // full width
                        width: '100%',
                        alignSelf: 'center',
                        maxWidth: 600, // para tablets, no más de 600px
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
                                    <MaterialCommunityIcons name={item.icon as any} size={26} color="#FFF" />
                                </LinearGradient>
                                <Text style={styles.homeLabel}>{item.label}</Text>
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
        shadowOpacity: 0.10,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
        elevation: 16,
        backgroundColor: 'transparent',
        marginBottom: 0,
        width: '100%',
        alignSelf: 'center',
        maxWidth: 600,
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
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
        textAlign: 'center',
    },
});