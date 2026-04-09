import {
    EASTER_ACHIEVEMENT_ID,
    EASTER_BUNNY_ITEM_ID,
    EASTER_EVENT_ID,
    EASTER_THEME_ITEM_ID,
    EASTER_THEME_KEY,
    EVENT_CATALOG,
    EventStoreCatalogItem,
    EVENT_STORE_ITEMS,
    HALLOWEEN_ACHIEVEMENT_ID,
    HALLOWEEN_CAT_ITEM_ID,
    HALLOWEEN_EVENT_ID,
    HALLOWEEN_THEME_ITEM_ID,
    HALLOWEEN_THEME_KEY,
    VALENTINES_ACHIEVEMENT_ID,
    VALENTINES_CAT_ITEM_ID,
    VALENTINES_EVENT_ID,
    VALENTINES_THEME_ITEM_ID,
    VALENTINES_THEME_KEY,
    XMAS_ACHIEVEMENT_ID,
    XMAS_CAT_ITEM_ID,
    XMAS_EVENT_ID,
    XMAS_THEME_ITEM_ID,
    XMAS_THEME_KEY,
} from './eventCatalog';

export type EventStoreItemType = 'theme' | 'companion' | 'cosmetic';

export type EventStoreRequirement = {
    achievementId?: string;
    minReadingTimeMs?: number;
};

export type LiveEvent = {
    id: string;
    name: string;
    startsAt: number;
    endsAt: number;
};

export type EventStoreItem = {
    id: string;
    eventId: string;
    type: EventStoreItemType;
    name: string;
    description: string;
    price: number;
    themeKey?: string;
    companionKey?: string;
    primaryColor?: string;
    secondaryColor?: string;
    requirements?: EventStoreRequirement;
};

export type EventProgressSnapshot = {
    coins: number;
    totalReadingTime: number;
    achievementsUnlocked: string[];
    purchasedItems: string[];
};

export {
    EASTER_ACHIEVEMENT_ID,
    EASTER_BUNNY_ITEM_ID,
    EASTER_EVENT_ID,
    EASTER_THEME_ITEM_ID,
    EASTER_THEME_KEY,
    HALLOWEEN_ACHIEVEMENT_ID,
    HALLOWEEN_CAT_ITEM_ID,
    HALLOWEEN_EVENT_ID,
    HALLOWEEN_THEME_ITEM_ID,
    HALLOWEEN_THEME_KEY,
    VALENTINES_ACHIEVEMENT_ID,
    VALENTINES_CAT_ITEM_ID,
    VALENTINES_EVENT_ID,
    VALENTINES_THEME_ITEM_ID,
    VALENTINES_THEME_KEY,
    XMAS_ACHIEVEMENT_ID,
    XMAS_CAT_ITEM_ID,
    XMAS_EVENT_ID,
    XMAS_THEME_ITEM_ID,
    XMAS_THEME_KEY,
};

const runtimeEventFlags: Partial<Record<string, boolean>> = {};
const runtimeEventDates: Partial<Record<string, { startsAt: number; endsAt: number }>> = {};
const runtimeStorePrices: Partial<Record<string, number>> = {};
let runtimeStoreItems: EventStoreItem[] | null = null;

const createThemeItem = (item: EventStoreItem): EventStoreItem => item;
const createCompanionItem = (item: EventStoreItem): EventStoreItem => item;

const mergeCatalogItems = (defaults: EventStoreItem[], overrides: EventStoreItem[]) => {
    const merged = new Map<string, EventStoreItem>();
    for (const item of defaults) merged.set(item.id, item);
    for (const item of overrides) merged.set(item.id, { ...merged.get(item.id), ...item });
    return Array.from(merged.values());
};

const _items = (): EventStoreItem[] =>
    runtimeStoreItems ? mergeCatalogItems(storeItems, runtimeStoreItems) : storeItems;

const liveEvents: LiveEvent[] = EVENT_CATALOG.map((event) => ({
    id: event.id,
    name: event.name,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
}));

// Hardcoded fallback used when Firestore does not provide store items.
const storeItems: EventStoreItem[] = EVENT_STORE_ITEMS.map((item: EventStoreCatalogItem) =>
    item.type === 'theme' ? createThemeItem(item) : createCompanionItem(item)
);

export const getLiveEvents = () => liveEvents.slice();

export const getStoreItems = () => _items().slice();

export const getCompanionStoreItems = () => _items().filter((it) => it.type === 'companion');

export const setEventFeatureFlag = (eventId: string, enabled?: boolean | null) => {
    if (typeof enabled === 'boolean') {
        runtimeEventFlags[eventId] = enabled;
        return;
    }
    delete runtimeEventFlags[eventId];
};

