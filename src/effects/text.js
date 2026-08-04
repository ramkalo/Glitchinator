import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('text');
const blend = buildBlendControl('text');

const NAMED_TEXT_COLORS = {
    white:   'rgba(255,255,255,0.92)',
    black:   'rgba(0,0,0,0.92)',
    red:     '#ff4444',
    green:   '#44ff44',
    blue:    '#4488ff',
    cyan:    '#00ffff',
    yellow:  '#ffff00',
    magenta: '#ff44ff',
};

const BG_COLORS = {
    black:   '#000000',
    white:   '#ffffff',
    red:     '#ff0000',
    green:   '#00ff00',
    blue:    '#0000ff',
    cyan:    '#00ffff',
    yellow:  '#ffff00',
    magenta: '#ff00ff',
};

function seededRandom(seed, idx) {
    let h = ((seed * 2654435761) ^ (idx * 2246822519)) >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x45d9f3b) >>> 0;
    h ^= h >>> 16;
    return h / 0x100000000;
}

function mkRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

function hslToRgb(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h * 12) % 12;
        return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
    };
    return [f(0), f(8), f(4)];
}

function parseRgbStr(str) {
    const m = str.match(/\d+/g);
    return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
}

const BG_NOISE_KEYS = new Set(['greyNoise', 'colorNoise', 'paletteNoise']);

function fillQuadWithGrain(ctx, tlx, tly, trx, try_, brx, bry, blx, bly, bgKey, seed, palette, grainSize, opacity) {
    const minX = Math.floor(Math.min(tlx, trx, brx, blx));
    const minY = Math.floor(Math.min(tly, try_, bry, bly));
    const maxX = Math.ceil(Math.max(tlx, trx, brx, blx));
    const maxY = Math.ceil(Math.max(tly, try_, bry, bly));
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);

    const offscreen = new OffscreenCanvas(w, h);
    const offCtx    = offscreen.getContext('2d');
    const imgData   = offCtx.createImageData(w, h);
    const data      = imgData.data;
    const rng       = mkRng(seed ^ 0xdeadbeef);
    const gs        = Math.max(1, Math.round(grainSize));
    const cols      = Math.ceil(w / gs);
    const rows      = Math.ceil(h / gs);

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            let r, g, b;
            if (bgKey === 'greyNoise') {
                const v = Math.floor(rng() * 256);
                r = g = b = v;
            } else if (bgKey === 'colorNoise') {
                [r, g, b] = hslToRgb(rng(), 1, 0.55);
            } else if (bgKey === 'paletteNoise' && palette?.length) {
                [r, g, b] = parseRgbStr(palette[Math.floor(rng() * palette.length)]);
            } else {
                r = g = b = 0;
            }
            const px = col * gs, py = row * gs;
            for (let gy = 0; gy < gs && py + gy < h; gy++) {
                for (let gx = 0; gx < gs && px + gx < w; gx++) {
                    const idx = ((py + gy) * w + (px + gx)) * 4;
                    data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
                }
            }
        }
    }
    offCtx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.moveTo(tlx, tly);
    ctx.lineTo(trx, try_);
    ctx.lineTo(brx, bry);
    ctx.lineTo(blx, bly);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(offscreen, minX, minY);
    ctx.restore();
}

function samplePalette(srcCtx, seed, count = 64) {
    const W = srcCtx.canvas.width, H = srcCtx.canvas.height;
    const data = srcCtx.getImageData(0, 0, W, H).data;
    const palette = [];
    for (let i = 0; i < count; i++) {
        const px = Math.floor(seededRandom(seed, i * 2) * W);
        const py = Math.floor(seededRandom(seed, i * 2 + 1) * H);
        const off = (py * W + px) * 4;
        palette.push(`rgb(${data[off]},${data[off + 1]},${data[off + 2]})`);
    }
    return palette;
}

