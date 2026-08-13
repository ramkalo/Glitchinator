import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHandle, drawRotHandle, drawCornerHandle, strokeAntLine, HIT_RADIUS, pointInQuad } from '../overlayUtils.js';
import { drawFadeShape, getFadeHandlePositions, hitTestFadeVertices, isInsideFade } from './fadeOverlay.js';
import { lockedCornerDrag, lockedEdgeDrag } from './textBoxGeometry.js';
import { SNAP_FRACS, snapPoint, snapTranslate, snapEdge } from './snapGuides.js';

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

// Rule-of-thirds + center guide lines, drawn only while a snap-enabled box is
// being dragged. The active guide(s) — those the box is currently snapping to —
// are redrawn brighter on top of the faint full grid.
function drawSnapGuides(W, H, active) {
    uiCtx.save();
    uiCtx.strokeStyle = 'rgba(255,255,255,0.18)';
    uiCtx.lineWidth   = 1;
    uiCtx.beginPath();
    for (const f of SNAP_FRACS) { const x = f * W; uiCtx.moveTo(x, 0); uiCtx.lineTo(x, H); }
    for (const f of SNAP_FRACS) { const y = f * H; uiCtx.moveTo(0, y); uiCtx.lineTo(W, y); }
    uiCtx.stroke();
    if (active && (active.v != null || active.h != null)) {
        uiCtx.strokeStyle = 'rgba(0,229,255,0.95)';
        uiCtx.lineWidth   = 1.5;
        uiCtx.beginPath();
        if (active.v != null) { const x = active.v * W; uiCtx.moveTo(x, 0); uiCtx.lineTo(x, H); }
        if (active.h != null) { const y = active.h * H; uiCtx.moveTo(0, y); uiCtx.lineTo(W, y); }
        uiCtx.stroke();
    }
    uiCtx.restore();
}

export function drawTextOverlay(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);

    // Guides show only while dragging a box handle (not the fade sub-shape) with snap on.
    if (p.textBoxSnap && state.mode === 'text' && state.dragging
        && !String(state.handle || '').startsWith('fade')) {
        drawSnapGuides(W, H, state.snapGuides);
    }

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

    // Fade shape + handles (shared implementation; guarded on the enabled key).
    const fcx = (0.5 + p.textFadeX / 100) * W;
    const fcy = (0.5 - p.textFadeY / 100) * H;
    drawFadeShape(p, fcx, fcy, W, H);
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
        const fcx = (0.5 + p.textFadeX / 100) * W;
        const fcy = (0.5 - p.textFadeY / 100) * H;
        const vHit = hitTestFadeVertices(p, mx, my, fcx, fcy, W, H);
        if (vHit) return vHit;
        const { edgeW, edgeH, rotHandle } = getFadeHandlePositions(p, fcx, fcy, W, H);
        if (d(rotHandle[0], rotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
        if (edgeW && d(edgeW[0], edgeW[1]) <= HIT_RADIUS) return 'fadeEdgeW';
        if (edgeH && d(edgeH[0], edgeH[1]) <= HIT_RADIUS) return 'fadeEdgeH';
        if (isInsideFade(p, mx, my, fcx, fcy, W, H)) return 'fadeCenter';
    }

    // Anywhere inside the box moves it — checked last so the corner, edge and
    // fade handles sitting on top of the box still win.
    if (pointInQuad(mx, my, tlx, tly, trx, try_, brx, bry, blx, bly)) return 'center';
    return null;
}

const CORNER_HANDLES = new Set(['tl', 'tr', 'br', 'bl']);
const EDGE_HANDLES   = new Set(['topEdge', 'rightEdge', 'bottomEdge', 'leftEdge']);

// Screen-px midpoint of the edge being dragged, taken from the drag-start anchor
// corners (%). Used to snap an edge to a guide on its perpendicular axis.
function _edgeMid(a, handle, W, H) {
    const P = { tl: [a.tlx0, a.tly0], tr: [a.trx0, a.try0], br: [a.brx0, a.bry0], bl: [a.blx0, a.bly0] };
    const [p1, p2] = handle === 'topEdge'    ? ['tl', 'tr']
                   : handle === 'bottomEdge' ? ['bl', 'br']
                   : handle === 'leftEdge'   ? ['tl', 'bl']
                   :                           ['tr', 'br']; // rightEdge
    return [(P[p1][0] + P[p2][0]) / 2 / 100 * W, (P[p1][1] + P[p2][1]) / 2 / 100 * H];
}

