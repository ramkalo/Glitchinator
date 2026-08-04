import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('matrixRain');
const blend = buildBlendControl('matrixRain');

// Seeded xorshift32 PRNG — deterministic per seed
function seededRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
        s ^= s << 13; s ^= s >> 17; s ^= s << 5;
        return (s >>> 0) / 4294967296;
    };
}

function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// --- Character pools ---

const LATIN_96 = (() => {
    let s = '';
    for (let i = 32; i < 127; i++) s += String.fromCharCode(i);
    return s;
})();

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const NUMERIC = '0123456789';
const ALPHANUMERIC = ALPHA + NUMERIC;

// --- Text mode processing → flat char array ---

function wordSpacedJoin(words, wordSpacing) {
    return words.join(' '.repeat(1 + wordSpacing));
}

function processText(p, count, rng) {
    // Always append a space so word-based modes have a natural gap when tiling
    const text  = (p.matrixRainText || '') + ' ';
    const mode  = p.matrixRainMode;
    const ws    = p.matrixRainWordSpacing | 0;
    const chars = [];

    if (mode === 'wordOrder') {
        const words = text.trim().split(/\s+/).filter(Boolean);
        const src   = words.length ? wordSpacedJoin(words, ws) + ' ' : text;
        for (let i = 0; i < count; i++) chars.push(src[i % src.length]);

    } else if (mode === 'spaceShuffle') {
        const contentStr = text.replace(/\s/g, '');
        if (!contentStr) { for (let i = 0; i < count; i++) chars.push(' '); return chars; }
        const words       = text.trim().split(/\s+/).filter(Boolean);
        const baseSpaces  = (text.match(/\s/g) ?? []).length;
        const extraSpaces = ws * Math.max(1, words.length - 1);
        const totalSpaces = baseSpaces + extraSpaces;
        const totalLen    = contentStr.length + totalSpaces;
        const spaceRatio  = totalSpaces / totalLen;
        let contentIdx = 0;
        for (let i = 0; i < count; i++) {
            if (rng() < spaceRatio) {
                chars.push(' ');
            } else {
                chars.push(contentStr[contentIdx % contentStr.length]);
                contentIdx++;
            }
        }

    } else if (mode === 'wordShuffle') {
        const words = text.trim().split(/\s+/).filter(Boolean);
        shuffle(words, rng);
        const src = wordSpacedJoin(words, ws) + ' ';
        for (let i = 0; i < count; i++) chars.push(src[i % src.length]);

    } else if (mode === 'randomFromContent') {
        // Include all chars, including spaces
        const unique = [...new Set(text.split(''))];
        if (!unique.length) unique.push(' ');
        for (let i = 0; i < count; i++) chars.push(unique[Math.floor(rng() * unique.length)]);

    } else if (mode === 'randomAlpha') {
        for (let i = 0; i < count; i++) chars.push(ALPHA[Math.floor(rng() * ALPHA.length)]);

    } else if (mode === 'randomNumeric') {
        for (let i = 0; i < count; i++) chars.push(NUMERIC[Math.floor(rng() * NUMERIC.length)]);

    } else if (mode === 'randomAlphanumeric') {
        for (let i = 0; i < count; i++) chars.push(ALPHANUMERIC[Math.floor(rng() * ALPHANUMERIC.length)]);

    } else { // randomExtended
        for (let i = 0; i < count; i++) chars.push(LATIN_96[Math.floor(rng() * LATIN_96.length)]);
    }

    return chars;
}

function applyInject(chars, p, rng) {
    if (!p.matrixRainInjectEnabled) return;
    const pct = p.matrixRainInjectPercent / 100;
    for (let i = 0; i < chars.length; i++) {
        if (rng() < pct) chars[i] = LATIN_96[Math.floor(rng() * LATIN_96.length)];
    }
}

// Randomly replaces `count` cells with space characters — works on any mode
function applySpaceInject(chars, count, rng) {
    const n = Math.min(count | 0, chars.length);
    for (let i = 0; i < n; i++) {
        chars[Math.floor(rng() * chars.length)] = ' ';
    }
}

// --- Color resolution ---

const NAMED_COLORS = {
    red: '#f00', green: '#0f0', blue: '#00f',
    cyan: '#0ff', yellow: '#ff0', magenta: '#f0f',
    black: '#000', white: '#fff',
};

function isNoiseColor(colorKey) {
    return colorKey === 'greyNoise' || colorKey === 'colorNoise' || colorKey === 'imagePaletteNoise';
}

