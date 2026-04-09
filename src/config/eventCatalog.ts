export type EventAchievementCatalogItem = {
    id: string;
    name: string;
    icon: string;
    description: string;
    target: number;
    valueType: 'totalRead' | 'hoursSpent' | 'favorites' | 'coinsEarned';
    minHoursSpent?: number;
};

export type EventStoreCatalogItem = {
    id: string;
    eventId: string;
    type: 'theme' | 'companion' | 'cosmetic';
    name: string;
    description: string;
    price: number;
    themeKey?: string;
    companionKey?: string;
    primaryColor?: string;
    secondaryColor?: string;
    requirements?: {
        achievementId?: string;
        minReadingTimeMs?: number;
    };
};

export type EventCatalogEntry = {
    id: string;
    name: string;
    startsAt: number;
    endsAt: number;
    achievement: EventAchievementCatalogItem;
    items: EventStoreCatalogItem[];
};

export const EASTER_EVENT_ID = 'easter-2026';
export const EASTER_THEME_KEY = 'easter-matsuri';
export const EASTER_THEME_ITEM_ID = 'theme-easter-matsuri';
export const EASTER_BUNNY_ITEM_ID = 'companion-kami-bunny';

export const HALLOWEEN_EVENT_ID = 'halloween-2026';
export const HALLOWEEN_THEME_KEY = 'halloween-night';
export const HALLOWEEN_THEME_ITEM_ID = 'theme-halloween-night';
export const HALLOWEEN_CAT_ITEM_ID = 'companion-halloween-cat';

export const XMAS_EVENT_ID = 'navidad-2026';
export const XMAS_THEME_KEY = 'navidad-glow';
export const XMAS_THEME_ITEM_ID = 'theme-navidad-glow';
export const XMAS_CAT_ITEM_ID = 'companion-navidad-cat';

export const VALENTINES_EVENT_ID = 'valentines-2027';
export const VALENTINES_THEME_KEY = 'san-valentin';
export const VALENTINES_THEME_ITEM_ID = 'theme-san-valentin';
export const VALENTINES_CAT_ITEM_ID = 'companion-valentine-cat';

export const EASTER_ACHIEVEMENT_ID = 'easter-patron';
export const HALLOWEEN_ACHIEVEMENT_ID = 'halloween-sombra';
export const XMAS_ACHIEVEMENT_ID = 'navidad-guardian';
export const VALENTINES_ACHIEVEMENT_ID = 'valentin-corazon';

