import { params } from '../state/params.js';

let cachedBuffer = null;

function applyChromaticAberration(imageData, p = params) {
    const width = imageData.width;
    const height = imageData.height;
    const sourceData = imageData.data;
    
    if (!cachedBuffer || cachedBuffer.length !== sourceData.length) {
        cachedBuffer = new Uint8ClampedArray(sourceData.length);
    }
    const result = cachedBuffer;

    // CMY offsets are complements: Cyan→G+B, Magenta→R+B, Yellow→R+G
    // Each RGB channel's effective shift is the sum of its direct + two complement contributions.
    const scale = p.chromaScale ?? 1;
    const shifts = [
        {
            x: (p.chromaRedX   + p.chromaMagentaX + p.chromaYellowX) * scale,
            y: (p.chromaRedY   + p.chromaMagentaY + p.chromaYellowY) * scale,
            channel: 0,
        },
        {
            x: (p.chromaGreenX + p.chromaCyanX    + p.chromaYellowX) * scale,
            y: (p.chromaGreenY + p.chromaCyanY    + p.chromaYellowY) * scale,
            channel: 1,
        },
        {
            x: (p.chromaBlueX  + p.chromaCyanX    + p.chromaMagentaX) * scale,
            y: (p.chromaBlueY  + p.chromaCyanY    + p.chromaMagentaY) * scale,
            channel: 2,
        },
    ];

    const thresh  = 255 * (p.chromaThreshold / 100);
    const reverse = p.chromaThresholdReverse;

    const fadeAmount = p.chromaFade / 100;
    const cx = width  * (0.5 + p.chromaFadeX / 100);
    const cy = height * (0.5 - p.chromaFadeY / 100);
    const maxDist = Math.sqrt(Math.max(cx, width - cx) ** 2 + Math.max(cy, height - cy) ** 2);
    const fadeDist = Math.max(1, maxDist * (p.chromaFadeRadius / 100));

    for (const shift of shifts) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = sourceData[idx], g = sourceData[idx+1], b = sourceData[idx+2];
                const lum = 0.299*r + 0.587*g + 0.114*b;
                const apply = reverse ? (lum <= thresh) : (lum >= thresh);
                if (!apply) continue;

                const dx = x - cx;
                const dy = y - cy;
                const rawDist = Math.sqrt(dx * dx + dy * dy);
                let weight;
                if (p.chromaFadeInvert) {
                    if (rawDist < fadeDist) continue;
                    const outerRange = maxDist - fadeDist;
                    const outerT = outerRange > 0 ? Math.min(1, (rawDist - fadeDist) / outerRange) : 1;
                    weight = 1 - fadeAmount * (1 - outerT);
                } else {
                    if (rawDist >= fadeDist) continue;
                    weight = 1 - fadeAmount * (rawDist / fadeDist);
                }

                const nx = Math.round(x + shift.x * weight);
                const ny = Math.round(y - shift.y * weight);
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    result[idx + shift.channel] =
                        sourceData[(ny * width + nx) * 4 + shift.channel];
                }
            }
        }
    }

    imageData.data.set(result);
    return imageData;
}

export default {
    name: 'chroma',
    label: 'Chromatic Aberration',
    pass: 'pre-crt',
    params: {
        chromaEnabled:   { default: false },
        chromaRedX:      { default: 0, min: -20, max: 20 },
        chromaRedY:      { default: 0, min: -20, max: 20 },
        chromaGreenX:    { default: 0, min: -20, max: 20 },
        chromaGreenY:    { default: 0, min: -20, max: 20 },
        chromaBlueX:     { default: 0, min: -20, max: 20 },
        chromaBlueY:     { default: 0, min: -20, max: 20 },
        chromaCyanX:     { default: 0, min: -20, max: 20 },
        chromaCyanY:     { default: 0, min: -20, max: 20 },
        chromaMagentaX:  { default: 0, min: -20, max: 20 },
        chromaMagentaY:  { default: 0, min: -20, max: 20 },
        chromaYellowX:   { default: 0, min: -20, max: 20 },
        chromaYellowY:   { default: 0, min: -20, max: 20 },
        chromaScale:            { default: 1, min: 1, max: 10 },
        chromaThreshold:        { default: 0,  min: 0,   max: 100 },
        chromaThresholdReverse: { default: false },
        chromaFade:             { default: 0,   min: 0,   max: 100 },
        chromaFadeRadius:       { default: 100, min: 1,   max: 100 },
        chromaFadeInvert:       { default: false },
        chromaFadeX:            { default: 0,   min: -50, max: 50  },
        chromaFadeY:            { default: 0,   min: -50, max: 50  },
    },
    enabled: (p) => p.chromaEnabled,
    canvas2d: applyChromaticAberration,
};
