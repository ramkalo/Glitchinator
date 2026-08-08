import { buildFadeControl, buildBlendControl } from './controls/index.js';
import { resolveColorKey, STANDARD_COLOR_OPTIONS } from './colorOptions.js';
import { glassMapTexture, glassMapImage } from '../renderer/glstate.js';

const fade  = buildFadeControl('resin');
const blend = buildBlendControl('resin');

const MAX_BUBBLES = 256;

// ── helpers ──────────────────────────────────────────────────────────────────

function hexToRgb01(hex) {
    const n = parseInt((hex || '#ffffff').replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function resinRgb(key, palette, fallback) {
    return hexToRgb01(resolveColorKey(key, palette) ?? fallback);
}
function clampNum(v, lo, hi, def) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
}

// Mid-grey 1×1 fallback so the glass-image sampler always reads a valid texture
// (flat relief / neutral reflection) before the user loads an image.
let _fallbackTex = null;
function getFallbackTex(gl) {
    if (_fallbackTex) return _fallbackTex;
    _fallbackTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, _fallbackTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return _fallbackTex;
}

// ── bubble generation (CPU, cached — same generator family as filmSoup) ───────

function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const _bubCache = { key: null, tex: null, count: 0 };

function bubbleCacheKey(p, w, h) {
    return [w, h, p.resinBubSeed, p.resinBubCount, p.resinBubSize, p.resinBubSizeDev, p.resinBubDistribution].join('|');
}

function c255(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function generateBubbleData(p) {
    const rng   = mulberry32(clampNum(p.resinBubSeed, 1, 99999, 42) | 0);
    const num   = clampNum(p.resinBubCount, 1, MAX_BUBBLES, 8) | 0;
    const size  = clampNum(p.resinBubSize, 1, 60, 14);
    const dev   = clampNum(p.resinBubSizeDev, 0, 100, 30);
    const dist  = clampNum(p.resinBubDistribution, -50, 50, 0) / 50;
    const baseR = (size / 100) * 0.5;
    const data  = new Uint8Array(MAX_BUBBLES * 4);

    for (let k = 0; k < num; k++) {
        let cx = rng();
        let cy = rng();
        if (dist > 0) {
            const t = Math.min(dist, 0.92);
            cx += (0.5 - cx) * t;
            cy += (0.5 - cy) * t;
        } else if (dist < 0) {
            const t = -dist;
            const ex = cx < 0.5 ? 0.0 : 1.0;
            const ey = cy < 0.5 ? 0.0 : 1.0;
            if (Math.min(cx, 1 - cx) < Math.min(cy, 1 - cy)) cx += (ex - cx) * t;
            else                                             cy += (ey - cy) * t;
        }
        const s = (rng() - 0.5) * 2;
        const radius = Math.max(0.004, baseR * (1 + s * dev / 100));
        const idx = k * 4;
        data[idx]     = c255(cx * 255);
        data[idx + 1] = c255(cy * 255);
        data[idx + 2] = c255(radius * 255);
        data[idx + 3] = 255;
    }
    return { data, count: num };
}

// ── uniform binding ───────────────────────────────────────────────────────────

const MODE_MAP = { glossy: 0, oil: 1, chrome: 2, frosted: 3 };
const TEX_MAP  = { none: 0, drips: 1, cracks: 2, image: 3 };

function resinBindUniforms(gl, prog, p, dstW, dstH) {
    const locs = prog._locs;
    const setI  = (k, v) => { if (locs[k] != null) gl.uniform1i(locs[k], v); };
    const setF  = (k, v) => { if (locs[k] != null) gl.uniform1f(locs[k], v); };
    const set3v = (k, a) => { if (locs[k] != null) gl.uniform3fv(locs[k], a); };

    setI('resinMode',    MODE_MAP[p.resinMode ?? 'glossy'] ?? 0);
    setI('resinTexture', TEX_MAP[p.resinTexture ?? 'none'] ?? 0);

    // Smoothness → blur radius (mirrors glow's 1..60 range).
    setF('resinBlurRadius', 1 + clampNum(p.resinSmoothness, 0, 100, 35) / 100 * 59);

    const pal = p._activePalette;
    set3v('resinSpecColor',    resinRgb(p.resinSpecColor,    pal, '#ffffff'));
    set3v('resinFresnelColor', resinRgb(p.resinFresnelColor, pal, '#bfe0ff'));
    set3v('resinMetal',        resinRgb(p.resinMetal,        pal, '#dfe6ee'));

    // Glass image on TEXTURE3 (height relief + chrome reflection env).
    setI('resinHasGlassImg', glassMapTexture ? 1 : 0);
    if (locs['uGlassTex'] != null) {
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, glassMapTexture ?? getFallbackTex(gl));
        gl.uniform1i(locs['uGlassTex'], 3);
    }
    // Glass image's own pixel dimensions, so the shader can preserve its aspect ratio.
    // (0, 0) when no image is loaded keeps the aspect correction neutral.
    if (locs['uGlassTexSize'] != null) {
        if (glassMapImage) gl.uniform2f(locs['uGlassTexSize'], glassMapImage.width, glassMapImage.height);
        else               gl.uniform2f(locs['uGlassTexSize'], 0, 0);
    }

    // Bubble data on TEXTURE4 (regenerated only when bubble params change).
    if (locs['uBubbleTex'] != null) {
        const key = bubbleCacheKey(p, dstW, dstH);
        if (key !== _bubCache.key || !_bubCache.tex) {
            if (_bubCache.tex) gl.deleteTexture(_bubCache.tex);
            const { data, count } = generateBubbleData(p);
            gl.activeTexture(gl.TEXTURE4);
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAX_BUBBLES, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            _bubCache.tex = tex; _bubCache.count = count; _bubCache.key = key;
        }
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, _bubCache.tex);
        gl.uniform1i(locs['uBubbleTex'], 4);
        setI('resinBubCount', p.resinBubEnabled ? _bubCache.count : 0);
    }

    setF('uAspect', dstW / dstH);

    fade.bindUniforms(gl, prog, p);
    blend.bindUniforms(gl, prog, p);
}

