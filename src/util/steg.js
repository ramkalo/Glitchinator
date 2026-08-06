// Steganography for BXTRXT — a palette of in-pixel embedding schemes.
//
// All schemes write the same container (below) and are gated on decode by a trailing CRC32, so
// the decoder can blindly try each one and accept only the scheme whose CRC validates.
//
//   'standard'   — plain LSB of R,G,B (alpha skipped), natural row-major order, MSB-first per
//                  byte. Documented & third-party-readable. Optionally AES-GCM encrypted.
//   'randomized' — same LSB channel, but the bit positions are scattered across the whole image
//                  by a password-seeded full-cycle stride (start + i*stride mod N, stride coprime
//                  to N). Without the password the payload's location is unknown. (Formerly the
//                  'bxtrxt' scheme — old presets migrate to 'randomized'; the value is still
//                  accepted here for safety.)
//   'edge'       — LSB, but only in the R,G,B of high-gradient (textured) pixels found by a Sobel
//                  filter run on the HIGH bits of luminance (LSB masked off) so embedding can't
//                  move the edge map. Harder to spot; capacity depends on image detail. Optional
//                  password permutes the eligible slots.
//   'pvd'        — pixel-value differencing. Adjacent same-channel pixel pairs carry a variable
//                  number of bits chosen from a range table over |p2-p1| — more bits where local
//                  contrast is high (textured). Reversible min-anchor variant (see writePVD).
//
// All four are SPATIAL and PNG-only: they need exact pixels, so any JPEG re-encode / resize /
// screenshot (e.g. a social-media repost) destroys them. For a payload that must survive a
// repost, use the frequency-domain scheme in robustWatermark.js instead.
//
// Container (bytes written into the image), identical for every scheme. No readable magic marker —
// a trailing CRC32 both validates the payload and disambiguates which scheme/order produced it:
//   byte  0     flags:  bit0 = encrypted, bits1..2 = type (1 = text, 2 = image)
//   bytes 1..4  length: big-endian uint32, byte-length of the payload that follows
//   bytes 5..   payload: UTF-8 text, or (for images) a UTF-8 `data:` URL string.
//                        When encrypted: 16-byte salt + 12-byte IV + AES-GCM ciphertext.
//   last 4      crc32:   CRC32 of the payload (big-endian). Decode accepts only on a match.
//
// Legacy: images exported before the CRC format used a leading "BXS1"/"BXK1" magic + length
// header (no CRC). decodePayload still reads those via a fallback; new writes never use it.

export const SCHEME = { STANDARD: 'standard', RANDOMIZED: 'randomized', EDGE: 'edge', PVD: 'pvd' };
const LEGACY_RANDOMIZED = 'bxtrxt';   // pre-rename value for the randomized scheme
export const PTYPE  = { TEXT: 1, IMAGE: 2 };

// Legacy magic markers — read-only, for images exported before the CRC format.
const MAGIC_STD = [0x42, 0x58, 0x53, 0x31]; // "BXS1"
const MAGIC_KEY = [0x42, 0x58, 0x4b, 0x31]; // "BXK1"
const LEGACY_HEADER_LEN = 9;   // magic(4) + flags(1) + length(4)

const PREFIX_LEN = 5;          // flags(1) + length(4), written before the payload
const CRC_LEN    = 4;          // crc32 written after the payload
const HEADER_LEN = PREFIX_LEN + CRC_LEN; // total non-payload overhead (9 bytes)

// Table-based CRC32 (mirrors the one in imageMeta.js; kept inline so this file is standalone).
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

// ── crypto (Web Crypto, no dependency) ────────────────────────────────────────

