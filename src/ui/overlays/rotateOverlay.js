import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawRotHandle, strokeAntLine, HIT_RADIUS } from '../overlayUtils.js';

// Handle geometry: center is the frame center, angle 0 = straight up, positive = clockwise.
function geom(p, W, H) {
    const cx = W / 2, cy = H / 2;
    const R  = 0.32 * Math.min(W, H);
    const th = (p.rotateAngle || 0) * Math.PI / 180;
    return { cx, cy, R, hx: cx + R * Math.sin(th), hy: cy - R * Math.cos(th) };
}

export function drawRotate(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);
    const g = geom(p, W, H);

    // faint reference ring
    uiCtx.beginPath();
    uiCtx.arc(g.cx, g.cy, g.R, 0, Math.PI * 2);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.18)';
    uiCtx.lineWidth = 1;
    uiCtx.stroke();

    // origin (0°) reference tick, straight up
    uiCtx.beginPath();
    uiCtx.moveTo(g.cx, g.cy - g.R);
    uiCtx.lineTo(g.cx, g.cy - g.R - 10);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
    uiCtx.lineWidth = 1.5;
    uiCtx.stroke();

    // angle-from-origin arc: from up sweeping to the current angle
    const th = (p.rotateAngle || 0) * Math.PI / 180;
    uiCtx.beginPath();
    uiCtx.arc(g.cx, g.cy, g.R * 0.55, -Math.PI / 2, -Math.PI / 2 + th, th < 0);
    strokeAntLine();

    // spoke from center to handle
    uiCtx.beginPath();
    uiCtx.moveTo(g.cx, g.cy);
    uiCtx.lineTo(g.hx, g.hy);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.5)';
    uiCtx.lineWidth = 1.5;
    uiCtx.stroke();

    drawRotHandle(g.hx, g.hy);

    // degree readout near center
    const label = `${Math.round(p.rotateAngle || 0)}°`;
    uiCtx.font = '600 13px system-ui, sans-serif';
    uiCtx.textAlign = 'center';
    uiCtx.textBaseline = 'middle';
    uiCtx.lineWidth = 3;
    uiCtx.strokeStyle = 'rgba(0,0,0,0.6)';
    uiCtx.strokeText(label, g.cx, g.cy);
    uiCtx.fillStyle = 'rgba(255,255,255,0.95)';
    uiCtx.fillText(label, g.cx, g.cy);
}

export function hitTestRotate(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const g = geom(inst.params, uiOverlay.width, uiOverlay.height);
    return Math.hypot(mx - g.hx, my - g.hy) <= HIT_RADIUS ? 'rot' : null;
}

export function onDragRotate(e, inst, rect) {
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const cx = uiOverlay.width / 2, cy = uiOverlay.height / 2;
    let deg = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;   // up = 0, clockwise +
    deg = ((deg + 180) % 360 + 360) % 360 - 180;                   // normalize to −180..180
    setInstanceParam(state.instId, 'rotateAngle', Math.round(deg));
}