function resolveColor(colorKey, x, y, rng, imageCtx, customPalette) {
    if (colorKey === 'paletteRandom' && customPalette) return customPalette[Math.floor(rng() * 8)];
    const palIdx = colorKey.match(/^palette(\d)$/);
    if (palIdx && customPalette) return customPalette[+palIdx[1]] ?? '#0f0';
    if (NAMED_COLORS[colorKey]) return NAMED_COLORS[colorKey];
    if (colorKey === 'greyNoise') {
        const v = Math.floor(rng() * 256);
        return `rgb(${v},${v},${v})`;
    }
    if (colorKey === 'colorNoise') {
        return `hsl(${Math.floor(rng() * 360)},100%,50%)`;
    }
    if (colorKey === 'imagePaletteNoise' && imageCtx) {
        try {
            const data = imageCtx.getImageData(x, y, 4, 4).data;
            const pick = Math.floor(rng() * 16) * 4;
            return `rgb(${data[pick]},${data[pick + 1]},${data[pick + 2]})`;
        } catch { return '#0f0'; }
    }
    if (colorKey === 'imagePaletteRandom' && imageCtx) {
        try {
            const rx = Math.floor(rng() * imageCtx.canvas.width);
            const ry = Math.floor(rng() * imageCtx.canvas.height);
            const data = imageCtx.getImageData(rx, ry, 1, 1).data;
            return `rgb(${data[0]},${data[1]},${data[2]})`;
        } catch { return '#0f0'; }
    }
    return '#0f0';
}

// --- Main canvas2d function ---

