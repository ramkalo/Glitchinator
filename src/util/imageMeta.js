// File-container metadata for BXTRXT exports.
//
//   PNG  — XMP is written as an `iTXt` chunk (keyword "XML:com.adobe.xmp"); a few common
//          textual fields are additionally written as `tEXt` chunks that standard tools read.
//   JPEG — XMP is written as an APP1 segment; optional classic EXIF via piexifjs.
//
// XMP covers everything portably (exiftool and modern apps read it in both formats). Classic
// binary EXIF is offered for JPEG so legacy tools read fields like focal length natively.
//
// Everything except JPEG EXIF is hand-rolled with no dependency.

import piexif from 'piexifjs';

const enc = new TextEncoder();
const dec = new TextDecoder();
const decLatin1 = new TextDecoder('latin1'); // PNG tEXt keyword + text are Latin-1

// ── byte helpers ──────────────────────────────────────────────────────────────

function latin1(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
}
function concat(arrays) {
    let len = 0;
    for (const a of arrays) len += a.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const a of arrays) { out.set(a, o); o += a.length; }
    return out;
}
function u8ToBinaryString(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return s;
}
function binaryStringToU8(s) {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
}
const xmlEsc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ── GPS coordinate conversion ──────────────────────────────────────────────────

// Decimal degrees → XMP "deg,decimalMin{ref}" sexagesimal string (Adobe XMP exif GPS format).
function xmpGpsCoord(dec, posRef, negRef) {
    const ref = dec >= 0 ? posRef : negRef;
    const a = Math.abs(dec);
    const deg = Math.floor(a);
    const min = (a - deg) * 60;
    return `${deg},${min.toFixed(6)}${ref}`;
}

// Decimal degrees → EXIF rational [[deg,1],[min,1],[sec*100,100]] (piexif format).
function exifGpsRational(dec) {
    const a = Math.abs(dec);
    const deg = Math.floor(a);
    const minF = (a - deg) * 60;
    const min = Math.floor(minF);
    const sec = (minF - min) * 60;
    return [[deg, 1], [min, 1], [Math.round(sec * 100), 100]];
}

// ── CRC32 (for PNG chunks) ─────────────────────────────────────────────────────

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

// ── XMP packet ─────────────────────────────────────────────────────────────────

// AI opt-out: an IPTC/PLUS "Data Mining" prohibition value, plus a plain-language note.
const AI_OPT_OUT_VALUE = 'http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-AIMLTRAINING';

/**
 * Build an XMP packet string from user metadata.
 * @param {object} f
 * @param {object} [f.standard]  { make, model, lens, focalLength, exposureTime, fNumber, iso,
 *                                 copyright, creator, publisher, software, description, dateTime }
 * @param {Array<{key:string,value:string}>} [f.custom]
 * @param {boolean} [f.aiOptOut]
 */
