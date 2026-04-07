export type NotificationLike = {
    date?: any;
    createdAt?: any;
    isNew?: boolean;
    [key: string]: any;
};

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const normalizeNumericTimestamp = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.abs(value) < 1e12 ? value * 1000 : value;
};

export const notificationDateToMillis = (value: any): number => {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') {
        const millis = Number(value.toMillis());
        return Number.isFinite(millis) ? millis : 0;
    }
    if (typeof value?.toDate === 'function') {
        const millis = value.toDate()?.getTime?.();
        return Number.isFinite(millis) ? millis : 0;
    }
    if (typeof value === 'number') {
        return normalizeNumericTimestamp(value);
    }
    if (value instanceof Date) {
        return value.getTime();
    }
    if (typeof value?.seconds === 'number') {
        const seconds = Number(value.seconds) * 1000;
        const nanos = typeof value?.nanoseconds === 'number' ? Number(value.nanoseconds) / 1e6 : 0;
        return seconds + nanos;
    }

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

export const getNotificationDateValue = (item?: NotificationLike | null) => {
    if (!item) return null;
    return item.date ?? item.createdAt ?? null;
};

export const normalizeNotification = <T extends NotificationLike>(item: T) => {
    const dateValue = getNotificationDateValue(item);
    return {
        ...item,
        date: dateValue,
        createdAt: dateValue,
        isNew: Boolean(item?.isNew),
    };
};

export const isNotificationOld = (item?: NotificationLike | null) => {
    const ms = notificationDateToMillis(getNotificationDateValue(item));
    if (!ms) return false;
    return (Date.now() - ms) > ONE_MONTH_MS;
};

export const sortNotificationsByDateDesc = <T extends NotificationLike>(items: T[]) => {
    return [...items].sort((a, b) => notificationDateToMillis(getNotificationDateValue(b)) - notificationDateToMillis(getNotificationDateValue(a)));
};

export const filterNotificationsForHome = <T extends NotificationLike>(items: T[]) => {
    return sortNotificationsByDateDesc(items).filter((item) => Boolean(item?.isNew) && !isNotificationOld(item));
};

export const formatNotificationDate = (value: any) => {
    const ms = notificationDateToMillis(value);
    if (!ms) return 'Sin fecha';

    const date = new Date(ms);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};