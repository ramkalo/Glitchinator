import {
    canvas, gl,
    originalImage,
    fboPool, programCache, quadVAO, quadVBO,
    overlayCanvas, overlayCtx,
    setFboPool, setSecondTexture,
} from './glstate.js';
import { getEffect } from '../effects/registry.js';
import { isCropPreviewActive } from '../state/cropPreview.js';
import { buildBlendControl, buildFadeControl } from '../effects/controls/index.js';
import { clearAllCutCaptures } from '../effects/cutCapture.js';

// Coordinate system: UNPACK_FLIP_Y_WEBGL=true on image uploads, no Y flip in vertex shader.
// vUV = (0,0) at screen/image bottom-left, (1,1) at screen/image top-right.
// For row-from-top: float row = (1.0 - vUV.y) * uResolution.y

// --- GLSL sources ---

// aCorner comes from quadVBO (glstate.js): 4 corners in [0,1]×[0,1], TRIANGLE_STRIP order.
// Using a real attribute at location 0 (rather than gl_VertexID) keeps attrib 0's array
// enabled, avoiding desktop-GL fake-attrib-0 emulation and its per-draw console warning.
const VERT_SRC = `#version 300 es
layout(location = 0) in vec2 aCorner;
out vec2 vUV;
void main() {
    gl_Position = vec4(aCorner * 2.0 - 1.0, 0.0, 1.0);
    vUV = aCorner;
}`;

