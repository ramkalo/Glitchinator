import { EFFECT_CATALOG, EFFECT_CATEGORIES, getEffect } from '../effects/registry.js';
import { getStack, addEffect, removeEffect, moveEffect, duplicateEffect, setInstanceParam } from '../state/effectStack.js';
import { saveState } from '../state/undo.js';
import { buildEffectBody, labelPreviewText } from './stackControls.js';
import { blitOriginalToScreen } from '../renderer/webgl.js';
import { processImageImmediate } from '../renderer/pipeline.js';
import { originalImage } from '../renderer/glstate.js';
import { showFadeOverlay, hideFadeOverlay, showCropOverlay, hideCropOverlay, showViewportOverlay, hideViewportOverlay, showMatrixRainOverlay, hideMatrixRainOverlay, showLineDragOverlay, hideLineDragOverlay, showChromaOverlay, hideChromaOverlay, showVignetteOverlay, hideVignetteOverlay, showCorruptedOverlay, hideCorruptedOverlay, showCRTCurvatureOverlay, hideCRTCurvatureOverlay, showTextOverlay, hideTextOverlay, showDoubleExposureOverlay, hideDoubleExposureOverlay, showShapeStickerOverlay, hideShapeStickerOverlay, showKaleidoscopeOverlay, hideKaleidoscopeOverlay, showDigitalSmearOverlay, hideDigitalSmearOverlay, showDrawToolOverlay, hideDrawToolOverlay, showMeshOverlay, hideMeshOverlay, showTunnelOverlay, hideTunnelOverlay, showFilmSoupOverlay, hideFilmSoupOverlay, showColorGelOverlay, hideColorGelOverlay, showResinOverlay, hideResinOverlay, showGlassBlobOverlay, hideGlassBlobOverlay, showCutOverlay, hideCutOverlay } from './canvasPicker.js';

let _expandedId = null;

export function initStackPanel() {
    renderCatalog();
    initPickerToggle();
    initCompareButton();
}

function initCompareButton() {
    const btn = document.getElementById('compareBtn');
    if (!btn) return;
    let comparing = false;

    const show = (e) => {
        if (!originalImage) return;
        comparing = true;
        btn.classList.add('active');
        if (e && e.pointerId != null) { try { btn.setPointerCapture(e.pointerId); } catch {} }
        blitOriginalToScreen();
    };
    const restore = () => {
        if (!comparing) return;
        comparing = false;
        btn.classList.remove('active');
        processImageImmediate();
    };

    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); show(e); });
    btn.addEventListener('pointerup', restore);
    btn.addEventListener('pointercancel', restore);
    // Keyboard: hold Space/Enter while focused
    btn.addEventListener('keydown', (e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); show(); }
    });
    btn.addEventListener('keyup', (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); restore(); }
    });
    btn.addEventListener('blur', restore);
}

function initPickerToggle() {
    const picker = document.getElementById('effectPicker');
    const header = document.getElementById('effectPickerHeader');
    if (!picker || !header) return;
    const toggle = () => {
        const collapsed = picker.classList.toggle('collapsed');
        header.title = collapsed ? 'Show effect library' : 'Hide effect library';
        header.setAttribute('aria-expanded', String(!collapsed));
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
        }
    });
}

function makeCatalogItem(entry) {
    const item = document.createElement('div');
    item.className = 'catalog-item';
    item.innerHTML = `
        <div class="catalog-item-info">
            <span class="catalog-item-label">${entry.label}</span>
            <span class="catalog-item-desc">${entry.description}</span>
        </div>
        <button class="catalog-item-add" title="Add ${entry.label}">+</button>
    `;
    item.querySelector('.catalog-item-add').addEventListener('click', () => {
        const PALETTE_DEPENDENT = new Set(['colorRemap', 'matrixRain', 'shapeSticker', 'text', 'corrupted', 'drawTool', 'mesh', 'tunnel', 'colorGel']);
        saveState();
        if (PALETTE_DEPENDENT.has(entry.name) && !getStack().some(i => i.effectName === 'colorPalette')) {
            addEffect('colorPalette');
        }
        const inst = addEffect(entry.name);
        if (inst) _expandedId = inst.id;
        renderStackList();
    });
    return item;
}

