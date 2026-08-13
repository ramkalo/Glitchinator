import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawCornerHandle, drawDiamond, HIT_RADIUS } from '../overlayUtils.js';
import { drawFadeShape, getFadeHandlePositions, hitTestFadeVertices, isInsideFade } from './fadeOverlay.js';

const fadeCenterPx = (p, W, H) => [(0.5 + p[state.xKey] / 100) * W, (0.5 - p[state.yKey] / 100) * H];

const BASE_ARM = 70; // px at scale=100

// Scale handle position: offset to the right of the image-position diamond,
// at a distance proportional to Image Scale.
function _scaleHandlePx(p, imgX, imgY) {
    const dist = Math.max(20, BASE_ARM * (p.doubleExposureScale ?? 100) / 100);
    return [imgX + dist, imgY];
}

export function drawDoubleExposure(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);

    const imgX = (0.5 + p.doubleExposureTexX / 100) * w;
    const imgY = (0.5 - p.doubleExposureTexY / 100) * h;

    // Fade shape + handles (shared implementation; guarded on the enabled key).
    const [fcx, fcy] = fadeCenterPx(p, w, h);
    drawFadeShape(p, fcx, fcy, w, h);

    // Scale handle — arm + corner handle offset from the image-position diamond
    const [scaleHx, scaleHy] = _scaleHandlePx(p, imgX, imgY);
    uiCtx.lineWidth   = 1;
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.setLineDash([4, 4]);
    uiCtx.beginPath();
    uiCtx.moveTo(imgX, imgY);
    uiCtx.lineTo(scaleHx, scaleHy);
    uiCtx.stroke();
    uiCtx.setLineDash([]);
    drawCornerHandle(scaleHx, scaleHy);

    // Second image position handle — diamond drawn on top
    drawDiamond(imgX, imgY);
}

export function hitTestDoubleExposure(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;

    const imgX = (0.5 + p.doubleExposureTexX / 100) * W;
    const imgY = (0.5 - p.doubleExposureTexY / 100) * H;
    const [scaleHx, scaleHy] = _scaleHandlePx(p, imgX, imgY);
    if (Math.hypot(mx - scaleHx, my - scaleHy) <= HIT_RADIUS) return 'imgScale';
    if (Math.hypot(mx - imgX, my - imgY) <= HIT_RADIUS) return 'imgPos';

    if (!p[state.enabledKey]) return null;

    const [fcx, fcy] = fadeCenterPx(p, W, H);
    const vHit = hitTestFadeVertices(p, mx, my, fcx, fcy, W, H);
    if (vHit) return vHit;
    const { edgeW, edgeH, rotHandle } = getFadeHandlePositions(p, fcx, fcy, W, H);
    if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
    if (edgeW && Math.hypot(mx - edgeW[0], my - edgeW[1]) <= HIT_RADIUS) return 'fadeEdgeW';
    if (edgeH && Math.hypot(mx - edgeH[0], my - edgeH[1]) <= HIT_RADIUS) return 'fadeEdgeH';
    if (isInsideFade(p, mx, my, fcx, fcy, W, H)) return 'fadeCenter';
    return null;
}

export function onDragDoubleExposure(e, inst, rect) {
    const mx  = e.clientX - rect.left;
    const my  = e.clientY - rect.top;
    const W   = uiOverlay.width, H = uiOverlay.height;

    // Fade handles (fadeCenter/fadeEdge*/fadeRot/fadeV#) are dragged centrally in canvasPicker.
    if (state.handle === 'imgPos') {
        setInstanceParam(state.instId, 'doubleExposureTexX', Math.round(Math.max(-100, Math.min(100,  (mx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'doubleExposureTexY', Math.round(Math.max(-100, Math.min(100, -(my / H - 0.5) * 100))));
    } else if (state.handle === 'imgScale') {
        const inst = getStack().find(i => i.id === state.instId);
        const p = inst ? inst.params : {};
        const imgX = (0.5 + p.doubleExposureTexX / 100) * W;
        const imgY = (0.5 - p.doubleExposureTexY / 100) * H;
        const dist = Math.hypot(mx - imgX, my - imgY);
        setInstanceParam(state.instId, 'doubleExposureScale', Math.max(10, Math.min(400, Math.round((dist / BASE_ARM) * 100))));
    }
}
