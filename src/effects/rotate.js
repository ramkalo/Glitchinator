// Continuous free rotation. Scale-to-fill (Auto Crop on) zooms just enough that the
// rotated image still covers the frame; off leaves the corners edge-stretched.

// Half-extent of the rotated unit frame in the shader's coordinate space, used to
// pick the zoom that makes the rotated image cover the frame. Mirrors the shader math.
function coverFill(angleRad, aspect) {
    const s = Math.sin(angleRad), co = Math.cos(angleRad);
    let m = 0;
    for (const cx of [-0.5, 0.5]) {
        for (const cy of [-0.5, 0.5]) {
            const x = cx * aspect;
            const rx = co * x - s * cy;
            const ry = s * x + co * cy;
            m = Math.max(m, Math.abs(rx / aspect), Math.abs(ry));
        }
    }
    return m > 0.5 ? 0.5 / m : 1;
}

export const rotateEffect = {
    name: 'rotate',
    label: 'Rotate',
    kind: 'glsl',
    params: {
        rotateEnabled:  { default: false, label: 'Enable' },
        rotateAngle:    { default: 0, min: -180, max: 180, label: 'Angle' },
        rotateAutoCrop: { default: true, label: 'Auto Crop' },
    },
    enabled: (p) => p.rotateEnabled && (p.rotateAngle || 0) !== 0,
    bindUniforms: (gl, prog, p, dstW, dstH) => {
        const angle  = (p.rotateAngle || 0) * Math.PI / 180;
        const aspect = dstW / dstH;
        const fill   = p.rotateAutoCrop ? coverFill(angle, aspect) : 1;
        if (prog._locs.uAngle  != null) gl.uniform1f(prog._locs.uAngle, angle);
        if (prog._locs.uAspect != null) gl.uniform1f(prog._locs.uAspect, aspect);
        if (prog._locs.uFill   != null) gl.uniform1f(prog._locs.uFill, fill);
    },
    glsl: `
uniform float uAngle;
uniform float uAspect;
uniform float uFill;

void main() {
    vec2 c = vUV - 0.5;
    c.x *= uAspect;                      // work in a square space so rotation isn't skewed
    float s = sin(uAngle), co = cos(uAngle);
    c = mat2(co, s, -s, co) * c;         // screen → source (inverse of the handle's turn direction)
    c.x /= uAspect;
    c *= uFill;                          // auto-crop zoom (1.0 when the toggle is off)
    fragColor = texture(uTex, clamp(c + 0.5, 0.0, 1.0));   // clamp = edge-stretch fill
}
`,
};