let _activeCategory = EFFECT_CATEGORIES[0];

function renderCatalog() {
    const tabs = document.getElementById('effectCatalogTabs');
    const list = document.getElementById('effectCatalogList');
    tabs.innerHTML = '';
    list.innerHTML = '';

    // Group entries by category, preserving catalog order within each group.
    const byCategory = new Map(EFFECT_CATEGORIES.map(c => [c, []]));
    for (const entry of EFFECT_CATALOG) {
        if (!entry.category) continue;
        if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
        byCategory.get(entry.category).push(entry);
    }

    const categories = [...byCategory.keys()].filter(c => byCategory.get(c).length);
    if (!categories.includes(_activeCategory)) _activeCategory = categories[0];

    const showCategory = (category) => {
        _activeCategory = category;
        tabs.querySelectorAll('.catalog-tab').forEach(t => {
            const on = t.dataset.category === category;
            t.classList.toggle('active', on);
            t.setAttribute('aria-selected', String(on));
        });
        list.innerHTML = '';
        for (const entry of byCategory.get(category)) list.appendChild(makeCatalogItem(entry));
        list.scrollTop = 0;
    };

    for (const category of categories) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'catalog-tab';
        tab.dataset.category = category;
        tab.setAttribute('role', 'tab');
        tab.textContent = category;
        tab.addEventListener('click', () => showCategory(category));
        tabs.appendChild(tab);
    }

    showCategory(_activeCategory);
}

