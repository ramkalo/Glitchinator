import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHubHandle, HUB_R, drawCornerHandle, HIT_RADIUS } from '../overlayUtils.js';
import { drawFadeFromState, hitTestFadeHandles, hitTestFadeRegion } from './fadeOverlay.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function drawDigitalSmear(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);
    drawFadeFromState(p, w, h);

    const count = p.smearTwistNodeCount ?? 0;
    const cx = (p.smearTwistCenterX ?? 50) / 100 * w;
    const cy = (p.smearTwistCenterY ?? 50) / 100 * h;

    // Draw thin dashed lines from center to each node
    if (count > 0) {
        uiCtx.strokeStyle = 'rgba(255,255,255,0.25)';
        uiCtx.lineWidth   = 1;
        uiCtx.setLineDash([4, 4]);
        for (let i = 0; i < count; i++) {
            const nx = (p[`smearTwistNx${i}`] ?? 0) / 100 * w;
            const ny = (p[`smearTwistNy${i}`] ?? 0) / 100 * h;
            uiCtx.beginPath();
            uiCtx.moveTo(cx, cy);
            uiCtx.lineTo(nx, ny);
            uiCtx.stroke();
        }
        uiCtx.setLineDash([]);
    }

    // Draw node handles (small squares)
    for (let i = 0; i < count; i++) {
        const nx = (p[`smearTwistNx${i}`] ?? 0) / 100 * w;
        const ny = (p[`smearTwistNy${i}`] ?? 0) / 100 * h;
        drawCornerHandle(nx, ny);
    }

    // Draw center hub (dashed circle) on top — grab it to move the whole smear
    drawHubHandle(cx, cy);
}

export function hitTestDigitalSmear(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;

    const fh = hitTestFadeHandles(p, mx, my, W, H);
    if (fh) return fh;

    const cx = (p.smearTwistCenterX ?? 50) / 100 * W;
    const cy = (p.smearTwistCenterY ?? 50) / 100 * H;
    if (Math.hypot(mx - cx, my - cy) <= HUB_R) return 'center';

    const count = p.smearTwistNodeCount ?? 0;
    for (let i = 0; i < count; i++) {
        const nx = (p[`smearTwistNx${i}`] ?? 0) / 100 * W;
        const ny = (p[`smearTwistNy${i}`] ?? 0) / 100 * H;
        if (Math.hypot(mx - nx, my - ny) <= HIT_RADIUS) return `node:${i}`;
    }

    return hitTestFadeRegion(p, mx, my, W, H);
}

export function onDragDigitalSmear(e, inst, rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;

    if (state.handle === 'center') {
        const newCx = Math.round(clamp((mx / W) * 100, 0, 100));
        const newCy = Math.round(clamp((my / H) * 100, 0, 100));
        const dx = newCx - (p.smearTwistCenterX ?? 50);
        const dy = newCy - (p.smearTwistCenterY ?? 50);

        setInstanceParam(state.instId, 'smearTwistCenterX', newCx);
        setInstanceParam(state.instId, 'smearTwistCenterY', newCy);

        const count = p.smearTwistNodeCount ?? 0;
        for (let i = 0; i < count; i++) {
            setInstanceParam(state.instId, `smearTwistNx${i}`, clamp((p[`smearTwistNx${i}`] ?? 0) + dx, 0, 100));
            setInstanceParam(state.instId, `smearTwistNy${i}`, clamp((p[`smearTwistNy${i}`] ?? 0) + dy, 0, 100));
        }
    } else if (state.handle?.startsWith('node:')) {
        const idx = parseInt(state.handle.split(':')[1]);
        setInstanceParam(state.instId, `smearTwistNx${idx}`, Math.round(clamp((mx / W) * 100, 0, 100)));
        setInstanceParam(state.instId, `smearTwistNy${idx}`, Math.round(clamp((my / H) * 100, 0, 100)));
    }
}

// Removes node at idx, shifts subsequent nodes down to fill the gap.
export function deleteSmearNode(instId, idx, p) {
    const count = p.smearTwistNodeCount ?? 0;
    for (let i = idx; i < count - 1; i++) {
        setInstanceParam(instId, `smearTwistNx${i}`, p[`smearTwistNx${i + 1}`] ?? 0);
        setInstanceParam(instId, `smearTwistNy${i}`, p[`smearTwistNy${i + 1}`] ?? 0);
    }
    setInstanceParam(instId, 'smearTwistNodeCount', count - 1);
}
