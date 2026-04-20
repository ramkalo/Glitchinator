// Canvas and 2D context
export const canvas = document.getElementById('mainCanvas');
export const ctx = canvas.getContext('2d', { willReadFrequently: true });

// Image state
export let originalImage = null;
export let secondImage = null;
export let secondImagePixels = null;

// Processing state
export let isProcessing = false;
export let debounceTimer = null;

// Setters (ES modules can't reassign imported let bindings from outside)
export function setOriginalImage(v) { originalImage = v; }
export function setSecondImage(v) { secondImage = v; }
export function setSecondImagePixels(v) { secondImagePixels = v; }
export function setIsProcessing(v) { isProcessing = v; }
export function setDebounceTimer(v) { debounceTimer = v; }