export function buildXmpPacket(f = {}) {
    const s = f.standard || {};
    const lines = [];
    const add = (tag, val) => { if (val != null && val !== '') lines.push(`      <${tag}>${xmlEsc(val)}</${tag}>`); };

    add('dc:rights', s.copyright);
    add('dc:description', s.description);
    if (s.creator)   lines.push(`      <dc:creator><rdf:Seq><rdf:li>${xmlEsc(s.creator)}</rdf:li></rdf:Seq></dc:creator>`);
    if (s.publisher) lines.push(`      <dc:publisher><rdf:Bag><rdf:li>${xmlEsc(s.publisher)}</rdf:li></rdf:Bag></dc:publisher>`);
    add('xmp:CreatorTool', s.software);
    add('xmp:CreateDate', s.dateTime);
    add('tiff:Make', s.make);
    add('tiff:Model', s.model);
    add('aux:Lens', s.lens);
    add('exif:FocalLength', s.focalLength);
    add('exif:ExposureTime', s.exposureTime);
    add('exif:FNumber', s.fNumber);
    add('exif:ISOSpeedRatings', s.iso);

    if (f.gps) {
        add('exif:GPSLatitude', xmpGpsCoord(f.gps.lat, 'N', 'S'));
        add('exif:GPSLongitude', xmpGpsCoord(f.gps.lon, 'E', 'W'));
        add('exif:GPSVersionID', '2.2.0.0');
        if (f.gps.alt != null) {
            add('exif:GPSAltitude', `${Math.round(Math.abs(f.gps.alt) * 100)}/100`);
            add('exif:GPSAltitudeRef', f.gps.alt < 0 ? '1' : '0');
        }
    }

    for (const { key, value } of (f.custom || [])) {
        if (key) lines.push(`      <bxtrxt:${xmlEsc(key).replace(/[^\w.-]/g, '_')}>${xmlEsc(value)}</bxtrxt:${xmlEsc(key).replace(/[^\w.-]/g, '_')}>`);
    }
    if (f.aiOptOut) {
        lines.push(`      <plus:DataMining rdf:resource="${AI_OPT_OUT_VALUE}"/>`);
        lines.push(`      <bxtrxt:aiTraining>declined</bxtrxt:aiTraining>`);
        lines.push(`      <bxtrxt:note>No AI/ML training use permitted without the creator's consent.</bxtrxt:note>`);
    }

    return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:tiff="http://ns.adobe.com/tiff/1.0/"
    xmlns:exif="http://ns.adobe.com/exif/1.0/"
    xmlns:aux="http://ns.adobe.com/exif/1.0/aux/"
    xmlns:plus="http://ns.useplus.org/ldf/xmp/1.0/"
    xmlns:bxtrxt="http://bxtrxt.app/ns/1.0/">
${lines.join('\n')}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

// Which standard fields also get written as plain PNG tEXt keywords (broadly read).
function pngTextPairs(s = {}) {
    const pairs = [];
    if (s.copyright)   pairs.push(['Copyright', s.copyright]);
    if (s.creator)     pairs.push(['Author', s.creator]);
    if (s.description) pairs.push(['Description', s.description]);
    if (s.software)    pairs.push(['Software', s.software]);
    return pairs;
}

// ── PNG chunk writing ───────────────────────────────────────────────────────────

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

function isPng(bytes) {
    return PNG_SIG.every((b, i) => bytes[i] === b);
}

function pngChunk(type, data) {
    const typeBytes = latin1(type);
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, data.length);
    const crcInput = concat([typeBytes, data]);
    const crc = new Uint8Array(4);
    new DataView(crc.buffer).setUint32(0, crc32(crcInput));
    return concat([len, typeBytes, data, crc]);
}

function iTXtData(keyword, text) {
    return concat([
        latin1(keyword), Uint8Array.of(0), // keyword + null
        Uint8Array.of(0, 0),               // compression flag + method
        Uint8Array.of(0),                  // language tag (empty) + null
        Uint8Array.of(0),                  // translated keyword (empty) + null
        enc.encode(text),                  // UTF-8 text
    ]);
}
function tEXtData(keyword, text) {
    return concat([latin1(keyword), Uint8Array.of(0), latin1(text)]);
}

// Insert metadata chunks into a PNG, immediately before IEND.
function writePngMetadata(bytes, fields) {
    const chunks = [pngChunk('iTXt', iTXtData('XML:com.adobe.xmp', buildXmpPacket(fields)))];
    for (const [k, v] of pngTextPairs(fields.standard)) chunks.push(pngChunk('tEXt', tEXtData(k, v)));

    // Find IEND (last 12 bytes normally, but scan to be safe).
    let pos = 8;
    let iendStart = bytes.length - 12;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (pos + 8 <= bytes.length) {
        const len = view.getUint32(pos);
        const type = dec.decode(bytes.subarray(pos + 4, pos + 8));
        if (type === 'IEND') { iendStart = pos; break; }
        pos += 12 + len;
    }
    return concat([bytes.subarray(0, iendStart), ...chunks, bytes.subarray(iendStart)]);
}

// ── JPEG segment writing ─────────────────────────────────────────────────────────

const XMP_APP1_HEADER = 'http://ns.adobe.com/xap/1.0/\0';

