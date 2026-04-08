import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export type AppThemeKey = 'classic' | 'midnight-plum' | 'emerald-night';
export type ChapterChangeMode = 'horizontal' | 'vertical';

export type PersonalizationSettings = {
    appTheme: AppThemeKey;
    chapterChangeMode: ChapterChangeMode;
    reduceMotion: boolean;
    compactCards: boolean;
};

type AppPalette = {
    key: AppThemeKey;
    name: string;
    background: string;
    backgroundSecondary: string;
    surface: string;
    surfaceMuted: string;
    card: string;
    border: string;
    text: string;
    textMuted: string;
    accent: string;
    accentStrong: string;
    accentSoft: string;
    success: string;
    danger: string;
    warning: string;
};

type PersonalizationContextValue = {
    settings: PersonalizationSettings;
    theme: AppPalette;
    updateSettings: (next: Partial<PersonalizationSettings>) => Promise<void>;
    loading: boolean;
};

const STORAGE_KEY = 'kami.personalization.v1';

const defaultSettings: PersonalizationSettings = {
    appTheme: 'classic',
    chapterChangeMode: 'horizontal',
    reduceMotion: false,
    compactCards: false,
};

const themes: Record<AppThemeKey, AppPalette> = {
    classic: {
        key: 'classic',
        name: 'Clásico Kami',
        background: '#0F0F1A',
        backgroundSecondary: '#1E1E2D',
        surface: 'rgba(255,255,255,0.05)',
        surfaceMuted: 'rgba(255,255,255,0.03)',
        card: '#202031',
        border: 'rgba(255,255,255,0.08)',
        text: '#FFFFFF',
        textMuted: '#A9B0C5',
        accent: '#FF6E6E',
        accentStrong: '#FF5252',
        accentSoft: 'rgba(255,110,110,0.18)',
        success: '#4CD964',
        danger: '#FF5252',
        warning: '#FFD700',
    },
    'midnight-plum': {
        key: 'midnight-plum',
        name: 'Oscuro Ciruela',
        background: '#120F1C',
        backgroundSecondary: '#221731',
        surface: 'rgba(183,120,255,0.10)',
        surfaceMuted: 'rgba(255,255,255,0.03)',
        card: '#2A1F3D',
        border: 'rgba(189,124,255,0.18)',
        text: '#F7F1FF',
        textMuted: '#BFAFD5',
        accent: '#B66DFF',
        accentStrong: '#9247E6',
        accentSoft: 'rgba(182,109,255,0.18)',
        success: '#8BDFB3',
        danger: '#FF6E9F',
        warning: '#FFD36E',
    },
    'emerald-night': {
        key: 'emerald-night',
        name: 'Oscuro Esmeralda',
        background: '#0B1713',
        backgroundSecondary: '#142520',
        surface: 'rgba(73,199,149,0.10)',
        surfaceMuted: 'rgba(255,255,255,0.03)',
        card: '#193028',
        border: 'rgba(73,199,149,0.18)',
        text: '#F0FFF9',
        textMuted: '#A4C8BB',
        accent: '#49C795',
        accentStrong: '#22A06B',
        accentSoft: 'rgba(73,199,149,0.18)',
        success: '#7AF0AF',
        danger: '#FF7B7B',
        warning: '#FFD36E',
    },
};

const PersonalizationContext = createContext<PersonalizationContextValue | undefined>(undefined);

const normalizeSettings = (raw?: any): PersonalizationSettings => ({
    appTheme: raw?.appTheme && themes[raw.appTheme as AppThemeKey] ? raw.appTheme : defaultSettings.appTheme,
    chapterChangeMode: raw?.chapterChangeMode === 'vertical' ? 'vertical' : 'horizontal',
    reduceMotion: raw?.reduceMotion === true,
    compactCards: raw?.compactCards === true,
});

export function PersonalizationProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<PersonalizationSettings>(defaultSettings);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        const loadSettingsForUser = async (currentUser: typeof auth.currentUser) => {
            try {
                const localRaw = await AsyncStorage.getItem(STORAGE_KEY);
                const localSettings = localRaw ? normalizeSettings(JSON.parse(localRaw)) : defaultSettings;

                if (!mounted) return;
                setSettings(localSettings);

                if (!currentUser) {
                    setLoading(false);
                    return;
                }

                const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
                if (!userDoc.exists()) {
                    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(localSettings));
                    setLoading(false);
                    return;
                }

                const remote = normalizeSettings({
                    ...localSettings,
                    ...userDoc.data(),
                });
                if (!mounted) return;
                setSettings(remote);
                await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
            } catch {
                if (mounted) setSettings(defaultSettings);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        const unsubscribe = auth.onAuthStateChanged((user) => {
            setLoading(true);
            loadSettingsForUser(user);
        });

        return () => {
            mounted = false;
            unsubscribe();
        };
    }, []);

    const updateSettings = async (next: Partial<PersonalizationSettings>) => {
        const merged = { ...settings, ...next };
        setSettings(merged);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

        const currentUser = auth.currentUser;
        if (!currentUser) return;

        await setDoc(doc(db, 'users', currentUser.uid), merged, { merge: true });
    };

    const value = useMemo<PersonalizationContextValue>(() => ({
        settings,
        theme: themes[settings.appTheme],
        updateSettings,
        loading,
    }), [settings, loading]);

    return <PersonalizationContext.Provider value={value}>{children}</PersonalizationContext.Provider>;
}

export function usePersonalization() {
    const context = useContext(PersonalizationContext);
    if (!context) {
        throw new Error('usePersonalization must be used within a PersonalizationProvider');
    }
    return context;
}