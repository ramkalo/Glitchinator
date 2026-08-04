export const MAX_FADE_VERTS = 12;

// A regular N-gon seed vertex, in local-percent offsets from the fade center
// (y-down, first vertex at top). Shared by the shader-upload path (computeFadeVertices)
// and the overlay's reset/seed logic so they never diverge.
export function regularFadeVertex(i, n, halfW, halfH) {
    const a = -Math.PI / 2 + i * (2 * Math.PI / n);
    return { x: Math.cos(a) * halfW, y: Math.sin(a) * halfH };
}

// Effective polygon vertices (local-percent offsets from the fade center, y-down),
// applying the allZero → regular-N-gon fallback. `base` is '<prefix>Fade'
// (e.g. 'resinFade'), so the vertex/size/side params are `${base}V{i}x/y`,
// `${base}W/H`, `${base}Sides`.
export function computeFadeVertices(params, base) {
    const n     = Math.max(3, Math.min(MAX_FADE_VERTS, Math.round(params[`${base}Sides`] ?? 6)));
    const halfW = (params[`${base}W`] ?? 40) / 2;
    const halfH = (params[`${base}H`] ?? 40) / 2;
    const allZero = Array.from({ length: n }, (_, i) =>
        (params[`${base}V${i}x`] ?? 0) === 0 && (params[`${base}V${i}y`] ?? 0) === 0
    ).every(Boolean);
    const verts = [];
    for (let i = 0; i < n; i++) {
        verts.push(allZero
            ? regularFadeVertex(i, n, halfW, halfH)
            : { x: params[`${base}V${i}x`] ?? 0, y: params[`${base}V${i}y`] ?? 0 });
    }
    return verts;
}

const FADE_GLSL = `
uniform float __P__Fade;
uniform float __P__FadeX;
uniform float __P__FadeY;
uniform float __P__FadeW;
uniform float __P__FadeH;
uniform float __P__FadeSlope;
uniform float __P__FadeAngle;
uniform int   __P__FadeEnabled;
uniform int   __P__FadeShape;
uniform int   __P__FadeInvert;
uniform int   __P__FadeVertCount;
uniform vec2  __P__FadeVerts[12];

// Signed distance (px, negative inside) from a point in the fade's rotated local
// frame to the editable polygon. Vertices are stored as fractions of the image
// resolution; scaled to px here. iq's even-winding polygon SDF.
float __P__FadePolySD(vec2 pt) {
    int N = __P__FadeVertCount;
    vec2 v0 = __P__FadeVerts[0] * uResolution;
    float d = dot(pt - v0, pt - v0);
    float s = 1.0;
    int j = N - 1;
    for (int i = 0; i < 12; i++) {
        if (i >= N) break;
        vec2 vi = __P__FadeVerts[i] * uResolution;
        vec2 vj = __P__FadeVerts[j] * uResolution;
        vec2 e = vj - vi;
        vec2 w = pt - vi;
        vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
        d = min(d, dot(b, b));
        bvec3 c = bvec3(pt.y >= vi.y, pt.y < vj.y, e.x * w.y > e.y * w.x);
        if (all(c) || all(not(c))) s = -s;
        j = i;
    }
    return s * sqrt(d);
}

float __FN__() {
    if (__P__FadeEnabled != 1 || __P__Fade <= 0.0) return 1.0;
    float imgX = vUV.x * uResolution.x;
    float imgY = (1.0 - vUV.y) * uResolution.y;
    float cx = (0.5 + __P__FadeX / 100.0) * uResolution.x;
    float cy = (0.5 - __P__FadeY / 100.0) * uResolution.y;
    float dx = imgX - cx, dy = imgY - cy;
    float rad = __P__FadeAngle * 3.14159265 / 180.0;
    float cosA = cos(rad), sinA = sin(rad);
    float rdx =  dx * cosA + dy * sinA;
    float rdy = -dx * sinA + dy * cosA;
    float hw = max(1.0, (__P__FadeW / 100.0) * uResolution.x / 2.0);
    float hh = max(1.0, (__P__FadeH / 100.0) * uResolution.y / 2.0);
    float t;
    if (__P__FadeShape == 2 && __P__FadeVertCount >= 3) {
        // Polygon: normalize the signed distance so t=1 on the boundary and grows
        // outward, keeping the same falloff/slope semantics as ellipse/rectangle.
        float sd   = __P__FadePolySD(vec2(rdx, rdy));
        float refR = max(0.5 * (hw + hh), 1.0);
        t = 1.0 + sd / refR;
    } else if (__P__FadeShape == 1) {
        t = max(abs(rdx) / hw, abs(rdy) / hh);
    } else {
        t = sqrt(pow(rdx / hw, 2.0) + pow(rdy / hh, 2.0));
    }
    float beyond = max(0.0, t - 1.0);
    float fadeAmt = __P__Fade / 100.0;
    return (__P__FadeInvert == 1)
        ? clamp(beyond * __P__FadeSlope * fadeAmt, 0.0, 1.0)
        : clamp(1.0 - beyond * __P__FadeSlope * fadeAmt, 0.0, 1.0);
}
`;

