import { params } from '../state/params.js';

function applyChromaticAberration(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const sourceData = imageData.data;
    const result = new Uint8ClampedArray(sourceData);

    const shifts = [
        { x: params.chromaRedX,   y: params.chromaRedY,   channel: 0 },
        { x: params.chromaGreenX, y: params.chromaGreenY, channel: 1 },
        { x: params.chromaBlueX,  y: params.chromaBlueY,  channel: 2 },
    ];

    for (const shift of shifts) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const nx = Math.round(x + shift.x);
                const ny = Math.round(y - shift.y); // Negate Y: negative = down
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    result[(y * width + x) * 4 + shift.channel] =
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
        chromaEnabled: { default: false },
        chromaRedX:    { default: 0, min: -20, max: 20 },
        chromaRedY:    { default: 0, min: -20, max: 20 },
        chromaGreenX:  { default: 0, min: -20, max: 20 },
        chromaGreenY:  { default: 0, min: -20, max: 20 },
        chromaBlueX:   { default: 0, min: -20, max: 20 },
        chromaBlueY:   { default: 0, min: -20, max: 20 },
    },
    enabled: (p) => p.chromaEnabled,
    canvas2d: applyChromaticAberration,
};
