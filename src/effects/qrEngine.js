// QR / barcode generation + per-instance caching for the QR effect.
//
// bwip-js is heavy (~0.5 MB), so it is loaded **lazily** via dynamic import() the first time a code
// is generated — Vite splits it into its own chunk (Workbox precaches it, so the app stays offline).
// Generation is async but the render pipeline's canvas2d is synchronous, so we cache the rendered
// bitmap per instance keyed by a full visual signature; `getQR` kicks off (re)generation when the key
// changes and re-renders once it completes, drawing the stale bitmap meanwhile.
//
// Every entry also carries a `status` ('ok' | 'error' | 'truncated') + message so nothing fails or
// drops data silently — the effect's card shows a warning (see getQRStatus + the 'qr-status' event).
//
// pipeline.js is imported *dynamically* (not statically): this module is pulled into the
// effectStack → registry → qr → qrEngine graph, and a static pipeline import there would form an
// initialization cycle (pipeline's top-level onStackChange runs before effectStack's state exists).

// qrType → { bcid (bwip symbology), family, moduleShapeable, label }.
export const TYPE_META = {
    qr:       { bcid: 'qrcode',                 family: 'matrix', moduleShapeable: true,  label: 'Standard QR' },
    microqr:  { bcid: 'microqrcode',            family: 'matrix', moduleShapeable: true,  label: 'Micro QR' },
    rmqr:     { bcid: 'rectangularmicroqrcode', family: 'matrix', moduleShapeable: true,  label: 'rMQR' },
    aztec:    { bcid: 'azteccode',              family: 'matrix', moduleShapeable: true,  label: 'Aztec' },
    hanxin:   { bcid: 'hanxin',                 family: 'matrix', moduleShapeable: true,  label: 'Han Xin' },
    pdf417:   { bcid: 'pdf417',                 family: 'other',  moduleShapeable: false, label: 'PDF417' },
    maxicode: { bcid: 'maxicode',               family: 'other',  moduleShapeable: false, label: 'MaxiCode' },
    barcode:  { bcid: 'code128',                family: 'other',  moduleShapeable: false, label: 'Barcode' },
    mars:     { bcid: null,                     family: 'mars',   moduleShapeable: false, label: 'Mars Parachute' },
};

// If URL mode is on and the text has no scheme, assume https:// so a scan opens a link.
export function normalizePayload(text, isUrl) {
    let t = (text ?? '').trim();
    if (isUrl && t && !/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(t)) t = 'https://' + t;
    return t;
}

// The L/M/Q/H error-correction levels are only valid for Standard QR. Other symbologies use their
// own scheme (Han Xin rejects L/M/Q/H) or none, so we simply omit eclevel for them.
const ECC_TYPES = new Set(['qr']);

// rMQR requires an explicit version; try ascending capacities until the text fits.
const RMQR_VERSIONS = ['R7x43', 'R7x59', 'R9x59', 'R7x77', 'R11x77', 'R7x99', 'R13x99', 'R15x139', 'R17x139'];

function runSymbology(qrType, attempt) {
    if (qrType === 'rmqr') {
        let lastErr;
        for (const version of RMQR_VERSIONS) {
            try { return attempt({ version }); } catch (e) { lastErr = e; }
        }
        throw lastErr;
    }
    return attempt({});
}

function hex6(color) {
    const h = String(color || '#000000').replace('#', '');
    if (h.length === 3) return h.split('').map(c => c + c).join('');
    return h.slice(0, 6).padStart(6, '0');
}

// --- module drawing (custom circle/hexagon path) ----------------------------------------------
function drawModule(ctx, x, y, s, shape) {
    if (shape === 'circle') {
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
        ctx.fill();
    } else if (shape === 'hexagon') {
        const cx = x + s / 2, cy = y + s / 2, r = s / 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = Math.PI / 6 + i * Math.PI / 3;   // flat-top hexagon
            const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
    } else {
        ctx.fillRect(x, y, s, s);
    }
}

// --- bwip generation paths --------------------------------------------------------------------
function renderViaToCanvas(bwip, meta, opts) {
    const tmp = document.createElement('canvas');
    const base = { bcid: meta.bcid, text: opts.text, scale: 4, barcolor: hex6(opts.dark), includetext: false };
    if (opts.bg !== 'transparent') base.backgroundcolor = hex6(opts.bg);
    if (ECC_TYPES.has(opts.qrType)) base.eclevel = opts.ecc;
    if (meta.bcid === 'code128') base.height = 12;  // linear codes need an explicit bar height
    runSymbology(opts.qrType, (extra) => bwip.toCanvas(tmp, { ...base, ...extra })); // sync; throws on invalid input
    return tmp;
}

