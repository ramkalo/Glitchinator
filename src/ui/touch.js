// Touch gesture handlers for the canvas area:
//   • Pinch-to-zoom + 1-finger pan (persistent — shared viewport transform)
//   • Long-press compare (hold to see original, release to restore)

import { originalImage } from '../renderer/glstate.js';
import { blitOriginalToScreen } from '../renderer/webgl.js';
import { processImageImmediate } from '../renderer/pipeline.js';
import { zoomAt, panBy, resetViewport, getScale, isZoomed } from './viewportZoom.js';

const isMobile = () =>
    window.matchMedia('(max-width: 900px), (pointer: coarse)').matches ||
    'ontouchstart' in window;

export function initTouchGestures() {
    if (!isMobile()) return;

    const wrapper     = document.getElementById('canvasWrapper');
    const overlayCanvas = document.getElementById('overlayCanvas');
    if (!wrapper) return;

    // Long-press compare only arms when the drawer is retracted — never while
    // the controls are pulled out (sheet-expanded) or a slider is soloed (sheet-hidden).
    const sheetRetracted = () => {
        const s = document.querySelector('.sidebar');
        return !!s && !s.classList.contains('sheet-expanded')
                  && !s.classList.contains('sheet-hidden');
    };

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

    // ── Long-press compare state ─────────────────────────────────────────
    let longPressTimer  = null;
    let longPressActive = false;
    let lpStartX = 0, lpStartY = 0;

    // ── Double-tap state ─────────────────────────────────────────────────
    let lastTapTime = 0;
    let lastTapX    = 0, lastTapY = 0;

    // ────────────────────────────────────────────────────────────────────
    wrapper.addEventListener('touchstart', (e) => {
        const touches = e.touches;

        if (touches.length === 2) {
            // ── Pinch start ────────────────────────────────────────────
            isPinching = true;
            clearLongPress();
            pinchPrevDist = touchDist(touches);
            const mid = touchMid(touches);
            pinchPrevMidX = mid.x;
            pinchPrevMidY = mid.y;
            e.preventDefault();

        } else if (touches.length === 1) {
            const t = touches[0];

            // Track finger for pan + long-press.
            lpStartX = t.clientX;
            lpStartY = t.clientY;

            // ── Long-press start (compare) ────────────────────────────
            if (sheetRetracted()) {
                longPressTimer = setTimeout(() => {
                    longPressActive = true;
                    if (!originalImage) return;
                    blitOriginalToScreen();
                    // Clear overlay so timestamp doesn't linger on original
                    if (overlayCanvas) {
                        overlayCanvas.getContext('2d')
                            .clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                    }
                }, 600);
            }
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

            // Cancel long press if finger moved
            if (longPressTimer) {
                const moved = Math.hypot(t.clientX - lpStartX, t.clientY - lpStartY);
                if (moved > 8) clearLongPress();
            }

            // ── 1-finger pan when zoomed in ───────────────────────────
            if (getScale() > 1) {
                panBy(t.clientX - lpStartX, t.clientY - lpStartY);
                lpStartX = t.clientX;
                lpStartY = t.clientY;
                e.preventDefault();
            }
        }
    }, { passive: false });

    // ────────────────────────────────────────────────────────────────────
    wrapper.addEventListener('touchend', (e) => {
        clearLongPress();

        // Restore filtered image after long-press compare (immediate, no debounce)
        if (longPressActive) {
            longPressActive = false;
            processImageImmediate();
        }

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

    // ────────────────────────────────────────────────────────────────────
    function clearLongPress() {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}
