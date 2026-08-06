import { canvas, originalImage, originalFileBytes } from '../renderer/glstate.js';
import { renderForExport } from '../renderer/webgl.js';
import { getStack } from '../state/effectStack.js';
import { encodePayload, PTYPE } from '../util/steg.js';
import { embedRobust } from '../util/robustWatermark.js';
import { writeMetadata, writeMetadataPreserving } from '../util/imageMeta.js';
import { collectMetadataFields } from '../effects/overwrite.js';
import { launderImageData } from '../util/launder.js';

// Find an enabled Protect effect instance in the stack (or null).
function activeInstance(name, enabledKey) {
    const inst = getStack().find(i => i.effectName === name);
    return inst && inst.params[enabledKey] ? inst : null;
}

function canvasToBlob(mime, quality) {
    return new Promise(res => canvas.toBlob(res, mime, quality));
}

// Snapshot the current canvas into a fresh 2D canvas + ImageData for pixel-domain work.
function grabCanvasPixels() {
    const w = canvas.width, h = canvas.height;
    const c2d = document.createElement('canvas');
    c2d.width = w; c2d.height = h;
    const ctx = c2d.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    return { c2d, ctx, imgData: ctx.getImageData(0, 0, w, h) };
}

// Write the Metadata effect's fields onto a blob. When "Copy metadata from loaded image" is on
// (and we have the original bytes), preserve the original file's metadata verbatim first, with
// the effect's field values overlaid on top.
function applyMetadata(blob, meta) {
    const fields = collectMetadataFields(meta.params);
    const opts = {
        writeXmp: meta.params.metaWriteXMP !== false,
        writeExif: !!meta.params.metaWriteEXIF,
    };
    return (meta.params.metaPreserveOriginal && originalFileBytes)
        ? writeMetadataPreserving(blob, originalFileBytes, fields, opts)
        : writeMetadata(blob, fields, opts);
}

// Build the final export blob, applying hidden LSB embedding and/or metadata.
// Returns { blob, forcedPng }.
async function buildExportBlob(format) {
    const launder = activeInstance('redact', 'redactEnabled');
    const hidden  = activeInstance('cloak', 'cloakEnabled');
    const meta    = activeInstance('overwrite', 'overwriteEnabled');

    // Launder supersedes embedding — laundering an image you also asked to embed into is
    // contradictory, so the scrub wins. Metadata is discarded because we rebuild the file from
    // canvas pixels (never call writeMetadata) unless the user opted to keep metadata fields.
    if (launder) {
        const lp = launder.params;
        const { c2d, ctx, imgData } = grabCanvasPixels();
        launderImageData(imgData, {
            scrubHidden: lp.redactScrubHidden !== false,
            strength: lp.redactStrength || 'medium',
        });
        ctx.putImageData(imgData, 0, 0);

        let blob;
        if (lp.redactHarden) {
            // Lossy re-encode also destroys fragile/unknown stego and the LSB plane entirely.
            blob = await new Promise(res => c2d.toBlob(res, 'image/jpeg', 0.9));
        } else {
            const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
            blob = await new Promise(res => c2d.toBlob(res, mime, mime === 'image/jpeg' ? 0.95 : undefined));
        }

        // If the user chose to keep metadata fields, allow an enabled Metadata effect to write
        // them onto the freshly-cleaned image; otherwise the output carries none.
        if (lp.redactStripMetadata === false && meta) {
            blob = await applyMetadata(blob, meta);
        }
        return { blob, forcedPng: false };
    }

    const hp = hidden?.params;
    const scheme = hp?.cloakScheme || 'standard';
    const isRobust = scheme === 'robust';
    const hasHiddenPayload = hp && (isRobust
        ? (hp.cloakText || '').length > 0                          // robust: short text only
        : (hp.cloakType === 'image' && hp.cloakImage) ||
          (hp.cloakType !== 'image' && (hp.cloakText || '').length > 0));

    let blob;
    let forcedPng = false;

    if (hasHiddenPayload) {
        const w = canvas.width, h = canvas.height;
        const c2d = document.createElement('canvas');
        c2d.width = w; c2d.height = h;
        const ctx = c2d.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        const imgData = ctx.getImageData(0, 0, w, h);

        if (isRobust) {
            // Frequency-domain watermark — built to survive lossy re-encoding, so keep the
            // user's chosen format (high-quality JPEG allowed; no forced PNG).
            embedRobust(imgData, hp.cloakText, { strength: hp.cloakStrength || 'medium' });
            ctx.putImageData(imgData, 0, 0);
            blob = format === 'jpg'
                ? await new Promise(res => c2d.toBlob(res, 'image/jpeg', 0.95))
                : await new Promise(res => c2d.toBlob(res, 'image/png'));
        } else {
            // LSB steg needs exact pixels and a lossless container → force PNG.
            forcedPng = true;
            const isImage = hp.cloakType === 'image';
            await encodePayload(imgData, {
                scheme,
                type: isImage ? PTYPE.IMAGE : PTYPE.TEXT,
                payload: isImage ? hp.cloakImage : hp.cloakText,
                passphrase: hp.cloakPassphrase || '',
                key: hp.cloakKey || '',
            });
            ctx.putImageData(imgData, 0, 0);
            blob = await new Promise(res => c2d.toBlob(res, 'image/png'));
        }
    } else {
        const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
        blob = await canvasToBlob(mime);
    }

    if (meta) {
        blob = await applyMetadata(blob, meta);
    }
    return { blob, forcedPng };
}

export async function exportImage(format, filename) {
    if (!originalImage) return;

    // Render at full image resolution (no DPR scaling) before capturing
    renderForExport(getStack());

    let blob, forcedPng;
    try {
        ({ blob, forcedPng } = await buildExportBlob(format));
    } catch (err) {
        alert('Export failed: ' + (err?.message || err));
        return;
    }
    if (!blob) return;

    // A hidden embed forces PNG — fix the filename/format if the user picked JPEG.
    if (forcedPng && format === 'jpg') {
        filename = filename.replace(/\.(jpg|jpeg)$/i, '.png');
        format = 'png';
        alert('Hidden embedding requires a lossless format — exported as PNG instead of JPEG.');
    }

    const mimeType = blob.type || (format === 'jpg' ? 'image/jpeg' : 'image/png');
    const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
    // Match the filename to the actual output type (e.g. Launder "harden" re-encodes to JPEG
    // even when the user picked PNG).
    filename = filename.replace(/\.(png|jpg|jpeg)$/i, `.${ext}`);

    const objectURL = URL.createObjectURL(blob);
    const previewModal = document.getElementById('exportPreviewModal');
    const previewImg = document.getElementById('exportPreviewImg');
    const hint = document.getElementById('exportHint');

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOS) {
        previewImg.src = objectURL;
        previewModal.dataset.objectUrl = objectURL;
        previewModal.classList.remove('hidden');
        hint.classList.remove('hidden');
    } else if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: 'Image', accept: { [mimeType]: [`.${ext}`] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            previewImg.src = objectURL;
            previewModal.dataset.objectUrl = objectURL;
            previewModal.classList.remove('hidden');
            hint.classList.add('hidden');
        } catch (err) {
            URL.revokeObjectURL(objectURL);
            if (err.name !== 'AbortError') throw err;
        }
    } else {
        hint.classList.add('hidden');
        previewImg.src = objectURL;
        previewModal.dataset.objectUrl = objectURL;
        previewModal.classList.remove('hidden');
        const link = document.createElement('a');
        link.download = filename;
        link.href = objectURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
