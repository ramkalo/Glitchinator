// Cipher engine — pure text-transform logic for the Cipher effect (no DOM).
//
// A "recipe" is an ordered list of steps: { id, type, cfg }. Each step type is a bijective-ish
// text transform with an `apply` (encode) and an `invert` (best-effort decode). runRecipe folds
// the steps left-to-right (encode) or right-to-left with `invert` (decode). Most steps round-trip
// cleanly; Spacer loses original spacing and Morse loses letter case, so decode is best-effort.

const enc = new TextEncoder();
const dec = new TextDecoder();
const toBytes   = (str) => enc.encode(str ?? '');
const fromBytes = (arr) => dec.decode(new Uint8Array(arr));

// Deterministic PRNG (mirrors the LCG used in text.js) — same seed always yields the same stream.
function mkRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

function uid() { return 's' + Math.random().toString(36).slice(2, 9); }

// Standard ASCII punctuation ring (space is intentionally excluded so it passes through).
const PUNCT = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

// --- Caesar -----------------------------------------------------------------------------------
function caesarApply(text, cfg) {
    const dir = cfg.dir === '-' ? -1 : 1;
    const amt = dir * ((cfg.amount | 0));
    let out = '';
    for (const ch of text) {
        const code = ch.charCodeAt(0);
        if (cfg.letters && ch >= 'A' && ch <= 'Z') {
            out += String.fromCharCode((code - 65 + (amt % 26) + 26) % 26 + 65);
        } else if (cfg.letters && ch >= 'a' && ch <= 'z') {
            out += String.fromCharCode((code - 97 + (amt % 26) + 26) % 26 + 97);
        } else if (cfg.numbers && ch >= '0' && ch <= '9') {
            out += String.fromCharCode((code - 48 + (amt % 10) + 10) % 10 + 48);
        } else if (cfg.symbols && PUNCT.includes(ch)) {
            const i = PUNCT.indexOf(ch), n = PUNCT.length;
            out += PUNCT[((i + amt) % n + n) % n];
        } else {
            out += ch;
        }
    }
    return out;
}
const caesarInvert = (text, cfg) =>
    caesarApply(text, { ...cfg, dir: cfg.dir === '-' ? '+' : '-' });

// --- Spacer -----------------------------------------------------------------------------------
function spacerApply(text, cfg) {
    const squished = String(text).replace(/\s+/g, '');
    const chunk = cfg.chunk | 0;
    if (!chunk) return squished;                       // 0 = squish everything, drop spaces
    const sep = cfg.sep ?? ' ';
    let out = '';
    for (let i = 0; i < squished.length; i += chunk) {
        out += squished.slice(i, i + chunk) + sep;     // separator appended after each chunk
    }
    return out;
}
function spacerInvert(text, cfg) {
    const sep = cfg.sep ?? ' ';
    let out = String(text);
    if (sep) out = out.split(sep).join('');
    return out.replace(/\s+/g, '');                    // lossy: original word boundaries are gone
}

// --- Morse ------------------------------------------------------------------------------------
const MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..',
    J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
    S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....',
    6: '-....', 7: '--...', 8: '---..', 9: '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.',
    '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
    '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

function morseApply(text, cfg) {
    const short = cfg.short || '.', long = cfg.long || '-', gap = cfg.gap ?? ' ';
    const tokens = [];
    for (const ch of text) {
        if (ch === ' ') { tokens.push(''); continue; }     // word break -> empty token
        const code = MORSE[ch.toUpperCase()];
        if (!code) { tokens.push(ch); continue; }           // unknown char -> passthrough
        tokens.push(code.split('').map(s => (s === '.' ? short : long)).join(''));
    }
    return tokens.join(gap);
}
// Map a token's custom short/long symbols back to canonical . and - (longer symbol first so a
// short symbol that is a prefix of the long one does not eat it). Single-char symbols decode most
// reliably.
function normalizeMorse(tok, short, long) {
    let t = tok;
    if (long.length >= short.length) { t = t.split(long).join('-'); t = t.split(short).join('.'); }
    else { t = t.split(short).join('.'); t = t.split(long).join('-'); }
    return t;
}
function morseInvert(text, cfg) {
    const short = cfg.short || '.', long = cfg.long || '-', gap = cfg.gap ?? ' ';
    const tokens = gap ? String(text).split(gap) : [String(text)];
    let out = '';
    for (const tok of tokens) {
        if (tok === '') { out += ' '; continue; }
        const norm = normalizeMorse(tok, short, long);
        out += MORSE_REV[norm] ?? tok;                      // unknown token -> passthrough
    }
    return out;
}

