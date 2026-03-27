export const normalizeProviderSource = (value?: string): 'zonatmo' | 'visormanga' | 'manhwaonline' => {
    const source = String(value || 'zonatmo').toLowerCase().trim();
    if (source === 'lectormangaa') return 'manhwaonline';
    if (source === 'visormanga') return 'visormanga';
    if (source === 'manhwaonline') return 'manhwaonline';
    return 'zonatmo';
};

// Front aliases to avoid exposing provider brand names in the UI.
export const getProviderAliasLabel = (value?: string) => {
    const source = normalizeProviderSource(value);
    if (source === 'visormanga') return 'Catalogo B';
    if (source === 'manhwaonline') return 'Catalogo C';
    return 'Catalogo A';
};