// ── shared GLSL ───────────────────────────────────────────────────────────────

const NOISE_GLSL = `
float resinHash21(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
vec2  resinHash22(vec2 p){ float n = sin(dot(p, vec2(41.0, 289.0))); return fract(vec2(262144.0, 32768.0) * n); }
float resinVNoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = resinHash21(i),           b = resinHash21(i + vec2(1.0, 0.0));
    float c = resinHash21(i + vec2(0.0, 1.0)), d = resinHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float resinFbm(vec2 p){
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++){ s += a * resinVNoise(p); p *= 2.0; a *= 0.5; }
    return s;
}
// Cell-plate field: ~1 inside cells, dipping toward 0 along the cell borders (cracks).
float resinCracks(vec2 p){
    vec2 g = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
        vec2 o = vec2(float(x), float(y));
        vec2 r = o + resinHash22(g + o) - f;
        float d = dot(r, r);
        if (d < d1){ d2 = d1; d1 = d; } else if (d < d2){ d2 = d; }
    }
    return smoothstep(0.0, 0.09, sqrt(d2) - sqrt(d1));
}
`;

const HSL_GLSL = `
vec3 resinRgb2Hsl(vec3 c) {
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    float l = (mx + mn) * 0.5, d = mx - mn;
    float s = (d < 0.0001) ? 0.0 : d / (1.0 - abs(2.0 * l - 1.0));
    float h = 0.0;
    if (d > 0.0001) {
        if (mx == c.r)      h = mod((c.g - c.b) / d, 6.0);
        else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
        else                h = (c.r - c.g) / d + 4.0;
        h /= 6.0;
    }
    return vec3(h, s, l);
}
vec3 resinHsl2Rgb(vec3 hsl) {
    float h = hsl.x, s = hsl.y, l = hsl.z;
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c * 0.5;
    vec3 rgb;
    if      (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
    else                  rgb = vec3(c, 0.0, x);
    return clamp(rgb + m, 0.0, 1.0);
}
`;

// ── pass 1: build heightmap ───────────────────────────────────────────────────

