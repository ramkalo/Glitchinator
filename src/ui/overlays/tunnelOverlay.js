import { canvas } from '../../renderer/glstate.js';
import { setInstanceParam, getStack } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, HIT_RADIUS, drawHandle, drawCornerHandle, strokeAntLine } from '../overlayUtils.js';
import { drawFadeShape, getFadeHandlePositions, hitTestFadeVertices, isInsideFade } from './fadeOverlay.js';

function _pts(p, W, H) {
    return {
        x1: (p.tunnelX1 ?? 25) / 100 * W,
        y1: (p.tunnelY1 ?? 50) / 100 * H,
        x2: (p.tunnelX2 ?? 75) / 100 * W,
        y2: (p.tunnelY2 ?? 50) / 100 * H,
        cx: (p.tunnelCx ?? 50) / 100 * W,
        cy: (p.tunnelCy ?? 40) / 100 * H,
    };
}

function _fadePx(p, W, H) {
    return {
        fcx: (0.5 + (p.tunnelFadeX ?? 0) / 100) * W,
        fcy: (0.5 - (p.tunnelFadeY ?? 0) / 100) * H,
    };
}

export function drawTunnelOverlay(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);

    const { x1, y1, x2, y2, cx, cy } = _pts(p, W, H);

    // Bezier curve
    uiCtx.beginPath();
    uiCtx.moveTo(x1, y1);
    uiCtx.quadraticCurveTo(cx, cy, x2, y2);
    strokeAntLine();

    // Dashed guide line from curve midpoint (t=0.5) to control handle
    const bmx = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
    const bmy = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
    uiCtx.save();
    uiCtx.beginPath();
    uiCtx.moveTo(bmx, bmy);
    uiCtx.lineTo(cx, cy);
    uiCtx.setLineDash([4, 4]);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.lineWidth = 1;
    uiCtx.stroke();
    uiCtx.setLineDash([]);
    uiCtx.restore();

    drawHandle(x1, y1);       // start — circle
    drawHandle(x2, y2);       // end — circle
    drawCornerHandle(cx, cy); // control point — square

    // Fade ghost shape + handles when fade is enabled (shared implementation).
    const { fcx, fcy } = _fadePx(p, W, H);
    drawFadeShape(p, fcx, fcy, W, H);
}

export function hitTestTunnel(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;

    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const p = inst.params;

    // Fade handles take priority (shared implementation).
    if (state.enabledKey && p[state.enabledKey]) {
        const { fcx, fcy } = _fadePx(p, W, H);
        const vHit = hitTestFadeVertices(p, mx, my, fcx, fcy, W, H);
        if (vHit) return vHit;
        const { edgeW, edgeH, rotHandle } = getFadeHandlePositions(p, fcx, fcy, W, H);
        if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
        if (edgeW && Math.hypot(mx - edgeW[0], my - edgeW[1]) <= HIT_RADIUS) return 'fadeEdgeW';
        if (edgeH && Math.hypot(mx - edgeH[0], my - edgeH[1]) <= HIT_RADIUS) return 'fadeEdgeH';
        if (isInsideFade(p, mx, my, fcx, fcy, W, H)) return 'fadeCenter';
    }

    // Tunnel handles
    const { x1, y1, x2, y2, cx, cy } = _pts(p, W, H);

    if (Math.hypot(mx - cx, my - cy) <= HIT_RADIUS) return 'ctrl';
    if (Math.hypot(mx - x1, my - y1) <= HIT_RADIUS) return 'start';
    if (Math.hypot(mx - x2, my - y2) <= HIT_RADIUS) return 'end';

    const STEPS = 30;
    for (let i = 0; i <= STEPS; i++) {
        const t  = i / STEPS;
        const mt = 1 - t;
        const bx = mt * mt * x1 + 2 * mt * t * cx + t * t * x2;
        const by = mt * mt * y1 + 2 * mt * t * cy + t * t * y2;
        if (Math.hypot(mx - bx, my - by) <= HIT_RADIUS * 1.5) return 'move';
    }

    return null;
}

export function onDragTunnel(e, inst, rect) {
    const W = uiOverlay.width, H = uiOverlay.height;
    const h = state.handle;

    // Fade handles (fadeCenter/fadeEdge*/fadeRot/fadeV#) are dragged centrally in canvasPicker.

    // Tunnel handle drags — use dragAnchor
    if (!state.dragAnchor) return;
    const dx = ((e.clientX - rect.left) - state.dragAnchor.startX) / W * 100;
    const dy = ((e.clientY - rect.top)  - state.dragAnchor.startY) / H * 100;
    const a  = state.dragAnchor;

    if (h === 'start') {
        setInstanceParam(inst.id, 'tunnelX1', a.x10 + dx);
        setInstanceParam(inst.id, 'tunnelY1', a.y10 + dy);
    } else if (h === 'end') {
        setInstanceParam(inst.id, 'tunnelX2', a.x20 + dx);
        setInstanceParam(inst.id, 'tunnelY2', a.y20 + dy);
    } else if (h === 'ctrl') {
        setInstanceParam(inst.id, 'tunnelCx', a.cx0 + dx);
        setInstanceParam(inst.id, 'tunnelCy', a.cy0 + dy);
    } else if (h === 'move') {
        setInstanceParam(inst.id, 'tunnelX1', a.x10 + dx);
        setInstanceParam(inst.id, 'tunnelY1', a.y10 + dy);
        setInstanceParam(inst.id, 'tunnelX2', a.x20 + dx);
        setInstanceParam(inst.id, 'tunnelY2', a.y20 + dy);
        setInstanceParam(inst.id, 'tunnelCx', a.cx0 + dx);
        setInstanceParam(inst.id, 'tunnelCy', a.cy0 + dy);
    }
}
