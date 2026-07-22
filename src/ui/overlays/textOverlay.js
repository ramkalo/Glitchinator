import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHandle, drawRotHandle, drawCornerHandle, strokeAntLine, HIT_RADIUS, isInsideFadeShape, pointInQuad } from '../overlayUtils.js';
import { lockedCornerDrag, lockedEdgeDrag } from './textBoxGeometry.js';

export function textCorners(p, W, H) {
    const tlx  = (p.textTLx ?? 10) / 100 * W,  tly  = (p.textTLy ?? 65) / 100 * H;
    const trx  = (p.textTRx ?? 90) / 100 * W,  try_ = (p.textTRy ?? 65) / 100 * H;
    const brx  = (p.textBRx ?? 90) / 100 * W,  bry  = (p.textBRy ?? 95) / 100 * H;
    const blx  = (p.textBLx ?? 10) / 100 * W,  bly  = (p.textBLy ?? 95) / 100 * H;
    const cx = (tlx + trx + brx + blx) / 4;
    const cy = (tly + try_ + bry + bly) / 4;
    const topMidX = (tlx + trx) / 2, topMidY = (tly + try_) / 2;
    const edgeX = trx - tlx, edgeY = try_ - tly;
    const edgeLen = Math.hypot(edgeX, edgeY) || 1;
    let rpx = -edgeY / edgeLen, rpy = edgeX / edgeLen;
    const botMidX = (blx + brx) / 2, botMidY = (bly + bry) / 2;
    if (rpx * (botMidX - topMidX) + rpy * (botMidY - topMidY) > 0) { rpx = -rpx; rpy = -rpy; }
    const rhx = topMidX + 22 * rpx, rhy = topMidY + 22 * rpy;
    const rightMidX  = (trx + brx) / 2, rightMidY  = (try_ + bry) / 2;
    const bottomMidX = (brx + blx) / 2, bottomMidY = (bry + bly) / 2;
    const leftMidX   = (blx + tlx) / 2, leftMidY   = (bly + tly) / 2;
    return { tlx, tly, trx, try_, brx, bry, blx, bly, cx, cy,
             topMidX, topMidY, rhx, rhy,
             rightMidX, rightMidY, bottomMidX, bottomMidY, leftMidX, leftMidY };
}

export function drawTextOverlay(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);

    const { tlx, tly, trx, try_, brx, bry, blx, bly,
            topMidX, topMidY, rhx, rhy,
            rightMidX, rightMidY, bottomMidX, bottomMidY, leftMidX, leftMidY } = textCorners(p, W, H);

    uiCtx.beginPath();
    uiCtx.moveTo(tlx, tly);
    uiCtx.lineTo(trx, try_);
    uiCtx.lineTo(brx, bry);
    uiCtx.lineTo(blx, bly);
    uiCtx.closePath();
    strokeAntLine();

    uiCtx.beginPath();
    uiCtx.moveTo(topMidX, topMidY);
    uiCtx.lineTo(rhx, rhy);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.lineWidth   = 1;
    uiCtx.stroke();
    drawRotHandle(rhx, rhy);

    drawCornerHandle(tlx, tly);
    drawCornerHandle(trx, try_);
    drawCornerHandle(brx, bry);
    drawCornerHandle(blx, bly);

    drawHandle(topMidX,    topMidY);
    drawHandle(rightMidX,  rightMidY);
    drawHandle(bottomMidX, bottomMidY);
    drawHandle(leftMidX,   leftMidY);

    if (p[state.enabledKey]) {
        const shape  = p[state.shapeKey] ?? 'ellipse';
        const fAngle = (p[state.angleKey] ?? 0) * Math.PI / 180;
        const cosA   = Math.cos(fAngle), sinA = Math.sin(fAngle);
        const fcx    = (0.5 + p.textFadeX / 100) * W;
        const fcy    = (0.5 - p.textFadeY / 100) * H;
        const rotPt  = (lx, ly) => [fcx + lx * cosA - ly * sinA, fcy + lx * sinA + ly * cosA];

        let fadeEdgeW, fadeEdgeH, fadeRotHandle, topEdge;
        if (shape === 'ellipse') {
            const a = (p[state.wKey] / 100) * W / 2;
            const b = (p[state.hKey] / 100) * H / 2;
            uiCtx.beginPath();
            uiCtx.ellipse(fcx, fcy, Math.max(1, a), Math.max(1, b), fAngle, 0, Math.PI * 2);
            strokeAntLine();
            fadeEdgeW     = rotPt(a, 0);
            fadeEdgeH     = rotPt(0, -b);
            topEdge       = fadeEdgeH;
            fadeRotHandle = rotPt(0, -(b + 22));
        } else {
            const hw = (p[state.wKey] / 100) * W / 2;
            const hh = (p[state.hKey] / 100) * H / 2;
            uiCtx.save();
            uiCtx.translate(fcx, fcy);
            uiCtx.rotate(fAngle);
            uiCtx.beginPath();
            uiCtx.rect(-hw, -hh, hw * 2, hh * 2);
            strokeAntLine();
            uiCtx.restore();
            fadeEdgeW     = rotPt(hw, 0);
            fadeEdgeH     = rotPt(0, -hh);
            topEdge       = fadeEdgeH;
            fadeRotHandle = rotPt(0, -(hh + 22));
        }
        uiCtx.beginPath();
        uiCtx.moveTo(topEdge[0], topEdge[1]);
        uiCtx.lineTo(fadeRotHandle[0], fadeRotHandle[1]);
        uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
        uiCtx.lineWidth   = 1;
        uiCtx.stroke();

        drawCornerHandle(fadeEdgeW[0], fadeEdgeW[1]);
        drawCornerHandle(fadeEdgeH[0], fadeEdgeH[1]);
        drawRotHandle(fadeRotHandle[0], fadeRotHandle[1]);
    }
}

