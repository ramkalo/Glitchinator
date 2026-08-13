// Simple keystone tilt on both axes at once — a single perspective denominator, no
// matrices. Auto Crop zooms so the trapezoid still covers the frame; off edge-stretches.

const TILT_K = 0.7;   // maps the ±60 slider to a perspective strength that stays away from denom≈0

// Cover zoom: map the 4 frame corners through the same keystone the shader uses.
function coverFill(ax, ay) {
    let m = 0;
    for (const cx of [-0.5, 0.5]) {
        for (const cy of [-0.5, 0.5]) {
            const denom = 1 + ax * cy + ay * cx;
            m = Math.max(m, Math.abs(cx / denom), Math.abs(cy / denom));
        }
    }
    return m > 0.5 ? 0.5 / m : 1;
}

export const tiltEffect = {
    name: 'tilt',
    label: 'Tilt',
    kind: 'glsl',
    params: {
        tiltEnabled:  { default: false, label: 'Enable' },
        tiltXAmount:  { default: 0, min: -60, max: 60, label: 'Tilt X' },
        tiltYAmount:  { default: 0, min: -60, max: 60, label: 'Tilt Y' },
        tiltAutoCrop: { default: true, label: 'Auto Crop' },
    },
    enabled: (p) => p.tiltEnabled && ((p.tiltXAmount || 0) !== 0 || (p.tiltYAmount || 0) !== 0),
    bindUniforms: (gl, prog, p, dstW, dstH) => {
        const ax = (p.tiltXAmount || 0) / 60 * TILT_K;
        const ay = (p.tiltYAmount || 0) / 60 * TILT_K;
        const fill = p.tiltAutoCrop ? coverFill(ax, ay) : 1;
        if (prog._locs.uAx   != null) gl.uniform1f(prog._locs.uAx, ax);
        if (prog._locs.uAy   != null) gl.uniform1f(prog._locs.uAy, ay);
        if (prog._locs.uFill != null) gl.uniform1f(prog._locs.uFill, fill);
    },
    glsl: `
uniform float uAx;
uniform float uAy;
uniform float uFill;

void main() {
    vec2 c = vUV - 0.5;
    float denom = 1.0 + uAx * c.y + uAy * c.x;   // single perspective term (both axes)
    c = c / denom;                               // trapezoid foreshortening
    c *= uFill;                                  // auto-crop zoom (1.0 when toggle off)
    fragColor = texture(uTex, clamp(c + 0.5, 0.0, 1.0));   // clamp = edge-stretch fill
}
`,
};
