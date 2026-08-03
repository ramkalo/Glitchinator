// Shared palette-aware color selector.
//
// Reusable palette-consuming color control used by every effect. It is driven by
// the param's existing `options` [value, label] list (opt in with
// `type: 'paletteSelect'`), always stores the option *key* (never a resolved
// hex), and re-renders when the active palette changes (`paletteupdate`).
// Resolving keys → hex at render time is what lets dependent tools update live.
//
// Renders as an inline swatch strip: a row of clickable color squares.

import { setInstanceParam, getStack } from '../../state/effectStack.js';
import { saveState } from '../../state/undo.js';
import { NAMED_COLORS, STANDARD_COLOR_OPTIONS, resolveColorKey } from '../../effects/colorOptions.js';

// Re-export the pure helpers so existing importers of this module keep working.
export { NAMED_COLORS, STANDARD_COLOR_OPTIONS, resolveColorKey };

const RAINBOW = 'linear-gradient(135deg,#ff0000,#ff8800,#ffff00,#00ff00,#0000ff,#ff00ff)';
const CHECKER = 'repeating-conic-gradient(#555 0% 25%,#888 0% 50%) 50% / 8px 8px';

/** Active palette for an instance: the last enabled colorPalette before it. */
export function getActivePaletteFor(instId) {
    let palette = null;
    for (const inst of getStack()) {
        if (inst.id === instId) break;
        if (inst.effectName === 'colorPalette' && inst.params.paletteEnabled) {
            palette = Array.from({ length: 8 }, (_, j) => inst.params[`palette${j}`]);
        }
    }
    return palette;
}

function contrastColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 128 ? '#000000' : '#ffffff';
}

// Special (non-single-color) option tokens → how their swatch is drawn.
// These are functional modes kept across effects (noise fills, auto, random).
const SPECIAL_SWATCHES = {
    none:                { bg: CHECKER, glyph: '✕', color: '#fff' },
    auto:                { bg: 'var(--bg-input)', glyph: 'A', color: 'var(--text-dim)' },
    paletteRandom:       { bg: RAINBOW },
    colorNoise:          { bg: RAINBOW },
    paletteNoise:        { bg: RAINBOW },
    imagePaletteNoise:   { bg: RAINBOW },
    imagePaletteRandom:  { bg: RAINBOW },
    greyNoise:           { bg: 'repeating-conic-gradient(#444 0% 25%,#bbb 0% 50%) 50% / 6px 6px' },
    // corrupted fill modes
    static:              { bg: 'repeating-conic-gradient(#444 0% 25%,#bbb 0% 50%) 50% / 6px 6px' },
    'color-static':      { bg: RAINBOW },
    'palette-static':    { bg: RAINBOW },
    inside:              { bg: 'var(--bg-input)', glyph: '⌖', color: 'var(--text-dim)' },
};

// Paint a square element to represent an option value. Returns the resolved hex.
function paintSwatch(el, value, palette, customHex, { plus = false } = {}) {
    el.style.background = '';
    el.style.backgroundColor = '';
    el.style.opacity = '1';
    el.textContent = '';
    el.style.color = '';
    const special = SPECIAL_SWATCHES[value];
    if (special) {
        el.style.background = special.bg;
        if (special.glyph) { el.textContent = special.glyph; el.style.color = special.color; }
        return null;
    }
    const hex = resolveColorKey(value, palette, customHex);
    if (hex) {
        el.style.backgroundColor = hex;
        if (plus && value === 'custom') {
            el.textContent = '+';
            el.style.color = contrastColor(hex);
        }
    } else {
        el.style.background = CHECKER;
        el.style.opacity = '0.4';
    }
    return hex;
}

function labelFor(value, optLabel, hex) {
    const base = optLabel ?? value;
    return hex ? `${base} — ${hex}` : base;
}

// Wire a hidden native <input type=color> backing a 'custom' option.
function makeCustomInput(inst, key, customParam, onChange) {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = inst.params[customParam] ?? '#ffffff';
    input.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
    input.addEventListener('input', () => {
        setInstanceParam(inst.id, customParam, input.value);
        if (inst.params[key] !== 'custom') setInstanceParam(inst.id, key, 'custom');
        onChange();
    });
    return input;
}

// Listen for palette edits; auto-remove when the control detaches.
function attachLive(node, refresh) {
    const handler = () => {
        if (!document.contains(node)) { document.removeEventListener('paletteupdate', handler); return; }
        refresh();
    };
    document.addEventListener('paletteupdate', handler);
}

function groupWithLabel(schema, key) {
    const group = document.createElement('div');
    group.className = 'control-group';
    const labelEl = document.createElement('div');
    labelEl.className = 'control-label';
    labelEl.textContent = schema.label ?? key;
    labelEl.style.marginBottom = '4px';
    group.appendChild(labelEl);
    return group;
}

/** Inline swatch strip — a row of clickable color squares. */
export function buildPaletteSwatchControl(inst, key, schema, { onRebuild } = {}) {
    const group = groupWithLabel(schema, key);
    group.dataset.instParam = key;
    const strip = document.createElement('div');
    strip.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;align-items:center;';
    group.appendChild(strip);

    // `optionsFor` lets an effect vary the swatch list with its own state — e.g.
    // Color Gel drops the ✕ from Color 3 in radial mode, where it is mandatory.
    const options = schema.optionsFor?.(inst.params) ?? schema.options ?? [];
    const customParam = schema.customParam;
    const hasCustom = customParam && options.some(([v]) => v === 'custom');
    const colorInput = hasCustom ? makeCustomInput(inst, key, customParam, refresh) : null;
    if (colorInput) group.appendChild(colorInput);

    const cells = [];
    const select = (val) => { saveState(); setInstanceParam(inst.id, key, val); refresh(); onRebuild?.(); };

    for (const [value, optLabel] of options) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.style.cssText =
            'width:20px;height:20px;padding:0;border-radius:0;border:1px solid var(--border);' +
            'cursor:pointer;flex:0 0 auto;box-sizing:border-box;font-size:11px;line-height:1;' +
            'display:flex;align-items:center;justify-content:center;background:var(--bg-input);';
        cell.addEventListener('click', () => { if (value === 'custom' && colorInput) colorInput.click(); select(value); });
        strip.appendChild(cell);
        cells.push({ value, optLabel, el: cell });
    }

    function refresh() {
        const pal = getActivePaletteFor(inst.id);
        const customHex = customParam ? inst.params[customParam] : null;
        const current = inst.params[key];
        for (const { value, optLabel, el } of cells) {
            const hex = paintSwatch(el, value, pal, customHex, { plus: true });
            el.title = labelFor(value, optLabel, hex);
            const sel = value === current;
            el.style.outline = sel ? '2px solid var(--accent-hover)' : 'none';
            el.style.outlineOffset = sel ? '1px' : '0';
            el.style.boxShadow = sel ? '0 0 0 1px var(--bg-dark)' : 'none';
        }
        if (colorInput) colorInput.value = inst.params[customParam] ?? '#ffffff';
    }
    refresh();
    attachLive(strip, refresh);
    // Expose a refresh hook so external UI (e.g. the colorRemap stops slider,
    // which swaps color params during a drag) can re-sync the swatches.
    group._refreshSwatches = refresh;
    return group;
}
