export const canvas = document.getElementById('mainCanvas');

export let gl = null;
export let secondTexture = null;
export let fboPool = [null, null]; // [{ fbo, tex, width, height }, ...]
export let programCache = new Map(); // fragSrc → WebGLProgram (with ._locs)
export let quadVAO = null;

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
