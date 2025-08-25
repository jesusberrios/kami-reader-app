import Constants from 'expo-constants';

export const isVersionOutdated = (current: string, required: string): boolean => {
    const currentParts = current.split('.').map(Number);
    const requiredParts = required.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
        const currentPart = currentParts[i] || 0;
        const requiredPart = requiredParts[i] || 0;

        if (currentPart < requiredPart) return true;
        if (currentPart > requiredPart) return false;
    }

    return false;
};

export const getAppVersion = (): string => {
    return Constants.expoConfig?.version || '1.0.6';
};