// Watermark — elegant/subtle visible watermark for provenance & credit (journalism tool).
//
// A tailored subset of the Text effect. The glyph COVERAGE is rasterized on a canvas and
// uploaded as a mask texture (unit 3); the FILL and distortion are computed in the shader by
// sampling uTex — so "static noise sourced from the pixels under the text" and the two
// "clear text distorts the pixels underneath" looks (refraction / pixel-shift) all work in one
// pass. Uses the shared blend control (no fade). Position is a drag-anywhere anchor
// (watermarkX/Y, wired via the canvas overlay). Follows the grain.js pattern.

import { buildBlendControl } from './controls/index.js';

const blend = buildBlendControl('watermark');

const STYLE_MAP = { fill: 0, refract: 1, shift: 2 };
const COLOR_MAP = { black: 0, white: 1, grey: 2, greyStatic: 3, imageStatic: 4 };

// ── mask rasterization (glyph coverage → texture) ────────────────────────────────

// Small LRU of {key, tex} so multiple instances / quick param toggles don't re-rasterize every
// frame. Textures are uploaded on unit 3 (never touching uTex on unit 0). Evicted ones deleted.
const _cache = [];
const _CACHE_MAX = 3;

function rasterizeMaskCanvas(p, W, H) {
    const cv  = new OffscreenCanvas(W, H);
    const ctx = cv.getContext('2d');
    const fontPx = Math.max(6, (p.watermarkSize / 100) * Math.min(W, H));
    ctx.font = `${fontPx}px ${p.watermarkFont || 'sans-serif'}`;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const lines = String(p.watermarkText ?? '').split('\n');
    const lineH = fontPx * 1.25;
    const drawLines = (x, y) => {
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x, y + (i - (lines.length - 1) / 2) * lineH);
        }
    };
    const angle = (p.watermarkAngle ?? 0) * Math.PI / 180;

    if (p.watermarkRepeat) {
        // Tile the text across the (rotated) image on a grid whose spacing tightens with density.
        let maxW = 1;
        for (const ln of lines) maxW = Math.max(maxW, ctx.measureText(ln).width);
        const blockH = lineH * lines.length;
        const density = Math.min(Math.max((p.watermarkDensity ?? 40) / 100, 0), 1);
        // Low density = far sparser: spacing runs from ~7.5× the text size (density 0) down to
        // ~1.15× (density 100, near-touching).
        const spread = 1.15 + (1 - density) * 6.35;
        const stepX = maxW  * spread + fontPx * 0.5;
        const stepY = blockH * spread;
        const R = Math.hypot(W, H);
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(angle);
        let row = 0;
        for (let y = -R; y <= R; y += stepY) {
            const offset = (row % 2) * stepX * 0.5;   // brick offset for a nicer weave
            for (let x = -R; x <= R; x += stepX) drawLines(x + offset, y);
            row++;
        }
        ctx.restore();
    } else {
        const cx = (0.5 + (p.watermarkX ?? 0) / 100) * W;
        const cy = (0.5 - (p.watermarkY ?? 0) / 100) * H;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        drawLines(0, 0);
        ctx.restore();
    }
    return cv;
}

// Build (or fetch) the mask texture for the current rasterization params and bind it to unit 3.
function bindMaskTexture(gl, prog, p, W, H) {
    const loc = prog._locs['uTextMask'];
    if (loc == null) return;
    const key = [p.watermarkText, p.watermarkFont, p.watermarkSize, p.watermarkAngle,
                 p.watermarkX, p.watermarkY, !!p.watermarkRepeat, p.watermarkDensity, W, H].join('|');

    let entry = _cache.find(e => e.key === key);
    gl.activeTexture(gl.TEXTURE3);
    if (!entry) {
        const cv  = rasterizeMaskCanvas(p, W, H);
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        entry = { key, tex };
        _cache.push(entry);
        if (_cache.length > _CACHE_MAX) gl.deleteTexture(_cache.shift().tex);
    } else {
        gl.bindTexture(gl.TEXTURE_2D, entry.tex);
    }
    gl.uniform1i(loc, 3);
    gl.activeTexture(gl.TEXTURE0);
}

