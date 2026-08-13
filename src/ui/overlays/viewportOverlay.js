import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawCornerHandle, HIT_RADIUS, applyGrab } from '../overlayUtils.js';
import { pointInScreenPoly } from './fadeOverlay.js';
import { vpTextFontStr } from '../../effects/viewport.js';

// Screen-space bbox of the text-mode glyphs, measured at the on-screen size so the
// overlay box matches the rasterized mask. Centered at vpX/vpY; size = % of height.
function vpTextBox(p) {
    const W = uiOverlay.width, H = uiOverlay.height;
    const cx = (0.5 + p.vpX / 100) * W;
    const cy = (0.5 - p.vpY / 100) * H;
    const sizeScreen = Math.max(1, (p.vpTextSize ?? 12) / 100 * H);
    uiCtx.save();
    uiCtx.font = vpTextFontStr(p, sizeScreen);
    try { uiCtx.letterSpacing = `${p.vpTextKerning ?? 0}px`; } catch { /* unsupported */ }
    const tw = uiCtx.measureText(p.vpText != null ? p.vpText : 'BXTRXT').width;
    uiCtx.restore();
    const hw = Math.max(6, tw / 2);
    const hh = Math.max(6, sizeScreen * 0.6);
    return { cx, cy, hw, hh, W, H };
}

function vpCenter(p) {
    const W = uiOverlay.width, H = uiOverlay.height;
    return {
        cx: (0.5 + p.vpX / 100) * W,
        cy: (0.5 - p.vpY / 100) * H,
        W, H,
    };
}

function vpVertexScreenPositions(p) {
    const { W, H } = vpCenter(p);
    const shape = p.vpShape;
    const n = shape === 'triangle' ? 3 : Math.max(3, Math.min(12, Math.round(p.vpSides)));
    const verts = [];
    for (let i = 0; i < n; i++) {
        verts.push([
            (0.5 + (p.vpX + (p[`vpV${i}x`] ?? 0)) / 100) * W,
            (0.5 - (p.vpY + (p[`vpV${i}y`] ?? 0)) / 100) * H,
        ]);
    }
    return verts;
}

export function resetPolygonVertices(instId, shape, sides) {
    state.vpResetting = true;
    let n, startAngle;
    if (shape === 'triangle') {
        n = 3;
        startAngle = Math.PI / 2;
    } else {
        n = Math.max(3, Math.min(12, sides));
        startAngle = 0;
    }
    const R = 25;
    for (let i = 0; i < 12; i++) {
        const angle = startAngle + i * (2 * Math.PI / n);
        const x = i < n ? Math.round(R * Math.cos(angle) * 100) / 100 : 0;
        const y = i < n ? Math.round(R * Math.sin(angle) * 100) / 100 : 0;
        setInstanceParam(instId, `vpV${i}x`, x);
        setInstanceParam(instId, `vpV${i}y`, y);
    }
    state.vpResetting = false;
    const inst = getStack().find(i => i.id === instId);
    if (inst) drawViewport(inst.params);
}

export function drawViewport(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);

    const { cx, cy } = vpCenter(p);

    if (p.vpShape === 'text') {
        const b = vpTextBox(p);
        const left = b.cx - b.hw, top = b.cy - b.hh, right = b.cx + b.hw, bottom = b.cy + b.hh;
        uiCtx.fillStyle = 'rgba(0,0,0,0.45)';
        uiCtx.fillRect(0, 0, W, top);
        uiCtx.fillRect(0, bottom, W, H - bottom);
        uiCtx.fillRect(0, top, left, b.hh * 2);
        uiCtx.fillRect(right, top, W - right, b.hh * 2);
        uiCtx.strokeStyle = 'rgba(255,255,255,0.85)'; uiCtx.lineWidth = 1.5; uiCtx.setLineDash([4, 4]);
        uiCtx.strokeRect(left, top, b.hw * 2, b.hh * 2);
        uiCtx.setLineDash([]);
        return;
    }

    if (p.vpShape === 'rectangle') {
        const hw = (p.vpW / 200) * W;
        const hh = (p.vpH / 200) * H;
        const left = cx - hw, top = cy - hh, right = cx + hw, bottom = cy + hh;

        uiCtx.fillStyle = 'rgba(0,0,0,0.45)';
        uiCtx.fillRect(0, 0, W, top);
        uiCtx.fillRect(0, bottom, W, H - bottom);
        uiCtx.fillRect(0, top, left, hh * 2);
        uiCtx.fillRect(right, top, W - right, hh * 2);

        uiCtx.strokeStyle = 'rgba(255,255,255,0.85)';
        uiCtx.lineWidth   = 1.5;
        uiCtx.setLineDash([]);
        uiCtx.strokeRect(left, top, hw * 2, hh * 2);

        drawCornerHandle(left,  top);
        drawCornerHandle(right, top);
        drawCornerHandle(right, bottom);
        drawCornerHandle(left,  bottom);

    } else if (p.vpShape === 'ellipse') {
        const rx = (p.vpW / 200) * W;
        const ry = (p.vpH / 200) * H;

        uiCtx.save();
        uiCtx.fillStyle = 'rgba(0,0,0,0.45)';
        uiCtx.fillRect(0, 0, W, H);
        uiCtx.globalCompositeOperation = 'destination-out';
        uiCtx.beginPath();
        uiCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        uiCtx.fill();
        uiCtx.restore();

        uiCtx.strokeStyle = 'rgba(255,255,255,0.85)';
        uiCtx.lineWidth   = 1.5;
        uiCtx.setLineDash([]);
        uiCtx.beginPath();
        uiCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        uiCtx.stroke();

        drawCornerHandle(cx + rx, cy);
        drawCornerHandle(cx, cy + ry);

    } else {
        const verts = vpVertexScreenPositions(p);

        uiCtx.save();
        uiCtx.fillStyle = 'rgba(0,0,0,0.45)';
        uiCtx.fillRect(0, 0, W, H);
        uiCtx.globalCompositeOperation = 'destination-out';
        uiCtx.beginPath();
        if (verts.length > 0) {
            uiCtx.moveTo(verts[0][0], verts[0][1]);
            for (let i = 1; i < verts.length; i++) uiCtx.lineTo(verts[i][0], verts[i][1]);
            uiCtx.closePath();
        }
        uiCtx.fill();
        uiCtx.restore();

        uiCtx.strokeStyle = 'rgba(255,255,255,0.85)';
        uiCtx.lineWidth   = 1.5;
        uiCtx.setLineDash([]);
        uiCtx.beginPath();
        if (verts.length > 0) {
            uiCtx.moveTo(verts[0][0], verts[0][1]);
            for (let i = 1; i < verts.length; i++) uiCtx.lineTo(verts[i][0], verts[i][1]);
            uiCtx.closePath();
        }
        uiCtx.stroke();

        for (const [vx, vy] of verts) drawCornerHandle(vx, vy);
    }
}

