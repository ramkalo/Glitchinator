import { registerSW } from 'virtual:pwa-register';
import { undo, redo } from './state/undo.js';
import { showNotification, showUpdatePrompt } from './utils/notifications.js';
import { canvas } from './renderer/glstate.js';
import { processImage } from './renderer/pipeline.js';
import { cleanupWebGL } from './renderer/webgl.js';
import { loadImage, loadSecondImage, loadBlendMapImage, loadGlassMapImage, loadBlankCanvas } from './utils/image.js';
import { exportImage } from './ui/export.js';
import { savePreset, loadPreset, renderPresetList, importPreset } from './ui/presets.js';
import { initMobileUI } from './ui/mobile.js';
import { initBottomSheet } from './ui/bottomsheet.js';
import { initTouchGestures } from './ui/touch.js';
import { initViewport } from './ui/viewportZoom.js';
import { initStackPanel, renderStackList } from './ui/stackPanel.js';
import { initLogo } from './ui/logo.js';
import { initPreferences } from './ui/preferences.js';
import { restoreCustomFonts, loadFontFromFile } from './state/customFonts.js';
import { initRevealTool, openReveal } from './ui/reveal.js';

// ---------------------------------------------------------------------------
// Stack UI rebuild — called whenever stack changes (add/remove/reorder/undo)
// ---------------------------------------------------------------------------

function rebuildStackUI() {
    renderStackList();
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

document.getElementById('blendMapFileInput').addEventListener('change', function(e) {
    if (e.target.files[0]) {
        loadBlendMapImage(e.target.files[0]);
        document.querySelectorAll('.blend-map-image-name')
            .forEach(el => el.textContent = e.target.files[0].name);
    }
});

document.getElementById('glassMapFileInput').addEventListener('change', function(e) {
    if (e.target.files[0]) {
        loadGlassMapImage(e.target.files[0]);
        document.querySelectorAll('.glass-map-image-name')
            .forEach(el => el.textContent = e.target.files[0].name);
    }
});

document.getElementById('loadBtn').addEventListener('click', function() {
    document.getElementById('fileInput').click();
});

document.getElementById('fontFileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    loadFontFromFile(file).then(({ label }) => {
        showNotification(`Font '${label}' loaded`);
        renderStackList();
    }).catch(() => {
        showNotification('Failed to load font');
    });
    e.target.value = '';
});

document.getElementById('loadFontBtn').addEventListener('click', function() {
    document.getElementById('fontFileInput').click();
});

document.getElementById('loadCanvasBtn').addEventListener('click', function() {
    document.getElementById('canvasModal').classList.remove('hidden');
});

document.getElementById('closeCanvasModalBtn').addEventListener('click', function() {
    document.getElementById('canvasModal').classList.add('hidden');
});

document.getElementById('canvasModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
    const btn = e.target.closest('[data-w]');
    if (btn) {
        loadBlankCanvas(parseInt(btn.dataset.w), parseInt(btn.dataset.h), btn.dataset.color);
        this.classList.add('hidden');
    }
});

function defaultExportName() {
    const now = new Date();
    return 'bxtrxt-export-' +
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
}

function openExportModal() {
    document.getElementById('exportFilename').value = defaultExportName();
    document.getElementById('exportModal').classList.remove('hidden');
}

document.getElementById('exportBtn').addEventListener('click', openExportModal);
document.getElementById('revealBtn').addEventListener('click', openReveal);
document.getElementById('revealBtnMobile').addEventListener('click', openReveal);

