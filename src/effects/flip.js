export const flipEffect = {
    name: 'flip',
    label: 'Flip',
    kind: 'transform',
    paramKeys: ['rotate90', 'rotate180', 'rotate270', 'flipH', 'flipV'],
    params: {
        flipEnabled: { default: false, label: 'Enable' },
        rotate90:    { default: false, label: '90°' },
        rotate180:   { default: false, label: '180°' },
        rotate270:   { default: false, label: '270°' },
        flipH:       { default: false, label: 'Flip H' },
        flipV:       { default: false, label: 'Flip V' },
    },
    enabled: (p) => p.flipEnabled && (p.rotate90 || p.rotate180 || p.rotate270 || p.flipH || p.flipV),
    // Quarter-turns swap canvas dimensions; flips don't
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
