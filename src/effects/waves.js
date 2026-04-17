import { params } from '../state/params.js';

function crtWaveFormula(xNorm, yNorm) {
    return (
        3.2 * Math.sin(xNorm + 0.3 * Math.cos(2.1 * xNorm) + yNorm) +
        2.1 * Math.cos(0.73 * xNorm - 1.4 + yNorm * 0.7) * Math.sin(0.5 * xNorm + 0.9 + yNorm * 0.5) +
        1.8 * Math.sin(2.3 * xNorm + Math.cos(xNorm) + yNorm * 0.3) * Math.exp(-0.02 * Math.pow(xNorm - 2, 2)) +
        0.9 * Math.cos(3.7 * xNorm - 0.8 + yNorm * 0.4) * (1 / (1 + 0.15 * xNorm * xNorm)) +
        1.2 * Math.sin(0.41 * xNorm * xNorm - xNorm + yNorm * 0.6)
    );
}

function applyWaves(imageData) {
    const ampR = params.wavesR / 100 * 80;
    const ampG = params.wavesG / 100 * 80;
    const ampB = params.wavesB / 100 * 80;
    const phase = params.wavesPhase / 100 * 20;

    const srcData = imageData.data;
    const width   = imageData.width;
    const height  = imageData.height;
    const result  = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const xNorm = x / width * 10 + phase;
            const yNorm = y / height * 8;
            const wave  = crtWaveFormula(xNorm, yNorm);

            const srcXR = Math.floor(Math.max(0, Math.min(width-1, x + wave * ampR)));
            const srcXG = Math.floor(Math.max(0, Math.min(width-1, x + wave * ampG)));
            const srcXB = Math.floor(Math.max(0, Math.min(width-1, x + wave * ampB)));

            const i = (y * width + x) * 4;
            result[i]   = srcData[(y * width + srcXR) * 4];
            result[i+1] = srcData[(y * width + srcXG) * 4 + 1];
            result[i+2] = srcData[(y * width + srcXB) * 4 + 2];
            result[i+3] = 255;
        }
    }

    imageData.data.set(result);
    return imageData;
}

export default {
    name: 'waves',
    label: 'Waves Effect',
    pass: 'post',
    params: {
        wavesEnabled: { default: false },
        wavesR:       { default: 0, min: -20, max: 20 },
        wavesG:       { default: 0, min: -20, max: 20 },
        wavesB:       { default: 0, min: -20, max: 20 },
        wavesPhase:   { default: 0, min: 0,   max: 100 },
    },
    enabled: (p) => p.wavesEnabled && (p.wavesR !== 0 || p.wavesG !== 0 || p.wavesB !== 0),
    canvas2d: applyWaves,
};
