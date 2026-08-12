// Touch gesture handlers for the canvas area:
//   • Pinch-to-zoom + 1-finger pan (persistent — shared viewport transform)
//   • Double-tap to reset zoom
// (Original-vs-edited compare is the Compare button in the mobile quick bar.)

import { zoomAt, panBy, resetViewport, getScale, isZoomed } from './viewportZoom.js';

const isMobile = () =>
    window.matchMedia('(max-width: 900px), (pointer: coarse)').matches ||
    'ontouchstart' in window;

export function initTouchGestures() {
    if (!isMobile()) return;

    const wrapper = document.getElementById('canvasWrapper');
    if (!wrapper) return;

    // ── Pinch state ─────────────────────────────────────────────────────
    let pinchPrevDist = 0;
    let pinchPrevMidX = 0, pinchPrevMidY = 0;
    let isPinching = false;

    function touchDist(t) {
        return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    }
    function touchMid(t) {
        return {
            x: (t[0].clientX + t[1].clientX) / 2,
            y: (t[0].clientY + t[1].clientY) / 2,
        };
    }

    // ── 1-finger pan state ──────────────────────────────────────────────
    let panPrevX = 0, panPrevY = 0;

    // ── Double-tap state ─────────────────────────────────────────────────
    let lastTapTime = 0;
    let lastTapX    = 0, lastTapY = 0;

    // ────────────────────────────────────────────────────────────────────
    wrapper.addEventListener('touchstart', (e) => {
        const touches = e.touches;

        if (touches.length === 2) {
            // ── Pinch start ────────────────────────────────────────────
            isPinching = true;
            pinchPrevDist = touchDist(touches);
            const mid = touchMid(touches);
            pinchPrevMidX = mid.x;
            pinchPrevMidY = mid.y;
            e.preventDefault();

        } else if (touches.length === 1) {
            const t = touches[0];
            panPrevX = t.clientX;
            panPrevY = t.clientY;
        }
    }, { passive: false });

    // ────────────────────────────────────────────────────────────────────
    wrapper.addEventListener('touchmove', (e) => {
        const touches = e.touches;

        if (touches.length === 2 && isPinching) {
            // ── Pinch zoom + pan ──────────────────────────────────────
            const newDist = touchDist(touches);
            const newMid  = touchMid(touches);

            if (pinchPrevDist > 0) {
                zoomAt(newMid.x, newMid.y, newDist / pinchPrevDist);
            }
            panBy(newMid.x - pinchPrevMidX, newMid.y - pinchPrevMidY);
            pinchPrevDist = newDist;
            pinchPrevMidX = newMid.x;
            pinchPrevMidY = newMid.y;

            e.preventDefault();

        } else if (touches.length === 1) {
            const t = touches[0];

            // ── 1-finger pan when zoomed in ───────────────────────────
            if (getScale() > 1) {
                panBy(t.clientX - panPrevX, t.clientY - panPrevY);
                panPrevX = t.clientX;
                panPrevY = t.clientY;
                e.preventDefault();
            }
        }
    }, { passive: false });

    // ────────────────────────────────────────────────────────────────────
    wrapper.addEventListener('touchend', (e) => {
        // Double-tap → reset zoom
        if (e.changedTouches.length === 1 && e.touches.length === 0) {
            const t   = e.changedTouches[0];
            const now = Date.now();
            const dx  = t.clientX - lastTapX;
            const dy  = t.clientY - lastTapY;
            if (now - lastTapTime < 300 && Math.hypot(dx, dy) < 30 && isZoomed()) {
                resetViewport(true);
            }
            lastTapTime = now;
            lastTapX = t.clientX;
            lastTapY = t.clientY;
        }

        // Pinch released
        if (e.touches.length < 2) {
            isPinching = false;
        }
    }, { passive: true });
}
