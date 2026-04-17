import {
    canvas, ctx,
    gl, setGl,
    programPreCRT, setProgramPreCRT,
    programCRT, setProgramCRT,
    programWaves, setProgramWaves,
    texture, setTexture,
    framebuffer1, setFramebuffer1,
    framebufferTexture1, setFramebufferTexture1,
    fboA, setFboA, fboTextureA, setFboTextureA,
    fboB, setFboB, fboTextureB, setFboTextureB,
    useWebGL, setUseWebGL,
    useWebGL2, setUseWebGL2,
    webglVersion, setWebglVersion,
    originalImage,
    secondTexture
} from './glstate.js';
import { VERTEX_SHADER_GLSL1, PRE_CRT_SHADER_GLSL1, CRT_SHADER_GLSL1, WAVES_SHADER_GLSL1 } from '../shaders/glsl1.js';
import { params } from '../state/params.js';

export function initWebGL() {
    let _gl = canvas.getContext('webgl2');
    if (_gl) {
        setGl(_gl);
        setUseWebGL2(true);
        setUseWebGL(true);
        setWebglVersion(2);
        console.log('Using WebGL 2');
        updateRenderMode('WebGL 2');
        return initShaders();
    }

    _gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (_gl) {
        setGl(_gl);
        setUseWebGL2(false);
        setUseWebGL(true);
        setWebglVersion(1);
        console.log('Using WebGL 1');
        updateRenderMode('WebGL 1');
        return initShaders();
    }

    console.log('WebGL not available, using Canvas 2D');
    setUseWebGL(false);
    updateRenderMode('Canvas 2D');
    return true;
}

export function updateRenderMode(mode) {
    const el = document.getElementById('renderMode');
    if (el) {
        el.textContent = mode;
        el.style.color = mode === 'Canvas 2D' ? '#e94560' : '#4ecca3';
    }
}

export function createShader(_gl, type, source) {
    const shader = _gl.createShader(type);
    _gl.shaderSource(shader, source);
    _gl.compileShader(shader);

    if (!_gl.getShaderParameter(shader, _gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', _gl.getShaderInfoLog(shader));
        _gl.deleteShader(shader);
        return null;
    }
    return shader;
}

export function createProgram(_gl, vertexShader, fragmentShader) {
    const program = _gl.createProgram();
    _gl.attachShader(program, vertexShader);
    _gl.attachShader(program, fragmentShader);
    _gl.linkProgram(program);

    if (!_gl.getProgramParameter(program, _gl.LINK_STATUS)) {
        console.error('Program link error:', _gl.getProgramInfoLog(program));
        _gl.deleteProgram(program);
        return null;
    }
    return program;
}

function initShaders() {
    const _gl = gl;
    const _webglVersion = webglVersion;
    let vertexSrc, preCRTSrc, crtSrc, wavesSrc;

    if (_webglVersion === 1) {
        vertexSrc = VERTEX_SHADER_GLSL1;
        preCRTSrc = PRE_CRT_SHADER_GLSL1;
        crtSrc = CRT_SHADER_GLSL1;
        wavesSrc = WAVES_SHADER_GLSL1;
    }

    const vertexShader = createShader(_gl, _gl.VERTEX_SHADER, vertexSrc);
    const preCRTShader = createShader(_gl, _gl.FRAGMENT_SHADER, preCRTSrc);
    const crtShader = createShader(_gl, _gl.FRAGMENT_SHADER, crtSrc);
    const wavesShader = createShader(_gl, _gl.FRAGMENT_SHADER, wavesSrc);

    if (!vertexShader || !preCRTShader || !crtShader || !wavesShader) {
        console.error('Shader compilation failed, falling back to Canvas 2D');
        setUseWebGL(false);
        setUseWebGL2(false);
        setGl(null);
        updateRenderMode('Canvas 2D');
        return true;
    }

    setProgramPreCRT(createProgram(_gl, vertexShader, preCRTShader));
    setProgramWaves(createProgram(_gl, vertexShader, wavesShader));
    setProgramCRT(createProgram(_gl, vertexShader, crtShader));

    if (!programPreCRT || !programWaves || !programCRT) {
        console.error('Program linking failed, falling back to Canvas 2D');
        setUseWebGL(false);
        setUseWebGL2(false);
        setGl(null);
        updateRenderMode('Canvas 2D');
        return true;
    }

    return true;
}

export function createFramebuffer(width, height) {
    const _gl = gl;
    if (framebufferTexture1) _gl.deleteTexture(framebufferTexture1);
    if (framebuffer1) _gl.deleteFramebuffer(framebuffer1);

    const fbTex = _gl.createTexture();
    _gl.bindTexture(_gl.TEXTURE_2D, fbTex);
    _gl.texImage2D(_gl.TEXTURE_2D, 0, _gl.RGBA, width, height, 0, _gl.RGBA, _gl.UNSIGNED_BYTE, null);
    _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE);
    _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE);
    _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, _gl.LINEAR);
    _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, _gl.LINEAR);
    setFramebufferTexture1(fbTex);

    const fb = _gl.createFramebuffer();
    _gl.bindFramebuffer(_gl.FRAMEBUFFER, fb);
    _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_2D, fbTex, 0);
    setFramebuffer1(fb);

    _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
}

