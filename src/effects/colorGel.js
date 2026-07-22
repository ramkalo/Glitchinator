import { buildFadeControl, buildBlendControl } from './controls/index.js';
import { resolveColorKey, STANDARD_COLOR_OPTIONS } from './colorOptions.js';

const fade  = buildFadeControl('colorGel');
const blend = buildBlendControl('colorGel');

// Colors 2–4 can be switched off with the ✕ swatch; 1 and 5 anchor the gradient.
const OPTIONAL_COLOR_OPTIONS = [['none', 'None'], ...STANDARD_COLOR_OPTIONS];

// Gradient shape. 'gradient' is the legacy name for what is now 'linear', so
// normalise it here and every reader gets it right for free.
export const gelMode = (p) => {
    const m = p.colorGelMode ?? 'solid';
    return m === 'gradient' ? 'linear' : m;
};
const isRadial = (p) => gelMode(p) === 'radial';
const MODE_CODES = { solid: 0, linear: 1, concentric: 2, radial: 3 };

// Radial is a 360° sweep, so it needs a third color to read as one — with two it
// is just half and half. Color 3 loses its ✕ swatch while that mode is selected.
const gelColor3Options = (p) => isRadial(p) ? STANDARD_COLOR_OPTIONS : OPTIONAL_COLOR_OPTIONS;

// Stop order, low → high along the gradient axis. Color 1 keeps the legacy
// `colorGelColor` key so existing presets keep their first color.
export const GEL_STOPS = [
    { colorKey: 'colorGelColor',  posKey: 'colorGelPos1', defaultPos: 0    },
    { colorKey: 'colorGelColor2', posKey: 'colorGelPos2', defaultPos: 0.25 },
    { colorKey: 'colorGelColor3', posKey: 'colorGelPos3', defaultPos: 0.5  },
    { colorKey: 'colorGelColor4', posKey: 'colorGelPos4', defaultPos: 0.75 },
    { colorKey: 'colorGelColor5', posKey: 'colorGelPos5', defaultPos: 1    },
];

/** Indices of the stops that are currently switched on, in order. */
export function activeGelStops(p) {
    return GEL_STOPS.map((s, i) => i)
        .filter(i => i === 0 || i === GEL_STOPS.length - 1 || p[GEL_STOPS[i].colorKey] !== 'none');
}

export const gelStopPos = (p, i) => clampNum(p[GEL_STOPS[i].posKey], 0, 1, GEL_STOPS[i].defaultPos);

const TAU = Math.PI * 2;
const gelAngleRad = (p) => clampNum(p.colorGelGradAngle, -180, 180, 45) * Math.PI / 180;

export const gelAxisDir = (p) => {
    const a = gelAngleRad(p);
    return [Math.cos(a), Math.sin(a)];
};

// Half-length of the gradient axis inside the unit square, so position 0 and 1
// always land on opposite edges of the image whatever the angle. The shader's
// colorGelAxisT() below uses the same normalisation, which is what keeps the
// overlay line sitting exactly where the render puts it.
const axisExtent = (nx, ny) => Math.max(1e-4, Math.abs(nx) + Math.abs(ny));

// --- Concentric / radial geometry -------------------------------------------
// Both work in *pixel* space (like the fade control does) so rings come out round
// and sweeps angularly even on a non-square canvas. The shader mirrors these
// exactly, which is what keeps the overlay pinned to what renders.

/**
 * The gradient's origin, shared by all three modes: the point the linear line
 * passes through, and the centre the rings and the sweep are built around.
 *
 * Linear used to store its position as a scalar offset *along the axis*, which
 * defined the line in terms of the angle — so turning the angle necessarily
 * swung the line around the image centre. Holding a point instead lets rotation
 * change direction only, and the line spins where you put it.
 */
export const gelCenterUv = (p) => [                       // uv, y-up
    0.5 + clampNum(p.colorGelCenterX, -50, 50, 0) / 100,
    0.5 + clampNum(p.colorGelCenterY, -50, 50, 0) / 100,
];

/** The same origin in pixels (y-down, ready for canvas). */
export function gelCenterPx(p, W, H) {
    const [cx, cy] = gelCenterUv(p);
    return [cx * W, (1 - cy) * H];
}

