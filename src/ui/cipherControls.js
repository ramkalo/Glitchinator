// Cipher card UI — builds the whole body for the `cipher` effect (invoked from buildEffectBody
// in stackControls.js). Renders a message box, an encode/decode toggle, a shareable recipe code
// row, a reorderable stack of encoding steps, and a copyable output box. All state lives in the
// instance's params (cipherSource / cipherDecode / cipherRecipe) and is written through
// setInstanceParam so undo/preset snapshots capture it.

import {
    STEP_TYPES, STEP_ORDER, makeStep, runRecipe, encodeRecipeCode, decodeRecipeCode,
} from '../effects/cipherEngine.js';
import { setInstanceParam } from '../state/effectStack.js';
import { saveState } from '../state/undo.js';
import { showNotification } from '../utils/notifications.js';

export function buildCipherControls(inst, onRebuild) {
    const root = document.createElement('div');
    root.className = 'cipher-tool';
    root.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

    // Working copy of the recipe, parsed from the serialized param.
    let steps = parseRecipe(inst.params.cipherRecipe);

    // Persist value edits (no undo entry, matching live text/slider edits) and refresh outputs.
    const commitSteps = () => {
        setInstanceParam(inst.id, 'cipherRecipe', JSON.stringify(steps));
        refreshOutput();
        refreshCode();
    };
    // Structural changes (add/remove/duplicate/reorder/load) get an undo entry.
    const commitStructural = () => {
        saveState();
        setInstanceParam(inst.id, 'cipherRecipe', JSON.stringify(steps));
        refreshOutput();
        refreshCode();
    };

    // --- 1. Message ---------------------------------------------------------------------------
    const msgLabel = sectionHeader('Message');
    const msg = document.createElement('textarea');
    msg.rows = 3;
    msg.value = inst.params.cipherSource ?? '';
    msg.placeholder = 'Type the text to encode…';
    msg.style.cssText = 'width:100%;resize:vertical;box-sizing:border-box;font-size:0.8rem;';
    msg.addEventListener('input', () => {
        setInstanceParam(inst.id, 'cipherSource', msg.value);
        refreshOutput();
    });

    // --- 2. Encode / Decode toggle ------------------------------------------------------------
    const decodeWrap = document.createElement('label');
    decodeWrap.className = 'checkbox-label';
    const decodeChk = document.createElement('input');
    decodeChk.type = 'checkbox';
    decodeChk.className = 'switch';
    decodeChk.checked = !!inst.params.cipherDecode;
    const decodeText = document.createTextNode('');
    const setDecodeLabel = () => { decodeText.textContent = decodeChk.checked ? ' Decode (reverse recipe)' : ' Encode'; };
    setDecodeLabel();
    decodeChk.addEventListener('change', () => {
        setInstanceParam(inst.id, 'cipherDecode', decodeChk.checked);
        setDecodeLabel();
        refreshOutput();
    });
    decodeWrap.append(decodeChk, decodeText);

    // --- 3. Recipe code -----------------------------------------------------------------------
    const codeSection = document.createElement('div');
    codeSection.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    codeSection.appendChild(sectionHeader('Recipe code'));

    const codeRow = document.createElement('div');
    codeRow.className = 'control-row';
    codeRow.style.cssText = 'gap:8px;';
    const codeField = document.createElement('input');
    codeField.type = 'text';
    codeField.readOnly = true;
    codeField.style.cssText = 'flex:1;min-width:0;font-size:0.72rem;';
    const copyCodeBtn = mkBtn('Copy Code', () => copyText(codeField.value, 'Recipe code copied'));
    codeRow.append(codeField, copyCodeBtn);

    const loadRow = document.createElement('div');
    loadRow.className = 'control-row';
    loadRow.style.cssText = 'gap:8px;';
    const pasteField = document.createElement('input');
    pasteField.type = 'text';
    pasteField.placeholder = 'Paste a recipe code…';
    pasteField.style.cssText = 'flex:1;min-width:0;font-size:0.72rem;';
    const loadBtn = mkBtn('Load Code', () => {
        try {
            const loaded = decodeRecipeCode(pasteField.value);
            steps = loaded;
            pasteField.value = '';
            commitStructural();
            renderSteps();
            showNotification('Recipe loaded');
        } catch {
            showNotification('Invalid recipe code');
        }
    });
    loadRow.append(pasteField, loadBtn);
    codeSection.append(codeRow, loadRow);

    // --- 4. Add step --------------------------------------------------------------------------
    const addRow = document.createElement('div');
    addRow.className = 'control-row';
    addRow.style.cssText = 'gap:8px;';
    const addSelect = document.createElement('select');
    addSelect.style.cssText = 'flex:1;min-width:0;';
    for (const type of STEP_ORDER) {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = STEP_TYPES[type].label;
        addSelect.appendChild(opt);
    }
    const addBtn = mkBtn('+ Add Step', () => {
        steps.push(makeStep(addSelect.value));
        commitStructural();
        renderSteps();
    });
    addBtn.classList.add('btn-primary');
    addRow.append(addSelect, addBtn);

    // --- 5. Step list -------------------------------------------------------------------------
    const stepsHeader = sectionHeader('Steps');
    const list = document.createElement('div');
    list.className = 'cipher-step-list';
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    const resolveIndex = (clientY) => {
        const els = [...list.querySelectorAll('.cipher-step')];
        for (let i = 0; i < els.length; i++) {
            const { top, height } = els[i].getBoundingClientRect();
            if (clientY < top + height / 2) return i;
        }
        return els.length;
    };
    const moveStep = (from, to) => {
        to = Math.max(0, Math.min(steps.length - 1, to));
        if (to === from) return;
        const [item] = steps.splice(from, 1);
        steps.splice(to, 0, item);
        commitStructural();
        renderSteps();
    };

    function renderSteps() {
        list.innerHTML = '';
        if (!steps.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'font-size:0.75rem;color:var(--text-dim);padding:4px 0;';
            empty.textContent = 'No steps yet — add one above.';
            list.appendChild(empty);
            return;
        }
        steps.forEach((step, idx) => {
            const def = STEP_TYPES[step.type];
            if (!def) return;

            const card = document.createElement('div');
            card.className = 'cipher-step';
            card.style.cssText = 'border:1px solid var(--border);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:8px;';

            // Header: drag handle + number/label + reorder/dup/remove buttons
            const head = document.createElement('div');
            head.style.cssText = 'display:flex;align-items:center;gap:8px;';

            const handle = document.createElement('span');
            handle.className = 'stack-drag-handle';
            handle.innerHTML = '&#8801;';
            handle.title = 'Drag to reorder';
            handle.style.cssText = 'cursor:grab;user-select:none;touch-action:none;';
            handle.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                const from = idx;
                card.style.opacity = '0.5';
                const onUp = (ev) => {
                    card.style.opacity = '';
                    const resolved = resolveIndex(ev.clientY);
                    const to = resolved > from ? resolved - 1 : resolved;
                    moveStep(from, to);
                };
                document.addEventListener('pointerup', onUp, { once: true });
            });

            const title = document.createElement('span');
            title.style.cssText = 'flex:1;font-size:0.8rem;font-weight:600;';
            title.textContent = `${idx + 1}. ${def.label}`;

            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:4px;';
            actions.append(
                iconBtn('&#8593;', 'Move up',    () => moveStep(idx, idx - 1)),
                iconBtn('&#8595;', 'Move down',  () => moveStep(idx, idx + 1)),
                iconBtn('&#10697;', 'Duplicate', () => {
                    steps.splice(idx + 1, 0, { id: 's' + Math.random().toString(36).slice(2, 9), type: step.type, cfg: { ...step.cfg } });
                    commitStructural();
                    renderSteps();
                }),
                iconBtn('&#10005;', 'Remove', () => {
                    steps.splice(idx, 1);
                    commitStructural();
                    renderSteps();
                }),
            );
            head.append(handle, title, actions);
            card.appendChild(head);

            // Fields
            for (const field of def.fields) {
                card.appendChild(buildField(step.cfg, field, commitSteps));
            }
            if (def.hint) {
                const hint = document.createElement('div');
                hint.style.cssText = 'font-size:0.68rem;color:var(--text-dim);';
                hint.textContent = def.hint;
                card.appendChild(hint);
            }

            list.appendChild(card);
        });
    }

    // --- 6. Output ----------------------------------------------------------------------------
    const outHeader = sectionHeader('Output');
    const output = document.createElement('textarea');
    output.rows = 3;
    output.readOnly = true;
    output.style.cssText = 'width:100%;resize:vertical;box-sizing:border-box;font-size:0.8rem;';
    const copyOutBtn = mkBtn('Copy Output', () => copyText(output.value, 'Output copied'));
    copyOutBtn.classList.add('btn-primary');
    copyOutBtn.style.cssText = 'width:100%;';

    function refreshOutput() {
        try {
            output.value = runRecipe(inst.params.cipherSource ?? '', steps, !!inst.params.cipherDecode);
        } catch {
            output.value = '⚠ Could not run this recipe on the current input.';
        }
    }
    function refreshCode() {
        codeField.value = steps.length ? encodeRecipeCode(steps) : '';
    }

    // Assemble
    root.append(
        msgLabel, msg,
        decodeWrap,
        codeSection,
        addRow,
        stepsHeader, list,
        outHeader, output, copyOutBtn,
    );

    renderSteps();
    refreshOutput();
    refreshCode();
    return root;
}

