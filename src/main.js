import { params } from './state/params.js';
import { undo, redo } from './state/undo.js';
import { showNotification } from './utils/notifications.js';
import { canvas } from './renderer/glstate.js';
import { processImage } from './renderer/pipeline.js';
import { loadImage, loadSecondImage } from './utils/image.js';
import { exportImage } from './ui/export.js';
import { savePreset, loadPreset, renderPresetList, importPreset } from './ui/presets.js';
import { initMobileUI } from './ui/mobile.js';
import { initBottomSheet } from './ui/bottomsheet.js';
import { initTouchGestures } from './ui/touch.js';
import { initStackPanel, renderStackList } from './ui/stackPanel.js';
import { buildControlsPanel } from './ui/stackControls.js';

// ---------------------------------------------------------------------------
// Stack UI rebuild — called whenever stack changes (add/remove/reorder/undo)
// ---------------------------------------------------------------------------

function rebuildStackUI() {
    renderStackList();
    buildControlsPanel();
}

// ---------------------------------------------------------------------------
// File inputs
// ---------------------------------------------------------------------------

document.getElementById('fileInput').addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        loadImage(e.target.files[0]);
    }
});

document.getElementById('secondFileInput').addEventListener('change', function(e) {
    if (e.target.files[0]) {
        loadSecondImage(e.target.files[0]);
        const nameEl = document.getElementById('secondImageName');
        if (nameEl) nameEl.textContent = e.target.files[0].name;
    }
});

document.getElementById('loadBtn').addEventListener('click', function() {
    document.getElementById('fileInput').click();
});

document.getElementById('exportBtn').addEventListener('click', function() {
    document.getElementById('exportModal').classList.remove('hidden');
});

document.getElementById('confirmExportBtn').addEventListener('click', function() {
    const format = document.querySelector('input[name="exportFormat"]:checked').value;
    document.getElementById('exportModal').classList.add('hidden');
    exportImage(format);
});

document.getElementById('cancelExportBtn').addEventListener('click', function() {
    document.getElementById('exportModal').classList.add('hidden');
});

document.getElementById('closeExportPreviewBtn').addEventListener('click', function() {
    const modal = document.getElementById('exportPreviewModal');
    if (modal.dataset.objectUrl) URL.revokeObjectURL(modal.dataset.objectUrl);
    document.getElementById('exportPreviewImg').src = '';
    modal.classList.add('hidden');
    showNotification('Export complete');
});

// ---------------------------------------------------------------------------
// Mobile toolbar
// ---------------------------------------------------------------------------

document.getElementById('loadBtnMobile').addEventListener('click', function() {
    document.getElementById('fileInput').click();
});

document.getElementById('exportBtnMobile').addEventListener('click', function() {
    document.getElementById('exportModal').classList.remove('hidden');
});

document.getElementById('undoBtnMobile').addEventListener('click', function() {
    undo(noop, rebuildStackUI);
});
document.getElementById('redoBtnMobile').addEventListener('click', function() {
    redo(noop, rebuildStackUI);
});

document.getElementById('loadPresetBtnMobile').addEventListener('click', function() {
    document.getElementById('presetModal').classList.remove('hidden');
    renderPresetList();
});

document.getElementById('savePresetBtnMobile').addEventListener('click', function() {
    document.getElementById('presetModal').classList.remove('hidden');
});

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

document.getElementById('undoBtn').addEventListener('click', function() {
    undo(noop, rebuildStackUI);
});
document.getElementById('redoBtn').addEventListener('click', function() {
    redo(noop, rebuildStackUI);
});

// ---------------------------------------------------------------------------
// Drop zone
// ---------------------------------------------------------------------------

document.getElementById('dropZone').addEventListener('click', function() {
    document.getElementById('fileInput').click();
});

document.getElementById('dropZoneBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    document.getElementById('fileInput').click();
});

document.getElementById('dropZone').addEventListener('dragover', function(e) {
    e.preventDefault();
    this.classList.add('dragover');
});

document.getElementById('dropZone').addEventListener('dragleave', function() {
    this.classList.remove('dragover');
});

document.getElementById('dropZone').addEventListener('drop', function(e) {
    e.preventDefault();
    this.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        loadImage(e.dataTransfer.files[0]);
    }
});

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

document.getElementById('savePresetBtn').addEventListener('click', function() {
    document.getElementById('presetModal').classList.remove('hidden');
});

document.getElementById('loadPresetBtn').addEventListener('click', function() {
    document.getElementById('presetModal').classList.remove('hidden');
    renderPresetList();
});

document.getElementById('closeModalBtn').addEventListener('click', function() {
    document.getElementById('presetModal').classList.add('hidden');
});

document.getElementById('savePresetBtn2').addEventListener('click', savePreset);

document.getElementById('importPresetBtn').addEventListener('click', function() {
    document.getElementById('presetFileInput').click();
});

document.getElementById('presetFileInput').addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        importPreset(e.target.files[0]);
    }
});

// ---------------------------------------------------------------------------
// Panel tabs
// ---------------------------------------------------------------------------

document.getElementById('tabStack').addEventListener('click', function() {
    setActiveTab('stack');
});

document.getElementById('tabControls').addEventListener('click', function() {
    setActiveTab('controls');
});

function setActiveTab(tab) {
    const isStack = tab === 'stack';
    document.getElementById('tabStack').classList.toggle('active', isStack);
    document.getElementById('tabControls').classList.toggle('active', !isStack);
    document.getElementById('stackPanel').classList.toggle('hidden', !isStack);
    document.getElementById('stackControlsContainer').classList.toggle('hidden', isStack);
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

document.addEventListener('keydown', function(e) {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'o') {
            e.preventDefault();
            document.getElementById('fileInput').click();
        } else if (e.key === 'e') {
            e.preventDefault();
            document.getElementById('exportModal').classList.remove('hidden');
        } else if (e.key === 's' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('presetModal').classList.remove('hidden');
        } else if (e.key === 's' && e.shiftKey) {
            e.preventDefault();
            document.getElementById('presetModal').classList.remove('hidden');
            renderPresetList();
        } else if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo(noop, rebuildStackUI);
        } else if (e.key === 'z' && e.shiftKey) {
            e.preventDefault();
            redo(noop, rebuildStackUI);
        }
    }
});

// ---------------------------------------------------------------------------
// noop — undo/redo no longer needs to sync DOM (no [data-param] inputs)
// ---------------------------------------------------------------------------
function noop() {}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

renderPresetList();
initStackPanel(rebuildStackUI);
buildControlsPanel();
initMobileUI();
initBottomSheet();
initTouchGestures();
