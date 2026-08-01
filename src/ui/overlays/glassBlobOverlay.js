import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHandle, drawCornerHandle, drawRotHandle, HIT_RADIUS, applyGrab } from '../overlayUtils.js';
import { blobHarmonics } from '../../effects/glassBlob.js';

// Unit irregular radius at angle (matches the shader's gbRadiusAt; uses the SAME
// JS-computed harmonics the shader receives, so the outline tracks the blob exactly).
function radiusAt(ang, seed, irregular) {
    const { amp, ph } = blobHarmonics(seed);
    let wob = 0;
    for (let i = 0; i < 4; i++) { const fn = i + 2; wob += amp[i] * Math.sin(fn * ang + ph[i]) / fn; }
    return 1 + (irregular / 100) * 0.6 * wob;
}

// Geometry shared by draw / hit-test / drag. Semi-axes are fractions of canvas height
// (matching the shader); local coords are image y-up, rotated by the blob angle.
function geom(p, w, h) {
    const cx = (p.glassBlobX / 100) * w;
    const cy = (p.glassBlobY / 100) * h;
    const ex = (p.glassBlobSizeX / 100) * 0.5;   // height-fraction semi-axes
    const ey = (p.glassBlobSizeY / 100) * 0.5;
    const a  = (p.glassBlobAngle || 0) * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    // local (height-fraction, y-up) → screen px
    const l2s = (lx, ly) => [cx + (lx * ca - ly * sa) * h, cy - (lx * sa + ly * ca) * h];
    return { cx, cy, ex, ey, a, ca, sa, h, l2s };
}

const ROT_MARGIN_PX = 26;

export function drawGlassBlob(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);
    const g = geom(p, w, h);

    // Irregular ellipse outline.
    uiCtx.beginPath();
    for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * Math.PI * 2;
        const rr = radiusAt(t, p.glassBlobSeed, p.glassBlobIrregular);
        const [sx, sy] = g.l2s(Math.cos(t) * rr * g.ex, Math.sin(t) * rr * g.ey);
        if (i === 0) uiCtx.moveTo(sx, sy); else uiCtx.lineTo(sx, sy);
    }
    uiCtx.closePath();
    uiCtx.strokeStyle = 'rgba(255,255,255,0.6)';
    uiCtx.lineWidth = 1.5;
    uiCtx.setLineDash([5, 5]);
    uiCtx.stroke();
    uiCtx.setLineDash([]);

    const edgeW = g.l2s(g.ex, 0);
    const edgeH = g.l2s(0, g.ey);
    const rot   = g.l2s(0, g.ey + ROT_MARGIN_PX / h);

    // Rotation arm.
    uiCtx.beginPath();
    uiCtx.moveTo(edgeH[0], edgeH[1]);
    uiCtx.lineTo(rot[0], rot[1]);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.lineWidth = 1;
    uiCtx.stroke();

    drawCornerHandle(edgeW[0], edgeW[1]);
    drawCornerHandle(edgeH[0], edgeH[1]);
    drawRotHandle(rot[0], rot[1]);

    // Light handle.
    const lx = (p.glassBlobLightX / 100) * w, ly = (p.glassBlobLightY / 100) * h;
    drawHandle(lx, ly);
    uiCtx.font = '10px sans-serif';
    uiCtx.fillStyle = 'rgba(255,255,255,0.9)';
    uiCtx.strokeStyle = 'rgba(0,0,0,0.6)';
    uiCtx.lineWidth = 2;
    uiCtx.strokeText('Light', lx + 10, ly - 8);
    uiCtx.fillText('Light', lx + 10, ly - 8);

    drawHandle(g.cx, g.cy);
}

export function hitTestGlassBlob(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const w = uiOverlay.width, h = uiOverlay.height;
    const p = inst.params;

    const lx = (p.glassBlobLightX / 100) * w, ly = (p.glassBlobLightY / 100) * h;
    if (Math.hypot(mx - lx, my - ly) <= HIT_RADIUS) return 'light';

    const g = geom(p, w, h);
    const rot   = g.l2s(0, g.ey + ROT_MARGIN_PX / h);
    const edgeW = g.l2s(g.ex, 0);
    const edgeH = g.l2s(0, g.ey);
    if (Math.hypot(mx - rot[0],   my - rot[1])   <= HIT_RADIUS) return 'rot';
    if (Math.hypot(mx - edgeW[0], my - edgeW[1]) <= HIT_RADIUS) return 'edgeW';
    if (Math.hypot(mx - edgeH[0], my - edgeH[1]) <= HIT_RADIUS) return 'edgeH';
    if (Math.hypot(mx - g.cx,     my - g.cy)     <= HIT_RADIUS) return 'center';
    return null;
}

export function onDragGlassBlob(e, inst, rect) {
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const w = uiOverlay.width, h = uiOverlay.height;
    const p = inst.params;
    const clamp = (v, lo, hi) => Math.round(Math.max(lo, Math.min(hi, v)));
    const g = geom(p, w, h);

    // Mouse offset in local (image y-up, height-fraction) space.
    const ox = (mx - g.cx) / h, oy = -(my - g.cy) / h;
    const lx =  ox * g.ca + oy * g.sa;
    const ly = -ox * g.sa + oy * g.ca;

    if (state.handle === 'center') {
        const [gx, gy] = applyGrab(g.cx, g.cy, mx, my);
        setInstanceParam(state.instId, 'glassBlobX', clamp((gx / w) * 100, 0, 100));
        setInstanceParam(state.instId, 'glassBlobY', clamp((gy / h) * 100, 0, 100));
    } else if (state.handle === 'light') {
        setInstanceParam(state.instId, 'glassBlobLightX', clamp((mx / w) * 100, 0, 100));
        setInstanceParam(state.instId, 'glassBlobLightY', clamp((my / h) * 100, 0, 100));
    } else if (state.handle === 'edgeW') {
        setInstanceParam(state.instId, 'glassBlobSizeX', clamp(Math.abs(lx) * 200, 2, 100));
    } else if (state.handle === 'edgeH') {
        setInstanceParam(state.instId, 'glassBlobSizeY', clamp(Math.abs(ly) * 200, 2, 100));
    } else if (state.handle === 'rot') {
        let deg = Math.atan2(-ox, oy) * 180 / Math.PI;   // align local +y axis with the cursor
        if (deg > 180)  deg -= 360;
        if (deg < -180) deg += 360;
        setInstanceParam(state.instId, 'glassBlobAngle', Math.round(deg));
    }
}
