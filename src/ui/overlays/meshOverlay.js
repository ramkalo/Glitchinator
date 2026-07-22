import { canvas } from '../../renderer/glstate.js';
import { setInstanceParam, getStack } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, HIT_RADIUS, drawHandle, drawCornerHandle, drawRotHandle, strokeAntLine, isInsideFadeShape, pointInQuad } from '../overlayUtils.js';

function _verts(p, W, H) {
    return {
        tlx: (p.meshTLx ?? 10) / 100 * W, tly: (p.meshTLy ?? 10) / 100 * H,
        trx: (p.meshTRx ?? 90) / 100 * W, try_: (p.meshTRy ?? 10) / 100 * H,
        brx: (p.meshBRx ?? 90) / 100 * W, bry: (p.meshBRy ?? 90) / 100 * H,
        blx: (p.meshBLx ?? 10) / 100 * W, bly: (p.meshBLy ?? 90) / 100 * H,
    };
}

export function drawMeshOverlay(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);

    const { tlx, tly, trx, try_, brx, bry, blx, bly } = _verts(p, W, H);

    // Quad outline
    uiCtx.beginPath();
    uiCtx.moveTo(tlx, tly);
    uiCtx.lineTo(trx, try_);
    uiCtx.lineTo(brx, bry);
    uiCtx.lineTo(blx, bly);
    uiCtx.closePath();
    strokeAntLine();

    // Corner handles
    drawCornerHandle(tlx, tly);
    drawCornerHandle(trx, try_);
    drawCornerHandle(brx, bry);
    drawCornerHandle(blx, bly);

    // Edge midpoint handles
    drawHandle((tlx + trx) / 2, (tly + try_) / 2); // top
    drawHandle((trx + brx) / 2, (try_ + bry) / 2); // right
    drawHandle((brx + blx) / 2, (bry + bly) / 2);  // bottom
    drawHandle((blx + tlx) / 2, (bly + tly) / 2);  // left

    // Fade shape + handles when fade is enabled
    if (state.enabledKey && p[state.enabledKey]) {
        const shape  = p[state.shapeKey] ?? 'ellipse';
        const fAngle = (p[state.angleKey] ?? 0) * Math.PI / 180;
        const cosA   = Math.cos(fAngle), sinA = Math.sin(fAngle);
        const fcx    = (0.5 + (p.meshFadeX ?? -25) / 100) * W;
        const fcy    = (0.5 - (p.meshFadeY ?? -25) / 100) * H;
        const rotPt  = (lx, ly) => [fcx + lx * cosA - ly * sinA, fcy + lx * sinA + ly * cosA];

        uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
        uiCtx.lineWidth   = 1.5;
        uiCtx.setLineDash([5, 5]);

        let edgeW, edgeH, rotHandle, topEdge;
        if (shape === 'ellipse') {
            const a = (p[state.wKey] / 100) * W / 2;
            const b = (p[state.hKey] / 100) * H / 2;
            uiCtx.beginPath();
            uiCtx.ellipse(fcx, fcy, Math.max(1, a), Math.max(1, b), fAngle, 0, Math.PI * 2);
            uiCtx.stroke();
            edgeW     = rotPt(a, 0);
            edgeH     = rotPt(0, -b);
            topEdge   = edgeH;
            rotHandle = rotPt(0, -(b + 22));
        } else {
            const hw = (p[state.wKey] / 100) * W / 2;
            const hh = (p[state.hKey] / 100) * H / 2;
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
}

export function hitTestMesh(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;

    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const p = inst.params;

    // Fade handles take priority over mesh handles
    if (state.enabledKey && p[state.enabledKey]) {
        const fAngle  = (p[state.angleKey] ?? 0) * Math.PI / 180;
        const cosA    = Math.cos(fAngle), sinA = Math.sin(fAngle);
        const fcx     = (0.5 + (p.meshFadeX ?? -25) / 100) * W;
        const fcy     = (0.5 - (p.meshFadeY ?? -25) / 100) * H;
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
    }

    const { tlx, tly, trx, try_, brx, bry, blx, bly } = _verts(p, W, H);

    // Edge midpoints (checked before corners so edges are easier to grab)
    if (Math.hypot(mx - (tlx + trx) / 2, my - (tly + try_) / 2) <= HIT_RADIUS) return 'top';
    if (Math.hypot(mx - (trx + brx) / 2, my - (try_ + bry) / 2) <= HIT_RADIUS) return 'right';
    if (Math.hypot(mx - (brx + blx) / 2, my - (bry + bly) / 2) <= HIT_RADIUS) return 'bottom';
    if (Math.hypot(mx - (blx + tlx) / 2, my - (bly + tly) / 2) <= HIT_RADIUS) return 'left';

    // Corner handles
    if (Math.hypot(mx - tlx, my - tly) <= HIT_RADIUS) return 'tl';
    if (Math.hypot(mx - trx, my - try_) <= HIT_RADIUS) return 'tr';
    if (Math.hypot(mx - brx, my - bry) <= HIT_RADIUS) return 'br';
    if (Math.hypot(mx - blx, my - bly) <= HIT_RADIUS) return 'bl';

    // Interior — drag the whole quad
    if (pointInQuad(mx, my, tlx, tly, trx, try_, brx, bry, blx, bly)) return 'move';

    return null;
}

export function onDragMesh(e, inst, rect) {
    if (!state.dragAnchor) return;
    const W = uiOverlay.width, H = uiOverlay.height;
    const dx = ((e.clientX - rect.left) - state.dragAnchor.startX) / W * 100;
    const dy = ((e.clientY - rect.top)  - state.dragAnchor.startY) / H * 100;

    const a = state.dragAnchor;
    const h = state.handle;

    if (h === 'fadeCenter') {
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        setInstanceParam(inst.id, 'meshFadeX', Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100))));
        setInstanceParam(inst.id, 'meshFadeY', Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100))));
        return;
    }
    if (h === 'edgeW') {
        const mx  = e.clientX - rect.left;
        const fcx = (0.5 + (inst.params.meshFadeX ?? -25) / 100) * W;
        setInstanceParam(inst.id, state.wKey, Math.round(Math.max(1, Math.min(200, Math.abs(mx - fcx) / (W / 2) * 100))));
        return;
    }
    if (h === 'edgeH') {
        const my  = e.clientY - rect.top;
        const fcy = (0.5 - (inst.params.meshFadeY ?? -25) / 100) * H;
        setInstanceParam(inst.id, state.hKey, Math.round(Math.max(1, Math.min(200, Math.abs(my - fcy) / (H / 2) * 100))));
        return;
    }
    if (h === 'rot') {
        const mx  = e.clientX - rect.left, my = e.clientY - rect.top;
        const fcx = (0.5 + (inst.params.meshFadeX ?? -25) / 100) * W;
        const fcy = (0.5 - (inst.params.meshFadeY ?? -25) / 100) * H;
        let deg = Math.atan2(my - fcy, mx - fcx) * 180 / Math.PI + 90;
        if (deg > 180)  deg -= 360;
        if (deg < -180) deg += 360;
        setInstanceParam(inst.id, state.angleKey, Math.round(deg));
        return;
    }

    if (h === 'move') {
        setInstanceParam(inst.id, 'meshTLx', a.tlx0 + dx);
        setInstanceParam(inst.id, 'meshTLy', a.tly0 + dy);
        setInstanceParam(inst.id, 'meshTRx', a.trx0 + dx);
        setInstanceParam(inst.id, 'meshTRy', a.try0 + dy);
        setInstanceParam(inst.id, 'meshBRx', a.brx0 + dx);
        setInstanceParam(inst.id, 'meshBRy', a.bry0 + dy);
        setInstanceParam(inst.id, 'meshBLx', a.blx0 + dx);
        setInstanceParam(inst.id, 'meshBLy', a.bly0 + dy);
        return;
    }
    if (h === 'tl' || h === 'top' || h === 'left') {
        setInstanceParam(inst.id, 'meshTLx', a.tlx0 + dx);
        setInstanceParam(inst.id, 'meshTLy', a.tly0 + dy);
    }
    if (h === 'tr' || h === 'top' || h === 'right') {
        setInstanceParam(inst.id, 'meshTRx', a.trx0 + dx);
        setInstanceParam(inst.id, 'meshTRy', a.try0 + dy);
    }
    if (h === 'br' || h === 'bottom' || h === 'right') {
        setInstanceParam(inst.id, 'meshBRx', a.brx0 + dx);
        setInstanceParam(inst.id, 'meshBRy', a.bry0 + dy);
    }
    if (h === 'bl' || h === 'bottom' || h === 'left') {
        setInstanceParam(inst.id, 'meshBLx', a.blx0 + dx);
        setInstanceParam(inst.id, 'meshBLy', a.bly0 + dy);
    }
}
