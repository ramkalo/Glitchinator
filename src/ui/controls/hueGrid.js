// Hue Remap grid control — the custom canvas UI for colorRemap's "hue" mode.
//
// Shows a square HSL color picker partitioned into a deformable dim×dim lattice
// (dim = 2/3/4 → 4/9/16 cells). Interior intersections drag freely (producing
// non-right-angle cells); edge nodes slide along their edge and corners are
// pinned, so the lattice always tiles the unit square fully. Each cell is
// assigned a color via the standard palette swatch strip; pixels whose color
// falls in a cell are remapped to that color (see src/effects/colorRemap.js).

import { setInstanceParam } from '../../state/effectStack.js';
import { saveState } from '../../state/undo.js';
import { getEffect } from '../../effects/registry.js';
import { GRID_DEFAULT_DIM, evenLatticeUpdates } from '../../effects/colorRemap.js';
import { buildPaletteSwatchControl, resolveColorKey, getActivePaletteFor } from './paletteColor.js';

const SIZE = 240; // internal canvas resolution (square)

// HSL → RGB hex, mirroring the shader's invertHslToRgb.
function hslToHex(h, s, l) {
    const hue2 = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    };
    let r, g, b;
    if (s <= 0) { r = g = b = l; }
    else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2(p, q, h + 1/3); g = hue2(p, q, h); b = hue2(p, q, h - 1/3);
    }
    const to = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
}

// Winding-agnostic point-in-triangle (matches the shader's invertInTri).
function inTri(px, py, ax, ay, bx, by, cx, cy) {
    const cross = (ux, uy, vx, vy) => ux * vy - uy * vx;
    const d1 = cross(bx - ax, by - ay, px - ax, py - ay);
    const d2 = cross(cx - bx, cy - by, px - bx, py - by);
    const d3 = cross(ax - cx, ay - cy, px - cx, py - cy);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
}

