import { buildFadeControl, buildBlendControl } from './controls/index.js';
import { resolveColorKey, STANDARD_COLOR_OPTIONS } from './colorOptions.js';
import { uploadToTexture } from '../renderer/webgl.js';

const fade  = buildFadeControl('halftone');
const blend = buildBlendControl('halftone');

const OPTIONAL_COLOR_OPTIONS = [['none', 'None'], ...STANDARD_COLOR_OPTIONS];

const MODE_CODES  = { linear: 0, concentric: 1, dynamic: 2 };
const SHAPE_CODES = { circle: 0, diamond: 1, ascii: 2 };
const CURVE_CODES = { linear: 0, exp: 1, log: 2 };

export const halftoneMode = (p) => p.halftoneMode ?? 'linear';

// --- Glyph atlas (ASCII shape) ----------------------------------------------
// The two character strings are baked into a single grid texture, low chars
// first then high chars, so the shader can pick a glyph from the gradient/
// luminance parameter t and blend from the "minimum" set to the "maximum" set
// across it. Cached by string+font so the texture is rebuilt only on change.
let _atlas = { key: null, tex: null, cols: 0, rows: 0, lowCount: 0, highCount: 0 };

function getAtlas(gl, low, high, font) {
    const lowArr  = [...(low  || '')];
    const highArr = [...(high || '')];
    const chars   = [...lowArr, ...highArr];
    const key = `${font}\x00${low}\x00${high}`;
    if (_atlas.key === key && _atlas.tex) return _atlas;
    if (_atlas.tex) gl.deleteTexture(_atlas.tex);

    if (chars.length === 0) {
        _atlas = { key, tex: null, cols: 0, rows: 0, lowCount: 0, highCount: 0 };
        return _atlas;
    }

    const CELL = 64;
    const cols = Math.ceil(Math.sqrt(chars.length));
    const rows = Math.ceil(chars.length / cols);
    const cv   = new OffscreenCanvas(cols * CELL, rows * CELL);
    const ctx  = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle    = '#ffffff';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(CELL * 0.8)}px ${font}`;
    for (let i = 0; i < chars.length; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        ctx.fillText(chars[i], c * CELL + CELL / 2, r * CELL + CELL / 2);
    }
    const tex = uploadToTexture(cv);
    _atlas = { key, tex, cols, rows, lowCount: lowArr.length, highCount: highArr.length };
    return _atlas;
}

// --- Color resolution --------------------------------------------------------
function hexToRgb01(hex) {
    const n = parseInt((hex || '#ffffff').replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const htRgb = (key, palette, fallback) => hexToRgb01(resolveColorKey(key, palette) ?? fallback);

const clampNum = (v, lo, hi, def) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
};

function halftoneBindUniforms(gl, prog, p) {
    const locs = prog._locs;
    const setI  = (k, v) => { if (locs[k] != null) gl.uniform1i(locs[k], v); };
    const setF  = (k, v) => { if (locs[k] != null) gl.uniform1f(locs[k], v); };
    const set2f = (k, a, b) => { if (locs[k] != null) gl.uniform2f(locs[k], a, b); };
    const set3v = (k, a) => { if (locs[k] != null) gl.uniform3fv(locs[k], a); };

    setI('htMode',  MODE_CODES[halftoneMode(p)] ?? 0);
    setI('htShape', SHAPE_CODES[p.halftoneShape ?? 'circle'] ?? 0);
    setI('htCurve', CURVE_CODES[p.halftoneCurve ?? 'linear'] ?? 0);

    // Gradient axis + origin, mirroring the Color Gel convention: the center is
    // stored as a fraction of the resolution, y-down, and the shader flips y.
    setF('htAngle', clampNum(p.halftoneAngle, -180, 180, 45) * Math.PI / 180);
    set2f('htCenter', 0.5 + clampNum(p.halftoneCenterX, -50, 50, 0) / 100,
                      0.5 - clampNum(p.halftoneCenterY, -50, 50, 0) / 100);

    const pal = p._activePalette;
    const dotLow  = htRgb(p.halftoneColor, pal, '#000000');
    const dotHigh = (p.halftoneColorHigh && p.halftoneColorHigh !== 'none')
        ? htRgb(p.halftoneColorHigh, pal, '#000000') : dotLow;
    set3v('htDotColor',     dotLow);
    set3v('htDotColorHigh', dotHigh);
    set3v('htBgColor',  htRgb(p.halftoneBgColor, pal, '#ffffff'));

    // Luminance remap stops (dynamic mode). Kept sorted by the stop slider.
    setF('htLumLow',  clampNum(p.halftoneLumLow,  0, 1, 0));
    setF('htLumMid',  clampNum(p.halftoneLumMid,  0, 1, 0.5));
    setF('htLumHigh', clampNum(p.halftoneLumHigh, 0, 1, 1));

    // Glyph atlas — only rebuilt/bound in ASCII mode.
    if ((p.halftoneShape ?? 'circle') === 'ascii') {
        const a = getAtlas(gl, p.halftoneAsciiLow, p.halftoneAsciiHigh, p.halftoneFont || 'monospace');
        if (a.tex && (a.lowCount + a.highCount) > 0) {
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, a.tex);
            setI('htAtlas', 3);
            setI('htAtlasCols', a.cols);
            setI('htAtlasRows', a.rows);
            setI('htLowCount',  a.lowCount);
            setI('htHighCount', a.highCount);
            setI('htHasAtlas',  1);
        } else {
            setI('htHasAtlas', 0);
        }
    } else {
        setI('htHasAtlas', 0);
    }

    fade.bindUniforms(gl, prog, p);
    blend.bindUniforms(gl, prog, p);
}

export const halftoneEffect = {
    name:  'halftone',
    label: 'Halftone',
    kind:  'glsl',
    // Angle + center are driven by the canvas overlay; the luminance stops by the
    // stop slider — all hidden from the generic controls panel.
    handleParams: ['halftoneAngle', 'halftoneCenterX', 'halftoneCenterY',
        'halftoneLumLow', 'halftoneLumMid', 'halftoneLumHigh', ...fade.handleParams],
    overlays: {},
    // Numeric/boolean render params auto-bind to like-named uniforms. Selects,
    // colors, angle/center and the atlas are bound manually above.
    paramKeys: [
        'halftoneSizeMax', 'halftoneSizeMin', 'halftoneSpaceMax', 'halftoneSpaceMin',
        'halftoneSizeHigh', 'halftoneSizeLow', 'halftoneSpaceHigh', 'halftoneSpaceLow',
        'halftoneLumBlobs', 'halftoneBgAlpha', 'halftoneFlipLum',
        ...fade.paramKeys, ...blend.paramKeys,
    ],
    uiGroups: (p) => {
        const mode  = halftoneMode(p);
        const shape = p.halftoneShape ?? 'circle';
        const keys  = ['halftoneMode', 'halftoneShape', 'halftoneColor', 'halftoneColorHigh',
                       'halftoneBgColor', 'halftoneBgAlpha', 'halftoneCurve'];
        if (mode === 'dynamic') {
            keys.push('halftoneSizeLow', 'halftoneSizeHigh',
                      'halftoneSpaceLow', 'halftoneSpaceHigh',
                      'halftoneLumBlobs', 'halftoneFlipLum');
        } else {
            keys.push('halftoneSizeMin', 'halftoneSizeMax',
                      'halftoneSpaceMin', 'halftoneSpaceMax');
        }
        if (shape === 'ascii') {
            keys.push('halftoneAsciiLow', 'halftoneAsciiHigh', 'halftoneFont');
        }
        return [{ keys }, blend.uiGroup, fade.uiGroup];
    },
    params: {
        halftoneEnabled:  { default: false, label: 'Enable' },
        halftoneMode:     { default: 'linear', label: 'Mode', options: [
            ['linear', 'Linear Gradient'], ['concentric', 'Concentric Gradient'], ['dynamic', 'Dynamic'],
        ] },
        halftoneShape:    { default: 'circle', label: 'Shape', options: [
            ['circle', 'Circle'], ['diamond', 'Diamond'], ['ascii', 'ASCII'],
        ] },
        halftoneColor:     { default: 'palette0', type: 'paletteSelect', options: STANDARD_COLOR_OPTIONS, label: 'Dot Color (Low)' },
        halftoneColorHigh: { default: 'none',     type: 'paletteSelect', options: OPTIONAL_COLOR_OPTIONS, label: 'Dot Color (High)' },
        halftoneBgColor:  { default: 'palette7', type: 'paletteSelect', options: STANDARD_COLOR_OPTIONS, label: 'Background' },
        halftoneBgAlpha:  { default: 0, min: 0, max: 100, label: 'BG Transparency' },
        halftoneCurve:    { default: 'linear', label: 'Gradient', options: [
            ['linear', 'Linear'], ['exp', 'Exponential'], ['log', 'Logarithmic'],
        ] },

        // Linear & concentric extremes (t = 0 → min, t = 1 → max)
        halftoneSizeMin:   { default: 2,  min: 0, max: 200, label: 'Min Dot Size' },
        halftoneSizeMax:   { default: 20, min: 0, max: 200, label: 'Max Dot Size' },
        halftoneSpaceMin:  { default: 8,  min: 2, max: 400, label: 'Min Spacing' },
        halftoneSpaceMax:  { default: 40, min: 2, max: 400, label: 'Max Spacing' },

        // Dynamic (luminance-driven) extremes
        halftoneSizeLow:   { default: 20, min: 0, max: 200, label: 'Dot Size (Low Lum)' },
        halftoneSizeHigh:  { default: 2,  min: 0, max: 200, label: 'Dot Size (High Lum)' },
        halftoneSpaceLow:  { default: 24, min: 2, max: 400, label: 'Spacing (Low Lum)' },
        halftoneSpaceHigh: { default: 24, min: 2, max: 400, label: 'Spacing (High Lum)' },
        halftoneLumBlobs:  { default: 20, min: 0, max: 100, label: 'Luminance Blobs' },
        halftoneFlipLum:   { default: false, label: 'Flip Luminance' },

        // Luminance remap stops (dynamic) — driven by the stop slider.
        halftoneLumLow:    { default: 0 },
        halftoneLumMid:    { default: 0.5 },
        halftoneLumHigh:   { default: 1 },
        // Fixed grayscale shades the stop slider shows on its three handles.
        halftoneLumShade0: { default: 'bk', hidden: true },
        halftoneLumShade1: { default: 'gr', hidden: true },
        halftoneLumShade2: { default: 'w',  hidden: true },

        // Placement (overlay-driven)
        halftoneAngle:    { default: 45, min: -180, max: 180, label: 'Angle' },
        halftoneCenterX:  { default: 0, min: -50, max: 50 },
        halftoneCenterY:  { default: 0, min: -50, max: 50 },

        // ASCII
        halftoneAsciiLow:  { default: '.,:', label: 'Chars (Low / Min)' },
        halftoneAsciiHigh: { default: '@#%', label: 'Chars (High / Max)' },
        halftoneFont:      { default: 'monospace', label: 'Font', fontSelector: true, options: [
            ['monospace',                   'Monospace'],
            ["'Courier New', monospace",    'Courier New'],
            ["'JetBrains Mono', monospace", 'JetBrains Mono'],
            ["'Arial', sans-serif",         'Arial'],
            ["'Georgia', serif",            'Georgia'],
            ["'Times New Roman', serif",    'Times New Roman'],
        ] },

        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.halftoneEnabled,
    bindUniforms: halftoneBindUniforms,
    glsl: `