// Prepended to every fragment shader source
export const FRAG_HEADER = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uResolution;
uniform vec2 uTexelSize;
`;

const PASSTHROUGH_FRAG = `void main() { fragColor = texture(uTex, vUV); }`;

// --- Texture helpers ---

export function createTexture(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
}

// Upload an HTMLImageElement, HTMLCanvasElement, etc. to a new texture.
export function uploadToTexture(source) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
}

function createFBO(w, h) {
    const tex = createTexture(w, h);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, width: w, height: h };
}

function destroyFBO(fb) {
    if (!fb) return;
    gl.deleteTexture(fb.tex);
    gl.deleteFramebuffer(fb.fbo);
}

function reallocFBOs(w, h) {
    destroyFBO(fboPool[0]);
    destroyFBO(fboPool[1]);
    setFboPool([createFBO(w, h), createFBO(w, h)]);
}

// --- Shader/program helpers ---

function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
    }
    return s;
}

export function getProgram(fragSrc) {
    if (programCache.has(fragSrc)) return programCache.get(fragSrc);
    const vert = compileShader(gl.VERTEX_SHADER, VERT_SRC);
    const frag = compileShader(gl.FRAGMENT_SHADER, FRAG_HEADER + fragSrc);
    if (!vert || !frag) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(prog));
        return null;
    }
    // Cache all uniform locations up front — never call getUniformLocation per frame
    prog._locs = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(prog, i);
        if (info) prog._locs[info.name] = gl.getUniformLocation(prog, info.name);
    }
    programCache.set(fragSrc, prog);
    return prog;
}

// --- Draw helpers ---

function setStdUniforms(prog, w, h) {
    if (prog._locs.uResolution != null) gl.uniform2f(prog._locs.uResolution, w, h);
    if (prog._locs.uTexelSize  != null) gl.uniform2f(prog._locs.uTexelSize, 1 / w, 1 / h);
}

function bindTex0(prog, tex) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (prog._locs.uTex != null) gl.uniform1i(prog._locs.uTex, 0);
}

function autoBindUniforms(prog, effect, params) {
    for (const key of (effect.paramKeys || [])) {
        const loc = prog._locs[key];
        if (loc == null) continue;
        const val = params[key];
        if (typeof val === 'number')       gl.uniform1f(loc, val);
        else if (typeof val === 'boolean') gl.uniform1i(loc, val ? 1 : 0);
        // string params handled by effect.bindUniforms
    }
}

function drawQuad() {
    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
}

// Render fragSrc into dstFbo (or the default framebuffer when dstFbo is null).
function runPass(fragSrc, srcTex, dstFbo, effect, params) {
    const prog = getProgram(fragSrc);
    if (!prog) return false;

    const dstW = dstFbo ? dstFbo.width  : canvas.width;
    const dstH = dstFbo ? dstFbo.height : canvas.height;

    if (dstFbo) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo.fbo);
        gl.viewport(0, 0, dstW, dstH);
    } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, dstW, dstH);
    }

    gl.useProgram(prog);
    bindTex0(prog, srcTex);
    setStdUniforms(prog, dstW, dstH);

    if (effect) {
        autoBindUniforms(prog, effect, params);
        if (effect.bindUniforms) effect.bindUniforms(gl, prog, params, dstW, dstH, srcTex, _origTex);
    }
    drawQuad();
    return true;
}

// --- Original-image texture ---
let _origTex = null;
let _lastOriginalImage = null;

// --- Overlay texture cache ---
let _overlayTex  = null;
let _overlayTexW = 0;
let _overlayTexH = 0;

function _getOverlayTex() {
    const w = overlayCanvas.width, h = overlayCanvas.height;
    if (!_overlayTex || _overlayTexW !== w || _overlayTexH !== h) {
        if (_overlayTex) gl.deleteTexture(_overlayTex);
        _overlayTex  = createTexture(w, h);
        _overlayTexW = w;
        _overlayTexH = h;
    }
    gl.bindTexture(gl.TEXTURE_2D, _overlayTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, overlayCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return _overlayTex;
}

// --- Sticker texture cache (canvas2d blend compositor) ---
let _stickerTex  = null;
let _stickerTexW = 0;
let _stickerTexH = 0;

function _uploadStickerTex(stickerCanvas) {
    const w = stickerCanvas.width, h = stickerCanvas.height;
    if (!_stickerTex || _stickerTexW !== w || _stickerTexH !== h) {
        if (_stickerTex) gl.deleteTexture(_stickerTex);
        _stickerTex  = createTexture(w, h);
        _stickerTexW = w;
        _stickerTexH = h;
    }
    gl.bindTexture(gl.TEXTURE_2D, _stickerTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, stickerCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return _stickerTex;
}

// --- Reveal mask texture cache (e.g. viewport text mode) ---
let _maskTex  = null;
let _maskTexW = 0;
let _maskTexH = 0;

function _uploadMaskTex(maskCanvas) {
    const w = maskCanvas.width, h = maskCanvas.height;
    if (!_maskTex || _maskTexW !== w || _maskTexH !== h) {
        if (_maskTex) gl.deleteTexture(_maskTex);
        _maskTex  = createTexture(w, h);
        _maskTexW = w;
        _maskTexH = h;
    }
    gl.bindTexture(gl.TEXTURE_2D, _maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return _maskTex;
}

// Caches of blend/fade controls keyed by prefix, built on first use
const _blendControlCache = new Map();
const _fadeControlCache  = new Map();
function _getBlendControl(prefix) {
    if (!_blendControlCache.has(prefix)) _blendControlCache.set(prefix, buildBlendControl(prefix));
    return _blendControlCache.get(prefix);
}
function _getFadeControl(prefix) {
    if (!_fadeControlCache.has(prefix)) _fadeControlCache.set(prefix, buildFadeControl(prefix));
    return _fadeControlCache.get(prefix);
}

function _buildCanvas2DCompositorGLSL(blend, fade) {
    return `uniform sampler2D uStickerTex;

${blend.glsl}
${fade ? fade.glsl : ''}

