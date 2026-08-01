import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawRotHandle, strokeAntLine, HIT_RADIUS, isInsideFadeShape, applyGrab } from '../overlayUtils.js';
import { drawFadeShape, getFadeHandlePositions } from './fadeOverlay.js';

// Caustics placement overlay: a dashed line along the flow direction the user drags to
// move the pattern, with a rotation handle that sets the angle. The fade shape is drawn
// inline (only one overlay is active at a time). No concentric mode.

const ROT_PX = 34;   // rotation handle distance from the line (screen px)

const clampNum = (v, lo, hi, def) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
};

const angleRad = (p) => clampNum(p.causticsAngle, -180, 180, 0) * Math.PI / 180;
// Flow tangent in screen pixels (y-down); aspect cancels in the uv→pixel mapping.
const flowScreen = (p) => { const a = angleRad(p); return [Math.sin(a), Math.cos(a)]; };

const centerUv = (p) => [
    0.5 + clampNum(p.causticsCenterX, -50, 50, 0) / 100,
    0.5 + clampNum(p.causticsCenterY, -50, 50, 0) / 100,
];
const centerPx = (p, W, H) => { const [cx, cy] = centerUv(p); return [cx * W, (1 - cy) * H]; };

function rotHandlePx(p, w, h) {
    const [cx, cy] = centerPx(p, w, h);
    const [tx, ty] = flowScreen(p);
    const px = -ty, py = tx;                  // perpendicular to the line
    return { hx: cx + px * ROT_PX, hy: cy + py * ROT_PX };
}

const fadeCenterPx = (p, W, H) =>
    [(0.5 + (p.causticsFadeX ?? -25) / 100) * W, (0.5 - (p.causticsFadeY ?? -25) / 100) * H];

export function drawCaustics(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);

    const [cx, cy] = centerPx(p, w, h);
    const [tx, ty] = flowScreen(p);
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

    const [fcx, fcy] = fadeCenterPx(p, w, h);
    drawFadeShape(p, fcx, fcy, w, h);
}

export function hitTestCaustics(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;

    const rot = rotHandlePx(p, W, H);
    if (Math.hypot(mx - rot.hx, my - rot.hy) <= HIT_RADIUS) return 'gradRot';

    const [cx, cy] = centerPx(p, W, H);
    const [tx, ty] = flowScreen(p);
    const px = -ty, py = tx;
    // perpendicular distance (px) from the cursor to the line
    if (Math.abs((mx - cx) * px + (my - cy) * py) < 10) return 'line';

    if (p.causticsFadeEnabled) {
        const [fcx, fcy] = fadeCenterPx(p, W, H);
        const { edgeW, edgeH, rotHandle } = getFadeHandlePositions(p, fcx, fcy, W, H);
        if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
        if (Math.hypot(mx - edgeW[0],     my - edgeW[1])     <= HIT_RADIUS) return 'fadeEdgeW';
        if (Math.hypot(mx - edgeH[0],     my - edgeH[1])     <= HIT_RADIUS) return 'fadeEdgeH';
        const shape = p.causticsFadeShape ?? 'ellipse';
        const angle = (p.causticsFadeAngle ?? 0) * Math.PI / 180;
        const a = (p.causticsFadeW / 100) * W / 2;
        const b = (p.causticsFadeH / 100) * H / 2;
        if (isInsideFadeShape(mx, my, fcx, fcy, a, b, angle, shape !== 'ellipse')) return 'fadeCenter';
    }
    return null;
}

const cursorAngleDeg = (mx, my, a) =>
    Math.atan2(-(my - a.pivotY) * a.scaleY, (mx - a.pivotX) * a.scaleX) * 180 / Math.PI;

export function causticsRotAnchor(p, mx, my, W, H) {
    const [cx, cy] = centerPx(p, W, H);
    const anchor = {
        startAngle: clampNum(p.causticsAngle, -180, 180, 0),
        pivotX: cx, pivotY: cy,
        scaleX: 1 / W, scaleY: 1 / H,
    };
    anchor.startCursor = cursorAngleDeg(mx, my, anchor);
    return anchor;
}

export function onDragCaustics(e, inst, rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W  = uiOverlay.width, H = uiOverlay.height;
    const p  = inst.params;
    const handle = state.handle;

    if (handle === 'line') {
        const [cx, cy] = centerPx(p, W, H);
        const [gx, gy] = applyGrab(cx, cy, mx, my);
        setInstanceParam(state.instId, 'causticsCenterX', Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100)) * 10) / 10);
        setInstanceParam(state.instId, 'causticsCenterY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100)) * 10) / 10);
        return;
    }

    if (handle === 'gradRot') {
        const a = state.dragAnchor;
        if (!a) return;
        const cursor = cursorAngleDeg(mx, my, a);
        let deg = a.startAngle + (cursor - a.startCursor);
        deg = ((deg + 180) % 360 + 360) % 360 - 180;
        setInstanceParam(state.instId, 'causticsAngle', Math.round(deg));
        return;
    }

    // Fade sub-handles. fadeCenter is intercepted centrally in canvasPicker (grab-offset),
    // so it won't reach here; the edge/rotate handles are resize/rotate (snap by design).
    const [fcx, fcy] = fadeCenterPx(p, W, H);
    if (handle === 'fadeEdgeW') {
        setInstanceParam(state.instId, 'causticsFadeW', Math.round(Math.max(1, Math.min(200, Math.abs(mx - fcx) / (W / 2) * 100))));
    } else if (handle === 'fadeEdgeH') {
        setInstanceParam(state.instId, 'causticsFadeH', Math.round(Math.max(1, Math.min(200, Math.abs(my - fcy) / (H / 2) * 100))));
    } else if (handle === 'fadeRot') {
        let deg = Math.atan2(my - fcy, mx - fcx) * 180 / Math.PI + 90;
        if (deg > 180)  deg -= 360;
        if (deg < -180) deg += 360;
        setInstanceParam(state.instId, 'causticsFadeAngle', Math.round(deg));
    }
}
