export const normalizeProviderSource = (value?: string): 'zonatmo' | 'visormanga' | 'manhwaweb' | 'zonaikigai' => {
    const source = String(value || 'zonatmo').toLowerCase().trim();
    if (source === 'lectormangaa') return 'manhwaweb';
    if (source === 'visormanga') return 'visormanga';
    if (source === 'manhwaonline') return 'manhwaweb';
    if (source === 'manhwaweb') return 'manhwaweb';
    if (source === 'zonaikigai') return 'zonaikigai';
    return 'zonatmo';
};

// Front aliases to avoid exposing provider brand names in the UI.
export const getProviderAliasLabel = (value?: string) => {
    const source = normalizeProviderSource(value);
    if (source === 'zonatmo') return 'Luna Atlas';
    if (source === 'visormanga') return 'Neko Shelf';
    if (source === 'manhwaweb') return 'Kumo Verse';
    if (source === 'zonaikigai') return 'Yoru Realm';
    return 'Luna Atlas';
};
