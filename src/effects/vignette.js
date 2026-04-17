import { params } from '../state/params.js';

function applyVignette(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    const cx = (0.5 + params.vignetteCenterX / 100) * width;
    const cy = (0.5 - params.vignetteCenterY / 100) * height; // Flip Y: negative = down
    const maxDist = Math.sqrt(cx*cx + cy*cy + (width-cx)*(width-cx) + (height-cy)*(height-cy)) / 2;
    const scaledMaxDist = maxDist * (params.vignetteRadius / 100);
    const edgeScale   = params.vignetteEdge   / 100;
    const centerScale = params.vignetteCenter / 100;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dist = Math.sqrt((x - cx)*(x - cx) + (y - cy)*(y - cy));
            const falloff = Math.pow(Math.min(dist / scaledMaxDist, 1.0), 2);
            const edgeFactor   = Math.max(0, 1.0 + falloff * edgeScale);
            const centerFactor = Math.max(0, 1.0 + (1.0 - falloff) * centerScale);
            const vignette = edgeFactor * centerFactor;
            const i = (y * width + x) * 4;
            data[i]   = Math.max(0, Math.min(255, data[i]   * vignette));
            data[i+1] = Math.max(0, Math.min(255, data[i+1] * vignette));
            data[i+2] = Math.max(0, Math.min(255, data[i+2] * vignette));
        }
    }
    return imageData;
}

export default {
    name: 'vignette',
    label: 'Vignette',
    pass: 'pre-crt',
    params: {
        vignetteEnabled: { default: false },
        vignetteRadius:  { default: 100, min: 0,   max: 150 },
        vignetteCenterX: { default: 0,   min: -50, max: 50  },
        vignetteCenterY: { default: 0,   min: -50, max: 50  },
        vignetteEdge:    { default: 0,   min: -100, max: 100 },
        vignetteCenter:  { default: 0,   min: -100, max: 100 },
    },
    enabled: (p) => p.vignetteEnabled,
    canvas2d: applyVignette,
};
