import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawRotHandle, drawCornerHandle, strokeAntLine, HIT_RADIUS, isInsideFadeShape } from '../overlayUtils.js';
import { computeFadeVertices, regularFadeVertex, MAX_FADE_VERTS } from '../../effects/controls/fade.js';

// '<prefix>Fade' base derived from the active fade's width key (e.g. 'resinFadeW' → 'resinFade').
function fadeBase() { return state.wKey ? state.wKey.slice(0, -1) : null; }

// Screen positions (px) of the editable polygon vertices, in the fade's rotated frame.
export function fadeVertexScreenPositions(p, cx, cy, W, H) {
    const base = fadeBase();
    if (!base) return [];
    const angle = (p[state.angleKey] ?? 0) * Math.PI / 180;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    return computeFadeVertices(p, base).map((v) => {
        const lx = v.x / 100 * W, ly = v.y / 100 * H;   // local px, y-down
        return [cx + lx * cosA - ly * sinA, cy + lx * sinA + ly * cosA];
    });
}

function pointInScreenPoly(mx, my, verts) {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
        const [xi, yi] = verts[i], [xj, yj] = verts[j];
        if ((yi > my) !== (yj > my) && mx < (xj - xi) * (my - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

// True if the cursor is inside the fade region (used to grab/move its center), for any shape.
export function isInsideFade(p, mx, my, cx, cy, W, H) {
    const shape = p[state.shapeKey] ?? 'ellipse';
    if (shape === 'polygon') return pointInScreenPoly(mx, my, fadeVertexScreenPositions(p, cx, cy, W, H));
    const angle = (p[state.angleKey] ?? 0) * Math.PI / 180;
    const a = (p[state.wKey] / 100) * W / 2;
    const b = (p[state.hKey] / 100) * H / 2;
    return isInsideFadeShape(mx, my, cx, cy, a, b, angle, shape === 'rectangle');
}

// Draws the fade outline + handles for any shape. cx/cy are screen px. Returns the handle
// screen positions ({ edgeW, edgeH, rotHandle }; edges are null for polygon).
export function drawFadeShape(p, cx, cy, w, h) {
    if (!p[state.enabledKey]) return null;

    const shape = p[state.shapeKey] ?? 'ellipse';
    const angle = (p[state.angleKey] ?? 0) * Math.PI / 180;
    const cosA  = Math.cos(angle), sinA = Math.sin(angle);
    const rotPt = (lx, ly) => [cx + lx * cosA - ly * sinA, cy + lx * sinA + ly * cosA];

    let edgeW = null, edgeH = null, rotHandle, topEdge;

    if (shape === 'polygon') {
        const base   = fadeBase();
        const local  = computeFadeVertices(p, base).map((v) => [v.x / 100 * w, v.y / 100 * h]);
        const screen = local.map(([lx, ly]) => rotPt(lx, ly));
        uiCtx.beginPath();
        screen.forEach(([x, y], i) => (i === 0 ? uiCtx.moveTo(x, y) : uiCtx.lineTo(x, y)));
        uiCtx.closePath();
        strokeAntLine();
        let maxUp = (p[state.hKey] / 100) * h / 2;
        for (const [, ly] of local) maxUp = Math.max(maxUp, -ly);   // y-down: up is negative
        topEdge   = rotPt(0, -maxUp);
        rotHandle = rotPt(0, -(maxUp + 22));
        for (const [x, y] of screen) drawCornerHandle(x, y);
    } else if (shape === 'rectangle') {
        const hw = (p[state.wKey] / 100) * w / 2;
        const hh = (p[state.hKey] / 100) * h / 2;
        uiCtx.save();
        uiCtx.translate(cx, cy);
        uiCtx.rotate(angle);
        uiCtx.beginPath();
        uiCtx.rect(-hw, -hh, hw * 2, hh * 2);
        strokeAntLine();
        uiCtx.restore();
        edgeW     = rotPt(hw, 0);
        edgeH     = rotPt(0, -hh);
        topEdge   = edgeH;
        rotHandle = rotPt(0, -(hh + 22));
        drawCornerHandle(edgeW[0], edgeW[1]);
        drawCornerHandle(edgeH[0], edgeH[1]);
    } else {
        const a = (p[state.wKey] / 100) * w / 2;
        const b = (p[state.hKey] / 100) * h / 2;
        uiCtx.beginPath();
        uiCtx.ellipse(cx, cy, Math.max(1, a), Math.max(1, b), angle, 0, Math.PI * 2);
        strokeAntLine();
        edgeW     = rotPt(a, 0);
        edgeH     = rotPt(0, -b);
        topEdge   = edgeH;
        rotHandle = rotPt(0, -(b + 22));
        drawCornerHandle(edgeW[0], edgeW[1]);
        drawCornerHandle(edgeH[0], edgeH[1]);
    }

    uiCtx.beginPath();
    uiCtx.moveTo(topEdge[0], topEdge[1]);
    uiCtx.lineTo(rotHandle[0], rotHandle[1]);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.lineWidth   = 1;
    uiCtx.stroke();
    drawRotHandle(rotHandle[0], rotHandle[1]);

    return { edgeW, edgeH, rotHandle };
}

// Handle screen positions without drawing (edges null for polygon).
export function getFadeHandlePositions(p, cx, cy, W, H) {
    const shape = p[state.shapeKey] ?? 'ellipse';
    const angle = (p[state.angleKey] ?? 0) * Math.PI / 180;
    const cosA  = Math.cos(angle), sinA = Math.sin(angle);
    const rotPt = (lx, ly) => [cx + lx * cosA - ly * sinA, cy + lx * sinA + ly * cosA];
    if (shape === 'polygon') {
        const local = computeFadeVertices(p, fadeBase()).map((v) => [v.x / 100 * W, v.y / 100 * H]);
        let maxUp = (p[state.hKey] / 100) * H / 2;
        for (const [, ly] of local) maxUp = Math.max(maxUp, -ly);
        return { edgeW: null, edgeH: null, rotHandle: rotPt(0, -(maxUp + 22)) };
    }
    const a = (p[state.wKey] / 100) * W / 2;
    const b = (p[state.hKey] / 100) * H / 2;
    return { edgeW: rotPt(a, 0), edgeH: rotPt(0, -b), rotHandle: rotPt(0, -(b + 22)) };
}

// Returns 'fadeV{i}' if the cursor is on a polygon vertex handle, else null.
export function hitTestFadeVertices(p, mx, my, cx, cy, W, H) {
    if ((p[state.shapeKey] ?? 'ellipse') !== 'polygon') return null;
    const verts = fadeVertexScreenPositions(p, cx, cy, W, H);
    for (let i = 0; i < verts.length; i++) {
        if (Math.hypot(mx - verts[i][0], my - verts[i][1]) <= HIT_RADIUS) return `fadeV${i}`;
    }
    return null;
}

// Seed all vertex params to a regular N-gon sized by FadeW/FadeH. `base` is '<prefix>Fade'.
export function resetFadeVertices(instId, base, p) {
    const n     = Math.max(3, Math.min(MAX_FADE_VERTS, Math.round(p[`${base}Sides`] ?? 6)));
    const halfW = (p[`${base}W`] ?? 40) / 2;
    const halfH = (p[`${base}H`] ?? 40) / 2;
    for (let i = 0; i < MAX_FADE_VERTS; i++) {
        const v = i < n ? regularFadeVertex(i, n, halfW, halfH) : { x: 0, y: 0 };
        setInstanceParam(instId, `${base}V${i}x`, i < n ? Math.round(v.x * 100) / 100 : 0);
        setInstanceParam(instId, `${base}V${i}y`, i < n ? Math.round(v.y * 100) / 100 : 0);
    }
}

// ── Helpers for custom overlays that embed a fade but don't own the fade center keys ──
// The active fade's params are <prefix>Fade{X,Y,W,H,...}; the base is derivable from the
// state.wKey that showFadeOverlay set before the custom overlay took over the mode.

function fadeCenterFromState(p, W, H) {
    const base = state.wKey.slice(0, -1);   // '<prefix>Fade'
    return [(0.5 + (p[`${base}X`] ?? 0) / 100) * W, (0.5 - (p[`${base}Y`] ?? 0) / 100) * H];
}

// Draw the active fade shape (no-op if fade is off / no fade is bound to this overlay).
export function drawFadeFromState(p, W, H) {
    if (!state.wKey) return;
    const [fcx, fcy] = fadeCenterFromState(p, W, H);
    drawFadeShape(p, fcx, fcy, W, H);
}

// Discrete fade handles (vertices / edges / rotate). Call BEFORE the effect's own handles.
export function hitTestFadeHandles(p, mx, my, W, H) {
    if (!state.wKey || !state.enabledKey || !p[state.enabledKey]) return null;
    const [fcx, fcy] = fadeCenterFromState(p, W, H);
    const vHit = hitTestFadeVertices(p, mx, my, fcx, fcy, W, H);
    if (vHit) return vHit;
    const { edgeW, edgeH, rotHandle } = getFadeHandlePositions(p, fcx, fcy, W, H);
    if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
    if (edgeW && Math.hypot(mx - edgeW[0], my - edgeW[1]) <= HIT_RADIUS) return 'fadeEdgeW';
    if (edgeH && Math.hypot(mx - edgeH[0], my - edgeH[1]) <= HIT_RADIUS) return 'fadeEdgeH';
    return null;
}

// Fade region grab (moves the whole shape). Call AFTER the effect's own handles so they win.
export function hitTestFadeRegion(p, mx, my, W, H) {
    if (!state.wKey || !state.enabledKey || !p[state.enabledKey]) return null;
    const [fcx, fcy] = fadeCenterFromState(p, W, H);
    return isInsideFade(p, mx, my, fcx, fcy, W, H) ? 'fadeCenter' : null;
}

// ── Standalone Fade tool overlay (mode 'fade', used by the data-driven fade effects) ──

export function drawFade(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);
    const cx = (0.5 + p[state.xKey] / 100) * w;
    const cy = (0.5 - p[state.yKey] / 100) * h;
    drawFadeShape(p, cx, cy, w, h);
}

export function hitTestFade(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;
    if (!p[state.enabledKey]) return null;

    const cx = (0.5 + p[state.xKey] / 100) * W;
    const cy = (0.5 - p[state.yKey] / 100) * H;

    const vHit = hitTestFadeVertices(p, mx, my, cx, cy, W, H);
    if (vHit) return vHit;

    const { edgeW, edgeH, rotHandle } = getFadeHandlePositions(p, cx, cy, W, H);
    if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
    if (edgeW && Math.hypot(mx - edgeW[0], my - edgeW[1]) <= HIT_RADIUS) return 'fadeEdgeW';
    if (edgeH && Math.hypot(mx - edgeH[0], my - edgeH[1]) <= HIT_RADIUS) return 'fadeEdgeH';
    if (isInsideFade(p, mx, my, cx, cy, W, H)) return 'fadeCenter';
    return null;
}