/**
 * Sweep position: one full turn maps to 0→1, starting at the gradient angle.
 * The JS mirror of the shader's radial branch; `dy` is y-**up**.
 */
export function gelSweepT(p, dx, dy) {
    const t = (Math.atan2(dy, dx) - gelAngleRad(p)) / TAU;
    return t - Math.floor(t);
}

/**
 * Inverse of `gelSweepT`: the screen-space direction (radians, y-**down**, ready
 * for canvas cos/sin) that sweep position `t` points along. The overlay draws its
 * marker with this, so the dashed line can't drift from what the shader renders.
 */
export const gelSweepAngle = (p, t) => -(gelAngleRad(p) + t * TAU);

/** uv point sitting at position t along the gradient axis. */
export function gelAxisPoint(p, t) {
    const [nx, ny] = gelAxisDir(p);
    const [cx, cy] = gelCenterUv(p);
    const d = (t - 0.5) * axisExtent(nx, ny);
    return [cx + nx * d, cy + ny * d];
}

/** Position (0–1) of a uv point along the gradient axis. */
export function gelAxisT(p, ux, uy) {
    const [nx, ny] = gelAxisDir(p);
    const [cx, cy] = gelCenterUv(p);
    return 0.5 + ((ux - cx) * nx + (uy - cy) * ny) / axisExtent(nx, ny);
}

