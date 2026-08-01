import { canvas } from '../../renderer/glstate.js';
import { getStack, setInstanceParam } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawHandle, drawRotHandle, drawCornerHandle, HIT_RADIUS, isInsideFadeShape, applyGrab } from '../overlayUtils.js';

function ssVertexScreenPositions(p) {
    const W = uiOverlay.width, H = uiOverlay.height;
    const cx = (0.5 + p.shapeStickerX / 100) * W;
    const cy = (0.5 - p.shapeStickerY / 100) * H;
    const sw = (p.shapeStickerW / 100) * W;
    const sh = (p.shapeStickerH / 100) * H;
    const angle = (p.shapeStickerAngle ?? 0) * Math.PI / 180;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const shape = p.shapeStickerShape || 'rectangle';
    const sides = Math.max(3, Math.min(24, Math.round(p.shapeStickerSides || 6)));
    const n = shape === 'triangle' ? 3 : (shape === 'polygon' ? sides : 0);
    if (n === 0) return [];
    const allZero = Array.from({ length: n }, (_, i) =>
        (p[`shapeStickerV${i}x`] ?? 0) === 0 && (p[`shapeStickerV${i}y`] ?? 0) === 0
    ).every(Boolean);
    const verts = [];
    for (let i = 0; i < n; i++) {
        let lx, ly;
        if (allZero) {
            const a = -Math.PI / 2 + i * (2 * Math.PI / n);
            lx = Math.cos(a) * sw / 2;
            ly = Math.sin(a) * sh / 2;
        } else {
            lx = (p[`shapeStickerV${i}x`] ?? 0) / 100 * W;
            ly = -(p[`shapeStickerV${i}y`] ?? 0) / 100 * H;
        }
        verts.push([cx + lx * cosA - ly * sinA, cy + lx * sinA + ly * cosA]);
    }
    return verts;
}

function ssGrabHandles(p) {
    const W = uiOverlay.width, H = uiOverlay.height;
    const cx = (0.5 + (p.shapeStickerGrabX ?? 30) / 100) * W;
    const cy = (0.5 - (p.shapeStickerGrabY ?? 30) / 100) * H;
    const gw = (p.shapeStickerGrabW ?? 20) / 100 * W;
    const gh = (p.shapeStickerGrabH ?? 20) / 100 * H;
    const angle = (p.shapeStickerGrabAngle ?? 0) * Math.PI / 180;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const handle = (lx, ly) => [cx + lx * cosA - ly * sinA, cy + lx * sinA + ly * cosA];
    return {
        center: [cx, cy],
        rot: handle(0, -(Math.min(Math.max(gh, gw) / 2, Math.hypot(W, H) / 2) + 22)),
        tl: handle(-gw / 2, -gh / 2),
        tr: handle(gw / 2, -gh / 2),
        br: handle(gw / 2, gh / 2),
        bl: handle(-gw / 2, gh / 2),
    };
}

export function resetShapeStickerVertices(instId, shape, p) {
    const n = shape === 'triangle' ? 3 : Math.max(3, Math.min(24, Math.round(p.shapeStickerSides || 6)));
    const startAngle = -Math.PI / 2;
    for (let i = 0; i < 24; i++) {
        const a  = startAngle + i * (2 * Math.PI / n);
        const vx = i < n ? Math.round(Math.cos(a) * p.shapeStickerW / 2 * 100) / 100 : 0;
        const vy = i < n ? Math.round(-Math.sin(a) * p.shapeStickerH / 2 * 100) / 100 : 0;
        setInstanceParam(instId, `shapeStickerV${i}x`, vx);
        setInstanceParam(instId, `shapeStickerV${i}y`, vy);
    }
    const inst = getStack().find(i => i.id === instId);
    if (inst) drawShapeSticker(inst.params);
}

