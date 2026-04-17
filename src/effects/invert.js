import { params } from '../state/params.js';

function applyInvert(imageData) {
    const data = imageData.data;
    const mode = params.invertMode;
    const threshold = 255 * (params.invertIntensity / 100);
    const reverse = params.invertReverse;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        const lum = 0.299*r + 0.587*g + 0.114*b;
        const shouldInvert = reverse ? (lum <= threshold) : (lum >= threshold);

        if (shouldInvert) {
            if      (mode === 'all') { data[i] = 255-r; data[i+1] = 255-g; data[i+2] = 255-b; }
            else if (mode === 'rc')  { data[i]   = 255-r; }
            else if (mode === 'gm')  { data[i+1] = 255-g; }
            else if (mode === 'by')  { data[i+2] = 255-b; }
            else if (mode === 'bw')  { const l = 255-lum; data[i] = l; data[i+1] = l; data[i+2] = l; }
        }
    }
    return imageData;
}

export default {
    name: 'invert',
    label: 'Invert',
    pass: 'pre-crt',
    params: {
        invertEnabled:   { default: false },
        invertMode:      { default: 'all' },
        invertIntensity: { default: 100, min: 0, max: 100 },
        invertReverse:   { default: false },
    },
    enabled: (p) => p.invertEnabled,
    canvas2d: applyInvert,
};
