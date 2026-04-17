import { params } from '../state/params.js';

function applyPixelArt(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const pixelSize = params.pixelSize;
    const step = 256 / params.pixelColors;

    for (let y = 0; y < height; y += pixelSize) {
        for (let x = 0; x < width; x += pixelSize) {
            let r = 0, g = 0, b = 0, count = 0;

            for (let py = 0; py < pixelSize && y + py < height; py++) {
                for (let px = 0; px < pixelSize && x + px < width; px++) {
                    const i = ((y + py) * width + (x + px)) * 4;
                    r += data[i]; g += data[i+1]; b += data[i+2];
                    count++;
                }
            }

            r = Math.floor(r / count / step) * step;
            g = Math.floor(g / count / step) * step;
            b = Math.floor(b / count / step) * step;

            for (let py = 0; py < pixelSize && y + py < height; py++) {
                for (let px = 0; px < pixelSize && x + px < width; px++) {
                    const i = ((y + py) * width + (x + px)) * 4;
                    data[i] = r; data[i+1] = g; data[i+2] = b;
                }
            }
        }
    }
    return imageData;
}

export default {
    name: 'pixelArt',
    label: 'Pixel Art',
    pass: 'pre-crt',
    params: {
        pixelArtEnabled: { default: false },
        pixelSize:       { default: 24, min: 2, max: 32 },
        pixelColors:     { default: 16, min: 2, max: 64 },
    },
    enabled: (p) => p.pixelArtEnabled,
    canvas2d: applyPixelArt,
};
