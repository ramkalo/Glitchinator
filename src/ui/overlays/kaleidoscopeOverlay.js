import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHandle, drawRotHandle, drawCornerHandle, HIT_RADIUS, applyGrab } from '../overlayUtils.js';
import { drawFadeFromState, hitTestFadeHandles, hitTestFadeRegion } from './fadeOverlay.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kalCenter(p) {
    const W = uiOverlay.width, H = uiOverlay.height;
    return {
        cx: (0.5 + p.kKalCenterX / 100) * W,
        cy: (0.5 - p.kKalCenterY / 100) * H,
        W, H,
    };
}

function kalRotRad(p) {
    return (p.kKalRotation ?? 0) * Math.PI / 180;
}

function kalNumVerts(p) {
    if (p.kKalShape === 'triangle')   return 3;
    if (p.kKalShape === 'rectangle')  return 4;
    return Math.max(3, Math.min(12, Math.round(p.kKalSides)));
}

// Returns vertex screen positions for the Kaleidoscope polygon (rotation applied)
function kalVertexScreenPositions(p) {
    const { cx, cy, W, H } = kalCenter(p);
    const rotRad = kalRotRad(p);
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    const n = kalNumVerts(p);
    const verts = [];
    for (let i = 0; i < n; i++) {
        const ox = (p[`kKalV${i}x`] ?? 0) / 100;
        const oy = (p[`kKalV${i}y`] ?? 0) / 100;
        const rx =  ox * cosR - oy * sinR;
        const ry =  ox * sinR + oy * cosR;
        verts.push([
            (0.5 + p.kKalCenterX / 100 + rx) * W,
            (0.5 - p.kKalCenterY / 100 - ry) * H,
        ]);
    }
    return verts;
}

// Find where a ray from (cx, cy) in direction (dx, dy) hits the [0,W]x[0,H] rect
function rayCanvasIntersect(cx, cy, dx, dy, W, H) {
    let tMin = Infinity;
    if (dx > 0) tMin = Math.min(tMin, (W - cx) / dx);
    else if (dx < 0) tMin = Math.min(tMin, (0 - cx) / dx);
    if (dy > 0) tMin = Math.min(tMin, (H - cy) / dy);
    else if (dy < 0) tMin = Math.min(tMin, (0 - cy) / dy);
    return [cx + dx * tMin, cy + dy * tMin];
}

// Reset polygon vertices to defaults (same logic as viewportOverlay)
export function resetKaleidoscopeVertices(instId, shape, n) {
    state.kKalResetting = true;
    const R = 25;
    let startAngle = (shape === 'triangle') ? Math.PI / 2 : 0;
    for (let i = 0; i < 12; i++) {
        const angle = startAngle + i * (2 * Math.PI / n);
        const x = i < n ? Math.round(R * Math.cos(angle) * 100) / 100 : 0;
        const y = i < n ? Math.round(R * Math.sin(angle) * 100) / 100 : 0;
        setInstanceParam(instId, `kKalV${i}x`, x);
        setInstanceParam(instId, `kKalV${i}y`, y);
    }
    state.kKalResetting = false;
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

export function drawKaleidoscope(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);
    drawFadeFromState(p, W, H);

    const mode = p.kaleidoscopeMode ?? 'mirror';

    if (mode === 'mirror') {
        _drawMirror(p, W, H);
    } else if (mode === 'symmetry') {
        _drawSymmetry(p, W, H);
    } else {
        _drawKaleidoscope(p, W, H);
    }
}

function _drawMirror(p, W, H) {
    const cx = (0.5 + p.kMirrorX / 100) * W;
    const cy = (0.5 - p.kMirrorY / 100) * H;

    const angleRad = (p.kMirrorAngle ?? 0) * Math.PI / 180;
    const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
    const ext = Math.max(W, H) * 2;

    // Dashed dividing line
    uiCtx.beginPath();
    uiCtx.moveTo(cx - cos * ext, cy - sin * ext);
    uiCtx.lineTo(cx + cos * ext, cy + sin * ext);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.setLineDash([5, 5]);
    uiCtx.stroke();
    uiCtx.setLineDash([]);

    // Rotation handle (perpendicular to line, 30px out)
    const perpCos = Math.cos(angleRad + Math.PI / 2);
    const perpSin = Math.sin(angleRad + Math.PI / 2);
    const rotHX = cx + perpCos * 30;
    const rotHY = cy + perpSin * 30;

    uiCtx.beginPath();
    uiCtx.moveTo(cx, cy);
    uiCtx.lineTo(rotHX, rotHY);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.lineWidth   = 1;
    uiCtx.stroke();

    drawRotHandle(rotHX, rotHY);
    drawHandle(cx, cy);
}

