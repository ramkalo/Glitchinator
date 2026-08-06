// Reveal tool — reads back embedded data from the image currently loaded in the app, so
// hidden/encrypted payloads (and standard metadata) can be recovered. Round-trips the Embed
// (Hidden) and Metadata effects. Operates on the loaded source image (pixels + original file
// bytes), not on a separately-uploaded file.

import { decodePayload } from '../util/steg.js';
import { decodeRobust } from '../util/robustWatermark.js';
import { readAllMetadata } from '../util/imageMeta.js';
import { originalImage, originalFileBytes } from '../renderer/glstate.js';

const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Decode the loaded image element/canvas to ImageData (exact pixels — LSB payloads survive).
function loadedImageData() {
    if (!originalImage) return null;
    const w = originalImage.width, h = originalImage.height;
    if (!w || !h) return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(originalImage, 0, 0);
    return ctx.getImageData(0, 0, w, h);
}

function renderMetadata(meta) {
    const parts = [];
    const rows = (obj) => Object.entries(obj)
        .map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join('');
    if (Object.keys(meta.text).length) parts.push(`<h3>PNG text</h3>${rows(meta.text)}`);
    if (Object.keys(meta.exif).length) parts.push(`<h3>EXIF</h3>${rows(meta.exif)}`);
    if (meta.xmp) parts.push(`<h3>XMP</h3><pre style="white-space:pre-wrap;word-break:break-word;">${esc(meta.xmp)}</pre>`);
    return parts.length ? parts.join('') : '<div style="color:var(--text-dim);">No file metadata found.</div>';
}

let _wired = false;

// Open the Reveal modal and scan the loaded image immediately.
export function openReveal() {
    initRevealTool();
    const modal = document.getElementById('revealModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    runReveal();
}

// Scan the currently-loaded image for hidden payloads + metadata and render the report. The
// metadata (which can be a huge XMP block) renders in its own scrollable box; the hidden
// payload renders in a separate box below it so it is never pushed out of view.
async function runReveal() {
    const metaEl    = document.getElementById('revealMetaResult');
    const payloadEl = document.getElementById('revealPayloadResult');
    const passIn = document.getElementById('revealPass');
    const keyIn  = document.getElementById('revealKey');
    if (!metaEl || !payloadEl) return;

    if (!originalImage) {
        metaEl.innerHTML = '<div style="color:var(--text-dim);">Load an image into the app first.</div>';
        payloadEl.innerHTML = '';
        return;
    }
    metaEl.innerHTML = 'Reading…';
    payloadEl.innerHTML = '';

    // File metadata (needs the original uploaded bytes; a blank canvas has none).
    const metaSections = [];
    if (originalFileBytes) {
        try {
            metaSections.push(renderMetadata(readAllMetadata(originalFileBytes)));
        } catch {
            metaSections.push('<div style="color:var(--text-dim);">Could not read file metadata.</div>');
        }
    } else {
        metaSections.push('<div style="color:var(--text-dim);">No source file metadata (blank canvas or generated image).</div>');
    }

    // Hidden payload (needs pixels). Tries the robust DCT watermark and the LSB schemes.
    const payloadSections = [];
    try {
        const imgData = loadedImageData();

        const robust = imgData ? decodeRobust(imgData) : null;
        if (robust) {
            payloadSections.push(`<h3>Robust watermark text</h3><pre style="white-space:pre-wrap;word-break:break-word;">${esc(robust.text)}</pre>`);
        }

        let lsb = null, lsbErr = null;
        try {
            if (imgData) lsb = await decodePayload(imgData, {
                passphrase: passIn?.value || undefined,
                key: keyIn?.value || undefined,
            });
        } catch (e) { lsbErr = e; }

        if (lsbErr) {
            payloadSections.push(`<h3>Hidden payload</h3><div style="color:var(--danger,#e66);">${esc(lsbErr.message || lsbErr)}</div>`);
        } else if (lsb?.needsPassphrase) {
            payloadSections.push('<h3>Hidden payload</h3><div>Encrypted payload found — enter the passphrase below and Reveal again.</div>');
        } else if (lsb?.dataUrl) {
            payloadSections.push(`<h3>Hidden image${lsb.encrypted ? ' (decrypted)' : ''}</h3><img src="${esc(lsb.dataUrl)}" style="max-width:100%;border:1px solid var(--border);">`);
        } else if (lsb?.text) {
            payloadSections.push(`<h3>Hidden text${lsb.encrypted ? ' (decrypted)' : ''}</h3><pre style="white-space:pre-wrap;word-break:break-word;">${esc(lsb.text)}</pre>`);
        } else if (!robust) {
            payloadSections.push('<h3>Hidden payload</h3><div style="color:var(--text-dim);">None found (or it was stripped by re-encoding/resizing).</div>');
        }
    } catch (err) {
        payloadSections.push(`<h3>Hidden payload</h3><div style="color:var(--danger,#e66);">${esc(err.message || err)}</div>`);
    }

    const hr = '<hr style="border-color:var(--border);margin:10px 0;">';
    metaEl.innerHTML = metaSections.join(hr);
    payloadEl.innerHTML = payloadSections.join(hr);
}

export function initRevealTool() {
    if (_wired) return;
    const modal    = document.getElementById('revealModal');
    const runBtn   = document.getElementById('revealRunBtn');
    const closeBtn = document.getElementById('revealCloseBtn');
    if (!modal) return;
    _wired = true;

    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    runBtn.addEventListener('click', () => runReveal());
}
