import { canvas, originalImage } from '../renderer/glstate.js';
import { renderForExport } from '../renderer/webgl.js';
import { getStack } from '../state/effectStack.js';
import { computeGridCells } from './gridLayout.js';

// While an export is running, canvas2d suppresses the grid guide lines so they are
// never baked into the exported cell images (they are a preview aid only).
let _exporting = false;

function drawGrid(ctx, p) {
    const w = canvas.width;
    const h = canvas.height;
    const cols = Math.max(1, Math.round(p.slicerCols || 1));
    const rows = Math.max(1, Math.round(p.slicerRows || 1));
    const cells = computeGridCells(w, h, cols, rows);

    const line = (x0, y0, x1, y1) => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        // Dark underlay + light overlay so the guides read on any image.
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.stroke();
    };

    // Internal vertical boundaries (from row 0's cell x positions).
    for (let c = 1; c < cols; c++) { const x = cells[c].x; line(x, 0, x, h); }
    // Internal horizontal boundaries (from column 0's cell y positions).
    for (let r = 1; r < rows; r++) { const y = cells[r * cols].y; line(0, y, w, y); }
}

function applySlicer(ctx, p) {
    if (_exporting || !p.slicerShowGrid) return;
    drawGrid(ctx, p);
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = filename;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Split the full-resolution rendered image along the grid and download each cell as
// its own PNG, named "<base>_<n>.png" in row-major reading order (1-based, zero-padded).
export async function sliceAndExport(instId) {
    if (!originalImage) { alert('Load an image first.'); return; }
    const inst = getStack().find(i => i.id === instId);
    if (!inst) return;

    // Lazy import avoids a module-init cycle (registry → slicer → pipeline runs
    // pipeline's top-level onStackChange before effectStack finishes initializing).
    const { processImageImmediate } = await import('../renderer/pipeline.js');

    // Render at full source resolution with the grid overlay suppressed.
    _exporting = true;
    try {
        renderForExport(getStack());
        const src = document.createElement('canvas');
        src.width = canvas.width;
        src.height = canvas.height;
        src.getContext('2d').drawImage(canvas, 0, 0);
        _exporting = false;
        processImageImmediate(); // restore the on-screen preview (with grid)

        const cells = computeGridCells(src.width, src.height, inst.params.slicerCols, inst.params.slicerRows);
        const base = (inst.params.slicerBaseName || 'slice').trim() || 'slice';
        const pad = String(cells.length).length;

        for (const cell of cells) {
            const c = document.createElement('canvas');
            c.width = cell.w;
            c.height = cell.h;
            c.getContext('2d').drawImage(src, cell.x, cell.y, cell.w, cell.h, 0, 0, cell.w, cell.h);
            const blob = await new Promise(res => c.toBlob(res, 'image/png'));
            if (blob) downloadBlob(blob, `${base}_${String(cell.index + 1).padStart(pad, '0')}.png`);
            await sleep(150); // stagger so the browser doesn't drop rapid-fire downloads
        }
    } finally {
        _exporting = false;
    }
}

export const slicerEffect = {
    name:   'slicer',
    label:  'Slicer',
    kind:   'context',
    params: {
        slicerEnabled:  { default: false, label: 'Enable' },
        slicerCols:     { default: 3, min: 1, max: 12, label: 'Columns' },
        slicerRows:     { default: 3, min: 1, max: 12, label: 'Rows' },
        slicerShowGrid: { default: true, label: 'Show Grid' },
        slicerBaseName: { default: 'slice', label: 'Base Name' },
    },
    enabled: (p) => p.slicerEnabled,
    uiGroups: () => [
        { label: 'Grid', keys: ['slicerCols', 'slicerRows', 'slicerShowGrid'] },
        { label: 'Export', keys: ['slicerBaseName'] },
    ],
    canvas2d: applySlicer,
};
