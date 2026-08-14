import { canvas } from '../renderer/glstate.js';
import { setInstanceParam, getStack, onStackChange } from '../state/effectStack.js';
import { saveState } from '../state/undo.js';
import { setCropPreviewActive } from '../state/cropPreview.js';
import { processImageImmediate } from '../renderer/pipeline.js';

import { state } from './overlayState.js';
import { uiOverlay, hitTestCentre, applyGrab } from './overlayUtils.js';

import { drawFade,           hitTestFade,           resetFadeVertices    } from './overlays/fadeOverlay.js';
import { drawDoubleExposure, hitTestDoubleExposure, onDragDoubleExposure } from './overlays/doubleExposureOverlay.js';
import { drawShapeSticker,   hitTestShapeSticker,   onDragShapeSticker,  resetShapeStickerVertices } from './overlays/shapeStickerOverlay.js';
import { drawCrop,           hitTestCrop,           onDragCrop,          computeCropRect } from './overlays/cropOverlay.js';
import { drawLineDrag,       hitTestLineDrag,       onDragLineDrag       } from './overlays/lineDragOverlay.js';
import { drawChroma, hitTestChroma                                        } from './overlays/chromaOverlay.js';
import { drawVignette,       hitTestVignette,       onDragVignette       } from './overlays/vignetteOverlay.js';
import { drawCRTCurvature,   hitTestCRTCurvature,   onDragCRTCurvature  } from './overlays/crtOverlay.js';
import { drawRotate,         hitTestRotate,         onDragRotate        } from './overlays/rotateOverlay.js';
import { drawTilt,           hitTestTilt,           onDragTilt          } from './overlays/tiltOverlay.js';
import { drawCorrupted,      hitTestCorrupted                            } from './overlays/corruptedOverlay.js';
import { drawGhostmark,      hitTestGhostmark,       onDragGhostmark,     ghostmarkCenterAnchor, ghostmarkRotAnchor, ghostmarkSizeAnchor } from './overlays/ghostmarkOverlay.js';
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
import { drawWrinkle, hitTestWrinkle, onDragWrinkle, wrinkleRotAnchor, wrinkleCenterAnchor } from './overlays/wrinkleOverlay.js';
import { drawCaustics, hitTestCaustics, onDragCaustics, causticsRotAnchor } from './overlays/causticsOverlay.js';
import { drawResin, hitTestResin, onDragResin } from './overlays/resinOverlay.js';
import { drawGlassBlob, hitTestGlassBlob, onDragGlassBlob } from './overlays/glassBlobOverlay.js';
import { drawCut, hitTestCut, onDragCut, resetCutVertices, drawPaste, hitTestPaste, onDragPaste } from './overlays/cutOverlay.js';
import { drawQR, hitTestQR, onDragQR } from './overlays/qrOverlay.js';
import { drawCollage, hitTestCollage, onDragCollage } from './overlays/collageOverlay.js';
import { swapCollageImage } from '../effects/collage.js';
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

    // Generic fade-polygon vertex seeding — for ANY active fade overlay whose shape is
    // polygon, (re)seed the vertices to a regular N-gon when Shape/Sides/Width/Height
    // change (mirrors Shape Sticker). Works off the standardized fade state keys.
    if (state.shapeKey && state.shapeKey.endsWith('FadeShape') && state.wKey) {
        const p = inst.params;
        if ((p[state.shapeKey] ?? 'ellipse') === 'polygon') {
            const base = state.wKey.slice(0, -1);   // '<prefix>Fade'
            if (key === state.shapeKey || key === `${base}Sides` || key === state.wKey || key === state.hKey) {
                resetFadeVertices(inst.id, base, p);
                return;
            }
        }
    }

    if (state.mode === 'fade')          drawFade(inst.params);
    if (state.mode === 'crop')          drawCrop(inst.params);
    if (state.mode === 'matrixRain')    drawMatrixRain(inst.params);
    if (state.mode === 'lineDrag')      drawLineDrag(inst.params);
    if (state.mode === 'chroma')        drawChroma(inst.params);
    if (state.mode === 'vignette')      drawVignette(inst.params);
    if (state.mode === 'barrelDistortion')  drawCRTCurvature(inst.params);
    if (state.mode === 'rotate')        drawRotate(inst.params);
    if (state.mode === 'tilt')          drawTilt(inst.params);
    if (state.mode === 'corrupted')     drawCorrupted(inst.params);
    if (state.mode === 'ghostmark')     drawGhostmark(inst.params);
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
    if (state.mode === 'wrinkle')      drawWrinkle(inst.params);
    if (state.mode === 'caustics')     drawCaustics(inst.params);
    if (state.mode === 'resin')        drawResin(inst.params);
    if (state.mode === 'glassBlob')    drawGlassBlob(inst.params);
    if (state.mode === 'qr')           drawQR(inst.params);
    if (state.mode === 'collage')      drawCollage(inst.params);
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
    if (state.mode === 'paste')        drawPaste(inst.params);
});