void main() {
    vec4 c   = texture(uTex, vUV);
    vec4 src = texture(uStickerTex, vUV);
    if (src.a < 0.001) { fragColor = c; return; }
    if (!${blend.thresholdFn}(c, src)) { fragColor = c; return; }
    vec3 blended = ${blend.blendFn}(c.rgb, src.rgb);
    float weight = ${fade ? `${fade.fnName}()` : '1.0'};
    fragColor = vec4(mix(c.rgb, blended, src.a * weight), c.a);
}`;
}

// --- Transform FBO cache ---
let _transformFBO = null;

// --- Internal double-exposure capture FBOs ---
let _internalCaptureFBOs = new Map(); // instId → FBO

// Show the unprocessed original image (used by long-press compare in touch.js).
export function blitOriginalToScreen() {
    if (!_origTex) return;
    runPass(PASSTHROUGH_FRAG, _origTex, null, null, null);
}

// --- Shared effect loop ---

// Run a slice of the stack, starting from startTex. Returns the resulting srcTex
// (pointing into fboPool). Does NOT blit to screen. Skips 'reveal' pass effects.
function _runLinear(stack, startTex, inheritedPalette = null, internalTextures = null, revealCtx = null) {
    let srcTex = startTex;
    let pingIdx = 0;
    let activePalette = inheritedPalette;

    for (let i = 0; i < stack.length; i++) {
        const instance = stack[i];
        const effect = getEffect(instance.effectName);

        // Snapshot the current pipeline state at any melt-point/entry marker that an enabled
        // reveal effect downstream uses as its "window" source. Markers are otherwise disabled
        // (enabled() === false) so this must run before the enabled check below.
        if (revealCtx && effect?.isMarker && revealCtx.neededMarkerIds.has(instance.id)) {
            const snap = createFBO(fboPool[0].width, fboPool[0].height);
            runPass(PASSTHROUGH_FRAG, srcTex, snap, null, null);
            revealCtx.snapshots.set(instance.id, snap);
            continue;
        }

        // Track the most recent enabled color palette effect for downstream effects
        if (instance.effectName === 'colorPalette' && instance.params.paletteEnabled) {
            activePalette = Array.from({ length: 8 }, (_, j) => instance.params[`palette${j}`]);
        }

        // Merge palette and internal DE texture into render params without mutating instance.params.
        // Always carry the instance id so context effects can look up per-instance side data
        // (e.g. the collage tool's session image map). _instanceId is ignored by uniform binding.
        const internalTex = internalTextures?.get(instance.id)?.tex ?? null;
        const renderParams = { ...instance.params, _instanceId: instance.id };
        if (activePalette) renderParams._activePalette = activePalette;
        if (internalTex) renderParams._internalSecondTex = internalTex;

        if (!effect || !effect.enabled(renderParams)) continue;

        // Reveal effects (viewport, filmSoup) composite inline: outside = current state,
        // window = the snapshot captured at this effect's entry marker. Using per-effect
        // snapshots lets multiple reveals overlap/nest and compose onto each other.
        if (effect.kind === 'reveal') {
            if (!revealCtx) continue;
            const rc = effect.reveal;
            const entryId   = rc ? renderParams[rc.entryIdKey] : null;
            const windowTex = (entryId && revealCtx.snapshots.get(entryId)?.tex) || srcTex;
            const dstFbo = fboPool[pingIdx % 2];
            _runRevealComposite(instance, effect, srcTex, windowTex, dstFbo);
            srcTex = dstFbo.tex;
            pingIdx++;
            continue;
        }

        if (effect.kind === 'transform') {
            // In crop-preview mode keep the canvas at full image size
            if (instance.effectName === 'crop' && isCropPreviewActive()) continue;
            if (!effect.glsl) continue;

            const curW = fboPool[0]?.width  || canvas.width;
            const curH = fboPool[0]?.height || canvas.height;
            const outDims = effect.getOutputDimensions
                ? effect.getOutputDimensions(renderParams, curW, curH)
                : { w: curW, h: curH };

            const needResize = outDims.w !== curW || outDims.h !== curH;

            const prog = getProgram(effect.glsl);
            if (!prog) continue;

            if (!_transformFBO || _transformFBO.width !== outDims.w || _transformFBO.height !== outDims.h) {
                destroyFBO(_transformFBO);
                _transformFBO = createFBO(outDims.w, outDims.h);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, _transformFBO.fbo);
            gl.viewport(0, 0, outDims.w, outDims.h);
            gl.useProgram(prog);
            bindTex0(prog, srcTex);
            setStdUniforms(prog, outDims.w, outDims.h);
            autoBindUniforms(prog, effect, renderParams);
            if (effect.bindUniforms) effect.bindUniforms(gl, prog, renderParams, curW, curH);
            drawQuad();

            if (needResize) {
                reallocFBOs(outDims.w, outDims.h);
                canvas.width  = outDims.w;
                canvas.height = outDims.h;
            }

            const poolDst = fboPool[pingIdx % 2];
            runPass(PASSTHROUGH_FRAG, _transformFBO.tex, poolDst, null, null);

            srcTex = poolDst.tex;
            pingIdx++;
            continue;
        }

        if (effect.kind === 'context') {
            if (!overlayCanvas || !overlayCtx || !effect.canvas2d) continue;

            // Blit current state to canvas so canvas2d effects can read pixels via srcCanvas.
            // Keep overlayCanvas in sync with the current canvas size — transform passes
            // (e.g. crop) may have resized the canvas since processWebGLStack set it to
            // the full image size. If sizes differ, the blit into the pool FBO maps the
            // entire overlayCanvas texture over a smaller target, producing a stretched image.
            runPass(PASSTHROUGH_FRAG, srcTex, null, null, null);
            if (overlayCanvas.width !== canvas.width || overlayCanvas.height !== canvas.height) {
                overlayCanvas.width  = canvas.width;
                overlayCanvas.height = canvas.height;
            }

            const dstFbo = fboPool[pingIdx % 2];

            if (effect.blendPrefix) {
                // Render effect onto a transparent sticker canvas, then blend onto pipeline via WebGL.
                // Blit current pipeline state to overlayCanvas so canvas2d effects can read source pixels.
                overlayCtx.clearRect(0, 0, canvas.width, canvas.height);
                overlayCtx.drawImage(canvas, 0, 0);
                const stickerCanvas = new OffscreenCanvas(canvas.width, canvas.height);
                effect.canvas2d(stickerCanvas.getContext('2d'), renderParams, overlayCanvas);

                const stickerTex = _uploadStickerTex(stickerCanvas);
                const blend      = _getBlendControl(effect.blendPrefix);
                const fade       = _getFadeControl(effect.blendPrefix);
                const prog       = getProgram(_buildCanvas2DCompositorGLSL(blend, fade));
                if (prog) {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo.fbo);
                    gl.viewport(0, 0, dstFbo.width, dstFbo.height);
                    gl.useProgram(prog);
                    bindTex0(prog, srcTex);
                    setStdUniforms(prog, dstFbo.width, dstFbo.height);
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, stickerTex);
                    if (prog._locs.uStickerTex != null) gl.uniform1i(prog._locs.uStickerTex, 1);
                    gl.activeTexture(gl.TEXTURE0);
                    autoBindUniforms(prog, effect, renderParams);
                    if (effect.bindUniforms) effect.bindUniforms(gl, prog, renderParams, dstFbo.width, dstFbo.height);
                    drawQuad();
                }
            } else {
                // Legacy path: draw directly onto overlayCanvas (for canvas2d effects without blend controls).
                overlayCtx.clearRect(0, 0, canvas.width, canvas.height);
                overlayCtx.drawImage(canvas, 0, 0);
                effect.canvas2d(overlayCtx, renderParams);
                runPass(PASSTHROUGH_FRAG, _getOverlayTex(), dstFbo, null, null);
            }

            srcTex = dstFbo.tex;
            pingIdx++;
            continue;
        }

        if (effect.glslPasses) {
            const passList = typeof effect.glslPasses === 'function'
                ? effect.glslPasses(renderParams)
                : effect.glslPasses;

            // If any pass needs the pre-effect input via uTexOriginal, copy srcTex
            // into a dedicated temp FBO first. The ping-pong passes only have 2 slots
            // and will overwrite whichever pool FBO srcTex came from, corrupting it.
            const needsCopy = passList.some(p => p.needsOriginal);
            let prePassesFBO = null;
            let prePasses = srcTex;
            if (needsCopy) {
                prePassesFBO = createFBO(fboPool[0].width, fboPool[0].height);
                runPass(PASSTHROUGH_FRAG, srcTex, prePassesFBO, null, null);
                prePasses = prePassesFBO.tex;
            }

            let passSrc = srcTex;
            let lastFbo = null;

            for (const pass of passList) {
                const dstFbo = fboPool[pingIdx % 2];
                const prog = getProgram(pass.glsl);
                if (!prog) { pingIdx++; continue; }

                gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo.fbo);
                gl.viewport(0, 0, dstFbo.width, dstFbo.height);
                gl.useProgram(prog);
                bindTex0(prog, passSrc);
                setStdUniforms(prog, dstFbo.width, dstFbo.height);
                autoBindUniforms(prog, effect, renderParams);
                if (effect.bindUniforms) effect.bindUniforms(gl, prog, renderParams, dstFbo.width, dstFbo.height, passSrc);

                if (pass.needsOriginal && prog._locs.uTexOriginal != null) {
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, prePasses);
                    gl.uniform1i(prog._locs.uTexOriginal, 1);
                }
                drawQuad();

                passSrc = dstFbo.tex;
                lastFbo = dstFbo;
                pingIdx++;
            }

            if (prePassesFBO) destroyFBO(prePassesFBO);
            if (lastFbo) srcTex = lastFbo.tex;
            continue;
        }

        if (!effect.glsl) continue;

        const dstFbo = fboPool[pingIdx % 2];
        if (!runPass(effect.glsl, srcTex, dstFbo, effect, renderParams)) continue;

        srcTex = dstFbo.tex;
        pingIdx++;
    }

    return { tex: srcTex, palette: activePalette };
}

function _runRevealComposite(vpInst, effect, fullTex, windowTex, targetFbo = null) {
    const params = vpInst.params;
    const w = canvas.width, h = canvas.height;
    const prog = getProgram(effect.glsl);
    if (!prog) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo ? targetFbo.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    bindTex0(prog, fullTex);       // uTex = outside (full result)
    setStdUniforms(prog, w, h);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, windowTex);
    if (prog._locs['uTexWindow'] != null) gl.uniform1i(prog._locs['uTexWindow'], 1);
    gl.activeTexture(gl.TEXTURE0);

    autoBindUniforms(prog, effect, params);
    if (effect.bindUniforms) effect.bindUniforms(gl, prog, params, w, h);

    // Optional mask texture (e.g. viewport text mode): an offscreen canvas the
    // shader samples for the "inside" test. Bind on unit 3 — units 0/1/2 are taken
    // by uTex / uTexWindow / the blend control's uBlendMapTex. Done AFTER
    // effect.bindUniforms so the blend control (which also touches unit 2) can't
    // clobber the mask binding.
    const maskCanvas = effect.revealMask ? effect.revealMask(params, w, h) : null;
    if (maskCanvas) {
        const maskTex = _uploadMaskTex(maskCanvas);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, maskTex);
        if (prog._locs['uTexMask'] != null) gl.uniform1i(prog._locs['uTexMask'], 3);
        gl.activeTexture(gl.TEXTURE0);
    }
    drawQuad();
}

function _precomputeInternalTextures(stack) {
    for (const fbo of _internalCaptureFBOs.values()) destroyFBO(fbo);
    _internalCaptureFBOs.clear();
    if (!fboPool[0]) return;

    for (const inst of stack) {
        if (inst.effectName !== 'doubleExposure') continue;
        if (inst.params.doubleExposureMode !== 'internal') continue;
        if (!inst.params.doubleExposureEnabled) continue;
        const entryId = inst.params.doubleExposureEntryId;
        if (!entryId) continue;
        const entryIdx = stack.findIndex(s => s.id === entryId);
        if (entryIdx === -1) continue;

        const { tex } = _runLinear(stack.slice(0, entryIdx), _origTex);
        const capFBO = createFBO(fboPool[0].width, fboPool[0].height);
        runPass(PASSTHROUGH_FRAG, tex, capFBO, null, null);
        _internalCaptureFBOs.set(inst.id, capFBO);
    }

    // Reset canvas + FBOs to original image size so the main pass starts clean
    const w = originalImage.width, h = originalImage.height;
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
    }
    if (fboPool[0].width !== w || fboPool[0].height !== h) reallocFBOs(w, h);
}

function _runEffects(stack) {
    // Fresh capture registry each frame so a Paste is only fed by a Cut that ran earlier in the
    // pass (enforces Cut-above-Paste, blocks feedback). Cut layers repopulate during the walk.
    clearAllCutCaptures();
    _precomputeInternalTextures(stack);

    // Which markers must be snapshotted = the entry markers of enabled reveal effects
    // (viewport, filmSoup). Each reveal declares { enabledKey, entryIdKey } via effect.reveal.
    const neededMarkerIds = new Set();
    for (const inst of stack) {
        const rc = getEffect(inst.effectName)?.reveal;
        if (rc && inst.params[rc.enabledKey]) {
            const id = inst.params[rc.entryIdKey];
            if (id) neededMarkerIds.add(id);
        }
    }
    const snapshots = new Map();
    const revealCtx = neededMarkerIds.size ? { neededMarkerIds, snapshots } : null;

    // Single linear walk of the stack in user order: reveal effects composite inline against
    // their entry snapshot, so multiple film soups / viewports can overlap and compose.
    const { tex: srcTex } = _runLinear(stack, _origTex, null, _internalCaptureFBOs, revealCtx);
    runPass(PASSTHROUGH_FRAG, srcTex, null, null, null);

    for (const fbo of snapshots.values()) destroyFBO(fbo);
    if (overlayCanvas && overlayCtx) overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

// --- Main pipeline ---

export function processWebGLStack(stack) {
    if (overlayCanvas && overlayCtx) overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const w = originalImage.width;
    const h = originalImage.height;

    if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
    }

    if (!fboPool[0] || fboPool[0].width !== w || fboPool[0].height !== h) reallocFBOs(w, h);

    if (overlayCanvas && (overlayCanvas.width !== w || overlayCanvas.height !== h)) {
        overlayCanvas.width  = w;
        overlayCanvas.height = h;
    }

    if (originalImage !== _lastOriginalImage) {
        if (_origTex) gl.deleteTexture(_origTex);
        _origTex = uploadToTexture(originalImage);
        _lastOriginalImage = originalImage;
    }

    _runEffects(stack);
}

// --- Pixel sampling ---

// Render the stack up to (but not including) the given instance, read back pixels.
// Used by the palette "Build From Image" feature.
export function getPixelsBeforeInstance(stack, instId) {
    if (!_origTex || !fboPool[0]) return null;
    const idx = stack.findIndex(inst => inst.id === instId);
    if (idx === -1) return null;
    const preStack = stack.slice(0, idx);

    // Reset the shared canvas + fboPool to the original image size BEFORE sampling, exactly
    // as processWebGLStack does. _runLinear computes each transform's output from the current
    // fboPool size; without this it would feed crop (whose output is proportional to its
    // input) the already-cropped size from the last render, double-cropping the sample.
    const rw = originalImage.width, rh = originalImage.height;
    if (canvas.width !== rw || canvas.height !== rh) {
        canvas.width  = rw;
        canvas.height = rh;
        gl.viewport(0, 0, rw, rh);
    }
    if (fboPool[0].width !== rw || fboPool[0].height !== rh) reallocFBOs(rw, rh);

    const { tex: srcTex } = _runLinear(preStack, _origTex);

    const w = fboPool[0].width;
    const h = fboPool[0].height;
    const tempFBO = createFBO(w, h);
    runPass(PASSTHROUGH_FRAG, srcTex, tempFBO, null, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO.fbo);
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    destroyFBO(tempFBO);

    // Sampling above resized/cleared the shared canvas + fboPool, so repaint the live preview
    // by re-running the full stack. processWebGLStack does a full reset + render + screen blit
    // and does NOT fire onStackChange, so there's no re-entrancy. The pixels/w/h returned were
    // captured before this, so the sample is unaffected.
    processWebGLStack(stack);

    return { pixels, width: w, height: h };
}

// --- Export pipeline ---
// Renders at full image resolution to canvas before toBlob() capture.

export function renderForExport(stack) {
    const w = originalImage.width;
    const h = originalImage.height;

    if (overlayCanvas && overlayCtx) overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Resize to full image dims if canvas is currently at a different size
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);

        if (_origTex) gl.deleteTexture(_origTex);
        _origTex = uploadToTexture(originalImage);

        if (!fboPool[0] || fboPool[0].width !== w || fboPool[0].height !== h) reallocFBOs(w, h);

        if (overlayCanvas) {
            overlayCanvas.width  = w;
            overlayCanvas.height = h;
        }

        _lastOriginalImage = null; // force preview to re-setup after export
    }

    _runEffects(stack);
}

export function cleanupWebGL() {
    fboPool.forEach(f => destroyFBO(f));
    setFboPool([null, null]);
    destroyFBO(_transformFBO); _transformFBO = null;
    for (const fbo of _internalCaptureFBOs.values()) destroyFBO(fbo);
    _internalCaptureFBOs.clear();
    if (_origTex)    { gl.deleteTexture(_origTex);    _origTex    = null; }
    if (_overlayTex) { gl.deleteTexture(_overlayTex); _overlayTex = null; }
    if (_stickerTex) { gl.deleteTexture(_stickerTex); _stickerTex = null; }
    _blendControlCache.clear();
    _fadeControlCache.clear();
    setSecondTexture(null);
    programCache.forEach(prog => gl.deleteProgram(prog));
    programCache.clear();
    gl.deleteVertexArray(quadVAO);
    if (quadVBO) gl.deleteBuffer(quadVBO);
}
