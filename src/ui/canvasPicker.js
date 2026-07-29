import { canvas } from '../renderer/glstate.js';
import { setInstanceParam, getStack, onStackChange } from '../state/effectStack.js';
import { saveState } from '../state/undo.js';
import { setCropPreviewActive } from '../state/cropPreview.js';
import { processImageImmediate } from '../renderer/pipeline.js';

import { state } from './overlayState.js';
import { uiOverlay, hitTestCentre } from './overlayUtils.js';

import { drawFade,           hitTestFade,           onDragFade           } from './overlays/fadeOverlay.js';
import { drawDoubleExposure, hitTestDoubleExposure, onDragDoubleExposure } from './overlays/doubleExposureOverlay.js';
import { drawShapeSticker,   hitTestShapeSticker,   onDragShapeSticker,  resetShapeStickerVertices } from './overlays/shapeStickerOverlay.js';
import { drawCrop,           hitTestCrop,           onDragCrop,          computeCropRect } from './overlays/cropOverlay.js';
import { drawLineDrag,       hitTestLineDrag,       onDragLineDrag       } from './overlays/lineDragOverlay.js';
import { drawChroma                                                       } from './overlays/chromaOverlay.js';
import { drawVignette,       hitTestVignette,       onDragVignette       } from './overlays/vignetteOverlay.js';
import { drawCRTCurvature,   hitTestCRTCurvature,   onDragCRTCurvature  } from './overlays/crtOverlay.js';
import { drawCorrupted,      hitTestCorrupted                            } from './overlays/corruptedOverlay.js';
import { drawTextOverlay,    hitTestText,            onDragText,          textCorners } from './overlays/textOverlay.js';
import { drawMatrixRain,       hitTestMatrixRain,       onDragMatrixRain   } from './overlays/matrixRainOverlay.js';
import { drawViewport,       hitTestViewport,        onDragViewport,      resetPolygonVertices } from './overlays/viewportOverlay.js';
import { drawKaleidoscope, hitTestKaleidoscope, onDragKaleidoscope, resetKaleidoscopeVertices } from './overlays/kaleidoscopeOverlay.js';
import { drawDigitalSmear, hitTestDigitalSmear, onDragDigitalSmear, deleteSmearNode } from './overlays/digitalSmearOverlay.js';
import { drawBlendMap, hitTestBlendMap, onDragBlendMap } from './overlays/blendMapOverlay.js';
import { drawDrawTool, hitTestDrawTool, onDragDrawTool, finalizeDrawToolStroke, onDrawToolDown } from './overlays/drawToolOverlay.js';
import { drawMeshOverlay, hitTestMesh, onDragMesh } from './overlays/meshOverlay.js';
import { drawTunnelOverlay, hitTestTunnel, onDragTunnel } from './overlays/tunnelOverlay.js';
import { drawFilmSoup, hitTestFilmSoup, onDragFilmSoup, addFilmSoupBubble, deleteFilmSoupBubble, canAddFilmSoupBubble } from './overlays/filmSoupOverlay.js';
import { drawColorGel, hitTestColorGel, onDragColorGel, gelRotAnchor, gelCenterAnchor } from './overlays/colorGelOverlay.js';
import { drawHalftone, hitTestHalftone, onDragHalftone, htRotAnchor, htCenterAnchor } from './overlays/halftoneOverlay.js';
import { drawResin, hitTestResin, onDragResin } from './overlays/resinOverlay.js';
import { drawGlassBlob, hitTestGlassBlob, onDragGlassBlob } from './overlays/glassBlobOverlay.js';
import { drawCut, hitTestCut, onDragCut, resetCutVertices } from './overlays/cutOverlay.js';
import { deleteActivePaste } from './cutTool.js';

// ── onStackChange redraw dispatcher ──────────────────────────────────────────

