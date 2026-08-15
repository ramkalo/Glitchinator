import { canvas } from '../renderer/glstate.js';
import { buildFadeControl, buildBlendControl } from './controls/index.js';
import { resolveColorKey, STANDARD_COLOR_OPTIONS } from './colorOptions.js';

const fade  = buildFadeControl('bxtpaint');
const blend = buildBlendControl('bxtpaint');

// ── Colour helpers ────────────────────────────────────────────────────────────
// Each op keeps the colour it was drawn with (a palette key resolved live), so one
// instance can hold many colours and changing the selector only affects new ops.

function opColor(op, activePalette) {
    if (op.colorKey) return resolveColorKey(op.colorKey, activePalette) || '#000000';
    return '#000000';
}

function hexToRGBA(hex) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
    if (!m) return [0, 0, 0, 255];
    const n = m[1];
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), 255];
}

// ── Grid rasterisation ────────────────────────────────────────────────────────
// Everything snaps to a square grid of side `size` (canvas px). A point lights the
// cell (floor(px/size), floor(py/size)); cells are painted as opaque squares. The
// grid-snapping is what makes every tool naturally jagged — no smoothing anywhere.

const key = (col, row) => col + ',' + row;

function pointCell(x, y, w, h, size) {
    return { col: Math.floor((x / 100) * w / size), row: Math.floor((y / 100) * h / size) };
}

// Bresenham between two grid cells, collecting every cell into `out` (a Set).
function lineCells(c0, c1, out) {
    let x0 = c0.col, y0 = c0.row;
    const x1 = c1.col, y1 = c1.row;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
        out.add(key(x0, y0));
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 <  dx) { err += dx; y0 += sy; }
    }
}

function polylineCells(points, w, h, size, out) {
    if (!points.length) return;
    let prev = pointCell(points[0].x, points[0].y, w, h, size);
    out.add(key(prev.col, prev.row));
    for (let i = 1; i < points.length; i++) {
        const c = pointCell(points[i].x, points[i].y, w, h, size);
        lineCells(prev, c, out);
        prev = c;
    }
}

function pointInPoly(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}

function paintCells(ctx, cells, size, color, erase) {
    ctx.save();
    if (erase) ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = color;
    for (const k of cells) {
        const ci = k.indexOf(',');
        const col = parseInt(k.slice(0, ci), 10);
        const row = parseInt(k.slice(ci + 1), 10);
        ctx.fillRect(col * size, row * size, size, size);
    }
    ctx.restore();
}

// ── Per-tool cell collectors ───────────────────────────────────────────────────

function rectCells(op, w, h, size, out) {
    const a = pointCell(op.x0, op.y0, w, h, size);
    const b = pointCell(op.x1, op.y1, w, h, size);
    const c0 = Math.min(a.col, b.col), c1 = Math.max(a.col, b.col);
    const r0 = Math.min(a.row, b.row), r1 = Math.max(a.row, b.row);
    if (op.fill) {
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.add(key(c, r));
    } else {
        for (let c = c0; c <= c1; c++) { out.add(key(c, r0)); out.add(key(c, r1)); }
        for (let r = r0; r <= r1; r++) { out.add(key(c0, r)); out.add(key(c1, r)); }
    }
}

function ellipseCells(op, w, h, size, out) {
    const x0 = (op.x0 / 100) * w, y0 = (op.y0 / 100) * h;
    const x1 = (op.x1 / 100) * w, y1 = (op.y1 / 100) * h;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
    if (rx < 0.5 || ry < 0.5) return;
    if (op.fill) {
        const cMin = Math.floor((cx - rx) / size), cMax = Math.floor((cx + rx) / size);
        const rMin = Math.floor((cy - ry) / size), rMax = Math.floor((cy + ry) / size);
        for (let r = rMin; r <= rMax; r++) {
            for (let c = cMin; c <= cMax; c++) {
                const nx = ((c + 0.5) * size - cx) / rx;
                const ny = ((r + 0.5) * size - cy) / ry;
                if (nx * nx + ny * ny <= 1) out.add(key(c, r));
            }
        }
    } else {
        const steps = Math.max(48, Math.ceil((rx + ry) / size * 8));
        for (let i = 0; i < steps; i++) {
            const t = (i / steps) * Math.PI * 2;
            const px = cx + rx * Math.cos(t), py = cy + ry * Math.sin(t);
            out.add(key(Math.floor(px / size), Math.floor(py / size)));
        }
    }
}