export function renderStackList() {
    const container = document.getElementById('effectStackList');
    container.innerHTML = '';
    const stack = getStack();

    if (stack.length === 0) {
        container.innerHTML = '<div class="stack-empty">No effects added yet.<br>Use the list below to add one.</div>';
        return;
    }

    // Count occurrences for duplicate labeling
    const counts = {};
    const seen = {};
    for (const inst of stack) {
        counts[inst.effectName] = (counts[inst.effectName] || 0) + 1;
    }

    // Pair each reveal effect (viewport, filmSoup) with its marker so both show the same
    // number regardless of stack position — e.g. "Film Soup (2)" ↔ "Film Soup Melt Point (2)".
    const ownerNumberByInstId  = {};  // reveal-owner instId  → its number
    const ownerNumberByMarkerId = {}; // paired marker instId → owner's number
    const ownerRunningCount = {};
    for (const inst of stack) {
        const rc = getEffect(inst.effectName)?.reveal;
        if (!rc) continue;
        const n = (ownerRunningCount[inst.effectName] = (ownerRunningCount[inst.effectName] || 0) + 1);
        ownerNumberByInstId[inst.id] = n;
        const entryId = inst.params[rc.entryIdKey];
        if (entryId) ownerNumberByMarkerId[entryId] = n;
    }

    for (let i = 0; i < stack.length; i++) {
        const inst = stack[i];
        seen[inst.effectName] = (seen[inst.effectName] || 0) + 1;

        const effect = getEffect(inst.effectName);
        const entry = EFFECT_CATALOG.find(e => e.name === inst.effectName);
        const baseLabel = entry ? entry.label : (effect?.label ?? inst.effectName);
        // Reveal owners + their markers number by owner pairing; everything else by position.
        const pairedNum = ownerNumberByMarkerId[inst.id] ?? ownerNumberByInstId[inst.id];
        let label = baseLabel;
        if (pairedNum != null) {
            if (counts[inst.effectName] > 1) label = `${baseLabel} (${pairedNum})`;
        } else if (counts[inst.effectName] > 1) {
            label = `${baseLabel} (${seen[inst.effectName]})`;
        }

        const isExpanded = inst.id === _expandedId;

        const item = document.createElement('div');
        const isViewportItem = inst.effectName === 'viewport' || inst.effectName === 'viewportEntry'
            || inst.effectName === 'doubleExposureEntry'
            || inst.effectName === 'filmSoup' || inst.effectName === 'filmSoupMelt';
        item.className = 'stack-item' + (isViewportItem ? ' stack-item--viewport' : '');
        item.dataset.id = inst.id;
        item.dataset.index = i;
        // --- Header row ---
        const header = document.createElement('div');
        header.className = 'stack-item-header';

        const dragHandle = document.createElement('span');
        dragHandle.className = 'stack-drag-handle';
        dragHandle.title = 'Drag to reorder';
        dragHandle.innerHTML = '&#8801;';
        dragHandle.addEventListener('pointerdown', (e) => startDrag(e, inst.id, item));
        header.appendChild(dragHandle);

        const labelEl = document.createElement('span');
        labelEl.className = 'stack-item-label';
        labelEl.textContent = label;
        if (effect?.labelPreview) {
            const preview = document.createElement('span');
            preview.className = 'stack-item-sublabel';
            preview.textContent = labelPreviewText(effect, inst.params);
            labelEl.appendChild(preview);
        }
        header.appendChild(labelEl);

        const isMarker = effect?.isMarker === true;

        if (isMarker) {
            // Marker items (e.g. viewportEntry): handle + label + move buttons only
            const actions = document.createElement('div');
            actions.className = 'stack-item-actions';
            actions.innerHTML = `
                <button class="stack-move-btn" data-dir="up" title="Move up">&#8593;</button>
                <button class="stack-move-btn" data-dir="down" title="Move down">&#8595;</button>
            `;
            header.appendChild(actions);
            actions.querySelectorAll('.stack-move-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    saveState();
                    const dir = btn.dataset.dir;
                    const idx = parseInt(item.dataset.index);
                    moveEffect(inst.id, dir === 'up' ? idx - 1 : idx + 1);
                    renderStackList();
                });
            });
            item.appendChild(header);
        } else {
            // On/Off checkbox
            const enabledKey = effect && Object.keys(effect.params).find(k =>
                k.endsWith('Enabled') && typeof effect.params[k].default === 'boolean'
            );
            if (enabledKey !== undefined) {
                const enableLabel = document.createElement('label');
                enableLabel.className = 'stack-enable-label';
                enableLabel.addEventListener('click', e => e.stopPropagation());
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = inst.params[enabledKey];
                checkbox.addEventListener('change', () => {
                    saveState();
                    setInstanceParam(inst.id, enabledKey, checkbox.checked);
                });
                enableLabel.appendChild(checkbox);
                header.appendChild(enableLabel);
            }

            // Expand arrow
            const expandArrow = document.createElement('span');
            expandArrow.className = 'stack-item-expand' + (isExpanded ? ' open' : '');
            expandArrow.innerHTML = '&#9656;';
            header.appendChild(expandArrow);

            // Action buttons
            const actions = document.createElement('div');
            actions.className = 'stack-item-actions';
            actions.innerHTML = `
                <button class="stack-move-btn" data-dir="up" title="Move up">&#8593;</button>
                <button class="stack-move-btn" data-dir="down" title="Move down">&#8595;</button>
                <button class="stack-dup-btn" title="Duplicate">&#10697;</button>
                <button class="stack-delete-btn" title="Remove">&#10005;</button>
            `;
            header.appendChild(actions);

            // --- Collapsible body (controls) ---
            const body = document.createElement('div');
            body.className = 'stack-item-body';
            if (!isExpanded) body.hidden = true;
            if (isExpanded) {
                body.appendChild(buildEffectBody(inst, renderStackList));
            }

            // Toggle expand on header click (not on action buttons, checkbox, or drag handle)
            header.addEventListener('click', (e) => {
                if (e.target.closest('.stack-item-actions, .stack-enable-label, .stack-drag-handle')) return;
                _expandedId = (_expandedId === inst.id) ? null : inst.id;
                renderStackList();
            });

            // Move buttons
            actions.querySelectorAll('.stack-move-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    saveState();
                    const dir = btn.dataset.dir;
                    const idx = parseInt(item.dataset.index);
                    moveEffect(inst.id, dir === 'up' ? idx - 1 : idx + 1);
                    renderStackList();
                });
            });

            // Duplicate button
            actions.querySelector('.stack-dup-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                saveState();
                duplicateEffect(inst.id);
                renderStackList();
            });

            // Delete button
            actions.querySelector('.stack-delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                saveState();
                if (_expandedId === inst.id) _expandedId = null;
                removeEffect(inst.id);
                renderStackList();
            });

            item.appendChild(header);
            item.appendChild(body);
        }

        container.appendChild(item);
    }

    // Show/hide canvas overlays based on which effect is expanded.
    // IMPORTANT: hide functions must run BEFORE show functions — each showXxx calls
    // _activate() which overwrites _mode, making the hide guards fire too late.
    const expandedInst = stack.find(i => i.id === _expandedId);
    const newEffect = expandedInst?.effectName;
    const effect = expandedInst ? getEffect(newEffect) : null;

    // Resolve overlays descriptor — effects declare { fade, chroma, ... } or a function returning same
    const overlays = expandedInst && effect?.overlays
        ? (typeof effect.overlays === 'function' ? effect.overlays(expandedInst) : effect.overlays)
        : {};

    // Always hide before showing — order matters (see comment above)
    hideTextOverlay();
    hideFadeOverlay();
    if (newEffect !== 'crop')         hideCropOverlay();
    if (newEffect !== 'viewport')     hideViewportOverlay();
    if (newEffect !== 'matrixRain')   hideMatrixRainOverlay();
    if (newEffect !== 'lineDrag')     hideLineDragOverlay();
    if (!overlays.chroma)             hideChromaOverlay();
    if (newEffect !== 'vignette')     hideVignetteOverlay();
    if (newEffect !== 'barrelDistortion') hideCRTCurvatureOverlay();
    if (newEffect !== 'corrupted')    hideCorruptedOverlay();
    if (newEffect !== 'doubleExposure') hideDoubleExposureOverlay();
    if (newEffect !== 'shapeSticker')   hideShapeStickerOverlay();
    if (newEffect !== 'kaleidoscope')   hideKaleidoscopeOverlay();
    if (newEffect !== 'smearTwist')  hideDigitalSmearOverlay();
    if (newEffect !== 'drawTool')       hideDrawToolOverlay();
    if (newEffect !== 'mesh')           hideMeshOverlay();
    if (newEffect !== 'tunnel')         hideTunnelOverlay();
    if (newEffect !== 'filmSoup')       hideFilmSoupOverlay();
    if (newEffect !== 'colorGel')       hideColorGelOverlay();
    if (newEffect !== 'resin')          hideResinOverlay();
    if (newEffect !== 'glassBlob')      hideGlassBlobOverlay();
    if (newEffect !== 'cut')            hideCutOverlay();

    if (!expandedInst) return;

    // Data-driven fade overlay — any effect with overlays.fade uses showFadeOverlay
    if (overlays.fade) {
        const o = overlays.fade;
        showFadeOverlay(expandedInst, o.xKey, o.yKey, o.shapeKey, o.wKey, o.hKey, o.angleKey, o.enabledKey);
    }
    if (overlays.chroma)               showChromaOverlay(expandedInst);

    // Effect-specific overlays that have unique logic or modes
    if      (newEffect === 'text')         showTextOverlay(expandedInst);
    else if (newEffect === 'crop')         showCropOverlay(expandedInst);
    else if (newEffect === 'viewport')     showViewportOverlay(expandedInst);
    else if (newEffect === 'matrixRain')   showMatrixRainOverlay(expandedInst);
    else if (newEffect === 'lineDrag')     showLineDragOverlay(expandedInst);
    else if (newEffect === 'doubleExposure') showDoubleExposureOverlay(expandedInst);
    else if (newEffect === 'vignette')     showVignetteOverlay(expandedInst);
    else if (newEffect === 'barrelDistortion') showCRTCurvatureOverlay(expandedInst);
    else if (newEffect === 'corrupted')    showCorruptedOverlay(expandedInst);
    else if (newEffect === 'shapeSticker')  showShapeStickerOverlay(expandedInst);
    else if (newEffect === 'kaleidoscope')  showKaleidoscopeOverlay(expandedInst);
    else if (newEffect === 'smearTwist') showDigitalSmearOverlay(expandedInst);
    else if (newEffect === 'drawTool')      showDrawToolOverlay(expandedInst);
    else if (newEffect === 'mesh')          showMeshOverlay(expandedInst);
    else if (newEffect === 'tunnel')        showTunnelOverlay(expandedInst);
    else if (newEffect === 'filmSoup')      showFilmSoupOverlay(expandedInst);
    else if (newEffect === 'colorGel')      showColorGelOverlay(expandedInst);
    else if (newEffect === 'resin')         showResinOverlay(expandedInst);
    else if (newEffect === 'glassBlob')     showGlassBlobOverlay(expandedInst);
    else if (newEffect === 'cut')           showCutOverlay(expandedInst);
}

