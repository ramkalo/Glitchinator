import { isProcessing, setIsProcessing, setDebounceTimer, debounceTimer, useWebGL, originalImage } from './glstate.js';
import { renderWebGL } from './webgl.js';
import { processCanvas2D } from './canvas2d.js';
import { renderTimestampOverlay } from '../effects/vhs.js';
import { showProcessIndicator } from '../utils/notifications.js';
import { onParamsChange } from '../state/params.js';

const overlayCanvas = document.getElementById('overlayCanvas');

// Auto-trigger a debounced render whenever any param changes.
// This means controls.js, presets.js, undo.js etc. never need to call
// processImage() explicitly — just mutate params and the pipeline fires.
onParamsChange(processImage);

export function processImage() {
    if (!originalImage || isProcessing) return;
    clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(doProcess, 150));
}

function doProcess() {
    if (!originalImage || isProcessing) return;
    setIsProcessing(true);
    showProcessIndicator(true);

    if (useWebGL) {
        renderWebGL();
        // Draw VHS timestamp onto the transparent CSS overlay canvas — zero readPixels
        renderTimestampOverlay(overlayCanvas);
    } else {
        // Canvas 2D draws timestamp directly to mainCanvas; clear the overlay
        overlayCanvas.getContext('2d').clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        processCanvas2D();
    }

    setIsProcessing(false);
    showProcessIndicator(false);
}
