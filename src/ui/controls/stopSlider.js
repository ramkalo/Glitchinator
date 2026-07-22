// Shared gradient-stop position slider.
//
// A horizontal track carrying one draggable handle per color stop. Handles show
// their stop's resolved color, stops whose color is set to 'none' are hidden,
// and dragging a handle past a neighbour swaps the two colors so the color
// identity follows the cursor. Used by Color Remap's luminance stops and Color
// Gel's gradient arrangement.

import { setInstanceParam } from '../../state/effectStack.js';
import { saveState } from '../../state/undo.js';

function contrastColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 128 ? '#000000' : '#ffffff';
}

/**
 * @param {object}   inst           effect instance
 * @param {object}   opts
 * @param {string}   opts.label     control label
 * @param {Array}    opts.stops     [{ posKey, colorKey, label, defaultPos }] in stop order
 * @param {number[]} opts.alwaysActive indices that can never be disabled
 * @param {Function} opts.resolveHex (colorValue) => hex | null
 * @param {string}   [opts.trackBar] CSS background for a reference bar under the track
 * @param {Function} [opts.onSwap]  called after a drag swaps two stop colors
 * @returns {HTMLElement} the control group, with `_updateSlider()` attached
 */
export function buildStopSlider(inst, { label, stops, alwaysActive = [], resolveHex, trackBar, onSwap } = {}) {
    const N = stops.length;
    const getStopPos   = (i) => inst.params[stops[i].posKey] ?? stops[i].defaultPos;
    const isStopActive = (i) => alwaysActive.includes(i) || inst.params[stops[i].colorKey] !== 'none';
    const hexAt        = (i) => resolveHex(inst.params[stops[i].colorKey]) ?? '#808080';

    const group = document.createElement('div');
    group.className = 'control-group';
    const row = document.createElement('div');
    row.className = 'control-row';
    row.style.cssText = 'flex-direction:column;align-items:stretch;gap:2px;';

    const labelEl = document.createElement('span');
    labelEl.className = 'control-label';
    labelEl.textContent = label;

    const trackWrap = document.createElement('div');
    trackWrap.style.cssText = 'position:relative;height:20px;margin:4px 6px;';

    const trackBg = document.createElement('div');
    trackBg.style.cssText = 'position:absolute;inset:0;border-radius:4px;border:1px solid var(--border);pointer-events:none;';
    trackWrap.appendChild(trackBg);

    const handles = stops.map((def) => {
        const h = document.createElement('div');
        h.style.cssText = 'position:absolute;top:-2px;width:12px;height:24px;transform:translateX(-50%);border-radius:3px;border:2px solid rgba(255,255,255,0.5);cursor:ew-resize;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;user-select:none;box-sizing:border-box;';
        h.textContent = def.label;
        trackWrap.appendChild(h);
        return h;
    });

    function updateSlider() {
        const gradParts = [];
        for (let i = 0; i < N; i++) {
            if (!isStopActive(i)) continue;
            gradParts.push(`${hexAt(i)} ${(getStopPos(i) * 100).toFixed(1)}%`);
        }
        trackBg.style.background = gradParts.length > 1
            ? `linear-gradient(to right, ${gradParts.join(', ')})`
            : 'var(--bg-2)';

        for (let i = 0; i < N; i++) {
            const active = isStopActive(i);
            handles[i].style.display = active ? 'flex' : 'none';
            if (!active) continue;
            handles[i].style.left = `${getStopPos(i) * 100}%`;
            const hex = hexAt(i);
            const fg  = contrastColor(hex);
            handles[i].style.backgroundColor = hex;
            handles[i].style.color = fg;
            handles[i].style.borderColor = fg === '#000000' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)';
        }
    }

    // drag-past swap: shared drag state so color identity follows the cursor across handles
    const dragState = { active: false, idx: -1 };
    const swapColors = (a, b) => {
        const ca = inst.params[stops[a].colorKey];
        const cb = inst.params[stops[b].colorKey];
        setInstanceParam(inst.id, stops[a].colorKey, cb);
        setInstanceParam(inst.id, stops[b].colorKey, ca);
    };

    for (let i = 0; i < N; i++) {
        handles[i].addEventListener('pointerdown', (e) => {
            if (!isStopActive(i)) return;
            e.preventDefault();
            handles[i].setPointerCapture(e.pointerId);
            saveState();
            dragState.active = true;
            dragState.idx = i;
        });
        handles[i].addEventListener('pointermove', (e) => {
            if (!dragState.active) return;
            const rect = trackWrap.getBoundingClientRect();
            const newPos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

            // swap colors when crossing an adjacent active stop; loop handles fast drags
            let swapped = true;
            while (swapped) {
                swapped = false;
                const di = dragState.idx;
                for (let j = di + 1; j < N; j++) {
                    if (!isStopActive(j)) continue;
                    if (newPos >= getStopPos(j)) { swapColors(di, j); dragState.idx = j; swapped = true; }
                    break;
                }
                const di2 = dragState.idx;
                for (let j = di2 - 1; j >= 0; j--) {
                    if (!isStopActive(j)) continue;
                    if (newPos <= getStopPos(j)) { swapColors(di2, j); dragState.idx = j; swapped = true; }
                    break;
                }
            }

            setInstanceParam(inst.id, stops[dragState.idx].posKey, Math.round(newPos * 1000) / 1000);
            updateSlider();
            onSwap?.();
        });
        handles[i].addEventListener('pointerup',          () => { dragState.active = false; dragState.idx = -1; });
        handles[i].addEventListener('lostpointercapture', () => { dragState.active = false; dragState.idx = -1; });
    }

    row.appendChild(labelEl);
    row.appendChild(trackWrap);

    if (trackBar) {
        const bar = document.createElement('div');
        bar.style.cssText = 'height:6px;border-radius:3px;border:1px solid var(--border);margin:2px 6px 4px;pointer-events:none;';
        bar.style.background = trackBar;
        row.appendChild(bar);
    }

    group.appendChild(row);
    updateSlider();

    // Swatch clicks rebuild the panel, but palette edits only fire paletteupdate —
    // keep the track gradient in sync for those too.
    document.addEventListener('paletteupdate', function onPU() {
        if (!document.contains(trackWrap)) { document.removeEventListener('paletteupdate', onPU); return; }
        updateSlider();
    });

    group._updateSlider = updateSlider;
    return group;
}