function writeJpegXmp(bytes, xmp) {
    const payload = concat([latin1(XMP_APP1_HEADER), enc.encode(xmp)]);
    const segLen = payload.length + 2; // length field includes its own 2 bytes
    if (segLen > 0xffff) return bytes;  // too big for one APP1; skip rather than corrupt
    const seg = concat([Uint8Array.of(0xff, 0xe1, (segLen >> 8) & 0xff, segLen & 0xff), payload]);
    // Insert right after SOI (first two bytes 0xFFD8).
    return concat([bytes.subarray(0, 2), seg, bytes.subarray(2)]);
}

// Overlay standard + GPS field values onto a piexif EXIF object (creating IFDs as needed).
// Only non-empty fields are written, so it serves both a fresh write and overlaying onto EXIF
// loaded from an original file (in which case the fields override the original tags). Mutates
// and returns exifObj.
function applyFieldsToExif(exifObj, s = {}, gps = null) {
    const z  = exifObj['0th']  || (exifObj['0th']  = {});
    const ex = exifObj['Exif'] || (exifObj['Exif'] = {});
    if (s.make)         z[piexif.ImageIFD.Make] = s.make;
    if (s.model)        z[piexif.ImageIFD.Model] = s.model;
    if (s.software)     z[piexif.ImageIFD.Software] = s.software;
    if (s.copyright)    z[piexif.ImageIFD.Copyright] = s.copyright;
    if (s.creator)      z[piexif.ImageIFD.Artist] = s.creator;
    if (s.description)  z[piexif.ImageIFD.ImageDescription] = s.description;
    if (s.dateTime)     z[piexif.ImageIFD.DateTime] = s.dateTime;
    if (s.lens)         ex[piexif.ExifIFD.LensModel] = s.lens;
    if (s.iso)          ex[piexif.ExifIFD.ISOSpeedRatings] = parseInt(s.iso, 10) || 0;
    if (s.focalLength) {
        const fl = parseFloat(s.focalLength);
        if (fl) ex[piexif.ExifIFD.FocalLength] = [Math.round(fl * 100), 100];
    }
    if (gps) {
        const g = exifObj['GPS'] || (exifObj['GPS'] = {});
        g[piexif.GPSIFD.GPSVersionID]    = [2, 2, 0, 0];
        g[piexif.GPSIFD.GPSLatitudeRef]  = gps.lat >= 0 ? 'N' : 'S';
        g[piexif.GPSIFD.GPSLatitude]     = exifGpsRational(gps.lat);
        g[piexif.GPSIFD.GPSLongitudeRef] = gps.lon >= 0 ? 'E' : 'W';
        g[piexif.GPSIFD.GPSLongitude]    = exifGpsRational(gps.lon);
        if (gps.alt != null) {
            g[piexif.GPSIFD.GPSAltitudeRef] = gps.alt < 0 ? 1 : 0;
            g[piexif.GPSIFD.GPSAltitude]    = [Math.round(Math.abs(gps.alt) * 100), 100];
        }
    }
    return exifObj;
}

// Map standard fields (+ GPS) → EXIF via piexifjs, then insert. Best-effort; skips on error.
function writeJpegExif(bytes, s = {}, gps = null) {
    try {
        const exifObj = applyFieldsToExif({ '0th': {}, 'Exif': {} }, s, gps);
        const hasGps = exifObj['GPS'] && Object.keys(exifObj['GPS']).length > 1;
        if (Object.keys(exifObj['0th']).length === 0 && Object.keys(exifObj['Exif']).length === 0 && !hasGps) return bytes;
        return binaryStringToU8(piexif.insert(piexif.dump(exifObj), u8ToBinaryString(bytes)));
    } catch {
        return bytes;
    }
}

// Transplant ALL EXIF from the original JPEG (0th/Exif/GPS/Interop/1st thumbnail) into the
// exported bytes, overlaying the effect's field values (which override). If the original has no
// readable EXIF (e.g. it was a PNG), fall back to writing just the fields.
function transplantExif(bytes, originalBytes, s, gps) {
    try {
        const exifObj = piexif.load(u8ToBinaryString(originalBytes));
        applyFieldsToExif(exifObj, s, gps);
        return binaryStringToU8(piexif.insert(piexif.dump(exifObj), u8ToBinaryString(bytes)));
    } catch {
        return writeJpegExif(bytes, s, gps);
    }
}

