import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHandle, drawRotHandle, drawCornerHandle, HIT_RADIUS, isInsideFadeShape, applyGrab } from '../overlayUtils.js';

export function drawLineDrag(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);

    // Anchor uses 0-100 system (0=left/top)
    const cx = (p.lineDragX / 100) * w;
    const cy = (p.lineDragY / 100) * h;

    // Dashed control line spanning the canvas at current angle
    const angleRad = p.lineDragAngle * Math.PI / 180;
    const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
    const ext = Math.max(w, h) * 2;
    uiCtx.beginPath();
    uiCtx.moveTo(cx - cos * ext, cy - sin * ext);
    uiCtx.lineTo(cx + cos * ext, cy + sin * ext);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.setLineDash([5, 5]);
    uiCtx.stroke();
    uiCtx.setLineDash([]);

    // Rotation handle for line angle: perpendicular to the line, 22px away
    const perpAngleRad = angleRad + Math.PI / 2;
    const perpCos = Math.cos(perpAngleRad), perpSin = Math.sin(perpAngleRad);
    const rotHandleX = cx + perpCos * 22;
    const rotHandleY = cy + perpSin * 22;

    uiCtx.beginPath();
    uiCtx.moveTo(cx, cy);
    uiCtx.lineTo(rotHandleX, rotHandleY);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.lineWidth   = 1;
    uiCtx.stroke();

    drawRotHandle(rotHandleX, rotHandleY);

    // Fade shape + handles when fade is enabled
    if (p[state.enabledKey]) {
        const shape  = p[state.shapeKey] ?? 'ellipse';
        const fAngle = (p[state.angleKey] ?? 0) * Math.PI / 180;
        const cosA   = Math.cos(fAngle), sinA = Math.sin(fAngle);
        const fcx    = (0.5 + p.lineDragFadeX / 100) * w;
        const fcy    = (0.5 - p.lineDragFadeY / 100) * h;
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

export function hitTestLineDrag(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const W    = uiOverlay.width, H = uiOverlay.height;
    const p    = inst.params;

    const cx = (p.lineDragX / 100) * W;
    const cy = (p.lineDragY / 100) * H;
    if (Math.hypot(mx - cx, my - cy) <= HIT_RADIUS) return 'center';

    const angleRad = p.lineDragAngle * Math.PI / 180;
    const perpAngleRad = angleRad + Math.PI / 2;
    const perpCos = Math.cos(perpAngleRad), perpSin = Math.sin(perpAngleRad);
    const rotHandleX = cx + perpCos * 22;
    const rotHandleY = cy + perpSin * 22;
    if (Math.hypot(mx - rotHandleX, my - rotHandleY) <= HIT_RADIUS) return 'lineRot';

    if (!p[state.enabledKey]) return null;

    const fAngle  = (p[state.angleKey] ?? 0) * Math.PI / 180;
    const cosA    = Math.cos(fAngle), sinA = Math.sin(fAngle);
    const fcx     = (0.5 + p.lineDragFadeX / 100) * W;
    const fcy     = (0.5 - p.lineDragFadeY / 100) * H;
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

export function onDragLineDrag(e, inst, rect) {
    const mx  = e.clientX - rect.left;
    const my  = e.clientY - rect.top;
    const W   = uiOverlay.width, H = uiOverlay.height;
    const p   = inst.params;
    const cx  = (p.lineDragX / 100) * W;
    const cy  = (p.lineDragY / 100) * H;
    const fcx = (0.5 + p.lineDragFadeX / 100) * W;
    const fcy = (0.5 - p.lineDragFadeY / 100) * H;

    if (state.handle === 'center') {
        const [gx, gy] = applyGrab(cx, cy, mx, my);
        setInstanceParam(state.instId, 'lineDragX', Math.round(Math.max(0, Math.min(100, (gx / W) * 100))));
        setInstanceParam(state.instId, 'lineDragY', Math.round(Math.max(0, Math.min(100, (gy / H) * 100))));
    } else if (state.handle === 'fadeCenter') {
        setInstanceParam(state.instId, 'lineDragFadeX', Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'lineDragFadeY', Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100))));
    } else if (state.handle === 'lineRot') {
        let deg = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;
        if (deg > 180)  deg -= 360;
        if (deg < -180) deg += 360;
        setInstanceParam(state.instId, 'lineDragAngle', Math.round(deg));
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