onStackChange((key) => {
    if (!state.instId) return;
    if (state.mode === 'blendMap') {
        const alive = getStack().some(inst =>
            Object.entries(inst.params).some(([k, v]) => k.endsWith('BlendMode')   && v === 'blend_map') &&
            Object.entries(inst.params).some(([k, v]) => k.endsWith('BlendEnabled') && v === true)
        );
        if (!alive) { _hideActive(); _syncBlendMapBtns(false); return; }
        drawBlendMap();
        return;
    }
    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) { _hideActive(); return; }
    if (state.mode === 'fade')          drawFade(inst.params);
    if (state.mode === 'crop')          drawCrop(inst.params);
    if (state.mode === 'matrixRain')    drawMatrixRain(inst.params);
    if (state.mode === 'lineDrag')      drawLineDrag(inst.params);
    if (state.mode === 'chroma')        drawChroma(inst.params);
    if (state.mode === 'vignette')      drawVignette(inst.params);
    if (state.mode === 'barrelDistortion')  drawCRTCurvature(inst.params);
    if (state.mode === 'corrupted')     drawCorrupted(inst.params);
    if (state.mode === 'text')          drawTextOverlay(inst.params);
    if (state.mode === 'doubleExposure') drawDoubleExposure(inst.params);
    if (state.mode === 'shapeSticker') {
        const p = inst.params;
        const shape = p.shapeStickerShape || 'rectangle';
        const sides = Math.max(3, Math.min(24, Math.round(p.shapeStickerSides || 6)));
        if (shape === 'triangle' || shape === 'polygon') {
            const n = shape === 'triangle' ? 3 : sides;
            const allZero = Array.from({ length: n }, (_, i) =>
                (p[`shapeStickerV${i}x`] ?? 0) === 0 && (p[`shapeStickerV${i}y`] ?? 0) === 0
            ).every(Boolean);
            const shouldReset = key === 'shapeStickerShape' || key === 'shapeStickerSides' ||
                key === 'shapeStickerW' || key === 'shapeStickerH';
            if (shouldReset) { resetShapeStickerVertices(inst.id, shape, p); return; }
        }
        drawShapeSticker(p);
    }
    if (state.mode === 'kaleidoscope') {
        const p = inst.params;
        const mode = p.kaleidoscopeMode ?? 'mirror';
        if (mode === 'kaleidoscope' && !state.kKalResetting) {
            const shape = p.kKalShape ?? 'polygon';
            const n = shape === 'triangle' ? 3 : shape === 'rectangle' ? 4 : Math.max(3, Math.min(12, Math.round(p.kKalSides)));
            const shouldResetVerts = key === 'kKalShape' || key === 'kKalSides' ||
                Array.from({ length: n }, (_, i) => (p[`kKalV${i}x`] ?? 0) === 0 && (p[`kKalV${i}y`] ?? 0) === 0).every(Boolean);
            if (shouldResetVerts) {
                resetKaleidoscopeVertices(inst.id, shape, n);
                return;
            }
        }
        drawKaleidoscope(p);
    }
    if (state.mode === 'viewport') {
        const p = inst.params;
        const shape = p.vpShape;
        if (!state.vpResetting && (shape === 'triangle' || shape === 'polygon')) {
            const n = shape === 'triangle' ? 3 : Math.max(3, Math.min(12, Math.round(p.vpSides)));
            const shouldReset = key === 'vpShape' || key === 'vpSides' ||
                Array.from({ length: n }, (_, i) =>
                    p[`vpV${i}x`] === 0 && p[`vpV${i}y`] === 0
                ).every(Boolean);
            if (shouldReset) { resetPolygonVertices(inst.id, shape, n); return; }
        }
        drawViewport(p);
    }
    if (state.mode === 'smearTwist') drawDigitalSmear(inst.params);
    if (state.mode === 'filmSoup')     drawFilmSoup(inst.params);
    if (state.mode === 'drawTool')     drawDrawTool(inst.params);
    if (state.mode === 'mesh')         drawMeshOverlay(inst.params);
    if (state.mode === 'tunnel')       drawTunnelOverlay(inst.params);
    if (state.mode === 'colorGel')     drawColorGel(inst.params);
    if (state.mode === 'halftone')     drawHalftone(inst.params);
    if (state.mode === 'resin')        drawResin(inst.params);
    if (state.mode === 'glassBlob')    drawGlassBlob(inst.params);
    if (state.mode === 'cut') {
        const p = inst.params;
        const shape = p.cutShape;
        if (!state.cutResetting && (shape === 'triangle' || shape === 'polygon')) {
            const n = shape === 'triangle' ? 3 : Math.max(3, Math.min(12, Math.round(p.cutSides)));
            const shouldReset = key === 'cutShape' || key === 'cutSides' ||
                Array.from({ length: n }, (_, i) =>
                    (p[`cutV${i}x`] ?? 0) === 0 && (p[`cutV${i}y`] ?? 0) === 0
                ).every(Boolean);
            if (shouldReset) { resetCutVertices(inst.id, shape, n); return; }
        }
        drawCut(p);
    }
});

// ── Public API ────────────────────────────────────────────────────────────────

export function showFadeOverlay(inst,
    xKey       = 'basicFadeX',
    yKey       = 'basicFadeY',
    shapeKey   = 'basicFadeShape',
    wKey       = 'basicFadeW',
    hKey       = 'basicFadeH',
    angleKey   = 'basicFadeAngle',
    enabledKey = 'basicFadeEnabled',
) {
    state.shapeKey   = shapeKey;
    state.wKey       = wKey;
    state.hKey       = hKey;
    state.angleKey   = angleKey;
    state.enabledKey = enabledKey;
    _activate('fade', inst, xKey, yKey);
    drawFade(inst.params);
}

export function hideFadeOverlay() {
    if (state.mode === 'fade') _hideActive();
}

export function showDoubleExposureOverlay(inst) {
    state.shapeKey   = 'doubleExposureFadeShape';
    state.wKey       = 'doubleExposureFadeW';
    state.hKey       = 'doubleExposureFadeH';
    state.angleKey   = 'doubleExposureFadeAngle';
    state.enabledKey = 'doubleExposureFadeEnabled';
    _activate('doubleExposure', inst, 'doubleExposureFadeX', 'doubleExposureFadeY');
    drawDoubleExposure(inst.params);
}

export function hideDoubleExposureOverlay() {
    if (state.mode === 'doubleExposure') _hideActive();
}

export function showShapeStickerOverlay(inst) {
    _activate('shapeSticker', inst, 'shapeStickerX', 'shapeStickerY');
    drawShapeSticker(inst.params);
}

export function hideShapeStickerOverlay() {
    if (state.mode === 'shapeSticker') _hideActive();
}

export function showCropOverlay(inst) {
    _activate('crop', inst, 'cropX', 'cropY');
    setCropPreviewActive(true);
    processImageImmediate();
    drawCrop(inst.params);
}

export function hideCropOverlay() {
    if (state.mode !== 'crop') return;
    setCropPreviewActive(false);
    _hideActive();
    processImageImmediate();
}

