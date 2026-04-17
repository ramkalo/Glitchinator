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

function applyCRT(imageData) {
    const width  = imageData.width;
    const height = imageData.height;
    let data     = imageData.data;

    // --- Curvature (barrel distortion) ---
    if (params.crtCurvature > 0) {
        const srcData  = new Uint8ClampedArray(data);
        const result   = new Uint8ClampedArray(width * height * 4);
        const centerX  = (0.5 + params.crtCurvatureX / 100) * width;
        const centerY  = (0.5 - params.crtCurvatureY / 100) * height; // Flip Y
        const maxRadius = Math.min(width, height) * (params.crtCurvatureRadius / 100);
        const k = (params.crtCurvature / 100) * (params.crtCurvatureIntensity / 100);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const dx = x - centerX, dy = y - centerY;
                const r  = Math.sqrt(dx*dx + dy*dy);
                let srcX = x, srcY = y;
                if (r > 0 && r < maxRadius) {
                    const factor = 1 - k * Math.pow(1 - r / maxRadius, 2);
                    srcX = centerX + dx * factor;
                    srcY = centerY + dy * factor;
                }
                const sx = Math.floor(Math.max(0, Math.min(width-1,  srcX)));
                const sy = Math.floor(Math.max(0, Math.min(height-1, srcY)));
                const i = (y * width + x) * 4;
                const s = (sy * width + sx) * 4;
                result[i] = srcData[s]; result[i+1] = srcData[s+1];
                result[i+2] = srcData[s+2]; result[i+3] = 255;
            }
        }
        imageData.data.set(result);
        data = imageData.data;
    }

    // --- Scanlines ---
    if (params.crtScanline > 0) {
        const darken  = 1 - (params.crtScanline / 100) * 0.7;
        const spacing = Math.floor(params.crtScanSpacing);
        for (let y = 0; y < height; y++) {
            if (y % spacing < 1) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    data[i] *= darken; data[i+1] *= darken; data[i+2] *= darken;
                }
            }
        }
    }

    // --- CRT Waves (single-axis offset with R/B split) ---
    if (params.crtWaves > 0) {
        const srcData = new Uint8ClampedArray(data);
        const result  = new Uint8ClampedArray(width * height * 4);
        const amp     = (params.crtWaves / 100) * 80;
        const phase   = params.crtWavePhase / 100 * 20;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const xNorm  = x / width * 10 + phase;
                const yNorm  = y / height * 8;
                const offset = Math.floor(crtWaveFormula(xNorm, yNorm) * amp);

                const srcXR = Math.max(0, Math.min(width-1, x + offset));
                const srcXB = Math.max(0, Math.min(width-1, x - offset));
                const i = (y * width + x) * 4;

                result[i]   = srcData[(y * width + srcXR) * 4];
                result[i+1] = srcData[(y * width + x)    * 4 + 1];
                result[i+2] = srcData[(y * width + srcXB) * 4 + 2];
                result[i+3] = 255;
            }
        }
        imageData.data.set(result);
        data = imageData.data;
    }

    // --- Static noise ---
    if (params.crtStatic > 0) {
        const intensity = params.crtStatic / 100;
        const type = params.crtStaticType;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 255 * intensity;
            if (type === 'white') {
                data[i]   = Math.max(0, Math.min(255, data[i]   + noise));
                data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
                data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
            } else if (type === 'color') {
                data[i]   = Math.max(0, Math.min(255, data[i]   + noise * Math.random()));
                data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise * Math.random()));
                data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise * Math.random()));
            } else if (type === 'luma') {
                const gray    = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
                const newGray = Math.max(0, Math.min(255, gray + noise));
                const ratio   = newGray / (gray || 1);
                data[i] *= ratio; data[i+1] *= ratio; data[i+2] *= ratio;
            }
        }
    }

    return imageData;
}

export default {
    name: 'crt',
    label: 'CRT Effect',
    pass: 'post',
    params: {
        crtEnabled:            { default: false },
        crtCurvature:          { default: 0,   min: 0,   max: 100 },
        crtCurvatureRadius:    { default: 100, min: 0,   max: 100 },
        crtCurvatureIntensity: { default: 100, min: 0,   max: 100 },
        crtCurvatureX:         { default: 0,   min: -50, max: 50  },
        crtCurvatureY:         { default: 0,   min: -50, max: 50  },
        crtScanline:           { default: 0,   min: 0,   max: 100 },
        crtScanSpacing:        { default: 4,   min: 2,   max: 12  },
        crtWaves:              { default: 0,   min: 0,   max: 20  },
        crtWavePhase:          { default: 0,   min: 0,   max: 100 },
        crtStatic:             { default: 0,   min: 0,   max: 100 },
        crtStaticType:         { default: 'white' },
    },
    enabled: (p) => p.crtEnabled &&
        (p.crtCurvature > 0 || p.crtScanline > 0 || p.crtWaves > 0 || p.crtStatic > 0),
    canvas2d: applyCRT,
};