// Allocate persistent ping-pong FBOs once per image load.
// Pass 1 (preCRT) renders into fboA; Pass 2 (waves) renders into fboB;
// Pass 3 (CRT) renders to the screen — no readPixels, no per-frame alloc.
export function initFramebuffers(width, height) {
    const _gl = gl;

    // Clean up any existing FBOs (e.g. image resize)
    if (fboTextureA) _gl.deleteTexture(fboTextureA);
    if (fboA)        _gl.deleteFramebuffer(fboA);
    if (fboTextureB) _gl.deleteTexture(fboTextureB);
    if (fboB)        _gl.deleteFramebuffer(fboB);

    function makeFBO(setTex, setFb) {
        const tex = _gl.createTexture();
        _gl.bindTexture(_gl.TEXTURE_2D, tex);
        _gl.texImage2D(_gl.TEXTURE_2D, 0, _gl.RGBA, width, height, 0, _gl.RGBA, _gl.UNSIGNED_BYTE, null);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, _gl.LINEAR);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, _gl.LINEAR);
        setTex(tex);

        const fb = _gl.createFramebuffer();
        _gl.bindFramebuffer(_gl.FRAMEBUFFER, fb);
        _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_2D, tex, 0);
        setFb(fb);
    }

    makeFBO(setFboTextureA, setFboA);
    makeFBO(setFboTextureB, setFboB);

    _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
}

export function createTexture(image) {
    const _gl = gl;
    if (texture) _gl.deleteTexture(texture);

    const tex = _gl.createTexture();
    setTexture(tex);
    _gl.bindTexture(_gl.TEXTURE_2D, tex);
    _gl.texImage2D(_gl.TEXTURE_2D, 0, _gl.RGBA, _gl.RGBA, _gl.UNSIGNED_BYTE, image);
    _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE);
    _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE);
    _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, _gl.LINEAR);
    _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, _gl.LINEAR);
}

export function flipPixelsVertically(pixels, width, height) {
    const flipped = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        const srcRow = (height - 1 - y) * width * 4;
        const dstRow = y * width * 4;
        for (let x = 0; x < width * 4; x++) {
            flipped[dstRow + x] = pixels[srcRow + x];
        }
    }
    return flipped;
}