export function onDragText(e, inst, rect) {
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W  = uiOverlay.width, H = uiOverlay.height;
    const toP = (v, range) => v / range * 100;
    const snapOn = !!inst.params.textBoxSnap;
    state.snapGuides = null; // recomputed below when a handle snaps this frame

    // Angles locked: corner and edge drags only change side lengths.
    if (inst.params.textBoxLockAngles && state.dragAnchor
        && (CORNER_HANDLES.has(state.handle) || EDGE_HANDLES.has(state.handle))) {
        let update;
        if (CORNER_HANDLES.has(state.handle)) {
            let cx = mx, cy = my;
            if (snapOn) {
                const s = snapPoint(mx, my, W, H);
                cx = s.x; cy = s.y;
                state.snapGuides = { v: s.vFrac, h: s.hFrac };
            }
            update = lockedCornerDrag(state.dragAnchor, state.handle, cx, cy, W, H);
        } else {
            let dx = mx - state.dragAnchor.startX, dy = my - state.dragAnchor.startY;
            if (snapOn) {
                const [emx, emy] = _edgeMid(state.dragAnchor, state.handle, W, H);
                if (state.handle === 'topEdge' || state.handle === 'bottomEdge') {
                    const s = snapEdge(emy, dy, H); dy = s.delta;
                    state.snapGuides = { v: null, h: s.frac };
                } else {
                    const s = snapEdge(emx, dx, W); dx = s.delta;
                    state.snapGuides = { v: s.frac, h: null };
                }
            }
            update = lockedEdgeDrag(state.dragAnchor, state.handle, dx, dy, W, H);
        }
        if (update) {
            for (const [k, v] of Object.entries(update)) setInstanceParam(state.instId, k, v);
        }
        return;
    }

    if (state.handle === 'center' && state.dragAnchor) {
        const a = state.dragAnchor;
        let rdx = mx - a.startX, rdy = my - a.startY;
        if (snapOn) {
            const corners = [
                [a.tlx0 / 100 * W + rdx, a.tly0 / 100 * H + rdy],
                [a.trx0 / 100 * W + rdx, a.try0 / 100 * H + rdy],
                [a.brx0 / 100 * W + rdx, a.bry0 / 100 * H + rdy],
                [a.blx0 / 100 * W + rdx, a.bly0 / 100 * H + rdy],
            ];
            const s = snapTranslate(corners, W, H);
            rdx += s.offsetX; rdy += s.offsetY;
            state.snapGuides = { v: s.vFrac, h: s.hFrac };
        }
        const dx = toP(rdx, W), dy = toP(rdy, H);
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
    } else if (CORNER_HANDLES.has(state.handle)) {
        let px = mx, py = my;
        if (snapOn) {
            const s = snapPoint(mx, my, W, H);
            px = s.x; py = s.y;
            state.snapGuides = { v: s.vFrac, h: s.hFrac };
        }
        const KEYS = { tl: ['textTLx', 'textTLy'], tr: ['textTRx', 'textTRy'],
                       br: ['textBRx', 'textBRy'], bl: ['textBLx', 'textBLy'] };
        const [xk, yk] = KEYS[state.handle];
        setInstanceParam(state.instId, xk, toP(px, W));
        setInstanceParam(state.instId, yk, toP(py, H));
    } else if (EDGE_HANDLES.has(state.handle) && state.dragAnchor) {
        const a = state.dragAnchor;
        let rdx = mx - a.startX, rdy = my - a.startY;
        if (snapOn) {
            const [emx, emy] = _edgeMid(a, state.handle, W, H);
            if (state.handle === 'topEdge' || state.handle === 'bottomEdge') {
                const s = snapEdge(emy, rdy, H); rdy = s.delta;
                state.snapGuides = { v: null, h: s.frac };
            } else {
                const s = snapEdge(emx, rdx, W); rdx = s.delta;
                state.snapGuides = { v: s.frac, h: null };
            }
        }
        const dx = toP(rdx, W), dy = toP(rdy, H);
        // Each edge moves only its two corners.
        const MOVED = {
            topEdge:    [['textTLx', 'tlx0'], ['textTLy', 'tly0'], ['textTRx', 'trx0'], ['textTRy', 'try0']],
            rightEdge:  [['textTRx', 'trx0'], ['textTRy', 'try0'], ['textBRx', 'brx0'], ['textBRy', 'bry0']],
            bottomEdge: [['textBRx', 'brx0'], ['textBRy', 'bry0'], ['textBLx', 'blx0'], ['textBLy', 'bly0']],
            leftEdge:   [['textTLx', 'tlx0'], ['textTLy', 'tly0'], ['textBLx', 'blx0'], ['textBLy', 'bly0']],
        };
        for (const [pk, ak] of MOVED[state.handle]) {
            setInstanceParam(state.instId, pk, a[ak] + (pk.endsWith('x') ? dx : dy));
        }
    }
    // Fade handles (fadeCenter/fadeEdge*/fadeRot/fadeV#) are dragged centrally in canvasPicker.
}
