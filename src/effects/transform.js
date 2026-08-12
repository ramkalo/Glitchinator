// ── 3x3 homography helpers (row-major arrays [m00,m01,m02, m10,m11,m12, m20,m21,m22]) ──

function mat3mul(a, b) {
    const o = new Array(9);
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
            o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return o;
}

function mat3inverse(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A =  (e * i - f * h);
    const B = -(d * i - f * g);
    const C =  (d * h - e * g);
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-9) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const invDet = 1 / det;
    return [
        A * invDet,                 (c * h - b * i) * invDet,   (b * f - c * e) * invDet,
        B * invDet,                 (a * i - c * g) * invDet,   (c * d - a * f) * invDet,
        C * invDet,                 (b * g - a * h) * invDet,   (a * e - b * d) * invDet,
    ];
}

// Apply a row-major homography to a 2D point, with perspective divide.
function mat3apply(m, x, y) {
    const X = m[0] * x + m[1] * y + m[2];
    const Y = m[3] * x + m[4] * y + m[5];
    const W = m[6] * x + m[7] * y + m[8];
    return [X / W, Y / W];
}

// WebGL wants column-major; our math is row-major → transpose on upload.
function toColumnMajor(m) {
    return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

// Build the screen→source homography for the active continuous mode, in centered
// (origin at frame center), aspect-corrected coords, with scale-to-fill baked in.
// Returns a row-major 3x3. Identity when the active mode's value is 0.
const TILT_CAM_D = 2.2;  // virtual camera distance for the perspective divide

function buildTransformMatrix(p, A) {
    const mode = p.transformMode || 'rotate';
    // Forward source→screen (square space, y-up). Hs then inverted to get screen→source.
    let hs;
    if (mode === 'tiltX') {
        const phi = (p.tiltXAmount || 0) * Math.PI / 180;
        hs = [1, 0, 0,
              0, Math.cos(phi), 0,
              0, -Math.sin(phi) / TILT_CAM_D, 1];
    } else if (mode === 'tiltY') {
        const psi = (p.tiltYAmount || 0) * Math.PI / 180;
        hs = [Math.cos(psi), 0, 0,
              0, 1, 0,
              -Math.sin(psi) / TILT_CAM_D, 0, 1];
    } else {
        // Rotate — positive angle = clockwise on screen. screen→source is CCW(θ).
        const th = (p.rotateAngle || 0) * Math.PI / 180;
        const c = Math.cos(th), s = Math.sin(th);
        // Directly the inverse (screen→source), so skip the invert below for rotate.
        const ms = [c, -s, 0,
                    s,  c, 0,
                    0,  0, 1];
        const Ain  = [A, 0, 0, 0, 1, 0, 0, 0, 1];
        const Aout = [1 / A, 0, 0, 0, 1, 0, 0, 0, 1];
        return applyFill(p, mat3mul(Aout, mat3mul(ms, Ain)));
    }
    const ms = mat3inverse(hs);
    const Ain  = [A, 0, 0, 0, 1, 0, 0, 0, 1];
    const Aout = [1 / A, 0, 0, 0, 1, 0, 0, 0, 1];
    return applyFill(p, mat3mul(Aout, mat3mul(ms, Ain)));
}

// Scale-to-fill: shrink the sampled source region so the four screen-frame corners
// map inside the image, guaranteeing the frame is fully covered (no borders).
function applyFill(p, hFull) {
    let m = 0;
    for (const sx of [-0.5, 0.5]) {
        for (const sy of [-0.5, 0.5]) {
            const [x, y] = mat3apply(hFull, sx, sy);
            m = Math.max(m, Math.abs(x), Math.abs(y));
        }
    }
    const s = m > 0.5 ? 0.5 / m : 1;
    if (s === 1) return hFull;
    const scale = [s, 0, 0, 0, s, 0, 0, 0, 1];
    return mat3mul(scale, hFull);
}

function continuousActive(p) {
    return (p.transformMode === 'rotate' && (p.rotateAngle || 0) !== 0)
        || (p.transformMode === 'tiltX'  && (p.tiltXAmount || 0) !== 0)
        || (p.transformMode === 'tiltY'  && (p.tiltYAmount || 0) !== 0);
}

export const transformEffect = {
    name: 'transform',
    label: 'Rotate',
    kind: 'transform',
    paramKeys: ['rotate90', 'rotate180', 'rotate270', 'flipH', 'flipV'],
    params: {
        transformEnabled: { default: false, label: 'Enable' },
        rotate90:         { default: false, label: '90°' },
        rotate180:        { default: false, label: '180°' },
        rotate270:        { default: false, label: '270°' },
        flipH:            { default: false, label: 'Flip H' },
        flipV:            { default: false, label: 'Flip V' },
        transformMode:    { default: 'rotate', label: 'Mode',
                            options: [['rotate', 'Rotate'], ['tiltX', 'Tilt X'], ['tiltY', 'Tilt Y']] },
        rotateAngle:      { default: 0, min: -180, max: 180, label: 'Angle' },
        tiltXAmount:      { default: 0, min: -60,  max: 60,  label: 'Tilt X' },
        tiltYAmount:      { default: 0, min: -60,  max: 60,  label: 'Tilt Y' },
    },
    uiGroups: (p) => {
        const groups = [
            { label: 'Flip / Step', keys: ['rotate90', 'rotate180', 'rotate270', 'flipH', 'flipV'] },
            { keys: ['transformMode'] },
        ];
        if (p.transformMode === 'tiltX')      groups.push({ label: 'Tilt X', keys: ['tiltXAmount'] });
        else if (p.transformMode === 'tiltY') groups.push({ label: 'Tilt Y', keys: ['tiltYAmount'] });
        else                                  groups.push({ label: 'Rotate', keys: ['rotateAngle'] });
        return groups;
    },
    enabled: (p) => p.transformEnabled
        && (p.rotate90 || p.rotate180 || p.rotate270 || p.flipH || p.flipV || continuousActive(p)),
    // Rotations swap canvas dimensions; flips and continuous modes don't
    getOutputDimensions: (p, w, h) => (p.rotate90 || p.rotate270) ? { w: h, h: w } : { w, h },
    bindUniforms: (gl, prog, p, curW, curH) => {
        const loc = prog._locs['uTransform'];
        if (loc == null) return;
        // Aspect of the OUTPUT frame (90° steps swap w/h).
        const out = (p.rotate90 || p.rotate270) ? { w: curH, h: curW } : { w: curW, h: curH };
        const A = out.w / out.h;
        gl.uniformMatrix3fv(loc, false, toColumnMajor(buildTransformMatrix(p, A)));
    },
    glsl: `
uniform mat3 uTransform;
uniform int rotate90;
uniform int rotate180;
uniform int rotate270;
uniform int flipH;
uniform int flipV;

void main() {
    vec2 uv = vUV;
    // Continuous rotate/tilt — screen(output) UV → source UV, aspect + scale-to-fill baked in.
    vec3 q = uTransform * vec3(uv - 0.5, 1.0);
    uv = q.xy / q.z + 0.5;
    // Discrete flips are applied first (inverse order: Canvas2D does rotate then flip)
    if (flipH == 1) uv.x = 1.0 - uv.x;
    if (flipV == 1) uv.y = 1.0 - uv.y;
    // Discrete rotation maps output UV → source UV
    if (rotate90  == 1) uv = vec2(uv.y, 1.0 - uv.x);
    if (rotate270 == 1) uv = vec2(1.0 - uv.y, uv.x);
    if (rotate180 == 1) uv = vec2(1.0 - uv.x, 1.0 - uv.y);
    fragColor = texture(uTex, clamp(uv, 0.0, 1.0));
}
`,
};