function applyMatrixRain(ctx, p, srcCanvas) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    const size         = p.matrixRainSize;
    const charSpacing  = p.matrixRainCharSpacing;
    const lineSpacing  = p.matrixRainLineSpacing;
    const direction    = p.matrixRainDirection;
    const order        = p.matrixRainOrder;
    const font         = p.matrixRainFont;
    const opacity      = p.matrixRainCharOpacity / 100;
    const colorKey  = p.matrixRainColor;

    const charStep = size + charSpacing;  // along flow direction
    const lineStep = size + lineSpacing;  // perpendicular to flow

    // Center of the text grid, offset by the position handle
    const centerX = (0.5 + p.matrixRainX / 100) * w;
    const centerY = (0.5 - p.matrixRainY / 100) * h;

    // Over-generate cells (+2) so the grid covers the canvas even when offset
    let cols, rows;
    if (direction === 'columns') {
        cols = Math.max(1, Math.ceil(w / lineStep) + 2);
        rows = Math.max(1, Math.ceil(h / charStep) + 2);
    } else {
        cols = Math.max(1, Math.ceil(w / charStep) + 2);
        rows = Math.max(1, Math.ceil(h / lineStep) + 2);
    }

    const gridW = direction === 'columns' ? cols * lineStep : cols * charStep;
    const gridH = direction === 'columns' ? rows * charStep : rows * lineStep;
    const startX = centerX - gridW / 2;
    const startY = centerY - gridH / 2;

    const totalCells = cols * rows;

    const textSeed   = (p.matrixRainInjectSeed * 31337) ^ (p.matrixRainMode.length * 7919);
    const rngText    = seededRng(textSeed);
    const rngInject  = seededRng(p.matrixRainInjectSeed);
    const rngSpaces  = seededRng(p.matrixRainInjectSeed ^ 0x5EEDED);
    const rngColor   = seededRng(p.matrixRainInjectSeed ^ 0xDEADBEEF);

    let chars = processText(p, totalCells, rngText);
    applyInject(chars, p, rngInject);
    applySpaceInject(chars, p.matrixRainSpaceInject, rngSpaces);
    if (order === 'reverse') chars = chars.reverse();

    // Save original image pixels for imagePaletteNoise sampling.
    // Use srcCanvas (pre-effect pipeline state) when available; fall back to copying ctx.canvas.
    let savedCanvas = null;
    if (colorKey === 'imagePaletteNoise' || colorKey === 'imagePaletteRandom') {
        if (srcCanvas) {
            savedCanvas = srcCanvas;
        } else {
            savedCanvas = new OffscreenCanvas(w, h);
            savedCanvas.getContext('2d').drawImage(ctx.canvas, 0, 0);
        }
    }
    const imageCtx = savedCanvas ? savedCanvas.getContext('2d') : null;

    // Map linear index → screen (x, y)
    // columns: fill each column top-to-bottom, then advance to next column
    // rows:    fill each row left-to-right, then advance to next row
    function cellXY(i) {
        let col, row;
        if (direction === 'columns') {
            col = Math.floor(i / rows);
            row = i % rows;
        } else {
            col = i % cols;
            row = Math.floor(i / cols);
        }
        const x = startX + (direction === 'columns' ? col * lineStep : col * charStep);
        const y = startY + (direction === 'columns' ? row * charStep : row * lineStep);
        return [x, y];
    }

    ctx.save();
    ctx.font = `${size}px ${font}`;
    ctx.textBaseline = 'top';

    ctx.globalAlpha = opacity;
    for (let i = 0; i < totalCells; i++) {
        const [x, y] = cellXY(i);
        const color = resolveColor(colorKey, x, y, rngColor, imageCtx, p._activePalette);
        ctx.fillStyle = color;
        ctx.fillText(chars[i], x, y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
}

export const matrixRainEffect = {
    name: 'matrixRain',
    label: 'Matrix Rain',
    kind: 'context',
    blendPrefix: 'matrixRain',
    bindUniforms: (gl, prog, p) => { fade.bindUniforms(gl, prog, p); blend.bindUniforms(gl, prog, p); },

    paramKeys: [...fade.paramKeys, ...blend.paramKeys],
    handleParams: ['matrixRainX', 'matrixRainY', ...fade.handleParams],
    overlays: { fade: fade.overlay },

    uiGroups: [
        { label: 'Text',     keys: ['matrixRainText', 'matrixRainMode'] },
        { label: 'Inject',   keys: ['matrixRainInjectEnabled', 'matrixRainInjectPercent', 'matrixRainInjectSeed', 'matrixRainSpaceInject'] },
        { label: 'Layout',   keys: ['matrixRainDirection', 'matrixRainOrder', 'matrixRainSize', 'matrixRainCharSpacing', 'matrixRainLineSpacing', 'matrixRainWordSpacing', 'matrixRainFont'] },
        { label: 'Color',    keys: ['matrixRainColor', 'matrixRainCharOpacity'] },
        blend.uiGroup,
        fade.uiGroup,
    ],

    params: {
        matrixRainEnabled:       { default: false, label: 'Enable' },

        matrixRainText:          { default: 'You show me a capitalist, and I will show you a bloodsucker - Malcolm X', label: 'Text' },
        matrixRainMode:          { default: 'wordOrder', label: 'Mode', options: [
            ['wordOrder',         'Word Order'],
            ['spaceShuffle',      'Space Shuffle'],
            ['wordShuffle',       'Word Shuffle'],
            ['randomFromContent', 'Random from Content'],
            ['randomAlpha',       'Random Alpha'],
            ['randomNumeric',     'Random Numeric'],
            ['randomAlphanumeric','Random Alphanumeric'],
            ['randomExtended',    'Random Extended (96)'],
        ] },

        matrixRainInjectEnabled: { default: false, label: 'Enable Inject' },
        matrixRainInjectPercent: { default: 20, min: 0, max: 100, label: 'Inject %' },
        matrixRainInjectSeed:    { default: 1,                     label: 'Inject Seed' },
        matrixRainSpaceInject:   { default: 0, min: 0, max: 1000,  label: 'Inject Spaces' },

        matrixRainDirection:     { default: 'rows', label: 'Direction', options: [['columns', 'Columns'], ['rows', 'Rows']] },
        matrixRainOrder:         { default: 'forward', label: 'Order', options: [['forward', 'Forward'], ['reverse', 'Reverse']] },
        matrixRainSize:          { default: 160, min: 4,   max: 800, label: 'Size' },
        matrixRainCharSpacing:   { default: 0,   min: -20, max: 100, label: 'Char Spacing' },
        matrixRainLineSpacing:   { default: 0,   min: -20, max: 100, label: 'Line Spacing' },
        matrixRainWordSpacing:   { default: 0,   min: 0,   max: 20,  label: 'Word Spacing' },
        matrixRainFont:          { default: 'monospace', label: 'Font', fontSelector: true, options: [
            ['monospace',                   'Monospace'],
            ["'Courier New', monospace",    'Courier New'],
            ["'JetBrains Mono', monospace", 'JetBrains Mono'],
            ["'Arial', sans-serif",         'Arial'],
            ["'Georgia', serif",            'Georgia'],
            ["'Times New Roman', serif",    'Times New Roman'],
            ['neogreekrunic',               'neogreekrunic'],
            ['splitbitsv2',                 'splitbitsv2'],
            ['quadramatic',                 'quadramatic'],
            ['Regulon18-Regular',           'Regulon18'],
            ['amazingdigital100acrewoods',   'AmazingDigital100AcreWoods'],
        ] },

        matrixRainX:             { default: 0, min: -50, max: 50, label: 'X' },
        matrixRainY:             { default: 0, min: -50, max: 50, label: 'Y' },

        matrixRainColor:         { default: 'palette0', label: 'Color', type: 'paletteSelect', options: [
            ['palette0','Color Palette 1'], ['palette1','Color Palette 2'], ['palette2','Color Palette 3'],
            ['palette3','Color Palette 4'], ['palette4','Color Palette 5'], ['palette5','Color Palette 6'],
            ['palette6','Color Palette 7'], ['palette7','Color Palette 8'],
            ['paletteRandom','Palette Random'],
            ['greyNoise',           'Greyscale Noise'],
            ['colorNoise',          'Color Noise'],
            ['imagePaletteNoise',   'Image Palette Inside'],
            ['imagePaletteRandom',  'Image Palette Noise'],
        ] },
        matrixRainCharOpacity:       { default: 100, min: 0, max: 100, label: 'Opacity' },
        ...fade.params,
        ...blend.params,
    },

    enabled(p) { return p.matrixRainEnabled; },

    canvas2d: applyMatrixRain,
};
