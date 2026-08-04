import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHandle, HIT_RADIUS, applyGrab } from '../overlayUtils.js';
import { drawFadeShape, getFadeHandlePositions, hitTestFadeVertices, isInsideFade } from './fadeOverlay.js';

export function drawMatrixRain(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);
    const cx = (0.5 + p.matrixRainX / 100) * w;
    const cy = (0.5 - p.matrixRainY / 100) * h;

    // Fade shape + handles when fade is enabled (shared implementation).
    const fcx = (0.5 + p.matrixRainFadeX / 100) * w;
    const fcy = (0.5 - p.matrixRainFadeY / 100) * h;
    drawFadeShape(p, fcx, fcy, w, h);

    drawHandle(cx, cy);
}

export function hitTestMatrixRain(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const W    = uiOverlay.width, H = uiOverlay.height;
    const p    = inst.params;

    const cx = (0.5 + p.matrixRainX / 100) * W;
    const cy = (0.5 - p.matrixRainY / 100) * H;
    if (Math.hypot(mx - cx, my - cy) <= HIT_RADIUS) return 'center';

    if (!p[state.enabledKey]) return null;

    const fcx = (0.5 + p.matrixRainFadeX / 100) * W;
    const fcy = (0.5 - p.matrixRainFadeY / 100) * H;
    const vHit = hitTestFadeVertices(p, mx, my, fcx, fcy, W, H);
    if (vHit) return vHit;
    const { edgeW, edgeH, rotHandle } = getFadeHandlePositions(p, fcx, fcy, W, H);
    if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
    if (edgeW && Math.hypot(mx - edgeW[0], my - edgeW[1]) <= HIT_RADIUS) return 'fadeEdgeW';
    if (edgeH && Math.hypot(mx - edgeH[0], my - edgeH[1]) <= HIT_RADIUS) return 'fadeEdgeH';
    if (isInsideFade(p, mx, my, fcx, fcy, W, H)) return 'fadeCenter';
    return null;
}

export function onDragMatrixRain(e, inst, rect) {
    const mx  = e.clientX - rect.left;
    const my  = e.clientY - rect.top;
    const W   = uiOverlay.width, H = uiOverlay.height;
    const p   = inst.params;

    // Fade handles (fadeCenter/fadeEdge*/fadeRot/fadeV#) are dragged centrally in canvasPicker.
    if (state.handle === 'center') {
        const cx = (0.5 + p.matrixRainX / 100) * W, cy = (0.5 - p.matrixRainY / 100) * H;
        const [gx, gy] = applyGrab(cx, cy, mx, my);
        setInstanceParam(state.instId, 'matrixRainX', Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'matrixRainY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100))));
    }
}
