import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawRotHandle, strokeAntLine, HIT_RADIUS, applyGrab } from '../overlayUtils.js';
import { drawFadeShape, getFadeHandlePositions, hitTestFadeVertices, isInsideFade } from './fadeOverlay.js';

// Wrinkle placement overlay, mirroring the Halftone/Color Gel gradient overlay:
//   linear      a dashed line along the crease direction that the user drags to move
//               the wrinkle patch, with a rotation handle that sets the angle
//   concentric  a dashed hub at the origin the user drags to move the center
// The effect's fade shape is drawn/edited inline too (only one overlay is active at a
// time, so it can't lean on the generic fade overlay).

const ROT_PX   = 34;   // rotation handle distance from the line (screen px)
const LINE_HIT = 0.03; // line grab threshold (uv perpendicular distance)
const HUB_PX   = 26;   // radius of the centre hub (screen px)

const clampNum = (v, lo, hi, def) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
};

const wrMode = (p) => p.wrinkleMode ?? 'linear';

const angleRad = (p) => clampNum(p.wrinkleAngle, -180, 180, 0) * Math.PI / 180;
// Crease tangent in screen pixels (y-down). The image aspect cancels out in the
// uv→pixel mapping, so the on-screen crease direction is simply (sin, cos).
const creaseScreen = (p) => { const a = angleRad(p); return [Math.sin(a), Math.cos(a)]; };

const centerUv = (p) => [
    0.5 + clampNum(p.wrinkleCenterX, -50, 50, 0) / 100,
    0.5 + clampNum(p.wrinkleCenterY, -50, 50, 0) / 100,
];
const centerPx = (p, W, H) => { const [cx, cy] = centerUv(p); return [cx * W, (1 - cy) * H]; };

const toPx = (ux, uy, w, h) => [ux * w, (1 - uy) * h];

function rotHandlePx(p, w, h) {
    const [cx, cy] = centerPx(p, w, h);
    const [tx, ty] = creaseScreen(p);
    const px = -ty, py = tx;                  // perpendicular to the crease line
    return { hx: cx + px * ROT_PX, hy: cy + py * ROT_PX };
}

const fadeCenterPx = (p, W, H) =>
    [(0.5 + (p.wrinkleFadeX ?? -25) / 100) * W, (0.5 - (p.wrinkleFadeY ?? -25) / 100) * H];

export function drawWrinkle(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);

    const mode = wrMode(p);
    if (mode === 'linear') {
        const [cx, cy] = centerPx(p, w, h);
        const [tx, ty] = creaseScreen(p);
        const len = Math.hypot(w, h);
        uiCtx.beginPath();
        uiCtx.moveTo(cx - tx * len, cy - ty * len);
        uiCtx.lineTo(cx + tx * len, cy + ty * len);
        strokeAntLine();

        const rot = rotHandlePx(p, w, h);
        uiCtx.beginPath();
        uiCtx.moveTo(cx, cy);
        uiCtx.lineTo(rot.hx, rot.hy);
        uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
        uiCtx.lineWidth   = 1;
        uiCtx.stroke();
        drawRotHandle(rot.hx, rot.hy);
    } else if (mode === 'concentric') {
        const [cx, cy] = centerPx(p, w, h);
        uiCtx.beginPath();
        uiCtx.arc(cx, cy, HUB_PX, 0, Math.PI * 2);
        strokeAntLine();
    }

    const [fcx, fcy] = fadeCenterPx(p, w, h);
    drawFadeShape(p, fcx, fcy, w, h);
}

export function hitTestWrinkle(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;

    const mode = wrMode(p);
    if (mode === 'linear') {
        const rot = rotHandlePx(p, W, H);
        if (Math.hypot(mx - rot.hx, my - rot.hy) <= HIT_RADIUS) return 'gradRot';

        const [cx, cy] = centerPx(p, W, H);
        const [tx, ty] = creaseScreen(p);
        const px = -ty, py = tx;
        // perpendicular distance (px) from the cursor to the crease line
        if (Math.abs((mx - cx) * px + (my - cy) * py) < 10) return 'line';
    }

    if (p.wrinkleFadeEnabled) {
        const [fcx, fcy] = fadeCenterPx(p, W, H);
        const vHit = hitTestFadeVertices(p, mx, my, fcx, fcy, W, H);
        if (vHit) return vHit;
        const { edgeW, edgeH, rotHandle } = getFadeHandlePositions(p, fcx, fcy, W, H);
        if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
        if (edgeW && Math.hypot(mx - edgeW[0], my - edgeW[1]) <= HIT_RADIUS) return 'fadeEdgeW';
        if (edgeH && Math.hypot(mx - edgeH[0], my - edgeH[1]) <= HIT_RADIUS) return 'fadeEdgeH';
        if (isInsideFade(p, mx, my, fcx, fcy, W, H)) return 'fadeCenter';
    }

    if (mode === 'concentric') {
        const [cx, cy] = centerPx(p, W, H);
        if (Math.hypot(mx - cx, my - cy) <= HUB_PX) return 'center';
    }
    return null;
}

const cursorAngleDeg = (mx, my, a) =>
    Math.atan2(-(my - a.pivotY) * a.scaleY, (mx - a.pivotX) * a.scaleX) * 180 / Math.PI;

export function wrinkleRotAnchor(p, mx, my, W, H) {
    const [cx, cy] = centerPx(p, W, H);
    const anchor = {
        startAngle: clampNum(p.wrinkleAngle, -180, 180, 0),
        pivotX: cx, pivotY: cy,
        scaleX: 1 / W, scaleY: 1 / H,
    };
    anchor.startCursor = cursorAngleDeg(mx, my, anchor);
    return anchor;
}

export function wrinkleCenterAnchor(p, mx, my, W, H) {
    const [cx, cy] = centerPx(p, W, H);
    return { grabDX: cx - mx, grabDY: cy - my };
}

export function onDragWrinkle(e, inst, rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W  = uiOverlay.width, H = uiOverlay.height;
    const p  = inst.params;
    const handle = state.handle;

    if (handle === 'line') {
        const [cx, cy] = centerPx(p, W, H);
        const [gx, gy] = applyGrab(cx, cy, mx, my);
        setInstanceParam(state.instId, 'wrinkleCenterX', Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100)) * 10) / 10);
        setInstanceParam(state.instId, 'wrinkleCenterY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100)) * 10) / 10);
        return;
    }

    if (handle === 'center') {
        const a = state.dragAnchor;
        const gx = mx + (a?.grabDX ?? 0), gy = my + (a?.grabDY ?? 0);
        setInstanceParam(state.instId, 'wrinkleCenterX', Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'wrinkleCenterY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100))));
        return;
    }

    if (handle === 'gradRot') {
        const a = state.dragAnchor;
        if (!a) return;
        const cursor = cursorAngleDeg(mx, my, a);
        let deg = a.startAngle + (cursor - a.startCursor);
        deg = ((deg + 180) % 360 + 360) % 360 - 180;
        setInstanceParam(state.instId, 'wrinkleAngle', Math.round(deg));
        return;
    }

    // Fade handles (fadeCenter/fadeEdge*/fadeRot/fadeV#) are dragged centrally in canvasPicker.
}