function hexToRgb01(hex) {
    const n = parseInt((hex || '#ffffff').replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Resolve a palette-key (or legacy literal hex) to rgb01 against the active palette.
function gelRgb(key, palette, fallback) {
    return hexToRgb01(resolveColorKey(key, palette) ?? fallback);
}

function clampNum(v, lo, hi, def) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
}

const STOP_FALLBACKS = ['#ff3b3b', '#ffd000', '#1e90ff', '#a020f0', '#00e0a0'];

function colorGelBindUniforms(gl, prog, p) {
    const locs = prog._locs;
    const setI  = (k, v) => { if (locs[k] != null) gl.uniform1i(locs[k], v); };
    const setF  = (k, v) => { if (locs[k] != null) gl.uniform1f(locs[k], v); };
    const set3v = (k, a) => { if (locs[k] != null) gl.uniform3fv(locs[k], a); };
    const set1v = (k, a) => { if (locs[k] != null) gl.uniform1fv(locs[k], a); };

    const set2f = (k, a, b) => { if (locs[k] != null) gl.uniform2f(locs[k], a, b); };

    setI('cgMode', MODE_CODES[gelMode(p)] ?? 0);
    setF('cgOpacity', clampNum(p.colorGelOpacity, 0, 100, 60) / 100);
    setF('cgAngle', clampNum(p.colorGelGradAngle, -180, 180, 45) * Math.PI / 180);
    // Center as a fraction of the resolution; the shader scales it up, so this
    // stays correct without the binder knowing the canvas size.
    set2f('cgCenter', 0.5 + clampNum(p.colorGelCenterX, -50, 50, 0) / 100,
                      0.5 - clampNum(p.colorGelCenterY, -50, 50, 0) / 100);
    // Active stops compacted in order, so the shader only walks real transitions.
    const pal    = p._activePalette;
    const active = activeGelStops(p);
    const colors = new Float32Array(GEL_STOPS.length * 3);
    const poses  = new Float32Array(GEL_STOPS.length);
    active.forEach((si, n) => {
        colors.set(gelRgb(p[GEL_STOPS[si].colorKey], pal, STOP_FALLBACKS[si]), n * 3);
        poses[n] = gelStopPos(p, si);
    });
    setI('cgStopCount', active.length);

    // Transition half-width: 0 → sharp edge, 100 → very gradual slope. On a
    // closed sweep the shader reads this as a fraction of each gap instead.
    setF('cgSoft', (clampNum(p.colorGelGradSoftness, 0, 100, 50) / 100) * 0.5);
    setI('cgSoftVertex', p.colorGelSoftVertex ? 1 : 0);
    set3v('cgColors[0]', colors);
    set1v('cgStopPos[0]', poses);

    fade.bindUniforms(gl, prog, p);
    blend.bindUniforms(gl, prog, p);
}

export const colorGelEffect = {
    name:  'colorGel',
    label: 'Color Gel',
    kind:  'glsl',
    // Angle + stop positions are driven by the canvas overlay (dashed lines +
    // rotation handle) and the arrangement slider, so they're hidden from the
    // generic controls panel.
    handleParams: ['colorGelGradAngle',
        'colorGelCenterX', 'colorGelCenterY',
        ...GEL_STOPS.map(s => s.posKey),
        ...fade.handleParams],
    overlays: {},
    paramKeys: [...fade.paramKeys, ...blend.paramKeys],
    uiGroups: (p) => {
        const keys = ['colorGelMode', 'colorGelOpacity', 'colorGelColor'];
        if (gelMode(p) !== 'solid') {
            keys.push('colorGelColor2', 'colorGelColor3', 'colorGelColor4', 'colorGelColor5',
                      'colorGelGradSoftness');
            // Only the sweep has a vertex to soften.
            if (isRadial(p)) keys.push('colorGelSoftVertex');
        }
        return [{ keys }, blend.uiGroup, fade.uiGroup];
    },
    paramActions: {
        // A linear arrangement ends at 1.0, which on a 360° sweep stacks the last
        // color on top of the first. Respace when crossing into or out of radial —
        // but only when the arrangement still looks like the other mode's, so a
        // hand-tuned one survives a there-and-back toggle.
        // `params` arrives already carrying the new mode, so the previous one has
        // to come from `prevValue` — reading it back off params would make every
        // switch look like a no-op.
        colorGelMode: (value, params, prevValue) => {
            const to = value === 'gradient' ? 'linear' : value;
            const wasRadial = gelMode({ colorGelMode: prevValue }) === 'radial';
            const nowRadial = to === 'radial';
            if (nowRadial === wasRadial) return {};

            const updates = {};
            const next = { ...params, colorGelMode: to };
            if (to === 'radial') {
                // Guarantee three colors, then respace around the circle.
                if (activeGelStops(next).length < 3) {
                    updates.colorGelColor3 = 'palette2';
                    next.colorGelColor3 = 'palette2';
                }
            }
            const active = activeGelStops(next);
            const last   = gelStopPos(next, active[active.length - 1]);
            if (nowRadial ? last >= 0.999 : last < 0.999) {
                // Cyclic spacing leaves a gap for the wrap; linear runs 0→1.
                const span = nowRadial ? active.length : active.length - 1;
                active.forEach((si, n) => {
                    updates[GEL_STOPS[si].posKey] = Math.round((n / span) * 1000) / 1000;
                });
            }
            return updates;
        },
    },
    params: {
        colorGelEnabled:   { default: false, label: 'Enable' },
        colorGelMode:      { default: 'solid', label: 'Mode', options: [
            ['solid', 'Solid'], ['linear', 'Linear'], ['concentric', 'Concentric'], ['radial', 'Radial'],
        ] },
        colorGelOpacity:   { default: 60, min: 0, max: 100, label: 'Opacity' },
        colorGelColor:     { default: 'palette0', type: 'paletteSelect', options: STANDARD_COLOR_OPTIONS,  label: 'Color 1' },
        colorGelColor2:    { default: 'none',     type: 'paletteSelect', options: OPTIONAL_COLOR_OPTIONS,  label: 'Color 2' },
        colorGelColor3:    { default: 'none',     type: 'paletteSelect', options: OPTIONAL_COLOR_OPTIONS,
                             optionsFor: gelColor3Options, label: 'Color 3' },
        colorGelColor4:    { default: 'none',     type: 'paletteSelect', options: OPTIONAL_COLOR_OPTIONS,  label: 'Color 4' },
        colorGelColor5:    { default: 'palette1', type: 'paletteSelect', options: STANDARD_COLOR_OPTIONS,  label: 'Color 5' },
        // Position of each color along the gradient axis (0–1 across the image).
        colorGelPos1:      { default: 0    },
        colorGelPos2:      { default: 0.25 },
        colorGelPos3:      { default: 0.5  },
        colorGelPos4:      { default: 0.75 },
        colorGelPos5:      { default: 1    },
        colorGelGradSoftness: { default: 50, min: 0, max: 100, label: 'Transition Softness' },
        // Radial only — the point where every wedge meets is otherwise always sharp.
        colorGelSoftVertex:   { default: false, label: 'Soften Vertex' },
        colorGelGradAngle: { default: 45, min: -180, max: 180, label: 'Angle' },
        // Origin of the concentric rings / radial sweep, −50…50 about the image
        // center with y up, matching the fade control's convention.
        colorGelCenterX:    { default: 0, min: -50, max: 50 },
        colorGelCenterY:    { default: 0, min: -50, max: 50 },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.colorGelEnabled,
    bindUniforms: colorGelBindUniforms,
    glsl: `
uniform int   cgMode;          // 0 solid, 1 linear, 2 concentric, 3 radial
uniform float cgOpacity;
uniform int   cgStopCount;
uniform float cgAngle;
uniform vec2  cgCenter;        // gradient origin, as a fraction of the resolution
uniform vec3  cgColors[${GEL_STOPS.length}];
uniform float cgStopPos[${GEL_STOPS.length}];
uniform float cgSoft;
uniform int   cgSoftVertex;    // radial: fade the origin into the blended colors

${fade.glsl}
${blend.glsl}

// Position along the gradient axis, 0 → 1 across the whole image at any angle.
// The overlay uses the same mapping, so the dashed line sits exactly where the
// render puts it.
float colorGelAxisT(vec2 uv) {
    vec2 n = vec2(cos(cgAngle), sin(cgAngle));
    vec2 c = vec2(cgCenter.x, 1.0 - cgCenter.y);   // cgCenter is stored y-down
    return 0.5 + dot(uv - c, n) / max(1e-4, abs(n.x) + abs(n.y));
}

// Concentric and radial work in pixels so rings stay round and the sweep stays
// angular on a non-square canvas.

/** Pixel offset from the gradient origin. */
vec2 colorGelOffsetPx(vec2 uv) {
    return vec2(uv.x, 1.0 - uv.y) * uResolution - cgCenter * uResolution;
}

/**
 * Reference radius for the concentric rings: half the image diagonal, so stop 1
 * always sits at a fixed distance. Deliberately independent of the origin —
 * otherwise moving the origin would resize the rings instead of moving them.
 */
float colorGelRadiusRef() {
    return max(1.0, length(uResolution) * 0.5);
}

float colorGelShapeT(vec2 d) {
    if (cgMode == 2) return length(d) / colorGelRadiusRef();
    float turns = (atan(-d.y, d.x) - cgAngle) / 6.28318531;
    return fract(turns);
}

vec3 colorGelColorAt(vec2 uv) {
    if (cgMode == 0) return cgColors[0];
    bool cyclic = (cgMode == 3);
    vec2  d = colorGelOffsetPx(uv);
    float t = (cgMode == 1) ? colorGelAxisT(uv) : colorGelShapeT(d);
    // A sweep closes on itself: walk from the first stop through one full turn.
    if (cyclic) t = cgStopPos[0] + fract(t - cgStopPos[0]);

    // Along an open axis the blend is an absolute width and may spill past
    // neighbouring stops. A closed sweep can't afford that — a blend running off
    // the end of the walk leaves a hard seam — so there softness is a *fraction
    // of each gap*: at 1.0 a blend spans exactly the space between its two
    // colors, never more. That keeps the seam impossible at every slider value
    // instead of having to clamp the control down to a stub of its range.
    float soft = max(1e-4, cgSoft);
    vec3 col = cgColors[0];
    for (int i = 1; i < ${GEL_STOPS.length}; i++) {
        if (i >= cgStopCount) break;
        // Each transition is centred between its two stops.
        float gap = cgStopPos[i] - cgStopPos[i - 1];
        float s   = cyclic ? max(1e-4, soft * gap) : soft;
        float m   = (cgStopPos[i - 1] + cgStopPos[i]) * 0.5;
        col = mix(col, cgColors[i], smoothstep(m - s, m + s, t));
    }
    if (cyclic) {
        // Close the loop: the last color eases back into the first.
        float last = cgStopPos[0];
        for (int i = 1; i < ${GEL_STOPS.length}; i++) {
            if (i >= cgStopCount) break;
            last = cgStopPos[i];
        }
        float gapW = cgStopPos[0] + 1.0 - last;
        float sw   = max(1e-4, soft * gapW);
        float mw   = (last + cgStopPos[0] + 1.0) * 0.5;
        col = mix(col, cgColors[0], smoothstep(mw - sw, mw + sw, t));
    }

    // Every wedge meets at the origin, and an angular blend is only
    // s * 2pi * distance wide in pixels — so it collapses to nothing there and
    // the vertex stays razor-sharp however soft the boundaries are. Optionally
    // fade the middle into the mean of the colors instead. This runs after the
    // walk and only mixes toward a constant, so it can't disturb the seam.
    if (cyclic && cgSoftVertex == 1) {
        float r    = length(d) / colorGelRadiusRef();
        // Fixed size rather than scaled by the softness slider. Tying it to the
        // slider made the toggle useless at both ends: at low softness the hub
        // shrank to nothing exactly when the vertex was sharpest, and at high
        // softness the sweep had already spread each transition across its whole
        // gap, leaving the hub nothing to change. A constant radius is
        // self-limiting anyway — as softness rises the hub colour converges on
        // what is already rendered, so the toggle quietly stops mattering.
        float hubR = 0.12;           // of the half-diagonal, before the star below

        // Undulate the hub into a starfish: a point where each pair of colors
        // meets, joined by a gently concave web across each arm. |cos| is what
        // makes that silhouette — it has a true cusp at the tip (the slope flips
        // sign) but flattens to a smooth minimum over the arms, so the lobes
        // flow into one another instead of reading as separate blobs stuck on a
        // disc. The lobes are keyed off the stop positions rather than an
        // assumed even spacing, so an uneven arrangement gives a correspondingly
        // uneven star. Mean radius stays 1.0 (|cos| averages 2/π), so this
        // reshapes the hub without growing it.
        int  iLo = 0, iHi = 0;                          // iHi 0 = the wrap segment
        float lo = cgStopPos[0];
        float hi = cgStopPos[0] + 1.0;
        for (int i = 1; i < ${GEL_STOPS.length}; i++) {
            if (i >= cgStopCount) break;
            float ps = cgStopPos[i];
            if (ps <= t)      { lo = ps; iLo = i; }
            else if (ps < hi) { hi = ps; iHi = i; }
        }
        float u   = (t - lo) / max(1e-4, hi - lo);      // 0 at an arm, 1 at the next
        float web = abs(cos(3.14159265 * u));           // 0 at the tip, 1 over the arms
        hubR *= 1.509 - 0.8 * web;

        // Weight each lobe toward the pair of colors that actually meets there,
        // so they don't all read as the same flat average. The tint runs from
        // one arm's color to the next across the segment, which lands on their
        // even mix at the lobe tip and matches from both sides at each arm, so
        // there's no seam radiating out along the arms. It leans on the local
        // pair further out and eases back to the overall mean at the very
        // centre — the color has to stop depending on angle as r goes to zero,
        // or the sharp vertex this whole block exists to remove comes back.
        vec3 mean = vec3(0.0);
        for (int i = 0; i < ${GEL_STOPS.length}; i++) {
            if (i >= cgStopCount) break;
            mean += cgColors[i];
        }
        mean /= float(cgStopCount);

        float q  = smoothstep(0.0, max(1e-4, hubR), r);
        vec3 hub = mix(mean, mix(cgColors[iLo], cgColors[iHi], u), q);

        col = mix(hub, col, q);
    }
    return col;
}

void main() {
    vec4 c = texture(uTex, vUV);
    vec3 gel = colorGelColorAt(vUV);
    vec3 tinted = mix(c.rgb, gel, cgOpacity);
    float w = ${fade.fnName}();
    vec3 faded = mix(c.rgb, tinted, w);
    if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
}
`,
};