uniform int   htMode;      // 0 linear, 1 concentric, 2 dynamic
uniform int   htShape;     // 0 circle, 1 diamond, 2 ascii
uniform int   htCurve;     // 0 linear, 1 exp, 2 log
uniform float htAngle;     // radians
uniform vec2  htCenter;    // gradient origin, fraction of resolution, y-down
uniform vec3  htDotColor;
uniform vec3  htDotColorHigh;
uniform vec3  htBgColor;
uniform float halftoneBgAlpha;   // 0..100

uniform float halftoneSizeMin, halftoneSizeMax, halftoneSpaceMin, halftoneSpaceMax;
uniform float halftoneSizeLow, halftoneSizeHigh, halftoneSpaceLow, halftoneSpaceHigh;
uniform float halftoneLumBlobs;
uniform int   halftoneFlipLum;

uniform float htLumLow, htLumMid, htLumHigh;

uniform sampler2D htAtlas;
uniform int   htAtlasCols, htAtlasRows, htLowCount, htHighCount, htHasAtlas;

${fade.glsl}
${blend.glsl}

// Curve shaping of the 0..1 gradient parameter.
float htShapeT(float t) {
    t = clamp(t, 0.0, 1.0);
    if (htCurve == 1) return t * t;      // exponential (ease-in)
    if (htCurve == 2) return sqrt(t);    // logarithmic (ease-out)
    return t;                            // linear
}

