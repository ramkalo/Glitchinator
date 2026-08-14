// Live cut-capture registry. The Cut layer stashes the pixels under its shape here every
// render (keyed by its instance id); the linked Paste layer reads them the same pass.
// Import-free so both cut.js and paste.js can share it without cycles.
//
// The pipeline calls clearAllCutCaptures() at the start of each render (webgl.js _runEffects),
// so a Paste is only fed when its Cut has already run earlier in the pass — which enforces the
// "Cut above Paste" order and prevents a capture → paste → capture feedback loop.

const _captures = new Map();   // cutInstId → { canvas, natW, natH }

export function setCutCapture(id, entry) { if (id) _captures.set(id, entry); }
export function getCutCapture(id)        { return (id && _captures.get(id)) || null; }
export function clearCutCapture(id)      { _captures.delete(id); }
export function clearAllCutCaptures()    { _captures.clear(); }