export function drawShapeSticker(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);

    const cx = (0.5 + p.shapeStickerX / 100) * W;
    const cy = (0.5 - p.shapeStickerY / 100) * H;
    const sw = Math.max(1, (p.shapeStickerW / 100) * W);
    const sh = Math.max(1, (p.shapeStickerH / 100) * H);
    const angle = (p.shapeStickerAngle ?? 0) * Math.PI / 180;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const shape = p.shapeStickerShape || 'rectangle';
    const sides = Math.max(3, Math.min(24, Math.round(p.shapeStickerSides || 6)));

    const localVerts = [];
    const n = shape === 'rectangle' ? 4 : shape === 'ellipse' ? 0 : (shape === 'triangle' ? 3 : sides);

    if (shape === 'rectangle') {
        localVerts.push({ x: -sw/2, y:  sh/2 });
        localVerts.push({ x:  sw/2, y:  sh/2 });
        localVerts.push({ x:  sw/2, y: -sh/2 });
        localVerts.push({ x: -sw/2, y: -sh/2 });
    } else if (shape !== 'ellipse') {
        const allZero = Array.from({ length: n }, (_, i) =>
            (p[`shapeStickerV${i}x`] ?? 0) === 0 && (p[`shapeStickerV${i}y`] ?? 0) === 0
        ).every(Boolean);
        for (let i = 0; i < n; i++) {
            if (allZero) {
                const a = -Math.PI / 2 + i * (2 * Math.PI / n);
                localVerts.push({ x: Math.cos(a) * sw / 2, y: Math.sin(a) * sh / 2 });
            } else {
                localVerts.push({
                    x: (p[`shapeStickerV${i}x`] ?? 0) / 100 * W,
                    y: (p[`shapeStickerV${i}y`] ?? 0) / 100 * H,
                });
            }
        }
    }

    let shapeRadius = Math.hypot(sw/2, sh/2);
    for (const v of localVerts) shapeRadius = Math.max(shapeRadius, Math.hypot(v.x, v.y));
    const rotDist = Math.min(shapeRadius, Math.hypot(W, H) / 2) + 18;
    const rotHandle = [
        cx + 0 * cosA - (-rotDist) * sinA,
        cy + 0 * sinA + (-rotDist) * cosA,
    ];

    uiCtx.save();
    uiCtx.translate(cx, cy);
    uiCtx.rotate(angle);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.85)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.setLineDash([]);

    if (shape === 'rectangle') {
        uiCtx.beginPath();
        for (let i = 0; i < localVerts.length; i++) {
            const vx = localVerts[i].x, vy = -localVerts[i].y;
            i === 0 ? uiCtx.moveTo(vx, vy) : uiCtx.lineTo(vx, vy);
        }
        uiCtx.closePath();
        uiCtx.stroke();
        uiCtx.restore();
        for (const v of localVerts) {
            drawCornerHandle(cx + v.x * cosA - (-v.y) * sinA, cy + v.x * sinA + (-v.y) * cosA);
        }
    } else if (shape === 'ellipse') {
        uiCtx.beginPath();
        uiCtx.ellipse(0, 0, sw/2, sh/2, 0, 0, Math.PI * 2);
        uiCtx.stroke();
        uiCtx.restore();
        drawCornerHandle(cx + (sw/2) * cosA, cy + (sw/2) * sinA);
        drawCornerHandle(cx + 0 * cosA - (sh/2) * sinA, cy + 0 * sinA + (sh/2) * cosA);
    } else {
        uiCtx.beginPath();
        for (let i = 0; i < localVerts.length; i++) {
            const vx = localVerts[i].x, vy = -localVerts[i].y;
            i === 0 ? uiCtx.moveTo(vx, vy) : uiCtx.lineTo(vx, vy);
        }
        uiCtx.closePath();
        uiCtx.stroke();
        uiCtx.restore();
        for (const v of localVerts) {
            drawCornerHandle(cx + v.x * cosA - (-v.y) * sinA, cy + v.x * sinA + (-v.y) * cosA);
        }
    }

    drawRotHandle(rotHandle[0], rotHandle[1]);
    drawHandle(cx, cy);

    if (p.shapeStickerFillType === 'image-grab') {
        const gcx  = (0.5 + (p.shapeStickerGrabX ?? 30) / 100) * W;
        const gcy  = (0.5 - (p.shapeStickerGrabY ?? 30) / 100) * H;
        const gwPx = Math.max(1, (p.shapeStickerGrabW ?? 20) / 100 * W);
        const ghPx = Math.max(1, (p.shapeStickerGrabH ?? 20) / 100 * H);
        const gAngle = (p.shapeStickerGrabAngle ?? 0) * Math.PI / 180;
        const gHandles = ssGrabHandles(p);

        uiCtx.save();
        uiCtx.translate(gcx, gcy);
        uiCtx.rotate(gAngle);
        uiCtx.strokeStyle = 'rgba(255,220,0,0.7)';
        uiCtx.lineWidth   = 1.5;
        uiCtx.setLineDash([3, 3]);
        uiCtx.strokeRect(-gwPx / 2, -ghPx / 2, gwPx, ghPx);
        uiCtx.setLineDash([]);
        uiCtx.restore();

        const cosG = Math.cos(gAngle), sinG = Math.sin(gAngle);
        const topCx = gcx + (ghPx / 2) * sinG;
        const topCy = gcy - (ghPx / 2) * cosG;
        uiCtx.beginPath();
        uiCtx.moveTo(topCx, topCy);
        uiCtx.lineTo(gHandles.rot[0], gHandles.rot[1]);
        uiCtx.strokeStyle = 'rgba(255,220,0,0.4)';
        uiCtx.lineWidth   = 1;
        uiCtx.stroke();

        const drawYelCircle = (hx, hy) => {
            uiCtx.beginPath();
            uiCtx.arc(hx, hy, 6, 0, Math.PI * 2);
            uiCtx.fillStyle   = 'rgba(255,220,0,0.92)';
            uiCtx.shadowColor = 'rgba(0,0,0,0.55)';
            uiCtx.shadowBlur  = 4;
            uiCtx.fill();
            uiCtx.shadowBlur  = 0;
            uiCtx.strokeStyle = 'rgba(0,0,0,0.4)';
            uiCtx.lineWidth   = 1.5;
            uiCtx.stroke();
        };
        const drawYelSquare = (hx, hy) => {
            const s = 5;
            uiCtx.save();
            uiCtx.translate(hx, hy);
            uiCtx.shadowColor = 'rgba(0,0,0,0.55)';
            uiCtx.shadowBlur  = 4;
            uiCtx.fillStyle   = 'rgba(255,220,0,0.92)';
            uiCtx.fillRect(-s, -s, s * 2, s * 2);
            uiCtx.shadowBlur  = 0;
            uiCtx.strokeStyle = 'rgba(0,0,0,0.4)';
            uiCtx.lineWidth   = 1.5;
            uiCtx.strokeRect(-s, -s, s * 2, s * 2);
            uiCtx.restore();
        };

        drawYelCircle(gHandles.center[0], gHandles.center[1]);
        drawYelSquare(gHandles.tl[0],     gHandles.tl[1]);
        drawYelSquare(gHandles.tr[0],     gHandles.tr[1]);
        drawYelSquare(gHandles.br[0],     gHandles.br[1]);
        drawYelSquare(gHandles.bl[0],     gHandles.bl[1]);
        drawYelCircle(gHandles.rot[0],    gHandles.rot[1]);
    }

    if (p[state.enabledKey]) {
        const shape  = p[state.shapeKey] ?? 'ellipse';
        const fAngle = (p[state.angleKey] ?? 0) * Math.PI / 180;
        const cosA   = Math.cos(fAngle), sinA = Math.sin(fAngle);
        const fcx    = (0.5 + p.shapeStickerFadeX / 100) * W;
        const fcy    = (0.5 - p.shapeStickerFadeY / 100) * H;
        const rotPt  = (lx, ly) => [fcx + lx * cosA - ly * sinA, fcy + lx * sinA + ly * cosA];

        uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
        uiCtx.lineWidth   = 1.5;
        uiCtx.setLineDash([5, 5]);

        let fadeEdgeW, fadeEdgeH, fadeRotHandle, topEdge;
        if (shape === 'ellipse') {
            const a = (p[state.wKey] / 100) * W / 2;
            const b = (p[state.hKey] / 100) * H / 2;
            uiCtx.beginPath();
            uiCtx.ellipse(fcx, fcy, Math.max(1, a), Math.max(1, b), fAngle, 0, Math.PI * 2);
            uiCtx.stroke();
            fadeEdgeW     = rotPt(a, 0);
            fadeEdgeH     = rotPt(0, -b);
            topEdge       = fadeEdgeH;
            fadeRotHandle = rotPt(0, -(b + 22));
        } else {
            const hw = (p[state.wKey] / 100) * W / 2;
            const hh = (p[state.hKey] / 100) * H / 2;
            uiCtx.save();
            uiCtx.translate(fcx, fcy);
            uiCtx.rotate(fAngle);
            uiCtx.beginPath();
            uiCtx.rect(-hw, -hh, hw * 2, hh * 2);
            uiCtx.stroke();
            uiCtx.restore();
            fadeEdgeW     = rotPt(hw, 0);
            fadeEdgeH     = rotPt(0, -hh);
            topEdge       = fadeEdgeH;
            fadeRotHandle = rotPt(0, -(hh + 22));
        }

        uiCtx.setLineDash([]);
        uiCtx.beginPath();
        uiCtx.moveTo(topEdge[0], topEdge[1]);
        uiCtx.lineTo(fadeRotHandle[0], fadeRotHandle[1]);
        uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
        uiCtx.lineWidth   = 1;
        uiCtx.stroke();

        drawCornerHandle(fadeEdgeW[0], fadeEdgeW[1]);
        drawCornerHandle(fadeEdgeH[0], fadeEdgeH[1]);
        drawRotHandle(fadeRotHandle[0], fadeRotHandle[1]);
    }
}

