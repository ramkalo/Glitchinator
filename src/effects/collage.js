import { canvas } from '../renderer/glstate.js';
import { buildFadeControl, buildBlendControl } from './controls/index.js';
import { computeGridCells } from './gridLayout.js';

const fade  = buildFadeControl('collage');
const blend = buildBlendControl('collage');

// ── Session-only image store ────────────────────────────────────────────────
// Loaded cell images are kept in memory keyed by effect instance id (like the
// palette reference-image loader). They are NOT serialized into params, so they
// don't bloat undo snapshots/presets and don't survive a page reload — an
// accepted trade-off for speed. Each entry: { bitmap: ImageBitmap, name: string }.
// The array index is the cell slot (row*cols + col).
const _images = new Map(); // instId -> Array<{bitmap, name} | null>

export function getCollageImages(instId) {
    let arr = _images.get(instId);
    if (!arr) { arr = []; _images.set(instId, arr); }
    return arr;
}

export function setCollageImage(instId, slot, entry) {
    const arr = getCollageImages(instId);
    arr[slot] = entry;
}

export function clearCollageImage(instId, slot) {
    const arr = getCollageImages(instId);
    if (arr[slot]) { arr[slot].bitmap?.close?.(); arr[slot] = null; }
}

// Move an image entry from one slot to another, shifting the entries in between
// (list-reorder semantics for the drag handle).
export function moveCollageImage(instId, from, to) {
    const arr = getCollageImages(instId);
    if (from === to) return;
    const max = Math.max(from, to);
    while (arr.length <= max) arr.push(null);
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
}

// Swap the entries in two slots (swap semantics for the on-canvas grid drag).
// Null-safe: swapping with an empty slot simply moves the image there.
export function swapCollageImage(instId, a, b) {
    if (a === b) return;
    const arr = getCollageImages(instId);
    const max = Math.max(a, b);
    while (arr.length <= max) arr.push(null);
    const tmp = arr[a];
    arr[a] = arr[b];
    arr[b] = tmp;
}

// Free an instance's images when its effect is removed (called from the UI clear-all).
export function disposeCollageImages(instId) {
    const arr = _images.get(instId);
    if (arr) for (const e of arr) e?.bitmap?.close?.();
    _images.delete(instId);
}

function applyCollage(ctx, p) {
    const w = canvas.width;
    const h = canvas.height;
    const cells = computeGridCells(w, h, p.collageCols, p.collageRows);
    const imgs = _images.get(p._instanceId);
    if (!imgs) return;
    for (const cell of cells) {
        const entry = imgs[cell.index];
        if (!entry?.bitmap) continue; // empty cell → transparent → underlying image shows through
        // Stretch the image to exactly fill the cell (non-uniform scale = "skew to fit").
        ctx.drawImage(entry.bitmap, cell.x, cell.y, cell.w, cell.h);
    }
}

export const collageEffect = {
    name:        'collage',
    label:       'Collage',
    kind:        'context',
    blendPrefix: 'collage',
    bindUniforms: (gl, prog, p) => { fade.bindUniforms(gl, prog, p); blend.bindUniforms(gl, prog, p); },
    paramKeys: [
        ...fade.paramKeys,
        ...blend.paramKeys,
    ],
    handleParams: [
        ...fade.handleParams,
    ],
    overlays: { fade: fade.overlay },
    params: {
        collageEnabled: { default: false, label: 'Enable' },
        collageCols:    { default: 3, min: 1, max: 12, label: 'Columns' },
        collageRows:    { default: 3, min: 1, max: 12, label: 'Rows' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.collageEnabled,
    uiGroups: (p) => [
        { label: 'Grid', keys: ['collageCols', 'collageRows'] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    canvas2d: applyCollage,
};
