// Redact — strips an image of hidden data, tracking, and metadata before the
// user shares, uploads, or saves it. SINGLETON.
//
// The defensive counter-tool to BXTRXT's own Embed (Hidden) and Metadata effects (and to
// third-party stego / EXIF in incoming images). Renders nothing; a pass-through whose params
// are consumed at export time (src/ui/export.js), exactly like Embed (Hidden) and Metadata.
//
// What it removes:
//   • Hidden pixel payloads — LSB steganography (standard + keyed) and the robust DCT
//     watermark — via src/util/launder.js (randomizes the LSB plane + scrambles the
//     mid-frequency band). Invisible at default strength.
//   • File metadata — EXIF / XMP / IPTC / GPS / thumbnails / PNG text chunks — and any
//     trailing appended data (polyglots). These are discarded for free because export rebuilds
//     the file from canvas pixels; Launder additionally suppresses the Metadata effect.
//   • Optionally, fragile / unknown stego — via a JPEG re-encode ("harden").
//
// When Launder is enabled it supersedes Embed (Hidden) and (unless "Keep metadata fields" is
// on) Metadata: laundering an image you also asked to embed into would be contradictory.

export const cloakEffect = {
    name: 'cloak',
    label: 'Redact',
    kind: 'glsl',
    singleton: true,
    paramKeys: [],
    params: {
        cloakEnabled:       { default: false, label: 'Enable' },
        cloakScrubHidden:   { default: true,  label: 'Scrub hidden data (LSB + watermark)' },
        cloakStripMetadata: { default: true,  label: 'Strip metadata (EXIF/XMP/GPS)' },
        cloakStrength:      { default: 'medium', label: 'Strength', options: [['low', 'Low (most invisible)'], ['medium', 'Medium'], ['high', 'High (most thorough)']] },
        cloakHarden:        { default: false, label: 'Harden (re-encode JPEG — max scrub)' },
    },
    // Never renders — the work happens at export. Kept out of the render pass entirely.
    enabled: () => false,
    uiGroups: [
        { label: 'Protections', keys: ['cloakScrubHidden', 'cloakStripMetadata'] },
        { label: 'Strength', keys: ['cloakStrength'] },
        { label: 'Output', keys: ['cloakHarden'] },
    ],
    glsl: `void main() { fragColor = texture(uTex, vUV); }`,
};
