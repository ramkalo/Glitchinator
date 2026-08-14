import { canvas } from '../../renderer/glstate.js';
import { setInstanceParam, getStack } from '../../state/effectStack.js';
import { processImageImmediate } from '../../renderer/pipeline.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize } from '../overlayUtils.js';
import { resolveColorKey } from '../../effects/colorOptions.js';
import { drawFadeFromState, hitTestFadeHandles, hitTestFadeRegion } from './fadeOverlay.js';

// Per-cycle gesture (one pointer down→up). Multi-gesture tools keep extra state below.
let _g = null;
let _dragged = false;
let _instId = null;
// Polygon: vertices placed so far (percent coords). Curve: the committed chord awaiting a bend.
let _polyVerts = [];
let _pendingCurve = null;   // { x0, y0, x1, y1 }
let _lastPos = null;        // last pointer position (percent), for the curve control point

const POLY_CLOSE_DIST = 3;  // percent

// ── Palette / colour ──────────────────────────────────────────────────────────

function _activePalette(instId) {
    let palette = null;
    for (const inst of getStack()) {
        if (inst.id === instId) break;
        if (inst.effectName === 'colorPalette' && inst.params.paletteEnabled) {
            palette = Array.from({ length: 8 }, (_, j) => inst.params[`palette${j}`]);
        }
    }
    return palette;
}

function _previewColor(colorKey) {
    return resolveColorKey(colorKey, _activePalette(_instId)) || '#000000';
}

// ── Coord helpers ───────────────────────────────────────────────────────────────

function _pct(e, rect) {
    return {
        x: Math.round(((e.clientX - rect.left) / rect.width)  * 1000) / 10,
        y: Math.round(((e.clientY - rect.top)  / rect.height) * 1000) / 10,
    };
}

const _sx = (xPct) => (xPct / 100) * uiOverlay.width;
const _sy = (yPct) => (yPct / 100) * uiOverlay.height;

// Grid-snapped square preview, matching the renderer's grid exactly.
function _cellPreview(xPct, yPct, size, color) {
    const scale = uiOverlay.width / canvas.width;
    const col = Math.floor((xPct / 100) * canvas.width  / size);
    const row = Math.floor((yPct / 100) * canvas.height / size);
    uiCtx.fillStyle = color;
    uiCtx.fillRect(col * size * scale, row * size * scale, size * scale, size * scale);
}

function _eraserPreview(xPct, yPct, size) {
    const scale = uiOverlay.width / canvas.width;
    const col = Math.floor((xPct / 100) * canvas.width  / size);
    const row = Math.floor((yPct / 100) * canvas.height / size);
    uiCtx.save();
    uiCtx.strokeStyle = 'rgba(255,255,255,0.9)';
    uiCtx.lineWidth = 1;
    uiCtx.strokeRect(col * size * scale, row * size * scale, size * scale, size * scale);
    uiCtx.restore();
}

function _cellRC(pct, size) {
    return { col: Math.floor((pct.x / 100) * canvas.width / size), row: Math.floor((pct.y / 100) * canvas.height / size) };
}

// Paint every grid cell between two points (Bresenham on the grid), matching the
// renderer's lineCells — keeps the drag preview a continuous line, not dots.
function _lineCellsPreview(prev, curr, size, color, erase) {
    const a = _cellRC(prev, size), b = _cellRC(curr, size);
    let x0 = a.col, y0 = a.row;
    const x1 = b.col, y1 = b.row;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    const scale = uiOverlay.width / canvas.width;
    uiCtx.save();
    if (erase) { uiCtx.strokeStyle = 'rgba(255,255,255,0.9)'; uiCtx.lineWidth = 1; }
    else uiCtx.fillStyle = color;
    for (;;) {
        if (erase) uiCtx.strokeRect(x0 * size * scale, y0 * size * scale, size * scale, size * scale);
        else       uiCtx.fillRect(x0 * size * scale, y0 * size * scale, size * scale, size * scale);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 <  dx) { err += dx; y0 += sy; }
    }
    uiCtx.restore();
}

function _rubberStroke(drawPath, color) {
    uiCtx.save();
    uiCtx.strokeStyle = color;
    uiCtx.lineWidth = 1.5;
    uiCtx.setLineDash([4, 3]);
    drawPath();
    uiCtx.stroke();
    uiCtx.restore();
}

// ── Public overlay hooks ────────────────────────────────────────────────────────

