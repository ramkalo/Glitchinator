import { barrelDistortionEffect } from './barrelDistortion.js';
import { basicEffect }           from './basic.js';
import { blurEffect }            from './blur.js';
import { chromaEffect }          from './chroma.js';
import { colorGelEffect }        from './colorGel.js';
import { colorPaletteEffect }    from './colorPalette.js';
import { colorRemapEffect }      from './colorRemap.js';
import { corruptedEffect }       from './corrupted.js';
import { cropEffect }            from './crop.js';
import { digitizeEffect }        from './digitize.js';
import { doubleExposureEffect }  from './doubleExposure.js';
import { drawToolEffect }        from './drawTool.js';
import { filmSoupEffect }        from './filmSoup.js';
import { glowEffect }            from './glow.js';
import { grainEffect }           from './grain.js';
import { halftoneEffect }        from './halftone.js';
import { hueShiftEffect }        from './hueShift.js';
import { kaleidoscopeEffect }    from './kaleidoscope.js';
import { lineDragEffect }        from './lineDrag.js';
import { lineGlitchEffect }      from './lineGlitch.js';
import { matrixRainEffect }      from './matrixRain.js';
import { glassBlobEffect }       from './glassBlob.js';
import { meshEffect }            from './mesh.js';
import { cutEffect }             from './cut.js';
import { scanlinesEffect }       from './scanlines.js';
import { shapeStickerEffect }    from './shapeSticker.js';
import { smearTwistEffect }      from './smearTwist.js';
import { textEffect }            from './text.js';
import { transformEffect }       from './transform.js';
import { tunnelEffect }          from './tunnel.js';
import { viewportEffect }        from './viewport.js';
import { wrinkleEffect }         from './wrinkle.js';
import { causticsEffect }        from './caustics.js';

const viewportEntryEffect = {
    name: 'viewportEntry',
    label: 'Viewport Entry',
    kind: 'marker',
    params: {},
    enabled: () => false,
    isMarker: true,
};

const doubleExposureEntryEffect = {
    name: 'doubleExposureEntry',
    label: 'Double Exposure Grab Point',
    kind: 'marker',
    params: {},
    enabled: () => false,
    isMarker: true,
};

const filmSoupMeltEffect = {
    name: 'filmSoupMelt',
    label: 'Film Soup Melt Point',
    kind: 'marker',
    params: {},
    enabled: () => false,
    isMarker: true,
};

/**
 * @typedef {Object} EffectBase
 * @property {string} name
 * @property {string} label
 * @property {'transform'|'glsl'|'context'|'reveal'|'marker'} kind
 * @property {Record<string, {default: *, min?: number, max?: number, step?: number, label?: string, options?: [string, string][]}>} params
 * @property {(p: object) => boolean} enabled
 * @property {string[]} [paramKeys]       — param names auto-bound to GLSL uniforms
 * @property {string[]} [handleParams]    — param names driven by canvas drag handles
 * @property {(gl: WebGL2RenderingContext, prog: WebGLProgram, params: object, dstW: number, dstH: number, srcTex?: WebGLTexture, origTex?: WebGLTexture) => void} [bindUniforms]
 * @property {Object} [uiGroups]
 */

/**
 * @typedef {EffectBase & { glsl: string, getOutputDimensions?: (p: object, w: number, h: number) => {w: number, h: number} }} TransformEffect
 * @typedef {EffectBase & { glsl: string }} GlslEffect
 * @typedef {EffectBase & { glslPasses: Array<{glsl: string, needsOriginal?: boolean}> | ((p: object) => Array<{glsl: string, needsOriginal?: boolean}>) }} MultiPassEffect
 * @typedef {EffectBase & { canvas2d: (ctx: CanvasRenderingContext2D, params: object) => void }} ContextEffect
 * @typedef {TransformEffect|GlslEffect|MultiPassEffect|ContextEffect} EffectDef
 */

const KNOWN_KINDS = new Set(['transform', 'glsl', 'context', 'reveal', 'marker']);

