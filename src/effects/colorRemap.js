import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('invert');
const blend = buildBlendControl('invert');

// Palette-only options. Keys are p0..p7 (resolved against the active palette in
// both the renderer and the swatch control).
const COLOR_OPTIONS = [
    ['p0', 'Color Palette 1'], ['p1', 'Color Palette 2'], ['p2', 'Color Palette 3'], ['p3', 'Color Palette 4'],
    ['p4', 'Color Palette 5'], ['p5', 'Color Palette 6'], ['p6', 'Color Palette 7'], ['p7', 'Color Palette 8'],
];
// Optional stops (C/D/E) can also be turned off.
const COLOR_OPTIONS_OPT = [['none', 'None'], ...COLOR_OPTIONS];

// --- Hue Remap grid ---------------------------------------------------------
// Hue mode is a 2D color-region remapper. The HSL square is partitioned into a
// deformable lattice of dim×dim cells (dim = 2/3/4 → 4/9/16 cells). Nodes are an
// (dim+1)×(dim+1) lattice, stored row-major as flat params; idx = row*(dim+1)+col.
// Edge/corner nodes stay pinned to the unit square so the lattice always tiles it
// fully — every pixel color lands in exactly one cell.
export const GRID_MAX_DIM   = 4;
export const GRID_MAX_NODES = (GRID_MAX_DIM + 1) * (GRID_MAX_DIM + 1); // 25
export const GRID_MAX_CELLS = GRID_MAX_DIM * GRID_MAX_DIM;             // 16
export const GRID_DEFAULT_DIM = 3;

/** Even-lattice node coords for a given dim, as a flat param-update object. */
export function evenLatticeUpdates(dim) {
    const out = {};
    const n = dim + 1;
    for (let i = 0; i < GRID_MAX_NODES; i++) {
        let x = 0, y = 0;
        if (i < n * n) {
            const r = Math.floor(i / n), c = i % n;
            x = c / dim;
            y = r / dim;
        }
        out[`invertGridNx${i}`] = +x.toFixed(4);
        out[`invertGridNy${i}`] = +y.toFixed(4);
    }
    return out;
}

function buildGridParamDefs() {
    const out = {};
    const lattice = evenLatticeUpdates(GRID_DEFAULT_DIM);
    for (let i = 0; i < GRID_MAX_NODES; i++) {
        out[`invertGridNx${i}`] = { default: lattice[`invertGridNx${i}`] };
        out[`invertGridNy${i}`] = { default: lattice[`invertGridNy${i}`] };
    }
    for (let i = 0; i < GRID_MAX_CELLS; i++) {
        out[`invertGridColor${i}`] = { default: `p${i % 8}`, label: `Cell ${i + 1}`, type: 'paletteSelect', options: COLOR_OPTIONS };
    }
    return out;
}

