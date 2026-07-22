const PALETTE_PRESETS = {
    monokai: {
        palette0: '#272822', palette1: '#f8f8f2', palette2: '#f92672',
        palette3: '#a6e22e', palette4: '#e6db74', palette5: '#75715e',
        palette6: '#66d9ef', palette7: '#fd971f',
    },
    dracula: {
        palette0: '#282a36', palette1: '#f8f8f2', palette2: '#ff79c6',
        palette3: '#50fa7b', palette4: '#f1fa8c', palette5: '#6272a4',
        palette6: '#ff5555', palette7: '#ffb86c',
    },
    solarizedDark: {
        palette0: '#002b36', palette1: '#839496', palette2: '#d33682',
        palette3: '#268bd2', palette4: '#2aa198', palette5: '#586e75',
        palette6: '#b58900', palette7: '#cb4b16',
    },
    oneDark: {
        palette0: '#282c34', palette1: '#abb2bf', palette2: '#c678dd',
        palette3: '#61afef', palette4: '#98c379', palette5: '#5c6370',
        palette6: '#e06c75', palette7: '#d19a66',
    },
    nord: {
        palette0: '#2e3440', palette1: '#d8dee9', palette2: '#81a1c1',
        palette3: '#88c0d0', palette4: '#a3be8c', palette5: '#4c566a',
        palette6: '#bf616a', palette7: '#ebcb8b',
    },
    gruvbox: {
        palette0: '#282828', palette1: '#ebdbb2', palette2: '#fb4934',
        palette3: '#8ec07c', palette4: '#b8bb26', palette5: '#928374',
        palette6: '#fabd2f', palette7: '#83a598',
    },
    catppuccinMocha: {
        palette0: '#1e1e2e', palette1: '#cdd6f4', palette2: '#cba6f7',
        palette3: '#89b4fa', palette4: '#a6e3a1', palette5: '#6c7086',
        palette6: '#f38ba8', palette7: '#fab387',
    },
    embark: {
        palette0: '#1e1c31', palette1: '#cbe3e7', palette2: '#f02e6e',
        palette3: '#91ddff', palette4: '#a1efd3', palette5: '#585273',
        palette6: '#d4bfff', palette7: '#f2b482',
    },
    basic: {
        palette0: '#ff0000', palette1: '#00ff00', palette2: '#0000ff',
        palette3: '#00ffff', palette4: '#ffff00', palette5: '#ff00ff',
        palette6: '#000000', palette7: '#ffffff',
    },
};

export const colorPaletteEffect = {
    name: 'colorPalette',
    label: 'Color Palette',
    kind: 'glsl',
    params: {
        paletteEnabled: { default: true, label: 'Enable' },
        palettePreset: {
            default: 'custom',
            label: 'Preset',
            options: [
                ['custom',       'Custom'],
                ['monokai',      'Monokai'],
                ['dracula',      'Dracula'],
                ['solarizedDark','Solarized Dark'],
                ['oneDark',      'One Dark'],
                ['nord',         'Nord'],
                ['gruvbox',      'Gruvbox Dark'],
                ['catppuccinMocha', 'Catppuccin Mocha'],
                ['embark',       'Embark'],
                ['basic',        'Basic RGBCYMKW'],
            ],
        },
        paletteRandomize: { default: null, label: 'Randomize All Colors' },
        // "Pull From <region>" — samples the image feeding this instance.
        paletteFromImage: { default: null, label: 'Pull' },
        paletteFromImageMode: {
            default: 'whole',
            hidden: true,
            options: [
                ['whole',     'Whole Image'],
                ['perimeter', 'Perimeter'],
                ['center',    'Center'],
                ['target',    'Target'],
            ],
        },
        paletteTargetX: { default: 0.3, hidden: true },
        paletteTargetY: { default: 0.3, hidden: true },
        paletteTargetW: { default: 0.4, hidden: true },
        paletteTargetH: { default: 0.4, hidden: true },
        palette0: { default: '#ff0000', label: 'Color 1', type: 'color' },
        palette1: { default: '#ff8800', label: 'Color 2', type: 'color' },
        palette2: { default: '#ffff00', label: 'Color 3', type: 'color' },
        palette3: { default: '#00ff00', label: 'Color 4', type: 'color' },
        palette4: { default: '#00ffff', label: 'Color 5', type: 'color' },
        palette5: { default: '#0088ff', label: 'Color 6', type: 'color' },
        palette6: { default: '#ff00ff', label: 'Color 7', type: 'color' },
        palette7: { default: '#ffffff', label: 'Color 8', type: 'color' },
        paletteSortByLuminance: { default: null, label: 'Sort by Luminance' },
        paletteCopyHex:      { default: null, label: 'Copy Hex' },
        palettePaste:        { default: null, label: 'Paste Hex' },
        paletteLoadImage:    { default: null, label: 'Load Palette Image' },
        palettePullFromImage:{ default: null, label: 'Pull from Palette Image' },
        // Hidden backup of custom colors — preserved when switching to a named preset,
        // restored when switching back to Custom.
        paletteCustom0: { default: null },
        paletteCustom1: { default: null },
        paletteCustom2: { default: null },
        paletteCustom3: { default: null },
        paletteCustom4: { default: null },
        paletteCustom5: { default: null },
        paletteCustom6: { default: null },
        paletteCustom7: { default: null },
    },
    paramActions: {
        palettePreset: (value, currentParams, prevValue) => {
            if (value === 'custom') {
                // Restore backed-up custom colors (if a backup exists)
                const restore = {};
                for (let i = 0; i < 8; i++) {
                    const saved = currentParams[`paletteCustom${i}`];
                    if (saved) restore[`palette${i}`] = saved;
                }
                return restore;
            }
            // Switching to a named preset — back up the current custom colors first
            const result = { ...(PALETTE_PRESETS[value] ?? {}) };
            if (prevValue === 'custom') {
                for (let i = 0; i < 8; i++) {
                    result[`paletteCustom${i}`] = currentParams[`palette${i}`];
                }
            }
            return result;
        },
    },
    enabled: (p) => p.paletteEnabled,
    uiGroups: [
        { label: 'Preset Palette',        keys: ['palettePreset', 'paletteRandomize'] },
        { label: 'Color from Image',      keys: ['paletteFromImage'] },
        { label: 'Colors',                keys: [...Array.from({ length: 8 }, (_, i) => `palette${i}`), 'paletteSortByLuminance'] },
        { label: 'Batch Hex Update',      keys: ['paletteCopyHex', 'palettePaste'] },
        { label: 'External Image Palette', keys: ['paletteLoadImage', 'palettePullFromImage'] },
    ],
    glsl: `void main() { fragColor = texture(uTex, vUV); }`,
};
