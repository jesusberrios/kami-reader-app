export const normalizeProviderSource = (value?: string): 'zonatmo' | 'zonatmoorg' | 'manhwaweb' | 'animeflv' | 'jkanime' | 'animeytx' => {
    const source = String(value || 'zonatmo').toLowerCase().trim();
    if (source === 'lectormangaa') return 'manhwaweb';
    if (source === 'manhwaonline') return 'manhwaweb';
    if (source === 'manhwaweb') return 'manhwaweb';
    if (source === 'zonatmoorg') return 'zonatmoorg';
    if (source === 'animeflv') return 'animeflv';
    if (source === 'jkanime') return 'jkanime';
    if (source === 'animeytx') return 'animeytx';
    return 'zonatmo';
};

// Front aliases to avoid exposing provider brand names in the UI.
export const getProviderAliasLabel = (value?: string) => {
    const source = normalizeProviderSource(value);
    if (source === 'zonatmo') return 'Luna Atlas';
    if (source === 'zonatmoorg') return 'Nova Atlas';
    if (source === 'manhwaweb') return 'Kumo Verse';
    if (source === 'animeflv') return 'Hoshi Play';
    if (source === 'jkanime') return 'Kitsune Stream';
    if (source === 'animeytx') return 'Astra Wave';
    return 'Luna Atlas';
};
