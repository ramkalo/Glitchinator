import { params } from './state/params.js';
import { undo, redo } from './state/undo.js';
import { showNotification } from './utils/notifications.js';
import { canvas } from './renderer/glstate.js';
import { initWebGL } from './renderer/webgl.js';
import { processImage } from './renderer/pipeline.js';
import { loadImage, loadSecondImage } from './utils/image.js';
import { exportImage } from './ui/export.js';
import { applyControlLimits, resetImage, initParamBindings, syncDOMFromParams } from './ui/controls.js';
import { savePreset, loadPreset, renderPresetList, importPreset } from './ui/presets.js';
import { initMobileUI } from './ui/mobile.js';
import { initBottomSheet } from './ui/bottomsheet.js';
import { initTouchGestures } from './ui/touch.js';

// File inputs
document.getElementById('fileInput').addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        loadImage(e.target.files[0]);
    }
});

document.getElementById('secondFileInput').addEventListener('change', function(e) {
    if (e.target.files[0]) loadSecondImage(e.target.files[0]);
});

document.getElementById('loadSecondImageBtn').addEventListener('click', function() {
    document.getElementById('secondFileInput').click();
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

// Mobile toolbar button listeners (duplicate desktop buttons)
document.getElementById('loadBtnMobile').addEventListener('click', function() {
    document.getElementById('fileInput').click();
});

document.getElementById('exportBtnMobile').addEventListener('click', function() {
    document.getElementById('exportModal').classList.remove('hidden');
});

document.getElementById('undoBtnMobile').addEventListener('click', function() {
    undo(syncDOMFromParams);
});
document.getElementById('redoBtnMobile').addEventListener('click', function() {
    redo(syncDOMFromParams);
});

document.getElementById('loadPresetBtnMobile').addEventListener('click', function() {
    document.getElementById('presetModal').classList.remove('hidden');
    renderPresetList();
});

document.getElementById('resetBtnMobile').addEventListener('click', resetImage);

document.getElementById('savePresetBtnMobile').addEventListener('click', function() {
    document.getElementById('presetModal').classList.remove('hidden');
});

document.getElementById('resetBtn').addEventListener('click', resetImage);
document.getElementById('undoBtn').addEventListener('click', function() {
    undo(syncDOMFromParams);
});
document.getElementById('redoBtn').addEventListener('click', function() {
    redo(syncDOMFromParams);
});

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

document.querySelectorAll('.tool-header').forEach(function(header) {
    header.addEventListener('click', function() {
        this.parentElement.classList.toggle('collapsed');
    });
});

document.getElementById('collapseAllBtn').addEventListener('click', function() {
    const sections = document.querySelectorAll('.tool-section');
    const anyExpanded = Array.from(sections).some(function(s) { return !s.classList.contains('collapsed'); });
    sections.forEach(function(s) {
        if (anyExpanded) s.classList.add('collapsed');
        else s.classList.remove('collapsed');
    });
    this.textContent = anyExpanded ? 'Expand All' : 'Collapse All';
});

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

document.getElementById('timestampNowBtn').addEventListener('click', function() {
    const now = new Date();
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const ts = months[now.getMonth()] + ' ' +
               String(now.getDate()).padStart(2, '0') + ' ' +
               now.getFullYear() + ' ' +
               String(now.getHours()).padStart(2, '0') + ':' +
               String(now.getMinutes()).padStart(2, '0') + ':' +
               String(now.getSeconds()).padStart(2, '0');

    document.querySelector('input[data-param="vhsTimestamp"]').value = ts;
    params.vhsTimestamp = ts;
    processImage();
});

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
            undo(syncDOMFromParams);
        } else if (e.key === 'z' && e.shiftKey) {
            e.preventDefault();
            redo(syncDOMFromParams);
        }
    }
});

// Initialization
renderPresetList();
initWebGL();
applyControlLimits();
initParamBindings();
initMobileUI();      // no-op; kept for compatibility
initBottomSheet();   // slide-up sheet snap points + adjust-mode state machine
initTouchGestures(); // pinch-to-zoom, long-press compare, canvas-drag scrub