function _drawSymmetry(p, W, H) {
    const cx = (0.5 + p.kSymX / 100) * W;
    const cy = (0.5 - p.kSymY / 100) * H;
    const n  = Math.max(2, Math.min(12, Math.round(p.kSymSlices ?? 6)));
    const rotOff = (p.kSymRotation ?? 0) * Math.PI / 180;
    const ext = Math.max(W, H) * 1.5;

    for (let i = 0; i < n; i++) {
        const angle = rotOff + i * (2 * Math.PI / n);
        // Negate dy because overlay Y is down but GLSL UV Y is up
        const dx = Math.cos(angle), dy = -Math.sin(angle);

        uiCtx.beginPath();
        uiCtx.moveTo(cx, cy);
        uiCtx.lineTo(cx + dx * ext, cy + dy * ext);

        if (i === 0) {
            // Primary line — brighter + thicker
            uiCtx.strokeStyle = 'rgba(255,255,255,0.85)';
            uiCtx.lineWidth   = 2;
            uiCtx.setLineDash([]);
        } else {
            uiCtx.strokeStyle = 'rgba(255,255,255,0.35)';
            uiCtx.lineWidth   = 1;
            uiCtx.setLineDash([4, 4]);
        }
        uiCtx.stroke();
        uiCtx.setLineDash([]);
    }

    // Tip handle on primary line at canvas edge
    const angle0 = rotOff;
    const dx0 = Math.cos(angle0), dy0 = -Math.sin(angle0);
    const [tipX, tipY] = rayCanvasIntersect(cx, cy, dx0, dy0, W, H);

    drawHandle(cx, cy);
    drawRotHandle(tipX, tipY);
}

function _drawKaleidoscope(p, W, H) {
    const { cx, cy } = kalCenter(p);
    const verts = kalVertexScreenPositions(p);
    const rotRad = kalRotRad(p);

    // Draw polygon outline
    uiCtx.beginPath();
    if (verts.length > 0) {
        uiCtx.moveTo(verts[0][0], verts[0][1]);
        for (let i = 1; i < verts.length; i++) uiCtx.lineTo(verts[i][0], verts[i][1]);
        uiCtx.closePath();
    }
    uiCtx.strokeStyle = 'rgba(255,255,255,0.75)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.setLineDash([]);
    uiCtx.stroke();

    // Rotation handle (40px from center, 90° CW from vertex-0 direction in screen space).
    // Screen Y is flipped vs GLSL, so vertex-0 screen angle = -rotRad; handle = -rotRad + 90°.
    const rotHX = cx + Math.sin(rotRad) * 40;
    const rotHY = cy + Math.cos(rotRad) * 40;

    uiCtx.beginPath();
    uiCtx.moveTo(cx, cy);
    uiCtx.lineTo(rotHX, rotHY);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.lineWidth   = 1;
    uiCtx.stroke();

    // Vertex handles
    for (const [vx, vy] of verts) drawCornerHandle(vx, vy);

    // Rotation handle
    drawRotHandle(rotHX, rotHY);

    // Center handle (drawn last so it's on top)
    drawHandle(cx, cy);
}

// ─── Hit test ─────────────────────────────────────────────────────────────────