export const colorRemapEffect = {
    name: 'colorRemap',
    label: 'Color Remap',
    kind: 'glsl',
    paramKeys: ['invertMode', 'invertColorA', 'invertColorB', 'invertColorC', 'invertColorD', 'invertColorE',
                'invertGridDim', 'invertGridAxis', 'invertGridOutput', ...fade.paramKeys, ...blend.paramKeys],
    handleParams: ['invertPosA', 'invertPosB', 'invertPosC', 'invertPosD', 'invertPosE', ...fade.handleParams],
    // Regenerate the node lattice when the grid size changes.
    paramActions: {
        invertGridDim: (val) => evenLatticeUpdates(parseInt(val, 10) || GRID_DEFAULT_DIM),
    },
    uiGroups: (p) => {
        const mode = p.invertMode ?? 'simple';
        const groups = [{ keys: ['invertMode'] }];
        if (mode === 'luminance') {
            groups.push({
                keys: ['invertColorA', 'invertColorC', 'invertColorD', 'invertColorE', 'invertColorB'],
                labels: { invertColorA: 'Shadows', invertColorC: 'Dark Mid', invertColorD: 'Mid',
                          invertColorE: 'Light Mid', invertColorB: 'Highlights' },
            });
        } else if (mode === 'hue') {
            // The grid swatches/nodes are driven by the custom canvas control
            // (see stackControls.js); only the discrete selectors render here.
            groups.push({ keys: ['invertGridDim', 'invertGridAxis', 'invertGridOutput'] });
        }
        groups.push(blend.uiGroup, fade.uiGroup);
        return groups;
    },
    params: {
        invertEnabled:   { default: false, label: 'Enable' },
        invertMode:      { default: 'simple', label: 'Mode', options: [['luminance', 'Luminance Remap'], ['hue', 'Hue Remap'], ['simple', 'Simple Invert']] },
        invertColorA:    { default: 'p0',   label: 'Shadows',    type: 'paletteSelect', options: COLOR_OPTIONS },
        invertColorB:    { default: 'p7',   label: 'Highlights', type: 'paletteSelect', options: COLOR_OPTIONS },
        invertColorC:    { default: 'none', label: 'Dark Mid',   type: 'paletteSelect', options: COLOR_OPTIONS_OPT },
        invertColorD:    { default: 'none', label: 'Mid',        type: 'paletteSelect', options: COLOR_OPTIONS_OPT },
        invertColorE:    { default: 'none', label: 'Light Mid',  type: 'paletteSelect', options: COLOR_OPTIONS_OPT },
        invertPosA:      { default: 0    },
        invertPosC:      { default: 0.25 },
        invertPosD:      { default: 0.5  },
        invertPosE:      { default: 0.75 },
        invertPosB:      { default: 1    },
        invertGridDim:    { default: String(GRID_DEFAULT_DIM), label: 'Grid Size', options: [['2', '2×2 (4 cells)'], ['3', '3×3 (9 cells)'], ['4', '4×4 (16 cells)']] },
        invertGridAxis:   { default: 'hs', label: 'Picker Axes', options: [['hs', 'Hue × Saturation'], ['hl', 'Hue × Lightness']] },
        invertGridOutput: { default: 'flat', label: 'Output', options: [['flat', 'Flat Replace'], ['preserve', 'Preserve Lightness']] },
        ...buildGridParamDefs(),
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.invertEnabled,
    overlays: { fade: fade.overlay },
    bindUniforms: (gl, prog, p) => {
        const colorVec = {
            r: [1,0,0], g: [0,1,0], b: [0,0,1],
            c: [0,1,1], y: [1,1,0], m: [1,0,1],
            bk: [0,0,0], w: [1,1,1],
        };
        const hexToRgb = (hex) => {
            const h = hex.replace('#', '');
            return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
        };
        const resolveColor = (key, fallback) => {
            if (colorVec[key]) return colorVec[key];
            if (key?.startsWith('p') && p._activePalette) {
                const hex = p._activePalette[parseInt(key.slice(1))];
                if (hex) return hexToRgb(hex);
            }
            return fallback;
        };
        const setInt = (name, v) => { const loc = prog._locs[name]; if (loc != null) gl.uniform1i(loc, v); };

        const modeMap = { luminance: 0, hue: 1, simple: 2 };
        setInt('invertMode', modeMap[p.invertMode ?? 'luminance'] ?? 0);

        // --- Luminance gradient stops (A, [C], [D], [E], B) ---
        const stops = [resolveColor(p.invertColorA, [1,1,1])];
        const poses = [p.invertPosA ?? 0];
        if (p.invertColorC !== 'none') { stops.push(resolveColor(p.invertColorC, [0,0,0])); poses.push(p.invertPosC ?? 0.25); }
        if (p.invertColorD !== 'none') { stops.push(resolveColor(p.invertColorD, [0,0,0])); poses.push(p.invertPosD ?? 0.5);  }
        if (p.invertColorE !== 'none') { stops.push(resolveColor(p.invertColorE, [0,0,0])); poses.push(p.invertPosE ?? 0.75); }
        stops.push(resolveColor(p.invertColorB, [0,0,0]));
        poses.push(p.invertPosB ?? 1);

        setInt('invertStopCount', stops.length);
        for (let i = 0; i < 5; i++) {
            const sLoc = prog._locs[`invertStop${i}`];
            const pLoc = prog._locs[`invertStopPos${i}`];
            if (sLoc != null) gl.uniform3f(sLoc, ...(stops[i] ?? [0,0,0]));
            if (pLoc != null) gl.uniform1f(pLoc,   poses[i] ?? 1);
        }

        // --- Hue Remap grid ---
        setInt('invertGridDim', parseInt(p.invertGridDim ?? String(GRID_DEFAULT_DIM), 10) || GRID_DEFAULT_DIM);
        setInt('invertGridAxis', p.invertGridAxis === 'hl' ? 1 : 0);
        setInt('invertGridOutput', p.invertGridOutput === 'preserve' ? 1 : 0);

        const nodesLoc = prog._locs['invertGridNodes[0]'];
        if (nodesLoc != null) {
            const arr = new Float32Array(GRID_MAX_NODES * 2);
            for (let i = 0; i < GRID_MAX_NODES; i++) {
                arr[i*2]   = p[`invertGridNx${i}`] ?? 0;
                arr[i*2+1] = p[`invertGridNy${i}`] ?? 0;
            }
            gl.uniform2fv(nodesLoc, arr);
        }
        const colsLoc = prog._locs['invertGridColors[0]'];
        if (colsLoc != null) {
            const arr = new Float32Array(GRID_MAX_CELLS * 3);
            for (let i = 0; i < GRID_MAX_CELLS; i++) {
                const rgb = resolveColor(p[`invertGridColor${i}`], [0,0,0]);
                arr[i*3] = rgb[0]; arr[i*3+1] = rgb[1]; arr[i*3+2] = rgb[2];
            }
            gl.uniform3fv(colsLoc, arr);
        }

        fade.bindUniforms(gl, prog, p);
        blend.bindUniforms(gl, prog, p);
    },
    glsl: `
uniform int   invertMode;
uniform int   invertStopCount;
uniform vec3  invertStop0;
uniform vec3  invertStop1;
uniform vec3  invertStop2;
uniform vec3  invertStop3;
uniform vec3  invertStop4;
uniform float invertStopPos0;
uniform float invertStopPos1;
uniform float invertStopPos2;
uniform float invertStopPos3;
uniform float invertStopPos4;
uniform int   invertGridDim;
uniform int   invertGridAxis;    // 0 = hue×sat, 1 = hue×light
uniform int   invertGridOutput;  // 0 = flat, 1 = preserve lightness
uniform vec2  invertGridNodes[${GRID_MAX_NODES}];
uniform vec3  invertGridColors[${GRID_MAX_CELLS}];
${fade.glsl}
${blend.glsl}
vec3 invertRgbToHsl(vec3 col) {
    float maxC = max(col.r, max(col.g, col.b));
    float minC = min(col.r, min(col.g, col.b));
    float l = (maxC + minC) * 0.5;
    float h = 0.0, s = 0.0;
    float d = maxC - minC;
    if (d > 1e-5) {
        s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
        if      (maxC == col.r) h = mod((col.g - col.b) / d, 6.0);
        else if (maxC == col.g) h = (col.b - col.r) / d + 2.0;
        else                    h = (col.r - col.g) / d + 4.0;
        h /= 6.0;
        if (h < 0.0) h += 1.0;
    }
    return vec3(h, s, l);
}
float invertHue2Rgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
    if (t < 1.0/2.0) return q;
    if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
    return p;
}
vec3 invertHslToRgb(vec3 hsl) {
    float h = hsl.x, s = hsl.y, l = hsl.z;
    if (s <= 0.0) return vec3(l);
    float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
    float p = 2.0 * l - q;
    return vec3(invertHue2Rgb(p, q, h + 1.0/3.0), invertHue2Rgb(p, q, h), invertHue2Rgb(p, q, h - 1.0/3.0));
}
float invertCross2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
// Winding-agnostic, edge-inclusive point-in-triangle test.
bool invertInTri(vec2 pt, vec2 a, vec2 b, vec2 c) {
    float d1 = invertCross2(b - a, pt - a);
    float d2 = invertCross2(c - b, pt - b);
    float d3 = invertCross2(a - c, pt - c);
    bool hasNeg = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0);
    bool hasPos = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0);
    return !(hasNeg && hasPos);
}
void main() {
    vec4 c = texture(uTex, vUV);
    vec3 adjusted = c.rgb;
    if (invertMode == 2) {
        adjusted = vec3(1.0 - c.r, 1.0 - c.g, 1.0 - c.b);
    } else if (invertMode == 1) {
        // Hue Remap: locate the lattice cell containing this pixel's color.
        vec3 hsl = invertRgbToHsl(c.rgb);
        vec2 pt = vec2(clamp(hsl.x, 0.0, 1.0),
                       clamp(invertGridAxis == 1 ? hsl.z : hsl.y, 0.0, 1.0));
        int dim = invertGridDim;
        int n = dim + 1;
        bool found = false;
        for (int r = 0; r < ${GRID_MAX_DIM} && !found; r++) {
            if (r >= dim) break;
            for (int col = 0; col < ${GRID_MAX_DIM}; col++) {
                if (col >= dim) break;
                vec2 A = invertGridNodes[r * n + col];
                vec2 B = invertGridNodes[r * n + col + 1];
                vec2 C = invertGridNodes[(r + 1) * n + col + 1];
                vec2 D = invertGridNodes[(r + 1) * n + col];
                if (invertInTri(pt, A, B, C) || invertInTri(pt, A, C, D)) {
                    vec3 target = invertGridColors[r * dim + col];
                    if (invertGridOutput == 1) {
                        vec3 thsl = invertRgbToHsl(target);
                        adjusted = invertHslToRgb(vec3(thsl.x, thsl.y, hsl.z));
                    } else {
                        adjusted = target;
                    }
                    found = true;
                    break;
                }
            }
        }
    } else {
        float val = 0.299*c.r + 0.587*c.g + 0.114*c.b;
        int seg = 0;
        if (invertStopCount > 1 && val >= invertStopPos1) seg = 1;
        if (invertStopCount > 2 && val >= invertStopPos2) seg = 2;
        if (invertStopCount > 3 && val >= invertStopPos3) seg = 3;
        if (invertStopCount > 4 && val >= invertStopPos4) seg = 4;
        seg = min(seg, invertStopCount - 2);
        float plo = seg==0 ? invertStopPos0 : seg==1 ? invertStopPos1 : seg==2 ? invertStopPos2 : invertStopPos3;
        float phi = seg==0 ? invertStopPos1 : seg==1 ? invertStopPos2 : seg==2 ? invertStopPos3 : invertStopPos4;
        vec3  clo = seg==0 ? invertStop0 : seg==1 ? invertStop1 : seg==2 ? invertStop2 : invertStop3;
        vec3  chi = seg==0 ? invertStop1 : seg==1 ? invertStop2 : seg==2 ? invertStop3 : invertStop4;
        adjusted = mix(clo, chi, clamp((val - plo) / max(phi - plo, 0.0001), 0.0, 1.0));
    }
    float weight = ${fade.fnName}();
    vec3 faded = mix(c.rgb, adjusted, weight);
    if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
}
`,
};
