// QR Code overlay — on-canvas move / rotate / resize handles for the QR effect. Modeled on the
// Shape Sticker overlay but simpler: a single square guide with a center handle, a rotate knob, and
// four corner handles that all drive the uniform `qrSize`. The fade shape/handles are shared.

import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiOverlay, uiCtx, syncSize, drawHandle, drawRotHandle, drawCornerHandle, HIT_RADIUS, applyGrab } from '../overlayUtils.js';
import { drawFadeShape, getFadeHandlePositions, hitTestFadeVertices, isInsideFade } from './fadeOverlay.js';

function frame(p) {
    const W = uiOverlay.width, H = uiOverlay.height;
    const cx = (0.5 + p.qrX / 100) * W;
    const cy = (0.5 - p.qrY / 100) * H;
    const half = Math.max(1, (p.qrSize / 100) * W) / 2;
    const angle = (p.qrAngle ?? 0) * Math.PI / 180;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const local = (lx, ly) => [cx + lx * cosA - ly * sinA, cy + lx * sinA + ly * cosA];
    const rotDist = Math.min(half, Math.hypot(W, H) / 2) + 18;
    return { W, H, cx, cy, half, angle, local, rotDist };
}

export function drawQR(p) {
    syncSize();
    const { W, H, cx, cy, half, angle, local, rotDist } = frame(p);
    uiCtx.clearRect(0, 0, W, H);

    uiCtx.save();
    uiCtx.translate(cx, cy);
    uiCtx.rotate(angle);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.85)';
    uiCtx.lineWidth = 1.5;
    uiCtx.setLineDash([]);
    uiCtx.strokeRect(-half, -half, half * 2, half * 2);
    uiCtx.restore();

    for (const [lx, ly] of [[-half, -half], [half, -half], [half, half], [-half, half]]) {
        const [hx, hy] = local(lx, ly);
        drawCornerHandle(hx, hy);
    }
    const [rx, ry] = local(0, -rotDist);
    drawRotHandle(rx, ry);
    drawHandle(cx, cy);

    const ffcx = (0.5 + p.qrFadeX / 100) * W;
    const ffcy = (0.5 - p.qrFadeY / 100) * H;
    drawFadeShape(p, ffcx, ffcy, W, H);
}

export function hitTestQR(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const p = inst.params;
    const { W, H, cx, cy, local, rotDist } = frame(p);

    if (Math.hypot(mx - cx, my - cy) <= HIT_RADIUS) return 'center';

    const [rx, ry] = local(0, -rotDist);
    if (Math.hypot(mx - rx, my - ry) <= HIT_RADIUS) return 'rot';

    const half = Math.max(1, (p.qrSize / 100) * W) / 2;
    const corners = {
        tl: local(-half, -half), tr: local(half, -half),
        br: local(half, half),   bl: local(-half, half),
    };
    for (const [name, [hx, hy]] of Object.entries(corners)) {
        if (Math.hypot(mx - hx, my - hy) <= HIT_RADIUS) return name;
    }

    if (p[state.enabledKey]) {
        const fcx = (0.5 + p.qrFadeX / 100) * W;
        const fcy = (0.5 - p.qrFadeY / 100) * H;
        const vHit = hitTestFadeVertices(p, mx, my, fcx, fcy, W, H);
        if (vHit) return vHit;
        const { edgeW, edgeH, rotHandle } = getFadeHandlePositions(p, fcx, fcy, W, H);
        if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
        if (edgeW && Math.hypot(mx - edgeW[0], my - edgeW[1]) <= HIT_RADIUS) return 'fadeEdgeW';
        if (edgeH && Math.hypot(mx - edgeH[0], my - edgeH[1]) <= HIT_RADIUS) return 'fadeEdgeH';
        if (isInsideFade(p, mx, my, fcx, fcy, W, H)) return 'fadeCenter';
    }
    return null;
}

export function onDragQR(e, inst, rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;
    const cx = (0.5 + p.qrX / 100) * W;
    const cy = (0.5 - p.qrY / 100) * H;
    const angle = (p.qrAngle ?? 0) * Math.PI / 180;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);

    if (state.handle === 'center') {
        const [gx, gy] = applyGrab(cx, cy, mx, my);
        setInstanceParam(state.instId, 'qrX', Math.round(Math.max(-50, Math.min(50, (gx / W - 0.5) * 100)) * 100) / 100);
        setInstanceParam(state.instId, 'qrY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100)) * 100) / 100);
    } else if (state.handle === 'rot') {
        let deg = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;
        if (deg > 180)  deg -= 360;
        if (deg < -180) deg += 360;
        setInstanceParam(state.instId, 'qrAngle', Math.round(deg));
    } else if (state.handle === 'tl' || state.handle === 'tr' || state.handle === 'br' || state.handle === 'bl') {
        const lx =  (mx - cx) * cosA + (my - cy) * sinA;
        const ly = -(mx - cx) * sinA + (my - cy) * cosA;
        const sizePct = Math.max(Math.abs(lx), Math.abs(ly)) * 2 / W * 100;
        setInstanceParam(state.instId, 'qrSize', Math.round(Math.max(1, Math.min(300, sizePct))));
    }
    // fade handles (fade*) are dragged centrally in canvasPicker.
}
