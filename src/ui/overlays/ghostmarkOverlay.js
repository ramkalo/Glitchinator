import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHandle, drawRotHandle, HIT_RADIUS } from '../overlayUtils.js';

// Ghostmark placement overlay: drag the box to move (single mode), a rotation handle above the
// box to set Angle, and a size handle to the right to set Size. Repeat mode has no position, so
// the rotation/size handles anchor at the canvas centre and the move handle is hidden.

const ROT_MARGIN  = 26;
const SIZE_MARGIN = 18;

const rad = (p) => (p.ghostmarkAngle ?? 0) * Math.PI / 180;

function refCenter(p, W, H) {
    if (p.ghostmarkRepeat) return [W / 2, H / 2];
    return [(0.5 + (p.ghostmarkX ?? 0) / 100) * W, (0.5 - (p.ghostmarkY ?? 0) / 100) * H];
}

// Half-extents of the mark box, matching the effect's rasterizer sizing (a rough glyph metric).
function boxExtents(p, W, H) {
    const fontPx  = Math.max(6, (p.ghostmarkSize / 100) * Math.min(W, H));
    const lines   = String(p.ghostmarkText ?? '').split('\n');
    const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), '');
    const w = Math.max(fontPx, longest.length * fontPx * 0.55);
    const h = fontPx * 1.25 * lines.length;
    return { hw: w / 2 + fontPx * 0.4, hh: h / 2 + fontPx * 0.3 };
}

// Rotate local (lx,ly) around (cx,cy) by ang → screen point.
function toScreen(cx, cy, ang, lx, ly) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return [cx + lx * c - ly * s, cy + lx * s + ly * c];
}

function layout(p, W, H) {
    const [cx, cy] = refCenter(p, W, H);
    const { hw, hh } = boxExtents(p, W, H);
    const ang = rad(p);
    const [rx, ry] = toScreen(cx, cy, ang, 0, -(hh + ROT_MARGIN));
    const [sx, sy] = toScreen(cx, cy, ang, hw + SIZE_MARGIN, 0);
    return { cx, cy, hw, hh, ang, rx, ry, sx, sy };
}

export function drawGhostmark(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);
    const { cx, cy, hw, hh, ang, rx, ry, sx, sy } = layout(p, W, H);

    uiCtx.save();
    uiCtx.translate(cx, cy);
    uiCtx.rotate(ang);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
    uiCtx.lineWidth = 1;
    uiCtx.setLineDash([5, 4]);
    uiCtx.strokeRect(-hw, -hh, hw * 2, hh * 2);
    uiCtx.restore();

    uiCtx.setLineDash([]);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.lineWidth = 1;
    uiCtx.beginPath(); uiCtx.moveTo(cx, cy); uiCtx.lineTo(rx, ry); uiCtx.stroke();

    drawRotHandle(rx, ry);                          // rotation
    drawHandle(sx, sy);                             // size
    if (!p.ghostmarkRepeat) drawHandle(cx, cy);     // move (single mode only)
}

export function hitTestGhostmark(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const p = inst.params;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const { cx, cy, hw, hh, ang, rx, ry, sx, sy } = layout(p, W, H);

    if (Math.hypot(mx - rx, my - ry) <= HIT_RADIUS) return 'rot';
    if (Math.hypot(mx - sx, my - sy) <= HIT_RADIUS) return 'size';
    if (!p.ghostmarkRepeat) {
        const c = Math.cos(-ang), s = Math.sin(-ang);
        const dx = mx - cx, dy = my - cy;
        const lx = dx * c - dy * s, ly = dx * s + dy * c;
        if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return 'center';
    }
    return null;
}

// ── drag anchors (called from canvasPicker onDown) ───────────────────────────────
export function ghostmarkCenterAnchor(p, mx, my, W, H) {
    const [cx, cy] = refCenter(p, W, H);
    return { grabDX: cx - mx, grabDY: cy - my };
}
export function ghostmarkRotAnchor(p, mx, my, W, H) {
    const [cx, cy] = refCenter(p, W, H);
    return { pivotX: cx, pivotY: cy, startAngle: p.ghostmarkAngle ?? 0,
             startCursor: Math.atan2(my - cy, mx - cx) * 180 / Math.PI };
}
export function ghostmarkSizeAnchor(p, mx, my, W, H) {
    const [cx, cy] = refCenter(p, W, H);
    return { pivotX: cx, pivotY: cy, startDist: Math.max(1, Math.hypot(mx - cx, my - cy)),
             startSize: p.ghostmarkSize ?? 6 };
}

export function onDragGhostmark(e, inst, rect) {
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const a = state.dragAnchor;

    if (state.handle === 'center') {
        const gx = mx + (a?.grabDX ?? 0), gy = my + (a?.grabDY ?? 0);
        setInstanceParam(state.instId, 'ghostmarkX', Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'ghostmarkY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100))));
    } else if (state.handle === 'rot') {
        if (!a) return;
        const cursor = Math.atan2(my - a.pivotY, mx - a.pivotX) * 180 / Math.PI;
        let deg = a.startAngle + (cursor - a.startCursor);
        deg = ((deg + 180) % 360 + 360) % 360 - 180;
        setInstanceParam(state.instId, 'ghostmarkAngle', Math.round(deg));
    } else if (state.handle === 'size') {
        if (!a) return;
        const dist = Math.hypot(mx - a.pivotX, my - a.pivotY);
        const size = Math.max(1, Math.min(50, a.startSize * dist / a.startDist));
        setInstanceParam(state.instId, 'ghostmarkSize', Math.round(size * 2) / 2);
    }
}