export function hitTestShapeSticker(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const p = inst.params;
    const W = uiOverlay.width, H = uiOverlay.height;

    const cx = (0.5 + p.shapeStickerX / 100) * W;
    const cy = (0.5 - p.shapeStickerY / 100) * H;
    if (Math.hypot(mx - cx, my - cy) <= HIT_RADIUS) return 'center';

    const angle = (p.shapeStickerAngle ?? 0) * Math.PI / 180;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const sw = (p.shapeStickerW / 100) * W;
    const sh = (p.shapeStickerH / 100) * H;
    const shape = p.shapeStickerShape || 'rectangle';
    const sides = Math.max(3, Math.min(24, Math.round(p.shapeStickerSides || 6)));
    const n = shape === 'triangle' ? 3 : (shape === 'polygon' ? sides : 0);

    let localVerts = [];
    if (shape === 'rectangle' || shape === 'ellipse') {
        localVerts = [{x:-sw/2, y:-sh/2}, {x:sw/2, y:-sh/2}, {x:sw/2, y:sh/2}, {x:-sw/2, y:sh/2}];
    } else if (n > 0) {
        const allZero = Array.from({ length: n }, (_, i) =>
            (p[`shapeStickerV${i}x`] ?? 0) === 0 && (p[`shapeStickerV${i}y`] ?? 0) === 0
        ).every(Boolean);
        for (let i = 0; i < n; i++) {
            if (allZero) {
                const a = -Math.PI / 2 + i * (2 * Math.PI / n);
                localVerts.push({ x: Math.cos(a) * sw / 2, y: Math.sin(a) * sh / 2 });
            } else {
                localVerts.push({
                    x: (p[`shapeStickerV${i}x`] ?? 0) / 100 * W,
                    y: (p[`shapeStickerV${i}y`] ?? 0) / 100 * H,
                });
            }
        }
    }

    let shapeRadius = Math.hypot(sw/2, sh/2);
    for (const v of localVerts) shapeRadius = Math.max(shapeRadius, Math.hypot(v.x, v.y));
    const rotDist = Math.min(shapeRadius, Math.hypot(W, H) / 2) + 18;
    const rotH = [cx + 0 * cosA - (-rotDist) * sinA, cy + 0 * sinA + (-rotDist) * cosA];
    if (Math.hypot(mx - rotH[0], my - rotH[1]) <= HIT_RADIUS) return 'rot';

    const screenVerts = localVerts.map(v => [
        cx + v.x * cosA - (-v.y) * sinA,
        cy + v.x * sinA + (-v.y) * cosA,
    ]);

    if (shape === 'rectangle') {
        const corners = { tr: screenVerts[1], br: screenVerts[2], bl: screenVerts[3], tl: screenVerts[0] };
        for (const [name, [hx, hy]] of Object.entries(corners)) {
            if (Math.hypot(mx - hx, my - hy) <= HIT_RADIUS) return name;
        }
    } else if (shape === 'ellipse') {
        const rightH = [cx + (sw / 2) * cosA, cy + (sw / 2) * sinA];
        const botH   = [cx - (sh / 2) * sinA, cy + (sh / 2) * cosA];
        if (Math.hypot(mx - rightH[0], my - rightH[1]) <= HIT_RADIUS) return 'edgeW';
        if (Math.hypot(mx - botH[0],   my - botH[1])   <= HIT_RADIUS) return 'edgeH';
    } else {
        for (let i = 0; i < screenVerts.length; i++) {
            if (Math.hypot(mx - screenVerts[i][0], my - screenVerts[i][1]) <= HIT_RADIUS) return `v${i}`;
        }
    }

    if (p.shapeStickerFillType === 'image-grab') {
        const gh = ssGrabHandles(p);
        if (Math.hypot(mx - gh.center[0], my - gh.center[1]) <= HIT_RADIUS) return 'grab_center';
        if (Math.hypot(mx - gh.rot[0],    my - gh.rot[1])    <= HIT_RADIUS) return 'grab_rot';
        for (const [name, pos] of [['grab_tl', gh.tl], ['grab_tr', gh.tr], ['grab_br', gh.br], ['grab_bl', gh.bl]]) {
            if (Math.hypot(mx - pos[0], my - pos[1]) <= HIT_RADIUS) return name;
        }
    }

    if (p[state.enabledKey]) {
        const fAngle  = (p[state.angleKey] ?? 0) * Math.PI / 180;
        const cosA    = Math.cos(fAngle), sinA = Math.sin(fAngle);
        const fcx     = (0.5 + p.shapeStickerFadeX / 100) * W;
        const fcy     = (0.5 - p.shapeStickerFadeY / 100) * H;
        const rotPt   = (lx, ly) => [fcx + lx * cosA - ly * sinA, fcy + lx * sinA + ly * cosA];
        const fshape  = p[state.shapeKey] ?? 'ellipse';
        const fa = (p[state.wKey] / 100) * W / 2;
        const fb = (p[state.hKey] / 100) * H / 2;
        let fadeEdgeW, fadeEdgeH, fadeRotHandle;
        if (fshape === 'ellipse') {
            fadeEdgeW     = rotPt(fa, 0);
            fadeEdgeH     = rotPt(0, -fb);
            fadeRotHandle = rotPt(0, -(fb + 22));
        } else {
            fadeEdgeW     = rotPt(fa, 0);
            fadeEdgeH     = rotPt(0, -fb);
            fadeRotHandle = rotPt(0, -(fb + 22));
        }
        if (Math.hypot(mx - fadeRotHandle[0], my - fadeRotHandle[1]) <= HIT_RADIUS) return 'fadeRot';
        if (Math.hypot(mx - fadeEdgeW[0],     my - fadeEdgeW[1])     <= HIT_RADIUS) return 'fadeEdgeW';
        if (Math.hypot(mx - fadeEdgeH[0],     my - fadeEdgeH[1])     <= HIT_RADIUS) return 'fadeEdgeH';
        if (isInsideFadeShape(mx, my, fcx, fcy, fa, fb, fAngle, fshape !== 'ellipse')) return 'fadeCenter';
    }
    return null;
}