function curveCells(op, w, h, size, out) {
    const x0 = (op.x0 / 100) * w, y0 = (op.y0 / 100) * h;
    const x1 = (op.x1 / 100) * w, y1 = (op.y1 / 100) * h;
    const cx = (op.cx / 100) * w, cy = (op.cy / 100) * h;
    const chord = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy);
    const steps = Math.max(32, Math.ceil(chord / size * 2));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        const px = u * u * x0 + 2 * u * t * cx + t * t * x1;
        const py = u * u * y0 + 2 * u * t * cy + t * t * y1;
        out.add(key(Math.floor(px / size), Math.floor(py / size)));
    }
}

function polygonCells(op, w, h, size, out) {
    const verts = op.verts || [];
    if (verts.length < 2) return;
    // Outline every edge (closed).
    for (let i = 0; i < verts.length; i++) {
        const a = pointCell(verts[i].x, verts[i].y, w, h, size);
        const b = pointCell(verts[(i + 1) % verts.length].x, verts[(i + 1) % verts.length].y, w, h, size);
        lineCells(a, b, out);
    }
    if (!op.fill || verts.length < 3) return;
    const ptsPx = verts.map(v => ({ x: (v.x / 100) * w, y: (v.y / 100) * h }));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of ptsPx) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const cMin = Math.floor(minX / size), cMax = Math.floor(maxX / size);
    const rMin = Math.floor(minY / size), rMax = Math.floor(maxY / size);
    for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
            if (pointInPoly((c + 0.5) * size, (r + 0.5) * size, ptsPx)) out.add(key(c, r));
        }
    }
}

// 4-connected flood fill on the current sticker pixels, bounded by already-drawn
// pixels. Seed matches its own RGBA (incl. fully-transparent), so an unenclosed
// empty area recolours the whole layer — classic blank-canvas paint.
function floodFill(ctx, op, w, h, color) {
    const sx = Math.floor((op.x / 100) * w);
    const sy = Math.floor((op.y / 100) * h);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const at = (x, y) => (y * w + x) * 4;
    const seed = at(sx, sy);
    const tr = d[seed], tg = d[seed + 1], tb = d[seed + 2], ta = d[seed + 3];
    const [fr, fg, fb, fa] = hexToRGBA(color);
    if (tr === fr && tg === fg && tb === fb && ta === fa) return; // nothing to do
    const match = (i) => d[i] === tr && d[i + 1] === tg && d[i + 2] === tb && d[i + 3] === ta;
    const stack = [sx, sy];
    while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        let i = at(x, y);
        if (!match(i)) continue;
        // Extend the span left/right on this row.
        let xl = x;
        while (xl > 0 && match(at(xl - 1, y))) xl--;
        let xr = x;
        while (xr < w - 1 && match(at(xr + 1, y))) xr++;
        for (let xx = xl; xx <= xr; xx++) {
            i = at(xx, y);
            d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = fa;
            if (y > 0 && match(at(xx, y - 1)))      stack.push(xx, y - 1);
            if (y < h - 1 && match(at(xx, y + 1)))  stack.push(xx, y + 1);
        }
    }
    ctx.putImageData(img, 0, 0);
}

// ── Renderer ────────────────────────────────────────────────────────────────────

function applyBXTpaint(ctx, p) {
    let ops;
    try { ops = JSON.parse(p.bxtpaintOps || '[]'); } catch { return; }
    if (!ops.length) return;

    ctx.imageSmoothingEnabled = false;
    const w = canvas.width, h = canvas.height;
    const pal = p._activePalette;

    for (const op of ops) {
        const size = Math.max(1, Math.round(op.size || 8));
        if (op.type === 'fill') {
            floodFill(ctx, op, w, h, opColor(op, pal));
            continue;
        }
        const cells = new Set();
        switch (op.type) {
            case 'brush':
            case 'eraser':  polylineCells(op.points || [], w, h, size, cells); break;
            case 'spray':   for (const dpt of (op.dots || [])) { const c = pointCell(dpt.x, dpt.y, w, h, size); cells.add(key(c.col, c.row)); } break;
            case 'line':    lineCells(pointCell(op.x0, op.y0, w, h, size), pointCell(op.x1, op.y1, w, h, size), cells); break;
            case 'curve':   curveCells(op, w, h, size, cells); break;
            case 'rect':    rectCells(op, w, h, size, cells); break;
            case 'ellipse': ellipseCells(op, w, h, size, cells); break;
            case 'polygon': polygonCells(op, w, h, size, cells); break;
            default: continue;
        }
        if (!cells.size) continue;
        paintCells(ctx, cells, size, op.type === 'eraser' ? '#000' : opColor(op, pal), op.type === 'eraser');
    }
}

