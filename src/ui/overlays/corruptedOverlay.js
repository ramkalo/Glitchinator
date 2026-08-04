import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHandle, HIT_RADIUS } from '../overlayUtils.js';
import { drawFadeFromState, hitTestFadeHandles, hitTestFadeRegion } from './fadeOverlay.js';

export function drawCorrupted(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);
    drawFadeFromState(p, w, h);
    const cx = (0.5 + p.corruptedX / 100) * w;
    const cy = (0.5 - p.corruptedY / 100) * h;
    drawHandle(cx, cy);
}

export function hitTestCorrupted(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const p = inst.params;
    const W = uiOverlay.width, H = uiOverlay.height;

    const fh = hitTestFadeHandles(p, mx, my, W, H);
    if (fh) return fh;
    const cx = (0.5 + p.corruptedX / 100) * W;
    const cy = (0.5 - p.corruptedY / 100) * H;
    if (Math.hypot(mx - cx, my - cy) <= HIT_RADIUS) return 'center';
    return hitTestFadeRegion(p, mx, my, W, H);
}