export const watermarkEffect = {
    name: 'watermark',
    label: 'Ghostmark',
    kind: 'glsl',
    paramKeys: ['watermarkDistort', 'watermarkGrain', ...blend.paramKeys],
    handleParams: ['watermarkX', 'watermarkY', 'watermarkSize', 'watermarkAngle'],
    uiGroups: [
        { keys: ['watermarkText', 'watermarkFont', 'watermarkSize', 'watermarkAngle'] },
        { label: 'Style', keys: ['watermarkStyle', 'watermarkColor', 'watermarkGrain', 'watermarkDistort'] },
        { label: 'Repeat', keys: ['watermarkRepeat', 'watermarkDensity'] },
        blend.uiGroup,
    ],
    params: {
        watermarkEnabled:  { default: false, label: 'Enable' },
        watermarkText:     { default: '© SOURCE — DO NOT COPY', type: 'text', label: 'Text' },
        watermarkFont:     { default: "'Helvetica Neue', Arial, sans-serif", label: 'Font', fontSelector: true, options: [
            ["'Helvetica Neue', Arial, sans-serif", 'Sans'],
            ['Georgia, serif',                      'Serif'],
            ["'JetBrains Mono', monospace",         'Mono'],
            ["'Times New Roman', serif",            'Times'],
            ["'Courier New', monospace",            'Courier'],
        ] },
        watermarkSize:     { default: 6,  min: 1,    max: 50,  step: 0.5, label: 'Size' },
        watermarkAngle:    { default: 0,  min: -180, max: 180, label: 'Angle' },
        watermarkX:        { default: 0,  min: -50,  max: 50,  label: 'Center X' },
        watermarkY:        { default: 0,  min: -50,  max: 50,  label: 'Center Y' },
        watermarkStyle:    { default: 'fill', label: 'Style', options: [['fill', 'Ink Fill'], ['refract', 'Clear — Refract'], ['shift', 'Clear — Pixel Shift']] },
        watermarkColor:    { default: 'grey', label: 'Ink', options: [['black', 'Black'], ['white', 'White'], ['grey', 'Grey'], ['greyStatic', 'Grey Static'], ['imageStatic', 'Image Static']] },
        watermarkGrain:    { default: 3,   min: 1, max: 16,  label: 'Static Grain' },
        watermarkDistort:  { default: 40,  min: 0, max: 100, label: 'Distortion' },
        watermarkRepeat:   { default: false, label: 'Repeat (tile)' },
        watermarkDensity:  { default: 40, min: 0, max: 100, label: 'Density' },
        ...blend.params,
    },
    enabled: (p) => p.watermarkEnabled &&
        (p.watermarkStyle === 'fill' || p.watermarkDistort > 0),
    bindUniforms: (gl, prog, p, dstW, dstH) => {
        const locs = prog._locs;
        const si = (k, v) => { if (locs[k] != null) gl.uniform1i(locs[k], v); };
        si('watermarkStyle', STYLE_MAP[p.watermarkStyle] ?? 0);
        si('watermarkColor', COLOR_MAP[p.watermarkColor] ?? 2);
        blend.bindUniforms(gl, prog, p);           // owns unit 2
        bindMaskTexture(gl, prog, p, dstW, dstH);  // unit 3, after blend
    },
    glsl: `
uniform int   watermarkStyle;
uniform int   watermarkColor;
uniform float watermarkGrain;
uniform float watermarkDistort;
uniform sampler2D uTextMask;
${blend.glsl}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
    vec4 c = texture(uTex, vUV);
    float m = texture(uTextMask, vUV).a;    // glyph coverage
    vec3 base = c.rgb;
    vec3 distorted = base;

    if (watermarkStyle == 1) {
        // Refraction: offset-sample uTex along the gradient of the coverage (glassBlob-style),
        // with a small chromatic split. Concentrates at glyph edges → subtle glass lettering.
        vec2 t = uTexelSize * 2.0;
        float mL = texture(uTextMask, vUV - vec2(t.x, 0.0)).a;
        float mR = texture(uTextMask, vUV + vec2(t.x, 0.0)).a;
        float mD = texture(uTextMask, vUV - vec2(0.0, t.y)).a;
        float mU = texture(uTextMask, vUV + vec2(0.0, t.y)).a;
        vec2  grad = vec2(mR - mL, mU - mD);
        float k    = (watermarkDistort / 100.0) * 0.06;
        vec2  off  = grad * k;
        float disp = (watermarkDistort / 100.0) * 0.015;
        distorted.r = texture(uTex, vUV - off * (1.0 + disp)).r;
        distorted.g = texture(uTex, vUV - off).g;
        distorted.b = texture(uTex, vUV - off * (1.0 - disp)).b;
    } else if (watermarkStyle == 2) {
        // Pixel shift: horizontal displacement of the pixels under the glyphs (lineGlitch-style),
        // with slight per-row jitter so it reads as a glitchy displacement.
        float jitter = hash21(vec2(3.7, floor(vUV.y * uResolution.y / 3.0))) - 0.5;
        float sh = (watermarkDistort / 100.0) * 0.06 * (jitter * 2.0);
        distorted = texture(uTex, vec2(clamp(vUV.x + sh, 0.0, 1.0), vUV.y)).rgb;
    }

    vec3 content;   // the watermark's own pixels (ink, or the distorted pixels under the glyphs)
    if (watermarkStyle == 0) {
        vec3 ink;
        if      (watermarkColor == 0) ink = vec3(0.0);
        else if (watermarkColor == 1) ink = vec3(1.0);
        else if (watermarkColor == 2) ink = vec3(0.5);
        else if (watermarkColor == 3) {
            vec2 cell = floor(vUV * uResolution / max(watermarkGrain, 1.0));
            ink = vec3(hash21(cell));
        } else {
            // Image Static — fill from pixels near/under the text (noise sourced from the image).
            vec2 cell = floor(vUV * uResolution / max(watermarkGrain, 1.0));
            vec2 jit  = vec2(hash21(cell), hash21(cell + 7.3)) - 0.5;
            ink = texture(uTex, vUV + jit * max(watermarkGrain, 1.0) * 3.0 * uTexelSize).rgb;
        }
        content = ink;
    } else {
        content = distorted;   // clear refraction / pixel-shift
    }

    // Blend the WATERMARK's pixels against the image (mode + opacity from the Blend control),
    // then composite ONLY within the glyph coverage. The background (m == 0) is always the
    // untouched image, so blend/opacity fade the mark itself — never the background.
    vec3 marked = ${blend.thresholdFn}(c, vec4(content, c.a)) ? ${blend.blendFn}(base, content) : base;
    fragColor = vec4(mix(base, marked, m), c.a);
}
`,
};
