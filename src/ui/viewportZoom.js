// Shared preview zoom/pan controller.
//
// Zoom/pan is a CSS transform on #canvasWrapper (main + overlay canvases move
// together). It never touches the WebGL drawing buffer or the export path, so
// exports are always full-resolution and unzoomed.
//
// Convention: transform-origin is the wrapper's top-left (0 0) and the transform
// is `translate(px, py) scale(s)`, so panX/panY are plain screen pixels. Both the
// desktop handlers here and the mobile handlers in touch.js drive this one state.

const MIN_SCALE = 0.8;
const MAX_SCALE = 8;

let scale = 1;
let panX = 0;
let panY = 0;

let wrapper = null;
let resetBtn = null;

function getWrapper() {
    if (!wrapper) wrapper = document.getElementById('canvasWrapper');
    return wrapper;
}

function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
}

export function getScale() {
    return scale;
}

export function isZoomed() {
    return scale !== 1 || panX !== 0 || panY !== 0;
}

function updateResetButton() {
    if (!resetBtn) resetBtn = document.getElementById('resetZoomBtn');
    if (resetBtn) resetBtn.classList.toggle('hidden', !isZoomed());
    const w = getWrapper();
    if (w) w.style.cursor = isZoomed() ? 'grab' : '';
}

function applyTransform() {
    const w = getWrapper();
    if (!w) return;
    w.style.transformOrigin = '0 0';
    w.style.transform = isZoomed()
        ? `translate(${panX}px, ${panY}px) scale(${scale})`
        : '';
    updateResetButton();
}

/** Zoom by `factor` about the client point (clientX, clientY), keeping it fixed. */
export function zoomAt(clientX, clientY, factor) {
    const w = getWrapper();
    if (!w) return;
    const rect = w.getBoundingClientRect();
    const newScale = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
    if (newScale === scale) return;
    const dx = clientX - rect.left;
    const dy = clientY - rect.top;
    // Keep the content point under the cursor stationary.
    panX += dx * (1 - newScale / scale);
    panY += dy * (1 - newScale / scale);
    scale = newScale;
    applyTransform();
}

/** Pan by a screen-pixel delta. */
export function panBy(dxScreen, dyScreen) {
    panX += dxScreen;
    panY += dyScreen;
    applyTransform();
}

export function resetViewport(animate) {
    const w = getWrapper();
    if (w && animate) {
        w.style.transition = 'transform 0.25s ease';
        setTimeout(() => { if (w) w.style.transition = ''; }, 260);
    }
    scale = 1;
    panX = 0;
    panY = 0;
    applyTransform();
}

/** Attach desktop (mouse/trackpad) wheel-zoom and drag-pan handlers. */
export function initViewport() {
    const w = getWrapper();
    if (!w) return;
    resetBtn = document.getElementById('resetZoomBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => resetViewport(true));

    const uiOverlay = document.getElementById('uiOverlay');
    // While an effect is being edited it takes over pointer input on #uiOverlay.
    const effectEditing = () =>
        uiOverlay && getComputedStyle(uiOverlay).pointerEvents === 'auto';

    // Wheel / pinch-trackpad zoom.
    w.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        zoomAt(e.clientX, e.clientY, factor);
    }, { passive: false });

    // Drag to pan (only while zoomed, and not while editing an effect).
    let dragging = false;
    w.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return;   // touch handled in touch.js
        if (!isZoomed() || effectEditing()) return;
        dragging = true;
        w.setPointerCapture(e.pointerId);
        w.style.cursor = 'grabbing';
        e.preventDefault();
    });
    w.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        panBy(e.movementX, e.movementY);
        e.preventDefault();
    });
    const endDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        try { w.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        w.style.cursor = isZoomed() ? 'grab' : '';
    };
    w.addEventListener('pointerup', endDrag);
    w.addEventListener('pointercancel', endDrag);

    updateResetButton();
}