export function drawBXTpaint(params) {
    syncSize();
    uiCtx.clearRect(0, 0, uiOverlay.width, uiOverlay.height);
    if (params) drawFadeFromState(params, uiOverlay.width, uiOverlay.height);

    // In-progress polygon: placed vertices + edges so far.
    if (_polyVerts.length) {
        const col = _previewColor(params?.bxtpaintColor ?? 'palette0');
        uiCtx.save();
        uiCtx.strokeStyle = col;
        uiCtx.fillStyle = col;
        uiCtx.lineWidth = 1.5;
        uiCtx.beginPath();
        _polyVerts.forEach((v, i) => (i === 0 ? uiCtx.moveTo(_sx(v.x), _sy(v.y)) : uiCtx.lineTo(_sx(v.x), _sy(v.y))));
        uiCtx.stroke();
        for (const v of _polyVerts) { uiCtx.beginPath(); uiCtx.arc(_sx(v.x), _sy(v.y), 3, 0, Math.PI * 2); uiCtx.fill(); }
        uiCtx.restore();
    }

    // Curve waiting for its bend: show the chord.
    if (_pendingCurve) {
        _rubberStroke(() => {
            uiCtx.beginPath();
            uiCtx.moveTo(_sx(_pendingCurve.x0), _sy(_pendingCurve.y0));
            uiCtx.lineTo(_sx(_pendingCurve.x1), _sy(_pendingCurve.y1));
        }, _previewColor(params?.bxtpaintColor ?? 'palette0'));
    }
}

// Fade handles/region win; anywhere else is a paint surface ('canvas').
export function hitTestBXTpaint(e) {
    const inst = getStack().find(i => i.id === state.instId);
    if (inst) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const W = uiOverlay.width, H = uiOverlay.height;
        const p = inst.params;
        const fh = hitTestFadeHandles(p, mx, my, W, H);
        if (fh) return fh;
        const fr = hitTestFadeRegion(p, mx, my, W, H);
        if (fr) return fr;
    }
    return 'canvas';
}

export function onBXTpaintDown(e, inst, rect) {
    const p = inst.params;
    const tool = p.bxtpaintTool ?? 'brush';
    const pt = _pct(e, rect);

    _instId  = inst.id;
    _dragged = false;
    _lastPos = pt;

    // Switching tool or instance abandons any half-built polygon/curve.
    if (tool !== 'polygon' && _polyVerts.length) _polyVerts = [];
    if (tool !== 'curve'   && _pendingCurve)     _pendingCurve = null;

    const colorKey = p.bxtpaintColor ?? 'palette0';
    const size = p.bxtpaintSize ?? 8;

    _g = { tool, size, colorKey, start: pt, cur: pt, lastPt: pt };

    switch (tool) {
        case 'brush':
        case 'eraser':
            _g.op = { type: tool, size, points: [pt] };
            if (tool === 'eraser') _eraserPreview(pt.x, pt.y, size);
            else                   _cellPreview(pt.x, pt.y, size, _previewColor(colorKey));
            break;
        case 'spray':
            _g.op = { type: 'spray', size, dots: [] };
            _spray(inst, pt);
            break;
        // line / rect / ellipse / curve / fill / polygon resolve on drag/up.
        default:
            break;
    }
}

export function onDragBXTpaint(e, inst, rect) {
    if (!_g) return;
    _dragged = true;
    const p = inst.params;
    const pt = _pct(e, rect);
    _g.cur = pt;
    _lastPos = pt;

    switch (_g.tool) {
        case 'brush':
        case 'eraser': {
            // Draw the connecting grid line so the preview is continuous even on fast drags.
            _lineCellsPreview(_g.lastPt, pt, _g.size, _previewColor(_g.colorKey), _g.tool === 'eraser');
            _g.lastPt = pt;
            const pts = _g.op.points;
            const last = pts[pts.length - 1];
            if (!(last && Math.abs(last.x - pt.x) < 0.5 && Math.abs(last.y - pt.y) < 0.5)) pts.push(pt);
            break;
        }
        case 'spray':
            _spray(inst, pt);
            break;
        case 'line':
            drawBXTpaint(p);
            _rubberStroke(() => {
                uiCtx.beginPath();
                uiCtx.moveTo(_sx(_g.start.x), _sy(_g.start.y));
                uiCtx.lineTo(_sx(pt.x), _sy(pt.y));
            }, _previewColor(_g.colorKey));
            break;
        case 'rect':
            drawBXTpaint(p);
            _rubberStroke(() => {
                uiCtx.strokeRect(_sx(_g.start.x), _sy(_g.start.y), _sx(pt.x) - _sx(_g.start.x), _sy(pt.y) - _sy(_g.start.y));
            }, _previewColor(_g.colorKey));
            break;
        case 'ellipse':
            drawBXTpaint(p);
            _rubberStroke(() => {
                const cx = (_sx(_g.start.x) + _sx(pt.x)) / 2, cy = (_sy(_g.start.y) + _sy(pt.y)) / 2;
                const rx = Math.abs(_sx(pt.x) - _sx(_g.start.x)) / 2, ry = Math.abs(_sy(pt.y) - _sy(_g.start.y)) / 2;
                uiCtx.beginPath();
                uiCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            }, _previewColor(_g.colorKey));
            break;
        case 'curve':
            if (_pendingCurve) {
                // Stage 2: dragging pulls the control point.
                drawBXTpaint(p);
                _rubberStroke(() => {
                    uiCtx.beginPath();
                    uiCtx.moveTo(_sx(_pendingCurve.x0), _sy(_pendingCurve.y0));
                    uiCtx.quadraticCurveTo(_sx(pt.x), _sy(pt.y), _sx(_pendingCurve.x1), _sy(_pendingCurve.y1));
                }, _previewColor(_g.colorKey));
            } else {
                // Stage 1: dragging draws the chord.
                drawBXTpaint(p);
                _rubberStroke(() => {
                    uiCtx.beginPath();
                    uiCtx.moveTo(_sx(_g.start.x), _sy(_g.start.y));
                    uiCtx.lineTo(_sx(pt.x), _sy(pt.y));
                }, _previewColor(_g.colorKey));
            }
            break;
        default:
            break;
    }
}