function resolveTextColor(key, rng, palette, customPalette) {
    if (key === 'paletteRandom' && customPalette) return customPalette[Math.floor(rng() * 8)];
    const palIdx = key.match(/^palette(\d)$/);
    if (palIdx && customPalette) return customPalette[+palIdx[1]] ?? 'rgba(255,255,255,0.92)';
    if (NAMED_TEXT_COLORS[key]) return NAMED_TEXT_COLORS[key];
    if (key === 'greyNoise') { const v = Math.floor(rng() * 256); return `rgb(${v},${v},${v})`; }
    if (key === 'colorNoise') return `hsl(${Math.floor(rng() * 360)},100%,55%)`;
    if (key === 'paletteNoise' && palette?.length) return palette[Math.floor(rng() * palette.length)];
    return 'rgba(255,255,255,0.92)';
}

function wrapLine(ctx, text, maxW) {
    if (!text) return [''];
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (cur && ctx.measureText(test).width > maxW) { lines.push(cur); cur = w; }
        else cur = test;
    }
    lines.push(cur);
    return lines;
}

export function applyText(ctx, p, srcCanvas) {
    const opacity = p.textCharAlpha ?? 1;

    const W = ctx.canvas.width;
    const H = ctx.canvas.height;

    const tlx  = (p.textTLx ?? 10) / 100 * W,  tly  = (p.textTLy ?? 65) / 100 * H;
    const trx  = (p.textTRx ?? 90) / 100 * W,  try_ = (p.textTRy ?? 65) / 100 * H;
    const brx  = (p.textBRx ?? 90) / 100 * W,  bry  = (p.textBRy ?? 95) / 100 * H;
    const blx  = (p.textBLx ?? 10) / 100 * W,  bly  = (p.textBLy ?? 95) / 100 * H;

    // Reference width = top edge length (used for word wrap and alignment math)
    const tw = Math.hypot(trx - tlx, try_ - tly);
    // Reference height = left edge length (used for vAlign)
    const th = Math.hypot(blx - tlx, bly - tly);
    if (tw < 1 || th < 1) return;

    const size  = p.textSize ?? 64;
    const lineH = size * (p.textLineHeight ?? 1.2);

    const variant = `${p.textItalic ? 'italic ' : ''}${p.textBold ? 'bold ' : ''}`;

    ctx.save();
    ctx.font = `${variant}${size}px ${p.textFont ?? "'JetBrains Mono', monospace"}`;
    ctx.textBaseline = 'top';

    // Word-wrap using top-edge width as the reference (measureText ignores transforms)
    const rawLines = (p.text ?? '').split('\n');
    let lines = [];
    if (p.textWrap !== false) {
        for (const rl of rawLines) lines.push(...wrapLine(ctx, rl, tw));
    } else {
        lines = rawLines;
    }
    if (!lines.length) lines = [''];

    const totalH = lines.length * lineH;
    const va = p.textVAlign ?? 'top';
    let startY = 0;
    if      (va === 'middle') startY = (th - totalH) / 2;
    else if (va === 'bottom') startY = th - totalH;

    const colorKey    = p.textColor ?? 'white';
    const bgKey       = p.textBg ?? 'none';
    const seed        = p.textNoiseSeed ?? 0;
    const needPalette = colorKey === 'paletteNoise' || bgKey === 'paletteNoise';
    const palette     = needPalette ? samplePalette(srcCanvas ? srcCanvas.getContext('2d') : ctx, seed) : null;
    let   noiseIdx    = 0;

    const outlineW    = p.textOutlineWidth ?? 2;
    const outlineKey  = p.textOutlineColor ?? 'auto';
    let   outNoiseIdx = 1000000; // separate noise counter for outline color

    // Background: fill the actual quad shape
    if (bgKey && bgKey !== 'none') {
        const bgOpacity = p.textBgOpacity ?? 0.88;
        const bgPaletteColor = (() => {
            if (!p._activePalette) return null;
            if (bgKey === 'paletteRandom') return p._activePalette[0];
            const m = bgKey.match(/^palette(\d)$/);
            return m ? (p._activePalette[+m[1]] ?? null) : null;
        })();
        if (BG_NOISE_KEYS.has(bgKey)) {
            fillQuadWithGrain(ctx, tlx, tly, trx, try_, brx, bry, blx, bly,
                bgKey, seed, palette, p.textBgGrainSize ?? 4, bgOpacity);
        } else if (bgPaletteColor) {
            ctx.save();
            ctx.globalAlpha = bgOpacity;
            ctx.fillStyle = bgPaletteColor;
            ctx.beginPath();
            ctx.moveTo(tlx, tly);
            ctx.lineTo(trx, try_);
            ctx.lineTo(brx, bry);
            ctx.lineTo(blx, bly);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        } else if (BG_COLORS[bgKey]) {
            ctx.save();
            ctx.globalAlpha = bgOpacity;
            ctx.fillStyle = BG_COLORS[bgKey];
            ctx.beginPath();
            ctx.moveTo(tlx, tly);
            ctx.lineTo(trx, try_);
            ctx.lineTo(brx, bry);
            ctx.lineTo(blx, bly);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    ctx.globalAlpha = opacity;
    ctx.lineWidth   = outlineW;

    // Rubber-sheet rendering: per-character bilinear Jacobian transform.
    // For each character at source position (u, v), the Jacobian of the bilinear
    // quad map gives the correct shear+scale to deform glyphs like a rubber sheet.
    const align   = p.textAlign ?? 'left';
    const kerning = p.textKerning ?? 0;
    const reverse = p.textReverse ?? false;

    for (let i = 0; i < lines.length; i++) {
        const line  = lines[i];
        const lineY = startY + i * lineH;
        const v     = lineY / th;

        let chars  = [...line];
        if (reverse) chars.reverse();
        const widths = chars.map(ch => ctx.measureText(ch).width);
        const lineW  = widths.reduce((s, w) => s + w, 0)
                     + Math.max(0, chars.length - 1) * kerning;

        let charX = 0;
        let justifyGap = 0;
        const isJustify = align === 'justify'
            && i < lines.length - 1
            && line.includes(' ');

        if (align === 'center') {
            charX = (tw - lineW) / 2;
        } else if (align === 'right') {
            charX = tw - lineW;
        } else if (isJustify) {
            const spaceCount = chars.filter(ch => ch === ' ').length;
            if (spaceCount > 0) justifyGap = (tw - lineW) / spaceCount;
        }

        for (let j = 0; j < chars.length; j++) {
            const ch    = chars[j];
            const charW = widths[j];
            const u     = charX / tw;

            // Bilinear output position P(u, v)
            const ox = (1 - u) * (1 - v) * tlx + u * (1 - v) * trx
                     + u * v * brx + (1 - u) * v * blx;
            const oy = (1 - u) * (1 - v) * tly + u * (1 - v) * try_
                     + u * v * bry + (1 - u) * v * bly;

            // Jacobian columns: horizontal and vertical tangent vectors
            const dPdu_x = (1 - v) * (trx - tlx) + v * (brx - blx);
            const dPdu_y = (1 - v) * (try_ - tly) + v * (bry - bly);
            const dPdv_x = (1 - u) * (blx - tlx) + u * (brx - trx);
            const dPdv_y = (1 - u) * (bly - tly) + u * (bry - try_);

            const fillColor = resolveTextColor(colorKey, () => seededRandom(seed, noiseIdx++), palette, p._activePalette);
            const strokeColor = outlineKey === 'auto'
                ? ((colorKey === 'black') ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)')
                : resolveTextColor(outlineKey, () => seededRandom(seed, outNoiseIdx++), palette, p._activePalette);

            ctx.save();
            ctx.fillStyle   = fillColor;
            ctx.strokeStyle = strokeColor;
            ctx.transform(
                dPdu_x / tw,  dPdu_y / tw,
                dPdv_x / th,  dPdv_y / th,
                ox, oy
            );

            if (outlineW > 0) ctx.strokeText(ch, 0, 0);
            ctx.fillText(ch, 0, 0);
            if (p.textStrike) {
                ctx.fillRect(0, size * 0.42, charW, Math.max(1, size * 0.06));
            }

            ctx.restore();

            charX += charW + kerning;
            if (isJustify && ch === ' ') charX += justifyGap;
        }
    }

    ctx.restore();
}

export const textEffect = {
    name: 'text',
    label: 'Text',
    kind: 'context',
    blendPrefix: 'text',
    bindUniforms: (gl, prog, p) => { fade.bindUniforms(gl, prog, p); blend.bindUniforms(gl, prog, p); },
    paramKeys: [
        'text', 'textFont', 'textSize', 'textBold', 'textItalic', 'textStrike', 'textLineHeight',
        'textReverse', 'textKerning',
        'textColor', 'textBg', 'textBgOpacity', 'textBgGrainSize',
        'textOutlineWidth', 'textOutlineColor',
        'textWrap', 'textAlign', 'textVAlign',
        'textTLx', 'textTLy', 'textTRx', 'textTRy',
        'textBRx', 'textBRy', 'textBLx', 'textBLy',
        'textCharAlpha', 'textNoiseSeed',
        ...fade.paramKeys,
        ...blend.paramKeys,
    ],
    handleParams: [
        'textTLx', 'textTLy', 'textTRx', 'textTRy', 'textBRx', 'textBRy', 'textBLx', 'textBLy',
        'textBoxLockAngles',
        ...fade.handleParams,
    ],
    // Shown after the stack-list label so several Text effects tell themselves apart.
    labelPreview: (p) => p.text,
    overlays: { fade: fade.overlay },
    params: {
        textEnabled:    { default: false, label: 'Enable' },
        text:           { default: 'DEC 31 1999 11:59:59', label: 'Text' },
        textFont:       { default: "'JetBrains Mono', monospace", label: 'Font', fontSelector: true, options: [
            ["'JetBrains Mono', monospace",  'JetBrains Mono'],
            ['monospace',                    'Monospace'],
            ["'Courier New', monospace",     'Courier New'],
            ["'Arial', sans-serif",          'Arial'],
            ["'Georgia', serif",             'Georgia'],
            ["'Times New Roman', serif",     'Times New Roman'],
            ['neogreekrunic',                'neogreekrunic'],
            ['splitbitsv2',                  'splitbitsv2'],
            ['quadramatic',                  'quadramatic'],
            ['Regulon18-Regular',            'Regulon18'],
            ['amazingdigital100acrewoods',   'AmazingDigital100AcreWoods'],
        ] },
        textSize:       { default: 128,  min: 8,   max: 1024, label: 'Size' },
        textBold:       { default: false, label: 'Bold' },
        textItalic:     { default: false, label: 'Italic' },
        textStrike:     { default: false, label: 'Strikethrough' },
        textLineHeight: { default: 1.2, min: 0.5, max: 3, step: 0.1, label: 'Line Height' },
        textReverse:    { default: false, label: 'Reverse' },
        textKerning:    { default: 0, min: -50, max: 200, step: 1, label: 'Kerning' },
        textColor:          { default: 'palette0', label: 'Color', type: 'paletteSelect', options: [
            ['palette0','Color Palette 1'], ['palette1','Color Palette 2'], ['palette2','Color Palette 3'],
            ['palette3','Color Palette 4'], ['palette4','Color Palette 5'], ['palette5','Color Palette 6'],
            ['palette6','Color Palette 7'], ['palette7','Color Palette 8'],
            ['paletteRandom','Palette Random'],
            ['greyNoise','Grey Noise'], ['colorNoise','Color Noise'],
            ['paletteNoise','Image Palette'],
        ] },
        textNoiseSeed:      { default: 0 },
        textNoiseRandomize: { default: null, label: 'Randomize' },
        textCharAlpha:      { default: 1, min: 0, max: 1, step: 0.01, label: 'Text Opacity' },
        textOutlineWidth:   { default: 2, min: 0, max: 20, step: 0.5, label: 'Outline Thiccness' },
        textOutlineColor:   { default: 'auto', label: 'Outline Color', type: 'paletteSelect', options: [
            ['auto','Auto'],
            ['palette0','Color Palette 1'], ['palette1','Color Palette 2'], ['palette2','Color Palette 3'],
            ['palette3','Color Palette 4'], ['palette4','Color Palette 5'], ['palette5','Color Palette 6'],
            ['palette6','Color Palette 7'], ['palette7','Color Palette 8'],
            ['paletteRandom','Palette Random'],
            ['greyNoise','Grey Noise'], ['colorNoise','Color Noise'],
            ['paletteNoise','Image Palette'],
        ] },
        textBg:         { default: 'none', label: 'Background', type: 'paletteSelect', options: [
            ['none','None'],
            ['palette0','Color Palette 1'], ['palette1','Color Palette 2'], ['palette2','Color Palette 3'],
            ['palette3','Color Palette 4'], ['palette4','Color Palette 5'], ['palette5','Color Palette 6'],
            ['palette6','Color Palette 7'], ['palette7','Color Palette 8'],
            ['paletteRandom','Palette Random'],
            ['greyNoise','Grey Noise'], ['colorNoise','Color Noise'],
            ['paletteNoise','Image Palette'],
        ] },
        textBgOpacity:    { default: 0.88, min: 0, max: 1, step: 0.01, label: 'BG Opacity' },
        textBgGrainSize:  { default: 4, min: 1, max: 50, step: 1, label: 'BG Grain Size' },
        textWrap:       { default: true,     label: 'Word Wrap' },
        textAlign:      { default: 'center', label: 'Justify', options: [['left','Left'], ['center','Center'], ['right','Right'], ['justify','Justify']] },
        textVAlign:     { default: 'middle', label: 'V-Align', options: [['top','Top'], ['middle','Middle'], ['bottom','Bottom']] },
        // All 4 corners stored independently (% of canvas W/H).
        // TL, TR, BR, BL — each corner only controls itself.
        textTLx:        { default: 10, label: 'TL X' },
        textTLy:        { default: 65, label: 'TL Y' },
        textTRx:        { default: 90, label: 'TR X' },
        textTRy:        { default: 65, label: 'TR Y' },
        textBRx:        { default: 90, label: 'BR X' },
        textBRy:        { default: 95, label: 'BR Y' },
        textBLx:        { default: 10, label: 'BL X' },
        textBLy:        { default: 95, label: 'BL Y' },
        textBoxReset:       { default: null,  label: 'Reset Box' },
        textBoxRightAngles: { default: null,  label: 'Right Angles' },
        // Rendered as the small lock toggle beside Right Angles, not as a checkbox.
        textBoxLockAngles:  { default: false, label: 'Lock Angles' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.textEnabled && !!p.text,
    uiGroups: [
        { keys: ['text', 'textFont', 'textSize', 'textBold', 'textItalic', 'textStrike', 'textLineHeight', 'textReverse', 'textKerning'] },
        { label: 'Color', keys: ['textColor', 'textNoiseRandomize', 'textCharAlpha', 'textOutlineWidth', 'textOutlineColor', 'textBg', 'textBgOpacity', 'textBgGrainSize'] },
        { label: 'Layout', keys: ['textWrap', 'textAlign', 'textVAlign'] },
        { label: 'Box', keys: ['textBoxReset', 'textBoxRightAngles'] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    canvas2d: applyText,
};
