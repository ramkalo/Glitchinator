export const canvas = document.getElementById('mainCanvas');

export let gl = null;
export let secondTexture = null;
export let fboPool = [null, null]; // [{ fbo, tex, width, height }, ...]
export let programCache = new Map(); // fragSrc → WebGLProgram (with ._locs)
export let quadVAO = null;
export let quadVBO = null; // quad-corner buffer bound to attrib 0 (see init) — keeps an
                           // always-used attribute at location 0 to avoid the desktop-GL
                           // "vertex attrib 0 array not enabled" emulation warning

export let overlayCanvas = document.getElementById('overlayCanvas');
export let overlayCtx = null;

export let originalImage = null;
export let originalFileBytes = null; // raw bytes of the uploaded file (for metadata readback)
export let secondImage   = null;
export let blendMapImage = null;
export let blendMapTexture = null;
export let glassMapImage = null;
export let glassMapTexture = null;

export let blendMapPosX = 0;
export let blendMapPosY = 0;
export let blendMapRot  = 0;
export let blendMapZoom = 100;

function init() {
    const ctx = canvas.getContext('webgl2', { preserveDrawingBuffer: true, alpha: false });
    if (!ctx) throw new Error('WebGL2 is required. Please use Chrome, Firefox, or Edge.');
    gl = ctx;
    quadVAO = gl.createVertexArray();

    // Drive the full-screen quad from a real attribute at location 0. Sourcing the quad
    // purely from gl_VertexID leaves attrib 0's array disabled, which forces slow "fake
    // vertex attrib 0" emulation on desktop GL (Mac) and logs a warning on every draw.
    // Corners are in [0,1] × [0,1]; the vertex shader maps them to clip space and to vUV,
    // matching TRIANGLE_STRIP order for drawArrays(…, 0, 4).
    gl.bindVertexArray(quadVAO);
    quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    if (overlayCanvas) overlayCtx = overlayCanvas.getContext('2d');
}
init();

export function setOriginalImage(v)    { originalImage = v; }
export function setOriginalFileBytes(v) { originalFileBytes = v; }
export function setSecondImage(v)      { secondImage = v; }
export function setSecondTexture(v)    { if (secondTexture && gl) gl.deleteTexture(secondTexture); secondTexture = v; }
export function setBlendMapImage(v)    { blendMapImage = v; }
export function setBlendMapTexture(v)  { if (blendMapTexture && gl) gl.deleteTexture(blendMapTexture); blendMapTexture = v; }
export function setGlassMapImage(v)    { glassMapImage = v; }
export function setGlassMapTexture(v)  { if (glassMapTexture && gl) gl.deleteTexture(glassMapTexture); glassMapTexture = v; }
export function setBlendMapPosX(v)     { blendMapPosX = v; }
export function setBlendMapPosY(v)     { blendMapPosY = v; }
export function setBlendMapRot(v)      { blendMapRot  = v; }
export function setBlendMapZoom(v)     { blendMapZoom = v; }
export function setFboPool(v)          { fboPool = v; }
