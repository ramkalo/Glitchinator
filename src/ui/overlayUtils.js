import { canvas } from '../renderer/glstate.js';
import { getStack } from '../state/effectStack.js';
import { state } from './overlayState.js';

export const uiOverlay = document.getElementById('uiOverlay');
export const uiCtx     = uiOverlay.getContext('2d');

export const HIT_RADIUS = 18;

export function syncSize() {
    const r = canvas.getBoundingClientRect();
    uiOverlay.width  = r.width;
    uiOverlay.height = r.height;
}

export function clear() {
    uiCtx.clearRect(0, 0, uiOverlay.width, uiOverlay.height);
}

export function drawHandle(cx, cy) {
    uiCtx.beginPath();
    uiCtx.arc(cx, cy, 7, 0, Math.PI * 2);
    uiCtx.fillStyle   = 'rgba(255,255,255,0.92)';
    uiCtx.shadowColor = 'rgba(0,0,0,0.55)';
    uiCtx.shadowBlur  = 4;
    uiCtx.fill();
    uiCtx.shadowBlur  = 0;
    uiCtx.strokeStyle = 'rgba(0,0,0,0.4)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.stroke();
    uiCtx.strokeStyle = 'rgba(255,255,255,0.75)';
    uiCtx.lineWidth   = 1;
    uiCtx.beginPath();
    uiCtx.moveTo(cx - 12, cy); uiCtx.lineTo(cx + 12, cy);
    uiCtx.moveTo(cx, cy - 12); uiCtx.lineTo(cx, cy + 12);
    uiCtx.stroke();
}

export function drawRotHandle(cx, cy) {
    uiCtx.beginPath();
    uiCtx.arc(cx, cy, 6, 0, Math.PI * 2);
    uiCtx.fillStyle   = 'rgba(255,255,255,0.92)';
    uiCtx.shadowColor = 'rgba(0,0,0,0.55)';
    uiCtx.shadowBlur  = 4;
    uiCtx.fill();
    uiCtx.shadowBlur  = 0;
    uiCtx.strokeStyle = 'rgba(0,0,0,0.4)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.stroke();
}

export function drawCornerHandle(cx, cy) {
    const s = 5;
    uiCtx.save();
    uiCtx.translate(cx, cy);
    uiCtx.shadowColor = 'rgba(0,0,0,0.55)';
    uiCtx.shadowBlur  = 4;
    uiCtx.fillStyle   = 'rgba(255,255,255,0.92)';
    uiCtx.fillRect(-s, -s, s * 2, s * 2);
    uiCtx.shadowBlur  = 0;
    uiCtx.strokeStyle = 'rgba(0,0,0,0.4)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.strokeRect(-s, -s, s * 2, s * 2);
    uiCtx.restore();
}

// Returns the screen-pixel center of the active overlay, or null.
export function getCentre() {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const p = inst.params;
    return {
        cx: (0.5 + p[state.xKey] / 100) * uiOverlay.width,
        cy: (0.5 - p[state.yKey] / 100) * uiOverlay.height,
    };
}

// Simple distance check to the center handle — used by modes with only a center handle.
export function hitTestCentre(e) {
    const c = getCentre();
    if (!c) return false;
    const rect = canvas.getBoundingClientRect();
    const dx = (e.clientX - rect.left) - c.cx;
    const dy = (e.clientY - rect.top)  - c.cy;
    return Math.sqrt(dx * dx + dy * dy) <= HIT_RADIUS;
}

// Draws the shared ellipse-or-rect outline + edge handles + rot handle used by
// blur, vignette, and CRT modes. cx/cy are screen pixels; a/b are semi-axes in
// screen pixels; angle is radians.
// Strokes the current path with alternating black/white dashes so it's visible
// on both light and dark backgrounds.
export function strokeAntLine() {
    uiCtx.save();
    uiCtx.lineWidth = 1.5;
    uiCtx.setLineDash([5, 5]);
    uiCtx.strokeStyle  = 'rgba(0,0,0,0.7)';
    uiCtx.lineDashOffset = 5;
    uiCtx.stroke();
    uiCtx.strokeStyle  = 'rgba(255,255,255,0.9)';
    uiCtx.lineDashOffset = 0;
    uiCtx.stroke();
    uiCtx.setLineDash([]);
    uiCtx.lineDashOffset = 0;
    uiCtx.restore();
}

export function drawEllipseOrRect(cx, cy, a, b, angle, isRect) {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const rotPt = (lx, ly) => [cx + lx * cosA - ly * sinA, cy + lx * sinA + ly * cosA];

    uiCtx.save();
    uiCtx.translate(cx, cy);
    uiCtx.rotate(angle);
    uiCtx.beginPath();
    if (isRect) {
        uiCtx.rect(-a, -b, 2 * a, 2 * b);
    } else {
        uiCtx.ellipse(0, 0, a, b, 0, 0, Math.PI * 2);
    }
    strokeAntLine();
    uiCtx.restore();

    const edgeW     = rotPt(a, 0);
    const edgeH     = rotPt(0, -b);
    const rotHandle = rotPt(0, -(b + 22));

    uiCtx.beginPath();
    uiCtx.moveTo(edgeH[0], edgeH[1]);
    uiCtx.lineTo(rotHandle[0], rotHandle[1]);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.lineWidth   = 1;
    uiCtx.stroke();

    drawCornerHandle(edgeW[0], edgeW[1]);
    drawCornerHandle(edgeH[0], edgeH[1]);
    drawRotHandle(rotHandle[0], rotHandle[1]);

    return { edgeW, edgeH, rotHandle };
}

// Even-odd point-in-polygon for a 4-corner quad given in TL, TR, BR, BL order.
// Works for skewed/rotated quads, which is what the text and mesh boxes are.
export function pointInQuad(px, py, tlx, tly, trx, try_, brx, bry, blx, bly) {
    const verts = [[tlx, tly], [trx, try_], [brx, bry], [blx, bly]];
    let inside = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
        const [xi, yi] = verts[i], [xj, yj] = verts[j];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
            inside = !inside;
    }
    return inside;
}

export function isInsideFadeShape(mx, my, cx, cy, a, b, angle, isRect = false) {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const lx = (mx - cx) * cosA + (my - cy) * sinA;
    const ly = -(mx - cx) * sinA + (my - cy) * cosA;
    return isRect ? (Math.abs(lx) <= a && Math.abs(ly) <= b)
                  : ((lx / a) ** 2 + (ly / b) ** 2 <= 1);
}

// Shared hit-test geometry for blur/vignette/CRT modes. Edge/rot handles take
// priority; clicking anywhere inside the shape moves the center.
export function hitTestEllipseHandles(e, cx, cy, a, b, angle, isRect = false) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const rotPt = (lx, ly) => [cx + lx * cosA - ly * sinA, cy + lx * sinA + ly * cosA];
    const edgeW     = rotPt(a, 0);
    const edgeH     = rotPt(0, -b);
    const rotHandle = rotPt(0, -(b + 22));

    if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'rot';
    if (Math.hypot(mx - edgeW[0],     my - edgeW[1])     <= HIT_RADIUS) return 'edgeW';
    if (Math.hypot(mx - edgeH[0],     my - edgeH[1])     <= HIT_RADIUS) return 'edgeH';
    if (isInsideFadeShape(mx, my, cx, cy, a, b, angle, isRect))          return 'center';
    return null;
}
