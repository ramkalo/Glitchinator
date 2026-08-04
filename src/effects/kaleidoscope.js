import { buildFadeControl } from './controls/index.js';
import { buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('kaleidoscope');
const blend = buildBlendControl('kaleidoscope');

const SHAPE_INT = { triangle: 0, rectangle: 1, polygon: 2 };

// Vertex handle params — 12 slots (same pattern as viewport)
const vertexParams = {};
for (let i = 0; i < 12; i++) {
    vertexParams[`kKalV${i}x`] = { default: 0 };
    vertexParams[`kKalV${i}y`] = { default: 0 };
}

const handleParamsList = [
    'kMirrorX', 'kMirrorY', 'kMirrorAngle',
    'kSymX', 'kSymY', 'kSymRotation',
    'kKalCenterX', 'kKalCenterY', 'kKalRotation',
];
for (let i = 0; i < 12; i++) {
    handleParamsList.push(`kKalV${i}x`, `kKalV${i}y`);
}
handleParamsList.push(...fade.handleParams);

export const kaleidoscopeEffect = {
    name: 'kaleidoscope',
    label: 'Kaleidoscope',
    kind: 'glsl',

    params: {
        kaleidoscopeEnabled: { default: false, label: 'Enable' },
        kaleidoscopeMode:    { default: 'mirror', options: [['mirror', 'Mirror'], ['symmetry', 'Symmetry'], ['kaleidoscope', 'Kaleidoscope']], label: 'Mode' },

        // Mirror
        kMirrorX:     { default: 0, min: -50, max: 50 },
        kMirrorY:     { default: 0, min: -50, max: 50 },
        kMirrorAngle: { default: 0, min: -180, max: 180, label: 'Angle' },
        kMirrorFlip:  { default: false, label: 'Flip Source Side' },

        // Symmetry
        kSymX:        { default: 0, min: -50, max: 50 },
        kSymY:        { default: 0, min: -50, max: 50 },
        kSymSlices:   { default: 6, min: 2, max: 12, label: 'Slices' },
        kSymRotation: { default: 0, min: 0, max: 360, label: 'Rotation' },
        kSymMirror:   { default: true, label: 'Mirror Slices' },

        // Kaleidoscope
        kKalCenterX:  { default: 0, min: -50, max: 50 },
        kKalCenterY:  { default: 0, min: -50, max: 50 },
        kKalRotation: { default: 0, min: -180, max: 180, label: 'Rotation' },
        kKalShape:    { default: 'polygon', options: [['triangle', 'Triangle'], ['rectangle', 'Rectangle'], ['polygon', 'Polygon']], label: 'Shape' },
        kKalSides:    { default: 6, min: 3, max: 12, label: 'Sides' },
        ...vertexParams,

        ...fade.params,
        ...blend.params,
    },

    paramKeys: [
        // Float uniforms auto-bound from params
        'kMirrorX', 'kMirrorY', 'kMirrorAngle',
        'kSymX', 'kSymY', 'kSymRotation',
        'kKalRotation',
        // kSymSlices is uniform int → bound manually in bindUniforms
        // kKalCenterX/Y are merged into uniform vec2 kKalCenter → bound manually
        ...fade.paramKeys,
        ...blend.paramKeys,
    ],

    handleParams: handleParamsList,

    enabled: (p) => p.kaleidoscopeEnabled,

    overlays: { fade: fade.overlay },

    uiGroups: (p) => {
        const mode = p.kaleidoscopeMode;
        const groups = [
            { keys: ['kaleidoscopeMode'] },
        ];
        if (mode === 'mirror') {
            groups.push({ label: 'Mirror', keys: ['kMirrorAngle', 'kMirrorFlip'] });
        } else if (mode === 'symmetry') {
            groups.push({ label: 'Symmetry', keys: ['kSymSlices', 'kSymRotation', 'kSymMirror'] });
        } else {
            groups.push({ label: 'Shape', keys: p.kKalShape === 'polygon' ? ['kKalShape', 'kKalSides'] : ['kKalShape'] });
        }
        groups.push(blend.uiGroup, fade.uiGroup);
        return groups;
    },

    bindUniforms(gl, prog, p) {
        const locs = prog._locs;
        const si = (k, v) => { if (locs[k] != null) gl.uniform1i(locs[k], v); };
        const modeInt = { mirror: 0, symmetry: 1, kaleidoscope: 2 };
        si('kMode',      modeInt[p.kaleidoscopeMode] ?? 0);
        si('kMirrorFlip', p.kMirrorFlip ? 1 : 0);
        si('kSymSlices',  Math.max(2, Math.min(12, Math.round(p.kSymSlices))));
        si('kSymMirror',  p.kSymMirror ? 1 : 0);

        // Kaleidoscope shape + vertex data
        const numVerts = p.kKalShape === 'triangle' ? 3
                       : p.kKalShape === 'rectangle' ? 4
                       : Math.max(3, Math.min(12, Math.round(p.kKalSides)));
        si('kKalShape',    SHAPE_INT[p.kKalShape] ?? 2);
        si('kKalNumVerts', numVerts);

        // GLSL texture space: y=0 at bottom, y=1 at top — use + for Y (not -)
        const cx = 0.5 + p.kKalCenterX / 100;
        const cy = 0.5 + p.kKalCenterY / 100;
        const rotRad = (p.kKalRotation ?? 0) * Math.PI / 180;
        const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);

        const verts = new Float32Array(24);
        for (let i = 0; i < 12; i++) {
            const ox = (p[`kKalV${i}x`] ?? 0) / 100;
            const oy = (p[`kKalV${i}y`] ?? 0) / 100;
            verts[i * 2]     = cx + (ox * cosR - oy * sinR);
            verts[i * 2 + 1] = cy + (ox * sinR + oy * cosR);
        }
        const vertsLoc = locs['kKalVerts[0]'];
        if (vertsLoc != null) gl.uniform2fv(vertsLoc, verts);

        if (locs['kKalCenter'] != null) gl.uniform2f(locs['kKalCenter'], cx, cy);

        fade.bindUniforms(gl, prog, p);
        blend.bindUniforms(gl, prog, p);
    },

    glsl: `
uniform int   kMode;

// Mirror uniforms
uniform float kMirrorX;
uniform float kMirrorY;
uniform float kMirrorAngle;
uniform int   kMirrorFlip;

// Symmetry uniforms
uniform float kSymX;
uniform float kSymY;
uniform int   kSymSlices;
uniform float kSymRotation;
uniform int   kSymMirror;

// Kaleidoscope uniforms
uniform vec2  kKalCenter;
uniform float kKalRotation;
uniform int   kKalShape;
uniform int   kKalNumVerts;
uniform vec2  kKalVerts[12];

${fade.glsl}
${blend.glsl}

// ─── Mirror ──────────────────────────────────────────────────────────────────

vec2 mirrorUV(vec2 uv) {
    vec2 center = vec2(0.5 + kMirrorX / 100.0, 0.5 + kMirrorY / 100.0);
    float rad   = kMirrorAngle * 3.14159265 / 180.0;
    vec2  norm  = vec2(sin(rad), cos(rad));
    float dist  = dot(uv - center, norm);

    bool onSourceSide = (kMirrorFlip == 0) ? (dist >= 0.0) : (dist < 0.0);
    if (onSourceSide) return uv;
    return uv - 2.0 * dist * norm;
}

// ─── Symmetry ─────────────────────────────────────────────────────────────────

vec2 symmetryUV(vec2 uv) {
    vec2  center  = vec2(0.5 + kSymX / 100.0, 0.5 + kSymY / 100.0);
    vec2  rel     = uv - center;
    float angle   = atan(rel.y, rel.x);
    float radius  = length(rel);

    float sliceAngle = 6.28318530 / float(kSymSlices);
    float rotOff     = kSymRotation * 3.14159265 / 180.0;
    float adjusted   = mod(angle - rotOff, sliceAngle);
    if (adjusted < 0.0) adjusted += sliceAngle;

    // Which slice index is this pixel in (for mirror toggle)
    int sliceIdx = int(floor(mod((angle - rotOff) / sliceAngle, float(kSymSlices))));
    if (kSymMirror == 1 && (sliceIdx & 1) == 1) {
        adjusted = sliceAngle - adjusted;
    }

    float finalAngle = rotOff + adjusted;
    return center + radius * vec2(cos(finalAngle), sin(finalAngle));
}

// ─── Kaleidoscope ─────────────────────────────────────────────────────────────

vec2 kaleidoscopeUV(vec2 uv) {
    vec2 p = uv;
    for (int iter = 0; iter < 8; iter++) {
        // Find the edge with the most negative signed perpendicular distance.
        // For a CCW polygon, inward normal = vec2(-edgeDir.y, edgeDir.x).
        // dist < 0 means the point is outside that edge; most-negative = most outside.
        float minDist = 0.0;
        int bestI = -1;
        for (int i = 0; i < 12; i++) {
            if (i >= kKalNumVerts) break;
            int j = (i + 1 < kKalNumVerts) ? i + 1 : 0;
            vec2 edgeDir = normalize(kKalVerts[j] - kKalVerts[i]);
            vec2 n = vec2(-edgeDir.y, edgeDir.x);
            float d = dot(p - kKalVerts[i], n);
            if (d < minDist) { minDist = d; bestI = i; }
        }
        if (bestI < 0) return p;  // all distances >= 0 → inside polygon

        // Reflect p across that edge's infinite line
        int bj = (bestI + 1 < kKalNumVerts) ? bestI + 1 : 0;
        vec2 edgeDir = normalize(kKalVerts[bj] - kKalVerts[bestI]);
        vec2 n = vec2(-edgeDir.y, edgeDir.x);
        float dist = dot(p - kKalVerts[bestI], n);
        p = p - 2.0 * dist * n;
    }
    return p;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

void main() {
    vec4 orig = texture(uTex, vUV);

    vec2 sampleUV;
    if      (kMode == 0) sampleUV = mirrorUV(vUV);
    else if (kMode == 1) sampleUV = symmetryUV(vUV);
    else                 sampleUV = kaleidoscopeUV(vUV);

    sampleUV = clamp(sampleUV, 0.0, 1.0);
    vec4 effect = texture(uTex, sampleUV);

    float weight = ${fade.fnName}();
    vec3  mixed  = mix(orig.rgb, effect.rgb, weight);

    if (!${blend.thresholdFn}(orig, vec4(mixed, orig.a))) { fragColor = orig; return; }
    fragColor = vec4(${blend.blendFn}(orig.rgb, mixed), orig.a);
}
`,
};
