// Glass Blob — a single analytic droplet placed on the image, with selectable material
// modes (glass / metal / oil slick / soap bubble). Geometry is one irregular elliptical
// signed-distance field, so the surface is smooth and lighting reads cleanly.

import { glassMapTexture } from '../renderer/glstate.js';
import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('glassBlob');
const blend = buildBlendControl('glassBlob');

function hexToRgb01(hex) {
    const n = parseInt((hex || '#bfe8ff').replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// 1×1 mid-grey fallback so the sky sampler always has a valid texture bound.
let _skyFallback = null;
function skyFallbackTex(gl) {
    if (_skyFallback) return _skyFallback;
    _skyFallback = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, _skyFallback);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return _skyFallback;
}

// Per-harmonic amplitude + phase for the irregular outline (harmonics n=2..5). Computed
// ONCE in JS and fed to the shader so the overlay and the rendered blob use identical
// numbers (a sin()*large hash run separately in 32-bit GLSL / 64-bit JS would diverge).
export function blobHarmonics(seed) {
    const h = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
    const amp = [], ph = [];
    for (let n = 2; n <= 5; n++) {
        amp.push(h(seed, n) * 2 - 1);
        ph.push(h(seed, n + 11.3) * Math.PI * 2);
    }
    return { amp, ph };
}

const MODE_MAP = { glass: 0, metal: 1, oil: 2, soap: 3 };

function glassBlobBindUniforms(gl, prog, p) {
    const locs = prog._locs;
    const set3 = (k, hex) => { if (locs[k] != null) gl.uniform3fv(locs[k], hexToRgb01(hex)); };
    set3('glassBlobColor',      p.glassBlobColor);
    set3('glassBlobLightColor', p.glassBlobLightColor || '#ffffff');

    fade.bindUniforms(gl, prog, p);
    blend.bindUniforms(gl, prog, p);

    if (locs['uMode'] != null) gl.uniform1i(locs['uMode'], MODE_MAP[p.glassBlobMode ?? 'glass'] ?? 0);

    // User sky/reflection image (reused global glassMap asset) on TEXTURE1.
    if (locs['uHasSky'] != null) gl.uniform1i(locs['uHasSky'], glassMapTexture ? 1 : 0);
    if (locs['uSkyTex'] != null) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, glassMapTexture ?? skyFallbackTex(gl));
        gl.uniform1i(locs['uSkyTex'], 1);
    }

    const { amp, ph } = blobHarmonics(p.glassBlobSeed);
    if (locs['glassBlobAmp[0]']   != null) gl.uniform1fv(locs['glassBlobAmp[0]'],   new Float32Array(amp));
    if (locs['glassBlobPhase[0]'] != null) gl.uniform1fv(locs['glassBlobPhase[0]'], new Float32Array(ph));
}

