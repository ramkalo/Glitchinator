// Compute output dimensions from the target pixel size and the "fit to" mode.
// One dimension is driven by resizePixels; the other snaps to the source ratio.
function computeResize(p, w, h) {
    const target = Math.max(1, Math.min(8192, Math.round(p.resizePixels)));
    let nw, nh;
    if (p.resizeFit === 'width') {
        nw = target; nh = Math.round(target * h / w);
    } else if (p.resizeFit === 'height') {
        nh = target; nw = Math.round(target * w / h);
    } else { // 'long' — apply target to the longer source edge
        if (w >= h) { nw = target; nh = Math.round(target * h / w); }
        else        { nh = target; nw = Math.round(target * w / h); }
    }
    return { w: Math.max(1, nw), h: Math.max(1, nh) };
}

export const resizeEffect = {
    name: 'resize',
    label: 'Resize',
    kind: 'transform',
    params: {
        resizeEnabled: { default: false, label: 'Enable' },
        resizeFit:     { default: 'long', label: 'Fit to', options: [['width', 'Width'], ['height', 'Height'], ['long', 'Long edge']] },
        resizePixels:  { default: 1000, label: 'Pixels' },
        resizeQuality: { default: 'smooth', label: 'Quality', options: [['smooth', 'Smooth'], ['fast', 'Fast']] },
    },
    enabled: (p) => p.resizeEnabled && p.resizePixels >= 1,
    getOutputDimensions: (p, w, h) => computeResize(p, w, h),
    bindUniforms: (gl, prog, p, srcW, srcH) => {
        const locSize   = prog._locs['uSrcSize'];
        const locSmooth = prog._locs['uSmooth'];
        if (locSize   != null) gl.uniform2f(locSize, srcW, srcH);
        if (locSmooth != null) gl.uniform1i(locSmooth, p.resizeQuality === 'smooth' ? 1 : 0);
    },
    glsl: `
uniform vec2 uSrcSize;
uniform int  uSmooth;

void main() {
    if (uSmooth == 0) { fragColor = texture(uTex, vUV); return; }
    // Box-filter downscale: average the source pixels covered by this output pixel.
    vec2 ratio = uSrcSize * uTexelSize;              // src px per out px
    int tx = int(clamp(ceil(ratio.x), 1.0, 8.0));
    int ty = int(clamp(ceil(ratio.y), 1.0, 8.0));
    vec4 acc = vec4(0.0);
    float cnt = 0.0;
    for (int j = 0; j < 8; j++) { if (j >= ty) break;
        for (int i = 0; i < 8; i++) { if (i >= tx) break;
            vec2 off = (vec2(float(i) + 0.5, float(j) + 0.5) / vec2(float(tx), float(ty)) - 0.5) * uTexelSize;
            acc += texture(uTex, vUV + off);
            cnt += 1.0;
        }
    }
    fragColor = acc / cnt;
}
`,
};
