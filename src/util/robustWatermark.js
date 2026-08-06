// Robust (compression-surviving) hidden text for BXTRXT.
//
// LSB steg dies when a chat app re-encodes/downscales an image. This is a blind, size-
// normalized DCT watermark that carries a SHORT text payload through moderate JPEG + resize.
// It is best-effort — text-only, low capacity, and not guaranteed against extreme downscaling.
//
// How it works:
//   • Normalize: both embed and decode resample the image's luminance to a fixed N×N grid, so
//     uniform resizing by the chat app is undone.
//   • Embed: 2D DCT of the N×N luminance; payload bits are written into a band of MID-frequency
//     coefficients (skip DC/low = brightness, skip highest = JPEG kills them) via QIM — each
//     coefficient is quantized to an even/odd multiple of a step Δ to carry a bit. Each bit is
//     repeated across many coefficients (majority vote on decode). Inverse DCT → a band-limited
//     delta pattern, upsampled to full resolution and added to luminance (equally to R/G/B).
//   • Decode (blind, no key/original): resample → DCT → read the coefficient parities, majority
//     vote per bit, validate a CRC16. Δ isn't transmitted, so decode tries each candidate Δ and
//     accepts the one whose CRC validates.
//
// Payload block (fixed BLOCK_BITS): [len:1][utf8 text][zero-pad][crc16:2]. Plaintext (AES
// overhead would swamp the tiny channel).

const N = 256;                 // canonical normalized size
const R_LO = 20, R_HI = 100;   // mid-frequency annulus (radius in DCT-coefficient space)
const BLOCK_BITS = 256;        // payload block size
const BYTES = BLOCK_BITS / 8;  // 32
const CAP = BYTES - 3;         // 29 usable text bytes (len byte + text + crc16)

// Strength → Δ. The decoder tries all of these, so the embed Δ must be one of them.
export const STRENGTH_DELTAS = { low: 9, medium: 14, high: 20 };
const DELTA_CANDIDATES = Object.values(STRENGTH_DELTAS);

const enc = new TextEncoder();
const dec = new TextDecoder();

const clamp255 = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
const parity = (q) => ((q % 2) + 2) % 2;

// ── orthonormal separable DCT-II / inverse ────────────────────────────────────

const Cmat = (() => {
    const m = new Float64Array(N * N);
    const piN = Math.PI / N;
    for (let k = 0; k < N; k++) {
        const a = k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
        for (let n = 0; n < N; n++) m[k * N + n] = a * Math.cos(piN * (n + 0.5) * k);
    }
    return m;
})();

function apply1D(inp, out, forward) {
    if (forward) {
        for (let k = 0; k < N; k++) { let s = 0; for (let n = 0; n < N; n++) s += Cmat[k * N + n] * inp[n]; out[k] = s; }
    } else {
        for (let n = 0; n < N; n++) { let s = 0; for (let k = 0; k < N; k++) s += Cmat[k * N + n] * inp[k]; out[n] = s; }
    }
}

function transform2D(data, forward) {
    const tmp = new Float64Array(N * N);
    const a = new Float64Array(N), b = new Float64Array(N);
    for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) a[c] = data[r * N + c];
        apply1D(a, b, forward);
        for (let c = 0; c < N; c++) tmp[r * N + c] = b[c];
    }
    const out = new Float64Array(N * N);
    for (let c = 0; c < N; c++) {
        for (let r = 0; r < N; r++) a[r] = tmp[r * N + c];
        apply1D(a, b, forward);
        for (let r = 0; r < N; r++) out[r * N + c] = b[r];
    }
    return out;
}

// Mid-frequency coefficient indices, deterministic order.
const BAND = (() => {
    const list = [];
    for (let u = 0; u < N; u++) {
        for (let v = 0; v < N; v++) {
            const r = Math.hypot(u, v);
            if (r >= R_LO && r < R_HI) list.push(u * N + v);
        }
    }
    return list;
})();
const REP = Math.floor(BAND.length / BLOCK_BITS); // coefficients per bit (majority vote depth)