// ── public: write metadata onto an exported blob ──────────────────────────────────

/**
 * Return a new Blob with metadata written into the container.
 * @param {Blob} blob    PNG or JPEG blob from canvas.toBlob
 * @param {object} fields  { standard, custom, aiOptOut }
 * @param {object} opts    { writeXmp?: boolean, writeExif?: boolean }
 */
export async function writeMetadata(blob, fields, opts = {}) {
    const { writeXmp = true, writeExif = false } = opts;
    let bytes = new Uint8Array(await blob.arrayBuffer());
    let mime = blob.type;

    if (isPng(bytes)) {
        if (writeXmp) bytes = writePngMetadata(bytes, fields);
        mime = 'image/png';
    } else {
        // JPEG
        if (writeExif) bytes = writeJpegExif(bytes, fields.standard || {}, fields.gps || null);
        if (writeXmp)  bytes = writeJpegXmp(bytes, buildXmpPacket(fields));
        mime = 'image/jpeg';
    }
    return new Blob([bytes], { type: mime });
}

/**
 * Like writeMetadata, but preserves the loaded image's ORIGINAL metadata as faithfully as the
 * output format allows, with the effect's field values overlaid on top (overrides).
 *   • JPEG output: transplants the original's full EXIF verbatim (camera, GPS, thumbnail, maker
 *     notes, …) then overlays field edits; writes XMP from the (auto-filled + edited) fields.
 *   • PNG output: no binary EXIF container — the fields already carry the parsed originals (plus
 *     unknown text chunks as custom entries), so a single XMP packet covers it.
 * Falls back to plain writeMetadata when originalBytes is missing (e.g. a blank canvas).
 * @param {Blob} blob            PNG or JPEG blob from canvas.toBlob
 * @param {Uint8Array} originalBytes  raw bytes of the originally-loaded file
 * @param {object} fields        { standard, custom, aiOptOut, gps }
 * @param {object} opts          { writeXmp?, writeExif? }
 */
export async function writeMetadataPreserving(blob, originalBytes, fields, opts = {}) {
    if (!originalBytes) return writeMetadata(blob, fields, opts);
    const { writeXmp = true } = opts;
    let bytes = new Uint8Array(await blob.arrayBuffer());

    if (isPng(bytes)) {
        if (writeXmp) bytes = writePngMetadata(bytes, fields);
        return new Blob([bytes], { type: 'image/png' });
    }
    bytes = transplantExif(bytes, originalBytes, fields.standard || {}, fields.gps || null);
    if (writeXmp) bytes = writeJpegXmp(bytes, buildXmpPacket(fields));
    return new Blob([bytes], { type: 'image/jpeg' });
}

// ── public: read metadata (for the Reveal tool) ───────────────────────────────────

/** Extract human-readable metadata from image bytes. Returns { xmp, text:{}, exif:{} }. */
export function readAllMetadata(bytes) {
    const result = { xmp: null, text: {}, exif: {} };
    if (isPng(bytes)) {
        let pos = 8;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        while (pos + 8 <= bytes.length) {
            const len = view.getUint32(pos);
            const type = dec.decode(bytes.subarray(pos + 4, pos + 8));
            const data = bytes.subarray(pos + 8, pos + 8 + len);
            if (type === 'tEXt') {
                const nul = data.indexOf(0);
                if (nul >= 0) result.text[decLatin1.decode(data.subarray(0, nul))] = decLatin1.decode(data.subarray(nul + 1));
            } else if (type === 'iTXt') {
                const nul = data.indexOf(0);
                const keyword = dec.decode(data.subarray(0, nul));
                // skip: compFlag, compMethod, langTag\0, translatedKeyword\0
                let p = nul + 3;
                p = data.indexOf(0, p) + 1;
                p = data.indexOf(0, p) + 1;
                const txt = dec.decode(data.subarray(p));
                if (keyword === 'XML:com.adobe.xmp') result.xmp = txt;
                else result.text[keyword] = txt;
            } else if (type === 'IEND') break;
            pos += 12 + len;
        }
    } else {
        try {
            const exif = piexif.load(u8ToBinaryString(bytes));
            const TAG_GROUP = { '0th': 'Image', 'Exif': 'Exif', 'GPS': 'GPS' };
            for (const ifd of ['0th', 'Exif', 'GPS']) {
                for (const tag in exif[ifd] || {}) {
                    const name = piexif.TAGS[TAG_GROUP[ifd]]?.[tag]?.name || tag;
                    result.exif[name] = exif[ifd][tag];
                }
            }
        } catch { /* no EXIF */ }
        // XMP APP1
        const marker = latin1(XMP_APP1_HEADER);
        for (let i = 0; i + marker.length < bytes.length; i++) {
            let hit = true;
            for (let j = 0; j < marker.length; j++) if (bytes[i + j] !== marker[j]) { hit = false; break; }
            if (hit) {
                const end = bytes.indexOf(0x3c, i + marker.length); // not exact; find xpacket end
                const tail = dec.decode(bytes.subarray(i + marker.length));
                const m = tail.match(/<\?xpacket end[\s\S]*?\?>/);
                result.xmp = m ? tail.slice(0, tail.indexOf(m[0]) + m[0].length) : tail;
                break;
            }
        }
    }
    return result;
}

