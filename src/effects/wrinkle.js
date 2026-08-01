import { buildFadeControl, buildBlendControl } from './controls/index.js';
import { resolveColorKey, STANDARD_COLOR_OPTIONS } from './colorOptions.js';

const fade  = buildFadeControl('wrinkle');
const blend = buildBlendControl('wrinkle');

const MODE_CODES = { linear: 0, concentric: 1 };

function hexToRgb01(hex) {
    const n = parseInt((hex || '#ffffff').replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const wrinkleEffect = {
    name: 'wrinkle',
    label: 'Wrinkle',
    kind: 'glsl',
    // Numeric render params auto-bind to like-named uniforms. Mode (select), sheen
    // color, angle→radians and the center vec2 are bound manually below.
    paramKeys: ['wrinkleNumber', 'wrinkleDensity', 'wrinkleSharpness', 'wrinkleKink',
                'wrinkleHeight', 'wrinkleGather', 'wrinkleLightAngle',
                'wrinkleRefraction', 'wrinkleSheen', 'wrinkleSquareness', 'wrinkleSeed',
                ...fade.paramKeys, ...blend.paramKeys],
    // Center + angle are edited via canvas handles, not sliders.
    handleParams: ['wrinkleCenterX', 'wrinkleCenterY', 'wrinkleAngle', ...fade.handleParams],
    // Hand-rolled overlay (wrinkleOverlay.js) draws the position/angle handle AND the
    // fade shape inline, so we do NOT use the generic overlays.fade path here.
    overlays: {},
    uiGroups: (p) => {
        const mode = p.wrinkleMode ?? 'linear';
        const keys = ['wrinkleMode', 'wrinkleNumber', 'wrinkleDensity', 'wrinkleSharpness',
                      'wrinkleKink', 'wrinkleHeight', 'wrinkleGather', 'wrinkleLightAngle'];
        if (mode === 'concentric') keys.push('wrinkleSquareness');
        keys.push('wrinkleRefraction', 'wrinkleSheen', 'wrinkleSheenColor', 'wrinkleShuffleBtn');
        return [{ keys }, blend.uiGroup, fade.uiGroup];
    },
    params: {
        wrinkleEnabled:     { default: false, label: 'Enable' },
        wrinkleMode:        { default: 'linear', label: 'Mode', options: [['linear', 'Linear'], ['concentric', 'Concentric']] },
        wrinkleNumber:      { default: 40, min: 1, max: 100, label: 'Number' },
        wrinkleDensity:     { default: 55, min: 1, max: 100, label: 'Density' },
        wrinkleSharpness:   { default: 65, min: 0, max: 100, label: 'Sharpness' },
        wrinkleKink:        { default: 0,  min: 0, max: 100, label: 'Kink' },
        wrinkleHeight:      { default: 55, min: 0, max: 100, label: 'Height' },
        wrinkleGather:      { default: 0,  min: -100, max: 100, label: 'Gather' },
        wrinkleLightAngle:  { default: 135, min: 0, max: 360, label: 'Light Angle' },
        wrinkleSquareness:  { default: 0,  min: 0, max: 100, label: 'Squareness' },
        wrinkleAngle:       { default: 0,  min: -180, max: 180, label: 'Angle' },
        wrinkleCenterX:     { default: 0,  min: -50, max: 50 },
        wrinkleCenterY:     { default: 0,  min: -50, max: 50 },
        wrinkleRefraction:  { default: 5,  min: 0, max: 100, label: 'Refraction' },
        wrinkleSheen:       { default: 70, min: 0, max: 100, label: 'Sheen' },
        wrinkleSheenColor:  { default: 'palette7', type: 'paletteSelect', options: STANDARD_COLOR_OPTIONS, label: 'Sheen Color' },
        wrinkleSeed:        { default: 1,  min: 1, max: 999, step: 1, hidden: true },
        wrinkleShuffleBtn:  { default: null, button: 'wrinkleSeed', label: 'Shuffle' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.wrinkleEnabled,
    bindUniforms: (gl, prog, p) => {
        const locs = prog._locs;
        const setI  = (k, v) => { if (locs[k] != null) gl.uniform1i(locs[k], v); };
        const setF  = (k, v) => { if (locs[k] != null) gl.uniform1f(locs[k], v); };
        const set2f = (k, a, b) => { if (locs[k] != null) gl.uniform2f(locs[k], a, b); };
        const set3v = (k, a) => { if (locs[k] != null) gl.uniform3fv(locs[k], a); };

        setI('wrinkleMode', MODE_CODES[p.wrinkleMode ?? 'linear'] ?? 0);
        setF('wrinkleAngle', (p.wrinkleAngle ?? 0) * Math.PI / 180);

        // Center stored as a fraction of resolution, y-down (shader uses y-down px).
        set2f('wrinkleCenter', 0.5 + (p.wrinkleCenterX ?? 0) / 100,
                               0.5 - (p.wrinkleCenterY ?? 0) / 100);

        const hex = resolveColorKey(p.wrinkleSheenColor, p._activePalette) ?? '#ffffff';
        set3v('wrinkleSheenColor', hexToRgb01(hex));

        fade.bindUniforms(gl, prog, p);
        blend.bindUniforms(gl, prog, p);
    },
    glsl: `
uniform int   wrinkleMode;
uniform float wrinkleNumber;
uniform float wrinkleDensity;
uniform float wrinkleSharpness;
uniform float wrinkleKink;
uniform float wrinkleHeight;
uniform float wrinkleGather;
uniform float wrinkleLightAngle;
uniform float wrinkleSquareness;
uniform float wrinkleAngle;
uniform vec2  wrinkleCenter;
uniform float wrinkleRefraction;
uniform float wrinkleSheen;
uniform vec3  wrinkleSheenColor;
uniform float wrinkleSeed;
${fade.glsl}
${blend.glsl}
float wrinkleHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// 2-D value noise.
float wrinkleVN2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = wrinkleHash2(i);
    float b = wrinkleHash2(i + vec2(1.0, 0.0));
    float c = wrinkleHash2(i + vec2(0.0, 1.0));
    float d = wrinkleHash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Ridged multifractal — sum of octaves of 1-|noise|, sharpened into crease lines.
// 'detail' is a FRACTIONAL octave count — the top octave fades in continuously so
// Density ramps smoothly instead of snapping between whole octaves.
float wrinkleRidged(vec2 p, float detail, float sharp) {
    float ridgeExp = mix(1.0, 4.0, sharp);
    float sum = 0.0, amp = 0.5, freq = 1.0, norm = 0.0;
    for (int i = 0; i < 8; i++) {
        float w = clamp(detail - float(i), 0.0, 1.0);
        if (w <= 0.0) break;
        float fi = float(i);
        float n = wrinkleVN2(p * freq + fi * 17.3 + wrinkleSeed);
        float r = 1.0 - abs(n * 2.0 - 1.0);
        r = pow(clamp(r, 0.0, 1.0), ridgeExp);
        sum  += r * amp * w;
        norm += amp * w;
        freq *= 2.0; amp *= 0.55;
    }
    return sum / max(norm, 0.001);
}

// Bilinear (un-smoothed) value noise — straight segments meeting at hard corners.
// Its slope is discontinuous at the lattice, which is what kinks the crease paths.
float wrinkleLinNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = wrinkleHash2(i);
    float b = wrinkleHash2(i + vec2(1.0, 0.0));
    float c = wrinkleHash2(i + vec2(0.0, 1.0));
    float d = wrinkleHash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Crumpled-film height at an aspect-corrected uv point.
float wrinkleHeightAt(vec2 uvp, vec2 centerAdj, float scale) {
    vec2 P;
    if (wrinkleMode == 1) {
        vec2  rel  = uvp - centerAdj;
        // Ring metric: circle (L2) → true square (Chebyshev/L∞) so the highest Squareness
        // gives genuinely sharp 90° corners — and L∞'s gradient kink puts crease lines
        // along the diagonals out to each corner, like plastic folded over a box.
        float sqf  = wrinkleSquareness / 100.0;
        float rInf = max(abs(rel.x), abs(rel.y));
        float rr   = mix(length(rel), rInf, clamp(sqf * 1.15, 0.0, 1.0));
        float ang  = atan(rel.y, rel.x);
        // Ridges run along RADIUS only. Undulate the radius with seam-free angular noise
        // (fed cos/sin of the angle, continuous across ±π) so rings wave organically.
        vec2  ac   = vec2(cos(ang), sin(ang));
        float ring = 1.0 / (scale * 3.0);
        rr += (wrinkleVN2(ac * 0.6 + wrinkleSeed)       - 0.5) * ring * 0.55;
        rr += (wrinkleVN2(ac * 1.3 + wrinkleSeed * 1.7) - 0.5) * ring * 0.28;
        // Badly-wrapped-box corners: bunch extra creases at the square's corners (where
        // |x|≈|y|, i.e. the diagonals), scaled by how square it is.
        float cf = pow(min(abs(rel.x), abs(rel.y)) / max(rInf, 1e-4), 3.0) * sqf;
        rr += (wrinkleVN2(ac * 4.0 + wrinkleSeed * 2.3) - 0.5) * ring * cf * 1.8;
        // Kink (concentric): perturb the radius with a cornered (piecewise-linear) noise
        // of the ANGLE, so the ring paths take hard turns — the analog of linear's kink.
        // Constant amplitude, frequency (number of corners) grows with the slider.
        float kinkC = wrinkleKink / 100.0;
        if (kinkC > 0.0) {
            float kf = mix(0.8, 5.0, kinkC);
            rr += (wrinkleLinNoise(ac * kf + wrinkleSeed * 3.7) - 0.5) * ring * 0.6;
        }
        P = vec2(rr * scale * 3.0, 0.0);
    } else {
        float a = wrinkleAngle;
        mat2  Rm = mat2(cos(a), -sin(a), sin(a), cos(a));
        vec2  q  = Rm * (uvp - centerAdj);   // anchor the field to the position handle
        q.y /= 9.0;                    // strong anisotropy: creases run near-parallel
        P = q * scale;
    }
    // Domain warp: gives the creases organic, wandering paths (baked in). Kept gentle
    // in linear mode so near-parallel lines stay separated instead of crossing.
    float warpAmt = (wrinkleMode == 1) ? 0.4 : 0.45;
    vec2  w = vec2(wrinkleVN2(P * 0.6 + 3.1 + wrinkleSeed * 0.13),
                   wrinkleVN2(P * 0.6 + 8.7 + wrinkleSeed * 0.13)) * 2.0 - 1.0;
    P += w * warpAmt;

    // Kink (linear): displace the crease paths with a piecewise-LINEAR (un-smoothed)
    // noise. Its slope jumps at the lattice, so an otherwise-gentle crease takes an
    // occasional HARD turn and continues. Higher Kink packs the lattice → more turns.
    // (Concentric does its own angular kink above.)
    float kink = wrinkleKink / 100.0;
    if (kink > 0.0 && wrinkleMode == 0) {
        float kf = mix(0.6, 5.0, kink);
        vec2  kw = vec2(wrinkleLinNoise(P * kf + 51.0 + wrinkleSeed),
                        wrinkleLinNoise(P * kf + 71.0 + wrinkleSeed)) * 2.0 - 1.0;
        P += kw * 0.5;
    }

    float detail = mix(1.5, 6.5, wrinkleDensity / 100.0);
    return wrinkleRidged(P, detail, wrinkleSharpness / 100.0);
}

void main() {
    vec4 c = texture(uTex, vUV);
    vec3 layer = c.rgb;

    if (wrinkleHeight > 0.0 && (wrinkleSheen > 0.0 || wrinkleRefraction > 0.0)) {
        float aspect = uResolution.x / max(uResolution.y, 1.0);

        // Position: pan the whole skin rigidly by translating the screen coordinate up
        // front, so gather + wrinkles all move together as one piece (no morphing). The
        // pattern is a function of vT = vUV − posOff, so moving the handle is a pure shift.
        vec2  posOff = vec2(wrinkleCenter.x - 0.5, 0.5 - wrinkleCenter.y);
        vec2  vT = vUV - posOff;

        // Gather: warp the sample domain around the (panned) center so creases bunch toward
        // the edges (+) or the middle (−). Exponent >1 compresses features at the border,
        // <1 at the center; 0 is uniform.
        float gp  = pow(4.0, wrinkleGather / 50.0);
        vec2  gv  = vT - 0.5;
        vec2  uvG = 0.5 + sign(gv) * pow(abs(gv) * 2.0, vec2(gp)) * 0.5;

        vec2  uvp = vec2(uvG.x * aspect, uvG.y);
        vec2  centerAdj = vec2(0.5 * aspect, 0.5);   // pan already applied via vT

        // Frequency mapped exponentially so Number feels even across its whole range.
        float scale = 1.5 * pow(14.0 / 1.5, wrinkleNumber / 100.0);
        float e  = 0.12 / scale;                        // feature-relative sample step
        float hC = wrinkleHeightAt(uvp,                 centerAdj, scale);
        float hX = wrinkleHeightAt(uvp + vec2(e, 0.0),  centerAdj, scale);
        float hY = wrinkleHeightAt(uvp + vec2(0.0, e),  centerAdj, scale);
        // Slope normalized by frequency so the surface normal doesn't instantly
        // saturate — that saturation was why Height did everything by ~1 then nothing.
        vec2  grad = clamp((vec2(hX - hC, hY - hC) / e) / scale, vec2(-6.0), vec2(6.0));

        // Surface normal — relief (Height) now scales roughly linearly, no early cliff.
        float relief = (wrinkleHeight / 100.0) * 1.2;
        vec3  N = normalize(vec3(-grad * relief, 1.0));

        // Directional specular — bright creases on the fold faces toward the light.
        float la   = wrinkleLightAngle * 3.14159265 / 180.0;
        vec3  Ldir = normalize(vec3(cos(la), sin(la), 0.6));
        vec3  Hh   = normalize(Ldir + vec3(0.0, 0.0, 1.0));
        float shininess = 8.0 * pow(130.0 / 8.0, wrinkleSharpness / 100.0);   // exponential → even
        float spec = pow(max(dot(N, Hh), 0.0), shininess);
        vec3  specular = wrinkleSheenColor * (spec * (wrinkleSheen / 100.0) * 2.2);

        // Subtle groove shadow so it isn't purely additive.
        float ndl    = max(dot(N, Ldir), 0.0);
        float shadow = mix(1.0, 0.7 + 0.3 * ndl, (wrinkleHeight / 100.0) * 0.6);

        // Refraction (low by default): bend the underlying image along the normal.
        float refr01 = wrinkleRefraction / 100.0;
        vec2  disp   = vec2(N.x / max(aspect, 0.001), N.y) * refr01 * 0.06;
        vec3  base   = texture(uTex, clamp(vUV + disp, 0.0, 1.0)).rgb;

        vec3 lit = base * shadow;
        layer = 1.0 - (1.0 - lit) * (1.0 - clamp(specular, 0.0, 1.0));   // screen the creases
    }

    float weight = ${fade.fnName}();
    vec3  faded  = mix(c.rgb, layer, weight);
    if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
}
`,
};