/** @param {EffectDef} effect */
function validateEffect(effect) {
    const id = `Effect "${effect?.name ?? '(unknown)'}"`;
    if (typeof effect.name   !== 'string')   throw new Error(`${id}: "name" must be a string`);
    if (typeof effect.label  !== 'string')   throw new Error(`${id}: "label" must be a string`);
    if (typeof effect.kind   !== 'string')   throw new Error(`${id}: "kind" must be a string`);
    if (typeof effect.params !== 'object')   throw new Error(`${id}: "params" must be an object`);
    if (typeof effect.enabled !== 'function') throw new Error(`${id}: "enabled" must be a function`);
    if (!KNOWN_KINDS.has(effect.kind))        throw new Error(`${id}: unknown kind "${effect.kind}"`);

    if (effect.kind === 'context') {
        if (typeof effect.canvas2d !== 'function')
            throw new Error(`${id}: kind "context" requires a canvas2d function`);
    } else if (!effect.isMarker) {
        if (!effect.glsl && !effect.glslPasses)
            throw new Error(`${id}: kind "${effect.kind}" requires glsl or glslPasses`);
    }
}

/**
 * Catalog of all available effects.
 *
 * This array is NOT a render order — it's just the catalog / default insert order shown
 * in the picker. Effects render strictly in the user-defined stack order; nothing here
 * forces one effect before another.
 *
 * The `kind` tag describes HOW an effect is rendered (its technique), never WHEN:
 *   'transform' — resizes the canvas (crop, flip, rotate); needs glsl
 *   'glsl'      — fragment-shader effect (single or multi-pass); needs glsl or glslPasses
 *   'context'   — draws to a 2D canvas context (text, stickers); needs canvas2d
 *   'reveal'    — composites a "window" over the current state; needs glsl
 *   'marker'    — invisible snapshot point used as a reveal effect's window source
 *
 * To add a new effect: create src/effects/myEffect.js, import it here, and add it to EFFECTS.
 */
export const EFFECTS = [
    transformEffect,
    cropEffect,
    colorPaletteEffect,
    doubleExposureEntryEffect,
    doubleExposureEffect,
    basicEffect,
    hueShiftEffect,
    digitizeEffect,
    grainEffect,
    chromaEffect,
    blurEffect,
    glowEffect,
    colorRemapEffect,
    lineGlitchEffect,
    textEffect,
    matrixRainEffect,
    smearTwistEffect,
    lineDragEffect,
    corruptedEffect,
    colorGelEffect,
    halftoneEffect,
    filmSoupMeltEffect,
    filmSoupEffect,
    barrelDistortionEffect,
    scanlinesEffect,
    kaleidoscopeEffect,
    viewportEntryEffect,
    viewportEffect,
    shapeStickerEffect,
    drawToolEffect,
    meshEffect,
    tunnelEffect,
    glassBlobEffect,
    cutEffect,
    wrinkleEffect,
    causticsEffect,
];

for (const effect of EFFECTS) validateEffect(effect);

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

/**
 * The user-browseable effect catalog.
 * Each entry: { name, label, description }
 */
// Order in which categories are rendered in the effect library.
export const EFFECT_CATEGORIES = ['Adjust', 'Morph', 'Overlay', 'Blend'];