document.getElementById('confirmExportBtn').addEventListener('click', function() {
    const format = document.querySelector('input[name="exportFormat"]:checked').value;
    const ext = format === 'jpg' ? 'jpg' : 'png';
    let name = document.getElementById('exportFilename').value.trim();
    name = name.replace(/\.(jpg|jpeg|png)$/i, '') || defaultExportName();
    document.getElementById('exportModal').classList.add('hidden');
    exportImage(format, `${name}.${ext}`);
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

document.getElementById('exportBtnMobile').addEventListener('click', openExportModal);

document.getElementById('undoBtnMobile').addEventListener('click', function() {
    undo(noop, rebuildStackUI);
});
document.getElementById('redoBtnMobile').addEventListener('click', function() {
    redo(noop, rebuildStackUI);
});

document.getElementById('loadCanvasBtnMobile').addEventListener('click', function() {
    document.getElementById('canvasModal').classList.remove('hidden');
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

document.getElementById('loadZone').addEventListener('click', function() {
    document.getElementById('fileInput').click();
});

document.getElementById('dropZoneBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    document.getElementById('fileInput').click();
});

// Mobile empty page → open the Load Canvas modal (holds all blank-canvas presets)
document.getElementById('dropZoneCanvasBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    document.getElementById('canvasModal').classList.remove('hidden');
});

document.getElementById('blankWhite1080').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(1920, 1080, '#ffffff'); });
document.getElementById('blankBlack1080').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(1920, 1080, '#000000'); });
document.getElementById('blankWhite1440').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(2560, 1440, '#ffffff'); });
document.getElementById('blankBlack1440').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(2560, 1440, '#000000'); });

document.getElementById('blankWhite1080p').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(1080, 1920, '#ffffff'); });
document.getElementById('blankBlack1080p').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(1080, 1920, '#000000'); });
document.getElementById('blankWhite1440p').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(1440, 2560, '#ffffff'); });
document.getElementById('blankBlack1440p').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(1440, 2560, '#000000'); });

document.getElementById('blankWhite6600').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(6600, 5100, '#ffffff'); });
document.getElementById('blankBlack6600').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(6600, 5100, '#000000'); });
document.getElementById('blankWhite5100p').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(5100, 6600, '#ffffff'); });
document.getElementById('blankBlack5100p').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(5100, 6600, '#000000'); });

document.getElementById('blankWhite1920sq').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(1920, 1920, '#ffffff'); });
document.getElementById('blankBlack1920sq').addEventListener('click', function(e) { e.stopPropagation(); loadBlankCanvas(1920, 1920, '#000000'); });

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
    document.getElementById('prefsModal').classList.add('hidden');
    document.getElementById('presetModal').classList.remove('hidden');
});

document.getElementById('loadPresetBtn').addEventListener('click', function() {
    document.getElementById('prefsModal').classList.add('hidden');
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
// Keyboard shortcuts
// ---------------------------------------------------------------------------

document.addEventListener('keydown', function(e) {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'o') {
            e.preventDefault();
            document.getElementById('fileInput').click();
        } else if (e.key === 'e') {
            e.preventDefault();
            openExportModal();
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

document.fonts.load('1px splitbitsv2');
document.fonts.load('1px neogreekrunic');
document.fonts.load('1px quadramatic');
document.fonts.load('1px Regulon18-Regular');
document.fonts.load('1px amazingdigital100acrewoods');
restoreCustomFonts();

renderPresetList();
initStackPanel();
initMobileUI();
initBottomSheet();
initTouchGestures();
initViewport();
initLogo();
initPreferences();
initRevealTool();
window.addEventListener('beforeunload', cleanupWebGL);

// Mobile warning
const mobileWarningModal = document.getElementById('mobileWarningModal');
const isMobile = window.innerWidth < 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
if (!isMobile) {
    mobileWarningModal.classList.add('hidden');
}
const dismissMobileWarning = () => { mobileWarningModal.style.display = 'none'; };
document.getElementById('mobileWarningOk').addEventListener('click', dismissMobileWarning);
mobileWarningModal.addEventListener('click', dismissMobileWarning);

// ---------------------------------------------------------------------------
// Service worker — offline support + "reload to update" prompt
// ---------------------------------------------------------------------------
const updateSW = registerSW({
    onNeedRefresh() {
        showUpdatePrompt(() => updateSW(true));
    },
});
