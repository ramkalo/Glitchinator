import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawRotHandle, strokeAntLine, HIT_RADIUS } from '../overlayUtils.js';

// Geometry shared by draw + hit-test. Center is always the frame center.
function geom(p, W, H) {
    const cx = W / 2, cy = H / 2;
    const R  = 0.32 * Math.min(W, H);
    const mode = p.transformMode || 'rotate';
    if (mode === 'rotate') {
        // angle 0 = straight up; positive = clockwise on screen (y-down canvas).
        const th = (p.rotateAngle || 0) * Math.PI / 180;
        return { cx, cy, R, mode, hx: cx + R * Math.sin(th), hy: cy - R * Math.cos(th) };
    }
    if (mode === 'tiltX') {
        // handle offset vertically from center, up = positive
        const off = (p.tiltXAmount || 0) / 60 * R;
        return { cx, cy, R, mode, hx: cx, hy: cy - off };
    }
    // tiltY: handle offset horizontally, right = positive
    const off = (p.tiltYAmount || 0) / 60 * R;
    return { cx, cy, R, mode, hx: cx + off, hy: cy };
}

export function drawTransform(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);
    const g = geom(p, W, H);

    if (g.mode === 'rotate') {
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

        // angle-from-origin arc: from up (−90° in canvas space) sweeping to current angle
        const th = (p.rotateAngle || 0) * Math.PI / 180;
        const start = -Math.PI / 2;                 // up
        const end   = -Math.PI / 2 + th;            // +th = clockwise (canvas y-down)
        uiCtx.beginPath();
        uiCtx.arc(g.cx, g.cy, g.R * 0.55, start, end, th < 0);
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
        return;
    }

    // tilt modes — an axis line through center + a handle offset along it
    const horiz = g.mode === 'tiltX';   // tiltX handle moves vertically → axis is horizontal
    uiCtx.beginPath();
    if (horiz) { uiCtx.moveTo(g.cx - g.R, g.cy); uiCtx.lineTo(g.cx + g.R, g.cy); }
    else       { uiCtx.moveTo(g.cx, g.cy - g.R); uiCtx.lineTo(g.cx, g.cy + g.R); }
    uiCtx.strokeStyle = 'rgba(255,255,255,0.18)';
    uiCtx.lineWidth = 1;
    uiCtx.stroke();

    // drag axis (from center to handle)
    uiCtx.beginPath();
    uiCtx.moveTo(g.cx, g.cy);
    uiCtx.lineTo(g.hx, g.hy);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.5)';
    uiCtx.lineWidth = 1.5;
    uiCtx.stroke();

    drawRotHandle(g.hx, g.hy);

    const amt = g.mode === 'tiltX' ? (p.tiltXAmount || 0) : (p.tiltYAmount || 0);
    const label = `${Math.round(amt)}°`;
    uiCtx.font = '600 13px system-ui, sans-serif';
    uiCtx.textAlign = 'center';
    uiCtx.textBaseline = 'middle';
    uiCtx.lineWidth = 3;
    uiCtx.strokeStyle = 'rgba(0,0,0,0.6)';
    uiCtx.strokeText(label, g.cx, g.cy - 16);
    uiCtx.fillStyle = 'rgba(255,255,255,0.95)';
    uiCtx.fillText(label, g.cx, g.cy - 16);
}

export function hitTestTransform(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const g = geom(inst.params, uiOverlay.width, uiOverlay.height);
    if (Math.hypot(mx - g.hx, my - g.hy) <= HIT_RADIUS) {
        return g.mode === 'rotate' ? 'rot' : g.mode;   // 'rot' | 'tiltX' | 'tiltY'
    }
    return null;
}

export function onDragTransform(e, inst, rect) {
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const cx = W / 2, cy = H / 2;
    const R  = 0.32 * Math.min(W, H);

    if (state.handle === 'rot') {
        let deg = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;   // up = 0, clockwise +
        deg = ((deg + 180) % 360 + 360) % 360 - 180;                   // normalize to −180..180
        setInstanceParam(state.instId, 'rotateAngle', Math.round(deg));
    } else if (state.handle === 'tiltX') {
        const amt = -(my - cy) / R * 60;                              // up = positive
        setInstanceParam(state.instId, 'tiltXAmount', Math.round(Math.max(-60, Math.min(60, amt))));
    } else if (state.handle === 'tiltY') {
        const amt = (mx - cx) / R * 60;                               // right = positive
        setInstanceParam(state.instId, 'tiltYAmount', Math.round(Math.max(-60, Math.min(60, amt))));
    }
}
