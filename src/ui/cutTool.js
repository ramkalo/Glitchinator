import { getStack, setInstanceParam } from '../state/effectStack.js';
import { saveState } from '../state/undo.js';
import { processImageImmediate } from '../renderer/pipeline.js';
import { showNotification } from '../utils/notifications.js';
import { state } from './overlayState.js';

export const MAX_PASTES = 50;

function _readPastes(p) {
    try { return JSON.parse(p.cutPastes || '[]'); } catch { return []; }
}

// Paste: drop a new copy at the image center; it becomes the active (selected) copy.
export function addPaste(pasteInstId) {
    const inst = getStack().find(i => i.id === pasteInstId);
    if (!inst) return;
    const pastes = _readPastes(inst.params);
    if (pastes.length >= MAX_PASTES) { showNotification(`Max ${MAX_PASTES} copies per Cut Out`); return; }
    saveState();
    pastes.push({ x: 0, y: 0, scale: 100, rot: 0 });
    state.cutActive = pastes.length - 1;
    setInstanceParam(pasteInstId, 'cutPastes', JSON.stringify(pastes));
    processImageImmediate();
}

// Delete the currently selected copy.
export function deleteActivePaste(pasteInstId) {
    const inst = getStack().find(i => i.id === pasteInstId);
    if (!inst) return;
    const pastes = _readPastes(inst.params);
    const idx = state.cutActive;
    if (idx == null || idx < 0 || idx >= pastes.length) return;
    saveState();
    pastes.splice(idx, 1);
    state.cutActive = Math.min(idx, pastes.length - 1);
    setInstanceParam(pasteInstId, 'cutPastes', JSON.stringify(pastes));
    processImageImmediate();
}