export function showLineDragOverlay(inst) {
    state.shapeKey   = 'lineDragFadeShape';
    state.wKey       = 'lineDragFadeW';
    state.hKey       = 'lineDragFadeH';
    state.angleKey   = 'lineDragFadeAngle';
    state.enabledKey = 'lineDragFadeEnabled';
    _activate('lineDrag', inst, 'lineDragX', 'lineDragY');
    drawLineDrag(inst.params);
}

export function hideLineDragOverlay() {
    if (state.mode === 'lineDrag') _hideActive();
}

export function showChromaOverlay(inst) {
    _activate('chroma', inst, 'chromaOutlineX', 'chromaOutlineY');
    drawChroma(inst.params);
}

export function hideChromaOverlay() {
    if (state.mode === 'chroma') _hideActive();
}

export function showVignetteOverlay(inst) {
    _activate('vignette', inst, 'vignetteCenterX', 'vignetteCenterY');
    drawVignette(inst.params);
}

export function hideVignetteOverlay() {
    if (state.mode === 'vignette') _hideActive();
}

export function showCRTCurvatureOverlay(inst) {
    state.wKey     = 'barrelDistortionMajor';
    state.hKey     = 'barrelDistortionMinor';
    state.angleKey = 'barrelDistortionAngle';
    _activate('barrelDistortion', inst, 'barrelDistortionX', 'barrelDistortionY');
    drawCRTCurvature(inst.params);
}

export function hideCRTCurvatureOverlay() {
    if (state.mode === 'barrelDistortion') _hideActive();
}

export function showCorruptedOverlay(inst) {
    _activate('corrupted', inst, 'corruptedX', 'corruptedY');
    drawCorrupted(inst.params);
}

export function hideCorruptedOverlay() {
    if (state.mode === 'corrupted') _hideActive();
}

export function showTextOverlay(inst) {
    _activate('text', inst, 'textTLx', 'textTLy');
    drawTextOverlay(inst.params);
}

export function hideTextOverlay() {
    if (state.mode === 'text') _hideActive();
}

export function showMatrixRainOverlay(inst) {
    _activate('matrixRain', inst, 'matrixRainX', 'matrixRainY');
    drawMatrixRain(inst.params);
}

export function hideMatrixRainOverlay() {
    if (state.mode === 'matrixRain') _hideActive();
}

export function showViewportOverlay(inst) {
    _activate('viewport', inst, 'vpX', 'vpY');
    const p = inst.params;
    const shape = p.vpShape;
    if (shape === 'triangle' || shape === 'polygon') {
        const n = shape === 'triangle' ? 3 : Math.max(3, Math.min(12, Math.round(p.vpSides)));
        const allZero = Array.from({ length: n }, (_, i) =>
            p[`vpV${i}x`] === 0 && p[`vpV${i}y`] === 0
        ).every(Boolean);
        if (allZero) { resetPolygonVertices(inst.id, shape, n); return; }
    }
    drawViewport(p);
}

export function hideViewportOverlay() {
    if (state.mode === 'viewport') _hideActive();
}

export function showKaleidoscopeOverlay(inst) {
    _activate('kaleidoscope', inst, 'kKalCenterX', 'kKalCenterY');
    const p = inst.params;
    const mode = p.kaleidoscopeMode ?? 'mirror';
    if (mode === 'kaleidoscope') {
        const shape = p.kKalShape ?? 'polygon';
        const n = shape === 'triangle' ? 3 : shape === 'rectangle' ? 4 : Math.max(3, Math.min(12, Math.round(p.kKalSides)));
        const allVertsZero = Array.from({ length: n }, (_, i) =>
            (p[`kKalV${i}x`] ?? 0) === 0 && (p[`kKalV${i}y`] ?? 0) === 0
        ).every(Boolean);
        if (allVertsZero) {
            resetKaleidoscopeVertices(inst.id, shape, n);
            return;
        }
    }
    drawKaleidoscope(p);
}

export function hideKaleidoscopeOverlay() {
    if (state.mode === 'kaleidoscope') _hideActive();
}

export function showDigitalSmearOverlay(inst) {
    _activate('smearTwist', inst, 'smearTwistCenterX', 'smearTwistCenterY');
    drawDigitalSmear(inst.params);
}

export function hideDigitalSmearOverlay() {
    if (state.mode === 'smearTwist') _hideActive();
}

export function showFilmSoupOverlay(inst) {
    _activate('filmSoup', inst, null, null);
    drawFilmSoup(inst.params);
}

export function hideFilmSoupOverlay() {
    if (state.mode === 'filmSoup') _hideActive();
}

export function showDrawToolOverlay(inst) {
    _activate('drawTool', inst, 'drawToolStrokes', 'drawToolStrokes');
    drawDrawTool(inst.params);
}

export function hideDrawToolOverlay() {
    if (state.mode === 'drawTool') _hideActive();
}

export function showMeshOverlay(inst) {
    state.shapeKey   = 'meshFadeShape';
    state.wKey       = 'meshFadeW';
    state.hKey       = 'meshFadeH';
    state.angleKey   = 'meshFadeAngle';
    state.enabledKey = 'meshFadeEnabled';
    _activate('mesh', inst, 'meshTLx', 'meshTLy');
    drawMeshOverlay(inst.params);
}

export function hideMeshOverlay() {
    if (state.mode === 'mesh') _hideActive();
}

export function showColorGelOverlay(inst) {
    state.shapeKey   = 'colorGelFadeShape';
    state.wKey       = 'colorGelFadeW';
    state.hKey       = 'colorGelFadeH';
    state.angleKey   = 'colorGelFadeAngle';
    state.enabledKey = 'colorGelFadeEnabled';
    _activate('colorGel', inst, 'colorGelFadeX', 'colorGelFadeY');
    drawColorGel(inst.params);
}