async function deriveKey(passphrase, salt) {
    const keyMat = await crypto.subtle.importKey(
        'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encryptBytes(bytes, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveKey(passphrase, salt);
    const ct   = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
    const out  = new Uint8Array(28 + ct.length);
    out.set(salt, 0); out.set(iv, 16); out.set(ct, 28);
    return out;
}

async function decryptBytes(bytes, passphrase) {
    const salt = bytes.slice(0, 16);
    const iv   = bytes.slice(16, 28);
    const ct   = bytes.slice(28);
    const key  = await deriveKey(passphrase, salt);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
}

// ── container ─────────────────────────────────────────────────────────────────

// Build [flags][len:4][payload][crc32:4] from the payload bytes. Shared by every scheme.
function buildContainer(bytes, type, encrypted) {
    const L = bytes.length;
    const crc = crc32(bytes);
    const container = new Uint8Array(HEADER_LEN + L);
    container[0] = (encrypted ? 1 : 0) | (type << 1);
    container[1] = (L >>> 24) & 255;
    container[2] = (L >>> 16) & 255;
    container[3] = (L >>> 8) & 255;
    container[4] = L & 255;
    container.set(bytes, PREFIX_LEN);
    const co = PREFIX_LEN + L;
    container[co]     = (crc >>> 24) & 255;
    container[co + 1] = (crc >>> 16) & 255;
    container[co + 2] = (crc >>> 8) & 255;
    container[co + 3] = crc & 255;
    return container;
}

// ── bit-plane addressing (standard / randomized) ──────────────────────────────

// Number of usable LSB slots (R,G,B of every pixel; alpha skipped).
function slotCount(imageData) {
    return (imageData.data.length / 4) * 3;
}

// Byte offset in the RGBA array for logical slot `s` (s counts R,G,B, skipping A).
function slotToByte(s) {
    const pixel = (s / 3) | 0;
    const chan  = s % 3;
    return pixel * 4 + chan;
}

function hashKey(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }

// A key-seeded (start, stride) that visits every slot exactly once.
function keyedParams(key, n) {
    const seed = hashKey(String(key)) || 1;
    let stride = (seed % n) || 1;
    while (gcd(stride, n) !== 1) stride = (stride + 1) % n || 1;
    return { start: seed % n, stride };
}

// Returns a function mapping the i-th written bit to a physical slot index.
function makeIndexer(scheme, n, key) {
    if (scheme === SCHEME.RANDOMIZED || scheme === LEGACY_RANDOMIZED) {
        const { start, stride } = keyedParams(key, n);
        return (i) => (start + i * stride) % n;
    }
    return (i) => i;
}

// ── read / write (standard / randomized) ──────────────────────────────────────

function writeContainer(imageData, container, scheme, key) {
    const data = imageData.data;
    const n = slotCount(imageData);
    const totalBits = container.length * 8;
    if (totalBits > n) {
        const capBytes = ((n / 8) | 0) - HEADER_LEN;
        throw new Error(`Payload too large for this image: needs ${container.length} bytes, ` +
                        `capacity is ~${Math.max(0, capBytes)} bytes. Use a bigger image or a shorter payload.`);
    }
    const idx = makeIndexer(scheme, n, key);
    let bit = 0;
    for (let b = 0; b < container.length; b++) {
        const byte = container[b];
        for (let k = 7; k >= 0; k--) {
            const slot = idx(bit++);
            const off  = slotToByte(slot);
            data[off]  = (data[off] & 0xfe) | ((byte >> k) & 1);
        }
    }
}

function readBits(data, idx, startBit, byteCount) {
    const out = new Uint8Array(byteCount);
    let bit = startBit;
    for (let b = 0; b < byteCount; b++) {
        let byte = 0;
        for (let k = 0; k < 8; k++) {
            byte = (byte << 1) | (data[slotToByte(idx(bit++))] & 1);
        }
        out[b] = byte;
    }
    return out;
}

function magicMatches(header, magic) {
    return magic.every((m, i) => header[i] === m);
}

// ── edge-adaptive (Sobel) ──────────────────────────────────────────────────────

const EDGE_THRESHOLD = 24;   // |gx|+|gy| on bit0-masked luma above which a pixel counts as textured

// Ordered list of physical byte offsets (R,G,B LSBs of textured pixels) to embed into. Computed
// from luminance built out of the HIGH bits only, so writing the LSB never changes the result —
// the decoder recomputes the identical order from the stego image. Optionally permuted by `key`.
function edgeSlotOffsets(imageData, key) {
    const { width: w, height: h, data } = imageData;
    if (w < 3 || h < 3) return [];
    const luma = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        luma[p] = ((data[i] & 0xfe) * 77 + (data[i + 1] & 0xfe) * 150 + (data[i + 2] & 0xfe) * 29) >> 8;
    }
    const offsets = [];
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const o = y * w + x;
            const gx = -luma[o - w - 1] - 2 * luma[o - 1] - luma[o + w - 1]
                       + luma[o - w + 1] + 2 * luma[o + 1] + luma[o + w + 1];
            const gy = -luma[o - w - 1] - 2 * luma[o - w] - luma[o - w + 1]
                       + luma[o + w - 1] + 2 * luma[o + w] + luma[o + w + 1];
            if (Math.abs(gx) + Math.abs(gy) >= EDGE_THRESHOLD) {
                const base = o * 4;
                offsets.push(base, base + 1, base + 2);
            }
        }
    }
    if (key) permuteInPlace(offsets, key);
    return offsets;
}