export function finalizeBXTpaint(instId, params) {
    const g = _g;
    _g = null;
    if (!g) return;

    switch (g.tool) {
        case 'brush':
        case 'eraser':
        case 'spray':
            if (g.op && (g.op.points?.length || g.op.dots?.length)) _commit(instId, params, g.op);
            break;
        case 'line':
            if (_dragged) _commit(instId, params, { type: 'line', size: g.size, x0: g.start.x, y0: g.start.y, x1: g.cur.x, y1: g.cur.y });
            break;
        case 'rect':
            if (_dragged) _commit(instId, params, { type: 'rect', size: g.size, fill: params.bxtpaintShapeFill === 'filled', x0: g.start.x, y0: g.start.y, x1: g.cur.x, y1: g.cur.y });
            break;
        case 'ellipse':
            if (_dragged) _commit(instId, params, { type: 'ellipse', size: g.size, fill: params.bxtpaintShapeFill === 'filled', x0: g.start.x, y0: g.start.y, x1: g.cur.x, y1: g.cur.y });
            break;
        case 'fill':
            _commit(instId, params, { type: 'fill', x: g.start.x, y: g.start.y });
            break;
        case 'curve':
            _finalizeCurve(instId, params, g);
            break;
        case 'polygon':
            _finalizePolygon(instId, params, g);
            break;
        default:
            break;
    }
}

// ── Tool internals ──────────────────────────────────────────────────────────────

function _spray(inst, pt) {
    const p = inst.params;
    const area    = p.bxtpaintSprayArea ?? 24;      // canvas px radius
    const density = Math.max(1, Math.round(p.bxtpaintSprayDensity ?? 8));
    const W = canvas.width, H = canvas.height;
    const cxImg = (pt.x / 100) * W, cyImg = (pt.y / 100) * H;
    const col = _previewColor(_g.colorKey);
    for (let i = 0; i < density; i++) {
        const r = Math.sqrt(Math.random()) * area;
        const a = Math.random() * Math.PI * 2;
        const dxImg = cxImg + Math.cos(a) * r;
        const dyImg = cyImg + Math.sin(a) * r;
        const dot = { x: Math.round(dxImg / W * 1000) / 10, y: Math.round(dyImg / H * 1000) / 10 };
        _g.op.dots.push(dot);
        _cellPreview(dot.x, dot.y, _g.size, col);
    }
}

function _finalizeCurve(instId, params, g) {
    if (!_pendingCurve) {
        // Stage 1 complete: store the chord, wait for the bend gesture.
        if (_dragged) {
            _pendingCurve = { x0: g.start.x, y0: g.start.y, x1: g.cur.x, y1: g.cur.y };
        }
        drawBXTpaint(params);
        return;
    }
    // Stage 2 complete: the last pointer position is the control point.
    const ctrl = _lastPos ?? { x: (_pendingCurve.x0 + _pendingCurve.x1) / 2, y: (_pendingCurve.y0 + _pendingCurve.y1) / 2 };
    _commit(instId, params, {
        type: 'curve', size: g.size,
        x0: _pendingCurve.x0, y0: _pendingCurve.y0,
        x1: _pendingCurve.x1, y1: _pendingCurve.y1,
        cx: ctrl.x, cy: ctrl.y,
    });
    _pendingCurve = null;
}

function _finalizePolygon(instId, params, g) {
    // Only treat non-drag clicks as vertex placement.
    const pt = g.cur;
    if (_polyVerts.length >= 3) {
        const first = _polyVerts[0];
        if (Math.hypot(pt.x - first.x, pt.y - first.y) < POLY_CLOSE_DIST) {
            _commit(instId, params, {
                type: 'polygon', size: g.size,
                fill: params.bxtpaintShapeFill === 'filled',
                verts: _polyVerts.slice(),
            });
            _polyVerts = [];
            drawBXTpaint(params);
            return;
        }
    }
    _polyVerts.push(pt);
    drawBXTpaint(params);
}

function _commit(instId, params, op) {
    let ops;
    try { ops = JSON.parse(params.bxtpaintOps || '[]'); } catch { ops = []; }
    ops.push(op);
    setInstanceParam(instId, 'bxtpaintOps', JSON.stringify(ops));
    processImageImmediate();
}
