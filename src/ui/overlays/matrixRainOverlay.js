import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHandle, drawRotHandle, drawCornerHandle, HIT_RADIUS, isInsideFadeShape, applyGrab } from '../overlayUtils.js';

export function drawMatrixRain(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);
    const cx = (0.5 + p.matrixRainX / 100) * w;
    const cy = (0.5 - p.matrixRainY / 100) * h;

    if (p[state.enabledKey]) {
        const shape  = p[state.shapeKey] ?? 'ellipse';
        const fAngle = (p[state.angleKey] ?? 0) * Math.PI / 180;
        const cosA   = Math.cos(fAngle), sinA = Math.sin(fAngle);
        const fcx    = (0.5 + p.matrixRainFadeX / 100) * w;
        const fcy    = (0.5 - p.matrixRainFadeY / 100) * h;
        const rotPt  = (lx, ly) => [fcx + lx * cosA - ly * sinA, fcy + lx * sinA + ly * cosA];

        uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
        uiCtx.lineWidth   = 1.5;
        uiCtx.setLineDash([5, 5]);

        let edgeW, edgeH, rotHandle, topEdge;
        if (shape === 'ellipse') {
            const a = (p[state.wKey] / 100) * w / 2;
            const b = (p[state.hKey] / 100) * h / 2;
            uiCtx.beginPath();
            uiCtx.ellipse(fcx, fcy, Math.max(1, a), Math.max(1, b), fAngle, 0, Math.PI * 2);
            uiCtx.stroke();
            edgeW     = rotPt(a, 0);
            edgeH     = rotPt(0, -b);
            topEdge   = edgeH;
            rotHandle = rotPt(0, -(b + 22));
        } else {
            const hw = (p[state.wKey] / 100) * w / 2;
            const hh = (p[state.hKey] / 100) * h / 2;
            uiCtx.save();
            uiCtx.translate(fcx, fcy);
            uiCtx.rotate(fAngle);
            uiCtx.beginPath();
            uiCtx.rect(-hw, -hh, hw * 2, hh * 2);
            uiCtx.stroke();
            uiCtx.restore();
            edgeW     = rotPt(hw, 0);
            edgeH     = rotPt(0, -hh);
            topEdge   = edgeH;
            rotHandle = rotPt(0, -(hh + 22));
        }

        uiCtx.setLineDash([]);
        uiCtx.beginPath();
        uiCtx.moveTo(topEdge[0], topEdge[1]);
        uiCtx.lineTo(rotHandle[0], rotHandle[1]);
        uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
        uiCtx.lineWidth   = 1;
        uiCtx.stroke();

        drawCornerHandle(edgeW[0], edgeW[1]);
        drawCornerHandle(edgeH[0], edgeH[1]);
        drawRotHandle(rotHandle[0], rotHandle[1]);
    }

    drawHandle(cx, cy);
}

export function hitTestMatrixRain(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const W    = uiOverlay.width, H = uiOverlay.height;
    const p    = inst.params;

    const cx = (0.5 + p.matrixRainX / 100) * W;
    const cy = (0.5 - p.matrixRainY / 100) * H;
    if (Math.hypot(mx - cx, my - cy) <= HIT_RADIUS) return 'center';

    if (!p[state.enabledKey]) return null;

    const fAngle  = (p[state.angleKey] ?? 0) * Math.PI / 180;
    const cosA    = Math.cos(fAngle), sinA = Math.sin(fAngle);
    const fcx     = (0.5 + p.matrixRainFadeX / 100) * W;
    const fcy     = (0.5 - p.matrixRainFadeY / 100) * H;
    const rotPt   = (lx, ly) => [fcx + lx * cosA - ly * sinA, fcy + lx * sinA + ly * cosA];
    const shape   = p[state.shapeKey] ?? 'ellipse';
    const fa = (p[state.wKey] / 100) * W / 2;
    const fb = (p[state.hKey] / 100) * H / 2;
    let edgeW, edgeH, rotHandle;
    if (shape === 'ellipse') {
        edgeW     = rotPt(fa, 0);
        edgeH     = rotPt(0, -fb);
        rotHandle = rotPt(0, -(fb + 22));
    } else {
        edgeW     = rotPt(fa, 0);
        edgeH     = rotPt(0, -fb);
        rotHandle = rotPt(0, -(fb + 22));
    }

    if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'rot';
    if (Math.hypot(mx - edgeW[0],     my - edgeW[1])     <= HIT_RADIUS) return 'edgeW';
    if (Math.hypot(mx - edgeH[0],     my - edgeH[1])     <= HIT_RADIUS) return 'edgeH';
    if (isInsideFadeShape(mx, my, fcx, fcy, fa, fb, fAngle, shape !== 'ellipse')) return 'fadeCenter';
    return null;
}

export function onDragMatrixRain(e, inst, rect) {
    const mx  = e.clientX - rect.left;
    const my  = e.clientY - rect.top;
    const W   = uiOverlay.width, H = uiOverlay.height;
    const p   = inst.params;
    const fcx = (0.5 + p.matrixRainFadeX / 100) * W;
    const fcy = (0.5 - p.matrixRainFadeY / 100) * H;

    if (state.handle === 'center') {
        const cx = (0.5 + p.matrixRainX / 100) * W, cy = (0.5 - p.matrixRainY / 100) * H;
        const [gx, gy] = applyGrab(cx, cy, mx, my);
        setInstanceParam(state.instId, 'matrixRainX', Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'matrixRainY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100))));
    } else if (state.handle === 'fadeCenter') {
        setInstanceParam(state.instId, 'matrixRainFadeX', Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'matrixRainFadeY', Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100))));
    } else if (state.handle === 'edgeW') {
        setInstanceParam(state.instId, state.wKey, Math.round(Math.max(1, Math.min(200, Math.abs(mx - fcx) / (W / 2) * 100))));
    } else if (state.handle === 'edgeH') {
        setInstanceParam(state.instId, state.hKey, Math.round(Math.max(1, Math.min(200, Math.abs(my - fcy) / (H / 2) * 100))));
    } else if (state.handle === 'rot') {
        let deg = Math.atan2(my - fcy, mx - fcx) * 180 / Math.PI + 90;
        if (deg > 180)  deg -= 360;
        if (deg < -180) deg += 360;
        setInstanceParam(state.instId, state.angleKey, Math.round(deg));
    }
}