// --- Binary -----------------------------------------------------------------------------------
function binaryApply(text, cfg) {
    const one = cfg.one || '1', zero = cfg.zero || '0', sep = cfg.sep ?? '';
    return [...toBytes(text)]
        .map(b => b.toString(2).padStart(8, '0').split('').map(d => (d === '1' ? one : zero)).join(''))
        .join(sep);
}
function normalizeBits(s, one, zero) {
    let t = s;
    if (one.length >= zero.length) { t = t.split(one).join('1'); t = t.split(zero).join('0'); }
    else { t = t.split(zero).join('0'); t = t.split(one).join('1'); }
    return t.replace(/[^01]/g, '');
}
function binaryInvert(text, cfg) {
    const one = cfg.one || '1', zero = cfg.zero || '0', sep = cfg.sep ?? '';
    const bits = sep
        ? String(text).split(sep).map(t => normalizeBits(t, one, zero)).join('')
        : normalizeBits(String(text), one, zero);
    const out = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
    return fromBytes(out);
}

// --- Hex --------------------------------------------------------------------------------------
const hexApply  = (text) => [...toBytes(text)].map(b => b.toString(16).padStart(2, '0')).join('');
function hexInvert(text) {
    const h = String(text).replace(/[^0-9a-fA-F]/g, '');
    const out = [];
    for (let i = 0; i + 2 <= h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
    return fromBytes(out);
}

// --- ASCII (decimal byte values) --------------------------------------------------------------
const asciiApply = (text) => [...toBytes(text)].join(' ');
function asciiInvert(text) {
    const nums = String(text).split(/[^0-9]+/).filter(Boolean).map(Number).filter(n => n >= 0 && n <= 255);
    return fromBytes(nums);
}

// --- URL (full percent-encoding of every byte, uppercase) -------------------------------------
const urlApply = (text) =>
    [...toBytes(text)].map(b => '%' + b.toString(16).padStart(2, '0').toUpperCase()).join('');
function urlInvert(text) {
    const s = String(text);
    const out = [];
    let i = 0;
    while (i < s.length) {
        if (s[i] === '%' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) {
            out.push(parseInt(s.slice(i + 1, i + 3), 16));
            i += 3;
        } else {
            for (const b of toBytes(s[i])) out.push(b);
            i++;
        }
    }
    return fromBytes(out);
}

// --- Atbash / seeded substitution -------------------------------------------------------------
// Bijective permutation over a fixed character universe (A-Z, a-z, 0-9, punctuation, space).
// seed 0 = classic reversal within each class; any other seed = deterministic Fisher-Yates shuffle.
function buildUniverse() {
    let u = '';
    for (let c = 65; c <= 90; c++)  u += String.fromCharCode(c);  // A-Z
    for (let c = 97; c <= 122; c++) u += String.fromCharCode(c);  // a-z
    for (let c = 48; c <= 57; c++)  u += String.fromCharCode(c);  // 0-9
    u += PUNCT + ' ';
    return u;
}
const CLASS_LENS = [26, 26, 10, PUNCT.length, 1];
function reverseWithinClasses(chars) {
    const out = [];
    let start = 0;
    for (const len of CLASS_LENS) {
        out.push(...chars.slice(start, start + len).reverse());
        start += len;
    }
    return out;
}
function atbashMaps(cfg) {
    const src = buildUniverse().split('');
    let dst;
    const seed = cfg.seed | 0;
    if (seed === 0) {
        dst = reverseWithinClasses(src);
    } else {
        dst = src.slice();
        const rng = mkRng(seed);
        for (let i = dst.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [dst[i], dst[j]] = [dst[j], dst[i]];
        }
    }
    const fwd = {}, rev = {};
    for (let i = 0; i < src.length; i++) { fwd[src[i]] = dst[i]; rev[dst[i]] = src[i]; }
    return { fwd, rev };
}
function atbashApply(text, cfg) {
    const { fwd } = atbashMaps(cfg);
    let out = '';
    for (const ch of text) out += fwd[ch] ?? ch;
    return out;
}
function atbashInvert(text, cfg) {
    const { rev } = atbashMaps(cfg);
    let out = '';
    for (const ch of text) out += rev[ch] ?? ch;
    return out;
}

// --- Step-type registry -----------------------------------------------------------------------
// `fields` drive the generic control UI in cipherControls.js.
export const STEP_TYPES = {
    caesar: {
        label: 'Caesar Shift',
        defaults: { dir: '+', amount: 3, letters: true, numbers: false, symbols: false },
        apply: caesarApply, invert: caesarInvert,
        fields: [
            { key: 'dir', type: 'segment', label: 'Direction', options: [['+', '+'], ['-', '−']] },
            { key: 'amount', type: 'number', label: 'Shift', min: 1, max: 99 },
            { key: 'letters', type: 'toggle', label: 'Letters' },
            { key: 'numbers', type: 'toggle', label: 'Numbers' },
            { key: 'symbols', type: 'toggle', label: 'Symbols' },
        ],
    },
    spacer: {
        label: 'Spacer',
        defaults: { chunk: 3, sep: ' ' },
        apply: spacerApply, invert: spacerInvert,
        fields: [
            { key: 'chunk', type: 'number', label: 'Chunk size (0 = squish)', min: 0, max: 13 },
            { key: 'sep', type: 'text', label: 'Separator', placeholder: 'space', maxLength: 13 },
        ],
        hint: 'Decode is lossy — original word spacing cannot be recovered.',
    },
    morse: {
        label: 'Morse',
        defaults: { short: '.', long: '-', gap: ' ' },
        apply: morseApply, invert: morseInvert,
        fields: [
            { key: 'short', type: 'text', label: 'Short (dot)', maxLength: 8 },
            { key: 'long', type: 'text', label: 'Long (dash)', maxLength: 8 },
            { key: 'gap', type: 'text', label: 'Letter gap', placeholder: 'space', maxLength: 8 },
        ],
        hint: 'Single-character short/long symbols decode most reliably. Case is not preserved.',
    },
    binary: {
        label: 'Binary',
        defaults: { one: '1', zero: '0', sep: '' },
        apply: binaryApply, invert: binaryInvert,
        fields: [
            { key: 'one', type: 'text', label: 'One symbol', maxLength: 8 },
            { key: 'zero', type: 'text', label: 'Zero symbol', maxLength: 8 },
            { key: 'sep', type: 'text', label: 'Byte separator (optional)', maxLength: 8 },
        ],
    },
    hex:   { label: 'Hexadecimal', defaults: {}, apply: hexApply,   invert: hexInvert,   fields: [] },
    ascii: { label: 'ASCII',       defaults: {}, apply: asciiApply, invert: asciiInvert, fields: [] },
    url:   { label: 'URL Encoding', defaults: {}, apply: urlApply,  invert: urlInvert,   fields: [] },
    atbash: {
        label: 'Atbash / Substitution',
        defaults: { seed: 0 },
        apply: atbashApply, invert: atbashInvert,
        fields: [
            { key: 'seed', type: 'seed', label: 'Seed (0 = classic reversal)' },
        ],
    },
};

// Ordered list for the "add step" menu.
export const STEP_ORDER = ['caesar', 'spacer', 'morse', 'binary', 'hex', 'ascii', 'url', 'atbash'];

export function makeStep(type) {
    return { id: uid(), type, cfg: { ...STEP_TYPES[type].defaults } };
}

export function runRecipe(source, steps, decode) {
    let text = source ?? '';
    if (decode) {
        for (let i = steps.length - 1; i >= 0; i--) {
            const st = STEP_TYPES[steps[i].type];
            if (st) text = st.invert(text, steps[i].cfg);
        }
    } else {
        for (const step of steps) {
            const st = STEP_TYPES[step.type];
            if (st) text = st.apply(text, step.cfg);
        }
    }
    return text;
}

// --- Recipe code (deterministic, shareable) ---------------------------------------------------
function base64urlEncode(str) {
    let bin = '';
    for (const b of toBytes(str)) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlDecode(s) {
    let t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    const bin = atob(t);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return fromBytes(arr);
}

// Serialize only [type, cfg] pairs (the volatile per-step id is dropped) so an identical recipe
// always produces an identical code.
export function encodeRecipeCode(steps) {
    const minimal = steps
        .filter(s => STEP_TYPES[s.type])
        .map(s => [s.type, s.cfg]);
    return 'CX1-' + base64urlEncode(JSON.stringify(minimal));
}

export function decodeRecipeCode(code) {
    const trimmed = String(code || '').trim();
    if (!trimmed.startsWith('CX1-')) throw new Error('Not a valid recipe code');
    const arr = JSON.parse(base64urlDecode(trimmed.slice(4)));
    if (!Array.isArray(arr)) throw new Error('Malformed recipe code');
    return arr
        .filter(([type]) => STEP_TYPES[type])
        .map(([type, cfg]) => ({ id: uid(), type, cfg: { ...STEP_TYPES[type].defaults, ...(cfg || {}) } }));
}
