// Launder — destroy hidden data embedded in an image's PIXELS.
//
// The counter-tool to BXTRXT's Embed (Hidden) effect. Two pixel-domain vectors are scrubbed:
//
//   • LSB steganography (steg.js — both the 'standard' and key-scattered 'bxtrxt' schemes).
//     Both write bit 0 of every R/G/B channel; randomizing that bit destroys the payload
//     regardless of scheme or key (a random LSB plane fails the container's CRC). Higher
//     strength scrubs more low bits, covering third-party 2-bit LSB tools too.
//
//   • Robust DCT watermark (robustWatermark.js) — scrambled via launderRobust.
//
// Container/file metadata (EXIF/XMP/PNG text) and trailing appended data are NOT handled here:
// they live in the file bytes, not the pixels, and are discarded for free when the export
// rebuilds the file from a canvas (see src/ui/export.js). This module is pixel-only.
//
// The scrub runs at export time on the final full-resolution ImageData — bit-exact CPU work,
// same precedent as embedRobust/encodePayload already in the export path.

import { decodePayload } from './steg.js';
import { decodeRobust, launderRobust } from './robustWatermark.js';
import { readAllMetadata } from './imageMeta.js';

// Low bits of each channel to randomize, per strength. BXTRXT's steg uses only bit 0, so 1 bit
// suffices for it; 2–3 bits covers common third-party LSB tools while staying visually
// negligible (max change 3/255 at medium, 7/255 at high).
const LSB_BITS = { low: 1, medium: 2, high: 3 };

// Randomize the low `bits` bits of every R/G/B channel (alpha untouched). Overwrites any LSB
// payload with noise so no bit order / key can recover it.
function scrubLSB(data, bits) {
    const keepMask = (0xff << bits) & 0xff; // clear the low `bits` bits
    const range = 1 << bits;
    for (let i = 0; i < data.length; i += 4) {
        data[i]     = (data[i]     & keepMask) | ((Math.random() * range) | 0);
        data[i + 1] = (data[i + 1] & keepMask) | ((Math.random() * range) | 0);
        data[i + 2] = (data[i + 2] & keepMask) | ((Math.random() * range) | 0);
    }
}

/**
 * Scrub hidden pixel payloads from imageData in place.
 * @param {ImageData} imageData
 * @param {object} [opts]
 * @param {boolean} [opts.scrubHidden=true]  run LSB scrub + robust-watermark scramble
 * @param {'low'|'medium'|'high'} [opts.strength='medium']
 */
export function launderImageData(imageData, { scrubHidden = true, strength = 'medium' } = {}) {
    if (!scrubHidden) return;
    // Robust scramble first (it adds a band-limited luminance delta, re-rounding pixels), then
    // LSB scrub last so the least-significant bits are guaranteed random in the final buffer.
    launderRobust(imageData, { strength });
    scrubLSB(imageData.data, LSB_BITS[strength] ?? LSB_BITS.medium);
}

/**
 * Report what hidden data / metadata is currently detectable — used for before/after
 * verification. Best-effort and blind: the LSB probe has no key, so it detects the documented
 * 'standard' scheme (and encrypted payloads as "present"); the scrub still destroys keyed
 * payloads even though this probe can't read them.
 * @param {ImageData} imageData  pixels to probe for LSB / watermark payloads
 * @param {Uint8Array} [bytes]   encoded file bytes to probe for container metadata
 * @returns {Promise<{lsb: object|null, robust: object|null, metadata: object|null, clean: boolean}>}
 */
export async function auditImage(imageData, bytes) {
    let robust = null;
    try { robust = decodeRobust(imageData); } catch { /* none */ }

    let lsb = null;
    try { lsb = await decodePayload(imageData, {}); } catch { /* encrypted/corrupt — treat as none */ }

    let metadata = null;
    if (bytes) {
        try {
            const m = readAllMetadata(bytes);
            const has = Object.keys(m.text).length || Object.keys(m.exif).length || m.xmp;
            metadata = has ? m : null;
        } catch { /* unreadable */ }
    }

    return { lsb, robust, metadata, clean: !lsb && !robust && !metadata };
}
