import { canvas } from '../../renderer/glstate.js';
import { getStack } from '../../state/effectStack.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize } from '../overlayUtils.js';
import { computeGridCells } from '../../effects/gridLayout.js';
import { getCollageImages } from '../../effects/collage.js';

// Grid cells over a w×h area that line up with the rendered collage (the effect uses the
// same proportional grid on canvas.width/height). Callers pass the coordinate basis so
// hit-testing (live client rect) and drawing (overlay backing store) always agree.
function cells(p, w, h) {
    return computeGridCells(w, h, p.collageCols, p.collageRows);
}

// Parse a 'cell:N' handle into its integer index, or null.
function cellIndex(h) {
    return (typeof h === 'string' && h.startsWith('cell:')) ? parseInt(h.slice(5), 10) : null;
}

export function drawCollage(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);

    const imgs = getCollageImages(state.instId) || [];
    const grid = cells(p, W, H);
    const source = cellIndex(state.handle);
    const target = state.collageTarget;

    for (const c of grid) {
        const filled = !!imgs[c.index]?.bitmap;

        // Target highlight (accent fill) while a drag is in progress.
        if (target === c.index && source != null) {
            uiCtx.fillStyle = 'rgba(80,170,255,0.28)';
            uiCtx.fillRect(c.x, c.y, c.w, c.h);
        }

        // Cell border — dashed; brighter/solid-ish for filled cells, dim for empty.
        uiCtx.save();
        uiCtx.setLineDash([5, 5]);
        uiCtx.lineWidth = 1.5;
        // Dark under-stroke for contrast on light images.
        uiCtx.strokeStyle = 'rgba(0,0,0,0.55)';
        uiCtx.lineDashOffset = 5;
        uiCtx.strokeRect(c.x + 0.75, c.y + 0.75, c.w - 1.5, c.h - 1.5);
        uiCtx.strokeStyle = filled ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)';
        uiCtx.lineDashOffset = 0;
        uiCtx.strokeRect(c.x + 0.75, c.y + 0.75, c.w - 1.5, c.h - 1.5);
        uiCtx.restore();

        // Source cell being dragged — dim it and draw a solid outline.
        if (source === c.index) {
            uiCtx.fillStyle = 'rgba(0,0,0,0.35)';
            uiCtx.fillRect(c.x, c.y, c.w, c.h);
            uiCtx.save();
            uiCtx.setLineDash([]);
            uiCtx.lineWidth = 2;
            uiCtx.strokeStyle = 'rgba(80,170,255,0.95)';
            uiCtx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
            uiCtx.restore();
        }

        // 1-based cell number, top-left corner.
        const label = String(c.index + 1);
        uiCtx.font = '11px sans-serif';
        uiCtx.textAlign = 'left';
        uiCtx.textBaseline = 'top';
        uiCtx.fillStyle = 'rgba(0,0,0,0.6)';
        uiCtx.fillText(label, c.x + 4.5, c.y + 4.5);
        uiCtx.fillStyle = filled ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)';
        uiCtx.fillText(label, c.x + 4, c.y + 4);
    }
}

// Return 'cell:N' for the cell under the pointer. Any cell can start a drag (empty
// cells included) so the whole grid can be rearranged; swapping just moves images
// around. Geometry is computed from the live client rect so it matches the pointer.
export function hitTestCollage(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (const c of cells(inst.params, rect.width, rect.height)) {
        if (mx >= c.x && mx < c.x + c.w && my >= c.y && my < c.y + c.h) return `cell:${c.index}`;
    }
    return null;
}

// While dragging, track which cell is under the pointer (the drop target) and redraw
// the highlight. No param writes / no swap — the swap happens on drop in onUp().
export function onDragCollage(e, inst, rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let target = null;
    for (const c of cells(inst.params, rect.width, rect.height)) {
        if (mx >= c.x && mx < c.x + c.w && my >= c.y && my < c.y + c.h) { target = c.index; break; }
    }
    state.collageTarget = target;
    drawCollage(inst.params);
}
