import { params } from '../state/params.js';
import { canvas } from '../renderer/glstate.js';

// --- VHS image effects (bleed, tracking, noise) -------------------------

function applyVHS(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const result = new Uint8ClampedArray(data);

    if (params.vhsBleed > 0) {
        const bleed = Math.floor(params.vhsBleed);
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

    if (params.vhsTracking > 0) {
        const numLines = Math.floor(params.vhsTracking / 15);
        for (let t = 0; t < numLines; t++) {
            const lineY  = Math.floor(Math.random() * height);
            const offset = Math.floor(Math.random() * 30 - 15);
            for (let x = 0; x < width; x++) {
                const srcX = Math.max(0, Math.min(width-1, x + offset));
                const i    = (lineY*width + x)*4;
                const srcI = (lineY*width + srcX)*4;
                imageData.data[i]   = imageData.data[srcI];
                imageData.data[i+1] = imageData.data[srcI+1];
                imageData.data[i+2] = imageData.data[srcI+2];
            }
        }
    }

    if (params.vhsNoise > 0) {
        const intensity = params.vhsNoise / 100;
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

export function applyVHSTimestamp(ctx) {
    const marginMap = { small: 10, medium: 40, large: 160 };
    const margin = marginMap[params.vhsTimestampMargin] || 10;
    ctx.font = `${params.vhsTimestampSize}px JetBrains Mono, monospace`;

    if (params.vhsTimestampColor === 'black') {
        ctx.fillStyle   = 'rgba(0,0,0,0.85)';
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    } else {
        ctx.fillStyle   = 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    }
    ctx.lineWidth = 2;

    const ts  = params.vhsTimestamp;
    const pos = params.vhsTimestampPos;
    const x = pos.includes('left')
        ? margin
        : canvas.width - ctx.measureText(ts).width - margin;
    const y = pos.includes('top')
        ? margin + params.vhsTimestampSize
        : canvas.height - margin;

    ctx.strokeText(ts, x, y);
    ctx.fillText(ts, x, y);
}

// --- CSS overlay canvas renderer (WebGL path only) ----------------------
// Draws the timestamp onto an absolutely-positioned transparent canvas that
// sits on top of the WebGL canvas. Zero CPU↔GPU pixel roundtrip.

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
        vhsTracking: { default: 0, min: 0, max: 100 },
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
        vhsTimestampSize:    { default: 64,           min: 8, max: 512 },
        vhsTimestampPos:     { default: 'bottom-left' },
        vhsTimestampColor:   { default: 'white' },
        vhsTimestampMargin:  { default: 'small' },
    },
    enabled: (p) => p.vhsTimestampEnabled && !!p.vhsTimestamp,
    canvas2d: applyVHSTimestamp,  // (ctx) => void
};
