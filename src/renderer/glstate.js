// Canvas and 2D context
export const canvas = document.getElementById('mainCanvas');
export const ctx = canvas.getContext('2d', { willReadFrequently: true });

// WebGL state
export let gl = null;
export let programPreCRT = null;
export let programCRT = null;
export let programWaves = null;
export let texture = null;
export let framebuffer1 = null;
export let framebufferTexture1 = null;

// Renderer flags
export let useWebGL = false;
export let useWebGL2 = false;
export let webglVersion = 0;

// Image state
export let originalImage = null;
export let secondImage = null;
export let secondTexture = null;
export let secondImagePixels = null;

// Persistent ping-pong framebuffers (Phase 4 — no per-frame allocation)
export let fboA = null;
export let fboTextureA = null;
export let fboB = null;
export let fboTextureB = null;

// Processing state
export let isProcessing = false;
export let debounceTimer = null;

// Setters (ES modules can't reassign imported let bindings from outside)
export function setGl(v) { gl = v; }
export function setProgramPreCRT(v) { programPreCRT = v; }
export function setProgramCRT(v) { programCRT = v; }
export function setProgramWaves(v) { programWaves = v; }
export function setTexture(v) { texture = v; }
export function setFramebuffer1(v) { framebuffer1 = v; }
export function setFramebufferTexture1(v) { framebufferTexture1 = v; }
export function setUseWebGL(v) { useWebGL = v; }
export function setUseWebGL2(v) { useWebGL2 = v; }
export function setWebglVersion(v) { webglVersion = v; }
export function setOriginalImage(v) { originalImage = v; }
export function setSecondImage(v) { secondImage = v; }
export function setSecondTexture(v) { secondTexture = v; }
export function setSecondImagePixels(v) { secondImagePixels = v; }
export function setFboA(v) { fboA = v; }
export function setFboTextureA(v) { fboTextureA = v; }
export function setFboB(v) { fboB = v; }
export function setFboTextureB(v) { fboTextureB = v; }
export function setIsProcessing(v) { isProcessing = v; }
export function setDebounceTimer(v) { debounceTimer = v; }
