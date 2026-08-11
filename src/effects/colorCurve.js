import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('curve');
const blend = buildBlendControl('curve');

export const MAX_NODES   = 12;
export const LUT_SIZE    = 256;
// Mode ids. `value` uses the channel selector (Luma/R/G/B); the rest read/write HSL.
export const CURVE_MODES = ['value', 'hueHue', 'hueSat', 'hueLuma', 'lumaSat'];

const MODE_INT    = { value: 0, hueHue: 1, hueSat: 2, hueLuma: 3, lumaSat: 4 };
const CHANNEL_INT = { luma: 0, r: 1, g: 2, b: 3 };

// Modes whose default curve is a flat "no change" line at y=0.5 (adjustment modes,
// where node y=0.5 = no change, up = boost, down = cut). The rest default to the
// identity diagonal (0,0)->(1,1).
const FLAT_MODES = new Set(['hueSat', 'hueLuma', 'lumaSat']);

/** Default node set for a mode: identity diagonal or flat mid-line. */
export function defaultNodesForMode(mode) {
    const y0 = FLAT_MODES.has(mode) ? 0.5 : 0;
    const y1 = FLAT_MODES.has(mode) ? 0.5 : 1;
    return [{ x: 0, y: y0 }, { x: 1, y: y1 }];
}

/** Flat param-update object that resets one mode's curve to its default nodes. */
export function resetModeUpdates(mode) {
    const nodes = defaultNodesForMode(mode);
    const out = { [`curve_${mode}_count`]: nodes.length };
    for (let i = 0; i < MAX_NODES; i++) {
        const n = nodes[i];
        out[`curve_${mode}_Nx${i}`] = n ? +n.x.toFixed(4) : 0;
        out[`curve_${mode}_Ny${i}`] = n ? +n.y.toFixed(4) : 0;
    }
    return out;
}

/** Read a mode's active nodes from params, x-sorted, clamped to [2, MAX_NODES]. */
export function readNodes(params, mode) {
    const count = Math.max(2, Math.min(MAX_NODES, Math.round(params[`curve_${mode}_count`] ?? 2)));
    const nodes = [];
    for (let i = 0; i < count; i++) {
        nodes.push({
            x: params[`curve_${mode}_Nx${i}`] ?? 0,
            y: params[`curve_${mode}_Ny${i}`] ?? 0,
        });
    }
    nodes.sort((a, b) => a.x - b.x);
    return nodes;
}

// Monotone cubic (Fritsch–Carlson) interpolation → 256-entry LUT in [0,1].
// Shared by bindUniforms (GPU upload) and the widget (curve polyline) so the drawn
// line and the applied result never diverge.
export function sampleCurveLUT(nodes) {
    const lut = new Float32Array(LUT_SIZE);
    const n = nodes.length;
    const xs = nodes.map(p => p.x);
    const ys = nodes.map(p => p.y);

    // Secant slopes between successive points.
    const delta = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
        const dx = xs[i + 1] - xs[i];
        delta[i] = dx > 1e-6 ? (ys[i + 1] - ys[i]) / dx : 0;
    }
    // Initial tangents.
    const m = new Array(n);
    m[0] = delta[0];
    m[n - 1] = delta[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = (delta[i - 1] + delta[i]) / 2;
    // Enforce monotonicity.
    for (let i = 0; i < n - 1; i++) {
        if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
        const a = m[i] / delta[i];
        const b = m[i + 1] / delta[i];
        const s = a * a + b * b;
        if (s > 9) {
            const t = 3 / Math.sqrt(s);
            m[i] = t * a * delta[i];
            m[i + 1] = t * b * delta[i];
        }
    }

    for (let j = 0; j < LUT_SIZE; j++) {
        const x = j / (LUT_SIZE - 1);
        let y;
        if (x <= xs[0]) {
            y = ys[0];
        } else if (x >= xs[n - 1]) {
            y = ys[n - 1];
        } else {
            let i = 0;
            while (i < n - 1 && x > xs[i + 1]) i++;
            const h = xs[i + 1] - xs[i];
            const t = h > 1e-6 ? (x - xs[i]) / h : 0;
            const t2 = t * t, t3 = t2 * t;
            const h00 = 2 * t3 - 3 * t2 + 1;
            const h10 = t3 - 2 * t2 + t;
            const h01 = -2 * t3 + 3 * t2;
            const h11 = t3 - t2;
            y = h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
        }
        lut[j] = Math.min(1, Math.max(0, y));
    }
    return lut;
}

function buildCurveParamDefs() {
    const out = {};
    for (const mode of CURVE_MODES) {
        const nodes = defaultNodesForMode(mode);
        out[`curve_${mode}_count`] = { default: nodes.length };
        for (let i = 0; i < MAX_NODES; i++) {
            const n = nodes[i];
            out[`curve_${mode}_Nx${i}`] = { default: n ? +n.x.toFixed(4) : 0 };
            out[`curve_${mode}_Ny${i}`] = { default: n ? +n.y.toFixed(4) : 0 };
        }
    }
    return out;
}

