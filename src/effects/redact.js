// Redact — strips an image of hidden data, tracking, and metadata before the
// user shares, uploads, or saves it. SINGLETON.
//
// The defensive counter-tool to BXTRXT's own Cloak and Overwrite effects (and to
// third-party stego / EXIF in incoming images). Renders nothing; a pass-through whose params
// are consumed at export time (src/ui/export.js), exactly like Cloak and Overwrite.
//
// What it removes:
//   • Hidden pixel payloads — LSB steganography (standard + keyed) and the robust DCT
//     watermark — via src/util/launder.js (randomizes the LSB plane + scrambles the
//     mid-frequency band). Invisible at default strength.
//   • File metadata — EXIF / XMP / IPTC / GPS / thumbnails / PNG text chunks — and any
//     trailing appended data (polyglots). These are discarded for free because export rebuilds
//     the file from canvas pixels; Redact additionally suppresses the Overwrite effect.
//   • Optionally, fragile / unknown stego — via a JPEG re-encode ("harden").
//
// When Redact is enabled it supersedes Cloak and (unless "Keep metadata fields" is
// on) Overwrite: laundering an image you also asked to embed into would be contradictory.

export const redactEffect = {
    name: 'redact',
    label: 'Redact',
    kind: 'glsl',
    singleton: true,
    paramKeys: [],
    params: {
        redactEnabled:       { default: false, label: 'Enable' },
        redactScrubHidden:   { default: true,  label: 'Scrub hidden data (LSB + watermark)' },
        redactStripMetadata: { default: true,  label: 'Strip metadata (EXIF/XMP/GPS)' },
        redactStrength:      { default: 'medium', label: 'Strength', options: [['low', 'Low (most invisible)'], ['medium', 'Medium'], ['high', 'High (most thorough)']] },
        redactHarden:        { default: false, label: 'Harden (re-encode JPEG — max scrub)' },
    },
    // Never renders — the work happens at export. Kept out of the render pass entirely.
    enabled: () => false,
    uiGroups: [
        { label: 'Protections', keys: ['redactScrubHidden', 'redactStripMetadata'] },
        { label: 'Strength', keys: ['redactStrength'] },
        { label: 'Output', keys: ['redactHarden'] },
    ],
    glsl: `void main() { fragColor = texture(uTex, vUV); }`,
};
