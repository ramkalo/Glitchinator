// Cut layer — the "cut" half of the Cut Out pair.
//   The overlay shows the selection shape (handles in cutOverlay.js): position, size, rotate.
//   Every render, canvas2d captures the LIVE pixels under the shape (at this layer's position in
//   the stack) into the shared cut-capture registry, keyed by this instance id. The linked Paste
//   layer reads that capture the same pass. Optionally it also punches a real hole (cutErase).
//
// Because the capture is live, moving this layer in the stack — or editing its shape — changes what
// the Paste shows. Rendered via the legacy context path (no blendPrefix) so `destination-out` can
// punch a real hole. Adding "Cut Out" inserts this layer plus a connected Paste layer (autoPair).

import { shapeGeometry, traceShapePath } from './cutShape.js';
import { setCutCapture } from './cutCapture.js';

function applyCut(ctx, p) {
    const w = ctx.canvas.width, h = ctx.canvas.height;   // overlayCanvas holds the live composite
    const g = shapeGeometry(p, w, h);

    // Live capture: clip the shape region from the current pipeline state into a stash. Read
    // BEFORE any erase so the captured pixels are the region, not a hole.
    const bx0 = Math.max(0, Math.floor(g.bbox[0]));
    const by0 = Math.max(0, Math.floor(g.bbox[1]));
    const bx1 = Math.min(w, Math.ceil(g.bbox[2]));
    const by1 = Math.min(h, Math.ceil(g.bbox[3]));
    const cw = bx1 - bx0, ch = by1 - by0;
    if (cw >= 1 && ch >= 1 && p._instanceId) {
        const cap  = document.createElement('canvas');
        cap.width  = cw; cap.height = ch;
        const cctx = cap.getContext('2d');
        cctx.save();
        cctx.translate(-bx0, -by0);
        traceShapePath(cctx, g);
        cctx.clip();
        cctx.drawImage(ctx.canvas, 0, 0);
        cctx.restore();
        setCutCapture(p._instanceId, { canvas: cap, natW: cw, natH: ch });
    }

    // True cut: remove the region from the current image at this layer's position.
    if (p.cutErase) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        traceShapePath(ctx, g);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.restore();
    }
}

export const cutEffect = {
    name:  'cut',
    label: 'Cut',
    kind:  'context',
    autoPair: {
        partnerEffectName: 'paste',
        partnerIdKey:      'cutPasteId',   // stored on this (owner) instance
        backIdKey:         'pasteCutId',   // stored on the partner instance
        position:          'after',
    },
    handleParams: [
        'cutX', 'cutY', 'cutW', 'cutH', 'cutRot',
        ...Array.from({ length: 12 }, (_, i) => [`cutV${i}x`, `cutV${i}y`]).flat(),
    ],
    params: {
        cutEnabled: { default: true, label: 'Enable' },   // first, so the header checkbox binds it
        cutShape: { default: 'rectangle', label: 'Shape', options: [['rectangle', 'Rectangle'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle'], ['polygon', 'Polygon']] },
        cutSides: { default: 6, min: 3, max: 12, label: 'Sides' },
        cutErase: { default: false, label: 'Erase original (cut, not copy)' },
        cutX:   { default: 0 },
        cutY:   { default: 0 },
        cutW:   { default: 30 },
        cutH:   { default: 20 },
        cutRot: { default: 0 },
        ...Array.from({ length: 12 }, (_, i) => ({
            [`cutV${i}x`]: { default: 0 },
            [`cutV${i}y`]: { default: 0 },
        })).reduce((acc, o) => ({ ...acc, ...o }), {}),
        cutPasteId: { default: null, hidden: true },   // linked Paste layer id
    },
    uiGroups: (p) => [{ keys: p.cutShape === 'polygon' ? ['cutShape', 'cutSides', 'cutErase'] : ['cutShape', 'cutErase'] }],
    enabled: (p) => p.cutEnabled,
    canvas2d: applyCut,
};
