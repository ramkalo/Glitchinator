// LSB steganography for BXTRXT.
//
// Two schemes, both writing to the least-significant bit of the R, G, B channels
// (the alpha byte is skipped) of an RGBA ImageData:
//
//   'standard' — a plain, documented, easily-reproduced format. Bits are written in
//                natural row-major order (pixel 0 R, pixel 0 G, pixel 0 B, pixel 1 R…),
//                most-significant-bit first. Any third-party tool that follows the
//                container format below can extract it. Optionally AES-GCM encrypted.
//
//   'bxtrxt'   — a private scheme readable only with the same key. Bit positions are
//                scattered across the whole image by a key-seeded full-cycle stride
//                (start + i*stride mod N, stride coprime to N), so without the key the
//                payload's location is unknown.
//
// Container (the bytes written into the image), identical for both schemes. There is NO
// readable magic marker — a trailing CRC32 both validates the payload on decode and stands
// in for the old scheme tag, so a raw LSB dump shows only a short binary prefix + the
// message (no "BXS1"/"BXK1" brand):
//   byte  0     flags:  bit0 = encrypted, bits1..2 = type (1 = text, 2 = image)
//   bytes 1..4  length: big-endian uint32, byte-length of the payload that follows
//   bytes 5..   payload: UTF-8 text, or (for images) a UTF-8 `data:` URL string.
//                        When encrypted: 16-byte salt + 12-byte IV + AES-GCM ciphertext.
//   last 4      crc32:   CRC32 of the payload (big-endian). Decode accepts only on a match.
// The scheme (standard vs keyed) is carried purely by the bit ORDER (natural vs
// key-permuted), not by any marker; decode figures it out by which order's CRC validates.
//
// Legacy: images exported before this change used a leading "BXS1"/"BXK1" magic + length
// header (no CRC). decodePayload still reads those via a fallback; new writes never use it.
//
// PNG-only in practice: the LSB plane only survives a lossless save. JPEG re-compression,
// resizing, or a screenshot destroys it.

export const SCHEME = { STANDARD: 'standard', KEYED: 'bxtrxt' };
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

// ── bit-plane addressing ──────────────────────────────────────────────────────

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
    if (scheme === SCHEME.KEYED) {
        const { start, stride } = keyedParams(key, n);
        return (i) => (start + i * stride) % n;
    }
    return (i) => i;
}

// ── read / write ──────────────────────────────────────────────────────────────

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

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Embed a payload into `imageData` in place. Mutates imageData.data.
 * @param {ImageData} imageData
 * @param {object} opts
 * @param {'standard'|'bxtrxt'} opts.scheme
 * @param {number} opts.type          PTYPE.TEXT | PTYPE.IMAGE
 * @param {string} opts.payload       UTF-8 text, or a data: URL for images
 * @param {string} [opts.passphrase]  standard scheme only — AES-GCM encrypts the payload
 * @param {string} [opts.key]         bxtrxt scheme only — seeds the scatter permutation
 */
export async function encodePayload(imageData, { scheme, type, payload, passphrase, key }) {
    let bytes = enc.encode(payload);
    let encrypted = false;
    if (scheme === SCHEME.STANDARD && passphrase) {
        bytes = await encryptBytes(bytes, passphrase);
        encrypted = true;
    }
    // [flags:1][length:4][payload][crc32:4] — no readable magic.
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
    writeContainer(imageData, container, scheme, key);
}

/**
 * Try to extract a payload from `imageData`. Attempts the standard scheme first,
 * then the keyed scheme if a `key` is supplied.
 * @returns {Promise<null | {type:number, encrypted:boolean, text?:string, dataUrl?:string, needsPassphrase?:boolean}>}
 */
export async function decodePayload(imageData, { passphrase, key } = {}) {
    const data = imageData.data;
    const n = slotCount(imageData);

    const orders = [SCHEME.STANDARD];
    if (key) orders.push(SCHEME.KEYED);

    // Current format: CRC-validated, no magic. Try each bit order; CRC picks the winner.
    for (const scheme of orders) {
        const idx = makeIndexer(scheme, n, key);
        const res = tryDecodeCrc(data, idx, n);
        if (res) return finalizePayload(res, passphrase);
    }
    // Legacy fallback: images exported with the old BXS1/BXK1 magic header.
    const legacy = [{ scheme: SCHEME.STANDARD, magic: MAGIC_STD }];
    if (key) legacy.push({ scheme: SCHEME.KEYED, magic: MAGIC_KEY });
    for (const { scheme, magic } of legacy) {
        const idx = makeIndexer(scheme, n, key);
        const res = tryDecodeLegacy(data, idx, n, magic);
        if (res) return finalizePayload(res, passphrase);
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

/** Rough byte capacity for a payload in an image of the given pixel dimensions. */
export function capacityBytes(width, height) {
    return Math.max(0, ((width * height * 3) / 8 | 0) - HEADER_LEN);
}