export function showHalftoneOverlay(inst) {
    state.shapeKey   = 'halftoneFadeShape';
    state.wKey       = 'halftoneFadeW';
    state.hKey       = 'halftoneFadeH';
    state.angleKey   = 'halftoneFadeAngle';
    state.enabledKey = 'halftoneFadeEnabled';
    _activate('halftone', inst, 'halftoneFadeX', 'halftoneFadeY');
    drawHalftone(inst.params);
}

export function hideHalftoneOverlay() {
    if (state.mode === 'halftone') _hideActive();
}

export function hideColorGelOverlay() {
    if (state.mode === 'colorGel') _hideActive();
}

export function showResinOverlay(inst) {
    state.shapeKey   = 'resinFadeShape';
    state.wKey       = 'resinFadeW';
    state.hKey       = 'resinFadeH';
    state.angleKey   = 'resinFadeAngle';
    state.enabledKey = 'resinFadeEnabled';
    _activate('resin', inst, 'resinLightX', 'resinLightY');
    drawResin(inst.params);
}

export function hideResinOverlay() {
    if (state.mode === 'resin') _hideActive();
}

export function showGlassBlobOverlay(inst) {
    _activate('glassBlob', inst, 'glassBlobX', 'glassBlobY');
    drawGlassBlob(inst.params);
}

export function hideGlassBlobOverlay() {
    if (state.mode === 'glassBlob') _hideActive();
}

// Delete/Backspace removes the selected pasted copy while the Cut overlay is active.
function _cutKeydown(e) {
    if (state.mode !== 'cut') return;
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
    if (state.cutActive == null || state.cutActive < 0) return;
    e.preventDefault();
    deleteActivePaste(state.instId);
}

let _lastCutInstId = null;

export function showCutOverlay(inst) {
    _activate('cut', inst, 'cutX', 'cutY');
    // Reset the selected copy only when opening a different Cut instance; otherwise
    // keep it (so a fresh Paste stays selected through the panel rebuild). Clamp to
    // the current copy count.
    let nPastes = 0;
    try { nPastes = JSON.parse(inst.params.cutPastes || '[]').length; } catch { /* 0 */ }
    state.cutActive = (inst.id !== _lastCutInstId) ? -1 : Math.min(state.cutActive, nPastes - 1);
    _lastCutInstId = inst.id;
    window.removeEventListener('keydown', _cutKeydown);
    window.addEventListener('keydown', _cutKeydown);
    const p = inst.params;
    const shape = p.cutShape;
    if (shape === 'triangle' || shape === 'polygon') {
        const n = shape === 'triangle' ? 3 : Math.max(3, Math.min(12, Math.round(p.cutSides)));
        const allZero = Array.from({ length: n }, (_, i) =>
            (p[`cutV${i}x`] ?? 0) === 0 && (p[`cutV${i}y`] ?? 0) === 0
        ).every(Boolean);
        if (allZero) { resetCutVertices(inst.id, shape, n); return; }
    }
    drawCut(p);
}

export function hideCutOverlay() {
    if (state.mode === 'cut') {
        window.removeEventListener('keydown', _cutKeydown);
        _hideActive();
    }
}

// Tear down whichever overlay is active. Used by tools that need exclusive control
// of uiOverlay before taking over its pointer events.
export function deactivateActiveOverlay() {
    _hideActive();
}

export function showTunnelOverlay(inst) {
    state.shapeKey   = 'tunnelFadeShape';
    state.wKey       = 'tunnelFadeW';
    state.hKey       = 'tunnelFadeH';
    state.angleKey   = 'tunnelFadeAngle';
    state.enabledKey = 'tunnelFadeEnabled';
    _activate('tunnel', inst, 'tunnelX1', 'tunnelY1');
    drawTunnelOverlay(inst.params);
}

export function hideTunnelOverlay() {
    if (state.mode === 'tunnel') _hideActive();
}

export function showBlendMapOverlay() {
    uiOverlay.removeEventListener('pointerdown', onDown);
    uiOverlay.removeEventListener('pointermove', onHover);
    state.mode     = 'blendMap';
    state.instId   = '__blendMap__';
    state.dragging = false;
    uiOverlay.style.pointerEvents = 'auto';
    uiOverlay.addEventListener('pointerdown', onDown);
    uiOverlay.addEventListener('pointermove', onHover);
    drawBlendMap();
    _syncBlendMapBtns(true);
}

export function hideBlendMapOverlay() {
    if (state.mode === 'blendMap') { _hideActive(); _syncBlendMapBtns(false); }
}

export function toggleBlendMapOverlay() {
    if (state.mode === 'blendMap') hideBlendMapOverlay();
    else showBlendMapOverlay();
}

function _syncBlendMapBtns(on) {
    document.querySelectorAll('.blend-map-pos-btn')
        .forEach(b => b.classList.toggle('btn-primary', on));
}

// ── Activation / deactivation ─────────────────────────────────────────────────

function _activate(mode, inst, xKey, yKey) {
    uiOverlay.removeEventListener('pointerdown', onDown);
    uiOverlay.removeEventListener('pointermove', onHover);

    state.mode     = mode;
    state.instId   = inst.id;
    state.dragging = false;
    state.xKey     = xKey;
    state.yKey     = yKey;

    uiOverlay.style.pointerEvents = 'auto';
    uiOverlay.addEventListener('pointerdown', onDown);
    uiOverlay.addEventListener('pointermove', onHover);
}

