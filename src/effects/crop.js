const ASPECT_MAP = { '1:1': 1, '4:3': 4/3, '16:9': 16/9, '3:2': 3/2 };

function computeCropRegion(p, srcW, srcH) {
    const scale = p.cropScale / 100;
    let maxW, maxH;
    if (p.cropAspect === 'original') {
        maxW = srcW; maxH = srcH;
    } else {
        const baseRatio = ASPECT_MAP[p.cropAspect] || 1;
        const ratio = p.cropFlipAspect ? 1 / baseRatio : baseRatio;
        if (ratio > srcW / srcH) { maxW = srcW; maxH = srcW / ratio; }
        else { maxH = srcH; maxW = srcH * ratio; }
    }
    const cropW = maxW * scale;
    const cropH = maxH * scale;
    const centerX = (0.5 + p.cropX / 100) * srcW;
    const centerY = (0.5 - p.cropY / 100) * srcH;
    const sx = Math.max(0, Math.min(srcW - cropW, centerX - cropW / 2));
    const sy = Math.max(0, Math.min(srcH - cropH, centerY - cropH / 2));
    return { sx, sy, cropW, cropH };
}

export default {
    name: 'crop',
    label: 'Crop',
    pass: 'transform',
    paramKeys: ['cropAspect', 'cropFlipAspect', 'cropX', 'cropY', 'cropScale'],
    params: {
        cropEnabled:    { default: false },
        cropAspect:     { default: 'original' },
        cropFlipAspect: { default: false },
        cropX:          { default: 0, min: -50, max: 50 },
        cropY:          { default: 0, min: -50, max: 50 },
        cropScale:      { default: 100, min: 10, max: 100 },
    },
    enabled: (p) => p.cropEnabled && p.cropScale > 0,
    getOutputDimensions: (p, srcW, srcH) => {
        const { cropW, cropH } = computeCropRegion(p, srcW, srcH);
        return { w: Math.round(cropW), h: Math.round(cropH) };
    },
    bindUniforms: (gl, prog, p, srcW, srcH) => {
        const { sx, sy, cropW, cropH } = computeCropRegion(p, srcW, srcH);
        const locOrigin = prog._locs['uSrcOrigin'];
        const locSize   = prog._locs['uSrcSize'];
        // uSrcOrigin.y = bottom of crop in UV (vUV.y=0 = image bottom = high row index)
        if (locOrigin != null) gl.uniform2f(locOrigin, sx / srcW, 1.0 - (sy + cropH) / srcH);
        if (locSize   != null) gl.uniform2f(locSize,   cropW / srcW, cropH / srcH);
    },
    glsl: `
uniform vec2 uSrcOrigin;
uniform vec2 uSrcSize;

void main() {
    fragColor = texture(uTex, uSrcOrigin + vUV * uSrcSize);
}
`,
};