export function hitTestKaleidoscope(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const p  = inst.params;
    const W  = uiOverlay.width, H = uiOverlay.height;
    const mode = p.kaleidoscopeMode ?? 'mirror';

    const fh = hitTestFadeHandles(p, mx, my, W, H);
    if (fh) return fh;

    if (mode === 'mirror') {
        const cx = (0.5 + p.kMirrorX / 100) * W;
        const cy = (0.5 - p.kMirrorY / 100) * H;
        if (Math.hypot(mx - cx, my - cy) <= HIT_RADIUS) return 'center';

        const angleRad  = (p.kMirrorAngle ?? 0) * Math.PI / 180;
        const perpCos   = Math.cos(angleRad + Math.PI / 2);
        const perpSin   = Math.sin(angleRad + Math.PI / 2);
        const rotHX     = cx + perpCos * 30;
        const rotHY     = cy + perpSin * 30;
        if (Math.hypot(mx - rotHX, my - rotHY) <= HIT_RADIUS) return 'lineRot';

        return hitTestFadeRegion(p, mx, my, W, H);
    }

    if (mode === 'symmetry') {
        const cx = (0.5 + p.kSymX / 100) * W;
        const cy = (0.5 - p.kSymY / 100) * H;
        if (Math.hypot(mx - cx, my - cy) <= HIT_RADIUS) return 'center';

        const angle0 = (p.kSymRotation ?? 0) * Math.PI / 180;
        const dx0 = Math.cos(angle0), dy0 = -Math.sin(angle0);
        const [tipX, tipY] = rayCanvasIntersect(cx, cy, dx0, dy0, W, H);
        if (Math.hypot(mx - tipX, my - tipY) <= HIT_RADIUS) return 'symTip';

        return hitTestFadeRegion(p, mx, my, W, H);
    }

    // Kaleidoscope mode
    const { cx, cy } = kalCenter(p);
    if (Math.hypot(mx - cx, my - cy) <= HIT_RADIUS) return 'center';

    const rotRad = kalRotRad(p);
    const rotHX = cx + Math.sin(rotRad) * 40;
    const rotHY = cy + Math.cos(rotRad) * 40;
    if (Math.hypot(mx - rotHX, my - rotHY) <= HIT_RADIUS) return 'rotation';

    const verts = kalVertexScreenPositions(p);
    for (let i = 0; i < verts.length; i++) {
        if (Math.hypot(mx - verts[i][0], my - verts[i][1]) <= HIT_RADIUS) return `v${i}`;
    }

    return hitTestFadeRegion(p, mx, my, W, H);
}

// ─── Drag ─────────────────────────────────────────────────────────────────────

export function onDragKaleidoscope(e, inst, rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W  = uiOverlay.width, H = uiOverlay.height;
    const p  = inst.params;
    const h  = state.handle;
    const mode = p.kaleidoscopeMode ?? 'mirror';

    if (mode === 'mirror') {
        const cx = (0.5 + p.kMirrorX / 100) * W;
        const cy = (0.5 - p.kMirrorY / 100) * H;
        if (h === 'center') {
            const [gx, gy] = applyGrab(cx, cy, mx, my);
            setInstanceParam(state.instId, 'kMirrorX', Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100))));
            setInstanceParam(state.instId, 'kMirrorY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100))));
        } else if (h === 'lineRot') {
            // Handle is at angle+90° from center; subtract 90° to get line angle
            let deg = Math.atan2(my - cy, mx - cx) * 180 / Math.PI - 90;
            if (deg > 180)  deg -= 360;
            if (deg < -180) deg += 360;
            setInstanceParam(state.instId, 'kMirrorAngle', Math.round(deg));
        }
        return;
    }

    if (mode === 'symmetry') {
        const cx = (0.5 + p.kSymX / 100) * W;
        const cy = (0.5 - p.kSymY / 100) * H;
        if (h === 'center') {
            const [gx, gy] = applyGrab(cx, cy, mx, my);
            setInstanceParam(state.instId, 'kSymX', Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100))));
            setInstanceParam(state.instId, 'kSymY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100))));
        } else if (h === 'symTip') {
            // Negate Y to convert screen-space angle to GLSL UV-space angle (Y is flipped)
            let deg = Math.atan2(-(my - cy), mx - cx) * 180 / Math.PI;
            setInstanceParam(state.instId, 'kSymRotation', ((Math.round(deg) % 360) + 360) % 360);
        }
        return;
    }

    // Kaleidoscope mode
    const { cx, cy } = kalCenter(p);
    if (h === 'center') {
        const [gx, gy] = applyGrab(cx, cy, mx, my);
        setInstanceParam(state.instId, 'kKalCenterX', Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'kKalCenterY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100))));
    } else if (h === 'rotation') {
        let deg = 90 - Math.atan2(my - cy, mx - cx) * 180 / Math.PI;
        if (deg > 180)  deg -= 360;
        if (deg < -180) deg += 360;
        setInstanceParam(state.instId, 'kKalRotation', Math.round(deg));
    } else if (h && h.startsWith('v')) {
        const idx = parseInt(h.slice(1), 10);
        const rotRad = kalRotRad(p);
        const cosR = Math.cos(-rotRad), sinR = Math.sin(-rotRad); // inverse rotation
        const rawX = (mx / W - 0.5) * 100 - p.kKalCenterX;
        const rawY = -(my / H - 0.5) * 100 - p.kKalCenterY;
        // Un-rotate to get local vertex offset
        const ox = rawX * cosR - rawY * sinR;
        const oy = rawX * sinR + rawY * cosR;
        setInstanceParam(state.instId, `kKalV${idx}x`, Math.max(-50, Math.min(50, Math.round(ox))));
        setInstanceParam(state.instId, `kKalV${idx}y`, Math.max(-50, Math.min(50, Math.round(oy))));
    }
}
