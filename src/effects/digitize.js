import { params } from '../state/params.js';

function applyDigitize(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    if (params.digitizeDither > 0) {
        // Floyd-Steinberg error-diffusion dithering
        const amount = params.digitizeDither / 100;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const oldR = data[i], oldG = data[i+1], oldB = data[i+2];
                const newR = Math.round(oldR / 32) * 32;
                const newG = Math.round(oldG / 32) * 32;
                const newB = Math.round(oldB / 32) * 32;
                data[i] = newR; data[i+1] = newG; data[i+2] = newB;

                const errR = (oldR - newR) * amount;
                const errG = (oldG - newG) * amount;
                const errB = (oldB - newB) * amount;

                const spread = (nx, ny, f) => {
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const ni = (ny * width + nx) * 4;
                        data[ni]   = Math.max(0, Math.min(255, data[ni]   + errR * f));
                        data[ni+1] = Math.max(0, Math.min(255, data[ni+1] + errG * f));
                        data[ni+2] = Math.max(0, Math.min(255, data[ni+2] + errB * f));
                    }
                };
                spread(x+1, y,   7/16);
                spread(x-1, y+1, 3/16);
                spread(x,   y+1, 5/16);
                spread(x+1, y+1, 1/16);
            }
        }
    }

    if (params.digitizeNoise > 0) {
        const intensity = params.digitizeNoise / 100 * 80;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * intensity;
            data[i]   = Math.max(0, Math.min(255, data[i]   + noise));
            data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
            data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
        }
    }

    return imageData;
}

export default {
    name: 'digitize',
    label: 'Digitize',
    pass: 'pre-crt',
    params: {
        digitizeEnabled: { default: false },
        digitizeDither:  { default: 0, min: 0, max: 100 },
        digitizeNoise:   { default: 0, min: 0, max: 100 },
    },
    enabled: (p) => p.digitizeEnabled && (p.digitizeDither > 0 || p.digitizeNoise > 0),
    canvas2d: applyDigitize,
};
