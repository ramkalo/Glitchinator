// Frame — a plain, solid-color polaroid-style border drawn around the image.
// Canvas2D (`context` kind): the current pipeline pixels are already blitted onto
// the overlay canvas before drawFrame runs, so we just paint the border ring on top.

import { resolveColorKey, STANDARD_COLOR_OPTIONS } from './colorOptions.js';
import { canvas } from '../renderer/glstate.js';

// Add a rounded-rect subpath to the current path (does not fill/stroke).
function roundRectPath(ctx, x, y, width, height, r) {
    if (width <= 0 || height <= 0) return;
    r = Math.max(0, Math.min(r, width / 2, height / 2));
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, width, height, r);
        return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
}

function drawFrame(ctx, p) {
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;

    // Border thickness as a percentage of the shorter image dimension.
    const bw = Math.round((p.frameWidth / 100) * Math.min(w, h));
    if (bw <= 0) return;

    const innerW = Math.max(0, w - 2 * bw);
    const innerH = Math.max(0, h - 2 * bw);
    if (innerW <= 0 || innerH <= 0) {
        // Frame is thick enough to cover the whole image — just fill solid.
        ctx.save();
        ctx.fillStyle = resolveColorKey(p.frameColor, p._activePalette) ?? '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        return;
    }

    // Inner-corner roundness: 0–100 maps to 0..(half the inner short side).
    const maxR = Math.min(innerW, innerH) / 2;
    const radius = Math.max(0, Math.min(maxR, (p.frameRadius / 100) * maxR));

    const color = resolveColorKey(p.frameColor, p._activePalette) ?? '#ffffff';

    // Even-odd fill of (full canvas) minus (inner rounded rect) = the border ring.
    // Outer edge stays square (canvas edge); inner edge (the photo window) is rounded.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    roundRectPath(ctx, bw, bw, innerW, innerH, radius);
    ctx.fillStyle = color;
    ctx.fill('evenodd');
    ctx.restore();
}

export const frameEffect = {
    name: 'frame',
    label: 'Frame',
    kind: 'context',
    params: {
        frameEnabled: { default: false, label: 'Enable' },
        frameWidth:   { default: 6, min: 0, max: 25, label: 'Width' },
        frameRadius:  { default: 0, min: 0, max: 100, label: 'Corner Roundness' },
        frameColor:   { default: 'palette7', type: 'paletteSelect', options: STANDARD_COLOR_OPTIONS, label: 'Color' },
    },
    enabled: (p) => p.frameEnabled,
    canvas2d: drawFrame,
};
