// Touch gesture handlers for the canvas area:
//   • Pinch-to-zoom + 1-finger pan (CSS transform, re-render on release)
//   • Long-press compare (hold to see original, release to restore)
//   • Canvas-drag adjust (horizontal drag maps to active slider range)

import { canvas, ctx, originalImage } from '../renderer/glstate.js';
import { processImage } from '../renderer/pipeline.js';
import { activeSlider, updatePillValue } from './bottomsheet.js';

const isMobile = () =>
    window.matchMedia('(max-width: 900px), (pointer: coarse)').matches ||
    'ontouchstart' in window;

export function initTouchGestures() {
    if (!isMobile()) return;

    const wrapper     = document.getElementById('canvasWrapper');
    const overlayCanvas = document.getElementById('overlayCanvas');
    if (!wrapper) return;

    // ── Zoom / pan state ────────────────────────────────────────────────
    let scale = 1, panX = 0, panY = 0;
    let pinchStartDist  = 0;
    let pinchStartScale = 1;
    let pinchStartMidX  = 0, pinchStartMidY = 0;
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
    function applyTransform() {
        wrapper.style.transform = `scale(${scale}) translate(${panX}px, ${panY}px)`;
    }
    function resetTransform(animate) {
        if (animate) {
            wrapper.style.transition = 'transform 0.25s ease';
            setTimeout(() => { wrapper.style.transition = ''; }, 260);
        }
        scale = 1; panX = 0; panY = 0;
        wrapper.style.transform = '';
    }

    // ── Long-press compare state ─────────────────────────────────────────
    let longPressTimer  = null;
    let longPressActive = false;
    let lpStartX = 0, lpStartY = 0;

    // ── Canvas-drag adjust state ─────────────────────────────────────────
    let adjustStartX     = null;
    let adjustStartValue = null;

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
            pinchStartDist  = touchDist(touches);
            pinchStartScale = scale;
            const mid = touchMid(touches);
            pinchStartMidX = mid.x;
            pinchStartMidY = mid.y;
            e.preventDefault();

        } else if (touches.length === 1) {
            const t = touches[0];

            // ── Canvas-drag adjust start ──────────────────────────────
            if (document.body.classList.contains('touch-adjust-active') && activeSlider) {
                adjustStartX     = t.clientX;
                adjustStartValue = parseFloat(activeSlider.value);
                e.preventDefault();
                return;
            }

            // ── Long-press start ──────────────────────────────────────
            lpStartX = t.clientX;
            lpStartY = t.clientY;
            longPressTimer = setTimeout(() => {
                longPressActive = true;
                if (!originalImage) return;
                ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
                // Clear overlay so timestamp doesn't linger on original
                if (overlayCanvas) {
                    overlayCanvas.getContext('2d')
                        .clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                }
            }, 600);
        }
    }, { passive: false });

    // ────────────────────────────────────────────────────────────────────
    wrapper.addEventListener('touchmove', (e) => {
        const touches = e.touches;

        if (touches.length === 2 && isPinching) {
            // ── Pinch zoom + pan ──────────────────────────────────────
            const newDist = touchDist(touches);
            const newMid  = touchMid(touches);

            scale = Math.min(5, Math.max(0.8,
                pinchStartScale * (newDist / pinchStartDist)));

            // Pan by midpoint delta (corrected for current scale)
            panX += (newMid.x - pinchStartMidX) / scale;
            panY += (newMid.y - pinchStartMidY) / scale;
            pinchStartMidX = newMid.x;
            pinchStartMidY = newMid.y;

            applyTransform();
            e.preventDefault();

        } else if (touches.length === 1) {
            const t = touches[0];

            // Cancel long press if finger moved
            if (longPressTimer) {
                const moved = Math.hypot(t.clientX - lpStartX, t.clientY - lpStartY);
                if (moved > 8) clearLongPress();
            }

            // ── Canvas-drag slider scrub ──────────────────────────────
            if (document.body.classList.contains('touch-adjust-active')
                    && activeSlider && adjustStartX !== null) {
                const min   = parseFloat(activeSlider.min);
                const max   = parseFloat(activeSlider.max);
                const range = max - min;
                const delta = (t.clientX - adjustStartX) / window.innerWidth * range;
                const newVal = Math.min(max, Math.max(min, adjustStartValue + delta));

                activeSlider.value = newVal;
                activeSlider.dispatchEvent(new InputEvent('input', { bubbles: true }));
                updatePillValue(newVal);
                e.preventDefault();
            }

            // ── 1-finger pan when zoomed ──────────────────────────────
            if (!document.body.classList.contains('touch-adjust-active') && scale > 1) {
                panX += (t.clientX - lpStartX) / scale;
                panY += (t.clientY - lpStartY) / scale;
                lpStartX = t.clientX;
                lpStartY = t.clientY;
                applyTransform();
                e.preventDefault();
            }
        }
    }, { passive: false });

    // ────────────────────────────────────────────────────────────────────
    wrapper.addEventListener('touchend', (e) => {
        clearLongPress();

        // Restore filtered image after long-press compare
        if (longPressActive) {
            longPressActive = false;
            processImage();
        }

        // Double-tap → reset zoom
        if (e.changedTouches.length === 1 && e.touches.length === 0) {
            const t   = e.changedTouches[0];
            const now = Date.now();
            const dx  = t.clientX - lastTapX;
            const dy  = t.clientY - lastTapY;
            if (now - lastTapTime < 300 && Math.hypot(dx, dy) < 30 && scale !== 1) {
                resetTransform(true);
                processImage();
            }
            lastTapTime = now;
            lastTapX = t.clientX;
            lastTapY = t.clientY;
        }

        // Pinch released — clear transform and re-render at full resolution
        if (e.touches.length < 2 && isPinching) {
            isPinching = false;
            if (scale !== 1) {
                resetTransform(true);
                processImage();
            }
        }

        adjustStartX = null;
    }, { passive: true });

    // ────────────────────────────────────────────────────────────────────
    function clearLongPress() {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}