// ── public: parse original metadata into the effect's field shape (auto-fill) ──────

const xmlUnesc = (s) => String(s ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// A piexif rational (or number) → number.
const ratNum = (v) => Array.isArray(v) ? (v[1] ? v[0] / v[1] : 0) : (Number(v) || 0);

// EXIF DMS rationals + ref ('N'/'S'/'E'/'W') → signed decimal degrees.
function gpsToDecimal(dms, ref) {
    if (!Array.isArray(dms) || dms.length < 3) return null;
    const d = ratNum(dms[0]) + ratNum(dms[1]) / 60 + ratNum(dms[2]) / 3600;
    return (ref === 'S' || ref === 'W') ? -d : d;
}

// XMP "deg,decimalMin{N|S|E|W}" (or a plain decimal) → signed decimal degrees.
function parseXmpGps(str) {
    if (!str) return null;
    const m = str.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*([NSEW])?/i);
    if (!m) { const f = parseFloat(str); return Number.isFinite(f) ? f : null; }
    let dec = parseFloat(m[1]) + parseFloat(m[2]) / 60;
    const ref = (m[3] || '').toUpperCase();
    return (ref === 'S' || ref === 'W') ? -dec : dec;
}

// Extract a single XMP tag's text value (handles element, nested rdf:li, and attribute forms).
function xmpTag(xmp, name) {
    const el = xmp.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
    if (el) {
        let inner = el[1];
        const li = inner.match(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/);
        if (li) inner = li[1];
        return xmlUnesc(inner.trim());
    }
    const attr = xmp.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
    return attr ? xmlUnesc(attr[1]) : null;
}

const XMP_FIELD_MAP = {
    copyright: 'dc:rights', description: 'dc:description', creator: 'dc:creator',
    publisher: 'dc:publisher', software: 'xmp:CreatorTool', dateTime: 'xmp:CreateDate',
    make: 'tiff:Make', model: 'tiff:Model', lens: 'aux:Lens',
    focalLength: 'exif:FocalLength', exposureTime: 'exif:ExposureTime',
    fNumber: 'exif:FNumber', iso: 'exif:ISOSpeedRatings',
};

function xmpToFields(xmp) {
    const s = {};
    for (const [field, tag] of Object.entries(XMP_FIELD_MAP)) {
        const v = xmpTag(xmp, tag);
        if (v) s[field] = v;
    }
    let gps = null;
    const lat = parseXmpGps(xmpTag(xmp, 'exif:GPSLatitude'));
    const lon = parseXmpGps(xmpTag(xmp, 'exif:GPSLongitude'));
    if (lat != null && lon != null) {
        gps = { lat, lon };
        const altS = xmpTag(xmp, 'exif:GPSAltitude');
        if (altS) {
            const parts = altS.split('/');
            const alt = parts[1] ? Number(parts[0]) / Number(parts[1]) : parseFloat(altS);
            if (Number.isFinite(alt)) gps.alt = xmpTag(xmp, 'exif:GPSAltitudeRef') === '1' ? -alt : alt;
        }
    }
    return { standard: s, gps };
}

