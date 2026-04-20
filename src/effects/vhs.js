import { params } from '../state/params.js';
import { canvas } from '../renderer/glstate.js';

let cachedBleedBuffer = null;

function applyVHS(imageData, p = params) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    let result = null;

    if (p.vhsBleed > 0) {
        if (!cachedBleedBuffer || cachedBleedBuffer.length !== data.length) {
            cachedBleedBuffer = new Uint8ClampedArray(data.length);
        }
        result = cachedBleedBuffer;
        const bleed = Math.floor(p.vhsBleed);
        for (let y = 0; y < height; y++) {
            for (let x = bleed; x < width; x++) {
                result[(y*width + x)*4] = data[(y*width + (x-bleed))*4];
            }
            for (let x = 0; x < width - bleed; x++) {
                result[(y*width + x)*4 + 2] = data[(y*width + (x+bleed))*4 + 2];
            }
        }
        imageData.data.set(result);
    }

    if (p.vhsTracking > 0) {
        const numBands  = Math.round(p.vhsTrackingAmount);
        const thickness = Math.round(p.vhsTrackingThickness);
        const maxShift  = Math.ceil(p.vhsTracking / 100 * width * 0.2);
        // LCG seeded RNG — seed controls band spacing
        let lcgState = ((p.vhsTrackingSeed || 1) * 1664525 + 1013904223) | 0;
        const lcgNext = () => { lcgState = Math.imul(1664525, lcgState) + 1013904223 | 0; return (lcgState >>> 0) / 4294967296; };

        for (let t = 0; t < numBands; t++) {
            const bandY = Math.floor(Math.max(0, Math.min(height - thickness, lcgNext() * height)));
            const hash    = (((t + 1) * 2654435761) >>> 0) % 1000;
            const shift   = Math.floor((hash / 999 * 2 - 1) * maxShift);

            const color = p.vhsTrackingColor || 'shift';

            for (let dy = 0; dy < thickness; dy++) {
                const y = Math.min(height - 1, bandY + dy);
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    if (color === 'white') {
                        imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = 255;
                    } else if (color === 'black') {
                        imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = 0;
                    } else if (color === 'noise') {
                        const n = Math.random() * 255;
                        imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = n;
                    } else if (color === 'color') {
                        imageData.data[i]     = Math.random() * 255;
                        imageData.data[i + 1] = Math.random() * 255;
                        imageData.data[i + 2] = Math.random() * 255;
                    } else {
                        const srcX = Math.max(0, Math.min(width - 1, x + shift));
                        const srcI = (y * width + srcX) * 4;
                        imageData.data[i]     = imageData.data[srcI];
                        imageData.data[i + 1] = imageData.data[srcI + 1];
                        imageData.data[i + 2] = imageData.data[srcI + 2];
                    }
                }
            }
        }
    }

    if (p.vhsNoise > 0) {
        const intensity = p.vhsNoise / 100;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 120 * intensity;
            imageData.data[i]   = Math.max(0, Math.min(255, imageData.data[i]   + noise));
            imageData.data[i+1] = Math.max(0, Math.min(255, imageData.data[i+1] + noise));
            imageData.data[i+2] = Math.max(0, Math.min(255, imageData.data[i+2] + noise));
        }
    }

    return imageData;
}

// --- VHS timestamp overlay (draws to canvas context) --------------------

export function applyVHSTimestamp(ctx, p = params) {
    ctx.font = `${p.vhsTimestampSize}px JetBrains Mono, monospace`;

    if (p.vhsTimestampColor === 'black') {
        ctx.fillStyle   = 'rgba(0,0,0,0.85)';
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    } else {
        ctx.fillStyle   = 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    }
    ctx.lineWidth = 2;

    const ts = p.vhsTimestamp;
    const x = (0.5 + p.vhsTimestampX / 100) * canvas.width;
    const y = (0.5 - p.vhsTimestampY / 100) * canvas.height;

    ctx.strokeText(ts, x, y);
    ctx.fillText(ts, x, y);
}

// --- CSS overlay canvas renderer -----------------------------------
// Draws the timestamp onto an absolutely-positioned transparent canvas that
// sits on top of the main canvas. Prevents timestamp from being re-rendered
// on every pixel operation.

export function renderTimestampOverlay(overlayCanvas) {
    overlayCanvas.width  = canvas.width;
    overlayCanvas.height = canvas.height;
    const octx = overlayCanvas.getContext('2d');
    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (params.vhsTimestampEnabled && params.vhsTimestamp) {
        applyVHSTimestamp(octx);
    }
}

// --- Effect definitions -------------------------------------------------

export const vhsEffect = {
    name: 'vhs',
    label: 'VHS Effect',
    pass: 'pre-crt',
    params: {
        vhsEnabled:  { default: false },
        vhsTracking:          { default: 0,  min: 0,   max: 100 },

        vhsTrackingThickness: { default: 3,  min: 1,   max: 50  },
        vhsTrackingAmount:    { default: 2,  min: 2,   max: 20  },
        vhsTrackingSeed:      { default: 1 },
        vhsTrackingColor:     { default: 'shift' },
        vhsBleed:    { default: 0, min: 0, max: 20  },
        vhsNoise:    { default: 0, min: 0, max: 100 },
    },
    enabled: (p) => p.vhsEnabled,
    canvas2d: applyVHS,
};

export const vhsTimestampEffect = {
    name: 'vhsTimestamp',
    label: 'VHS Timestamp',
    pass: 'context',          // draws to canvas 2D context, not imageData
    params: {
        vhsTimestampEnabled: { default: false },
        vhsTimestamp:        { default: 'DEC 31 1999 11:59:59' },
        vhsTimestampSize:    { default: 64,           min: 8,  max: 512 },
        vhsTimestampX:       { default: 0,             min: -50, max: 50  },
        vhsTimestampY:       { default: 40,            min: -50, max: 50  },
        vhsTimestampColor:   { default: 'white' },
    },
    enabled: (p) => p.vhsTimestampEnabled && !!p.vhsTimestamp,
    canvas2d: applyVHSTimestamp,  // (ctx) => void
};
