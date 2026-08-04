import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawEllipseOrRect, hitTestEllipseHandles } from '../overlayUtils.js';
import { drawFadeFromState, hitTestFadeHandles, hitTestFadeRegion } from './fadeOverlay.js';

export function drawCRTCurvature(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);
    drawFadeFromState(p, w, h);
    const cx    = (0.5 + p.barrelDistortionX / 100) * w;
    const cy    = (0.5 - p.barrelDistortionY / 100) * h;
    const a     = Math.max(1, (p.barrelDistortionMajor / 100) * 0.7071 * w);
    const b     = Math.max(1, (p.barrelDistortionMinor / 100) * 0.7071 * h);
    const angle = p.barrelDistortionAngle * Math.PI / 180;
    drawEllipseOrRect(cx, cy, a, b, angle, false); // CRT is always ellipse
}

export function hitTestCRTCurvature(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const p  = inst.params;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;

    const fh = hitTestFadeHandles(p, mx, my, W, H);
    if (fh) return fh;

    const cx = (0.5 + p.barrelDistortionX / 100) * W;
    const cy = (0.5 - p.barrelDistortionY / 100) * H;
    const a  = Math.max(1, (p.barrelDistortionMajor / 100) * 0.7071 * W);
    const b  = Math.max(1, (p.barrelDistortionMinor / 100) * 0.7071 * H);
    const crtHit = hitTestEllipseHandles(e, cx, cy, a, b, p.barrelDistortionAngle * Math.PI / 180);
    if (crtHit) return crtHit;
    return hitTestFadeRegion(p, mx, my, W, H);
}

export function onDragCRTCurvature(e, inst, rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W  = uiOverlay.width, H = uiOverlay.height;
    const p  = inst.params;
    const cx = (0.5 + p.barrelDistortionX / 100) * W;
    const cy = (0.5 - p.barrelDistortionY / 100) * H;

    if (state.handle === 'center') {
        // Move relative to the grab point so the region doesn't recenter on the cursor.
        const gx = mx + (state.dragAnchor?.grabDX ?? 0);
        const gy = my + (state.dragAnchor?.grabDY ?? 0);
        setInstanceParam(state.instId, 'barrelDistortionX', Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'barrelDistortionY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100))));
    } else if (state.handle === 'edgeW') {
        const ang  = p.barrelDistortionAngle * Math.PI / 180;
        const proj = (mx - cx) * Math.cos(ang) + (my - cy) * Math.sin(ang);
        setInstanceParam(state.instId, 'barrelDistortionMajor', Math.round(Math.max(1, Math.min(150, Math.abs(proj) / (0.7071 * W) * 100))));
    } else if (state.handle === 'edgeH') {
        const ang  = p.barrelDistortionAngle * Math.PI / 180;
        const proj = -(mx - cx) * Math.sin(ang) + (my - cy) * Math.cos(ang);
        setInstanceParam(state.instId, 'barrelDistortionMinor', Math.round(Math.max(1, Math.min(150, Math.abs(proj) / (0.7071 * H) * 100))));
    } else if (state.handle === 'rot') {
        let deg = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;
        deg = ((deg % 180) + 180) % 180;
        setInstanceParam(state.instId, 'barrelDistortionAngle', Math.round(deg));
    }
}