function _hideActive() {
    state.mode       = null;
    state.instId     = null;
    state.dragging   = false;
    state.xKey       = null;
    state.yKey       = null;
    state.shapeKey   = null;
    state.wKey       = null;
    state.hKey       = null;
    state.angleKey   = null;
    state.enabledKey = null;
    state.skewKey    = null;
    state.handle     = null;
    state.dragAnchor = null;
    uiOverlay.getContext('2d').clearRect(0, 0, uiOverlay.width, uiOverlay.height);
    uiOverlay.style.pointerEvents = 'none';
    uiOverlay.style.cursor = '';
    uiOverlay.removeEventListener('pointerdown', onDown);
    uiOverlay.removeEventListener('pointermove', onHover);
}

// ── Pointer events ────────────────────────────────────────────────────────────

const CROP_CURSOR = { center: 'grab', tl: 'nw-resize', tr: 'ne-resize', br: 'se-resize', bl: 'sw-resize' };

function getCursorForMode(mode, h) {
    switch (mode) {
        case 'crop':
            return h ? (CROP_CURSOR[h] || 'default') : 'default';
        case 'viewport':
            return h === 'center' ? 'grab' : h ? 'nwse-resize' : 'default';
        case 'fade':
            return h === 'center' ? 'grab' : h === 'rot' ? 'crosshair' : h === 'edgeW' ? 'ew-resize' : h === 'edgeH' ? 'ns-resize' : 'default';
        case 'lineDrag':
            return (h === 'center' || h === 'fadeCenter') ? 'grab'
                : (h === 'rot' || h === 'lineRot') ? 'crosshair'
                : h === 'edgeW' ? 'ew-resize'
                : h === 'edgeH' ? 'ns-resize' : 'default';
        case 'matrixRain':
            return (h === 'center' || h === 'fadeCenter') ? 'grab'
                : h === 'rot' ? 'crosshair'
                : h === 'edgeW' ? 'ew-resize'
                : h === 'edgeH' ? 'ns-resize' : 'default';
        case 'vignette':
        case 'barrelDistortion':
            return h === 'center' ? 'grab' : h === 'rot' ? 'crosshair' : h === 'edgeW' ? 'ew-resize' : h === 'edgeH' ? 'ns-resize' : 'default';
        case 'doubleExposure':
            return (h === 'imgPos' || h === 'center') ? 'grab' : h === 'rot' ? 'crosshair' : h === 'edgeW' ? 'ew-resize' : h === 'edgeH' ? 'ns-resize' : 'default';
        case 'blendMap':
            return h === 'center' ? 'grab' : h === 'rot' ? 'crosshair' : h === 'scale' ? 'nwse-resize' : 'default';
        case 'kaleidoscope':
            return h === 'center' ? 'grab'
                : (h === 'lineRot' || h === 'symTip' || h === 'rotation') ? 'crosshair'
                : (h && h.startsWith('v')) ? 'move'
                : (h && h.startsWith('e')) ? 'grab'
                : 'default';
        case 'corrupted':
            return h ? 'grab' : 'default';
        case 'text':
            return (h === 'center' || h === 'fadeCenter') ? 'grab'
                : (h === 'rot' || h === 'fadeRot') ? 'crosshair'
                : (h === 'tl' || h === 'br') ? 'nwse-resize'
                : (h === 'tr' || h === 'bl') ? 'nesw-resize'
                : h === 'fadeEdgeW' ? 'ew-resize'
                : h === 'fadeEdgeH' ? 'ns-resize' : 'default';
        case 'shapeSticker':
            return (h === 'center' || h === 'grab_center' || h === 'fadeCenter') ? 'grab'
                : (h === 'rot' || h === 'grab_rot' || h === 'fadeRot') ? 'crosshair'
                : (h && h.startsWith('v')) ? 'move'
                : h === 'fadeEdgeW' ? 'ew-resize'
                : h === 'fadeEdgeH' ? 'ns-resize'
                : h ? 'nwse-resize' : 'default';
        case 'smearTwist': {
            if (h === 'center' || (h && h.startsWith('node:'))) return 'grab';
            const dsInst = getStack().find(i => i.id === state.instId);
            const dsp = dsInst?.params ?? {};
            if ((dsp.smearTwistNodeMode ?? 'manual') === 'manual'
                && (dsp.smearTwistNodeCount ?? 0) < 24) return 'crosshair';
            return 'default';
        }
        case 'filmSoup': {
            if (h === 'center') return 'grab';
            if (h && h.startsWith('bubble:')) return 'grab';
            const fsInst = getStack().find(i => i.id === state.instId);
            if (fsInst && canAddFilmSoupBubble(fsInst.params)) return 'crosshair';
            return 'default';
        }
        case 'colorGel':
        case 'halftone':
            return (h && h.startsWith('line')) ? 'grab'
                : h === 'center' ? 'grab'
                : h === 'gradRot' ? 'crosshair'
                : h === 'fadeCenter' ? 'grab'
                : h === 'fadeRot' ? 'crosshair'
                : h === 'fadeEdgeW' ? 'ew-resize'
                : h === 'fadeEdgeH' ? 'ns-resize' : 'default';
        case 'resin':
            return (h === 'light' || h === 'bubble' || h === 'image' || h === 'fadeCenter') ? 'grab'
                : h === 'rot' ? 'crosshair'
                : h === 'edgeW' ? 'ew-resize'
                : h === 'edgeH' ? 'ns-resize' : 'default';
        case 'glassBlob':
            return (h === 'center' || h === 'light') ? 'grab'
                : h === 'rot' ? 'crosshair'
                : h === 'edgeW' ? 'ew-resize'
                : h === 'edgeH' ? 'ns-resize' : 'default';
        case 'cut':
            return (h === 'center' || (h && h.startsWith('body:'))) ? 'grab'
                : h === 'rot' ? 'crosshair'
                : (h === 'tl' || h === 'br') ? 'nwse-resize'
                : (h === 'tr' || h === 'bl') ? 'nesw-resize'
                : (h && h.startsWith('v')) ? 'move'
                : (h === 'edgeR') ? 'ew-resize'
                : (h === 'edgeB') ? 'ns-resize' : 'default';
        case 'drawTool':
            return 'crosshair';
        case 'mesh':
            return (h === 'move' || h === 'fadeCenter') ? 'grab'
                : h === 'rot' ? 'crosshair'
                : h === 'edgeW' ? 'ew-resize'
                : h === 'edgeH' ? 'ns-resize'
                : h ? 'move' : 'default';
        case 'tunnel':
            return (h === 'move' || h === 'fadeCenter') ? 'grab'
                : h === 'rot' ? 'crosshair'
                : h === 'edgeW' ? 'ew-resize'
                : h === 'edgeH' ? 'ns-resize'
                : h ? 'move' : 'default';
        default:
            return h ? 'grab' : 'default';
    }
}

