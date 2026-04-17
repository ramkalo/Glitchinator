import { params } from '../state/params.js';

function applyGrain(imageData) {
    const data = imageData.data;
    const intensity = params.grainIntensity / 100 * 50;

    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * intensity;
        data[i]   = Math.max(0, Math.min(255, data[i]   + noise));
        data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
        data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
    }
    return imageData;
}

export default {
    name: 'grain',
    label: 'Film Grain',
    pass: 'pre-crt',
    params: {
        grainEnabled:   { default: false },
        grainIntensity: { default: 0, min: 0, max: 100 },
    },
    enabled: (p) => p.grainEnabled && p.grainIntensity > 0,
    canvas2d: applyGrain,
};
