// Bottom sheet state machine for mobile.
// The .sidebar element doubles as the bottom sheet on mobile —
// CSS positions it fixed at the bottom and translateY controls how much is visible.
//
// States (CSS classes on .sidebar):
//   (no class) = peek  — 17vh visible (handle + effect category tops)
//   sheet-expanded     — 90vh visible (full controls)
//   sheet-hidden       — fully off-screen (a slider is soloed over the canvas)
//
// Solo-slider focus mode: tapping a slider's label lifts that slider's control
// group out of the sheet and into #soloSliderBar (pinned to the bottom of the
// canvas), then hides the sheet so the image is unobstructed while editing.
// Tapping the label again — or the Done button — puts everything back.

import { renderStackList, syncExpandedEffectBar } from './stackPanel.js';

const isMobile = () =>
    window.matchMedia('(max-width: 900px), (pointer: coarse)').matches ||
    'ontouchstart' in window;

let sheetEl = null;

// ── Solo-slider focus state ──────────────────────────────────────────────
let soloGroup  = null;   // the .slider-group currently lifted out
let soloParent = null;   // where it came from (for restore)
let soloNext   = null;   // its former nextSibling (for restore)

export function initBottomSheet() {
    if (!isMobile()) return;

    sheetEl        = document.querySelector('.sidebar');
    const handleEl = document.getElementById('sheetHandle');

    if (!sheetEl || !handleEl) return;

    // ── Show/Hide button ────────────────────────────────────────────────
    // A plain tap toggles the drawer between retracted (only this button peeks)
    // and expanded (full controls). No swipe.
    const labelEl = handleEl.querySelector('.sheet-handle-label');
    handleEl.addEventListener('click', () => {
        const expanded = sheetEl.classList.toggle('sheet-expanded');
        handleEl.setAttribute('aria-expanded', String(expanded));
        if (labelEl) labelEl.textContent = expanded ? '▼ Hide' : '▲ Controls';
        // Mirror state onto <body> so the quick bar can hide while expanded.
        document.body.classList.toggle('drawer-expanded', expanded);
        // Re-sync the "showing controls for X" hint to the true expanded state.
        syncExpandedEffectBar();
    });

    // ── Slider label tap → enter/exit solo focus mode ───────────────────
    sheetEl.addEventListener('click', (e) => {
        const label = e.target.closest('.control-label');
        if (!label) return;
        const group = label.closest('.slider-group');
        if (!group || !group.querySelector('input[type="range"]')) return;
        enterSoloMode(group);
    });

    const doneBtn = document.getElementById('soloDoneBtn');
    doneBtn?.addEventListener('click', exitSoloMode);

    // Tapping the soloed slider's own label toggles focus mode back off.
    // (The group now lives in #soloSliderBar, outside the sheet's listener.)
    const bar = document.getElementById('soloSliderBar');
    bar?.addEventListener('click', (e) => {
        if (e.target.closest('.control-label')) exitSoloMode();
    });
}

export function enterSoloMode(group) {
    if (!sheetEl || soloGroup) return;
    const bar  = document.getElementById('soloSliderBar');
    const host = document.getElementById('soloSliderHost');
    if (!bar || !host) return;

    // Remember where the group lives so we can drop it back exactly there.
    soloGroup  = group;
    soloParent = group.parentNode;
    soloNext   = group.nextSibling;

    host.appendChild(group);
    group.classList.add('slider-group--active'); // reveal ±/reset buttons

    bar.classList.remove('hidden');
    document.body.classList.add('slider-solo-active');
    sheetEl.classList.add('sheet-hidden');
}

export function exitSoloMode() {
    if (!soloGroup) return;

    // Put the slider back where it came from. If that subtree is gone
    // (an unexpected rebuild), fall back to a fresh render — the value is
    // already persisted through setInstanceParam during editing.
    soloGroup.classList.remove('slider-group--active');
    if (soloParent && document.contains(soloParent)) {
        soloParent.insertBefore(soloGroup, soloNext);
    } else {
        renderStackList();
    }

    const bar = document.getElementById('soloSliderBar');
    if (bar) bar.classList.add('hidden');
    document.body.classList.remove('slider-solo-active');
    sheetEl?.classList.remove('sheet-hidden');

    soloGroup = soloParent = soloNext = null;
}