export const applyEventFlagsFromAppSettings = (appSettings?: any) => {
    const mapping: Array<[string, string]> = [
        ['eventPascua', EASTER_EVENT_ID],
        ['eventHalloween', HALLOWEEN_EVENT_ID],
        ['eventNavidad', XMAS_EVENT_ID],
        ['eventSanValentin', VALENTINES_EVENT_ID],
    ];
    for (const [key, eventId] of mapping) {
        const flag = typeof appSettings?.[key] === 'boolean' ? appSettings[key] : null;
        setEventFeatureFlag(eventId, flag);
    }
};

export const isEventActive = (eventId: string, now = Date.now()) => {
    const event = liveEvents.find((it) => it.id === eventId);
    if (!event) return false;
    const enabledByRemoteFlag = runtimeEventFlags[eventId];
    if (typeof enabledByRemoteFlag === 'boolean') {
        return enabledByRemoteFlag;
    }
    const dates = runtimeEventDates[eventId] ?? event;
    return now >= dates.startsAt && now <= dates.endsAt;
};

export const getThemeStoreItem = (themeKey: string) => {
    return _items().find((it) => it.type === 'theme' && it.themeKey === themeKey) || null;
};

export const getCompanionStoreItem = (companionKey: string) => {
    return _items().find((it) => it.type === 'companion' && it.companionKey === companionKey) || null;
};

export const isStoreItemAvailableNow = (itemId: string, now = Date.now()) => {
    const item = _items().find((it) => it.id === itemId);
    if (!item) return false;
    return isEventActive(item.eventId, now);
};

export const getActiveStoreItems = (now = Date.now()) => {
    return _items().filter((it) => isEventActive(it.eventId, now));
};

export const getAnyEventActive = (now = Date.now()) =>
    liveEvents.some((event) => isEventActive(event.id, now));

export const getActiveEventName = (now = Date.now()): string | null => {
    const active = liveEvents.find((event) => isEventActive(event.id, now));
    return active?.name ?? null;
};

export const getEffectivePrice = (itemId: string): number => {
    const override = runtimeStorePrices[itemId];
    if (typeof override === 'number') return override;
    return _items().find((it) => it.id === itemId)?.price ?? 0;
};

export const applyLiveConfigFromFirestore = (data: any) => {
    const events = data?.events;
    if (events && typeof events === 'object') {
        for (const [id, val] of Object.entries(events)) {
            const entry = val as any;
            if (entry?.startsAt && entry?.endsAt) {
                runtimeEventDates[id] = {
                    startsAt: typeof entry.startsAt === 'number' ? entry.startsAt : Date.parse(entry.startsAt),
                    endsAt:   typeof entry.endsAt   === 'number' ? entry.endsAt   : Date.parse(entry.endsAt),
                };
            }
        }
    }
    const prices = data?.storePrices;
    if (prices && typeof prices === 'object') {
        for (const [id, price] of Object.entries(prices)) {
            if (typeof price === 'number') runtimeStorePrices[id] = price;
        }
    }
    const items = data?.storeItems;
    if (Array.isArray(items) && items.length > 0) {
        runtimeStoreItems = items.map((it: any): EventStoreItem => ({
            id: it.id,
            eventId: it.eventId,
            type: it.type,
            name: it.name,
            description: it.description ?? '',
            price: typeof it.price === 'number' ? it.price : 0,
            ...(it.themeKey     ? { themeKey: it.themeKey }         : {}),
            ...(it.companionKey ? { companionKey: it.companionKey } : {}),
            ...(it.primaryColor ? { primaryColor: it.primaryColor } : {}),
            ...(it.secondaryColor ? { secondaryColor: it.secondaryColor } : {}),
            ...(it.requirements ? { requirements: it.requirements } : {}),
        }));
    }
};

const hasRequirementGates = (progress: EventProgressSnapshot, item: EventStoreItem) => {
    const requirements = item.requirements;
    if (!requirements) return true;

    if (requirements.minReadingTimeMs && progress.totalReadingTime < requirements.minReadingTimeMs) {
        return false;
    }

    if (requirements.achievementId && !progress.achievementsUnlocked.includes(requirements.achievementId)) {
        return false;
    }

    return true;
};

export const canPurchaseStoreItem = (progress: EventProgressSnapshot, item: EventStoreItem) => {
    if (!isEventActive(item.eventId)) {
        return { ok: false, reason: 'El evento de este item no esta activo.' };
    }

    if (progress.purchasedItems.includes(item.id)) {
        return { ok: false, reason: 'Este item ya esta comprado.' };
    }

    if (progress.coins < item.price) {
        return { ok: false, reason: `Necesitas ${item.price} monedas para comprar este item.` };
    }

    if (!hasRequirementGates(progress, item)) {
        return { ok: false, reason: 'Aun no cumples los requisitos del evento para este item.' };
    }

    return { ok: true, reason: '' };
};
