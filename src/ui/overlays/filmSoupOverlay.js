import { canvas } from '../../renderer/glstate.js';
import { setInstanceParam, getStack } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize, HIT_RADIUS, HUB_R, drawHandle, drawHubHandle } from '../overlayUtils.js';

const MAX_BUBBLES = 256;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function isEditable(p) {
    return (p.filmSoupPlace ?? 'generated') === 'manual';
}

// Global center offset (percent, -50..50) applied to every bubble.
function centerPct(p) {
    return {
        cx: typeof p.filmSoupCenterX === 'number' ? p.filmSoupCenterX : 0,
        cy: typeof p.filmSoupCenterY === 'number' ? p.filmSoupCenterY : 0,
    };
}

function parseBubbles(p) {
    try {
        const a = JSON.parse(p.filmSoupBubbles || '[]');
        return Array.isArray(a) ? a : [];
    } catch { return []; }
}

function writeBubbles(instId, bubbles) {
    setInstanceParam(instId, 'filmSoupBubbles', JSON.stringify(bubbles));
}

// Radius (fraction of image height) from the live Size / Size Deviation sliders and the
// bubble's own deviation factor — matches the shader's build math.
function bubbleRadiusFrac(p, b) {
    const size = typeof p.filmSoupSize    === 'number' ? p.filmSoupSize    : 14;
    const dev  = typeof p.filmSoupSizeDev === 'number' ? p.filmSoupSizeDev : 30;
    const s    = typeof b.s === 'number' ? b.s : 0;
    return Math.max(0.002, (size / 100) * 0.5 * (1 + s * dev / 100));
}

// Draw the center-point hub — dashed circle, grab it to move all bubbles together.
function drawCenterHandle(px, py) {
    drawHubHandle(px, py);
}

export function drawFilmSoup(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);
    const { cx, cy } = centerPct(p);

    if (isEditable(p)) {
        const bubbles = parseBubbles(p);
        uiCtx.strokeStyle = 'rgba(120, 220, 255, 0.85)';
        uiCtx.lineWidth = 1.5;
        for (const b of bubbles) {
            const px = ((b.x ?? 50) + cx) / 100 * W;
            const py = ((b.y ?? 50) + cy) / 100 * H;
            const rad = Math.max(3, bubbleRadiusFrac(p, b) * H);
            uiCtx.beginPath();
            uiCtx.arc(px, py, rad, 0, Math.PI * 2);
            uiCtx.stroke();
        }
        for (const b of bubbles) {
            drawHandle(((b.x ?? 50) + cx) / 100 * W, ((b.y ?? 50) + cy) / 100 * H);
        }
    }

    // Center handle is always available (shifts generated + manual bubbles together).
    drawCenterHandle((0.5 + cx / 100) * W, (0.5 + cy / 100) * H);
}

export function hitTestFilmSoup(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const p = inst.params;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = uiOverlay.width, H = uiOverlay.height;
    const { cx, cy } = centerPct(p);

    // Bubble handles take priority over the center handle when overlapping.
    if (isEditable(p)) {
        const bubbles = parseBubbles(p);
        for (let k = 0; k < bubbles.length; k++) {
            const px = ((bubbles[k].x ?? 50) + cx) / 100 * W;
            const py = ((bubbles[k].y ?? 50) + cy) / 100 * H;
            if (Math.hypot(mx - px, my - py) <= HIT_RADIUS) return `bubble:${k}`;
        }
    }

    const hx = (0.5 + cx / 100) * W;
    const hy = (0.5 + cy / 100) * H;
    if (Math.hypot(mx - hx, my - hy) <= HUB_R) return 'center';

    return null;
}

export function onDragFilmSoup(e, inst, rect) {
    const h = state.handle;
    const p = inst.params;
    const W = uiOverlay.width, H = uiOverlay.height;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    if (h === 'center') {
        setInstanceParam(inst.id, 'filmSoupCenterX', Math.round(clamp((mx / W) * 100 - 50, -50, 50)));
        setInstanceParam(inst.id, 'filmSoupCenterY', Math.round(clamp((my / H) * 100 - 50, -50, 50)));
        return;
    }

    if (h?.startsWith('bubble:')) {
        const k = parseInt(h.split(':')[1]);
        const bubbles = parseBubbles(p);
        if (!bubbles[k]) return;
        const { cx, cy } = centerPct(p);
        bubbles[k].x = Math.round(clamp((mx / W) * 100 - cx, 0, 100));
        bubbles[k].y = Math.round(clamp((my / H) * 100 - cy, 0, 100));
        writeBubbles(inst.id, bubbles);
    }
}

// Add a bubble at the click position (manual mode, empty space).
export function addFilmSoupBubble(instId, p, e) {
    if (!isEditable(p)) return;
    const bubbles = parseBubbles(p);
    if (bubbles.length >= MAX_BUBBLES) return;
    const rect = canvas.getBoundingClientRect();
    const W = uiOverlay.width, H = uiOverlay.height;
    const { cx, cy } = centerPct(p);
    const x = Math.round(clamp(((e.clientX - rect.left) / W) * 100 - cx, 0, 100));
    const y = Math.round(clamp(((e.clientY - rect.top)  / H) * 100 - cy, 0, 100));
    bubbles.push({ x, y, ph: Math.random(), s: Math.random() * 2 - 1 });
    writeBubbles(instId, bubbles);
}

// Delete a bubble (click without drag on its handle).
export function deleteFilmSoupBubble(instId, p, k) {
    const bubbles = parseBubbles(p);
    if (k < 0 || k >= bubbles.length) return;
    bubbles.splice(k, 1);
    writeBubbles(instId, bubbles);
}

export function canAddFilmSoupBubble(p) {
    return isEditable(p) && parseBubbles(p).length < MAX_BUBBLES;
}