// QR generation is async; when it finishes the code's aspect ratio becomes known, so redraw the
// active QR overlay to match it (rMQR/PDF417/Barcode are rectangular). qrEngine fires 'qr-status'.
document.addEventListener('qr-status', (e) => {
    if (state.mode !== 'qr' || !state.instId) return;
    if (e.detail && e.detail.instId && e.detail.instId !== state.instId) return;
    const inst = getStack().find(i => i.id === state.instId);
    if (inst) drawQR(inst.params);
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

export function showQROverlay(inst) {
    _activate('qr', inst, 'qrX', 'qrY');
    drawQR(inst.params);
}

export function hideQROverlay() {
    if (state.mode === 'qr') _hideActive();
}

export function showCollageOverlay(inst) {
    _activate('collage', inst, null, null);
    drawCollage(inst.params);
}

export function hideCollageOverlay() {
    if (state.mode === 'collage') _hideActive();
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
    // NOTE: fade state keys (shapeKey/wKey/hKey/angleKey/enabledKey) are set by
    // showFadeOverlay, which runs first because barrelDistortion declares overlays.fade.
    // The CRT ellipse handles use hardcoded barrelDistortion* keys in onDragCRTCurvature,
    // so we must NOT overwrite state.wKey here or the embedded fade would resolve wrong.
    _activate('barrelDistortion', inst, 'barrelDistortionX', 'barrelDistortionY');
    drawCRTCurvature(inst.params);
}

export function hideCRTCurvatureOverlay() {
    if (state.mode === 'barrelDistortion') _hideActive();
}

export function showRotateOverlay(inst) {
    state.shapeKey   = 'rotateFadeShape';
    state.wKey       = 'rotateFadeW';
    state.hKey       = 'rotateFadeH';
    state.angleKey   = 'rotateFadeAngle';
    state.enabledKey = 'rotateFadeEnabled';
    _activate('rotate', inst, 'rotateFadeX', 'rotateFadeY');
    drawRotate(inst.params);
}

export function hideRotateOverlay() {
    if (state.mode === 'rotate') _hideActive();
}

export function showTiltOverlay(inst) {
    state.shapeKey   = 'tiltFadeShape';
    state.wKey       = 'tiltFadeW';
    state.hKey       = 'tiltFadeH';
    state.angleKey   = 'tiltFadeAngle';
    state.enabledKey = 'tiltFadeEnabled';
    _activate('tilt', inst, 'tiltFadeX', 'tiltFadeY');
    drawTilt(inst.params);
}

export function hideTiltOverlay() {
    if (state.mode === 'tilt') _hideActive();
}

export function showCorruptedOverlay(inst) {
    _activate('corrupted', inst, 'corruptedX', 'corruptedY');
    drawCorrupted(inst.params);
}

export function hideCorruptedOverlay() {
    if (state.mode === 'corrupted') _hideActive();
}

export function showGhostmarkOverlay(inst) {
    _activate('ghostmark', inst, 'ghostmarkX', 'ghostmarkY');
    drawGhostmark(inst.params);
}

export function hideGhostmarkOverlay() {
    if (state.mode === 'ghostmark') _hideActive();
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

export function showWrinkleOverlay(inst) {
    state.shapeKey   = 'wrinkleFadeShape';
    state.wKey       = 'wrinkleFadeW';
    state.hKey       = 'wrinkleFadeH';
    state.angleKey   = 'wrinkleFadeAngle';
    state.enabledKey = 'wrinkleFadeEnabled';
    _activate('wrinkle', inst, 'wrinkleFadeX', 'wrinkleFadeY');
    drawWrinkle(inst.params);
}

export function hideWrinkleOverlay() {
    if (state.mode === 'wrinkle') _hideActive();
}

export function showCausticsOverlay(inst) {
    state.shapeKey   = 'causticsFadeShape';
    state.wKey       = 'causticsFadeW';
    state.hKey       = 'causticsFadeH';
    state.angleKey   = 'causticsFadeAngle';
    state.enabledKey = 'causticsFadeEnabled';
    _activate('caustics', inst, 'causticsFadeX', 'causticsFadeY');
    drawCaustics(inst.params);
}

export function hideCausticsOverlay() {
    if (state.mode === 'caustics') _hideActive();
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
    state.shapeKey   = 'glassBlobFadeShape';
    state.wKey       = 'glassBlobFadeW';
    state.hKey       = 'glassBlobFadeH';
    state.angleKey   = 'glassBlobFadeAngle';
    state.enabledKey = 'glassBlobFadeEnabled';
    _activate('glassBlob', inst, 'glassBlobX', 'glassBlobY');
    drawGlassBlob(inst.params);
}

export function hideGlassBlobOverlay() {
    if (state.mode === 'glassBlob') _hideActive();
}

// Delete/Backspace removes the selected pasted copy while the Paste overlay is active.
function _pasteKeydown(e) {
    if (state.mode !== 'paste') return;
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
    if (state.cutActive == null || state.cutActive < 0) return;
    e.preventDefault();
    deleteActivePaste(state.instId);
}

// Cut layer → SELECT mode: position / size / rotate the selection shape.
export function showCutOverlay(inst) {
    _activate('cut', inst, 'cutX', 'cutY');
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
    if (state.mode === 'cut') _hideActive();
}

let _lastPasteInstId = null;

// Paste layer → PASTE mode: move / scale / rotate copies, plus the embedded fade region.
export function showPasteOverlay(inst) {
    state.shapeKey   = 'pasteFadeShape';
    state.wKey       = 'pasteFadeW';
    state.hKey       = 'pasteFadeH';
    state.angleKey   = 'pasteFadeAngle';
    state.enabledKey = 'pasteFadeEnabled';
    _activate('paste', inst, 'pasteFadeX', 'pasteFadeY');
    // Keep the selected copy when reopening the same Paste layer; reset when switching.
    let nPastes = 0;
    try { nPastes = JSON.parse(inst.params.cutPastes || '[]').length; } catch { /* 0 */ }
    state.cutActive = (inst.id !== _lastPasteInstId) ? -1 : Math.min(state.cutActive, nPastes - 1);
    _lastPasteInstId = inst.id;
    window.removeEventListener('keydown', _pasteKeydown);
    window.addEventListener('keydown', _pasteKeydown);
    drawPaste(inst.params);
}

export function hidePasteOverlay() {
    if (state.mode === 'paste') {
        window.removeEventListener('keydown', _pasteKeydown);
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
    state.collageTarget = null;
    state.snapGuides = null;
    uiOverlay.getContext('2d').clearRect(0, 0, uiOverlay.width, uiOverlay.height);
    uiOverlay.style.pointerEvents = 'none';
    uiOverlay.style.cursor = '';
    uiOverlay.removeEventListener('pointerdown', onDown);
    uiOverlay.removeEventListener('pointermove', onHover);
}

// ── Pointer events ────────────────────────────────────────────────────────────

const CROP_CURSOR = { center: 'grab', tl: 'nw-resize', tr: 'ne-resize', br: 'se-resize', bl: 'sw-resize' };

// Cursor for the standardized fade handles (shared by every fade-using mode); null if not a fade handle.
function fadeCursor(h) {
    if (h === 'fadeCenter') return 'grab';
    if (h === 'fadeRot')    return 'crosshair';
    if (h === 'fadeEdgeW')  return 'ew-resize';
    if (h === 'fadeEdgeH')  return 'ns-resize';
    if (h && /^fadeV\d+$/.test(h)) return 'move';
    return null;
}

function getCursorForMode(mode, h) {
    // Fade handles share one cursor mapping across every mode that embeds a fade.
    const fc = fadeCursor(h);
    if (fc) return fc;
    switch (mode) {
        case 'crop':
            return h ? (CROP_CURSOR[h] || 'default') : 'default';
        case 'viewport':
            return h === 'center' ? 'grab' : h ? 'nwse-resize' : 'default';
        case 'fade':
            return fadeCursor(h) || 'default';
        case 'lineDrag':
            return fadeCursor(h)
                || ((h === 'center' || h === 'line') ? 'grab'
                : (h === 'rot' || h === 'lineRot') ? 'crosshair' : 'default');
        case 'matrixRain':
            return fadeCursor(h) || (h === 'center' ? 'grab' : 'default');
        case 'vignette':
        case 'barrelDistortion':
            return h === 'center' ? 'grab' : h === 'rot' ? 'crosshair' : h === 'edgeW' ? 'ew-resize' : h === 'edgeH' ? 'ns-resize' : 'default';
        case 'rotate':
            return h === 'rot' ? 'crosshair' : 'default';
        case 'tilt':
            return h === 'tilt' ? 'move' : 'default';
        case 'doubleExposure':
            return fadeCursor(h) || (h === 'imgPos' ? 'grab' : 'default');
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
            return fadeCursor(h)
                || (h === 'center' ? 'grab'
                : h === 'rot' ? 'crosshair'
                : (h === 'tl' || h === 'br') ? 'nwse-resize'
                : (h === 'tr' || h === 'bl') ? 'nesw-resize' : 'default');
        case 'shapeSticker':
            return fadeCursor(h)
                || ((h === 'center' || h === 'grab_center') ? 'grab'
                : (h === 'rot' || h === 'grab_rot') ? 'crosshair'
                : (h && h.startsWith('v')) ? 'move'
                : h ? 'nwse-resize' : 'default');
        case 'qr':
            return fadeCursor(h)
                || (h === 'center' ? 'grab'
                : h === 'rot' ? 'crosshair'
                : h ? 'nwse-resize' : 'default');
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
        case 'wrinkle':
        case 'caustics':
            return fadeCursor(h)
                || ((h && h.startsWith('line')) ? 'grab'
                : h === 'center' ? 'grab'
                : h === 'gradRot' ? 'crosshair' : 'default');
        case 'resin':
            return fadeCursor(h)
                || ((h === 'light' || h === 'bubble' || h === 'image') ? 'grab' : 'default');
        case 'glassBlob':
            return fadeCursor(h)
                || ((h === 'center' || h === 'light') ? 'grab'
                : h === 'rot' ? 'crosshair'
                : h === 'edgeW' ? 'ew-resize'
                : h === 'edgeH' ? 'ns-resize' : 'default');
        case 'mesh':
        case 'tunnel':
            return fadeCursor(h)
                || ((h === 'move') ? 'grab' : h ? 'move' : 'default');
        case 'cut':
            return (h === 'center' || (h && h.startsWith('body:'))) ? 'grab'
                : h === 'rot' ? 'crosshair'
                : (h === 'tl' || h === 'br') ? 'nwse-resize'
                : (h === 'tr' || h === 'bl') ? 'nesw-resize'
                : (h && h.startsWith('v')) ? 'move'
                : (h === 'edgeR') ? 'ew-resize'
                : (h === 'edgeB') ? 'ns-resize' : 'default';
        case 'paste':
            return (h === 'center' || (h && h.startsWith('body:'))) ? 'grab'
                : h === 'rot' ? 'crosshair'
                : (h === 'c0' || h === 'c2' || h === 'scale') ? 'nwse-resize'
                : (h === 'c1' || h === 'c3') ? 'nesw-resize' : 'default';
        case 'drawTool':
            return 'crosshair';
        case 'collage':
            return (h && h.startsWith('cell:')) ? 'grab' : 'default';
        default:
            return h ? 'grab' : 'default';
    }
}

const HIT_FNS = {
    colorGel:       hitTestColorGel,
    halftone:       hitTestHalftone,
    wrinkle:        hitTestWrinkle,
    caustics:       hitTestCaustics,
    tunnel:         hitTestTunnel,
    mesh:           hitTestMesh,
    drawTool:       hitTestDrawTool,
    blendMap:       hitTestBlendMap,
    kaleidoscope:   hitTestKaleidoscope,
    crop:           hitTestCrop,
    viewport:       hitTestViewport,
    fade:           hitTestFade,
    chroma:         hitTestChroma,
    doubleExposure: hitTestDoubleExposure,
    lineDrag:       hitTestLineDrag,
    vignette:       hitTestVignette,
    barrelDistortion:   hitTestCRTCurvature,
    rotate:         hitTestRotate,
    tilt:           hitTestTilt,
    corrupted:      hitTestCorrupted,
    ghostmark:      hitTestGhostmark,
    text:           hitTestText,
    shapeSticker:   hitTestShapeSticker,
    qr:             hitTestQR,
    matrixRain:     hitTestMatrixRain,
    smearTwist:hitTestDigitalSmear,
    filmSoup:       hitTestFilmSoup,
    resin:          hitTestResin,
    glassBlob:      hitTestGlassBlob,
    cut:            hitTestCut,
    paste:          hitTestPaste,
    collage:        hitTestCollage,
};

const DRAG_FNS = {
    colorGel:       onDragColorGel,
    halftone:       onDragHalftone,
    wrinkle:        onDragWrinkle,
    caustics:       onDragCaustics,
    tunnel:         onDragTunnel,
    mesh:           onDragMesh,
    drawTool:       onDragDrawTool,
    blendMap:       onDragBlendMap,
    kaleidoscope:   onDragKaleidoscope,
    crop:           onDragCrop,
    viewport:       onDragViewport,
    doubleExposure: onDragDoubleExposure,
    lineDrag:       onDragLineDrag,
    vignette:       onDragVignette,
    barrelDistortion:   onDragCRTCurvature,
    rotate:         onDragRotate,
    tilt:           onDragTilt,
    text:           onDragText,
    shapeSticker:   onDragShapeSticker,
    qr:             onDragQR,
    matrixRain:     onDragMatrixRain,
    ghostmark:      onDragGhostmark,
    smearTwist:onDragDigitalSmear,
    filmSoup:       onDragFilmSoup,
    resin:          onDragResin,
    glassBlob:      onDragGlassBlob,
    cut:            onDragCut,
    paste:          onDragPaste,
    collage:        onDragCollage,
};

const DRAW_FNS = {
    colorGel:       drawColorGel,
    halftone:       drawHalftone,
    wrinkle:        drawWrinkle,
    caustics:       drawCaustics,
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
    rotate:         drawRotate,
    tilt:           drawTilt,
    text:           drawTextOverlay,
    doubleExposure: drawDoubleExposure,
    shapeSticker:   drawShapeSticker,
    qr:             drawQR,
    corrupted:      drawCorrupted,
    ghostmark:      drawGhostmark,
    barrelDistortion:   drawCRTCurvature,
    smearTwist:drawDigitalSmear,
    filmSoup:       drawFilmSoup,
    resin:          drawResin,
    glassBlob:      drawGlassBlob,
    cut:            drawCut,
    paste:          drawPaste,
    collage:        drawCollage,
};

// ── Redraw the active overlay on canvas resize ────────────────────────────────
// When an effect changes the canvas size/orientation (e.g. Transform 90°, crop,
// aspect change), the displayed #mainCanvas — and thus the CSS-sized uiOverlay —
// resizes. Overlays size their drawing buffer from the canvas rect at draw time
// (syncSize), so without a redraw their handles stay sized to the old dimensions
// and get stretched. This does automatically what a minimize→maximize does by hand.
// Vertices are stored in normalized (%) coords, so a plain redraw at the new size
// is correct — no reseeding needed.
function redrawActiveOverlay() {
    if (!state.mode || !state.instId) return;
    if (state.mode === 'blendMap') { drawBlendMap(); return; }
    const inst = getStack().find(i => i.id === state.instId);
    if (inst) DRAW_FNS[state.mode]?.(inst.params);
}

let _roPending = false;
const _overlayResizeObs = new ResizeObserver(() => {
    if (_roPending) return;
    _roPending = true;
    // Coalesce bursts; the rAF callback runs after layout so getBoundingClientRect
    // in syncSize returns the settled size.
    requestAnimationFrame(() => { _roPending = false; redrawActiveOverlay(); });
});
_overlayResizeObs.observe(canvas);

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

    // Cut/Paste moves: drag the selection shape body (cut) or a copy's body (paste) to
    // move it, with a grab offset so it doesn't jump under the cursor.
    let handle = h;
    if (state.mode === 'cut' && h === 'center') {
        const inst = getStack().find(i => i.id === state.instId);
        if (inst) {
            const rect2 = canvas.getBoundingClientRect();
            const mx = e.clientX - rect2.left, my = e.clientY - rect2.top;
            const W = uiOverlay.width, H = uiOverlay.height;
            const cx = (0.5 + inst.params.cutX / 100) * W, cy = (0.5 - inst.params.cutY / 100) * H;
            state.dragAnchor = { grabDX: cx - mx, grabDY: cy - my };
        }
    } else if (state.mode === 'paste' && typeof h === 'string' && h.startsWith('body:')) {
        const inst = getStack().find(i => i.id === state.instId);
        if (inst) {
            const rect2 = canvas.getBoundingClientRect();
            const mx = e.clientX - rect2.left, my = e.clientY - rect2.top;
            const W = uiOverlay.width, H = uiOverlay.height;
            const idx = parseInt(h.slice(5), 10);
            state.cutActive = idx;
            handle = 'center';
            drawPaste(inst.params);
            let t = { x: 0, y: 0 };
            try { t = JSON.parse(inst.params.cutPastes || '[]')[idx] || t; } catch { /* default */ }
            const cx = (0.5 + (t.x ?? 0) / 100) * W, cy = (0.5 - (t.y ?? 0) / 100) * H;
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

    // Wrinkle: same as Halftone — capture the rotation start angle / grab offset.
    if (state.mode === 'wrinkle' && (h === 'gradRot' || h === 'center')) {
        const rect2 = canvas.getBoundingClientRect();
        const inst2 = getStack().find(i => i.id === state.instId);
        const p2    = inst2?.params ?? {};
        const mx2   = e.clientX - rect2.left, my2 = e.clientY - rect2.top;
        const W2    = uiOverlay.width, H2 = uiOverlay.height;
        state.dragAnchor = (h === 'center')
            ? wrinkleCenterAnchor(p2, mx2, my2, W2, H2)
            : wrinkleRotAnchor(p2, mx2, my2, W2, H2);
    }

    // Caustics: capture the rotation start angle (the line grab is lazy via applyGrab).
    if (state.mode === 'caustics' && h === 'gradRot') {
        const rect2 = canvas.getBoundingClientRect();
        const inst2 = getStack().find(i => i.id === state.instId);
        const p2    = inst2?.params ?? {};
        const mx2   = e.clientX - rect2.left, my2 = e.clientY - rect2.top;
        const W2    = uiOverlay.width, H2 = uiOverlay.height;
        state.dragAnchor = causticsRotAnchor(p2, mx2, my2, W2, H2);
    }

    // Ghostmark: capture the grab offset (move) or the rotation/size start reference.
    if (state.mode === 'ghostmark' && (h === 'center' || h === 'rot' || h === 'size')) {
        const rect2 = canvas.getBoundingClientRect();
        const inst2 = getStack().find(i => i.id === state.instId);
        const p2    = inst2?.params ?? {};
        const mx2   = e.clientX - rect2.left, my2 = e.clientY - rect2.top;
        const W2    = uiOverlay.width, H2 = uiOverlay.height;
        state.dragAnchor = h === 'rot'  ? ghostmarkRotAnchor(p2, mx2, my2, W2, H2)
                         : h === 'size' ? ghostmarkSizeAnchor(p2, mx2, my2, W2, H2)
                         :                ghostmarkCenterAnchor(p2, mx2, my2, W2, H2);
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

    if (state.mode === 'drawTool' && state.handle === 'canvas') {
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

    // Centralized fade-handle dragging for EVERY fade-using overlay. All fade handles use
    // the standardized 'fade*' names; the fade param keys are <prefix>Fade{X,Y,W,H,Angle,V#}
    // derivable from state.wKey. This is the single home for fade drag math so overlays
    // don't each re-implement it.
    const h = state.handle || '';
    if (state.wKey && /^fade(Center|EdgeW|EdgeH|Rot|V\d+)$/.test(h)) {
        const base = state.wKey.slice(0, -1);        // '<prefix>Fade'
        const W = uiOverlay.width, H = uiOverlay.height;
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const cx = (0.5 + (inst.params[base + 'X'] ?? 0) / 100) * W;
        const cy = (0.5 - (inst.params[base + 'Y'] ?? 0) / 100) * H;
        const clampI = (lo, hi, v) => Math.round(Math.max(lo, Math.min(hi, v)));
        if (h === 'fadeCenter') {
            const [gx, gy] = applyGrab(cx, cy, mx, my);
            setInstanceParam(state.instId, base + 'X', clampI(-50, 50,  (gx / W - 0.5) * 100));
            setInstanceParam(state.instId, base + 'Y', clampI(-50, 50, -(gy / H - 0.5) * 100));
        } else if (h === 'fadeEdgeW') {
            setInstanceParam(state.instId, base + 'W', clampI(1, 200, Math.abs(mx - cx) / (W / 2) * 100));
        } else if (h === 'fadeEdgeH') {
            setInstanceParam(state.instId, base + 'H', clampI(1, 200, Math.abs(my - cy) / (H / 2) * 100));
        } else if (h === 'fadeRot') {
            let deg = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;
            if (deg > 180)  deg -= 360;
            if (deg < -180) deg += 360;
            setInstanceParam(state.instId, base + 'Angle', Math.round(deg));
        } else {
            // fadeV{i}: write the vertex in the fade's rotated local frame (y-down).
            const idx  = parseInt(h.slice(5), 10);
            const rad  = (inst.params[base + 'Angle'] ?? 0) * Math.PI / 180;
            const cosA = Math.cos(rad), sinA = Math.sin(rad);
            const dx = mx - cx, dy = my - cy;
            const lx =  dx * cosA + dy * sinA;
            const ly = -dx * sinA + dy * cosA;
            setInstanceParam(state.instId, base + `V${idx}x`, Math.round(lx / W * 100 * 100) / 100);
            setInstanceParam(state.instId, base + `V${idx}y`, Math.round(ly / H * 100 * 100) / 100);
        }
        return;
    }

    const dragFn = DRAG_FNS[state.mode];
    if (dragFn) {
        dragFn(e, inst, rect);
    } else {
        // Generic center drag for modes with no special drag logic (chroma, corrupted) —
        // grab-offset so it doesn't snap the center under the cursor.
        const W = rect.width, H = rect.height;
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const cx = (0.5 + (inst.params[state.xKey] ?? 0) / 100) * W;
        const cy = (0.5 - (inst.params[state.yKey] ?? 0) / 100) * H;
        const [gx, gy] = applyGrab(cx, cy, mx, my);
        setInstanceParam(state.instId, state.xKey, Math.round(Math.max(-50, Math.min(50,  (gx / W - 0.5) * 100))));
        setInstanceParam(state.instId, state.yKey, Math.round(Math.max(-50, Math.min(50, -(gy / H - 0.5) * 100))));
    }
    // onStackChange fires → draw() called automatically
}

function onUp() {
    const wasClick   = !state.hasDragged;
    const handle     = state.handle;
    const mode       = state.mode;
    const instId     = state.instId;
    const collageTo  = state.collageTarget;

    state.dragging   = false;
    state.handle     = null;
    state.dragAnchor = null;
    state.hasDragged = false;
    state.collageTarget = null;
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

    // Collage: swap the dragged cell with the drop-target cell, then re-render.
    if (mode === 'collage') {
        const from = (typeof handle === 'string' && handle.startsWith('cell:')) ? parseInt(handle.slice(5), 10) : null;
        if (from != null && collageTo != null && collageTo !== from) {
            swapCollageImage(instId, from, collageTo);
            processImageImmediate();
            document.dispatchEvent(new CustomEvent('collage-images-changed', { detail: { instId } }));
        }
    }

    DRAW_FNS[mode]?.(getStack().find(i => i.id === instId)?.params ?? inst.params);
}