// Piecewise luminance remap: low->0, mid->0.5, high->1.
float htRemapLum(float v) {
    if (v <= htLumLow)  return 0.0;
    if (v >= htLumHigh) return 1.0;
    if (v <  htLumMid)  return 0.5 * (v - htLumLow) / max(1e-4, htLumMid - htLumLow);
    return 0.5 + 0.5 * (v - htLumMid) / max(1e-4, htLumHigh - htLumMid);
}

float htLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Regional (low-frequency) luminance so dynamic spacing stays coherent. The
// Blobs slider grows the sampling radius; a small box of taps keeps it cheap.
float htRegionalLum(vec2 uv) {
    float radius = (halftoneLumBlobs / 100.0) * 0.06;   // fraction of the image
    if (radius < 1e-4) return htLuma(texture(uTex, uv).rgb);
    float sum = 0.0, wsum = 0.0;
    for (int j = -2; j <= 2; j++) {
        for (int i = -2; i <= 2; i++) {
            vec2 o = vec2(float(i), float(j)) * 0.5 * radius;
            sum  += htLuma(texture(uTex, uv + o).rgb);
            wsum += 1.0;
        }
    }
    return sum / wsum;
}

// Coherent cell index along a gradient whose spacing varies with t: the running
// count of cells is the integral of cell frequency (1/S) from 0 to t. Because
// every fragment evaluates the same integral, they all agree on where each dot
// sits — dividing the raw coordinate by a varying S instead would shear the
// cells and elongate the dots. Returns the count in units of the t-axis length
// (multiply by the axis' pixel length for a pixel-consistent index).
float htCellIndex(float t, float smin, float smax) {
    const int STEPS = 24;
    float dt = t / float(STEPS);
    float acc = 0.0;
    for (int i = 0; i < STEPS; i++) {
        float tt = (float(i) + 0.5) * dt;
        acc += 1.0 / max(1.0, mix(smin, smax, htShapeT(tt)));
    }
    return acc * dt;
}

