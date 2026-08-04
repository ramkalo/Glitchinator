import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHandle, drawRotHandle, HIT_RADIUS, applyGrab } from '../overlayUtils.js';
import { drawFadeShape, getFadeHandlePositions, hitTestFadeVertices, isInsideFade } from './fadeOverlay.js';

export function drawLineDrag(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);

    // Anchor uses 0-100 system (0=left/top)
    const cx = (p.lineDragX / 100) * w;
    const cy = (p.lineDragY / 100) * h;

    // Dashed control line spanning the canvas at current angle
    const angleRad = p.lineDragAngle * Math.PI / 180;
    const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
    const ext = Math.max(w, h) * 2;
    uiCtx.beginPath();
    uiCtx.moveTo(cx - cos * ext, cy - sin * ext);
    uiCtx.lineTo(cx + cos * ext, cy + sin * ext);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.setLineDash([5, 5]);
    uiCtx.stroke();
    uiCtx.setLineDash([]);

    // Rotation handle for line angle: perpendicular to the line, 22px away
    const perpAngleRad = angleRad + Math.PI / 2;
    const perpCos = Math.cos(perpAngleRad), perpSin = Math.sin(perpAngleRad);
    const rotHandleX = cx + perpCos * 22;
    const rotHandleY = cy + perpSin * 22;

    uiCtx.beginPath();
    uiCtx.moveTo(cx, cy);
    uiCtx.lineTo(rotHandleX, rotHandleY);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.lineWidth   = 1;
    uiCtx.stroke();

    drawRotHandle(rotHandleX, rotHandleY);

    // Fade shape + handles when fade is enabled (shared implementation).
    const fcx = (0.5 + p.lineDragFadeX / 100) * w;
    const fcy = (0.5 - p.lineDragFadeY / 100) * h;
    drawFadeShape(p, fcx, fcy, w, h);

    drawHandle(cx, cy);
}

export function hitTestLineDrag(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const W    = uiOverlay.width, H = uiOverlay.height;
    const p    = inst.params;

    const cx = (p.lineDragX / 100) * W;
    const cy = (p.lineDragY / 100) * H;
    if (Math.hypot(mx - cx, my - cy) <= HIT_RADIUS) return 'center';

    const angleRad = p.lineDragAngle * Math.PI / 180;
    const perpAngleRad = angleRad + Math.PI / 2;
    const perpCos = Math.cos(perpAngleRad), perpSin = Math.sin(perpAngleRad);
    const rotHandleX = cx + perpCos * 22;
    const rotHandleY = cy + perpSin * 22;
    if (Math.hypot(mx - rotHandleX, my - rotHandleY) <= HIT_RADIUS) return 'lineRot';

    if (!p[state.enabledKey]) return null;

    const fcx = (0.5 + p.lineDragFadeX / 100) * W;
    const fcy = (0.5 - p.lineDragFadeY / 100) * H;
    const vHit = hitTestFadeVertices(p, mx, my, fcx, fcy, W, H);
    if (vHit) return vHit;
    const { edgeW, edgeH, rotHandle } = getFadeHandlePositions(p, fcx, fcy, W, H);
    if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
    if (edgeW && Math.hypot(mx - edgeW[0], my - edgeW[1]) <= HIT_RADIUS) return 'fadeEdgeW';
    if (edgeH && Math.hypot(mx - edgeH[0], my - edgeH[1]) <= HIT_RADIUS) return 'fadeEdgeH';
    if (isInsideFade(p, mx, my, fcx, fcy, W, H)) return 'fadeCenter';
    return null;
}

export function onDragLineDrag(e, inst, rect) {
    const mx  = e.clientX - rect.left;
    const my  = e.clientY - rect.top;
    const W   = uiOverlay.width, H = uiOverlay.height;
    const p   = inst.params;
    const cx  = (p.lineDragX / 100) * W;
    const cy  = (p.lineDragY / 100) * H;

    // Fade handles (fadeCenter/fadeEdge*/fadeRot/fadeV#) are dragged centrally in canvasPicker.
    if (state.handle === 'center') {
        const [gx, gy] = applyGrab(cx, cy, mx, my);
        setInstanceParam(state.instId, 'lineDragX', Math.round(Math.max(0, Math.min(100, (gx / W) * 100))));
        setInstanceParam(state.instId, 'lineDragY', Math.round(Math.max(0, Math.min(100, (gy / H) * 100))));
    } else if (state.handle === 'lineRot') {
        let deg = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;
        if (deg > 180)  deg -= 360;
        if (deg < -180) deg += 360;
        setInstanceParam(state.instId, 'lineDragAngle', Math.round(deg));
    }
}
