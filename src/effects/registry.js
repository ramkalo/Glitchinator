import doubleExposureEffect from './doubleExposure.js';
import basicEffect          from './basic.js';
import digitizeEffect       from './digitize.js';
import grainEffect          from './grain.js';
import pixelArtEffect       from './pixelArt.js';
import chromaEffect         from './chroma.js';
import vignetteEffect       from './vignette.js';
import invertEffect         from './invert.js';
import { vhsEffect, vhsTimestampEffect } from './vhs.js';
import wavesEffect          from './waves.js';
import crtEffect            from './crt.js';

/**
 * Master ordered list of all effects.
 * Order matters: effects are applied in this sequence by the canvas 2D pipeline.
 * Each entry is an effect definition object:
 *   { name, label, pass, params, enabled(p), canvas2d }
 *
 * pass values:
 *   'pre-crt'  — imageData effect, applied before any context drawing
 *   'context'  — draws directly to the 2D canvas context (e.g. text overlays)
 *   'post'     — imageData effect, applied after context effects
 *
 * To add a new effect: create src/effects/myEffect.js, import it here,
 * add it to EFFECTS in the correct position. That's it.
 */
export const EFFECTS = [
    doubleExposureEffect,
    basicEffect,
    digitizeEffect,
    grainEffect,
    pixelArtEffect,
    chromaEffect,
    vignetteEffect,
    invertEffect,
    vhsEffect,
    vhsTimestampEffect,
    wavesEffect,
    crtEffect,
];

// ---------------------------------------------------------------------------
// Derived param schema — auto-generated from EFFECTS, replaces hand-maintained
// params object and controlLimits in state/params.js
// ---------------------------------------------------------------------------

/**
 * Build the initial params defaults object from all effect definitions.
 * Returns: { brightness: 0, contrast: 0, ... }
 */
export function buildParamDefaults() {
    const defaults = {};
    for (const effect of EFFECTS) {
        for (const [key, schema] of Object.entries(effect.params)) {
            defaults[key] = schema.default;
        }
    }
    return defaults;
}

/**
 * Build the controlLimits object from all effect definitions.
 * Only includes params that have min/max defined.
 * Returns: { brightness: { min: -100, max: 100 }, ... }
 */
export function buildControlLimits() {
    const limits = {};
    for (const effect of EFFECTS) {
        for (const [key, schema] of Object.entries(effect.params)) {
            if ('min' in schema && 'max' in schema) {
                limits[key] = { min: schema.min, max: schema.max };
            }
        }
    }
    return limits;
}
