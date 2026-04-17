import { snapshotParams, restoreParams } from './params.js';

// Params-snapshot stacks — much lighter than pixel buffers, and works
// correctly with both WebGL and Canvas 2D (old imageData approach was
// broken for WebGL because readPixels is asynchronous).
let _undoStack = [];
let _redoStack = [];

/**
 * Save the current params state onto the undo stack.
 * Call this before any operation the user should be able to undo
 * (preset load, reset, etc.). Slider drags auto-save via the proxy.
 */
export function saveState() {
    _undoStack.push(snapshotParams());
    if (_undoStack.length > 50) _undoStack.shift();
    _redoStack = [];
    updateUndoButtons();
}

/**
 * Undo the last param change.
 * @param {Function} syncDOM  - syncDOMFromParams() from ui/controls.js,
 *                              passed in to avoid circular imports.
 */
export function undo(syncDOM) {
    if (_undoStack.length === 0) return;
    _redoStack.push(snapshotParams());
    restoreParams(_undoStack.pop());
    syncDOM();
    updateUndoButtons();
}

/**
 * Redo the last undone param change.
 * @param {Function} syncDOM  - syncDOMFromParams() from ui/controls.js
 */
export function redo(syncDOM) {
    if (_redoStack.length === 0) return;
    _undoStack.push(snapshotParams());
    restoreParams(_redoStack.pop());
    syncDOM();
    updateUndoButtons();
}

export function updateUndoButtons() {
    document.getElementById('undoBtn').disabled = _undoStack.length === 0;
    document.getElementById('redoBtn').disabled = _redoStack.length === 0;
    document.getElementById('undoBtnMobile').disabled = _undoStack.length === 0;
    document.getElementById('redoBtnMobile').disabled = _redoStack.length === 0;
}