// --- Pointer-based drag-and-drop ---

let _dragId = null;
let _dragEl = null;

function _dragResolveIndex(clientY) {
    const items = [...document.querySelectorAll('#effectStackList .stack-item:not(.dragging)')];
    for (const el of items) {
        const hdr = el.querySelector('.stack-item-header') ?? el;
        const { top, height } = hdr.getBoundingClientRect();
        if (clientY < top + height / 2) return parseInt(el.dataset.index);
    }
    return getStack().length;
}

function _dragUpdateIndicator(clientY) {
    const all = [...document.querySelectorAll('#effectStackList .stack-item')];
    all.forEach(el => el.classList.remove('drop-above', 'drop-below'));
    const rest = all.filter(el => !el.classList.contains('dragging'));
    let placed = false;
    for (const el of rest) {
        const hdr = el.querySelector('.stack-item-header') ?? el;
        const { top, height } = hdr.getBoundingClientRect();
        if (clientY < top + height / 2) { el.classList.add('drop-above'); placed = true; break; }
    }
    if (!placed && rest.length > 0) rest[rest.length - 1].classList.add('drop-below');
}

function _dragCleanup() {
    document.removeEventListener('pointermove', _onDragMove);
    document.removeEventListener('pointerup', _onDragUp);
    document.removeEventListener('keydown', _onDragKey);
    _dragEl?.classList.remove('dragging');
    document.querySelectorAll('#effectStackList .stack-item').forEach(el =>
        el.classList.remove('drop-above', 'drop-below')
    );
    _dragId = null;
    _dragEl = null;
}

function _onDragMove(e) {
    _dragUpdateIndicator(e.clientY);
}

function _onDragUp(e) {
    const resolvedIdx = _dragResolveIndex(e.clientY);
    const stack = getStack();
    const fromIdx = stack.findIndex(i => i.id === _dragId);
    // Adjust for the removal of the dragged item shifting indices down
    const insertIdx = resolvedIdx > fromIdx ? resolvedIdx - 1 : resolvedIdx;
    const dragId = _dragId;
    _dragCleanup();
    if (insertIdx !== fromIdx) {
        saveState();
        moveEffect(dragId, insertIdx);
        renderStackList();
    }
}

function _onDragKey(e) {
    if (e.key === 'Escape') _dragCleanup();
}

function startDrag(e, instId, item) {
    e.preventDefault();
    _dragId = instId;
    _dragEl = item;
    item.classList.add('dragging');
    document.addEventListener('pointermove', _onDragMove);
    document.addEventListener('pointerup', _onDragUp, { once: true });
    document.addEventListener('keydown', _onDragKey, { once: true });
}