// ── payload block ──────────────────────────────────────────────────────────────

function crc16(bytes) {
    let c = 0xffff;
    for (let i = 0; i < bytes.length; i++) {
        c ^= bytes[i] << 8;
        for (let k = 0; k < 8; k++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
    return c & 0xffff;
}

function buildBlock(text) {
    const t = enc.encode(text);
    if (t.length > CAP) {
        throw new Error(`Robust hidden text is too long: ${t.length} bytes, max ${CAP}. Use a shorter message or URL.`);
    }
    const block = new Uint8Array(BYTES);
    block[0] = t.length;
    block.set(t, 1);
    const crc = crc16(block.subarray(0, BYTES - 2));
    block[BYTES - 2] = (crc >> 8) & 255;
    block[BYTES - 1] = crc & 255;
    return block;
}

function bytesToBits(bytes) {
    const bits = new Uint8Array(bytes.length * 8);
    for (let i = 0; i < bytes.length; i++) for (let k = 0; k < 8; k++) bits[i * 8 + k] = (bytes[i] >> (7 - k)) & 1;
    return bits;
}
function bitsToBytes(bits) {
    const out = new Uint8Array(bits.length / 8);
    for (let i = 0; i < out.length; i++) { let b = 0; for (let k = 0; k < 8; k++) b = (b << 1) | bits[i * 8 + k]; out[i] = b; }
    return out;
}

// ── luminance resample / delta application ────────────────────────────────────

function resampleLum(imageData) {
    const { width: w, height: h, data } = imageData;
    const lum = new Float64Array(N * N);
    const Y = (xx, yy) => {
        const cx = xx < 0 ? 0 : xx > w - 1 ? w - 1 : xx;
        const cy = yy < 0 ? 0 : yy > h - 1 ? h - 1 : yy;
        const o = (cy * w + cx) * 4;
        return 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    };
    for (let j = 0; j < N; j++) {
        const sy = (j + 0.5) / N * h - 0.5, y0 = Math.floor(sy), fy = sy - y0;
        for (let i = 0; i < N; i++) {
            const sx = (i + 0.5) / N * w - 0.5, x0 = Math.floor(sx), fx = sx - x0;
            lum[j * N + i] =
                Y(x0, y0) * (1 - fx) * (1 - fy) + Y(x0 + 1, y0) * fx * (1 - fy) +
                Y(x0, y0 + 1) * (1 - fx) * fy + Y(x0 + 1, y0 + 1) * fx * fy;
        }
    }
    return lum;
}

function applyDelta(imageData, dN) {
    const { width: w, height: h, data } = imageData;
    const D = (xx, yy) => {
        const cx = xx < 0 ? 0 : xx > N - 1 ? N - 1 : xx;
        const cy = yy < 0 ? 0 : yy > N - 1 ? N - 1 : yy;
        return dN[cy * N + cx];
    };
    for (let y = 0; y < h; y++) {
        const sy = (y + 0.5) / h * N - 0.5, y0 = Math.floor(sy), fy = sy - y0;
        for (let x = 0; x < w; x++) {
            const sx = (x + 0.5) / w * N - 0.5, x0 = Math.floor(sx), fx = sx - x0;
            const dv =
                D(x0, y0) * (1 - fx) * (1 - fy) + D(x0 + 1, y0) * fx * (1 - fy) +
                D(x0, y0 + 1) * (1 - fx) * fy + D(x0 + 1, y0 + 1) * fx * fy;
            const o = (y * w + x) * 4;
            data[o]     = clamp255(data[o] + dv);
            data[o + 1] = clamp255(data[o + 1] + dv);
            data[o + 2] = clamp255(data[o + 2] + dv);
        }
    }
}

// ── public API ────────────────────────────────────────────────────────────────

/** Rough usable text capacity, in bytes, for the robust scheme. */
export const robustCapacity = CAP;

/**
 * Embed short text into imageData (mutates it in place).
 * @param {ImageData} imageData
 * @param {string} text
 * @param {{strength?: 'low'|'medium'|'high'}} [opts]
 */
export function embedRobust(imageData, text, { strength = 'medium' } = {}) {
    const delta = STRENGTH_DELTAS[strength] ?? STRENGTH_DELTAS.medium;
    const bits = bytesToBits(buildBlock(text));

    const lum = resampleLum(imageData);
    const coef = transform2D(lum, true);
    for (let i = 0; i < BLOCK_BITS; i++) {
        const b = bits[i];
        for (let t = 0; t < REP; t++) {
            const idx = BAND[i + t * BLOCK_BITS];
            const f = coef[idx] / delta;
            let q = Math.round(f);
            if (parity(q) !== b) q = (f - (q - 1) <= (q + 1) - f) ? q - 1 : q + 1;
            coef[idx] = q * delta;
        }
    }
    const lum2 = transform2D(coef, false);
    const dN = new Float64Array(N * N);
    for (let p = 0; p < N * N; p++) dN[p] = lum2[p] - lum[p];
    applyDelta(imageData, dN);
}

// Scramble amplitude per strength (added to every mid-frequency band coefficient). Chosen
// relative to the largest embed Δ (20): amplitudes at/above it randomize each coefficient's
// QIM parity, so the majority-vote decode returns noise and the CRC16 fails. Higher = more
// certain destruction but more visible mid-frequency texture.
const SCRAMBLE_AMP = { low: 12, medium: 20, high: 32 };

/**
 * Destroy any robust DCT watermark in imageData (mutates in place). Counterpart to
 * embedRobust: instead of writing bits, it randomizes the parities of the entire mid-frequency
 * band so decodeRobust can no longer recover a payload at ANY candidate Δ. Reuses the same
 * resample → DCT → band → inverse → apply-delta path, so the change is band-limited luminance
 * noise rather than broadband grain.
 * @param {ImageData} imageData
 * @param {{strength?: 'low'|'medium'|'high'}} [opts]
 */
export function launderRobust(imageData, { strength = 'medium' } = {}) {
    const amp = SCRAMBLE_AMP[strength] ?? SCRAMBLE_AMP.medium;
    const lum = resampleLum(imageData);
    const coef = transform2D(lum, true);
    for (let i = 0; i < BAND.length; i++) {
        coef[BAND[i]] += (Math.random() * 2 - 1) * amp;
    }
    const lum2 = transform2D(coef, false);
    const dN = new Float64Array(N * N);
    // Only BAND coefficients changed, so the inverse difference is exactly the band-limited
    // perturbation — everything outside the mid-frequency annulus is untouched.
    for (let p = 0; p < N * N; p++) dN[p] = lum2[p] - lum[p];
    applyDelta(imageData, dN);
}

/**
 * Try to recover robust-watermarked text from imageData. Blind (no key/original).
 * @returns {{text: string} | null}
 */
export function decodeRobust(imageData) {
    const coef = transform2D(resampleLum(imageData), true);
    for (const delta of DELTA_CANDIDATES) {
        const bits = new Uint8Array(BLOCK_BITS);
        for (let i = 0; i < BLOCK_BITS; i++) {
            let ones = 0;
            for (let t = 0; t < REP; t++) {
                if (parity(Math.round(coef[BAND[i + t * BLOCK_BITS]] / delta)) === 1) ones++;
            }
            bits[i] = ones * 2 >= REP ? 1 : 0;
        }
        const bytes = bitsToBytes(bits);
        const crc = crc16(bytes.subarray(0, BYTES - 2));
        if (crc === ((bytes[BYTES - 2] << 8) | bytes[BYTES - 1])) {
            const len = bytes[0];
            if (len <= CAP) return { text: dec.decode(bytes.subarray(1, 1 + len)) };
        }
    }
    return null;
}
