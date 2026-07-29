const ASPECT_MAP = { '1:1': 1, '3:4': 3/4, '4:3': 4/3, '16:9': 16/9, '3:2': 3/2, '22:17': 22/17 };

function computeCropRegion(p, srcW, srcH) {
    if (p.cropAspect === 'free') {
        const cropW = (p.cropFreeW / 100) * srcW;
        const cropH = (p.cropFreeH / 100) * srcH;
        const centerX = (0.5 + p.cropX / 100) * srcW;
        const centerY = (0.5 - p.cropY / 100) * srcH;
        const sx = Math.max(0, Math.min(srcW - cropW, centerX - cropW / 2));
        const sy = Math.max(0, Math.min(srcH - cropH, centerY - cropH / 2));
        return { sx, sy, cropW, cropH };
    }
    const scale = p.cropScale / 100;
    let maxW, maxH;
    if (p.cropAspect === 'original') {
        if (p.cropFlipAspect) {
            const ratio = srcH / srcW;
            if (ratio > srcW / srcH) { maxW = srcW; maxH = srcW / ratio; }
            else { maxH = srcH; maxW = srcH * ratio; }
        } else {
            maxW = srcW; maxH = srcH;
        }
    } else {
        const baseRatio = p.cropAspect === 'custom'
            ? (parseFloat(p.cropCustomW) || 1) / (parseFloat(p.cropCustomH) || 1)
            : (ASPECT_MAP[p.cropAspect] || 1);
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

export const cropEffect = {
    name: 'crop',
    label: 'Crop',
    kind: 'transform',
    paramKeys: ['cropAspect', 'cropFlipAspect', 'cropX', 'cropY', 'cropScale'],
    params: {
        cropEnabled:    { default: false, label: 'Enable' },
        cropAspect:     { default: 'original', label: 'Aspect', options: [['original', 'Original'], ['free', 'Free'], ['custom', 'Custom'], ['1:1', '1:1'], ['4:3', '4:3'], ['16:9', '16:9'], ['3:2', '3:2'], ['22:17', '22:17']] },
        cropFlipAspect: { default: false, label: 'Flip Aspect' },
        cropX:          { default: 0, min: -50, max: 50, label: 'X' },
        cropY:          { default: 0, min: -50, max: 50, label: 'Y' },
        cropScale:      { default: 100, min: 10, max: 100, label: 'Scale' },
        cropFreeW:      { default: 100, min: 1, max: 100, label: 'Width %' },
        cropFreeH:      { default: 100, min: 1, max: 100, label: 'Height %' },
        cropCustomW:    { default: 16, label: 'W' },
        cropCustomH:    { default: 9,  label: 'H' },
    },
    handleParams: ['cropX', 'cropY', 'cropScale', 'cropFreeW', 'cropFreeH'],
    uiGroups: (p) => {
        const keys = ['cropAspect'];
        if (p.cropAspect === 'custom') keys.push('cropCustomW', 'cropCustomH');
        if (p.cropAspect !== 'free') keys.push('cropFlipAspect');
        return [{ keys }];
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