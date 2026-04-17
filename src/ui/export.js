import { params } from '../state/params.js';
import { canvas, useWebGL, useWebGL2 } from '../renderer/glstate.js';
import { renderWebGL } from '../renderer/webgl.js';
import { processCanvas2D } from '../renderer/canvas2d.js';
import { renderTimestampOverlay } from '../effects/vhs.js';
import { showNotification } from '../utils/notifications.js';

export function exportImage(format) {
    console.log('Exporting with:', useWebGL ? (useWebGL2 ? 'WebGL 2' : 'WebGL 1') : 'Canvas 2D');

    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpg' ? 'jpg' : 'png';
    const now = new Date();
    const ts = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
    const filename = `retroinator-export-${ts}.${ext}`;

    let exportSource;
    if (useWebGL) {
        // Re-render WebGL pipeline then composite with overlay canvas
        renderWebGL();
        const overlayCanvas = document.getElementById('overlayCanvas');
        renderTimestampOverlay(overlayCanvas);

        const composite = document.createElement('canvas');
        composite.width  = canvas.width;
        composite.height = canvas.height;
        const cctx = composite.getContext('2d');
        cctx.drawImage(canvas, 0, 0);
        cctx.drawImage(overlayCanvas, 0, 0);  // timestamp on top
        exportSource = composite;
    } else {
        processCanvas2D();
        exportSource = canvas;  // timestamp already baked into mainCanvas
    }

    exportSource.toBlob(function(blob) {
        const objectURL = URL.createObjectURL(blob);
        const previewModal = document.getElementById('exportPreviewModal');
        const previewImg = document.getElementById('exportPreviewImg');
        const hint = document.getElementById('exportHint');

        previewImg.src = objectURL;
        previewModal.dataset.objectUrl = objectURL;
        previewModal.classList.remove('hidden');

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isIOS) {
            // iOS: show long-press hint so user can save directly to Photos
            hint.classList.remove('hidden');
        } else {
            // Desktop: trigger download automatically and show preview
            hint.classList.add('hidden');
            const link = document.createElement('a');
            link.download = filename;
            link.href = objectURL;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, mimeType);
}
