// Paste layer — the "place" half of the Cut Out pair. It renders the LIVE pixels captured by its
// linked Cut layer (see cutCapture.js) as movable / scalable / rotatable — and, with Allow Skew on,
// freely 4-corner-distortable — copies.
//
// Rendered via the canvas2d blendPrefix path, so it gets the reusable Blend + Fade controls: the
// renderer draws applyPaste onto a transparent sticker canvas and composites it through the
// generated blend/fade shader.

import { buildFadeControl, buildBlendControl } from './controls/index.js';
import { getCutCapture } from './cutCapture.js';
import { pasteCorners, drawImageQuad, isPlainRect } from './pasteTransform.js';

const fade  = buildFadeControl('paste');
const blend = buildBlendControl('paste');

export function pasteCount(p) {
    try { return JSON.parse(p.cutPastes || '[]').length; } catch { return 0; }
}

function applyPaste(ctx, p) {
    const cap = getCutCapture(p.pasteCutId);
    if (!cap || !cap.canvas) return;
    const img = cap.canvas;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const natW = cap.natW, natH = cap.natH;
    const allowSkew = !!p.pasteAllowSkew;

    let pastes;
    try { pastes = JSON.parse(p.cutPastes || '[]'); } catch { return; }
    for (const t of pastes) {
        const cx = (0.5 + (t.x ?? 0) / 100) * w;
        const cy = (0.5 - (t.y ?? 0) / 100) * h;
        if (isPlainRect(t, allowSkew)) {
            // Fast path — exact, seam-free rotated/scaled rectangle.
            const scale = (t.scale ?? 100) / 100;
            const dw = natW * scale, dh = natH * scale;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate((t.rot ?? 0) * Math.PI / 180);
            ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
            ctx.restore();
        } else {
            drawImageQuad(ctx, img, pasteCorners(t, cx, cy, natW, natH, allowSkew));
        }
    }
}

export const pasteEffect = {
    name:  'paste',
    label: 'Paste',
    kind:  'context',
    blendPrefix: 'paste',
    bindUniforms: (gl, prog, p) => { fade.bindUniforms(gl, prog, p); blend.bindUniforms(gl, prog, p); },
    paramKeys: [...fade.paramKeys, ...blend.paramKeys],
    handleParams: [...fade.handleParams],
    overlays: {},
    uiGroups: [
        { keys: ['pasteAllowSkew'] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    params: {
        pasteEnabled:   { default: true, label: 'Enable' },   // first, so the header checkbox binds it
        pasteAllowSkew: { default: true, label: 'Allow Skew (corner distort)' },
        cutPastes:      { default: '[{"x":0,"y":0,"scale":100,"rot":0}]', hidden: true },
        pasteCutId:     { default: null, hidden: true },   // back-link to the owning Cut layer
        ...fade.params,
        ...blend.params,
    },
    // Only active once its linked Cut has captured this pass (enforces Cut-above-Paste, no feedback).
    enabled: (p) => p.pasteEnabled && pasteCount(p) > 0 && !!getCutCapture(p.pasteCutId),
    canvas2d: applyPaste,
};
