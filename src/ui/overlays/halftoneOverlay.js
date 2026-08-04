import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawRotHandle, strokeAntLine, HIT_RADIUS } from '../overlayUtils.js';
import { drawFadeShape, getFadeHandlePositions, hitTestFadeVertices, isInsideFade } from './fadeOverlay.js';

// Halftone placement overlay. Mirrors the Color Gel gradient overlay:
//   linear      a dashed line the user drags to move the gradient origin, with a
//               rotation handle that sets the angle
//   concentric  a dashed hub at the origin the user drags to move the center
//   dynamic     nothing (the grid is luminance-driven)
// The effect's fade shape is drawn/edited inline too, exactly as Color Gel does.

const ROT_PX   = 34;   // rotation handle distance from the line (screen px)
const LINE_HIT = 0.03; // line grab threshold (uv perpendicular distance)
const HUB_PX   = 26;   // radius of the centre hub (screen px)

const clampNum = (v, lo, hi, def) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
};

const htMode = (p) => p.halftoneMode ?? 'linear';

const angleRad = (p) => clampNum(p.halftoneAngle, -180, 180, 45) * Math.PI / 180;
const axisDir  = (p) => { const a = angleRad(p); return [Math.cos(a), Math.sin(a)]; };

// Origin in uv (y-up), matching the shader/effect convention.
const centerUv = (p) => [
    0.5 + clampNum(p.halftoneCenterX, -50, 50, 0) / 100,
    0.5 + clampNum(p.halftoneCenterY, -50, 50, 0) / 100,
];
const centerPx = (p, W, H) => { const [cx, cy] = centerUv(p); return [cx * W, (1 - cy) * H]; };

const toPx = (ux, uy, w, h) => [ux * w, (1 - uy) * h];

function rotHandlePx(p, w, h) {
    const [nx, ny] = axisDir(p);
    const len = Math.hypot(nx * w, ny * h) || 1;
    const ox = nx * w / len, oy = -ny * h / len;
    const [ax, ay] = centerUv(p);
    const [px, py] = toPx(ax, ay, w, h);
    return { hx: px + ox * ROT_PX, hy: py + oy * ROT_PX };
}

const fadeCenterPx = (p, W, H) =>
    [(0.5 + (p.halftoneFadeX ?? -25) / 100) * W, (0.5 - (p.halftoneFadeY ?? -25) / 100) * H];

export function drawHalftone(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);

    const mode = htMode(p);
    if (mode === 'linear') {
        const [nx, ny] = axisDir(p);
        const lx = -ny, ly = nx;                 // line runs perpendicular to the axis
        const [ax, ay] = centerUv(p);

        const [x1, y1] = toPx(ax + lx * 2, ay + ly * 2, w, h);
        const [x2, y2] = toPx(ax - lx * 2, ay - ly * 2, w, h);
        uiCtx.beginPath();
        uiCtx.moveTo(x1, y1);
        uiCtx.lineTo(x2, y2);
        strokeAntLine();

        const [px, py] = toPx(ax, ay, w, h);
        const rot = rotHandlePx(p, w, h);
        uiCtx.beginPath();
        uiCtx.moveTo(px, py);
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

export function hitTestHalftone(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;

    const mode = htMode(p);
    if (mode === 'linear') {
        const rot = rotHandlePx(p, W, H);
        if (Math.hypot(mx - rot.hx, my - rot.hy) <= HIT_RADIUS) return 'gradRot';

        const [nx, ny] = axisDir(p);
        const [ax, ay] = centerUv(p);
        const cx = mx / W, cy = 1 - my / H;
        if (Math.abs((cx - ax) * nx + (cy - ay) * ny) < LINE_HIT) return 'line';
    }

    if (p.halftoneFadeEnabled) {
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

export function htRotAnchor(p, mx, my, W, H) {
    const [cx, cy] = centerPx(p, W, H);
    const anchor = {
        startAngle: clampNum(p.halftoneAngle, -180, 180, 45),
        pivotX: cx, pivotY: cy,
        scaleX: 1 / W, scaleY: 1 / H,
    };
    anchor.startCursor = cursorAngleDeg(mx, my, anchor);
    return anchor;
}

export function htCenterAnchor(p, mx, my, W, H) {
    const [cx, cy] = centerPx(p, W, H);
    return { grabDX: cx - mx, grabDY: cy - my };
}

export function onDragHalftone(e, inst, rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W  = uiOverlay.width, H = uiOverlay.height;
    const p  = inst.params;
    const handle = state.handle;

    if (handle === 'line') {
        setInstanceParam(state.instId, 'halftoneCenterX', Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100)) * 10) / 10);
        setInstanceParam(state.instId, 'halftoneCenterY', Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100)) * 10) / 10);
        return;
    }

    if (handle === 'center') {
        const a = state.dragAnchor;
        const gx = mx + (a?.grabDX ?? 0), gy = my + (a?.grabDY ?? 0);
        setInstanceParam(state.instId, 'halftoneCenterX', Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'halftoneCenterY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100))));
        return;
    }

    if (handle === 'gradRot') {
        const a = state.dragAnchor;
        if (!a) return;
        const cursor = cursorAngleDeg(mx, my, a);
        let deg = a.startAngle + (cursor - a.startCursor);
        deg = ((deg + 180) % 360 + 360) % 360 - 180;
        setInstanceParam(state.instId, 'halftoneAngle', Math.round(deg));
        return;
    }

    // Fade handles (fadeCenter/fadeEdge*/fadeRot/fadeV#) are dragged centrally in canvasPicker.
}
