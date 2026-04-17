import { params } from '../state/params.js';

function applyBasicAdjustments(imageData) {
    const data = imageData.data;
    const contrastFactor = (params.contrast + 100) / 100;
    const brightness = params.brightness;

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i+1], b = data[i+2];
        const lum = 0.299*r + 0.587*g + 0.114*b;

        if (params.highlights !== 0) {
            const hf = params.highlights * (lum / 255) * 0.3;
            r += hf; g += hf; b += hf;
        }
        if (params.shadows !== 0) {
            const sf = params.shadows * ((255 - lum) / 255) * 0.3;
            r += sf; g += sf; b += sf;
        }

        r = r * contrastFactor + brightness;
        g = g * contrastFactor + brightness;
        b = b * contrastFactor + brightness;

        if (params.saturation !== 0) {
            const sat = 1 + params.saturation / 100;
            const gray = 0.299*r + 0.587*g + 0.114*b;
            r = gray + sat*(r - gray);
            g = gray + sat*(g - gray);
            b = gray + sat*(b - gray);
        }
        if (params.temperature !== 0) {
            const temp = params.temperature / 100;
            r += temp * 25;
            b -= temp * 25;
        }
        if (params.tint !== 0) {
            g += params.tint * 0.25;
        }

        data[i]   = Math.max(0, Math.min(255, r));
        data[i+1] = Math.max(0, Math.min(255, g));
        data[i+2] = Math.max(0, Math.min(255, b));
    }
    return imageData;
}

export default {
    name: 'basic',
    label: 'Basic Adjustments',
    pass: 'pre-crt',
    params: {
        basicEnabled:  { default: false },
        brightness:    { default: 0, min: -100, max: 100 },
        contrast:      { default: 0, min: -100, max: 100 },
        saturation:    { default: 0, min: -100, max: 100 },
        highlights:    { default: 0, min: -100, max: 100 },
        shadows:       { default: 0, min: -100, max: 100 },
        temperature:   { default: 0, min: -100, max: 100 },
        tint:          { default: 0, min: -100, max: 100 },
    },
    enabled: (p) => p.basicEnabled &&
        (p.brightness!==0 || p.contrast!==0 || p.saturation!==0 ||
         p.highlights!==0 || p.shadows!==0 || p.temperature!==0 || p.tint!==0),
    canvas2d: applyBasicAdjustments,
};