const HEIGHT_GLSL = `
const int MAX_BUBBLES = ${MAX_BUBBLES};
uniform sampler2D uGlassTex;
uniform sampler2D uBubbleTex;
uniform int   resinTexture;
uniform float resinLumMix;
uniform float resinTexMix;
uniform float resinTexScale;
uniform int   resinHasGlassImg;
uniform float resinImgX, resinImgY, resinImgRot, resinImgZoom;
uniform vec2  uGlassTexSize;
uniform int   resinBubCount;
uniform float resinBubHeight;
uniform float resinBubCenterX, resinBubCenterY;
uniform float uAspect;

${NOISE_GLSL}

vec2 resinGlassUV(vec2 uv) {
    vec2 q = uv - 0.5;
    q -= vec2(resinImgX / 100.0 - 0.5, -(resinImgY / 100.0 - 0.5));
    // Isotropic, frame-centered space so rotation is a true rotation, not an aspect-skewed shear.
    q.x *= uAspect;
    float r = resinImgRot * 3.14159265 / 180.0;
    float c = cos(r), s = sin(r);
    q = mat2(c, s, -s, c) * q;
    q /= max(resinImgZoom / 100.0, 0.01);
    // Map isotropic space -> texture space, preserving the glass image's aspect ("contain").
    vec2 disp = vec2(uAspect, 1.0);
    if (uGlassTexSize.x > 0.0 && uGlassTexSize.y > 0.0) {
        float imgA = uGlassTexSize.x / uGlassTexSize.y;
        disp = imgA > uAspect ? vec2(uAspect, uAspect / imgA) : vec2(imgA, 1.0);
    }
    return q / disp + 0.5;
}

float resinBubbleDome(vec2 uv) {
    vec2 puv = vec2(uv.x, 1.0 - uv.y);
    vec2 ctr = vec2(resinBubCenterX / 100.0 - 0.5, resinBubCenterY / 100.0 - 0.5);
    float best = 0.0;
    for (int k = 0; k < MAX_BUBBLES; k++) {
        if (k >= resinBubCount) break;
        vec4 b = texelFetch(uBubbleTex, ivec2(k, 0), 0);
        vec2 d = puv - (b.xy + ctr);
        d.x *= uAspect;
        float r = max(b.z, 1e-4);
        float dist = length(d);
        if (dist < r) best = max(best, sqrt(max(0.0, 1.0 - (dist / r) * (dist / r))));
    }
    return best;
}

void main() {
    vec3 col = texture(uTex, vUV).rgb;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float h = lum * (resinLumMix / 100.0);

    float mix01 = resinTexMix / 100.0;
    if (resinTexture == 1) {
        h = mix(h, resinFbm(vUV * resinTexScale), mix01);
    } else if (resinTexture == 2) {
        h = mix(h, resinCracks(vUV * resinTexScale), mix01);
    } else if (resinTexture == 3 && resinHasGlassImg == 1) {
        float gl = dot(texture(uGlassTex, resinGlassUV(vUV)).rgb, vec3(0.299, 0.587, 0.114));
        h = mix(h, gl, mix01);
    }

    if (resinBubCount > 0) {
        h = max(h, resinBubbleDome(vUV) * (resinBubHeight / 100.0));
    }

    fragColor = vec4(vec3(h), 1.0);
}
`;

// ── passes 2/3: separable blur of the heightmap (mirrors glow) ────────────────

const BLUR_H_GLSL = `
uniform float resinBlurRadius;
void main() {
    int r = int(resinBlurRadius + 0.5);
    float sigma = max(resinBlurRadius, 1.0);
    float twoSigSq = 2.0 * sigma * sigma;
    vec4 color = vec4(0.0); float total = 0.0;
    for (int i = -60; i <= 60; i++) {
        if (i < -r || i > r) continue;
        float g = exp(-float(i * i) / twoSigSq);
        color += texture(uTex, clamp(vUV + vec2(float(i) * uTexelSize.x, 0.0), vec2(0.0), vec2(1.0))) * g;
        total += g;
    }
    fragColor = color / max(total, 0.0001);
}
`;

const BLUR_V_GLSL = `
uniform float resinBlurRadius;
void main() {
    int r = int(resinBlurRadius + 0.5);
    float sigma = max(resinBlurRadius, 1.0);
    float twoSigSq = 2.0 * sigma * sigma;
    vec4 color = vec4(0.0); float total = 0.0;
    for (int i = -60; i <= 60; i++) {
        if (i < -r || i > r) continue;
        float g = exp(-float(i * i) / twoSigSq);
        color += texture(uTex, clamp(vUV + vec2(0.0, float(i) * uTexelSize.y), vec2(0.0), vec2(1.0))) * g;
        total += g;
    }
    fragColor = color / max(total, 0.0001);
}
`;

