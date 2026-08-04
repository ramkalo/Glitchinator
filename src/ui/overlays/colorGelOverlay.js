import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawRotHandle, strokeAntLine, HIT_RADIUS } from '../overlayUtils.js';
import { drawFadeShape, getFadeHandlePositions, hitTestFadeVertices, isInsideFade } from './fadeOverlay.js';
import { gelMode, gelCenterUv, gelCenterPx, gelAxisDir, gelSweepAngle,
         gelStopPos, activeGelStops } from '../../effects/colorGel.js';

// Color Gel gradient overlay. Whatever the mode, the spacing between colors
// belongs to the Gradient Arrangement slider alone; the canvas shows one dashed
// shape marking the middle of that arrangement, which you grab anywhere along
// its length to move the gradient as a whole:
//
//   linear      a line across the image  — drag moves the origin it runs through
//   concentric  nothing but the hub below — the rings' radii are the slider's job
//   radial      one arm per color, starfish style — drag any arm to spin the sweep
//
// Concentric and radial also draw a small dashed hub at that origin; dragging it
// moves the whole thing (linear needs no hub — its line is the grab target). No dot handles anywhere — every grabbable
// thing is a dashed shape. The fade shape is drawn/edited inline too.

const ROT_PX   = 34;   // rotation handle distance from the line (screen px)
const LINE_HIT = 0.03; // line grab threshold (uv perpendicular distance)
const ARM_HIT  = 14;   // arm grab threshold (screen px from the arm)
const HUB_PX   = 26;   // radius of the centre hub (screen px)

const toPx = (ux, uy, w, h) => [ux * w, (1 - uy) * h];

/** uv point the linear gradient line passes through: the gradient origin. */
const gradientLineUv = gelCenterUv;

/**
 * Screen angles (y down) of the radial arms — one per active color, each pointing
 * along the middle of its wedge. The arrangement slider positions them; dragging
 * any one of them spins the whole set.
 */
const armAngles = (p) => activeGelStops(p).map(si => gelSweepAngle(p, gelStopPos(p, si)));

/**
 * Screen position of the rotation handle: off the gradient line, along the
 * gradient axis mapped into pixels.
 *
 * Not the line's screen perpendicular, which is the other tempting choice and
 * looks tidier — the two directions differ by up to 31° on a 16:9 canvas, and
 * only this one has a uv-angle equal to the gradient angle. Since the drag
 * measures the cursor in uv, this is the only placement that keeps the handle
 * pinned under the pointer rather than sliding off it as you turn. Sitting on
 * the axis ray out of the origin — the very point rotation pivots on — is what
 * makes the handle sweep exactly the angle the cursor does.
 */
function rotHandlePx(p, w, h) {
    const [nx, ny] = gelAxisDir(p);
    const len = Math.hypot(nx * w, ny * h) || 1;
    const ox = nx * w / len, oy = -ny * h / len;
    const [ax, ay] = gradientLineUv(p);
    const [px, py] = toPx(ax, ay, w, h);
    return { hx: px + ox * ROT_PX, hy: py + oy * ROT_PX };
}

const fadeCenterPx = (p, W, H) =>
    [(0.5 + (p.colorGelFadeX ?? -25) / 100) * W, (0.5 - (p.colorGelFadeY ?? -25) / 100) * H];

export function drawColorGel(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);

    const mode = gelMode(p);
    if (mode === 'linear') {
        const [nx, ny] = gelAxisDir(p);
        const lx = -ny, ly = nx; // line direction (perpendicular to the gradient axis)
        const [ax, ay] = gradientLineUv(p);

        const [x1, y1] = toPx(ax + lx * 2, ay + ly * 2, w, h);
        const [x2, y2] = toPx(ax - lx * 2, ay - ly * 2, w, h);
        uiCtx.beginPath();
        uiCtx.moveTo(x1, y1);
        uiCtx.lineTo(x2, y2);
        // Alternating black/white dashes so the line reads on any background.
        strokeAntLine();

        const [px, py] = toPx(ax, ay, w, h);
        const rot = rotHandlePx(p, w, h);
        uiCtx.beginPath();
        uiCtx.moveTo(px, py);
        uiCtx.lineTo(rot.hx, rot.hy);
        uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
        uiCtx.lineWidth   = 1;
        uiCtx.stroke();
        drawRotHandle(rot.hx, rot.hy);
    } else if (mode !== 'solid') {
        const [cx, cy] = gelCenterPx(p, w, h);

        if (mode === 'radial') {
            // One arm per color, radiating from the origin.
            const reach = Math.hypot(w, h);
            for (const a of armAngles(p)) {
                uiCtx.beginPath();
                uiCtx.moveTo(cx, cy);
                uiCtx.lineTo(cx + Math.cos(a) * reach, cy + Math.sin(a) * reach);
                strokeAntLine();
            }
        }

        // Origin hub — the one thing you grab to move the whole gradient.
        uiCtx.beginPath();
        uiCtx.arc(cx, cy, HUB_PX, 0, Math.PI * 2);
        strokeAntLine();
    }

    const [fcx, fcy] = fadeCenterPx(p, w, h);
    drawFadeShape(p, fcx, fcy, w, h);
}