function exifToFields(exifObj) {
    const s = {};
    const z = exifObj['0th'] || {}, ex = exifObj['Exif'] || {}, g = exifObj['GPS'] || {};
    const txt = (v) => (v == null ? '' : String(v)).replace(/\0+$/, '').trim();
    if (z[piexif.ImageIFD.Make])             s.make = txt(z[piexif.ImageIFD.Make]);
    if (z[piexif.ImageIFD.Model])            s.model = txt(z[piexif.ImageIFD.Model]);
    if (z[piexif.ImageIFD.Software])         s.software = txt(z[piexif.ImageIFD.Software]);
    if (z[piexif.ImageIFD.Copyright])        s.copyright = txt(z[piexif.ImageIFD.Copyright]);
    if (z[piexif.ImageIFD.Artist])           s.creator = txt(z[piexif.ImageIFD.Artist]);
    if (z[piexif.ImageIFD.ImageDescription]) s.description = txt(z[piexif.ImageIFD.ImageDescription]);
    if (z[piexif.ImageIFD.DateTime])         s.dateTime = txt(z[piexif.ImageIFD.DateTime]);
    if (ex[piexif.ExifIFD.LensModel])        s.lens = txt(ex[piexif.ExifIFD.LensModel]);
    const iso = ex[piexif.ExifIFD.ISOSpeedRatings];
    if (iso != null)                         s.iso = String(Array.isArray(iso) ? iso[0] : iso);
    if (ex[piexif.ExifIFD.FocalLength])      s.focalLength = String(+ratNum(ex[piexif.ExifIFD.FocalLength]).toFixed(2));
    const expo = ex[piexif.ExifIFD.ExposureTime];
    if (expo)                                s.exposureTime = Array.isArray(expo) ? `${expo[0]}/${expo[1]}` : String(expo);
    if (ex[piexif.ExifIFD.FNumber])          s.fNumber = String(+ratNum(ex[piexif.ExifIFD.FNumber]).toFixed(2));
    let gps = null;
    const lat = gpsToDecimal(g[piexif.GPSIFD.GPSLatitude], g[piexif.GPSIFD.GPSLatitudeRef]);
    const lon = gpsToDecimal(g[piexif.GPSIFD.GPSLongitude], g[piexif.GPSIFD.GPSLongitudeRef]);
    if (lat != null && lon != null) {
        gps = { lat, lon };
        if (g[piexif.GPSIFD.GPSAltitude]) {
            const alt = ratNum(g[piexif.GPSIFD.GPSAltitude]);
            gps.alt = g[piexif.GPSIFD.GPSAltitudeRef] === 1 ? -alt : alt;
        }
    }
    return { standard: s, gps };
}

/**
 * Parse an original image file's metadata into the Metadata effect's field shape, for auto-fill.
 * EXIF is authoritative for photos, so it overlays anything found in XMP. Unknown PNG text chunks
 * are carried through as custom fields so nothing readable is silently dropped.
 * @param {Uint8Array} bytes  raw file bytes
 * @returns {{ standard: object, gps: object|null, custom: Array<{key:string,value:string}> }}
 */
export function parseMetadataToFields(bytes) {
    if (!bytes) return { standard: {}, gps: null, custom: [] };
    const all = readAllMetadata(bytes);
    const fromXmp = all.xmp ? xmpToFields(all.xmp) : { standard: {}, gps: null };
    let fromExif = { standard: {}, gps: null };
    if (!isPng(bytes)) {
        try { fromExif = exifToFields(piexif.load(u8ToBinaryString(bytes))); } catch { /* none */ }
    }
    const standard = { ...fromXmp.standard, ...fromExif.standard };
    const gps = fromExif.gps || fromXmp.gps || null;

    const custom = [];
    const KNOWN_TEXT = new Set(['Copyright', 'Author', 'Description', 'Software', 'XML:com.adobe.xmp']);
    for (const [k, v] of Object.entries(all.text || {})) {
        if (v && !KNOWN_TEXT.has(k)) custom.push({ key: k, value: v });
    }
    return { standard, gps, custom };
}
