import { canvas, ctx, originalImage } from './glstate.js';
import { params } from '../state/params.js';
import { EFFECTS } from '../effects/registry.js';

/**
 * Registry-driven Canvas 2D render pipeline.
 *
 * Effects are bucketed by their `pass` field:
 *   'pre-crt' — imageData effects before any context drawing
 *   'context' — draws directly onto the canvas 2D context (e.g. text overlays)
 *   'post'    — imageData effects that need the fully composited image
 *
 * To add or reorder an effect, edit effects/registry.js only.
 */
export function processCanvas2D() {
    canvas.width  = originalImage.width;
    canvas.height = originalImage.height;
    ctx.drawImage(originalImage, 0, 0);

    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let hasPost   = false;

    // --- Pass 1: pre-crt imageData effects ---
    for (const effect of EFFECTS) {
        if (effect.pass !== 'pre-crt') continue;
        if (!effect.enabled(params))   continue;
        imageData = effect.canvas2d(imageData);
    }

    // Flush imageData to canvas before context effects
    ctx.putImageData(imageData, 0, 0);

    // --- Pass 2: context effects (e.g. VHS timestamp text) ---
    for (const effect of EFFECTS) {
        if (effect.pass !== 'context') continue;
        if (!effect.enabled(params))   continue;
        effect.canvas2d(ctx);
    }

    // --- Pass 3: post imageData effects (waves, CRT) ---
    // Read back once for all post effects rather than per-effect
    for (const effect of EFFECTS) {
        if (effect.pass !== 'post')  continue;
        if (!effect.enabled(params)) continue;
        if (!hasPost) {
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            hasPost = true;
        }
        imageData = effect.canvas2d(imageData);
    }

    if (hasPost) {
        ctx.putImageData(imageData, 0, 0);
    }
}
