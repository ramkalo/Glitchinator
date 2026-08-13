import { canvas } from '../../renderer/glstate.js';
import {
    blendMapPosX, blendMapPosY, blendMapRot, blendMapZoom,
    setBlendMapPosX, setBlendMapPosY, setBlendMapRot, setBlendMapZoom,
} from '../../renderer/glstate.js';
import { processImageImmediate } from '../../renderer/pipeline.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, drawRotHandle, drawCornerHandle, drawHubHandle, HUB_R, HIT_RADIUS } from '../overlayUtils.js';

const BASE_ARM = 70; // px at zoom=100

function _positions() {
    const W = uiOverlay.width, H = uiOverlay.height;
    const cx = (0.5 + blendMapPosX / 100) * W;
    const cy = (0.5 - blendMapPosY / 100) * H;
    const rad = blendMapRot * Math.PI / 180;
    const cosR = Math.cos(rad), sinR = Math.sin(rad);
    // Rotation handle: BASE_ARM px along rotation direction (up when rot=0)
    const rotHx = cx + BASE_ARM * sinR;
    const rotHy = cy - BASE_ARM * cosR;
    // Scale handle: perpendicular (right when rot=0), distance proportional to zoom
    const scaleDist = Math.max(20, BASE_ARM * blendMapZoom / 100);
    const scaleHx = cx + scaleDist * cosR;
    const scaleHy = cy + scaleDist * sinR;
    return { cx, cy, rotHx, rotHy, scaleHx, scaleHy, W, H };
}

export function drawBlendMap() {
    syncSize();
    uiCtx.clearRect(0, 0, uiOverlay.width, uiOverlay.height);

    const { cx, cy, rotHx, rotHy, scaleHx, scaleHy } = _positions();

    // Arms
    uiCtx.lineWidth   = 1;
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.setLineDash([4, 4]);
    uiCtx.beginPath();
    uiCtx.moveTo(cx, cy); uiCtx.lineTo(rotHx, rotHy);
    uiCtx.moveTo(cx, cy); uiCtx.lineTo(scaleHx, scaleHy);
    uiCtx.stroke();
    uiCtx.setLineDash([]);

    // Handles
    drawRotHandle(rotHx, rotHy);
    drawCornerHandle(scaleHx, scaleHy);

    // Center hub (position) — dashed circle, grab it to move the whole map
    drawHubHandle(cx, cy);
}

export function hitTestBlendMap(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { cx, cy, rotHx, rotHy, scaleHx, scaleHy } = _positions();

    if (Math.hypot(mx - cx,     my - cy)     <= HUB_R)      return 'center';
    if (Math.hypot(mx - rotHx,  my - rotHy)  <= HIT_RADIUS) return 'rot';
    if (Math.hypot(mx - scaleHx, my - scaleHy) <= HIT_RADIUS) return 'scale';
    return null;
}

export function onDragBlendMap(e, _inst, rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { cx, cy, W, H } = _positions();

    if (state.handle === 'center') {
        setBlendMapPosX(Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100))));
        setBlendMapPosY(Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100))));
    } else if (state.handle === 'rot') {
        let deg = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;
        if (deg >  180) deg -= 360;
        if (deg < -180) deg += 360;
        setBlendMapRot(Math.round(deg));
    } else if (state.handle === 'scale') {
        const dist = Math.hypot(mx - cx, my - cy);
        setBlendMapZoom(Math.max(10, Math.min(500, Math.round((dist / BASE_ARM) * 100))));
    }

    processImageImmediate();
    drawBlendMap();
}
