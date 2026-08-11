// Cipher — an ARG text-encoding tool that lives as an effect-stack card but does NOT touch the
// image. The artist types a message, builds a reorderable recipe of encoding steps, and copies
// the output to paste into one of the app's text effects.
//
// It is a `context` effect with a no-op canvas2d and `enabled: () => false`, so it never renders
// anything to the canvas. All state is JSON-serializable params (captured by undo/preset
// snapshots). The card's UI is built by buildCipherControls (src/ui/cipherControls.js), invoked
// from buildEffectBody in stackControls.js. `uiGroups: () => []` suppresses the generic control
// loop so the custom builder owns the whole body.

export const cipherEffect = {
    name: 'cipher',
    label: 'Cipher',
    kind: 'context',
    canvas2d: () => {},          // no-op: never alters the image
    enabled: () => false,        // never participates in rendering
    uiGroups: () => [],          // custom UI only (see cipherControls.js)
    params: {
        cipherSource: { default: '' },     // the message being encoded/decoded
        cipherDecode: { default: false },  // false = encode, true = decode (reverse the recipe)
        cipherRecipe: { default: '[]' },   // JSON string: array of { id, type, cfg } steps
    },
};