export function hitTestViewport(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const p  = inst.params;

    // Text: no handles — clicking anywhere on the glyph bbox moves it.
    if (p.vpShape === 'text') {
        const b = vpTextBox(p);
        return (Math.abs(mx - b.cx) <= b.hw && Math.abs(my - b.cy) <= b.hh) ? 'center' : null;
    }

    const { cx, cy, W, H } = vpCenter(p);

    // Discrete resize handles win; then clicking anywhere inside the shape moves it.
    if (p.vpShape === 'rectangle') {
        const hw = (p.vpW / 200) * W;
        const hh = (p.vpH / 200) * H;
        const corners = {
            tl: [cx - hw, cy - hh],
            tr: [cx + hw, cy - hh],
            br: [cx + hw, cy + hh],
            bl: [cx - hw, cy + hh],
        };
        for (const [name, [hx, hy]] of Object.entries(corners)) {
            if (Math.hypot(mx - hx, my - hy) <= HIT_RADIUS) return name;
        }
        if (Math.abs(mx - cx) <= hw && Math.abs(my - cy) <= hh) return 'center';
    } else if (p.vpShape === 'ellipse') {
        const rx = (p.vpW / 200) * W;
        const ry = (p.vpH / 200) * H;
        if (Math.hypot(mx - (cx + rx), my - cy) <= HIT_RADIUS) return 'edgeR';
        if (Math.hypot(mx - cx, my - (cy + ry)) <= HIT_RADIUS) return 'edgeB';
        if (((mx - cx) / rx) ** 2 + ((my - cy) / ry) ** 2 <= 1) return 'center';
    } else {
        const verts = vpVertexScreenPositions(p);
        for (let i = 0; i < verts.length; i++) {
            if (Math.hypot(mx - verts[i][0], my - verts[i][1]) <= HIT_RADIUS) return `v${i}`;
        }
        if (pointInScreenPoly(mx, my, verts)) return 'center';
    }
    return null;
}

export function onDragViewport(e, inst, rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W  = uiOverlay.width, H = uiOverlay.height;
    const p  = inst.params;

    if (state.handle === 'center') {
        // Grab anywhere inside the shape and drag it with a grab offset so it doesn't
        // jump under the cursor.
        const cx = (0.5 + p.vpX / 100) * W;
        const cy = (0.5 - p.vpY / 100) * H;
        const [tx, ty] = applyGrab(cx, cy, mx, my);
        setInstanceParam(state.instId, 'vpX', Math.round(Math.max(-50, Math.min(50,  (tx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'vpY', Math.round(Math.max(-50, Math.min(50, -(ty / H - 0.5) * 100))));
    } else if (state.handle === 'tl' || state.handle === 'tr' || state.handle === 'br' || state.handle === 'bl') {
        const cx = (0.5 + p.vpX / 100) * W;
        const cy = (0.5 - p.vpY / 100) * H;
        setInstanceParam(state.instId, 'vpW', Math.round(Math.max(1, Math.min(100, Math.abs(mx - cx) * 2 / W * 100))));
        setInstanceParam(state.instId, 'vpH', Math.round(Math.max(1, Math.min(100, Math.abs(my - cy) * 2 / H * 100))));
    } else if (state.handle === 'edgeR') {
        const cx = (0.5 + p.vpX / 100) * W;
        setInstanceParam(state.instId, 'vpW', Math.round(Math.max(1, Math.min(100, Math.abs(mx - cx) * 2 / W * 100))));
    } else if (state.handle === 'edgeB') {
        const cy = (0.5 - p.vpY / 100) * H;
        setInstanceParam(state.instId, 'vpH', Math.round(Math.max(1, Math.min(100, Math.abs(my - cy) * 2 / H * 100))));
    } else if (state.handle && state.handle.startsWith('v')) {
        const idx = parseInt(state.handle.slice(1), 10);
        const ox = Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100)) - p.vpX);
        const oy = Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100)) - p.vpY);
        setInstanceParam(state.instId, `vpV${idx}x`, Math.max(-50, Math.min(50, ox)));
        setInstanceParam(state.instId, `vpV${idx}y`, Math.max(-50, Math.min(50, oy)));
    }
}