const HIT_FNS = {
    colorGel:       hitTestColorGel,
    halftone:       hitTestHalftone,
    tunnel:         hitTestTunnel,
    mesh:           hitTestMesh,
    drawTool:       hitTestDrawTool,
    blendMap:       hitTestBlendMap,
    kaleidoscope:   hitTestKaleidoscope,
    crop:           hitTestCrop,
    viewport:       hitTestViewport,
    fade:           hitTestFade,
    doubleExposure: hitTestDoubleExposure,
    lineDrag:       hitTestLineDrag,
    vignette:       hitTestVignette,
    barrelDistortion:   hitTestCRTCurvature,
    corrupted:      hitTestCorrupted,
    text:           hitTestText,
    shapeSticker:   hitTestShapeSticker,
    matrixRain:     hitTestMatrixRain,
    smearTwist:hitTestDigitalSmear,
    filmSoup:       hitTestFilmSoup,
    resin:          hitTestResin,
    glassBlob:      hitTestGlassBlob,
    cut:            hitTestCut,
};

const DRAG_FNS = {
    colorGel:       onDragColorGel,
    halftone:       onDragHalftone,
    tunnel:         onDragTunnel,
    mesh:           onDragMesh,
    drawTool:       onDragDrawTool,
    blendMap:       onDragBlendMap,
    kaleidoscope:   onDragKaleidoscope,
    crop:           onDragCrop,
    viewport:       onDragViewport,
    fade:           onDragFade,
    doubleExposure: onDragDoubleExposure,
    lineDrag:       onDragLineDrag,
    vignette:       onDragVignette,
    barrelDistortion:   onDragCRTCurvature,
    text:           onDragText,
    shapeSticker:   onDragShapeSticker,
    matrixRain:     onDragMatrixRain,
    smearTwist:onDragDigitalSmear,
    filmSoup:       onDragFilmSoup,
    resin:          onDragResin,
    glassBlob:      onDragGlassBlob,
    cut:            onDragCut,
};

const DRAW_FNS = {
    colorGel:       drawColorGel,
    halftone:       drawHalftone,
    tunnel:         drawTunnelOverlay,
    mesh:           drawMeshOverlay,
    drawTool:       drawDrawTool,
    blendMap:       drawBlendMap,
    kaleidoscope:   drawKaleidoscope,
    fade:           drawFade,
    crop:           drawCrop,
    matrixRain:     drawMatrixRain,
    viewport:       drawViewport,
    lineDrag:       drawLineDrag,
    chroma:         drawChroma,
    vignette:       drawVignette,
    text:           drawTextOverlay,
    doubleExposure: drawDoubleExposure,
    shapeSticker:   drawShapeSticker,
    corrupted:      drawCorrupted,
    barrelDistortion:   drawCRTCurvature,
    smearTwist:drawDigitalSmear,
    filmSoup:       drawFilmSoup,
    resin:          drawResin,
    glassBlob:      drawGlassBlob,
    cut:            drawCut,
};

function onHover(e) {
    if (state.dragging) return;
    const hitFn = HIT_FNS[state.mode];
    const h = hitFn ? hitFn(e) : (hitTestCentre(e) ? 'center' : null);
    uiOverlay.style.cursor = getCursorForMode(state.mode, h);
}

