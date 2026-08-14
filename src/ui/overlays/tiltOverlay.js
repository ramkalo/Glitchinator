import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawRotHandle, HIT_RADIUS } from '../overlayUtils.js';
import { drawFadeFromState, hitTestFadeHandles, hitTestFadeRegion } from './fadeOverlay.js';

// Single free-drag handle: horizontal offset → tilt Y, vertical offset → tilt X.
function geom(p, W, H) {
    const cx = W / 2, cy = H / 2;
    const R  = 0.32 * Math.min(W, H);
    return {
        cx, cy, R,
        hx: cx + (p.tiltYAmount || 0) / 60 * R,
        hy: cy - (p.tiltXAmount || 0) / 60 * R,
    };
}

export function drawTilt(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);
    const g = geom(p, W, H);

    // crosshair axes (drag range)
    uiCtx.beginPath();
    uiCtx.moveTo(g.cx - g.R, g.cy); uiCtx.lineTo(g.cx + g.R, g.cy);
    uiCtx.moveTo(g.cx, g.cy - g.R); uiCtx.lineTo(g.cx, g.cy + g.R);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.18)';
    uiCtx.lineWidth = 1;
    uiCtx.stroke();

    // line from center to handle
    uiCtx.beginPath();
    uiCtx.moveTo(g.cx, g.cy);
    uiCtx.lineTo(g.hx, g.hy);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.5)';
    uiCtx.lineWidth = 1.5;
    uiCtx.stroke();

    drawRotHandle(g.hx, g.hy);

    const label = `X:${Math.round(p.tiltXAmount || 0)}  Y:${Math.round(p.tiltYAmount || 0)}`;
    uiCtx.font = '600 12px system-ui, sans-serif';
    uiCtx.textAlign = 'center';
    uiCtx.textBaseline = 'middle';
    uiCtx.lineWidth = 3;
    uiCtx.strokeStyle = 'rgba(0,0,0,0.6)';
    uiCtx.strokeText(label, g.cx, g.cy - 16);
    uiCtx.fillStyle = 'rgba(255,255,255,0.95)';
    uiCtx.fillText(label, g.cx, g.cy - 16);

    drawFadeFromState(p, W, H);   // fade shape + handles, when enabled
}

export function hitTestTilt(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    // Fade handles win over the tilt handle; the fade region grab loses to it.
    const fadeHandle = hitTestFadeHandles(inst.params, mx, my, W, H);
    if (fadeHandle) return fadeHandle;
    const g = geom(inst.params, W, H);
    if (Math.hypot(mx - g.hx, my - g.hy) <= HIT_RADIUS) return 'tilt';
    return hitTestFadeRegion(inst.params, mx, my, W, H);
}

export function onDragTilt(e, inst, rect) {
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const cx = W / 2, cy = H / 2;
    const R  = 0.32 * Math.min(W, H);
    const clamp = (v) => Math.round(Math.max(-60, Math.min(60, v)));
    setInstanceParam(state.instId, 'tiltYAmount', clamp((mx - cx) / R * 60));
    setInstanceParam(state.instId, 'tiltXAmount', clamp(-(my - cy) / R * 60));
}
