// Shared grid geometry for the Collage and Slicer effects.
//
// Splits a w×h canvas into cols×rows integer-pixel cells that tile it with no gaps
// and no overlap. Any remainder pixels (when w/cols or h/rows don't divide evenly)
// are distributed one-per-cell to the LEFT columns (extra width) and the BOTTOM rows
// (extra height), matching the spec.
//
// Cells are returned in row-major reading order (top-left → bottom-right). Each cell's
// `index` (= row*cols + col) is the stable slot number used by both effects — the
// collage image slot and the slicer export sequence number.
export function computeGridCells(w, h, cols, rows) {
    cols = Math.max(1, Math.round(cols || 1));
    rows = Math.max(1, Math.round(rows || 1));
    const baseW = Math.floor(w / cols), remW = w - baseW * cols; // extra width  → leftmost cols
    const baseH = Math.floor(h / rows), remH = h - baseH * rows; // extra height → bottom rows

    const cells = [];
    let y = 0;
    for (let row = 0; row < rows; row++) {
        const ch = baseH + ((rows - 1 - row) < remH ? 1 : 0); // bottom rows get +1px
        let x = 0;
        for (let col = 0; col < cols; col++) {
            const cw = baseW + (col < remW ? 1 : 0);          // left cols get +1px
            cells.push({ col, row, index: row * cols + col, x, y, w: cw, h: ch });
            x += cw;
        }
        y += ch;
    }
    return cells;
}