// Every per-node coordinate + count param, driven by the canvas widget (hidden
// from the generic slider panel via handleParams).
const NODE_PARAM_KEYS = (() => {
    const keys = [];
    for (const mode of CURVE_MODES) {
        keys.push(`curve_${mode}_count`);
        for (let i = 0; i < MAX_NODES; i++) keys.push(`curve_${mode}_Nx${i}`, `curve_${mode}_Ny${i}`);
    }
    return keys;
})();

export const colorCurveEffect = {
    name: 'colorCurve',
    label: 'Color Curve',
    kind: 'glsl',
    paramKeys: ['curveMode', 'curveChannel', 'curveShowHistogram', ...fade.paramKeys, ...blend.paramKeys],
    handleParams: [...NODE_PARAM_KEYS, ...fade.handleParams],
    uiGroups: (p) => {
        const groups = [{ keys: p.curveMode === 'value' ? ['curveMode', 'curveChannel'] : ['curveMode'] }];
        groups.push({ keys: ['curveShowHistogram'] });
        groups.push(blend.uiGroup, fade.uiGroup);
        return groups;
    },
    params: {
        curveEnabled:       { default: false, label: 'Enable' },
        curveMode:          { default: 'value', label: 'Mode', options: [
            ['value',   'Value'],
            ['hueHue',  'Hue vs Hue'],
            ['hueSat',  'Hue vs Saturation'],
            ['hueLuma', 'Hue vs Luma'],
            ['lumaSat', 'Luma vs Saturation'],
        ] },
        curveChannel:       { default: 'luma', label: 'Channel', options: [
            ['luma', 'Luma'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue'],
        ] },
        curveShowHistogram: { default: true, label: 'Show Histogram' },
        ...buildCurveParamDefs(),
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.curveEnabled,
    overlays: { fade: fade.overlay },
    bindUniforms: (gl, prog, p) => {
        const setInt = (name, v) => { const loc = prog._locs[name]; if (loc != null) gl.uniform1i(loc, v); };
        const mode = CURVE_MODES.includes(p.curveMode) ? p.curveMode : 'value';
        setInt('curveMode', MODE_INT[mode] ?? 0);
        setInt('curveChannel', CHANNEL_INT[p.curveChannel] ?? 0);

        const lutLoc = prog._locs['uCurve[0]'];
        if (lutLoc != null) gl.uniform1fv(lutLoc, sampleCurveLUT(readNodes(p, mode)));

        fade.bindUniforms(gl, prog, p);
        blend.bindUniforms(gl, prog, p);
    },
    glsl: `
uniform float uCurve[${LUT_SIZE}];
uniform int   curveMode;      // 0 value, 1 hueHue, 2 hueSat, 3 hueLuma, 4 lumaSat
uniform int   curveChannel;   // 0 luma, 1 r, 2 g, 3 b
${fade.glsl}
${blend.glsl}

vec3 curveRgb2Hsl(vec3 c) {
    float maxC = max(c.r, max(c.g, c.b));
    float minC = min(c.r, min(c.g, c.b));
    float l = (maxC + minC) * 0.5;
    float d = maxC - minC;
    float s = (d < 0.0001) ? 0.0 : d / (1.0 - abs(2.0 * l - 1.0));
    float h = 0.0;
    if (d > 0.0001) {
        if (maxC == c.r)      h = mod((c.g - c.b) / d, 6.0);
        else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
        else                  h = (c.r - c.g) / d + 4.0;
        h /= 6.0;
    }
    return vec3(h, s, l);
}

vec3 curveHsl2Rgb(vec3 hsl) {
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

float sampleCurve(float x) {
    x = clamp(x, 0.0, 1.0) * float(${LUT_SIZE} - 1);
    int i0 = int(floor(x));
    int i1 = min(i0 + 1, ${LUT_SIZE} - 1);
    return mix(uCurve[i0], uCurve[i1], x - float(i0));
}

void main() {
    vec4 c = texture(uTex, vUV);
    vec3 adj = c.rgb;
    if (curveMode == 0) {
        if      (curveChannel == 1) adj.r = sampleCurve(c.r);
        else if (curveChannel == 2) adj.g = sampleCurve(c.g);
        else if (curveChannel == 3) adj.b = sampleCurve(c.b);
        else {
            // Luma: remap luminance, keep color ratios.
            float y  = dot(c.rgb, vec3(0.299, 0.587, 0.114));
            float ny = sampleCurve(y);
            adj = clamp(c.rgb * (ny / max(y, 1e-4)), 0.0, 1.0);
        }
    } else {
        vec3 hsl = curveRgb2Hsl(c.rgb);
        if      (curveMode == 1) hsl.x = fract(sampleCurve(hsl.x));                              // Hue -> Hue
        else if (curveMode == 2) hsl.y = clamp(hsl.y + (sampleCurve(hsl.x) - 0.5) * 2.0, 0.0, 1.0); // Hue -> Sat
        else if (curveMode == 3) hsl.z = clamp(hsl.z + (sampleCurve(hsl.x) - 0.5),       0.0, 1.0); // Hue -> Luma
        else                     hsl.y = clamp(hsl.y + (sampleCurve(hsl.z) - 0.5) * 2.0, 0.0, 1.0); // Luma -> Sat
        adj = curveHsl2Rgb(hsl);
    }

    float weight = ${fade.fnName}();
    vec3 faded = mix(c.rgb, adj, weight);
    if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
}
`,
};