function renderMatrixCustom(bwip, meta, opts) {
    const base = { bcid: meta.bcid, text: opts.text };
    if (ECC_TYPES.has(opts.qrType)) base.eclevel = opts.ecc;
    const sym = runSymbology(opts.qrType, (extra) => bwip.raw({ ...base, ...extra })[0]);  // { pixs, pixx, pixy }
    const { pixs, pixx, pixy } = sym;
    const cell = 8;
    const cv = document.createElement('canvas');
    cv.width = pixx * cell;
    cv.height = pixy * cell;
    const ctx = cv.getContext('2d');
    if (opts.bg !== 'transparent') { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.fillStyle = opts.dark;
    for (let r = 0; r < pixy; r++) {
        for (let c = 0; c < pixx; c++) {
            if (pixs[r * pixx + c] === 1) drawModule(ctx, c * cell, r * cell, cell, opts.moduleShape);
        }
    }
    return cv;
}

// --- Mars Perseverance parachute (faithful to Ian Clark's scheme) ------------------------------
// A=1..Z=26, each symbol = 7-bit value + '000' delimiter (10 bits). A ring is 80 stripes = 8
// symbols, read clockwise from 12 o'clock; orange (dark) = 1, white (background) = 0. Each word of
// the message gets its own ring (inner → outer); optional GPS coordinates get the outermost ring.
const STRIPES_PER_RING = 8 * 10;   // 80

function symbolBits(value) {
    return (value & 0x7f).toString(2).padStart(7, '0') + '000';
}

// Encode one word (letters only, ≤8 chars) into an 80-bit ring string; report overflow / bad chars.
function wordRing(word) {
    let bits = '';
    let overflow = false, bad = false, used = 0;
    for (const ch of word) {
        const code = ch.toUpperCase().charCodeAt(0);
        if (code < 65 || code > 90) { bad = true; continue; }   // A–Z only, like the real chute
        if (used >= 8) { overflow = true; break; }
        bits += symbolBits(code - 64);   // A=1 … Z=26
        used++;
    }
    return { bits: bits.slice(0, STRIPES_PER_RING).padEnd(STRIPES_PER_RING, '0'), overflow, bad };
}

// Encode DMS coordinates (numbers + N/S/E/W tokens) into an 80-bit ring; 8 tokens fit exactly.
function coordRing(coordStr) {
    const tokens = coordStr.toUpperCase().match(/\d+|[NSEW]/g) || [];
    let bits = '';
    let overflow = false, clamped = false;
    for (let i = 0; i < tokens.length; i++) {
        if (i >= 8) { overflow = true; break; }
        const t = tokens[i];
        let v = /^\d+$/.test(t) ? parseInt(t, 10) : (t.charCodeAt(0) - 64);
        if (v > 127) { clamped = true; v = 127; }
        bits += symbolBits(v);
    }
    return { bits: bits.slice(0, STRIPES_PER_RING).padEnd(STRIPES_PER_RING, '0'), overflow, clamped, empty: tokens.length === 0 };
}

function renderMars(opts) {
    const size = 720;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const cx = size / 2, cy = size / 2;
    if (opts.bg !== 'transparent') { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, size, size); }

    const warnings = [];
    const words = (opts.text || '').trim().split(/\s+/).filter(Boolean);
    const rings = [];
    for (const w of words) {
        const { bits, overflow, bad } = wordRing(w);
        if (overflow) warnings.push(`"${w}" is longer than 8 letters — a parachute ring only holds 8.`);
        if (bad) warnings.push(`"${w}" contains characters the Mars code can't encode (letters A–Z only).`);
        rings.push(bits);
    }
    if (opts.coords && opts.coords.trim()) {
        const { bits, overflow, clamped, empty } = coordRing(opts.coords);
        if (empty) warnings.push('Coordinates could not be parsed — use DMS like "34 11 58 N 118 10 31 W".');
        else {
            if (overflow) warnings.push('Coordinates have more than 8 values — extras were dropped.');
            if (clamped) warnings.push('A coordinate value above 127 was clamped (7-bit limit).');
            rings.push(bits);
        }
    }

    if (rings.length) {
        const hub = size * 0.06;
        const maxR = size * 0.47;
        const band = (maxR - hub) / rings.length;
        const step = 2 * Math.PI / STRIPES_PER_RING;
        ctx.fillStyle = opts.dark;
        for (let r = 0; r < rings.length; r++) {
            const rInner = hub + band * r;
            const rOuter = hub + band * (r + 1);
            const bits = rings[r];
            for (let s = 0; s < STRIPES_PER_RING; s++) {
                if (bits[s] !== '1') continue;
                const a0 = -Math.PI / 2 + s * step;         // clockwise from 12 o'clock
                const a1 = -Math.PI / 2 + (s + 1) * step;
                ctx.beginPath();
                ctx.arc(cx, cy, rOuter, a0, a1);
                ctx.arc(cx, cy, rInner, a1, a0, true);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    return { canvas: cv, status: warnings.length ? 'truncated' : 'ok', message: warnings.join(' ') };
}

// Punch a transparent square hole in the center (for a logo/image/text inset on a layer above).
// Only used for high-EC matrix codes, which can still scan with the center covered.
function clearCenter(cv, pct) {
    const g = Math.min(0.35, pct / 100);   // capped so the code stays scannable (High EC ≈ 30%)
    if (g <= 0) return;
    const gw = cv.width * g, gh = cv.height * g;
    cv.getContext('2d').clearRect((cv.width - gw) / 2, (cv.height - gh) / 2, gw, gh);
}

// Clip the rendered bitmap to the overall shape (baked into a fresh transparent canvas).
function applyOverallShape(src, shape) {
    if (shape === 'square') return src;
    const w = src.width, h = src.height;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.beginPath();
    if (shape === 'circle') {
        ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else { // rounded
        const rad = Math.min(w, h) * 0.12;
        ctx.moveTo(rad, 0);
        ctx.arcTo(w, 0, w, h, rad);
        ctx.arcTo(w, h, 0, h, rad);
        ctx.arcTo(0, h, 0, 0, rad);
        ctx.arcTo(0, 0, w, 0, rad);
    }
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(src, 0, 0);
    return out;
}

async function generate(opts) {
    const meta = TYPE_META[opts.qrType] || TYPE_META.qr;
    if (meta.family === 'mars') {
        const res = renderMars(opts);
        return { canvas: applyOverallShape(res.canvas, opts.overallShape), status: res.status, message: res.message };
    }
    const bwip = (await import('@bwip-js/browser')).default;
    const useCustom = meta.moduleShapeable && opts.moduleShape !== 'square';
    const native = useCustom ? renderMatrixCustom(bwip, meta, opts) : renderViaToCanvas(bwip, meta, opts);
    if (meta.moduleShapeable && opts.centerGap > 0) clearCenter(native, opts.centerGap);
    return { canvas: applyOverallShape(native, opts.overallShape), status: 'ok', message: '' };
}

function friendlyError(err, opts) {
    const label = (TYPE_META[opts.qrType] || {}).label || opts.qrType;
    const msg = String(err?.message || err || '');
    if (/maximum length|too (long|large)|No valid symbol|exceed|not enough/i.test(msg)) {
        return `Too much data for ${label}. Shorten the text, or switch to a higher-capacity type.`;
    }
    return `Could not generate ${label}: ${msg.replace(/^bwipp?\.\w+#\d+:\s*/i, '')}`;
}

// --- per-instance cache -----------------------------------------------------------------------
const _cache = new Map();   // instId -> { key, canvas, status, message, pendingKey }

function notifyStatus(instId) {
    try { document.dispatchEvent(new CustomEvent('qr-status', { detail: { instId } })); } catch { /* no DOM */ }
}

/**
 * Return the rendered code canvas for an instance, (re)generating asynchronously when the visual
 * signature changes. Returns the current (possibly stale) canvas, or null if nothing is ready yet.
 * @param {string} instId
 * @param {object} opts { qrType, text, coords, ecc, moduleShape, overallShape, dark, bg }
 */
export function getQR(instId, opts) {
    const key = JSON.stringify(opts);
    const entry = _cache.get(instId);
    if (entry && entry.key === key) return entry.canvas || null;

    if (!entry || entry.pendingKey !== key) {
        const rec = entry || {};
        rec.pendingKey = key;
        _cache.set(instId, rec);
        const reprocess = () => import('../renderer/pipeline.js').then(m => m.processImageImmediate());
        generate(opts).then((res) => {
            const cur = _cache.get(instId);
            if (!cur || cur.pendingKey !== key) return;                       // superseded
            _cache.set(instId, { key, canvas: res.canvas, status: res.status, message: res.message, pendingKey: key });
            notifyStatus(instId);
            reprocess();
        }).catch((err) => {
            const cur = _cache.get(instId);
            if (!cur || cur.pendingKey !== key) return;
            _cache.set(instId, { key, canvas: null, status: 'error', message: friendlyError(err, opts), pendingKey: key });
            notifyStatus(instId);
            reprocess();                                                       // clear the stale code
        });
    }
    return entry && entry.canvas ? entry.canvas : null;
}

/** Current generation status for an instance, or null if never generated. */
export function getQRStatus(instId) {
    const e = _cache.get(instId);
    return e ? { status: e.status || 'ok', message: e.message || '' } : null;
}

/** Called when the payload is empty — drops any cached code/warning so the card clears cleanly. */
export function resetQR(instId) {
    const e = _cache.get(instId);
    if (!e) return;
    const hadWarning = e.status && e.status !== 'ok';
    _cache.delete(instId);
    if (hadWarning) notifyStatus(instId);
}

export function disposeQR(instId) {
    _cache.delete(instId);
}