export function hitTestColorGel(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const p = inst.params;

    const mode = gelMode(p);
    if (mode === 'linear') {
        const rot = rotHandlePx(p, W, H);
        if (Math.hypot(mx - rot.hx, my - rot.hy) <= HIT_RADIUS) return 'gradRot';

        // anywhere along the gradient line, by perpendicular uv distance
        const [nx, ny] = gelAxisDir(p);
        const [ax, ay] = gradientLineUv(p);
        const cx = mx / W, cy = 1 - my / H;
        if (Math.abs((cx - ax) * nx + (cy - ay) * ny) < LINE_HIT) return 'line';
    } else if (mode !== 'solid') {
        const [cx, cy] = gelCenterPx(p, W, H);
        const dx = mx - cx, dy = my - cy;
        if (mode === 'radial') {
            // anywhere along an arm, by perpendicular screen distance. Arms all
            // converge at the origin, so ignore the hub area and let the hub win
            // there — otherwise the centre could never be dragged.
            const dist = Math.hypot(dx, dy);
            if (dist > HUB_PX) {
                for (const a of armAngles(p)) {
                    const along  = Math.cos(a) * dx + Math.sin(a) * dy;
                    const across = -Math.sin(a) * dx + Math.cos(a) * dy;
                    if (along > 0 && Math.abs(across) <= ARM_HIT) return 'line';
                }
            }
        }
    }

    if (p.colorGelFadeEnabled) {
        const [fcx, fcy] = fadeCenterPx(p, W, H);
        const vHit = hitTestFadeVertices(p, mx, my, fcx, fcy, W, H);
        if (vHit) return vHit;
        const { edgeW, edgeH, rotHandle } = getFadeHandlePositions(p, fcx, fcy, W, H);
        if (Math.hypot(mx - rotHandle[0], my - rotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
        if (edgeW && Math.hypot(mx - edgeW[0], my - edgeW[1]) <= HIT_RADIUS) return 'fadeEdgeW';
        if (edgeH && Math.hypot(mx - edgeH[0], my - edgeH[1]) <= HIT_RADIUS) return 'fadeEdgeH';
        if (isInsideFade(p, mx, my, fcx, fcy, W, H)) return 'fadeCenter';
    }

    // The origin hub goes last so a fade handle sitting on top of it still wins.
    if (mode === 'concentric' || mode === 'radial') {
        const [cx, cy] = gelCenterPx(p, W, H);
        if (Math.hypot(mx - cx, my - cy) <= HUB_PX) return 'center';
    }
    return null;
}

/**
 * Drag anchor for anything that rotates: the cursor's starting angle about the
 * pivot is captured so the shape doesn't jump to the cursor on grab. Linear
 * pivots on the image center; the radial sweep pivots on its own origin.
 */
const cursorAngleDeg = (mx, my, a) =>
    Math.atan2(-(my - a.pivotY) * a.scaleY, (mx - a.pivotX) * a.scaleX) * 180 / Math.PI;

export function gelRotAnchor(p, mx, my, W, H) {
    const radial = gelMode(p) === 'radial';
    // Both modes pivot on the gradient's own origin — for linear that is the
    // point the line runs through, so turning it spins the line where it sits.
    const [cx, cy] = gelCenterPx(p, W, H);
    // The sweep's angle is measured in pixels — its shader branch runs atan on a
    // pixel offset — but the linear axis lives in uv, where x and y are both
    // 0–1. Measure the cursor in whichever space the mode actually uses: mixing
    // them turns the gradient at 0.56× to 1.78× the cursor on a 16:9 canvas,
    // varying continuously as you swing around.
    const anchor = {
        startAngle: p.colorGelGradAngle ?? 45,
        pivotX: cx, pivotY: cy,
        scaleX: radial ? 1 : 1 / W,
        scaleY: radial ? 1 : 1 / H,
    };
    anchor.startCursor = cursorAngleDeg(mx, my, anchor);
    return anchor;
}

/** Drag anchor for the origin hub: keeps the grab offset so it doesn't snap. */
export function gelCenterAnchor(p, mx, my, W, H) {
    const [cx, cy] = gelCenterPx(p, W, H);
    return { grabDX: cx - mx, grabDY: cy - my };
}

export function onDragColorGel(e, inst, rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W  = uiOverlay.width, H = uiOverlay.height;
    const p  = inst.params;
    const handle = state.handle;

    const mode = gelMode(p);

    // Every color moves together; the spacing set by the arrangement slider comes
    // along unchanged, whichever shape is being dragged.
    if (handle === 'line' && mode === 'linear') {
        // The line passes through the gradient origin, so dragging it just moves
        // that point to the cursor. Storing a point rather than a slide along the
        // axis is what lets the line rotate in place instead of swinging around
        // the middle of the image.
        setInstanceParam(state.instId, 'colorGelCenterX', Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100)) * 10) / 10);
        setInstanceParam(state.instId, 'colorGelCenterY', Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100)) * 10) / 10);
        return;
    }

    if (handle === 'line' && mode === 'radial') {
        // Spin the sweep so the marker line stays under the cursor.
        const a = state.dragAnchor;
        if (!a) return;
        const cursor = cursorAngleDeg(mx, my, a);
        let deg = a.startAngle + (cursor - a.startCursor);
        deg = ((deg + 180) % 360 + 360) % 360 - 180;
        setInstanceParam(state.instId, 'colorGelGradAngle', Math.round(deg));
        return;
    }

    if (handle === 'center') {
        const a = state.dragAnchor;
        const gx = mx + (a?.grabDX ?? 0), gy = my + (a?.grabDY ?? 0);
        setInstanceParam(state.instId, 'colorGelCenterX', Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'colorGelCenterY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100))));
        return;
    }

    if (handle === 'gradRot') {
        const a = state.dragAnchor;
        if (!a) return;
        const cursor = cursorAngleDeg(mx, my, a);
        let deg = a.startAngle + (cursor - a.startCursor);
        deg = ((deg + 180) % 360 + 360) % 360 - 180;
        setInstanceParam(state.instId, 'colorGelGradAngle', Math.round(deg));
        return;
    }

    // Fade handles (fadeCenter/fadeEdge*/fadeRot/fadeV#) are dragged centrally in canvasPicker.
}
