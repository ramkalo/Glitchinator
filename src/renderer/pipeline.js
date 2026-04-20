import { isProcessing, setIsProcessing, setDebounceTimer, debounceTimer, originalImage } from './glstate.js';
import { processCanvas2D, processCanvas2DStack } from './canvas2d.js';
import { renderTimestampOverlay } from '../effects/vhs.js';
import { showProcessIndicator } from '../utils/notifications.js';
import { onParamsChange } from '../state/params.js';
import { onStackChange, getStack } from '../state/effectStack.js';

const overlayCanvas = document.getElementById('overlayCanvas');

onParamsChange(processImage);
onStackChange(processImage);

export function processImage() {
    if (!originalImage || isProcessing) return;
    clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(doProcess, 150));
}

async function doProcess() {
    if (!originalImage || isProcessing) return;
    setIsProcessing(true);
    showProcessIndicator(true);
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

    const stack = getStack();
    overlayCanvas.getContext('2d').clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (stack.length > 0) {
        processCanvas2DStack(stack);
    } else {
        processCanvas2D();
    }

    setIsProcessing(false);
    showProcessIndicator(false);
}