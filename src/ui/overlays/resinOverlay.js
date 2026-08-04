import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHandle, HIT_RADIUS } from '../overlayUtils.js';
import { drawFadeShape, getFadeHandlePositions, hitTestFadeVertices, isInsideFade } from './fadeOverlay.js';

// Which point handles are live for the current params.
function showBubble(p) { return !!p.resinBubEnabled; }
function showImage(p)  { return (p.resinTexture === 'image') || ((p.resinMode ?? 'glossy') === 'chrome'); }

function labelAt(cx, cy, text) {
    uiCtx.font = '10px sans-serif';
    uiCtx.fillStyle = 'rgba(255,255,255,0.9)';
    uiCtx.strokeStyle = 'rgba(0,0,0,0.6)';
    uiCtx.lineWidth = 2;
    uiCtx.strokeText(text, cx + 10, cy - 8);
    uiCtx.fillText(text, cx + 10, cy - 8);
}

const fadeCenterPx = (p, W, H) => [(0.5 + p.resinFadeX / 100) * W, (0.5 - p.resinFadeY / 100) * H];

export function drawResin(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);

    // Fade shape + handles (shared implementation; guarded internally on the enabled key).
    const [fcx, fcy] = fadeCenterPx(p, w, h);
    drawFadeShape(p, fcx, fcy, w, h);

    // Point handles: light, bubble center, image position.
    const lx = (p.resinLightX / 100) * w, ly = (p.resinLightY / 100) * h;
    drawHandle(lx, ly); labelAt(lx, ly, 'Light');

    if (showBubble(p)) {
        const bx = (p.resinBubCenterX / 100) * w, by = (p.resinBubCenterY / 100) * h;
        drawHandle(bx, by); labelAt(bx, by, 'Bubbles');
    }
    if (showImage(p)) {
        const ix = (p.resinImgX / 100) * w, iy = (p.resinImgY / 100) * h;
        drawHandle(ix, iy); labelAt(ix, iy, 'Image');
    }
}

export function hitTestResin(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;

    // Point handles take priority (drawn on top).
    if (Math.hypot(mx - (p.resinLightX / 100) * W, my - (p.resinLightY / 100) * H) <= HIT_RADIUS) return 'light';
    if (showBubble(p) && Math.hypot(mx - (p.resinBubCenterX / 100) * W, my - (p.resinBubCenterY / 100) * H) <= HIT_RADIUS) return 'bubble';
    if (showImage(p)  && Math.hypot(mx - (p.resinImgX / 100) * W,       my - (p.resinImgY / 100) * H)       <= HIT_RADIUS) return 'image';

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

export function onDragResin(e, inst, rect) {
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const clamp100 = (v) => Math.round(Math.max(0, Math.min(100, v)));

    // Fade handles are dragged centrally in canvasPicker; only the point handles remain here.
    if (state.handle === 'light') {
        setInstanceParam(state.instId, 'resinLightX', clamp100((mx / W) * 100));
        setInstanceParam(state.instId, 'resinLightY', clamp100((my / H) * 100));
    } else if (state.handle === 'bubble') {
        setInstanceParam(state.instId, 'resinBubCenterX', clamp100((mx / W) * 100));
        setInstanceParam(state.instId, 'resinBubCenterY', clamp100((my / H) * 100));
    } else if (state.handle === 'image') {
        setInstanceParam(state.instId, 'resinImgX', clamp100((mx / W) * 100));
        setInstanceParam(state.instId, 'resinImgY', clamp100((my / H) * 100));
    }
}