// ── pass 4: shade ─────────────────────────────────────────────────────────────

const SHADE_GLSL = `
uniform sampler2D uTexOriginal;
uniform sampler2D uGlassTex;
uniform int   resinMode;
uniform float resinBump;
uniform float resinShininess;
uniform float resinSpecular;
uniform float resinRefract;
uniform float resinDispersion;
uniform float resinFresnel;
uniform float resinLightX, resinLightY, resinLightZ;
uniform float resinCoat;
uniform vec3  resinSpecColor;
uniform vec3  resinFresnelColor;
uniform vec3  resinMetal;
uniform float resinIridescence;
uniform float resinFrost;
uniform int   resinHasGlassImg;
uniform vec2  uGlassTexSize;
uniform int   resinHueEnabled;
uniform float resinHueCenter, resinHueWidth, resinHueFeather;

${HSL_GLSL}
${fade.glsl}
${blend.glsl}

void main() {
    vec4 orig = texture(uTexOriginal, vUV);

    // Surface normal from the blurred heightmap gradient.
    float hL = texture(uTex, vUV - vec2(uTexelSize.x, 0.0)).r;
    float hR = texture(uTex, vUV + vec2(uTexelSize.x, 0.0)).r;
    float hD = texture(uTex, vUV - vec2(0.0, uTexelSize.y)).r;
    float hU = texture(uTex, vUV + vec2(0.0, uTexelSize.y)).r;
    float hC = texture(uTex, vUV).r;
    vec3 N = normalize(vec3((hL - hR) * resinBump, (hD - hU) * resinBump, 1.0));

    vec3 L = normalize(vec3((resinLightX / 100.0 - 0.5) * 2.0,
                           -(resinLightY / 100.0 - 0.5) * 2.0,
                            max(resinLightZ, 0.05)));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);
    float ndh  = max(dot(N, H), 0.0);
    float fres = pow(1.0 - max(N.z, 0.0), resinFresnel);
    float spec = pow(ndh, max(1.0, resinShininess)) * (resinSpecular / 100.0);

    // Refraction through the uneven coat (with optional chromatic dispersion).
    vec2  off  = N.xy * (resinRefract / 100.0) * 0.15;
    float disp = (resinDispersion / 100.0) * 0.02;
    vec3 refr;
    refr.r = texture(uTexOriginal, vUV + off * (1.0 + disp)).r;
    refr.g = texture(uTexOriginal, vUV + off).g;
    refr.b = texture(uTexOriginal, vUV + off * (1.0 - disp)).b;

    vec3 shaded;
    if (resinMode == 0) {                       // Glossy resin
        shaded = refr + resinSpecColor * spec + resinFresnelColor * fres * (resinSpecular / 100.0) * 0.5;
    } else if (resinMode == 1) {                // Oil slick (iridescent)
        float hue = fract(fres * (resinIridescence / 100.0) * 4.0 + hC * 1.5);
        vec3 irid = resinHsl2Rgb(vec3(hue, 0.85, 0.55));
        shaded = refr + irid * fres + resinSpecColor * spec;
    } else if (resinMode == 2) {                // Liquid chrome
        vec3 R = reflect(-V, N);
        vec3 env;
        // Ball-mapped reflection; preserve the reflection image's aspect within the square ("contain").
        vec2 refl = R.xy;
        if (uGlassTexSize.x > 0.0 && uGlassTexSize.y > 0.0) {
            float imgA = uGlassTexSize.x / uGlassTexSize.y;
            refl *= imgA > 1.0 ? vec2(1.0, imgA) : vec2(1.0 / imgA, 1.0);
        }
        if (resinHasGlassImg == 1) env = texture(uGlassTex, clamp(refl * 0.5 + 0.5, 0.0, 1.0)).rgb;
        else                       env = mix(vec3(0.12, 0.14, 0.18), vec3(0.92, 0.96, 1.0), R.y * 0.5 + 0.5);
        shaded = mix(refr, env * resinMetal, clamp(fres + 0.35, 0.0, 1.0)) + resinSpecColor * spec;
    } else {                                    // Frosted glass
        vec3 acc = vec3(0.0);
        float fk = (resinFrost / 100.0) * 0.05;
        for (int i = 0; i < 6; i++) {
            float a = float(i) / 6.0 * 6.2831853;
            acc += texture(uTexOriginal, vUV + (vec2(cos(a), sin(a)) + N.xy) * fk).rgb;
        }
        acc /= 6.0;
        float sheen = pow(ndh, 8.0) * (resinSpecular / 100.0);
        shaded = acc + resinSpecColor * sheen + resinFresnelColor * fres * 0.25;
    }
    shaded = clamp(shaded, 0.0, 1.0);

    // Hue-target mask: confine the coat to pixels near a target hue.
    float hueWeight = 1.0;
    if (resinHueEnabled == 1) {
        float hue360 = resinRgb2Hsl(orig.rgb).x * 360.0;
        float diff = abs(fract((hue360 - resinHueCenter) / 360.0 + 0.5) - 0.5) * 360.0;
        float halfW = resinHueWidth * 0.5;
        float gradStart = halfW * (1.0 - clamp(resinHueFeather / 100.0, 0.0, 1.0));
        hueWeight = (resinHueWidth >= 360.0) ? 1.0 : 1.0 - smoothstep(gradStart, halfW, diff);
    }

    float w = ${fade.fnName}() * hueWeight;
    vec3 coated = mix(orig.rgb, shaded, clamp(resinCoat / 100.0, 0.0, 1.0));
    vec3 faded  = mix(orig.rgb, coated, w);
    if (!${blend.thresholdFn}(orig, vec4(faded, orig.a))) { fragColor = orig; return; }
    fragColor = vec4(${blend.blendFn}(orig.rgb, faded), orig.a);
}
`;

