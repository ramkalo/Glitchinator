// Expand — the inverse of Crop. Grows the output canvas and fills the new border
// region with white, black, or edge-stretched ("line drag") pixels dragged out from
// the image border. Two paired sliders (in pixels): one expands left + right equally,
// the other expands top + bottom equally.

const FILL_MODE = { edge: 0, white: 1, black: 2 };

export const expandEffect = {
    name: 'expand',
    label: 'Expand',
    kind: 'transform',
    params: {
        expandEnabled: { default: false, label: 'Enable' },
        expandFill:    { default: 'edge', label: 'Fill', options: [['edge', 'Edge stretch'], ['white', 'White'], ['black', 'Black']] },
        expandX:       { default: 0, min: 0, max: 2000, step: 1, label: 'Left / Right' },
        expandY:       { default: 0, min: 0, max: 2000, step: 1, label: 'Top / Bottom' },
    },
    enabled: (p) => p.expandEnabled && (p.expandX > 0 || p.expandY > 0),
    getOutputDimensions: (p, w, h) => ({ w: w + 2 * p.expandX, h: h + 2 * p.expandY }),
    bindUniforms: (gl, prog, p, curW, curH) => {
        const ax = p.expandX;
        const ay = p.expandY;
        const outW = curW + 2 * ax;
        const outH = curH + 2 * ay;
        const locScale  = prog._locs['uRemapScale'];
        const locOffset = prog._locs['uRemapOffset'];
        const locFill   = prog._locs['uFillMode'];
        if (locScale  != null) gl.uniform2f(locScale,  outW / curW, outH / curH);
        if (locOffset != null) gl.uniform2f(locOffset, -ax / curW, -ay / curH);
        if (locFill   != null) gl.uniform1i(locFill,   FILL_MODE[p.expandFill] ?? 0);
    },
    glsl: `
uniform vec2 uRemapScale;
uniform vec2 uRemapOffset;
uniform int  uFillMode;

void main() {
    vec2 srcUV = vUV * uRemapScale + uRemapOffset;
    bool inside = srcUV.x >= 0.0 && srcUV.x <= 1.0 && srcUV.y >= 0.0 && srcUV.y <= 1.0;
    if (inside) {
        fragColor = texture(uTex, srcUV);
    } else if (uFillMode == 1) {
        fragColor = vec4(1.0, 1.0, 1.0, 1.0);   // white
    } else if (uFillMode == 2) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);   // black
    } else {
        fragColor = texture(uTex, clamp(srcUV, 0.0, 1.0));  // edge stretch
    }
}
`,
};
