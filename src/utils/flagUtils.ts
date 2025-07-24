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

// utils/timeUtils.ts (can be in the same file or separate)
export const formatTimeAgo = (timestamp: any): string => {
    if (!timestamp || !timestamp.toDate) {
        return 'N/A'; // Or handle cases where timestamp is not a Firebase Timestamp
    }

    const date = timestamp.toDate();
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

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