export function hitTestText(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;
    const { tlx, tly, trx, try_, brx, bry, blx, bly, rhx, rhy,
            topMidX, topMidY, rightMidX, rightMidY, bottomMidX, bottomMidY, leftMidX, leftMidY } = textCorners(p, W, H);
    const d = (ax, ay) => Math.hypot(mx - ax, my - ay);

    if (d(rhx, rhy)  <= HIT_RADIUS) return 'rot';
    if (d(tlx, tly)  <= HIT_RADIUS) return 'tl';
    if (d(trx, try_) <= HIT_RADIUS) return 'tr';
    if (d(brx, bry)  <= HIT_RADIUS) return 'br';
    if (d(blx, bly)  <= HIT_RADIUS) return 'bl';
    if (d(topMidX,    topMidY)    <= HIT_RADIUS) return 'topEdge';
    if (d(rightMidX,  rightMidY)  <= HIT_RADIUS) return 'rightEdge';
    if (d(bottomMidX, bottomMidY) <= HIT_RADIUS) return 'bottomEdge';
    if (d(leftMidX,   leftMidY)   <= HIT_RADIUS) return 'leftEdge';

    if (p[state.enabledKey]) {
        const fAngle  = (p[state.angleKey] ?? 0) * Math.PI / 180;
        const cosA    = Math.cos(fAngle), sinA = Math.sin(fAngle);
        const fcx     = (0.5 + p.textFadeX / 100) * W;
        const fcy     = (0.5 - p.textFadeY / 100) * H;
        const rotPt   = (lx, ly) => [fcx + lx * cosA - ly * sinA, fcy + lx * sinA + ly * cosA];
        const shape   = p[state.shapeKey] ?? 'ellipse';
        const fa = (p[state.wKey] / 100) * W / 2;
        const fb = (p[state.hKey] / 100) * H / 2;
        let fadeEdgeW, fadeEdgeH, fadeRotHandle;
        if (shape === 'ellipse') {
            fadeEdgeW     = rotPt(fa, 0);
            fadeEdgeH     = rotPt(0, -fb);
            fadeRotHandle = rotPt(0, -(fb + 22));
        } else {
            fadeEdgeW     = rotPt(fa, 0);
            fadeEdgeH     = rotPt(0, -fb);
            fadeRotHandle = rotPt(0, -(fb + 22));
        }
        if (d(fadeRotHandle[0], fadeRotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
        if (d(fadeEdgeW[0],     fadeEdgeW[1])     <= HIT_RADIUS) return 'fadeEdgeW';
        if (d(fadeEdgeH[0],     fadeEdgeH[1])     <= HIT_RADIUS) return 'fadeEdgeH';
        if (isInsideFadeShape(mx, my, fcx, fcy, fa, fb, fAngle, shape !== 'ellipse')) return 'fadeCenter';
    }

    // Anywhere inside the box moves it — checked last so the corner, edge and
    // fade handles sitting on top of the box still win.
    if (pointInQuad(mx, my, tlx, tly, trx, try_, brx, bry, blx, bly)) return 'center';
    return null;
}

const CORNER_HANDLES = new Set(['tl', 'tr', 'br', 'bl']);
const EDGE_HANDLES   = new Set(['topEdge', 'rightEdge', 'bottomEdge', 'leftEdge']);

export function onDragText(e, inst, rect) {
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W  = uiOverlay.width, H = uiOverlay.height;
    const toP = (v, range) => v / range * 100;

    // Angles locked: corner and edge drags only change side lengths.
    if (inst.params.textBoxLockAngles && state.dragAnchor
        && (CORNER_HANDLES.has(state.handle) || EDGE_HANDLES.has(state.handle))) {
        const update = CORNER_HANDLES.has(state.handle)
            ? lockedCornerDrag(state.dragAnchor, state.handle, mx, my, W, H)
            : lockedEdgeDrag(state.dragAnchor, state.handle,
                             mx - state.dragAnchor.startX, my - state.dragAnchor.startY, W, H);
        if (update) {
            for (const [k, v] of Object.entries(update)) setInstanceParam(state.instId, k, v);
        }
        return;
    }

    if (state.handle === 'center' && state.dragAnchor) {
        const dx = toP(mx - state.dragAnchor.startX, W);
        const dy = toP(my - state.dragAnchor.startY, H);
        setInstanceParam(state.instId, 'textTLx', state.dragAnchor.tlx0 + dx);
        setInstanceParam(state.instId, 'textTLy', state.dragAnchor.tly0 + dy);
        setInstanceParam(state.instId, 'textTRx', state.dragAnchor.trx0 + dx);
        setInstanceParam(state.instId, 'textTRy', state.dragAnchor.try0 + dy);
        setInstanceParam(state.instId, 'textBRx', state.dragAnchor.brx0 + dx);
        setInstanceParam(state.instId, 'textBRy', state.dragAnchor.bry0 + dy);
        setInstanceParam(state.instId, 'textBLx', state.dragAnchor.blx0 + dx);
        setInstanceParam(state.instId, 'textBLy', state.dragAnchor.bly0 + dy);
    } else if (state.handle === 'rot' && state.dragAnchor) {
        const { cxPx, cyPx, startAngle } = state.dragAnchor;
        const delta = Math.atan2(my - cyPx, mx - cxPx) - startAngle;
        const cos = Math.cos(delta), sin = Math.sin(delta);
        const rotPt = (xPct, yPct) => {
            const dx = xPct / 100 * W - cxPx, dy = yPct / 100 * H - cyPx;
            return [(cxPx + dx * cos - dy * sin) / W * 100,
                    (cyPx + dx * sin + dy * cos) / H * 100];
        };
        const [ntlx, ntly] = rotPt(state.dragAnchor.tlx0, state.dragAnchor.tly0);
        const [ntrx, ntry] = rotPt(state.dragAnchor.trx0, state.dragAnchor.try0);
        const [nbrx, nbry] = rotPt(state.dragAnchor.brx0, state.dragAnchor.bry0);
        const [nblx, nbly] = rotPt(state.dragAnchor.blx0, state.dragAnchor.bly0);
        setInstanceParam(state.instId, 'textTLx', ntlx); setInstanceParam(state.instId, 'textTLy', ntly);
        setInstanceParam(state.instId, 'textTRx', ntrx); setInstanceParam(state.instId, 'textTRy', ntry);
        setInstanceParam(state.instId, 'textBRx', nbrx); setInstanceParam(state.instId, 'textBRy', nbry);
        setInstanceParam(state.instId, 'textBLx', nblx); setInstanceParam(state.instId, 'textBLy', nbly);
    } else if (state.handle === 'tl') {
        setInstanceParam(state.instId, 'textTLx', toP(mx, W));
        setInstanceParam(state.instId, 'textTLy', toP(my, H));
    } else if (state.handle === 'tr') {
        setInstanceParam(state.instId, 'textTRx', toP(mx, W));
        setInstanceParam(state.instId, 'textTRy', toP(my, H));
    } else if (state.handle === 'br') {
        setInstanceParam(state.instId, 'textBRx', toP(mx, W));
        setInstanceParam(state.instId, 'textBRy', toP(my, H));
    } else if (state.handle === 'bl') {
        setInstanceParam(state.instId, 'textBLx', toP(mx, W));
        setInstanceParam(state.instId, 'textBLy', toP(my, H));
    } else if (state.handle === 'topEdge' && state.dragAnchor) {
        const dx = toP(mx - state.dragAnchor.startX, W);
        const dy = toP(my - state.dragAnchor.startY, H);
        setInstanceParam(state.instId, 'textTLx', state.dragAnchor.tlx0 + dx);
        setInstanceParam(state.instId, 'textTLy', state.dragAnchor.tly0 + dy);
        setInstanceParam(state.instId, 'textTRx', state.dragAnchor.trx0 + dx);
        setInstanceParam(state.instId, 'textTRy', state.dragAnchor.try0 + dy);
    } else if (state.handle === 'rightEdge' && state.dragAnchor) {
        const dx = toP(mx - state.dragAnchor.startX, W);
        const dy = toP(my - state.dragAnchor.startY, H);
        setInstanceParam(state.instId, 'textTRx', state.dragAnchor.trx0 + dx);
        setInstanceParam(state.instId, 'textTRy', state.dragAnchor.try0 + dy);
        setInstanceParam(state.instId, 'textBRx', state.dragAnchor.brx0 + dx);
        setInstanceParam(state.instId, 'textBRy', state.dragAnchor.bry0 + dy);
    } else if (state.handle === 'bottomEdge' && state.dragAnchor) {
        const dx = toP(mx - state.dragAnchor.startX, W);
        const dy = toP(my - state.dragAnchor.startY, H);
        setInstanceParam(state.instId, 'textBRx', state.dragAnchor.brx0 + dx);
        setInstanceParam(state.instId, 'textBRy', state.dragAnchor.bry0 + dy);
        setInstanceParam(state.instId, 'textBLx', state.dragAnchor.blx0 + dx);
        setInstanceParam(state.instId, 'textBLy', state.dragAnchor.bly0 + dy);
    } else if (state.handle === 'leftEdge' && state.dragAnchor) {
        const dx = toP(mx - state.dragAnchor.startX, W);
        const dy = toP(my - state.dragAnchor.startY, H);
        setInstanceParam(state.instId, 'textTLx', state.dragAnchor.tlx0 + dx);
        setInstanceParam(state.instId, 'textTLy', state.dragAnchor.tly0 + dy);
        setInstanceParam(state.instId, 'textBLx', state.dragAnchor.blx0 + dx);
        setInstanceParam(state.instId, 'textBLy', state.dragAnchor.bly0 + dy);
    } else if (state.handle === 'fadeCenter') {
        setInstanceParam(state.instId, 'textFadeX', Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'textFadeY', Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100))));
    } else if (state.handle === 'fadeEdgeW') {
        const fcx = (0.5 + inst.params.textFadeX / 100) * W;
        setInstanceParam(state.instId, state.wKey, Math.round(Math.max(1, Math.min(200, Math.abs(mx - fcx) / (W / 2) * 100))));
    } else if (state.handle === 'fadeEdgeH') {
        const fcy = (0.5 - inst.params.textFadeY / 100) * H;
        setInstanceParam(state.instId, state.hKey, Math.round(Math.max(1, Math.min(200, Math.abs(my - fcy) / (H / 2) * 100))));
    } else if (state.handle === 'fadeRot') {
        const fcx = (0.5 + inst.params.textFadeX / 100) * W;
        const fcy = (0.5 - inst.params.textFadeY / 100) * H;
        let deg = Math.atan2(my - fcy, mx - fcx) * 180 / Math.PI + 90;
        if (deg > 180)  deg -= 360;
        if (deg < -180) deg += 360;
        setInstanceParam(state.instId, state.angleKey, Math.round(deg));
    }
}
