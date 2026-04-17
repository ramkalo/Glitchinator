// Bottom sheet state machine for mobile.
// The .sidebar element doubles as the bottom sheet on mobile —
// CSS positions it fixed at the bottom and translateY controls how much is visible.
//
// States (CSS classes on .sidebar):
//   (no class) = peek  — 17vh visible (handle + effect category tops)
//   sheet-expanded     — 90vh visible (full controls)
//   sheet-adjust       — 50px visible (handle only; canvas-drag mode active)

const isMobile = () =>
    window.matchMedia('(max-width: 900px), (pointer: coarse)').matches ||
    'ontouchstart' in window;

let sheetEl   = null;
let pillEl    = null;
let pillLabel = null;
let pillValue = null;

// The slider currently being scrubbed. Read by touch.js.
export let activeSlider = null;

export function initBottomSheet() {
    if (!isMobile()) return;

    sheetEl   = document.querySelector('.sidebar');
    pillEl    = document.getElementById('adjustPill');
    pillLabel = document.getElementById('adjustPillLabel');
    pillValue = document.getElementById('adjustPillValue');
    const handleEl = document.getElementById('sheetHandle');

    if (!sheetEl || !handleEl) return;

    // Handle tap: cycle states or exit adjust mode
    handleEl.addEventListener('click', () => {
        if (sheetEl.classList.contains('sheet-adjust')) {
            // Exit adjust mode → back to expanded so user can tap another slider
            exitAdjustMode();
        } else if (sheetEl.classList.contains('sheet-expanded')) {
            // Expanded → peek
            sheetEl.classList.remove('sheet-expanded');
        } else {
            // Peek → expanded
            sheetEl.classList.add('sheet-expanded');
        }
    });

    // Slider tap → enter adjust mode.
    // Use pointerdown so we catch it before the browser default.
    sheetEl.addEventListener('pointerdown', (e) => {
        const slider = e.target.closest('input[type="range"]');
        if (slider) {
            // Don't prevent default — let the range input still receive focus.
            // A short delay lets the tap register before we collapse the sheet.
            setTimeout(() => enterAdjustMode(slider), 80);
        }
    });
}

export function enterAdjustMode(slider) {
    if (!sheetEl) return;
    activeSlider = slider;
    sheetEl.classList.remove('sheet-expanded');
    sheetEl.classList.add('sheet-adjust');
    document.body.classList.add('touch-adjust-active');

    // Derive a human-readable label from the adjacent .control-label, fallback to data-param
    const row   = slider.closest('.control-row');
    const label = row?.querySelector('.control-label')?.textContent?.trim()
                  ?? slider.dataset.param
                  ?? '—';

    if (pillLabel) pillLabel.textContent = label;
    updatePillValue(slider.value);
    if (pillEl) pillEl.classList.remove('hidden');
}

export function exitAdjustMode() {
    if (!sheetEl) return;
    activeSlider = null;
    sheetEl.classList.remove('sheet-adjust');
    sheetEl.classList.add('sheet-expanded');
    document.body.classList.remove('touch-adjust-active');
    if (pillEl) pillEl.classList.add('hidden');
}

export function updatePillValue(val) {
    if (!pillValue) return;
    const n = parseFloat(val);
    pillValue.textContent = Number.isFinite(n)
        ? (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))
        : String(val);
}