// ── effect definition ─────────────────────────────────────────────────────────

export const resinEffect = {
    name:  'resin',
    label: 'Glass Resin',
    kind:  'glsl',
    paramKeys: [
        'resinBump', 'resinShininess', 'resinSpecular', 'resinRefract', 'resinDispersion',
        'resinFresnel', 'resinLightX', 'resinLightY', 'resinLightZ', 'resinCoat',
        'resinLumMix', 'resinTexMix', 'resinTexScale',
        'resinImgX', 'resinImgY', 'resinImgRot', 'resinImgZoom',
        'resinHueEnabled', 'resinHueCenter', 'resinHueWidth', 'resinHueFeather',
        'resinIridescence', 'resinFrost',
        'resinBubHeight', 'resinBubCenterX', 'resinBubCenterY',
        ...fade.paramKeys, ...blend.paramKeys,
    ],
    handleParams: [
        'resinLightX', 'resinLightY', 'resinBubCenterX', 'resinBubCenterY', 'resinImgX', 'resinImgY',
        ...fade.handleParams,
    ],
    overlays: {},
    uiGroups: (p) => {
        const mode = p.resinMode ?? 'glossy';
        const tex  = p.resinTexture ?? 'none';

        const core = ['resinMode', 'resinCoat', 'resinSmoothness', 'resinBump',
            'resinShininess', 'resinSpecular', 'resinRefract', 'resinDispersion',
            'resinFresnel', 'resinLightZ', 'resinSpecColor', 'resinFresnelColor'];
        if (mode === 'oil')     core.push('resinIridescence');
        if (mode === 'chrome')  core.push('resinMetal');
        if (mode === 'frosted') core.push('resinFrost');

        const heightKeys = ['resinLumMix', 'resinTexture'];
        if (tex !== 'none') heightKeys.push('resinTexMix');
        if (tex === 'drips' || tex === 'cracks') heightKeys.push('resinTexScale');
        if (tex === 'image' || mode === 'chrome') heightKeys.push('resinImgRot', 'resinImgZoom');

        const groups = [
            { keys: core },
            { label: 'Relief Source', keys: heightKeys },
            { label: 'Hue Target', conditionKey: 'resinHueEnabled',
              keys: ['resinHueEnabled', 'resinHueCenter', 'resinHueWidth', 'resinHueFeather'] },
            { label: 'Glass Bubbles', conditionKey: 'resinBubEnabled',
              keys: ['resinBubEnabled', 'resinBubCount', 'resinBubSize', 'resinBubSizeDev',
                     'resinBubDistribution', 'resinBubHeight', 'resinBubSeed'] },
            blend.uiGroup,
            fade.uiGroup,
        ];
        return groups;
    },
    params: {
        resinEnabled:    { default: false, label: 'Enable' },
        resinMode:       { default: 'glossy', label: 'Mode', options: [['glossy', 'Glossy Resin'], ['oil', 'Oil Slick'], ['chrome', 'Liquid Chrome'], ['frosted', 'Frosted Glass']] },
        resinCoat:       { default: 100, min: 0, max: 100, label: 'Coat Amount' },
        resinSmoothness: { default: 35, min: 0, max: 100, label: 'Coat Smoothness' },
        resinBump:       { default: 80, min: 1, max: 300, label: 'Relief Strength' },
        resinShininess:  { default: 40, min: 1, max: 200, label: 'Gloss Tightness' },
        resinSpecular:   { default: 80, min: 0, max: 200, label: 'Highlight Intensity' },
        resinRefract:    { default: 25, min: 0, max: 100, label: 'Refraction' },
        resinDispersion: { default: 20, min: 0, max: 100, label: 'Dispersion' },
        resinFresnel:    { default: 3, min: 0.5, max: 8, step: 0.1, label: 'Fresnel Rim' },
        resinLightZ:     { default: 0.6, min: 0.05, max: 2, step: 0.05, label: 'Light Height' },
        resinSpecColor:    { default: 'palette0', type: 'paletteSelect', options: STANDARD_COLOR_OPTIONS, label: 'Highlight Color' },
        resinFresnelColor: { default: 'palette1', type: 'paletteSelect', options: STANDARD_COLOR_OPTIONS, label: 'Rim Color' },
        resinMetal:        { default: 'palette0', type: 'paletteSelect', options: STANDARD_COLOR_OPTIONS, label: 'Metal Tint' },
        resinIridescence: { default: 50, min: 0, max: 100, label: 'Iridescence' },
        resinFrost:       { default: 50, min: 0, max: 100, label: 'Frost Scatter' },

        resinLumMix:   { default: 100, min: 0, max: 100, label: 'Image Relief' },
        resinTexture:  { default: 'none', label: 'Texture', options: [['none', 'None'], ['drips', 'Drips'], ['cracks', 'Cracks'], ['image', 'Image']] },
        resinTexMix:   { default: 60, min: 0, max: 100, label: 'Texture Mix' },
        resinTexScale: { default: 8, min: 1, max: 40, label: 'Texture Scale' },
        resinImgRot:   { default: 0, min: -180, max: 180, label: 'Image Rotation' },
        resinImgZoom:  { default: 100, min: 10, max: 400, label: 'Image Zoom' },
        resinImgX:     { default: 50, min: 0, max: 100, hidden: true },
        resinImgY:     { default: 50, min: 0, max: 100, hidden: true },

        resinHueEnabled: { default: false, label: 'Enable Hue Target' },
        resinHueCenter:  { default: 220, min: 0, max: 360, label: 'Target Hue' },
        resinHueWidth:   { default: 80, min: 1, max: 360, label: 'Hue Range' },
        resinHueFeather: { default: 30, min: 0, max: 100, label: 'Hue Feather' },

        resinBubEnabled:      { default: false, label: 'Enable Bubbles' },
        resinBubCount:        { default: 8, min: 1, max: MAX_BUBBLES, label: 'Bubble Count' },
        resinBubSize:         { default: 14, min: 1, max: 60, label: 'Bubble Size' },
        resinBubSizeDev:      { default: 30, min: 0, max: 100, label: 'Size Deviation' },
        resinBubDistribution: { default: 0, min: -50, max: 50, label: 'Distribution (Perimeter ↔ Center)' },
        resinBubHeight:       { default: 100, min: 0, max: 100, label: 'Bubble Height' },
        resinBubSeed:         { default: 42, min: 1, max: 99999, label: 'Seed' },
        resinBubCenterX:      { default: 50, min: 0, max: 100, hidden: true },
        resinBubCenterY:      { default: 50, min: 0, max: 100, hidden: true },

        resinLightX: { default: 35, min: 0, max: 100, hidden: true },
        resinLightY: { default: 30, min: 0, max: 100, hidden: true },

        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.resinEnabled,
    bindUniforms: resinBindUniforms,
    glslPasses: [
        { glsl: HEIGHT_GLSL },
        { glsl: BLUR_H_GLSL },
        { glsl: BLUR_V_GLSL },
        { glsl: SHADE_GLSL, needsOriginal: true },
    ],
};
