import { presets, savePresetsToStorage } from '../state/params.js';
import { saveState } from '../state/undo.js';
import { showNotification } from '../utils/notifications.js';
import { snapshotStack, restoreStack } from '../state/effectStack.js';
import { renderStackList } from './stackPanel.js';

export function savePreset() {
    const name = document.getElementById('presetName').value.trim();
    if (!name) {
        showNotification('Enter a preset name');
        return;
    }
    presets[name] = { stack: snapshotStack() };
    savePresetsToStorage();
    renderPresetList();
    showNotification('Preset saved');
}

export function loadPreset(name) {
    const preset = presets[name];
    if (!preset) return;
    if (!preset.stack) {
        showNotification('Incompatible preset — saved with an older version');
        return;
    }

    saveState();
    restoreStack(preset.stack);  // triggers onStackChange → re-render
    renderStackList();
    showNotification('Preset loaded');
}

export function deletePreset(name) {
    delete presets[name];
    savePresetsToStorage();
    renderPresetList();
    showNotification('Preset deleted');
}

export function downloadPreset(name) {
    if (!presets[name]) return;
    const blob = new Blob([JSON.stringify(presets[name], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bxtrxt-preset-${name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function renderPresetList() {
    const list = document.getElementById('presetList');
    list.innerHTML = '';

    Object.keys(presets).forEach(function(name) {
        const item = document.createElement('div');
        item.className = 'preset-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'preset-name';
        nameSpan.textContent = name;

        const actions = document.createElement('div');
        actions.className = 'preset-actions';

        const loadBtn = document.createElement('button');
        loadBtn.className = 'btn';
        loadBtn.textContent = 'Load';
        loadBtn.onclick = function() {
            loadPreset(name);
            document.getElementById('presetModal').classList.add('hidden');
        };

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn';
        downloadBtn.textContent = 'Download';
        downloadBtn.onclick = function() { downloadPreset(name); };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = function() { deletePreset(name); };

        actions.appendChild(loadBtn);
        actions.appendChild(downloadBtn);
        actions.appendChild(deleteBtn);
        item.appendChild(nameSpan);
        item.appendChild(actions);
        list.appendChild(item);
    });
}

export function importPreset(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);

            if (!imported.stack) {
                showNotification('Incompatible preset — saved with an older version');
                return;
            }

            saveState();
            restoreStack(imported.stack);  // triggers onStackChange → re-render
            renderStackList();
            document.getElementById('presetModal').classList.add('hidden');
            showNotification('Preset imported');
        } catch (err) {
            showNotification('Invalid preset file');
        }
    };
    reader.readAsText(file);
}