// Key-seeded full-cycle reorder of an array (bijection; stride coprime to length).
function permuteInPlace(arr, key) {
    const n = arr.length;
    if (n < 2) return;
    const { start, stride } = keyedParams(key, n);
    const src = arr.slice();
    for (let i = 0; i < n; i++) arr[i] = src[(start + i * stride) % n];
}

function writeEdge(imageData, container, key) {
    const offsets = edgeSlotOffsets(imageData, key);
    if (container.length * 8 > offsets.length) {
        const cap = ((offsets.length / 8) | 0) - HEADER_LEN;
        throw new Error(`Payload too large for the textured area: needs ${container.length} bytes, ` +
                        `capacity is ~${Math.max(0, cap)} bytes. Use a more detailed image, a shorter payload, or another scheme.`);
    }
    const data = imageData.data;
    let bit = 0;
    for (let b = 0; b < container.length; b++) {
        const byte = container[b];
        for (let k = 7; k >= 0; k--) {
            const off = offsets[bit++];
            data[off] = (data[off] & 0xfe) | ((byte >> k) & 1);
        }
    }
}

function tryDecodeEdge(imageData, key) {
    const offsets = edgeSlotOffsets(imageData, key);
    if (offsets.length < PREFIX_LEN * 8) return null;
    const data = imageData.data;
    const readOffsetBytes = (startBit, byteCount) => {
        const out = new Uint8Array(byteCount);
        let bit = startBit;
        for (let b = 0; b < byteCount; b++) {
            let byte = 0;
            for (let k = 0; k < 8; k++) byte = (byte << 1) | (data[offsets[bit++]] & 1);
            out[b] = byte;
        }
        return out;
    };
    const prefix = readOffsetBytes(0, PREFIX_LEN);
    const len = ((prefix[1] << 24) | (prefix[2] << 16) | (prefix[3] << 8) | prefix[4]) >>> 0;
    if (len === 0 || (HEADER_LEN + len) * 8 > offsets.length) return null;
    const body = readOffsetBytes(PREFIX_LEN * 8, len + CRC_LEN);
    const payload = body.subarray(0, len);
    const crcRead = ((body[len] << 24) | (body[len + 1] << 16) | (body[len + 2] << 8) | body[len + 3]) >>> 0;
    if (crc32(payload) !== crcRead) return null;
    const flags = prefix[0];
    return { type: (flags >> 1) & 3, encrypted: (flags & 1) === 1, bytes: payload.slice() };
}

// ── PVD (pixel-value differencing) ─────────────────────────────────────────────

// Range table (Wu & Tsai). Wider range = higher local contrast = more bits.
const PVD_RANGES = [[0, 7], [8, 15], [16, 31], [32, 63], [64, 127], [128, 255]];
function pvdRange(m) {
    for (const r of PVD_RANGES) if (m >= r[0] && m <= r[1]) return r;
    return PVD_RANGES[PVD_RANGES.length - 1];
}
const pvdBits = (r) => Math.floor(Math.log2(r[1] - r[0] + 1));   // 3,3,4,5,6,7

// Visit non-overlapping same-channel pixel pairs (R, then G, then B) in raster order.
function pvdWalk(pixels, cb) {
    for (let c = 0; c < 3; c++) {
        for (let k = 0; k + 1 < pixels; k += 2) {
            if (cb(k * 4 + c, (k + 1) * 4 + c) === false) return;
        }
    }
}

