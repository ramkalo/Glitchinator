import { canvas } from '../../renderer/glstate.js';
import { setInstanceParam, getStack } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, HIT_RADIUS, drawHandle, drawCornerHandle, strokeAntLine, pointInQuad } from '../overlayUtils.js';
import { drawFadeShape, getFadeHandlePositions, hitTestFadeVertices, isInsideFade } from './fadeOverlay.js';

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

    // Fade shape + handles when fade is enabled (shared implementation).
    const fcx = (0.5 + (p.meshFadeX ?? -25) / 100) * W;
    const fcy = (0.5 - (p.meshFadeY ?? -25) / 100) * H;
    drawFadeShape(p, fcx, fcy, W, H);
}

export function hitTestMesh(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;

    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const p = inst.params;

    // Fade handles take priority over mesh handles (shared implementation).
    if (state.enabledKey && p[state.enabledKey]) {
        const fcx = (0.5 + (p.meshFadeX ?? -25) / 100) * W;
        const fcy = (0.5 - (p.meshFadeY ?? -25) / 100) * H;
        const vHit = hitTestFadeVertices(p, mx, my, fcx, fcy, W, H);
        if (vHit) return vHit;
        const { edgeW, edgeH, rotHandle } = getFadeHandlePositions(p, fcx, fcy, W, H);
        if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
        if (edgeW && Math.hypot(mx - edgeW[0], my - edgeW[1]) <= HIT_RADIUS) return 'fadeEdgeW';
        if (edgeH && Math.hypot(mx - edgeH[0], my - edgeH[1]) <= HIT_RADIUS) return 'fadeEdgeH';
        if (isInsideFade(p, mx, my, fcx, fcy, W, H)) return 'fadeCenter';
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

    // Fade handles (fadeCenter/fadeEdge*/fadeRot/fadeV#) are dragged centrally in canvasPicker.

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