function onDown(e) {
    const hitFn = HIT_FNS[state.mode];
    const h = hitFn ? hitFn(e) : (hitTestCentre(e) ? 'center' : null);

    if (!h && state.mode === 'smearTwist') {
        const inst = getStack().find(i => i.id === state.instId);
        if (inst) {
            const p = inst.params;
            if ((p.smearTwistNodeMode ?? 'manual') === 'manual'
                && (p.smearTwistNodeCount ?? 0) < 24) {
                const rect = canvas.getBoundingClientRect();
                const W = uiOverlay.width, H = uiOverlay.height;
                const nx = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / W) * 100)));
                const ny = Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top)  / H) * 100)));
                const idx = p.smearTwistNodeCount ?? 0;
                saveState();
                setInstanceParam(state.instId, `smearTwistNx${idx}`, nx);
                setInstanceParam(state.instId, `smearTwistNy${idx}`, ny);
                setInstanceParam(state.instId, 'smearTwistNodeCount', idx + 1);
            }
        }
    }

    if (!h && state.mode === 'filmSoup') {
        const inst = getStack().find(i => i.id === state.instId);
        if (inst && canAddFilmSoupBubble(inst.params)) {
            saveState();
            addFilmSoupBubble(state.instId, inst.params, e);
        }
    }

    if (!h) return;

    // Cut moves: drag from inside the shape (select) or a copy's body (paste) to
    // move it, with a grab offset so it doesn't jump under the cursor.
    let handle = h;
    if (state.mode === 'cut') {
        const inst = getStack().find(i => i.id === state.instId);
        const rect2 = canvas.getBoundingClientRect();
        const mx = e.clientX - rect2.left, my = e.clientY - rect2.top;
        const W = uiOverlay.width, H = uiOverlay.height;
        if (inst && typeof h === 'string' && h.startsWith('body:')) {
            const idx = parseInt(h.slice(5), 10);
            state.cutActive = idx;
            handle = 'center';
            drawCut(inst.params);
            let t = { x: 0, y: 0 };
            try { t = JSON.parse(inst.params.cutPastes || '[]')[idx] || t; } catch { /* default */ }
            const cx = (0.5 + (t.x ?? 0) / 100) * W, cy = (0.5 - (t.y ?? 0) / 100) * H;
            state.dragAnchor = { grabDX: cx - mx, grabDY: cy - my };
        } else if (inst && h === 'center') {
            const cx = (0.5 + inst.params.cutX / 100) * W, cy = (0.5 - inst.params.cutY / 100) * H;
            state.dragAnchor = { grabDX: cx - mx, grabDY: cy - my };
        }
    }

    // Viewport text: drag the glyph body with a grab offset so it doesn't jump.
    if (state.mode === 'viewport' && h === 'center') {
        const inst = getStack().find(i => i.id === state.instId);
        if (inst && inst.params.vpShape === 'text') {
            const rect2 = canvas.getBoundingClientRect();
            const mx = e.clientX - rect2.left, my = e.clientY - rect2.top;
            const W = uiOverlay.width, H = uiOverlay.height;
            const cx = (0.5 + inst.params.vpX / 100) * W, cy = (0.5 - inst.params.vpY / 100) * H;
            state.dragAnchor = { grabDX: cx - mx, grabDY: cy - my };
        }
    }

    state.handle   = handle;
    state.dragging = true;
    uiOverlay.setPointerCapture(e.pointerId);
    uiOverlay.style.cursor = getCursorForMode(state.mode, handle).replace('grab', 'grabbing');

    // Special dragAnchor setup for crop drags
    if (state.mode === 'crop') {
        const inst = getStack().find(i => i.id === state.instId);
        if (inst) {
            const { cx, cy, bw, bh } = computeCropRect(inst.params);
            if (h === 'center') {
                // Record the grab offset so the crop moves relative to the cursor
                // instead of snapping its center under the pointer.
                const rect2 = canvas.getBoundingClientRect();
                state.dragAnchor = {
                    grabDX: cx - (e.clientX - rect2.left),
                    grabDY: cy - (e.clientY - rect2.top),
                };
            } else {
                const SIGNS = { tl: [-1, -1], tr: [+1, -1], br: [+1, +1], bl: [-1, +1] };
                const [signX, signY] = SIGNS[h];
                state.dragAnchor = {
                    oppX: cx - signX * bw / 2,
                    oppY: cy - signY * bh / 2,
                    signX, signY,
                };
            }
        }
    }

    // Grab offset for barrel-distortion (barrelDistortion) center drag, so the
    // region moves relative to the cursor instead of snapping under it.
    if (state.mode === 'barrelDistortion' && h === 'center') {
        const inst = getStack().find(i => i.id === state.instId);
        if (inst) {
            const p = inst.params;
            const rect2 = canvas.getBoundingClientRect();
            const cx = (0.5 + p.barrelDistortionX / 100) * uiOverlay.width;
            const cy = (0.5 - p.barrelDistortionY / 100) * uiOverlay.height;
            state.dragAnchor = {
                grabDX: cx - (e.clientX - rect2.left),
                grabDY: cy - (e.clientY - rect2.top),
            };
        }
    }

    // Color Gel: rotating captures the cursor's start angle so grabbing doesn't
    // snap the gradient to the cursor, and the origin hub keeps its grab offset.
    // The radial sweep's marker line rotates, so it needs the angle anchor too.
    if (state.mode === 'colorGel' && (h === 'gradRot' || h === 'center' || h === 'line')) {
        const rect2 = canvas.getBoundingClientRect();
        const inst2 = getStack().find(i => i.id === state.instId);
        const p2    = inst2?.params ?? {};
        const mx2   = e.clientX - rect2.left, my2 = e.clientY - rect2.top;
        const W2    = uiOverlay.width, H2 = uiOverlay.height;
        state.dragAnchor = (h === 'center')
            ? gelCenterAnchor(p2, mx2, my2, W2, H2)
            : gelRotAnchor(p2, mx2, my2, W2, H2);
    }

    // Halftone: same as Color Gel — capture the rotation start angle / grab offset.
    if (state.mode === 'halftone' && (h === 'gradRot' || h === 'center')) {
        const rect2 = canvas.getBoundingClientRect();
        const inst2 = getStack().find(i => i.id === state.instId);
        const p2    = inst2?.params ?? {};
        const mx2   = e.clientX - rect2.left, my2 = e.clientY - rect2.top;
        const W2    = uiOverlay.width, H2 = uiOverlay.height;
        state.dragAnchor = (h === 'center')
            ? htCenterAnchor(p2, mx2, my2, W2, H2)
            : htRotAnchor(p2, mx2, my2, W2, H2);
    }

    // Special dragAnchor setup for text box drags. Corners need it too: with
    // Lock Angles on they resize against the corner positions at drag start.
    if (state.mode === 'text' && (h === 'center' || h === 'rot'
        || h === 'tl' || h === 'tr' || h === 'br' || h === 'bl'
        || h === 'topEdge' || h === 'rightEdge' || h === 'bottomEdge' || h === 'leftEdge')) {
        const rect2 = canvas.getBoundingClientRect();
        const inst2 = getStack().find(i => i.id === state.instId);
        const p2    = inst2?.params ?? {};
        const W2    = uiOverlay.width, H2 = uiOverlay.height;
        const { cx, cy } = textCorners(p2, W2, H2);
        state.dragAnchor = {
            startX: e.clientX - rect2.left, startY: e.clientY - rect2.top,
            cxPx: cx, cyPx: cy,
            startAngle: Math.atan2((e.clientY - rect2.top) - cy, (e.clientX - rect2.left) - cx),
            tlx0: p2.textTLx ?? 10, tly0: p2.textTLy ?? 65,
            trx0: p2.textTRx ?? 90, try0: p2.textTRy ?? 65,
            brx0: p2.textBRx ?? 90, bry0: p2.textBRy ?? 95,
            blx0: p2.textBLx ?? 10, bly0: p2.textBLy ?? 95,
        };
    }

    if (state.mode === 'drawTool') {
        const inst = getStack().find(i => i.id === state.instId);
        if (inst) onDrawToolDown(e, inst, canvas.getBoundingClientRect());
    }

    if (state.mode === 'mesh') {
        const rect2 = canvas.getBoundingClientRect();
        const inst2 = getStack().find(i => i.id === state.instId);
        const p2 = inst2?.params ?? {};
        state.dragAnchor = {
            startX: e.clientX - rect2.left, startY: e.clientY - rect2.top,
            tlx0: p2.meshTLx ?? 10, tly0: p2.meshTLy ?? 10,
            trx0: p2.meshTRx ?? 90, try0: p2.meshTRy ?? 10,
            brx0: p2.meshBRx ?? 90, bry0: p2.meshBRy ?? 90,
            blx0: p2.meshBLx ?? 10, bly0: p2.meshBLy ?? 90,
        };
    }

    if (state.mode === 'tunnel') {
        const rect2 = canvas.getBoundingClientRect();
        const inst2 = getStack().find(i => i.id === state.instId);
        const p2 = inst2?.params ?? {};
        state.dragAnchor = {
            startX: e.clientX - rect2.left, startY: e.clientY - rect2.top,
            x10: p2.tunnelX1 ?? 25, y10: p2.tunnelY1 ?? 50,
            x20: p2.tunnelX2 ?? 75, y20: p2.tunnelY2 ?? 50,
            cx0: p2.tunnelCx  ?? 50, cy0: p2.tunnelCy  ?? 40,
        };
    }

    state.hasDragged = false;
    uiOverlay.addEventListener('pointermove', onDrag);
    uiOverlay.addEventListener('pointerup',   onUp);
}

