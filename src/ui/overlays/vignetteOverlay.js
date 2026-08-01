import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawEllipseOrRect, hitTestEllipseHandles, applyGrab } from '../overlayUtils.js';

export function drawVignette(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);
    const cx    = (0.5 + p.vignetteCenterX / 100) * w;
    const cy    = (0.5 - p.vignetteCenterY / 100) * h;
    const a     = Math.max(1, (p.vignetteMajor / 100) * 0.7071 * w);
    const b     = Math.max(1, (p.vignetteMinor / 100) * 0.7071 * h);
    const angle = p.vignetteAngle * Math.PI / 180;
    drawEllipseOrRect(cx, cy, a, b, angle, p.vignetteMode === 'rectangle');
}

export function hitTestVignette(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const p  = inst.params;
    const cx = (0.5 + p.vignetteCenterX / 100) * uiOverlay.width;
    const cy = (0.5 - p.vignetteCenterY / 100) * uiOverlay.height;
    const a  = Math.max(1, (p.vignetteMajor / 100) * 0.7071 * uiOverlay.width);
    const b  = Math.max(1, (p.vignetteMinor / 100) * 0.7071 * uiOverlay.height);
    return hitTestEllipseHandles(e, cx, cy, a, b, p.vignetteAngle * Math.PI / 180, p.vignetteMode === 'rectangle');
}

export function onDragVignette(e, inst, rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W  = uiOverlay.width, H = uiOverlay.height;
    const p  = inst.params;
    const cx = (0.5 + p.vignetteCenterX / 100) * W;
    const cy = (0.5 - p.vignetteCenterY / 100) * H;

    if (state.handle === 'center') {
        const [gx, gy] = applyGrab(cx, cy, mx, my);
        setInstanceParam(state.instId, 'vignetteCenterX', Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'vignetteCenterY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100))));
    } else if (state.handle === 'edgeW') {
        const ang  = p.vignetteAngle * Math.PI / 180;
        const proj = (mx - cx) * Math.cos(ang) + (my - cy) * Math.sin(ang);
        setInstanceParam(state.instId, 'vignetteMajor', Math.round(Math.max(1, Math.min(150, Math.abs(proj) / (0.7071 * W) * 100))));
    } else if (state.handle === 'edgeH') {
        const ang  = p.vignetteAngle * Math.PI / 180;
        const proj = -(mx - cx) * Math.sin(ang) + (my - cy) * Math.cos(ang);
        setInstanceParam(state.instId, 'vignetteMinor', Math.round(Math.max(1, Math.min(150, Math.abs(proj) / (0.7071 * H) * 100))));
    } else if (state.handle === 'rot') {
        let deg = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;
        deg = ((deg % 180) + 180) % 180;
        setInstanceParam(state.instId, 'vignetteAngle', Math.round(deg));
    }
}