export const glassBlobEffect = {
    name:  'glassBlob',
    label: 'Glass Blob',
    kind:  'glsl',
    paramKeys: [
        'glassBlobX', 'glassBlobY', 'glassBlobSizeX', 'glassBlobSizeY', 'glassBlobAngle',
        'glassBlobIrregular', 'glassBlobHeight', 'glassBlobRoundness',
        'glassBlobRefract', 'glassBlobDispersion', 'glassBlobMagnify', 'glassBlobReflect',
        'glassBlobIridescence', 'glassBlobSwirlScale', 'glassBlobSwirlFreq', 'glassBlobSwirlSeed',
        'glassBlobShininess', 'glassBlobSpecular', 'glassBlobFresnel',
        'glassBlobLightX', 'glassBlobLightY', 'glassBlobLightZ', 'glassBlobLightBright',
        'glassBlobShadow', 'glassBlobFill',
        ...fade.paramKeys, ...blend.paramKeys,
    ],
    handleParams: ['glassBlobX', 'glassBlobY', 'glassBlobSizeX', 'glassBlobSizeY', 'glassBlobAngle', 'glassBlobLightX', 'glassBlobLightY',
        ...fade.handleParams],
    uiGroups: (p) => {
        const mode = p.glassBlobMode ?? 'glass';
        const shape = ['glassBlobMode', 'glassBlobSizeX', 'glassBlobSizeY', 'glassBlobIrregular',
            'glassBlobSeed', 'glassBlobRegen', 'glassBlobHeight', 'glassBlobRoundness'];
        let material;
        if (mode === 'metal') {
            material = ['glassBlobReflect', 'glassBlobShininess', 'glassBlobSpecular', 'glassBlobFresnel', 'glassBlobColor'];
        } else if (mode === 'oil') {
            material = ['glassBlobIridescence', 'glassBlobSwirlScale', 'glassBlobSwirlFreq', 'glassBlobSwirlSeed', 'glassBlobSwirlRegen',
                'glassBlobRefract', 'glassBlobSpecular', 'glassBlobFresnel', 'glassBlobColor', 'glassBlobFill'];
        } else if (mode === 'soap') {
            material = ['glassBlobIridescence', 'glassBlobSwirlScale', 'glassBlobSwirlFreq', 'glassBlobSwirlSeed', 'glassBlobSwirlRegen',
                'glassBlobSpecular', 'glassBlobFresnel'];
        } else {
            material = ['glassBlobRefract', 'glassBlobMagnify', 'glassBlobDispersion', 'glassBlobShininess',
                'glassBlobSpecular', 'glassBlobFresnel', 'glassBlobColor', 'glassBlobFill'];
        }
        return [
            { label: 'Shape',    keys: shape },
            { label: 'Material', keys: material },
            { label: 'Light',    keys: ['glassBlobLightColor', 'glassBlobLightBright', 'glassBlobLightZ', 'glassBlobShadow'] },
            blend.uiGroup,
            fade.uiGroup,
        ];
    },
    params: {
        glassBlobEnabled:    { default: false, label: 'Enable' },
        glassBlobMode:       { default: 'glass', label: 'Mode', options: [['glass', 'Glass'], ['metal', 'Metal / Mercury'], ['oil', 'Oil Slick'], ['soap', 'Soap Bubble']] },
        glassBlobX:          { default: 50, min: 0, max: 100, hidden: true },
        glassBlobY:          { default: 50, min: 0, max: 100, hidden: true },
        glassBlobSizeX:      { default: 32, min: 2, max: 100, label: 'Width' },
        glassBlobSizeY:      { default: 28, min: 2, max: 100, label: 'Height (Size)' },
        glassBlobAngle:      { default: 0, min: -180, max: 180, hidden: true },
        glassBlobIrregular:  { default: 30, min: 0, max: 100, label: 'Irregularity' },
        glassBlobSeed:       { default: 42, min: 1, max: 99999, label: 'Shape Seed' },
        glassBlobRegen:      { default: false, label: 'Regenerate Shape', button: 'glassBlobSeed' },
        glassBlobHeight:     { default: 60, min: 0, max: 100, label: 'Dome Height' },
        glassBlobRoundness:  { default: 50, min: 0, max: 100, label: 'Roundness (Viscosity)' },
        glassBlobRefract:    { default: 45, min: 0, max: 100, label: 'Refraction (Edge)' },
        glassBlobMagnify:    { default: 30, min: 0, max: 100, label: 'Center Distortion' },
        glassBlobDispersion: { default: 15, min: 0, max: 100, label: 'Dispersion' },
        glassBlobReflect:    { default: 80, min: 0, max: 100, label: 'Polish' },
        glassBlobIridescence:{ default: 70, min: 0, max: 100, label: 'Iridescence' },
        glassBlobSwirlScale: { default: 40, min: 0, max: 100, label: 'Swirl Scale' },
        glassBlobSwirlFreq:  { default: 6, min: 1, max: 30, label: 'Rainbow Bands' },
        glassBlobSwirlSeed:  { default: 7, min: 1, max: 99999, label: 'Swirl Seed' },
        glassBlobSwirlRegen: { default: false, label: 'Regenerate Swirl', button: 'glassBlobSwirlSeed' },
        glassBlobShininess:  { default: 60, min: 1, max: 200, label: 'Highlight Tightness' },
        glassBlobSpecular:   { default: 100, min: 0, max: 200, label: 'Highlight Intensity' },
        glassBlobFresnel:    { default: 3, min: 0.5, max: 8, step: 0.1, label: 'Edge Glow' },
        glassBlobLightX:     { default: 35, min: 0, max: 100, hidden: true },
        glassBlobLightY:     { default: 30, min: 0, max: 100, hidden: true },
        glassBlobLightZ:     { default: 0.6, min: 0.05, max: 2, step: 0.05, label: 'Light Height' },
        glassBlobLightColor: { default: '#ffffff', type: 'color', label: 'Light Color' },
        glassBlobLightBright:{ default: 100, min: 0, max: 200, label: 'Light Brightness' },
        glassBlobShadow:     { default: 35, min: 0, max: 100, label: 'Shadow' },
        glassBlobColor:      { default: '#bfe8ff', type: 'color', label: 'Color' },
        glassBlobFill:       { default: 0, min: 0, max: 100, label: 'Fill' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.glassBlobEnabled,
    bindUniforms: glassBlobBindUniforms,
    glsl: `
uniform int   uMode;
uniform int   uHasSky;
uniform sampler2D uSkyTex;
uniform float glassBlobX, glassBlobY, glassBlobSizeX, glassBlobSizeY, glassBlobAngle, glassBlobIrregular;
uniform float glassBlobHeight, glassBlobRoundness, glassBlobRefract, glassBlobDispersion, glassBlobMagnify;
uniform float glassBlobReflect, glassBlobIridescence, glassBlobSwirlScale, glassBlobSwirlFreq, glassBlobSwirlSeed;
uniform float glassBlobShininess, glassBlobSpecular, glassBlobFresnel;
uniform float glassBlobLightX, glassBlobLightY, glassBlobLightZ, glassBlobFill;
uniform float glassBlobLightBright, glassBlobShadow;
uniform vec3  glassBlobColor;
uniform vec3  glassBlobLightColor;
uniform float glassBlobAmp[4];
uniform float glassBlobPhase[4];
${fade.glsl}
${blend.glsl}

mat2 gbRot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// Irregular outline radius at angle ang (decaying harmonics n=2..5; amp/phase as uniforms).
float gbRadiusAt(float ang) {
    float wob = 0.0;
    for (int i = 0; i < 4; i++) {
        float fn = float(i + 2);
        wob += glassBlobAmp[i] * sin(fn * ang + glassBlobPhase[i]) / fn;
    }
    return 1.0 + (glassBlobIrregular / 100.0) * 0.6 * wob;
}

// Compact value-noise fbm for the swirly thin-film thickness field.
float gbHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gbNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = gbHash2(i),            b = gbHash2(i + vec2(1.0, 0.0));
    float c = gbHash2(i + vec2(0.0, 1.0)), d = gbHash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float gbFbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * gbNoise(p); p *= 2.0; a *= 0.5; }
    return s;
}

void main() {
    vec4 src = texture(uTex, vUV);
    float aspect = uResolution.x / uResolution.y;

    vec2 c = vec2(glassBlobX / 100.0, 1.0 - glassBlobY / 100.0);
    vec2 d = vUV - c; d.x *= aspect;                 // image-round space
    float ang0 = glassBlobAngle * 3.14159265 / 180.0;
    vec2 rd = gbRot(-ang0) * d;                      // undo blob rotation
    float ex = max((glassBlobSizeX / 100.0) * 0.5, 1e-3);
    float ey = max((glassBlobSizeY / 100.0) * 0.5, 1e-3);
    vec2 q  = vec2(rd.x / ex, rd.y / ey);            // normalised ellipse space
    float rn = length(q);
    float ang = atan(q.y, q.x);
    float Rw  = gbRadiusAt(ang);
    float rNorm = rn / max(Rw, 1e-4);                // 0 centre … 1 rim

    float aaN = 1.5 * uTexelSize.y / ey;
    float cov = 1.0 - smoothstep(1.0 - aaN, 1.0 + aaN, rNorm);

    vec3 L = normalize(vec3((glassBlobLightX / 100.0 - 0.5) * 2.0,
                           -(glassBlobLightY / 100.0 - 0.5) * 2.0,
                            max(glassBlobLightZ, 0.05)));
    if (cov <= 0.0) { fragColor = src; return; }

    // Analytic dome over normalised radius. Monotonic cap (1-r^2)^p — slope grows from 0
    // at centre to steep at the rim; Roundness morphs gentle dome → beaded hemisphere.
    float rr    = clamp(rNorm, 0.0, 1.0);
    float pexp  = mix(1.0, 0.5, glassBlobRoundness / 100.0);
    float base  = max(1.0 - rr * rr, 1e-4);
    float slopeR = 2.0 * pexp * rr * pow(base, pexp - 1.0);
    float slope  = clamp((glassBlobHeight / 100.0) * slopeR, 0.0, 6.0);

    // Surface normal: ellipse outward direction (back in image space), tilted by the dome slope.
    vec2 gdir   = vec2(q.x / ex, q.y / ey);
    vec2 radial = rn > 1e-5 ? normalize(gbRot(ang0) * gdir) : vec2(0.0);
    vec3 N = normalize(vec3(radial * slope, 1.0));

    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);
    float bright = glassBlobLightBright / 100.0;
    float ndl  = dot(N, L);
    float spec = pow(max(dot(N, H), 0.0), max(1.0, glassBlobShininess)) * (glassBlobSpecular / 100.0) * bright;
    float fres = pow(1.0 - max(N.z, 0.0), glassBlobFresnel);

    // Centre magnification + edge refraction of the image beneath (shared by glass/oil/soap).
    float prof  = pow(base, pexp);
    float mag   = clamp((glassBlobMagnify / 100.0) * 0.6 * prof, 0.0, 0.95);
    vec2  magUV = mix(vUV, c, mag);
    float kk    = (glassBlobRefract / 100.0) * 0.15;
    vec2  off   = N.xy * kk;
    float disp  = (glassBlobDispersion / 100.0) * 0.03;
    vec3 bg;
    bg.r = texture(uTex, magUV - off * (1.0 + disp)).r;
    bg.g = texture(uTex, magUV - off).g;
    bg.b = texture(uTex, magUV - off * (1.0 - disp)).b;

    // Directional dimming ("Shadow"): far side fades, lit side keeps full glow.
    float sdim  = glassBlobShadow / 100.0;
    float sideF = clamp(0.5 + 0.5 * ndl, 0.0, 1.0);
    float dirW  = mix(1.0, sideF, sdim);
    float bodyDim = mix(1.0, 0.6 + 0.4 * sideF, sdim);

    vec3 blob;
    if (uMode == 1) {
        // Metallic chrome: NO diffuse body — the whole surface is tinted reflection of a
        // bright environment plus blown highlights. The reflection maps like a round chrome
        // ball using the TRUE screen-radial direction (normalize(d)), NOT the ellipse-skewed
        // normal — so resizing the blob reflects new angles instead of stretching the image.
        float rball = clamp(rNorm, 0.0, 1.0);
        float zball = sqrt(max(1.0 - rball * rball, 0.0));
        vec2  rs    = length(d) > 1e-5 ? normalize(d) : vec2(0.0);
        vec3  Nref  = normalize(vec3(rs * rball, zball));
        vec3  Rv    = reflect(-V, Nref);

        // Reflect the loaded reflection image (ball-mapped), or the scene beneath if none.
        vec3 envc;
        if (uHasSky == 1) envc = texture(uSkyTex, clamp(Rv.xy * 0.5 + 0.5, 0.0, 1.0)).rgb;
        else              envc = texture(uTex, clamp(vUV + Rv.xy * 0.8, 0.0, 1.0)).rgb;
        float kpunch = mix(1.0, 2.2, glassBlobReflect / 100.0);   // Polish → reflection contrast
        envc = clamp((envc - 0.4) * kpunch + 0.4, 0.0, 1.0);

        vec3 tint  = mix(vec3(1.0), glassBlobColor, 0.6);         // metallic tint
        vec3 metal = envc * tint * bodyDim;
        metal += glassBlobLightColor * spec * 2.0;                // blown specular hotspot
        metal += glassBlobLightColor * fres * 0.6;                // bright Fresnel edge
        blob = clamp(metal, 0.0, 1.0);
    } else if (uMode == 2 || uMode == 3) {
        // Oil slick / Soap bubble: domain-warped swirl → thin-film iridescence.
        vec2 seedOff = vec2(gbHash2(vec2(glassBlobSwirlSeed, 1.7)), gbHash2(vec2(glassBlobSwirlSeed, 9.1))) * 50.0;
        vec2 pp   = q * (glassBlobSwirlScale * 0.1 + 0.5) + seedOff;
        float warp = gbFbm(pp + gbFbm(pp + seedOff));
        float thickness = warp + fres * 0.5;
        vec3 irid = 0.5 + 0.5 * cos(6.2831853 * (thickness * glassBlobSwirlFreq) + vec3(0.0, 2.094, 4.188));
        float iri = glassBlobIridescence / 100.0;
        if (uMode == 2) {
            vec3 baseCol = mix(bg, glassBlobColor * 0.25, glassBlobFill / 100.0) * bodyDim;
            vec3 sheen   = irid * iri * (0.4 + 0.6 * fres) * dirW;
            blob = clamp(baseCol + sheen + glassBlobLightColor * spec, 0.0, 1.0);
        } else {
            vec3 sheen = irid * iri * mix(0.25, 1.0, fres) * dirW;
            blob = clamp(bg + sheen + glassBlobLightColor * spec + glassBlobLightColor * fres * dirW * 0.5, 0.0, 1.0);
        }
    } else {
        // Glass.
        vec3 fill = mix(bg, glassBlobColor, glassBlobFill / 100.0) * bodyDim;
        float rimAmt = fres * dirW * bright;
        blob = clamp(fill + glassBlobLightColor * spec + glassBlobLightColor * rimAmt * 0.5, 0.0, 1.0);
    }

    // Composite the blob onto the image, then apply the universal Fade + Blend controls.
    vec3  layer  = mix(src.rgb, blob, cov);
    float weight = ${fade.fnName}();
    vec3  faded  = mix(src.rgb, layer, weight);
    if (!${blend.thresholdFn}(src, vec4(faded, src.a))) { fragColor = src; return; }
    fragColor = vec4(${blend.blendFn}(src.rgb, faded), src.a);
}
`,
};
