import { buildParamDefaults, buildControlLimits } from '../effects/registry.js';

// Internal mutable data — derived from the effect registry so the
// params list and controlLimits never need to be hand-maintained again.
const _data = buildParamDefaults();

// Snapshot defaults BEFORE proxy wrapping so it's a clean plain object
export const defaultParams = JSON.parse(JSON.stringify(_data));

// --- Reactivity ---------------------------------------------------------

const _listeners = new Set();

function _notify() {
    for (const fn of _listeners) fn();
}

/**
 * params proxy: reads pass through, writes notify all listeners.
 * All existing code that reads params.brightness etc. keeps working.
 * All existing code that writes params.x = y now auto-triggers renders.
 */
export const params = new Proxy(_data, {
    set(target, key, value) {
        target[key] = value;
        _notify();
        return true;
    }
});

/**
 * Subscribe to any param change. Returns an unsubscribe function.
 * Usage: const unsub = onParamsChange(() => processImage());
 */
export function onParamsChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}

/**
 * Apply many params at once and fire listeners only once.
 * Use for preset load, undo/redo restore, reset — avoids N renders for N params.
 */
export function setParamsBulk(obj) {
    Object.assign(_data, obj);
    _notify();
}

/** Return a lightweight plain-object copy of the current param state. */
export function snapshotParams() {
    return JSON.parse(JSON.stringify(_data));
}

/** Restore params from a snapshot and notify listeners (triggers re-render). */
export function restoreParams(snapshot) {
    Object.assign(_data, snapshot);
    _notify();
}

// --- Control metadata — derived from registry, no longer hand-maintained ---
export const controlLimits = buildControlLimits();

// --- Preset storage -----------------------------------------------------

export let presets = JSON.parse(localStorage.getItem('retroPresets') || '{}');

export function savePresetsToStorage() {
    localStorage.setItem('retroPresets', JSON.stringify(presets));
}