// Reversible min-anchor PVD: the smaller pixel of each pair is an untouched anchor; only the
// larger pixel is moved to lo + m' (m' the new in-range magnitude). Because the anchor and the
// range are preserved, the decoder — which reads |p2-p1| and the same range from the stego pair —
// reproduces the exact usability decision and bit count with no side information. A pair is usable
// only if lo + (range upper bound) <= 255, so the whole range is reachable regardless of payload.
function writePVD(imageData, container) {
    const data = imageData.data;
    const pixels = data.length / 4;

    // Capacity (original values; embedding preserves anchor + range, so this is stable).
    let cap = 0;
    pvdWalk(pixels, (i1, i2) => {
        const lo = Math.min(data[i1], data[i2]);
        const r = pvdRange(Math.abs(data[i2] - data[i1]));
        if (lo + r[1] <= 255) cap += pvdBits(r);
    });
    if (container.length * 8 > cap) {
        throw new Error(`Payload too large for PVD capacity: needs ${container.length} bytes, ` +
                        `capacity is ~${Math.max(0, (cap / 8 | 0) - HEADER_LEN)} bytes. Use a bigger/more textured image or a shorter payload.`);
    }

    const bits = bytesToBitArray(container);
    let bi = 0;
    pvdWalk(pixels, (i1, i2) => {
        if (bi >= bits.length) return false;   // container fully written; leave the rest untouched
        const p1 = data[i1], p2 = data[i2];
        const lo = Math.min(p1, p2);
        const r = pvdRange(Math.abs(p2 - p1)), u = r[1], t = pvdBits(r);
        if (lo + u > 255) return;              // unusable pair — skip (decoder skips it too)
        let b = 0;
        for (let j = 0; j < t; j++) b = (b << 1) | (bi < bits.length ? bits[bi++] : 0);
        const hiNew = lo + r[0] + b;
        if (p1 <= p2) data[i2] = hiNew; else data[i1] = hiNew;   // move the larger pixel; anchor stays
    });
}

function tryDecodePVD(imageData) {
    const data = imageData.data;
    const pixels = data.length / 4;
    const bits = [];
    let total = null;   // total container bits, known once the length prefix is read
    let result = null;
    pvdWalk(pixels, (i1, i2) => {
        const lo = Math.min(data[i1], data[i2]);
        const m = Math.abs(data[i2] - data[i1]);
        const r = pvdRange(m), u = r[1], t = pvdBits(r);
        if (lo + u > 255) return;              // same skip rule as the writer
        const b = m - r[0];
        for (let j = t - 1; j >= 0; j--) bits.push((b >> j) & 1);
        if (total === null && bits.length >= PREFIX_LEN * 8) {
            const pfx = bitArrayToBytes(bits, PREFIX_LEN * 8);
            const len = ((pfx[1] << 24) | (pfx[2] << 16) | (pfx[3] << 8) | pfx[4]) >>> 0;
            if (len === 0 || (HEADER_LEN + len) > pixels * 3) return false;   // implausible → give up
            total = (HEADER_LEN + len) * 8;
        }
        if (total !== null && bits.length >= total) {
            result = parseContainerBits(bits, total);
            return false;   // stop walking
        }
    });
    return result;
}

function bytesToBitArray(bytes) {
    const bits = new Uint8Array(bytes.length * 8);
    for (let i = 0; i < bytes.length; i++)
        for (let k = 0; k < 8; k++) bits[i * 8 + k] = (bytes[i] >> (7 - k)) & 1;
    return bits;
}

function bitArrayToBytes(bits, bitCount) {
    const byteCount = bitCount >> 3;
    const out = new Uint8Array(byteCount);
    for (let i = 0; i < byteCount; i++) {
        let b = 0;
        for (let k = 0; k < 8; k++) b = (b << 1) | bits[i * 8 + k];
        out[i] = b;
    }
    return out;
}