export function onDragShapeSticker(e, inst, rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W  = uiOverlay.width, H = uiOverlay.height;
    const p   = inst.params;
    const cx  = (0.5 + p.shapeStickerX / 100) * W;
    const cy  = (0.5 - p.shapeStickerY / 100) * H;
    const angle = (p.shapeStickerAngle ?? 0) * Math.PI / 180;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);

    if (state.handle === 'center') {
        const [gx, gy] = applyGrab(cx, cy, mx, my);
        setInstanceParam(state.instId, 'shapeStickerX', Math.round(Math.max(-50, Math.min(50, (gx / W - 0.5) * 100)) * 100) / 100);
        setInstanceParam(state.instId, 'shapeStickerY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100)) * 100) / 100);
    } else if (state.handle === 'rot') {
        let deg = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;
        if (deg > 180)  deg -= 360;
        if (deg < -180) deg += 360;
        setInstanceParam(state.instId, 'shapeStickerAngle', Math.round(deg));
    } else if (state.handle === 'grab_center') {
        const gcx = (0.5 + p.shapeStickerGrabX / 100) * W, gcy = (0.5 - p.shapeStickerGrabY / 100) * H;
        const [gx, gy] = applyGrab(gcx, gcy, mx, my);
        setInstanceParam(state.instId, 'shapeStickerGrabX', Math.round(Math.max(-50, Math.min(50, (gx / W - 0.5) * 100)) * 100) / 100);
        setInstanceParam(state.instId, 'shapeStickerGrabY', Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100)) * 100) / 100);
    } else if (state.handle === 'grab_rot') {
        const gcx = (0.5 + (p.shapeStickerGrabX ?? 30) / 100) * W;
        const gcy = (0.5 - (p.shapeStickerGrabY ?? 30) / 100) * H;
        let deg = Math.atan2(my - gcy, mx - gcx) * 180 / Math.PI + 90;
        if (deg > 180)  deg -= 360;
        if (deg < -180) deg += 360;
        setInstanceParam(state.instId, 'shapeStickerGrabAngle', Math.round(deg));
    } else if (state.handle === 'grab_tl' || state.handle === 'grab_tr' || state.handle === 'grab_br' || state.handle === 'grab_bl') {
        const gcx = (0.5 + (p.shapeStickerGrabX ?? 30) / 100) * W;
        const gcy = (0.5 - (p.shapeStickerGrabY ?? 30) / 100) * H;
        const gAngle = (p.shapeStickerGrabAngle ?? 0) * Math.PI / 180;
        const gcosA = Math.cos(gAngle), gsinA = Math.sin(gAngle);
        const dx  = mx - gcx, dy = my - gcy;
        const lx  =  dx * gcosA + dy * gsinA;
        const ly  = -dx * gsinA + dy * gcosA;
        setInstanceParam(state.instId, 'shapeStickerGrabW', Math.round(Math.max(1, Math.min(100, Math.abs(lx) * 2 / W * 100))));
        setInstanceParam(state.instId, 'shapeStickerGrabH', Math.round(Math.max(1, Math.min(100, Math.abs(ly) * 2 / H * 100))));
    } else if (state.handle && state.handle.startsWith('v')) {
        const idx = parseInt(state.handle.slice(1), 10);
        const dx  = mx - cx, dy = my - cy;
        const lx  =  dx * cosA + dy * sinA;
        const ly  = -dx * sinA + dy * cosA;
        setInstanceParam(state.instId, `shapeStickerV${idx}x`, Math.round(Math.max(-150, Math.min(150, lx / W * 100)) * 100) / 100);
        setInstanceParam(state.instId, `shapeStickerV${idx}y`, Math.round(Math.max(-150, Math.min(150, -ly / H * 100)) * 100) / 100);
    } else if (state.handle === 'edgeW') {
        const lx = (mx - cx) * cosA + (my - cy) * sinA;
        setInstanceParam(state.instId, 'shapeStickerW', Math.round(Math.max(1, Math.min(300,Math.abs(lx) * 2 / W * 100))));
    } else if (state.handle === 'edgeH') {
        const ly = -(mx - cx) * sinA + (my - cy) * cosA;
        setInstanceParam(state.instId, 'shapeStickerH', Math.round(Math.max(1, Math.min(300,Math.abs(ly) * 2 / H * 100))));
    } else if (state.handle === 'fadeCenter') {
        setInstanceParam(state.instId, 'shapeStickerFadeX', Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100))));
        setInstanceParam(state.instId, 'shapeStickerFadeY', Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100))));
    } else if (state.handle === 'fadeEdgeW') {
        const fcx = (0.5 + p.shapeStickerFadeX / 100) * W;
        setInstanceParam(state.instId, state.wKey, Math.round(Math.max(1, Math.min(200, Math.abs(mx - fcx) / (W / 2) * 100))));
    } else if (state.handle === 'fadeEdgeH') {
        const fcy = (0.5 - p.shapeStickerFadeY / 100) * H;
        setInstanceParam(state.instId, state.hKey, Math.round(Math.max(1, Math.min(200, Math.abs(my - fcy) / (H / 2) * 100))));
    } else if (state.handle === 'fadeRot') {
        const fcx = (0.5 + p.shapeStickerFadeX / 100) * W;
        const fcy = (0.5 - p.shapeStickerFadeY / 100) * H;
        let deg = Math.atan2(my - fcy, mx - fcx) * 180 / Math.PI + 90;
        if (deg > 180)  deg -= 360;
        if (deg < -180) deg += 360;
        setInstanceParam(state.instId, state.angleKey, Math.round(deg));
    } else {
        const lx = (mx - cx) * cosA + (my - cy) * sinA;
        const ly = -(mx - cx) * sinA + (my - cy) * cosA;
        setInstanceParam(state.instId, 'shapeStickerW', Math.round(Math.max(1, Math.min(300,Math.abs(lx) * 2 / W * 100))));
        setInstanceParam(state.instId, 'shapeStickerH', Math.round(Math.max(1, Math.min(300,Math.abs(ly) * 2 / H * 100))));
    }
}
