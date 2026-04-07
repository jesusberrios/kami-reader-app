// utils/flagUtils.ts
export const getFlagEmoji = (lang: string): string => {
    switch (lang.toLowerCase()) {
        case 'en': return '🇬🇧'; // Or '🇬🇧'
        case 'es': return '🇪🇸'; // Or '🇲🇽', '🇦🇷', etc.
        case 'ja': return '🇯🇵';
        case 'ko': return '🇰🇷';
        case 'zh': return '🇨🇳';
        case 'fr': return '🇫🇷';
        case 'de': return '🇩🇪';
        case 'ru': return '🇷🇺';
        case 'it': return '🇮🇹';
        case 'pt': return '🇧🇷'; // Or '🇧🇷'
        case 'id': return '🇮🇩';
        case 'th': return '🇹🇭';
        case 'vi': return '🇻🇳';
        case 'ar': return '🇸🇦'; // Saudi Arabia, common for Arabic
        case 'pl': return '🇵🇱';
        case 'tr': return '🇹🇷';
        case 'uk': return '🇺🇦';
        case 'hu': return '🇭🇺';
        case 'cz': return '🇨🇿';
        case 'nl': return '🇳🇱';
        case 'mn': return '🇲🇳';
        default: return '🌐'; // Global icon for unknown
    }
};

const toDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') {
        const result = value.toDate();
        return result instanceof Date ? result : null;
    }
    if (typeof value?.toMillis === 'function') {
        const ms = Number(value.toMillis());
        return Number.isFinite(ms) ? new Date(ms) : null;
    }
    if (typeof value === 'number') {
        const normalized = Math.abs(value) < 1e12 ? value * 1000 : value;
        return Number.isFinite(normalized) ? new Date(normalized) : null;
    }

    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
};

// utils/timeUtils.ts (can be in the same file or separate)
export const formatTimeAgo = (timestamp: any): string => {
    const date = toDate(timestamp);
    if (!date) {
        return 'N/A';
    }

    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (!Number.isFinite(seconds) || seconds < 0) {
        return 'Ahora';
    }

    let interval = seconds / 31536000; // years
    if (interval > 1) {
        return Math.floor(interval) === 1 ? 'Hace 1 año' : `Hace ${Math.floor(interval)} años`;
    }
    interval = seconds / 2592000; // months
    if (interval > 1) {
        return Math.floor(interval) === 1 ? 'Hace 1 mes' : `Hace ${Math.floor(interval)} meses`;
    }
    interval = seconds / 86400; // days
    if (interval > 1) {
        return Math.floor(interval) === 1 ? 'Hace 1 día' : `Hace ${Math.floor(interval)} días`;
    }
    interval = seconds / 3600; // hours
    if (interval > 1) {
        return Math.floor(interval) === 1 ? 'Hace 1 hora' : `Hace ${Math.floor(interval)} horas`;
    }
    interval = seconds / 60; // minutes
    if (interval > 1) {
        return Math.floor(interval) === 1 ? 'Hace 1 minuto' : `Hace ${Math.floor(interval)} minutos`;
    }
    return 'Ahora';
};