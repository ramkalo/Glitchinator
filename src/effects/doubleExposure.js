import { params } from '../state/params.js';
import { secondImagePixels } from '../renderer/glstate.js';

function applyDoubleExposure(imageData) {
    if (!secondImagePixels) return imageData;
    const data = imageData.data;
    const intensity = params.doubleExposureIntensity / 100;
    const threshold = 255 * intensity;
    const reverse = params.doubleExposureReverse;
    const cm = params.doubleExposureChannelMode;
    const bm = params.doubleExposureBlendMode;

    function blend(a, b) {
        a /= 255; b /= 255;
        let r;
        if      (bm === 'screen')     r = 1 - (1-a)*(1-b);
        else if (bm === 'multiply')   r = a * b;
        else if (bm === 'add')        r = Math.min(1, a + b);
        else if (bm === 'overlay')    r = a < 0.5 ? 2*a*b : 1 - 2*(1-a)*(1-b);
        else if (bm === 'difference') r = Math.abs(a - b);
        else r = a;
        return Math.round(r * 255);
    }

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        const lum = 0.299*r + 0.587*g + 0.114*b;
        const doBlend = reverse ? (lum <= threshold) : (lum >= threshold);
        if (doBlend) {
            const sr = secondImagePixels[i], sg = secondImagePixels[i+1], sb = secondImagePixels[i+2];
            if (cm==='all'||cm==='r'||cm==='rg'||cm==='rb') data[i]   = blend(r, sr);
            if (cm==='all'||cm==='g'||cm==='rg'||cm==='gb') data[i+1] = blend(g, sg);
            if (cm==='all'||cm==='b'||cm==='rb'||cm==='gb') data[i+2] = blend(b, sb);
        }
    }
    return imageData;
}

export default {
    name: 'doubleExposure',
    label: 'Double Exposure',
    pass: 'pre-crt',
    params: {
        doubleExposureEnabled:    { default: false },
        doubleExposureChannelMode:{ default: 'all' },
        doubleExposureBlendMode:  { default: 'screen' },
        doubleExposureIntensity:  { default: 100, min: 0, max: 100 },
        doubleExposureReverse:    { default: false },
    },
    enabled: (p) => p.doubleExposureEnabled,
    canvas2d: applyDoubleExposure,
};