// --- helpers ----------------------------------------------------------------------------------

function parseRecipe(json) {
    try {
        const arr = JSON.parse(json ?? '[]');
        if (!Array.isArray(arr)) return [];
        return arr
            .filter(s => s && STEP_TYPES[s.type])
            .map(s => ({
                id: s.id || 's' + Math.random().toString(36).slice(2, 9),
                type: s.type,
                cfg: { ...STEP_TYPES[s.type].defaults, ...(s.cfg || {}) },
            }));
    } catch {
        return [];
    }
}

function sectionHeader(text) {
    const el = document.createElement('div');
    el.className = 'control-section-header';
    el.textContent = text;
    return el;
}

function mkBtn(label, onClick) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
}

function iconBtn(html, title, onClick) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.innerHTML = html;
    b.title = title;
    b.style.cssText = 'padding:2px 8px;font-size:0.75rem;';
    b.addEventListener('click', onClick);
    return b;
}

function copyText(text, okMsg) {
    if (!text) { showNotification('Nothing to copy'); return; }
    navigator.clipboard.writeText(text).then(
        () => showNotification(okMsg),
        () => showNotification('Copy failed'),
    );
}

// Build a single config control from a field descriptor. `onChange` re-serializes + refreshes.
function buildField(cfg, field, onChange) {
    if (field.type === 'toggle') {
        const wrap = document.createElement('label');
        wrap.className = 'checkbox-label';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'switch';
        chk.checked = !!cfg[field.key];
        chk.addEventListener('change', () => { cfg[field.key] = chk.checked; onChange(); });
        wrap.append(chk, document.createTextNode(' ' + field.label));
        return wrap;
    }

    if (field.type === 'segment') {
        const group = document.createElement('div');
        group.className = 'control-group';
        const row = document.createElement('div');
        row.className = 'control-row';
        const labelEl = document.createElement('span');
        labelEl.className = 'control-label';
        labelEl.textContent = field.label;
        const seg = document.createElement('div');
        seg.className = 'pref-segmented';
        seg.setAttribute('role', 'group');
        for (const [val, text] of field.options) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pref-seg-btn' + (cfg[field.key] === val ? ' active' : '');
            btn.textContent = text;
            btn.addEventListener('click', () => {
                cfg[field.key] = val;
                seg.querySelectorAll('.pref-seg-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                onChange();
            });
            seg.appendChild(btn);
        }
        row.append(labelEl, seg);
        group.appendChild(row);
        return group;
    }

    if (field.type === 'number') {
        const group = document.createElement('div');
        group.className = 'control-group';
        const row = document.createElement('div');
        row.className = 'control-row';
        const labelEl = document.createElement('span');
        labelEl.className = 'control-label';
        labelEl.textContent = field.label;
        const input = document.createElement('input');
        input.type = 'number';
        if (field.min != null) input.min = field.min;
        if (field.max != null) input.max = field.max;
        input.value = cfg[field.key];
        input.style.cssText = 'width:72px;';
        const commit = () => {
            let v = parseInt(input.value, 10);
            if (Number.isNaN(v)) v = field.min ?? 0;
            if (field.min != null) v = Math.max(field.min, v);
            if (field.max != null) v = Math.min(field.max, v);
            input.value = v;
            cfg[field.key] = v;
            onChange();
        };
        input.addEventListener('input', () => {
            const v = parseInt(input.value, 10);
            if (!Number.isNaN(v)) { cfg[field.key] = v; onChange(); }
        });
        input.addEventListener('blur', commit);
        row.append(labelEl, input);
        group.appendChild(row);
        return group;
    }

    if (field.type === 'seed') {
        const group = document.createElement('div');
        group.className = 'control-group';
        const row = document.createElement('div');
        row.className = 'control-row';
        row.style.cssText = 'gap:8px;';
        const labelEl = document.createElement('span');
        labelEl.className = 'control-label';
        labelEl.textContent = field.label;
        const input = document.createElement('input');
        input.type = 'number';
        input.value = cfg[field.key];
        input.style.cssText = 'width:96px;';
        input.addEventListener('input', () => {
            const v = parseInt(input.value, 10);
            cfg[field.key] = Number.isNaN(v) ? 0 : v;
            onChange();
        });
        const rnd = mkBtn('Randomize', () => {
            const v = Math.floor(Math.random() * 0x7fffffff) + 1;   // never 0 (0 = classic reversal)
            input.value = v;
            cfg[field.key] = v;
            onChange();
        });
        rnd.style.cssText = 'padding:2px 8px;font-size:0.72rem;';
        row.append(labelEl, input, rnd);
        group.appendChild(row);
        return group;
    }

    // text (default)
    const group = document.createElement('div');
    group.className = 'control-group';
    const row = document.createElement('div');
    row.className = 'control-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'control-label';
    labelEl.textContent = field.label;
    const input = document.createElement('input');
    input.type = 'text';
    if (field.maxLength) input.maxLength = field.maxLength;
    if (field.placeholder) input.placeholder = field.placeholder;
    input.value = cfg[field.key] ?? '';
    input.style.cssText = 'flex:1;min-width:0;';
    input.addEventListener('input', () => { cfg[field.key] = input.value; onChange(); });
    row.append(labelEl, input);
    group.appendChild(row);
    return group;
}
