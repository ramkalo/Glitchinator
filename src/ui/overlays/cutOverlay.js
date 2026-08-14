import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawRotHandle, drawCornerHandle, strokeAntLine, HIT_RADIUS } from '../overlayUtils.js';
import { shapeGeometry, traceShapePath } from '../../effects/cutShape.js';
import { pasteCorners } from '../../effects/pasteTransform.js';
import { getCutCapture } from '../../effects/cutCapture.js';
import { drawFadeFromState, hitTestFadeHandles, hitTestFadeRegion } from './fadeOverlay.js';

// The Cut Out feature is two connected layers:
//   • Cut layer  → SELECT mode: position / size / rotate the selection shape.
//   • Paste layer → PASTE mode: move / scale / rotate each pasted copy.
// Each layer drives its own overlay (mode 'cut' vs 'paste' in canvasPicker).

// ════════════════════════════════════════════════════════════════════════════════
// SELECT mode — shape placement + rotation (Cut layer)
// ════════════════════════════════════════════════════════════════════════════════
function cutCenter(p) {
    const W = uiOverlay.width, H = uiOverlay.height;
    return { cx: (0.5 + p.cutX / 100) * W, cy: (0.5 - p.cutY / 100) * H, W, H };
}

// Rotate a center-relative offset (px, y-down) about the shape center — matches cutShape.js.
function rotator(p, cx, cy) {
    const rot = (p.cutRot || 0) * Math.PI / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    return (lx, ly) => [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
}

// Inverse-rotate a screen point into the shape's local (y-down) frame.
function toLocal(p, cx, cy, mx, my) {
    const rot = (p.cutRot || 0) * Math.PI / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const dx = mx - cx, dy = my - cy;
    return [dx * cos + dy * sin, -dx * sin + dy * cos];
}

// Resize/vertex handle screen positions + rotation-handle geometry for the current shape.
function selectHandles(p) {
    const { cx, cy, W, H } = cutCenter(p);
    const rot = rotator(p, cx, cy);
    let resize = [];   // [name, x, y]
    let topDist;
    if (p.cutShape === 'rectangle') {
        const hw = (p.cutW / 200) * W, hh = (p.cutH / 200) * H;
        resize = [['tl', ...rot(-hw, -hh)], ['tr', ...rot(hw, -hh)], ['br', ...rot(hw, hh)], ['bl', ...rot(-hw, hh)]];
        topDist = hh;
    } else if (p.cutShape === 'ellipse') {
        const rx = (p.cutW / 200) * W, ry = (p.cutH / 200) * H;
        resize = [['edgeR', ...rot(rx, 0)], ['edgeB', ...rot(0, ry)]];
        topDist = ry;
    } else {
        const n = p.cutShape === 'triangle' ? 3 : Math.max(3, Math.min(12, Math.round(p.cutSides)));
        topDist = 0;
        for (let i = 0; i < n; i++) {
            const ox =  ((p[`cutV${i}x`] ?? 0) / 100) * W;
            const oy = -((p[`cutV${i}y`] ?? 0) / 100) * H;
            resize.push([`v${i}`, ...rot(ox, oy)]);
            topDist = Math.max(topDist, -oy);   // y-down: up is negative
        }
    }
    return { cx, cy, resize, topEdge: rot(0, -topDist), rotHandle: rot(0, -(topDist + 22)) };
}

export function drawCut(p) {
    syncSize();
    uiCtx.clearRect(0, 0, uiOverlay.width, uiOverlay.height);
    _drawSelect(p);
}

function _drawSelect(p) {
    const W = uiOverlay.width, H = uiOverlay.height;
    const g = shapeGeometry(p, W, H);

    // Darken outside the shape.
    uiCtx.save();
    uiCtx.fillStyle = 'rgba(0,0,0,0.45)';
    uiCtx.fillRect(0, 0, W, H);
    uiCtx.globalCompositeOperation = 'destination-out';
    traceShapePath(uiCtx, g);
    uiCtx.fill();
    uiCtx.restore();

    // Outline.
    uiCtx.strokeStyle = 'rgba(255,255,255,0.85)';
    uiCtx.lineWidth = 1.5;
    uiCtx.setLineDash([]);
    traceShapePath(uiCtx, g);
    uiCtx.stroke();

    // Handles + rotation handle.
    const hs = selectHandles(p);
    for (const [, hx, hy] of hs.resize) drawCornerHandle(hx, hy);
    uiCtx.beginPath();
    uiCtx.moveTo(hs.topEdge[0], hs.topEdge[1]);
    uiCtx.lineTo(hs.rotHandle[0], hs.rotHandle[1]);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.lineWidth = 1;
    uiCtx.stroke();
    drawRotHandle(hs.rotHandle[0], hs.rotHandle[1]);
}

function _pointInPoly(mx, my, verts) {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
        const [xi, yi] = verts[i], [xj, yj] = verts[j];
        if (((yi > my) !== (yj > my)) && (mx < (xj - xi) * (my - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}

function _insideShape(p, g, mx, my) {
    if (g.kind === 'ellipse') {
        const [lx, ly] = toLocal(p, g.cx, g.cy, mx, my);
        return g.rx > 0 && g.ry > 0 && (lx / g.rx) ** 2 + (ly / g.ry) ** 2 <= 1;
    }
    return _pointInPoly(mx, my, g.kind === 'rect' ? g.corners : g.verts);
}

export function hitTestCut(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const p = inst.params;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const hs = selectHandles(p);
    // Rotation handle wins, then resize/vertex handles, then the body (move).
    if (Math.hypot(mx - hs.rotHandle[0], my - hs.rotHandle[1]) <= HIT_RADIUS) return 'rot';
    for (const [name, hx, hy] of hs.resize) {
        if (Math.hypot(mx - hx, my - hy) <= HIT_RADIUS) return name;
    }
    const g = shapeGeometry(p, uiOverlay.width, uiOverlay.height);
    if (_insideShape(p, g, mx, my)) return 'center';
    return null;
}

export function onDragCut(e, inst, rect) {
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;
    const cx = (0.5 + p.cutX / 100) * W, cy = (0.5 - p.cutY / 100) * H;
    const h = state.handle;

    if (h === 'center') {
        const a = state.dragAnchor || { grabDX: 0, grabDY: 0 };
        const tx = mx + a.grabDX, ty = my + a.grabDY;
        setInstanceParam(state.instId, 'cutX', Math.round(Math.max(-50, Math.min(50,  (tx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'cutY', Math.round(Math.max(-50, Math.min(50, -(ty / H - 0.5) * 100))));
    } else if (h === 'rot') {
        let deg = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;
        if (deg > 180) deg -= 360; if (deg < -180) deg += 360;
        setInstanceParam(state.instId, 'cutRot', Math.round(deg));
    } else if (h === 'tl' || h === 'tr' || h === 'br' || h === 'bl') {
        const [lx, ly] = toLocal(p, cx, cy, mx, my);   // resize in the rotated local frame
        setInstanceParam(state.instId, 'cutW', Math.round(Math.max(1, Math.min(100, Math.abs(lx) * 2 / W * 100))));
        setInstanceParam(state.instId, 'cutH', Math.round(Math.max(1, Math.min(100, Math.abs(ly) * 2 / H * 100))));
    } else if (h === 'edgeR') {
        const [lx] = toLocal(p, cx, cy, mx, my);
        setInstanceParam(state.instId, 'cutW', Math.round(Math.max(1, Math.min(100, Math.abs(lx) * 2 / W * 100))));
    } else if (h === 'edgeB') {
        const [, ly] = toLocal(p, cx, cy, mx, my);
        setInstanceParam(state.instId, 'cutH', Math.round(Math.max(1, Math.min(100, Math.abs(ly) * 2 / H * 100))));
    } else if (h && h.startsWith('v')) {
        const idx = parseInt(h.slice(1), 10);
        const [lx, ly] = toLocal(p, cx, cy, mx, my);    // store the pre-rotation local offset
        setInstanceParam(state.instId, `cutV${idx}x`, Math.max(-50, Math.min(50, Math.round( lx / W * 100))));
        setInstanceParam(state.instId, `cutV${idx}y`, Math.max(-50, Math.min(50, Math.round(-ly / H * 100))));
    }
}

export function resetCutVertices(instId, shape, sides) {
    state.cutResetting = true;
    let n, startAngle;
    if (shape === 'triangle') { n = 3; startAngle = Math.PI / 2; }
    else { n = Math.max(3, Math.min(12, sides)); startAngle = 0; }
    const R = 25;
    for (let i = 0; i < 12; i++) {
        const angle = startAngle + i * (2 * Math.PI / n);
        const x = i < n ? Math.round(R * Math.cos(angle) * 100) / 100 : 0;
        const y = i < n ? Math.round(R * Math.sin(angle) * 100) / 100 : 0;
        setInstanceParam(instId, `cutV${i}x`, x);
        setInstanceParam(instId, `cutV${i}y`, y);
    }
    state.cutResetting = false;
    const inst = getStack().find(i => i.id === instId);
    if (inst) drawCut(inst.params);
}

// ════════════════════════════════════════════════════════════════════════════════
// PASTE mode — manipulate each pasted copy (Paste layer)
// ════════════════════════════════════════════════════════════════════════════════
function readPastes(p) {
    try { return JSON.parse(p.cutPastes || '[]'); } catch { return []; }
}

// The Cut layer that feeds this Paste layer (for the ghost outline + live region size).
function cutLayerFor(p) {
    return p.pasteCutId ? getStack().find(i => i.id === p.pasteCutId) : null;
}

// Live region size (canvas px): the actual captured dimensions when available (so the handle box
// matches the drawn copy exactly, incl. edge clamping), else the linked Cut layer's shape bbox.
function regionSize(p) {
    const cap = getCutCapture(p.pasteCutId);
    if (cap) return { natW: cap.natW, natH: cap.natH };
    const cutInst = cutLayerFor(p);
    if (!cutInst) return { natW: 0, natH: 0 };
    const g = shapeGeometry(cutInst.params, canvas.width, canvas.height);
    return { natW: g.bbox[2] - g.bbox[0], natH: g.bbox[3] - g.bbox[1] };
}

const BASE_CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];   // TL TR BR BL

export function drawPaste(p) {
    syncSize();
    uiCtx.clearRect(0, 0, uiOverlay.width, uiOverlay.height);
    _drawGhost(p);
    const pastes = readPastes(p);
    const active = state.cutActive;
    const skew = !!p.pasteAllowSkew;
    pastes.forEach((t, i) => {
        const g = pasteGeom(p, t);
        uiCtx.beginPath();
        uiCtx.moveTo(g.tl[0], g.tl[1]); uiCtx.lineTo(g.tr[0], g.tr[1]);
        uiCtx.lineTo(g.br[0], g.br[1]); uiCtx.lineTo(g.bl[0], g.bl[1]); uiCtx.closePath();
        if (i === active) {
            strokeAntLine();
            uiCtx.beginPath(); uiCtx.moveTo(g.top[0], g.top[1]); uiCtx.lineTo(g.rh[0], g.rh[1]);
            uiCtx.strokeStyle = 'rgba(255,255,255,0.4)'; uiCtx.lineWidth = 1; uiCtx.stroke();
            drawRotHandle(g.rh[0], g.rh[1]);
            if (skew) {
                drawCornerHandle(g.tl[0], g.tl[1]); drawCornerHandle(g.tr[0], g.tr[1]);
                drawCornerHandle(g.br[0], g.br[1]); drawCornerHandle(g.bl[0], g.bl[1]);
            } else {
                drawCornerHandle(g.scaleHandle[0], g.scaleHandle[1]);   // single scale handle
            }
        } else {
            uiCtx.strokeStyle = 'rgba(255,255,255,0.45)'; uiCtx.lineWidth = 1; uiCtx.setLineDash([4, 4]);
            uiCtx.stroke(); uiCtx.setLineDash([]);
        }
    });
    drawFadeFromState(p, uiOverlay.width, uiOverlay.height);   // fade shape + handles, when enabled
}

// Screen-space (overlay px) geometry of one copy: the 4 corners + center + rotate/scale handles.
function pasteGeom(p, t) {
    const W = uiOverlay.width, H = uiOverlay.height;
    const sc = W / Math.max(1, canvas.width);
    const { natW, natH } = regionSize(p);
    const nw = natW * sc, nh = natH * sc;                 // region size (overlay px, 100%)
    const cx = (0.5 + (t.x ?? 0) / 100) * W;
    const cy = (0.5 - (t.y ?? 0) / 100) * H;
    const [tl, tr, br, bl] = pasteCorners(t, cx, cy, nw, nh, !!p.pasteAllowSkew);
    const topMid = [(tl[0] + tr[0]) / 2, (tl[1] + tr[1]) / 2];
    let dx = topMid[0] - cx, dy = topMid[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    const rh = [topMid[0] + dx / len * 22, topMid[1] + dy / len * 22];
    return { cx, cy, sc, nw, nh, tl, tr, br, bl, top: topMid, rh, scaleHandle: br };
}

// Dashed outline of where the shape was cut from — read from the linked Cut layer.
function _drawGhost(p) {
    const cutInst = cutLayerFor(p);
    if (!cutInst) return;
    const g = shapeGeometry(cutInst.params, uiOverlay.width, uiOverlay.height);
    uiCtx.save();
    uiCtx.lineWidth = 1.5;
    uiCtx.setLineDash([5, 4]);
    traceShapePath(uiCtx, g);
    uiCtx.strokeStyle = 'rgba(0,0,0,0.55)';   uiCtx.lineDashOffset = 4; uiCtx.stroke();
    traceShapePath(uiCtx, g);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.7)'; uiCtx.lineDashOffset = 0; uiCtx.stroke();
    uiCtx.restore();
}

export function hitTestPaste(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const p = inst.params;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const pastes = readPastes(p);
    const active = state.cutActive;
    const W = uiOverlay.width, H = uiOverlay.height;
    const skew = !!p.pasteAllowSkew;

    // Discrete fade handles win over everything.
    const fadeHandle = hitTestFadeHandles(p, mx, my, W, H);
    if (fadeHandle) return fadeHandle;

    // Active copy's handles take priority next.
    if (active >= 0 && active < pastes.length) {
        const g = pasteGeom(p, pastes[active]);
        const d = (pt) => Math.hypot(mx - pt[0], my - pt[1]);
        if (d(g.rh) <= HIT_RADIUS) return 'rot';
        if (skew) {
            if (d(g.tl) <= HIT_RADIUS) return 'c0';
            if (d(g.tr) <= HIT_RADIUS) return 'c1';
            if (d(g.br) <= HIT_RADIUS) return 'c2';
            if (d(g.bl) <= HIT_RADIUS) return 'c3';
        } else if (d(g.scaleHandle) <= HIT_RADIUS) {
            return 'scale';
        }
    }
    // Otherwise, topmost copy whose quad contains the point → select it.
    for (let i = pastes.length - 1; i >= 0; i--) {
        const g = pasteGeom(p, pastes[i]);
        if (_pointInPoly(mx, my, [g.tl, g.tr, g.br, g.bl])) return `body:${i}`;
    }
    // Fade region grab (moves the whole fade shape) loses to the copies.
    return hitTestFadeRegion(p, mx, my, W, H);
}

export function onDragPaste(e, inst, rect) {
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;
    const pastes = readPastes(p);
    const idx = state.cutActive;
    if (idx < 0 || idx >= pastes.length) return;
    const t = pastes[idx];
    const h = state.handle;

    if (h === 'center') {
        const a = state.dragAnchor || { grabDX: 0, grabDY: 0 };
        const tx = mx + a.grabDX, ty = my + a.grabDY;
        t.x = Math.round(Math.max(-50, Math.min(50,  (tx / W - 0.5) * 100)));
        t.y = Math.round(Math.max(-50, Math.min(50, -(ty / H - 0.5) * 100)));
    } else if (h === 'rot') {
        const g = pasteGeom(p, t);
        let deg = Math.atan2(my - g.cy, mx - g.cx) * 180 / Math.PI + 90;
        if (deg > 180) deg -= 360; if (deg < -180) deg += 360;
        t.rot = Math.round(deg);
    } else if (h === 'scale') {
        const g = pasteGeom(p, t);
        const half = 0.5 * Math.hypot(g.nw, g.nh);   // half-diagonal at 100%
        if (half > 0) {
            const dist = Math.hypot(mx - g.cx, my - g.cy);
            t.scale = Math.round(Math.max(1, Math.min(400, dist / half * 100)));
        }
    } else if (h && h[0] === 'c') {
        // Corner distort: write the corner's offset in the copy's local unit-square frame.
        const g = pasteGeom(p, t);
        const n = parseInt(h.slice(1), 10);
        const ang = (t.rot ?? 0) * Math.PI / 180;
        const cos = Math.cos(ang), sin = Math.sin(ang);
        const dx = mx - g.cx, dy = my - g.cy;
        const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;   // un-rotate
        const scale = (t.scale ?? 100) / 100;
        const sx = g.nw * scale, sy = g.nh * scale;
        if (sx > 0.001 && sy > 0.001) {
            if (!Array.isArray(t.skew)) t.skew = [[0, 0], [0, 0], [0, 0], [0, 0]];
            const base = BASE_CORNERS[n];
            t.skew[n] = [
                Math.max(-2, Math.min(2, Math.round((lx / sx - base[0]) * 1000) / 1000)),
                Math.max(-2, Math.min(2, Math.round((ly / sy - base[1]) * 1000) / 1000)),
            ];
        }
    }
    setInstanceParam(state.instId, 'cutPastes', JSON.stringify(pastes));
}
