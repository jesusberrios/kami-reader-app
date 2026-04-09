import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getThemeStoreItem } from '../config/liveEvents';

export type AppThemeKey = 'classic' | 'midnight-plum' | 'emerald-night' | 'easter-matsuri' | 'halloween-night' | 'navidad-glow' | 'san-valentin';
export type ChapterChangeMode = 'horizontal' | 'vertical';

export type PersonalizationSettings = {
    appTheme: AppThemeKey;
    chapterChangeMode: ChapterChangeMode;
    reduceMotion: boolean;
    compactCards: boolean;
    selectedCompanionKey: string | null;
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
    isThemeUnlocked: (themeKey: AppThemeKey) => boolean;
    loading: boolean;
};

const STORAGE_KEY = 'kami.personalization.v1';

const defaultSettings: PersonalizationSettings = {
    appTheme: 'classic',
    chapterChangeMode: 'horizontal',
    reduceMotion: false,
    compactCards: false,
    selectedCompanionKey: null,
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
    'easter-matsuri': {
        key: 'easter-matsuri',
        name: 'Festival de Pascua',
        background: '#2D4A3F',
        backgroundSecondary: '#3E6655',
        surface: 'rgba(244,255,225,0.16)',
        surfaceMuted: 'rgba(255,255,255,0.10)',
        card: '#4F7E69',
        border: 'rgba(255,239,184,0.44)',
        text: '#FFFCEF',
        textMuted: '#E4F3D7',
        accent: '#FFD07F',
        accentStrong: '#F7AC4E',
        accentSoft: 'rgba(255,208,127,0.30)',
        success: '#B2EEA7',
        danger: '#FF92A3',
        warning: '#FFE08C',
    },
    'halloween-night': {
        key: 'halloween-night',
        name: 'Noche de Halloween',
        background: '#120A1E',
        backgroundSecondary: '#1E1030',
        surface: 'rgba(255,90,20,0.10)',
        surfaceMuted: 'rgba(255,255,255,0.03)',
        card: '#2A1A3A',
        border: 'rgba(255,130,40,0.22)',
        text: '#FFF0E0',
        textMuted: '#C9A080',
        accent: '#FF7B22',
        accentStrong: '#E85A00',
        accentSoft: 'rgba(255,123,34,0.18)',
        success: '#8BDF8A',
        danger: '#FF4B6A',
        warning: '#FFD07F',
    },
    'navidad-glow': {
        key: 'navidad-glow',
        name: 'Festival de Navidad',
        background: '#0D1A12',
        backgroundSecondary: '#162A1C',
        surface: 'rgba(220,60,60,0.10)',
        surfaceMuted: 'rgba(255,255,255,0.03)',
        card: '#1E3828',
        border: 'rgba(220,80,60,0.22)',
        text: '#FFFFF0',
        textMuted: '#B8D8B0',
        accent: '#E83030',
        accentStrong: '#C41A1A',
        accentSoft: 'rgba(232,48,48,0.18)',
        success: '#7BEF9A',
        danger: '#FF5555',
        warning: '#FFD700',
    },
    'san-valentin': {
        key: 'san-valentin',
        name: 'San Valentín',
        background: '#1A0D12',
        backgroundSecondary: '#2A1520',
        surface: 'rgba(255,80,120,0.10)',
        surfaceMuted: 'rgba(255,255,255,0.03)',
        card: '#3A1E28',
        border: 'rgba(255,100,140,0.22)',
        text: '#FFF0F5',
        textMuted: '#D4A0B0',
        accent: '#FF4480',
        accentStrong: '#E0205E',
        accentSoft: 'rgba(255,68,128,0.18)',
        success: '#90EEC0',
        danger: '#FF3B3B',
        warning: '#FFD07F',
    },
};

const PersonalizationContext = createContext<PersonalizationContextValue | undefined>(undefined);

const normalizeSettings = (raw?: any): PersonalizationSettings => ({
    appTheme: raw?.appTheme && themes[raw.appTheme as AppThemeKey] ? raw.appTheme : defaultSettings.appTheme,
    chapterChangeMode: raw?.chapterChangeMode === 'vertical' ? 'vertical' : 'horizontal',
    reduceMotion: raw?.reduceMotion === true,
    compactCards: raw?.compactCards === true,
    selectedCompanionKey: typeof raw?.selectedCompanionKey === 'string' ? raw.selectedCompanionKey : null,
});

export function PersonalizationProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<PersonalizationSettings>(defaultSettings);
    const [purchasedItems, setPurchasedItems] = useState<string[]>([]);
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
                    setPurchasedItems([]);
                    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(localSettings));
                    setLoading(false);
                    return;
                }

                const remoteData = userDoc.data() || {};
                const purchased = Array.isArray(remoteData.purchasedItems) ? remoteData.purchasedItems : [];
                if (mounted) setPurchasedItems(purchased);

                const remote = normalizeSettings({
                    ...localSettings,
                    ...remoteData,
                });

                const selectedThemeItem = getThemeStoreItem(remote.appTheme);
                if (selectedThemeItem) {
                    const unlocked = purchased.includes(selectedThemeItem.id);
                    if (!unlocked) {
                        remote.appTheme = defaultSettings.appTheme;
                    }
                }

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

        const currentUser = auth.currentUser;
        if (next.appTheme) {
            const themeItem = getThemeStoreItem(next.appTheme);
            if (themeItem) {
                let unlocked = purchasedItems.includes(themeItem.id);

                if (!unlocked && currentUser) {
                    const remoteSnap = await getDoc(doc(db, 'users', currentUser.uid));
                    const remoteData = remoteSnap.exists() ? remoteSnap.data() : {};
                    const remotePurchasedItems = Array.isArray(remoteData?.purchasedItems) ? remoteData.purchasedItems : [];
                    if (remotePurchasedItems.includes(themeItem.id)) {
                        unlocked = true;
                        setPurchasedItems(remotePurchasedItems);
                    }
                }

                if (!unlocked) {
                    throw new Error('Debes comprar este tema en la tienda del evento.');
                }
            }
        }

        if (getThemeStoreItem(next.appTheme ?? '') && !currentUser) {
            throw new Error('Debes iniciar sesion para usar este tema.');
        }

        setSettings(merged);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

        if (!currentUser) return;

        await setDoc(doc(db, 'users', currentUser.uid), merged, { merge: true });
    };

    const isThemeUnlocked = (themeKey: AppThemeKey) => {
        const themeItem = getThemeStoreItem(themeKey);
        if (!themeItem) return true;
        return purchasedItems.includes(themeItem.id);
    };

    useEffect(() => {
        if (!isThemeUnlocked(settings.appTheme) && settings.appTheme !== defaultSettings.appTheme) {
            const next = { ...settings, appTheme: defaultSettings.appTheme };
            setSettings(next);
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
                // silently ignored
            });
        }
    }, [settings, purchasedItems]);

    const value = useMemo<PersonalizationContextValue>(() => ({
        settings,
        theme: themes[settings.appTheme],
        updateSettings,
        isThemeUnlocked,
        loading,
    }), [settings, purchasedItems, loading]);

    return <PersonalizationContext.Provider value={value}>{children}</PersonalizationContext.Provider>;
}

export function usePersonalization() {
    const context = useContext(PersonalizationContext);
    if (!context) {
        throw new Error('usePersonalization must be used within a PersonalizationProvider');
    }
    return context;
}