export default {
    name: 'transform',
    label: 'Rotate',
    pass: 'transform',
    paramKeys: ['rotate90', 'rotate180', 'rotate270', 'flipH', 'flipV'],
    params: {
        transformEnabled: { default: false },
        rotate90:         { default: false },
        rotate180:        { default: false },
        rotate270:        { default: false },
        flipH:            { default: false },
        flipV:            { default: false },
    },
    enabled: (p) => p.transformEnabled && (p.rotate90 || p.rotate180 || p.rotate270 || p.flipH || p.flipV),
    // Rotations swap canvas dimensions; flips don't
    getOutputDimensions: (p, w, h) => (p.rotate90 || p.rotate270) ? { w: h, h: w } : { w, h },
    glsl: `
uniform int rotate90;
uniform int rotate180;
uniform int rotate270;
uniform int flipH;
uniform int flipV;

void main() {
    vec2 uv = vUV;
    // Flips are applied first (inverse order: Canvas2D does rotate then flip)
    if (flipH == 1) uv.x = 1.0 - uv.x;
    if (flipV == 1) uv.y = 1.0 - uv.y;
    // Rotation maps output UV → source UV
    if (rotate90  == 1) uv = vec2(uv.y, 1.0 - uv.x);
    if (rotate270 == 1) uv = vec2(1.0 - uv.y, uv.x);
    if (rotate180 == 1) uv = vec2(1.0 - uv.x, 1.0 - uv.y);
    fragColor = texture(uTex, uv);
}
`,
};