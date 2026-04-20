import { params } from '../state/params.js';
import { canvas } from '../renderer/glstate.js';
import { processCanvas2D, processCanvas2DStack } from '../renderer/canvas2d.js';
import { renderTimestampOverlay } from '../effects/vhs.js';
import { showNotification } from '../utils/notifications.js';
import { getStack } from '../state/effectStack.js';

export function exportImage(format) {
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

    const stack = getStack();
    const overlayCanvas = document.getElementById('overlayCanvas');

    if (stack.length > 0) {
        processCanvas2DStack(stack);
    } else {
        processCanvas2D();
    }

    const exportSource = canvas;

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
            hint.classList.remove('hidden');
        } else {
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