export function buildFadeControl(prefix, defaults = {}) {
    const p  = prefix;
    const cap = p.charAt(0).toUpperCase() + p.slice(1);
    const fn  = `calc${cap}FadeWeight`;
    const glsl = FADE_GLSL.replaceAll('__P__', p).replaceAll('__FN__', fn);

    const vertParams = {};
    const vertKeys   = [];
    for (let i = 0; i < MAX_FADE_VERTS; i++) {
        vertParams[`${p}FadeV${i}x`] = { default: 0 };
        vertParams[`${p}FadeV${i}y`] = { default: 0 };
        vertKeys.push(`${p}FadeV${i}x`, `${p}FadeV${i}y`);
    }

    return {
        glsl,
        fnName: fn,
        params: {
            [`${p}FadeEnabled`]: { default: false,                                    label: 'Enable Fade' },
            [`${p}FadeShape`]:   { default: 'ellipse', options: [['ellipse', 'Ellipse'], ['rectangle', 'Rectangle'], ['polygon', 'Polygon']], label: 'Shape' },
            [`${p}FadeSides`]:   { default: 6,   min: 3,   max: MAX_FADE_VERTS, step: 1, label: 'Sides' },
            [`${p}Fade`]:        { default: defaults.fade    ?? 20,  min: 0,   max: 100,        label: 'Fade' },
            [`${p}FadeW`]:       { default: defaults.w       ?? 40,  min: 1,   max: 200,        label: 'Width' },
            [`${p}FadeH`]:       { default: defaults.h       ?? 40,  min: 1,   max: 200,        label: 'Height' },
            [`${p}FadeSlope`]:   { default: defaults.slope   ?? 1,   min: 0.1, max: 8, step: 0.1, label: 'Transition Slope' },
            [`${p}FadeInvert`]:  { default: defaults.invert  ?? false,                           label: 'Invert Fade' },
            [`${p}FadeAngle`]:   { default: 0,   min: -180, max: 180 },
            [`${p}FadeX`]:       { default: -25,   min: -50,  max: 50 },
            [`${p}FadeY`]:       { default: -25,   min: -50,  max: 50 },
            ...vertParams,
        },
        paramKeys: [
            `${p}FadeEnabled`, `${p}FadeShape`, `${p}FadeSides`, `${p}Fade`,
            `${p}FadeW`, `${p}FadeH`, `${p}FadeSlope`, `${p}FadeInvert`,
            `${p}FadeAngle`, `${p}FadeX`, `${p}FadeY`,
            ...vertKeys,
        ],
        handleParams: [`${p}FadeX`, `${p}FadeY`, `${p}FadeW`, `${p}FadeH`, `${p}FadeAngle`, ...vertKeys],
        uiGroup: {
            label: 'Fade',
            conditionKey: `${p}FadeEnabled`,
            keys: [`${p}FadeEnabled`, `${p}FadeShape`, `${p}FadeSides`, `${p}Fade`, `${p}FadeSlope`, `${p}FadeInvert`],
        },
        overlay: {
            xKey:       `${p}FadeX`,
            yKey:       `${p}FadeY`,
            shapeKey:   `${p}FadeShape`,
            wKey:       `${p}FadeW`,
            hKey:       `${p}FadeH`,
            angleKey:   `${p}FadeAngle`,
            enabledKey: `${p}FadeEnabled`,
        },
        bindUniforms(gl, prog, params) {
            const locs = prog._locs;
            const si = (k, v) => { if (locs[k] != null) gl.uniform1i(locs[k], v); };
            const shapeInt = { ellipse: 0, rectangle: 1, polygon: 2 }[params[`${p}FadeShape`]] ?? 0;
            si(`${p}FadeShape`, shapeInt);

            const verts = shapeInt === 2 ? computeFadeVertices(params, `${p}Fade`) : [];
            si(`${p}FadeVertCount`, verts.length);
            const arr = new Float32Array(MAX_FADE_VERTS * 2);
            for (let i = 0; i < verts.length && i < MAX_FADE_VERTS; i++) {
                arr[i * 2]     = (verts[i].x ?? 0) / 100;
                arr[i * 2 + 1] = (verts[i].y ?? 0) / 100;
            }
            const vloc = locs[`${p}FadeVerts[0]`];
            if (vloc != null) gl.uniform2fv(vloc, arr);
        },
    };
}