// Convert the first `totalBits` collected bits into a container and CRC-validate it.
function parseContainerBits(bits, totalBits) {
    const bytes = bitArrayToBytes(bits, totalBits);
    const len = ((bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0;
    const payload = bytes.subarray(PREFIX_LEN, PREFIX_LEN + len);
    const co = PREFIX_LEN + len;
    const crcRead = ((bytes[co] << 24) | (bytes[co + 1] << 16) | (bytes[co + 2] << 8) | bytes[co + 3]) >>> 0;
    if (crc32(payload) !== crcRead) return null;
    const flags = bytes[0];
    return { type: (flags >> 1) & 3, encrypted: (flags & 1) === 1, bytes: payload.slice() };
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Embed a payload into `imageData` in place. Mutates imageData.data.
 * @param {ImageData} imageData
 * @param {object} opts
 * @param {'standard'|'randomized'|'edge'|'pvd'} opts.scheme
 * @param {number} opts.type          PTYPE.TEXT | PTYPE.IMAGE
 * @param {string} opts.payload       UTF-8 text, or a data: URL for images
 * @param {string} [opts.passphrase]  standard scheme only — AES-GCM encrypts the payload
 * @param {string} [opts.key]         randomized/edge — seeds the scatter permutation
 */
export async function encodePayload(imageData, { scheme, type, payload, passphrase, key }) {
    let bytes = enc.encode(payload);
    let encrypted = false;
    if (scheme === SCHEME.STANDARD && passphrase) {
        bytes = await encryptBytes(bytes, passphrase);
        encrypted = true;
    }
    const container = buildContainer(bytes, type, encrypted);
    switch (scheme) {
        case SCHEME.EDGE: writeEdge(imageData, container, key); break;
        case SCHEME.PVD:  writePVD(imageData, container); break;
        default:          writeContainer(imageData, container, scheme, key); break; // standard / randomized
    }
}

/**
 * Try to extract a payload from `imageData`. Blindly attempts every scheme, CRC-gated; a key
 * (when supplied) enables the randomized and edge orders.
 * @returns {Promise<null | {type:number, encrypted:boolean, text?:string, dataUrl?:string, needsPassphrase?:boolean}>}
 */
export async function decodePayload(imageData, { passphrase, key } = {}) {
    const data = imageData.data;
    const n = slotCount(imageData);

    // Current formats, CRC-validated, tried in order until one matches.
    let res = tryDecodeCrc(data, makeIndexer(SCHEME.STANDARD, n, key), n);         // standard LSB
    if (!res && key) res = tryDecodeCrc(data, makeIndexer(SCHEME.RANDOMIZED, n, key), n); // randomized LSB
    if (!res) res = tryDecodeEdge(imageData, key || '');                           // edge-adaptive
    if (!res && key) res = tryDecodeEdge(imageData, '');                           // edge without a key
    if (!res) res = tryDecodePVD(imageData);                                       // PVD
    if (res) return finalizePayload(res, passphrase);

    // Legacy fallback: images exported with the old BXS1/BXK1 magic header.
    const legacy = [{ scheme: SCHEME.STANDARD, magic: MAGIC_STD }];
    if (key) legacy.push({ scheme: SCHEME.RANDOMIZED, magic: MAGIC_KEY });
    for (const { scheme, magic } of legacy) {
        const idx = makeIndexer(scheme, n, key);
        const r = tryDecodeLegacy(data, idx, n, magic);
        if (r) return finalizePayload(r, passphrase);
    }
    return null;
}

// Read + CRC-validate the current header format. Returns {type, encrypted, bytes} or null.
function tryDecodeCrc(data, idx, n) {
    const prefix = readBits(data, idx, 0, PREFIX_LEN);
    const len = ((prefix[1] << 24) | (prefix[2] << 16) | (prefix[3] << 8) | prefix[4]) >>> 0;
    if (len === 0 || (HEADER_LEN + len) * 8 > n) return null;
    const body = readBits(data, idx, PREFIX_LEN * 8, len + CRC_LEN);
    const payload = body.subarray(0, len);
    const crcRead = ((body[len] << 24) | (body[len + 1] << 16) | (body[len + 2] << 8) | body[len + 3]) >>> 0;
    if (crc32(payload) !== crcRead) return null;
    const flags = prefix[0];
    return { type: (flags >> 1) & 3, encrypted: (flags & 1) === 1, bytes: payload.slice() };
}

// Read the legacy magic-tagged header. Returns {type, encrypted, bytes} or null.
function tryDecodeLegacy(data, idx, n, magic) {
    const header = readBits(data, idx, 0, LEGACY_HEADER_LEN);
    if (!magicMatches(header, magic)) return null;
    const len = ((header[5] << 24) | (header[6] << 16) | (header[7] << 8) | header[8]) >>> 0;
    if (len === 0 || (LEGACY_HEADER_LEN + len) * 8 > n) return null;
    const flags = header[4];
    return {
        type: (flags >> 1) & 3,
        encrypted: (flags & 1) === 1,
        bytes: readBits(data, idx, LEGACY_HEADER_LEN * 8, len),
    };
}

async function finalizePayload({ type, encrypted, bytes }, passphrase) {
    if (encrypted) {
        if (!passphrase) return { type, encrypted, needsPassphrase: true };
        try {
            bytes = await decryptBytes(bytes, passphrase);
        } catch {
            throw new Error('Wrong passphrase, or the hidden data is corrupted.');
        }
    }
    const str = dec.decode(bytes);
    return type === PTYPE.IMAGE
        ? { type, encrypted, dataUrl: str }
        : { type, encrypted, text: str };
}

/** Rough byte capacity for a payload in an image of the given pixel dimensions (standard/randomized). */
export function capacityBytes(width, height) {
    return Math.max(0, ((width * height * 3) / 8 | 0) - HEADER_LEN);
}