function onDrag(e) {
    state.hasDragged = true;
    const rect = canvas.getBoundingClientRect();

    if (state.mode === 'blendMap') {
        DRAG_FNS.blendMap?.(e, null, rect);
        return;
    }

    const inst = getStack().find(i => i.id === state.instId);
    if (!inst) return;

    const dragFn = DRAG_FNS[state.mode];
    if (dragFn) {
        dragFn(e, inst, rect);
    } else {
        // Generic center drag for modes with no special drag logic (chroma, matrixRain, corrupted)
        const x = Math.round(Math.max(-50, Math.min(50, ((e.clientX - rect.left) / rect.width  - 0.5) * 100)));
        const y = Math.round(Math.max(-50, Math.min(50, -((e.clientY - rect.top)  / rect.height - 0.5) * 100)));
        setInstanceParam(state.instId, state.xKey, x);
        setInstanceParam(state.instId, state.yKey, y);
    }
    // onStackChange fires → draw() called automatically
}

function onUp() {
    const wasClick   = !state.hasDragged;
    const handle     = state.handle;
    const mode       = state.mode;
    const instId     = state.instId;

    state.dragging   = false;
    state.handle     = null;
    state.dragAnchor = null;
    state.hasDragged = false;
    uiOverlay.style.cursor = 'default';
    uiOverlay.removeEventListener('pointermove', onDrag);
    uiOverlay.removeEventListener('pointerup',   onUp);
    saveState();

    if (mode === 'blendMap') {
        drawBlendMap();
        return;
    }

    const inst = getStack().find(i => i.id === instId);
    if (!inst) return;

    if (wasClick && mode === 'smearTwist' && handle?.startsWith('node:')) {
        const idx = parseInt(handle.split(':')[1]);
        deleteSmearNode(instId, idx, inst.params);
    }

    if (wasClick && mode === 'filmSoup' && handle?.startsWith('bubble:')) {
        const idx = parseInt(handle.split(':')[1]);
        deleteFilmSoupBubble(instId, inst.params, idx);
    }

    if (mode === 'drawTool') {
        const inst2 = getStack().find(i => i.id === instId);
        if (inst2) finalizeDrawToolStroke(instId, inst2.params);
    }

    DRAW_FNS[mode]?.(getStack().find(i => i.id === instId)?.params ?? inst.params);
}