void main() {
    vec4 c = texture(uTex, vUV);

    const float PI = 3.14159265;

    // y-down pixel position, the gradient parameter t, and the coherent cell
    // fraction f (both components in [-0.5, 0.5], isotropic so dots stay round).
    vec2 pix = vec2(vUV.x, 1.0 - vUV.y) * uResolution;
    float t, S, D, u;
    vec2  f;
    int   cellIdx;

    if (htMode == 2) {
        // dynamic: low-frequency luminance keeps a plain lattice coherent
        float lum = htRegionalLum(vUV);
        t = htRemapLum(lum);
        if (halftoneFlipLum == 1) t = 1.0 - t;
        u = htShapeT(t);
        S = max(1.0, mix(halftoneSpaceLow, halftoneSpaceHigh, u));
        D = mix(halftoneSizeLow, halftoneSizeHigh, u);
        f = fract(pix / S) - 0.5;
        cellIdx = int(floor(pix.x / S));
    } else if (htMode == 0) {
        // linear: lattice aligned to the axis, spacing warped along it
        vec2 n    = vec2(cos(htAngle), -sin(htAngle));   // y-down
        vec2 perp = vec2(-n.y, n.x);
        vec2 rel  = pix - htCenter * uResolution;
        float a   = dot(rel, n);
        float b   = dot(rel, perp);
        float TT  = max(1.0, abs(n.x) * uResolution.x + abs(n.y) * uResolution.y);
        t = clamp(a / TT + 0.5, 0.0, 1.0);
        u = htShapeT(t);
        S = max(1.0, mix(halftoneSpaceMin, halftoneSpaceMax, u));
        D = mix(halftoneSizeMin, halftoneSizeMax, u);
        float N = htCellIndex(t, halftoneSpaceMin, halftoneSpaceMax) * TT;
        f = vec2(fract(N) - 0.5, fract(b / S) - 0.5);
        cellIdx = int(floor(b / S));
    } else {
        // concentric: polar lattice — rings warped radially, dots spaced by arc
        vec2 d = pix - htCenter * uResolution;
        float r    = length(d);
        float Rref = max(1.0, 0.5 * length(uResolution));
        t = clamp(r / Rref, 0.0, 1.0);
        u = htShapeT(t);
        S = max(1.0, mix(halftoneSpaceMin, halftoneSpaceMax, u));
        D = mix(halftoneSizeMin, halftoneSizeMax, u);
        float Nr = htCellIndex(t, halftoneSpaceMin, halftoneSpaceMax) * Rref;
        float fr = fract(Nr) - 0.5;
        float rk = max(1.0, r - fr * S);                 // ring-centre radius
        float M  = max(1.0, floor(2.0 * PI * rk / S + 0.5));
        float ang = atan(d.y, d.x) / (2.0 * PI) + 0.5;
        f = vec2(fr, fract(ang * M) - 0.5);
        cellIdx = int(floor(ang * M));
    }

    float halfR = 0.5 * D / S;

    float cov;
    if (htShape == 2 && htHasAtlas == 1) {
        // ASCII: the low/high strings are whole words. A hard luminance/gradient
        // split picks which word; the cell's position along the lattice picks which
        // letter of that word (mod its length), so "SAD" tiles as ...S A D S A D...
        // rather than each letter owning its own band.
        bool useHigh = (t >= 0.5);
        int wordLen, wordStart;
        if (useHigh && htHighCount > 0) { wordLen = htHighCount; wordStart = htLowCount; }
        else if (htLowCount > 0)        { wordLen = htLowCount;  wordStart = 0; }
        else                            { wordLen = htHighCount; wordStart = htLowCount; }
        int li = cellIdx % wordLen;
        if (li < 0) li += wordLen;                    // GLSL % truncates toward zero
        int gi = wordStart + li;
        gi = clamp(gi, 0, htLowCount + htHighCount - 1);
        int gc = gi - (gi / htAtlasCols) * htAtlasCols;
        int gr = gi / htAtlasCols;
        float sc = max(1e-4, D / S);
        vec2 g = f / sc + 0.5;                       // glyph-local 0..1
        if (g.x < 0.0 || g.x > 1.0 || g.y < 0.0 || g.y > 1.0) {
            cov = 0.0;
        } else {
            vec2 auv = (vec2(float(gc), float(gr)) + g) / vec2(float(htAtlasCols), float(htAtlasRows));
            auv.y = 1.0 - auv.y;                      // atlas uploaded y-flipped
            cov = texture(htAtlas, auv).a;
        }
    } else {
        float dist = (htShape == 1) ? (abs(f.x) + abs(f.y)) : length(f);
        float aa = fwidth(dist) + 1e-4;
        cov = 1.0 - smoothstep(halfR - aa, halfR + aa, dist);
    }

    // Compose the halftone layer over the image: dots opaque, gaps at BG alpha.
    // Dot color interpolates low->high by the same shaped gradient/luminance u
    // that drives size and spacing.
    vec3  dotCol  = mix(htDotColor, htDotColorHigh, u);
    float bgA     = halftoneBgAlpha / 100.0;
    vec3  layerC  = mix(htBgColor, dotCol, cov);
    float layerA  = mix(bgA, 1.0, cov);
    vec3  overlaid = mix(c.rgb, layerC, layerA);

    float weight = ${fade.fnName}();
    vec3 faded = mix(c.rgb, overlaid, weight);
    if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
}
`,
};