export function renderWebGL() {
    const _gl = gl;
    const w = originalImage.width;
    const h = originalImage.height;

    // Resize canvas only when dimensions actually changed
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
        initFramebuffers(w, h);
    }

    // One quad buffer reused across all three passes
    const positionBuffer = _gl.createBuffer();
    _gl.bindBuffer(_gl.ARRAY_BUFFER, positionBuffer);
    _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 0, 0,
         1, -1, 1, 0,
        -1,  1, 0, 1,
         1,  1, 1, 1
    ]), _gl.STATIC_DRAW);

    _gl.viewport(0, 0, w, h);

    // Bind the standard two-attribute vertex layout (shared by all programs)
    function bindQuadAttribs(prog) {
        const posLoc = _gl.getAttribLocation(prog, 'a_position');
        const texLoc = _gl.getAttribLocation(prog, 'a_texCoord');
        _gl.enableVertexAttribArray(posLoc);
        _gl.vertexAttribPointer(posLoc, 2, _gl.FLOAT, false, 16, 0);
        _gl.enableVertexAttribArray(texLoc);
        _gl.vertexAttribPointer(texLoc, 2, _gl.FLOAT, false, 16, 8);
    }

    // ── Pass 1: preCRT (grain, VHS, etc.) ─→ fboA ──────────────────────
    _gl.useProgram(programPreCRT);
    bindQuadAttribs(programPreCRT);

    _gl.activeTexture(_gl.TEXTURE0);
    _gl.bindTexture(_gl.TEXTURE_2D, texture);
    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_image'), 0);

    _gl.activeTexture(_gl.TEXTURE1);
    _gl.bindTexture(_gl.TEXTURE_2D, secondTexture || texture);
    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_image2'), 1);

    _gl.uniform2f(_gl.getUniformLocation(programPreCRT, 'u_resolution'), w, h);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_time'), performance.now() / 1000);

    const cmMap = { all:1, r:2, g:3, b:4, rg:5, rb:6, gb:7 };
    const bmMap = { screen:1, multiply:2, add:3, overlay:4, difference:5 };
    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_doubleExposureEnabled'), params.doubleExposureEnabled && secondTexture ? 1 : 0);
    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_doubleExposureChannelMode'), cmMap[params.doubleExposureChannelMode] || 1);
    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_doubleExposureBlendMode'), bmMap[params.doubleExposureBlendMode] || 1);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_doubleExposureIntensity'), params.doubleExposureIntensity);
    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_doubleExposureReverse'), params.doubleExposureReverse ? 1 : 0);

    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_basicEnabled'), params.basicEnabled ? 1 : 0);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_brightness'), params.brightness);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_contrast'), params.contrast);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_saturation'), params.saturation);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_highlights'), params.highlights);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_shadows'), params.shadows);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_temperature'), params.temperature);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_tint'), params.tint);

    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_digitizeEnabled'), params.digitizeEnabled ? 1 : 0);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_digitizeDither'), params.digitizeDither);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_digitizeNoise'), params.digitizeNoise);
    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_grainEnabled'), params.grainEnabled ? 1 : 0);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_grainIntensity'), params.grainIntensity);

    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_pixelArtEnabled'), params.pixelArtEnabled ? 1 : 0);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_pixelSize'), params.pixelSize);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_pixelColors'), params.pixelColors);

    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_chromaEnabled'), params.chromaEnabled ? 1 : 0);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_chromaRedX'), params.chromaRedX);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_chromaRedY'), params.chromaRedY);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_chromaGreenX'), params.chromaGreenX);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_chromaGreenY'), params.chromaGreenY);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_chromaBlueX'), params.chromaBlueX);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_chromaBlueY'), params.chromaBlueY);

    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_vignetteEnabled'), params.vignetteEnabled ? 1 : 0);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_vignetteRadius'), params.vignetteRadius);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_vignetteCenterX'), params.vignetteCenterX);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_vignetteCenterY'), params.vignetteCenterY);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_vignetteEdge'), params.vignetteEdge);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_vignetteCenter'), params.vignetteCenter);

    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_invertEnabled'), params.invertEnabled ? 1 : 0);
    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_invertMode'), ['all', 'rc', 'gm', 'by', 'bw'].indexOf(params.invertMode) + 1);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_invertIntensity'), params.invertIntensity);
    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_invertReverse'), params.invertReverse ? 1 : 0);

    _gl.uniform1i(_gl.getUniformLocation(programPreCRT, 'u_vhsEnabled'), params.vhsEnabled ? 1 : 0);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_vhsTracking'), params.vhsTracking);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_vhsBleed'), params.vhsBleed);
    _gl.uniform1f(_gl.getUniformLocation(programPreCRT, 'u_vhsNoise'), params.vhsNoise);

    _gl.bindFramebuffer(_gl.FRAMEBUFFER, fboA);
    _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass 2: waves ─→ fboB  (reads fboTextureA) ─────────────────────
    _gl.useProgram(programWaves);
    bindQuadAttribs(programWaves);

    _gl.activeTexture(_gl.TEXTURE0);
    _gl.bindTexture(_gl.TEXTURE_2D, fboTextureA);
    _gl.uniform1i(_gl.getUniformLocation(programWaves, 'u_image'), 0);
    _gl.uniform2f(_gl.getUniformLocation(programWaves, 'u_resolution'), w, h);
    _gl.uniform1f(_gl.getUniformLocation(programWaves, 'u_time'), performance.now() / 1000);
    _gl.uniform1i(_gl.getUniformLocation(programWaves, 'u_wavesEnabled'), params.wavesEnabled ? 1 : 0);
    _gl.uniform1f(_gl.getUniformLocation(programWaves, 'u_wavesR'), params.wavesR);
    _gl.uniform1f(_gl.getUniformLocation(programWaves, 'u_wavesG'), params.wavesG);
    _gl.uniform1f(_gl.getUniformLocation(programWaves, 'u_wavesB'), params.wavesB);
    _gl.uniform1f(_gl.getUniformLocation(programWaves, 'u_wavesPhase'), params.wavesPhase);

    _gl.bindFramebuffer(_gl.FRAMEBUFFER, fboB);
    _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass 3: CRT ─→ screen  (reads fboTextureB) ─────────────────────
    _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
    _gl.useProgram(programCRT);
    bindQuadAttribs(programCRT);

    _gl.activeTexture(_gl.TEXTURE0);
    _gl.bindTexture(_gl.TEXTURE_2D, fboTextureB);
    _gl.uniform1i(_gl.getUniformLocation(programCRT, 'u_image'), 0);
    _gl.uniform2f(_gl.getUniformLocation(programCRT, 'u_resolution'), w, h);
    _gl.uniform1f(_gl.getUniformLocation(programCRT, 'u_time'), performance.now() / 1000);

    _gl.uniform1i(_gl.getUniformLocation(programCRT, 'u_crtEnabled'), params.crtEnabled ? 1 : 0);
    _gl.uniform1f(_gl.getUniformLocation(programCRT, 'u_crtCurvature'), params.crtCurvature);
    _gl.uniform1f(_gl.getUniformLocation(programCRT, 'u_crtCurvatureRadius'), params.crtCurvatureRadius);
    _gl.uniform1f(_gl.getUniformLocation(programCRT, 'u_crtCurvatureIntensity'), params.crtCurvatureIntensity);
    _gl.uniform1f(_gl.getUniformLocation(programCRT, 'u_crtCurvatureX'), params.crtCurvatureX);
    _gl.uniform1f(_gl.getUniformLocation(programCRT, 'u_crtCurvatureY'), params.crtCurvatureY);
    _gl.uniform1f(_gl.getUniformLocation(programCRT, 'u_crtScanline'), params.crtScanline);
    _gl.uniform1f(_gl.getUniformLocation(programCRT, 'u_crtScanSpacing'), params.crtScanSpacing);
    _gl.uniform1f(_gl.getUniformLocation(programCRT, 'u_crtWaves'), params.crtWaves);
    _gl.uniform1f(_gl.getUniformLocation(programCRT, 'u_crtWavePhase'), params.crtWavePhase);
    _gl.uniform1f(_gl.getUniformLocation(programCRT, 'u_crtStatic'), params.crtStatic);

    let staticType = 0;
    if (params.crtStaticType === 'color') staticType = 1;
    else if (params.crtStaticType === 'luma') staticType = 2;
    _gl.uniform1i(_gl.getUniformLocation(programCRT, 'u_crtStaticType'), staticType);

    _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, 4);

    _gl.deleteBuffer(positionBuffer);
    // VHS timestamp is rendered to the CSS overlay canvas by pipeline.js —
    // no readPixels, no CPU↔GPU roundtrip.
}

