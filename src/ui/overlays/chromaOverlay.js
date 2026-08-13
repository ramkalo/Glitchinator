import { canvas } from '../../renderer/glstate.js';
import { getStack } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, clear, drawHubHandle, HUB_R } from '../overlayUtils.js';
import { drawFadeFromState, hitTestFadeHandles, hitTestFadeRegion } from './fadeOverlay.js';

export function drawChroma(p) {
    syncSize();
    clear();
    drawFadeFromState(p, uiOverlay.width, uiOverlay.height);
    if (p.chromaMode !== 'outline') return;
    const cx = (0.5 + p.chromaOutlineX / 100) * uiOverlay.width;
    const cy = (0.5 - p.chromaOutlineY / 100) * uiOverlay.height;
    drawHubHandle(cx, cy);
}

export function hitTestChroma(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;

    const fh = hitTestFadeHandles(p, mx, my, W, H);
    if (fh) return fh;

    if (p.chromaMode === 'outline') {
        const cx = (0.5 + p.chromaOutlineX / 100) * W;
        const cy = (0.5 - p.chromaOutlineY / 100) * H;
        if (Math.hypot(mx - cx, my - cy) <= HUB_R) return 'center';
    }
    return hitTestFadeRegion(p, mx, my, W, H);
}