export function buildHueGridControl(inst, { onRebuild } = {}) {
    const group = document.createElement('div');
    group.className = 'control-group';

    const label = document.createElement('div');
    label.className = 'control-label';
    label.textContent = 'Color Map';
    label.style.marginBottom = '4px';
    group.appendChild(label);

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    canvas.style.cssText = 'width:100%;aspect-ratio:1/1;display:block;border-radius:0;border:1px solid var(--border);touch-action:none;cursor:pointer;';
    group.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // Backdrop (HSL square) cached per axis.
    const bg = document.createElement('canvas');
    bg.width = SIZE; bg.height = SIZE;
    const bgCtx = bg.getContext('2d');
    let bgAxis = null;

    // Hint + reset row.
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:0.7rem;color:var(--text-dim);margin:4px 0;';
    hint.textContent = 'Drag nodes to reshape cells · click a cell to set its color';
    group.appendChild(hint);

    // Per-cell color strip (rebuilt when the selected cell changes).
    const stripWrap = document.createElement('div');
    group.appendChild(stripWrap);

    const resetRow = document.createElement('div');
    resetRow.className = 'control-row';
    resetRow.style.marginTop = '6px';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn';
    resetBtn.textContent = '⟲ Reset Grid';
    resetRow.appendChild(resetBtn);
    group.appendChild(resetRow);

    // --- helpers ---
    const dim   = () => parseInt(inst.params.invertGridDim ?? String(GRID_DEFAULT_DIM), 10) || GRID_DEFAULT_DIM;
    const axis  = () => (inst.params.invertGridAxis === 'hl' ? 'hl' : 'hs');
    const idx   = (r, c) => r * (dim() + 1) + c;
    const nodeX = (i) => inst.params[`invertGridNx${i}`] ?? 0;
    const nodeY = (i) => inst.params[`invertGridNy${i}`] ?? 0;
    // Param space → canvas pixels. Param y=0 is the bottom of the square.
    const toPxX = (nx) => nx * SIZE;
    const toPxY = (ny) => (1 - ny) * SIZE;

    let selected = 0;

    function renderBackdrop() {
        if (bgAxis === axis()) return;
        bgAxis = axis();
        const img = bgCtx.createImageData(SIZE, SIZE);
        const d = img.data;
        for (let py = 0; py < SIZE; py++) {
            const ch = 1 - py / (SIZE - 1);          // bottom = 0, top = 1
            for (let px = 0; px < SIZE; px++) {
                const hue = px / (SIZE - 1);
                const hex = bgAxis === 'hl' ? hslToHex(hue, 1, ch) : hslToHex(hue, ch, 0.5);
                const o = (py * SIZE + px) * 4;
                d[o]   = parseInt(hex.slice(1, 3), 16);
                d[o+1] = parseInt(hex.slice(3, 5), 16);
                d[o+2] = parseInt(hex.slice(5, 7), 16);
                d[o+3] = 255;
            }
        }
        bgCtx.putImageData(img, 0, 0);
    }

    function cellHex(cellIndex) {
        return resolveColorKey(inst.params[`invertGridColor${cellIndex}`], getActivePaletteFor(inst.id)) ?? '#808080';
    }

    function repaint() {
        renderBackdrop();
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(bg, 0, 0);

        const D = dim();
        // Cell edges + a small color badge at each centroid (no full overlay, so
        // the HSL map underneath stays visible).
        for (let r = 0; r < D; r++) {
            for (let c = 0; c < D; c++) {
                const a = idx(r, c), b = idx(r, c + 1), cc = idx(r + 1, c + 1), dd = idx(r + 1, c);
                const xs = [nodeX(a), nodeX(b), nodeX(cc), nodeX(dd)];
                const ys = [nodeY(a), nodeY(b), nodeY(cc), nodeY(dd)];
                const cellIndex = r * D + c;

                ctx.beginPath();
                ctx.moveTo(toPxX(xs[0]), toPxY(ys[0]));
                for (let k = 1; k < 4; k++) ctx.lineTo(toPxX(xs[k]), toPxY(ys[k]));
                ctx.closePath();
                ctx.lineWidth = cellIndex === selected ? 2.5 : 1;
                ctx.strokeStyle = cellIndex === selected ? '#fff' : 'rgba(0,0,0,0.45)';
                ctx.stroke();

                // Centroid color badge.
                const mx = (toPxX(xs[0]) + toPxX(xs[1]) + toPxX(xs[2]) + toPxX(xs[3])) / 4;
                const my = (toPxY(ys[0]) + toPxY(ys[1]) + toPxY(ys[2]) + toPxY(ys[3])) / 4;
                const rad = cellIndex === selected ? 9 : 7;
                ctx.beginPath();
                ctx.arc(mx, my, rad, 0, Math.PI * 2);
                ctx.fillStyle = cellHex(cellIndex);
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = cellIndex === selected ? '#fff' : 'rgba(0,0,0,0.7)';
                ctx.stroke();
            }
        }

        // Nodes.
        const n = D + 1;
        for (let r = 0; r <= D; r++) {
            for (let c = 0; c <= D; c++) {
                const i = r * n + c;
                const isCorner = (r === 0 || r === D) && (c === 0 || c === D);
                const x = toPxX(nodeX(i)), y = toPxY(nodeY(i));
                ctx.beginPath();
                ctx.arc(x, y, isCorner ? 3.5 : 5, 0, Math.PI * 2);
                ctx.fillStyle = isCorner ? 'rgba(255,255,255,0.5)' : '#fff';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                ctx.stroke();
            }
        }
    }

    function buildStrip() {
        stripWrap.innerHTML = '';
        const schema = getEffect('colorRemap')?.params?.[`invertGridColor${selected}`];
        if (!schema) return;
        const cellSchema = { ...schema, label: `Cell ${selected + 1} Color` };
        stripWrap.appendChild(buildPaletteSwatchControl(inst, `invertGridColor${selected}`, cellSchema, { onRebuild: repaint }));
    }

    // --- pointer interaction ---
    const evtNorm = (e) => {
        const rect = canvas.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = 1 - (e.clientY - rect.top) / rect.height; // param space
        return { nx, ny, pxPerUnit: rect.width };
    };

    let drag = null; // { i, r, c }

    function hitNode(nx, ny, pxPerUnit) {
        const D = dim(), n = D + 1;
        const thresh = 11 / pxPerUnit;
        let best = null, bestD = thresh;
        for (let r = 0; r <= D; r++) {
            for (let c = 0; c <= D; c++) {
                const i = r * n + c;
                const dx = nodeX(i) - nx, dy = nodeY(i) - ny;
                const dist = Math.hypot(dx, dy);
                if (dist <= bestD) { bestD = dist; best = { i, r, c }; }
            }
        }
        return best;
    }

    function hitCell(nx, ny) {
        const D = dim();
        for (let r = 0; r < D; r++) {
            for (let c = 0; c < D; c++) {
                const a = idx(r, c), b = idx(r, c + 1), cc = idx(r + 1, c + 1), dd = idx(r + 1, c);
                if (inTri(nx, ny, nodeX(a), nodeY(a), nodeX(b), nodeY(b), nodeX(cc), nodeY(cc)) ||
                    inTri(nx, ny, nodeX(a), nodeY(a), nodeX(cc), nodeY(cc), nodeX(dd), nodeY(dd))) {
                    return r * D + c;
                }
            }
        }
        return -1;
    }

    canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const { nx, ny, pxPerUnit } = evtNorm(e);
        const D = dim();
        const node = hitNode(nx, ny, pxPerUnit);
        if (node) {
            const corner = (node.r === 0 || node.r === D) && (node.c === 0 || node.c === D);
            if (corner) return; // pinned
            canvas.setPointerCapture(e.pointerId);
            saveState();
            drag = node;
            return;
        }
        const cell = hitCell(nx, ny);
        if (cell >= 0 && cell !== selected) { selected = cell; buildStrip(); repaint(); }
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const { nx, ny } = evtNorm(e);
        const D = dim(), n = D + 1;
        const { r, c, i } = drag;
        const horizEdge = (r === 0 || r === D);   // slides in x only
        const vertEdge  = (c === 0 || c === D);    // slides in y only
        const EPS = 0.02;

        let newX = nodeX(i), newY = nodeY(i);
        if (!vertEdge) {
            // x is free: clamp between left/right neighbors
            const lo = nodeX(r * n + (c - 1)) + EPS;
            const hi = nodeX(r * n + (c + 1)) - EPS;
            newX = Math.min(Math.max(nx, lo), Math.max(lo, hi));
        }
        if (!horizEdge) {
            // y is free: clamp between lower/upper neighbors
            const lo = nodeY((r - 1) * n + c) + EPS;
            const hi = nodeY((r + 1) * n + c) - EPS;
            newY = Math.min(Math.max(ny, lo), Math.max(lo, hi));
        }
        setInstanceParam(inst.id, `invertGridNx${i}`, Math.round(newX * 1000) / 1000);
        setInstanceParam(inst.id, `invertGridNy${i}`, Math.round(newY * 1000) / 1000);
        repaint();
    });

    const endDrag = () => { drag = null; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);

    resetBtn.addEventListener('click', () => {
        saveState();
        const updates = evenLatticeUpdates(dim());
        for (const [k, v] of Object.entries(updates)) setInstanceParam(inst.id, k, v);
        repaint();
    });

    // Live-update cell fills when the active palette changes.
    document.addEventListener('paletteupdate', function onPU() {
        if (!document.contains(canvas)) { document.removeEventListener('paletteupdate', onPU); return; }
        repaint();
    });

    buildStrip();
    repaint();
    return group;
}
