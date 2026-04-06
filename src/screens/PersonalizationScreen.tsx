import React from 'react';
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
import { AppThemeKey, usePersonalization } from '../contexts/PersonalizationContext';
import { useAlertContext } from '../contexts/AlertContext';

const themeOptions: Array<{ key: AppThemeKey; title: string; subtitle: string; preview: [string, string] }> = [
    { key: 'classic', title: 'Clásico', subtitle: 'Rojo Kami tradicional', preview: ['#FF8A65', '#FF5252'] },
    { key: 'midnight-plum', title: 'Oscuro con morado', subtitle: 'Contraste ciruela', preview: ['#C084FC', '#7C3AED'] },
    { key: 'emerald-night', title: 'Oscuro con verde', subtitle: 'Tono esmeralda profundo', preview: ['#49C795', '#1F9D68'] },
];

export default function PersonalizationScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { alertSuccess, alertError } = useAlertContext();
    const { settings, theme, updateSettings } = usePersonalization();

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
                        {themeOptions.map((option) => {
                            const selected = settings.appTheme === option.key;

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
                                    onPress={() => handleThemeChange(option.key)}
                                    activeOpacity={0.84}
                                >
                                    <LinearGradient colors={option.preview} style={styles.themePreview} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                                    <View style={styles.themeTextWrap}>
                                        <Text style={[styles.themeTitle, { color: theme.text }]}>{option.title}</Text>
                                        <Text style={[styles.themeSubtitle, { color: theme.textMuted }]}>{option.subtitle}</Text>
                                    </View>
                                    {selected && <Ionicons name="checkmark-circle" size={22} color={theme.accent} />}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

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
                        <Text style={[styles.noteText, { color: theme.textMuted }]}>Los cambios de tema, reducción de movimiento y modo compacto ya se aplican en navegación y biblioteca para que la personalización sea visible en el uso diario.</Text>
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
});