export const EVENT_CATALOG: EventCatalogEntry[] = [
    {
        id: EASTER_EVENT_ID,
        name: 'Festival de Pascua',
        startsAt: Date.parse('2026-04-01T00:00:00.000Z'),
        endsAt: Date.parse('2026-04-30T23:59:59.000Z'),
        achievement: {
            id: EASTER_ACHIEVEMENT_ID,
            name: 'Coleccionista de Huevos',
            icon: 'egg-outline',
            description: 'Consigue 1000 monedas de lectura y supera 1 hora total para dominar Pascua.',
            target: 1000,
            valueType: 'coinsEarned',
            minHoursSpent: 1,
        },
        items: [
            {
                id: EASTER_THEME_ITEM_ID,
                eventId: EASTER_EVENT_ID,
                type: 'theme',
                name: 'Tema Festival de Pascua',
                description: 'Paleta anime primaveral con tonos pastel y dorados.',
                price: 900,
                themeKey: EASTER_THEME_KEY,
                primaryColor: '#FFCB7D',
                secondaryColor: '#F7A6D9',
                requirements: {
                    achievementId: EASTER_ACHIEVEMENT_ID,
                    minReadingTimeMs: 120 * 60 * 1000,
                },
            },
            {
                id: EASTER_BUNNY_ITEM_ID,
                eventId: EASTER_EVENT_ID,
                type: 'companion',
                name: 'Mascota Kami Bunny',
                description: 'Mascota de Pascua que te acompana por toda la app.',
                price: 1400,
                companionKey: 'kami-bunny',
                requirements: {
                    achievementId: EASTER_ACHIEVEMENT_ID,
                    minReadingTimeMs: 150 * 60 * 1000,
                },
            },
        ],
    },
    {
        id: HALLOWEEN_EVENT_ID,
        name: 'Noche de Halloween',
        startsAt: Date.parse('2026-10-15T00:00:00.000Z'),
        endsAt: Date.parse('2026-10-31T23:59:59.000Z'),
        achievement: {
            id: HALLOWEEN_ACHIEVEMENT_ID,
            name: 'Sombra de Halloween',
            icon: 'moon-outline',
            description: 'Consigue 1200 monedas de lectura y supera 1.5 horas para dominar la noche.',
            target: 1200,
            valueType: 'coinsEarned',
            minHoursSpent: 1.5,
        },
        items: [
            {
                id: HALLOWEEN_THEME_ITEM_ID,
                eventId: HALLOWEEN_EVENT_ID,
                type: 'theme',
                name: 'Tema Noche de Halloween',
                description: 'Oscuro con acentos naranja para sesiones nocturnas.',
                price: 950,
                themeKey: HALLOWEEN_THEME_KEY,
                primaryColor: '#FF7B22',
                secondaryColor: '#2A1A3A',
                requirements: {
                    achievementId: HALLOWEEN_ACHIEVEMENT_ID,
                    minReadingTimeMs: 180 * 60 * 1000,
                },
            },
            {
                id: HALLOWEEN_CAT_ITEM_ID,
                eventId: HALLOWEEN_EVENT_ID,
                type: 'companion',
                name: 'Mascota Cat Halloween',
                description: 'Gato oscuro con energia de noche de Halloween.',
                price: 1500,
                companionKey: 'halloween-cat',
                requirements: {
                    achievementId: HALLOWEEN_ACHIEVEMENT_ID,
                    minReadingTimeMs: 210 * 60 * 1000,
                },
            },
        ],
    },
    {
        id: XMAS_EVENT_ID,
        name: 'Festival de Navidad',
        startsAt: Date.parse('2026-12-10T00:00:00.000Z'),
        endsAt: Date.parse('2026-12-31T23:59:59.000Z'),
        achievement: {
            id: XMAS_ACHIEVEMENT_ID,
            name: 'Guardian de Navidad',
            icon: 'snow-outline',
            description: 'Consigue 1400 monedas de lectura y supera 2 horas para proteger la Navidad.',
            target: 1400,
            valueType: 'coinsEarned',
            minHoursSpent: 2,
        },
        items: [
            {
                id: XMAS_THEME_ITEM_ID,
                eventId: XMAS_EVENT_ID,
                type: 'theme',
                name: 'Tema Festival de Navidad',
                description: 'Brillo navideno con contraste rojo y verde.',
                price: 1000,
                themeKey: XMAS_THEME_KEY,
                primaryColor: '#FFD700',
                secondaryColor: '#E83030',
                requirements: {
                    achievementId: XMAS_ACHIEVEMENT_ID,
                    minReadingTimeMs: 210 * 60 * 1000,
                },
            },
            {
                id: XMAS_CAT_ITEM_ID,
                eventId: XMAS_EVENT_ID,
                type: 'companion',
                name: 'Mascota Cat Navidad',
                description: 'Gatito navideno que acompana tu lectura con brillo festivo.',
                price: 1550,
                companionKey: 'navidad-cat',
                requirements: {
                    achievementId: XMAS_ACHIEVEMENT_ID,
                    minReadingTimeMs: 240 * 60 * 1000,
                },
            },
        ],
    },
    {
        id: VALENTINES_EVENT_ID,
        name: 'San Valentín',
        startsAt: Date.parse('2027-02-07T00:00:00.000Z'),
        endsAt: Date.parse('2027-02-14T23:59:59.000Z'),
        achievement: {
            id: VALENTINES_ACHIEVEMENT_ID,
            name: 'Corazon de Valentin',
            icon: 'heart-outline',
            description: 'Consigue 900 monedas de lectura y supera 1 hora para conquistar San Valentin.',
            target: 900,
            valueType: 'coinsEarned',
            minHoursSpent: 1,
        },
        items: [
            {
                id: VALENTINES_THEME_ITEM_ID,
                eventId: VALENTINES_EVENT_ID,
                type: 'theme',
                name: 'Tema San Valentin',
                description: 'Colores romanticos para la semana especial.',
                price: 800,
                themeKey: VALENTINES_THEME_KEY,
                primaryColor: '#FF4480',
                secondaryColor: '#FF90B8',
                requirements: {
                    achievementId: VALENTINES_ACHIEVEMENT_ID,
                    minReadingTimeMs: 90 * 60 * 1000,
                },
            },
            {
                id: VALENTINES_CAT_ITEM_ID,
                eventId: VALENTINES_EVENT_ID,
                type: 'companion',
                name: 'Mascota Cat Valentin',
                description: 'Gatito romantico que te acompana durante el evento de San Valentin.',
                price: 1350,
                companionKey: 'valentine-cat',
                requirements: {
                    achievementId: VALENTINES_ACHIEVEMENT_ID,
                    minReadingTimeMs: 120 * 60 * 1000,
                },
            },
        ],
    },
];

export const EVENT_ACHIEVEMENTS = EVENT_CATALOG.map((event) => event.achievement);
export const EVENT_STORE_ITEMS = EVENT_CATALOG.flatMap((event) => event.items);
export const EVENT_THEME_OPTIONS = EVENT_STORE_ITEMS.filter((item) => item.type === 'theme' && item.themeKey).map((item) => ({
    key: item.themeKey!,
    title: item.name,
    subtitle: item.description,
    preview: [item.primaryColor || '#FFFFFF', item.secondaryColor || '#999999'] as [string, string],
    eventId: item.eventId,
}));
