export type ContentType = 'manga' | 'anime';

export type ContentRef = {
    contentType: ContentType;
    slug: string;
    source?: string;
};

export type MangaProgress = {
    contentType: 'manga';
    chapterSlug: string;
    imagePage?: number;
    imageIndex?: number;
};

export type AnimeProgress = {
    contentType: 'anime';
    episodeSlug: string;
    positionMs?: number;
    durationMs?: number;
};

export type ContentProgress = MangaProgress | AnimeProgress;

export type UnifiedContentStats = {
    manga: {
        totalRead: number;
        totalReadingTimeMs: number;
        favorites: number;
    };
    anime: {
        totalWatched: number;
        totalWatchingTimeMs: number;
        favorites: number;
    };
};
