import { canvas } from '../../renderer/glstate.js';
import { setInstanceParam, getStack } from '../../state/effectStack.js';
import { processImageImmediate } from '../../renderer/pipeline.js';
import { state } from '../overlayState.js';
import { uiCtx, uiOverlay, syncSize } from '../overlayUtils.js';
import { resolveColorKey } from '../../effects/colorOptions.js';
import { drawFadeFromState, hitTestFadeHandles, hitTestFadeRegion } from './fadeOverlay.js';

let _activeStroke = null;
let _activeInstId = null;

// Mirrors _runLinear's palette tracking: last enabled colorPalette before instId.
function _getActivePalette(instId) {
    let palette = null;
    for (const inst of getStack()) {
        if (inst.id === instId) break;
        if (inst.effectName === 'colorPalette' && inst.params.paletteEnabled) {
            palette = Array.from({ length: 8 }, (_, j) => inst.params[`palette${j}`]);
        }
    }
    return palette;
}

function _previewColor(stroke) {
    if (stroke.fillType === 'static') return 'rgba(160,160,160,0.75)';
    const pal = _getActivePalette(_activeInstId);
    return resolveColorKey(stroke.colorKey, pal) || stroke.color || '#000000';
}

export function drawDrawTool(params) {
    syncSize();
    uiCtx.clearRect(0, 0, uiOverlay.width, uiOverlay.height);
    if (params) drawFadeFromState(params, uiOverlay.width, uiOverlay.height);
}

// Fade handles win over drawing; anywhere else is a draw surface ('canvas').
export function hitTestDrawTool(e) {
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

export function onDrawToolDown(e, inst, rect) {
    const p = inst.params;
    const x = Math.round(((e.clientX - rect.left) / rect.width)  * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top)  / rect.height) * 1000) / 10;

    _activeInstId = inst.id;
    // Store the palette key (not a resolved hex) so the stroke recolors live
    // when the palette changes.
    _activeStroke = {
        colorKey:   p.drawToolColor ?? 'palette0',
        size:       p.drawToolSize       ?? 10,
        fillType:   p.drawToolFillType   ?? 'solid',
        staticType: p.drawToolStaticType ?? 'greyscale',
        grainSize:  p.drawToolGrainSize  ?? 4,
        seed:       Math.floor(Math.random() * 65536),
        points:     [{ x, y }],
    };

    syncSize();
    uiCtx.clearRect(0, 0, uiOverlay.width, uiOverlay.height);
    _paintDot(_activeStroke, x, y);
}

export function onDragDrawTool(e, inst, rect) {
    if (!_activeStroke) return;
    const x = Math.round(((e.clientX - rect.left) / rect.width)  * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top)  / rect.height) * 1000) / 10;
    const pts  = _activeStroke.points;
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.x - x) < 0.5 && Math.abs(last.y - y) < 0.5) return;
    pts.push({ x, y });
    _paintSegment(_activeStroke, pts[pts.length - 2], { x, y });
}

export function finalizeDrawToolStroke(instId, params) {
    if (!_activeStroke) return;
    let strokes;
    try { strokes = JSON.parse(params.drawToolStrokes || '[]'); } catch { strokes = []; }

    strokes.push({ ..._activeStroke });
    _activeStroke = null;

    setInstanceParam(instId, 'drawToolStrokes', JSON.stringify(strokes));
    processImageImmediate();
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _scale() {
    return uiOverlay.width / canvas.width;
}

function _paintDot(stroke, x, y) {
    const W = uiOverlay.width, H = uiOverlay.height;
    const sz = Math.max(1, stroke.size * _scale());
    uiCtx.save();
    uiCtx.beginPath();
    uiCtx.arc((x / 100) * W, (y / 100) * H, sz / 2, 0, Math.PI * 2);
    uiCtx.fillStyle = _previewColor(stroke);
    uiCtx.fill();
    uiCtx.restore();
}

function _paintSegment(stroke, prev, curr) {
    const W = uiOverlay.width, H = uiOverlay.height;
    const sz = Math.max(1, stroke.size * _scale());
    uiCtx.save();
    uiCtx.beginPath();
    uiCtx.moveTo((prev.x / 100) * W, (prev.y / 100) * H);
    uiCtx.lineTo((curr.x / 100) * W, (curr.y / 100) * H);
    uiCtx.strokeStyle = _previewColor(stroke);
    uiCtx.lineWidth   = sz;
    uiCtx.lineCap     = 'round';
    uiCtx.lineJoin    = 'round';
    uiCtx.stroke();
    uiCtx.restore();
}
