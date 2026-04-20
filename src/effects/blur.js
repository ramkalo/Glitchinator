import { params } from '../state/params.js';

let cachedCurrent = null;
let cachedTmp = null;
let cachedResult = null;

function boxBlur(src, width, height, radius, passes) {
    const count = 2 * radius + 1;
    const len = src.length;
    
    if (!cachedCurrent || cachedCurrent.length !== len) {
        cachedCurrent = new Float32Array(len);
        cachedTmp = new Float32Array(len);
    }
    const current = cachedCurrent;
    const tmp = cachedTmp;
    for (let i = 0; i < len; i++) current[i] = src[i];

    for (let pass = 0; pass < passes; pass++) {
        // Horizontal sweep: current → tmp
        for (let y = 0; y < height; y++) {
            let sumR = 0, sumG = 0, sumB = 0;
            for (let d = -radius; d <= radius; d++) {
                const sx = Math.max(0, Math.min(width - 1, d));
                const si = (y * width + sx) * 4;
                sumR += current[si]; sumG += current[si+1]; sumB += current[si+2];
            }
            for (let x = 0; x < width; x++) {
                const di = (y * width + x) * 4;
                tmp[di]   = sumR / count;
                tmp[di+1] = sumG / count;
                tmp[di+2] = sumB / count;
                tmp[di+3] = current[di+3];

                const leaveX = Math.max(0, x - radius);
                const enterX = Math.min(width - 1, x + radius + 1);
                const li = (y * width + leaveX) * 4;
                const ei = (y * width + enterX) * 4;
                sumR += current[ei] - current[li];
                sumG += current[ei+1] - current[li+1];
                sumB += current[ei+2] - current[li+2];
            }
        }

        // Vertical sweep: tmp → current
        for (let x = 0; x < width; x++) {
            let sumR = 0, sumG = 0, sumB = 0;
            for (let d = -radius; d <= radius; d++) {
                const sy = Math.max(0, Math.min(height - 1, d));
                const si = (sy * width + x) * 4;
                sumR += tmp[si]; sumG += tmp[si+1]; sumB += tmp[si+2];
            }
            for (let y = 0; y < height; y++) {
                const di = (y * width + x) * 4;
                current[di]   = sumR / count;
                current[di+1] = sumG / count;
                current[di+2] = sumB / count;

                const leaveY = Math.max(0, y - radius);
                const enterY = Math.min(height - 1, y + radius + 1);
                const li = (leaveY * width + x) * 4;
                const ei = (enterY * width + x) * 4;
                sumR += tmp[ei] - tmp[li];
                sumG += tmp[ei+1] - tmp[li+1];
                sumB += tmp[ei+2] - tmp[li+2];
            }
        }
    }

    const resultLen = current.length;
    if (!cachedResult || cachedResult.length !== resultLen) {
        cachedResult = new Uint8ClampedArray(resultLen);
    }
    for (let i = 0; i < resultLen; i++) cachedResult[i] = current[i];
    return cachedResult;
}

function applyBlur(imageData, p = params) {
    const { data, width, height } = imageData;
    const radius = Math.round(p.blurRadius);
    if (radius < 1) return imageData;

    const passes  = Math.round(p.blurPasses ?? 1);
    const blurFull = boxBlur(data, width, height, radius, passes);

    const mode      = p.blurMode;
    const angleRad  = (p.blurAngle ?? 0) * Math.PI / 180;
    const cosA      = Math.cos(angleRad);
    const sinA      = Math.sin(angleRad);
    const a         = (p.blurMajor  / 100) * 0.7071;
    const b         = (p.blurMinor  / 100) * 0.7071;
    const centerUX  = 0.5 + p.blurCenterX / 100;
    const centerUY  = 0.5 - p.blurCenterY / 100;
    const edgeStr   = p.blurEdge   / 100;
    const centerStr = p.blurCenter / 100;

    for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
            const dx = px / width  - centerUX;
            const dy = py / height - centerUY;
            const rx =  cosA * dx + sinA * dy;
            const ry = -sinA * dx + cosA * dy;

            const dist    = (mode === 'rectangle')
                ? Math.max(Math.abs(rx) / a, Math.abs(ry) / b)
                : Math.sqrt((rx / a) * (rx / a) + (ry / b) * (ry / b));
            const falloff = Math.pow(Math.min(dist, 1.0), 2);
            const weight  = falloff * edgeStr + (1 - falloff) * centerStr;
            if (weight <= 0) continue;

            const i = (py * width + px) * 4;
            const t = Math.min(weight, 1.0);
            data[i]   = data[i]   + (blurFull[i]   - data[i])   * t;
            data[i+1] = data[i+1] + (blurFull[i+1] - data[i+1]) * t;
            data[i+2] = data[i+2] + (blurFull[i+2] - data[i+2]) * t;
        }
    }

    return imageData;
}

export default {
    name:  'blur',
    label: 'Blur',
    pass:  'pre-crt',
    params: {
        blurEdge:    { default: 100, min: 0,   max: 100 },
        blurCenter:  { default: 0,   min: 0,   max: 100 },
        blurEnabled: { default: false },
        blurRadius:  { default: 8,   min: 1,   max: 50  },
        blurPasses:  { default: 1,   min: 1,   max: 3   },
        blurMode:    { default: 'ellipse' },
        blurMajor:   { default: 100, min: 0,   max: 150 },
        blurMinor:   { default: 100, min: 0,   max: 150 },
        blurAngle:   { default: 0,   min: 0,   max: 180 },
        blurCenterX: { default: 0,   min: -50, max: 50  },
        blurCenterY: { default: 0,   min: -50, max: 50  },
    },
    enabled:  (p) => p.blurEnabled,
    canvas2d: applyBlur,
};