// ── Effect definition ──────────────────────────────────────────────────────────

const TOOL_OPTIONS = [
    ['brush', 'Brush'], ['fill', 'Fill'], ['spray', 'Spray'], ['line', 'Line'],
    ['curve', 'Curve'], ['ellipse', 'Ellipse'], ['rect', 'Rectangle'],
    ['polygon', 'Polygon'], ['eraser', 'Eraser'],
];

// Flat, single-colour SVG icons (currentColor) for the tool picker buttons.
const _svg = (inner, extra = '') =>
    `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra}>${inner}</svg>`;

const TOOL_ICONS = {
    brush:   _svg('<path d="M4 20l4-1 9-9-3-3-9 9-1 4z"/><path d="M14 7l3 3"/>'),
    fill:    _svg('<path d="M5 11l6-6 7 7-6 6a2 2 0 0 1-3 0l-4-4a2 2 0 0 1 0-3z"/><path d="M11 5L9 3"/><path d="M20 14c1 1.5 2 2.5 2 3.5A2 2 0 0 1 18 17.5c0-1 1-2 2-3.5z"/>'),
    spray:   _svg('<rect x="7" y="9" width="8" height="12" rx="1"/><path d="M9 9V6h4v3"/><path d="M18 5h.5M20 4h.5M19 8h.5M18 11h.5"/>'),
    line:    _svg('<line x1="5" y1="19" x2="19" y2="5"/>'),
    curve:   _svg('<path d="M4 18C10 18 14 6 20 6"/>'),
    ellipse: _svg('<ellipse cx="12" cy="12" rx="9" ry="7"/>'),
    rect:    _svg('<rect x="4" y="6" width="16" height="12" rx="1"/>'),
    polygon: _svg('<polygon points="12,3 21,10 17,20 7,20 3,10"/>'),
    eraser:  _svg('<path d="M4 15l7-7 6 6-5 5H7z"/><path d="M9 20h9"/>'),
};

export const bxtpaintEffect = {
    name:        'bxtpaint',
    label:       'BXTpaint',
    kind:        'context',
    blendPrefix: 'bxtpaint',
    bindUniforms: (gl, prog, p) => { fade.bindUniforms(gl, prog, p); blend.bindUniforms(gl, prog, p); },
    paramKeys:   [...fade.paramKeys, ...blend.paramKeys],
    overlays:    { fade: fade.overlay },
    params: {
        bxtpaintEnabled:      { default: false, label: 'Enable' },
        bxtpaintTool:         { default: 'brush', label: 'Tool', type: 'iconButtons', options: TOOL_OPTIONS, icons: TOOL_ICONS },
        bxtpaintSize:         { default: 8, min: 1, max: 64, label: 'Pixel Size' },
        bxtpaintColor:        { default: 'palette0', label: 'Color', type: 'paletteSelect', options: STANDARD_COLOR_OPTIONS },
        bxtpaintSprayArea:    { default: 24, min: 2, max: 200, label: 'Spray Area' },
        bxtpaintSprayDensity: { default: 8, min: 1, max: 40, label: 'Spray Density' },
        bxtpaintShapeFill:    { default: 'outline', label: 'Shape Fill', options: [['outline', 'Outline'], ['filled', 'Filled']] },
        bxtpaintOps:          { default: '[]', hidden: true },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.bxtpaintEnabled,
    uiGroups: (p) => {
        const groups = [{ label: 'Tool', keys: ['bxtpaintTool', 'bxtpaintSize'] }];
        if (p.bxtpaintTool === 'spray') {
            groups.push({ label: 'Spray', keys: ['bxtpaintSprayArea', 'bxtpaintSprayDensity'] });
        }
        if (p.bxtpaintTool === 'rect' || p.bxtpaintTool === 'ellipse' || p.bxtpaintTool === 'polygon') {
            groups.push({ label: 'Shape', keys: ['bxtpaintShapeFill'] });
        }
        if (p.bxtpaintTool !== 'eraser') {
            groups.push({ label: 'Color', keys: ['bxtpaintColor'] });
        }
        groups.push(blend.uiGroup, fade.uiGroup);
        return groups;
    },
    canvas2d: applyBXTpaint,
};
