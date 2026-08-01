import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHandle, drawRotHandle, drawCornerHandle, HIT_RADIUS, isInsideFadeShape, applyGrab } from '../overlayUtils.js';

function getFadeHandlePositions(p, fcx, fcy, W, H) {
    const shape = p[state.shapeKey] ?? 'ellipse';
    const angle = (p[state.angleKey] ?? 0) * Math.PI / 180;
    const cosA  = Math.cos(angle), sinA = Math.sin(angle);
    const rotPt = (lx, ly) => [fcx + lx * cosA - ly * sinA, fcy + lx * sinA + ly * cosA];
    if (shape === 'ellipse') {
        const a = (p[state.wKey] / 100) * W / 2;
        const b = (p[state.hKey] / 100) * H / 2;
        return { edgeW: rotPt(a, 0), edgeH: rotPt(0, -b), topEdge: rotPt(0, -b), rotHandle: rotPt(0, -(b + 22)) };
    }
    const hw = (p[state.wKey] / 100) * W / 2;
    const hh = (p[state.hKey] / 100) * H / 2;
    return { edgeW: rotPt(hw, 0), edgeH: rotPt(0, -hh), topEdge: rotPt(0, -hh), rotHandle: rotPt(0, -(hh + 22)) };
}

export function drawDoubleExposure(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);

    const imgX = (0.5 + p.doubleExposureTexX / 100) * w;
    const imgY = (0.5 - p.doubleExposureTexY / 100) * h;

    if (p[state.enabledKey]) {
        const shape  = p[state.shapeKey] ?? 'ellipse';
        const fAngle = (p[state.angleKey] ?? 0) * Math.PI / 180;
        const cosA   = Math.cos(fAngle), sinA = Math.sin(fAngle);
        const fcx    = (0.5 + p[state.xKey] / 100) * w;
        const fcy    = (0.5 - p[state.yKey] / 100) * h;
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

    // Second image position handle — diamond shape drawn on top
    const S = 9;
    uiCtx.beginPath();
    uiCtx.moveTo(imgX,     imgY - S);
    uiCtx.lineTo(imgX + S, imgY);
    uiCtx.lineTo(imgX,     imgY + S);
    uiCtx.lineTo(imgX - S, imgY);
    uiCtx.closePath();
    uiCtx.fillStyle   = 'rgba(255,255,255,0.92)';
    uiCtx.strokeStyle = 'rgba(0,0,0,0.4)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.fill();
    uiCtx.stroke();
}

export function hitTestDoubleExposure(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;

    const imgX = (0.5 + p.doubleExposureTexX / 100) * W;
    const imgY = (0.5 - p.doubleExposureTexY / 100) * H;
    if (Math.hypot(mx - imgX, my - imgY) <= HIT_RADIUS) return 'imgPos';

    if (!p[state.enabledKey]) return null;

    const fcx = (0.5 + p[state.xKey] / 100) * W;
    const fcy = (0.5 - p[state.yKey] / 100) * H;

    const { edgeW, edgeH, rotHandle } = getFadeHandlePositions(p, fcx, fcy, W, H);
    if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'rot';
    if (Math.hypot(mx - edgeW[0],     my - edgeW[1])     <= HIT_RADIUS) return 'edgeW';
    if (Math.hypot(mx - edgeH[0],     my - edgeH[1])     <= HIT_RADIUS) return 'edgeH';

    const shape = p[state.shapeKey] ?? 'ellipse';
    const angle = (p[state.angleKey] ?? 0) * Math.PI / 180;
    const fa    = (p[state.wKey] / 100) * W / 2;
    const fb    = (p[state.hKey] / 100) * H / 2;
    if (isInsideFadeShape(mx, my, fcx, fcy, fa, fb, angle, shape !== 'ellipse')) return 'center';
    return null;
}

export function onDragDoubleExposure(e, inst, rect) {
    const mx  = e.clientX - rect.left;
    const my  = e.clientY - rect.top;
    const W   = uiOverlay.width, H = uiOverlay.height;
    const p   = inst.params;
    const fcx = (0.5 + p[state.xKey] / 100) * W;
    const fcy = (0.5 - p[state.yKey] / 100) * H;

    if (state.handle === 'imgPos') {
        setInstanceParam(state.instId, 'doubleExposureTexX', Math.round(Math.max(-100, Math.min(100,  (mx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'doubleExposureTexY', Math.round(Math.max(-100, Math.min(100, -(my / H - 0.5) * 100))));
    } else if (state.handle === 'center') {
        const [gx, gy] = applyGrab(fcx, fcy, mx, my);
        setInstanceParam(state.instId, state.xKey, Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100))));
        setInstanceParam(state.instId, state.yKey, Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100))));
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