export const EFFECT_CATALOG = [
    // ── Adjust ──
    { name: 'basic',          label: 'Basic Adjustments',    category: 'Adjust',  description: 'Brightness, contrast, saturation, and color' },
    { name: 'blur',           label: 'Blur',                 category: 'Adjust',  description: 'Gaussian blur shaped like a vignette — sharp center, soft edges' },
    { name: 'colorGel',      label: 'Color Gel',            category: 'Adjust',  description: 'Tint the image with a solid or gradient color gel' },
    { name: 'colorPalette',    label: 'Color Palette',         category: 'Adjust',  description: 'Define 8 custom colors that other effects can reference' },
    { name: 'crop',           label: 'Crop',                 category: 'Adjust',  description: 'Crop the image' },
    { name: 'glow',           label: 'Glow',                 category: 'Adjust',  description: 'Bloom halo around bright areas' },
    { name: 'grain',          label: 'Grain & Noise',        category: 'Adjust',  description: 'Analog film grain and digital noise types' },
    { name: 'hueShift',       label: 'Hue Shift',            category: 'Adjust',  description: 'Rotate all hues around the color wheel without quantizing' },

    // ── Morph ──
    { name: 'chroma',         label: 'Chromatic Aberration', category: 'Morph',   description: 'RGB channel separation glitch' },
    { name: 'barrelDistortion', label: 'Barrel Distortion',  category: 'Morph',   description: 'Barrel lens distortion' },
    { name: 'smearTwist',    label: 'Smear & Twist',        category: 'Morph',   description: 'Wet paint brush smear with wave-modulated displacement' },
    { name: 'digitize',       label: 'Digitize',             category: 'Morph',   description: 'Pixelation, color quantization, dithering, and noise' },
    { name: 'colorRemap',     label: 'Color Remap',          category: 'Morph',   description: 'Map pixel luminance or hue through a multi-stop color gradient' },
    { name: 'kaleidoscope',  label: 'Kaleidoscope',         category: 'Morph',   description: 'Mirror, radial symmetry, and kaleidoscope modes with drag handles' },
    { name: 'lineDrag',      label: 'Line Drag',            category: 'Morph',   description: 'Smear pixel columns or rows from a control line across the image' },
    { name: 'transform',      label: 'Transform',            category: 'Morph',   description: 'Flip and rotate' },
    { name: 'lineGlitch',     label: 'Line Glitch',          category: 'Morph',   description: 'Tracking line glitch bands' },

    // ── Overlay ──
    { name: 'corrupted',     label: 'Corrupted',            category: 'Overlay', description: 'Fractal square corruption spreading from seeded points' },
    { name: 'scanlines',      label: 'Scanlines',            category: 'Overlay', description: 'Horizontal scanline darkening' },
    { name: 'drawTool',     label: 'Draw',                 category: 'Overlay', description: 'Freehand pen with solid or static fill' },
    { name: 'matrixRain',   label: 'Matrix Rain',          category: 'Overlay', description: 'Tile text characters across the image in configurable grid patterns' },
    { name: 'mesh',         label: 'Mesh',                 category: 'Overlay', description: 'Draggable quad grid overlay with configurable line distribution' },
    { name: 'shapeSticker',   label: 'Shape Sticker',         category: 'Overlay', description: 'Apply a shape filled with solid color, static, or image grab' },
    { name: 'halftone',     label: 'Halftone',             category: 'Overlay', description: 'Dot, diamond, or ASCII halftone with linear, concentric, or luminance-driven size & spacing' },
    { name: 'text',            label: 'Text',                 category: 'Overlay', description: 'Text overlay with paragraph box, formatting, and canvas handles' },
    { name: 'tunnel',       label: 'Tunnel',               category: 'Overlay', description: 'Repeating shapes along a bezier path creating a tunnel illusion' },
    { name: 'glassBlob',    label: 'Glass Blob',           category: 'Overlay', description: 'A single glassy droplet you place, size and shape — refraction, highlight & color' },
    { name: 'cut',          label: 'Cut Out',              category: 'Overlay', description: 'Cut an ellipse/rectangle/triangle/polygon region out as a movable layer' },
    { name: 'wrinkle',      label: 'Wrinkle',              category: 'Overlay', description: 'Cellophane wrap / ripple overlay with refraction and ridge sheen' },
    { name: 'caustics',     label: 'Caustics',             category: 'Overlay', description: 'Underwater light caustics — the bright net of pool-bottom light lines' },

    // ── Blend ──
    { name: 'doubleExposure', label: 'Double Exposure',      category: 'Blend',   description: 'Blend two images together' },
    { name: 'filmSoup',      label: 'Film Soup',            category: 'Blend',   description: 'Bubble/foam holes that melt through the effects above the melt point' },
    { name: 'viewport',      label: 'Viewport',             category: 'Blend',   description: 'Reveal a shaped window that cuts through selected effects' },

    // { name: 'moire',        label: 'Moire',                description: 'Two overlapping line grids that interfere to produce wave and band patterns' },
    //{ name: 'vignette',       label: 'Vignette',             description: 'Edge darkening or brightening' },
];

/**
 * Return default params for a named effect, or null if not found.
 */
export function getEffectDefaults(effectName) {
    const effect = EFFECTS.find(e => e.name === effectName);
    if (!effect) return null;
    const defaults = {};
    for (const [key, schema] of Object.entries(effect.params)) {
        defaults[key] = schema.default;
    }
    return defaults;
}

/**
 * Find an effect definition by name.
 */
export function getEffect(effectName) {
    return EFFECTS.find(e => e.name === effectName) || null;
}
