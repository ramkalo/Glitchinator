import { EFFECTS, getEffectDefaults, getEffect } from '../effects/registry.js';

let _stack = [];
const _listeners = new Set();

function _notify(paramKey = null) {
    for (const fn of _listeners) fn(paramKey);
}

function _uid() {
    return 'inst_' + Math.random().toString(36).slice(2, 9);
}

export function onStackChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}

export function getStack() {
    return _stack;
}

export function addEffect(effectName) {
    const defaults = getEffectDefaults(effectName);
    if (!defaults) return null;
    
    const effect = EFFECTS.find(e => e.name === effectName);
    const enabledKey = Object.keys(effect?.params || {}).find(k => 
        k.endsWith('Enabled') && typeof defaults[k] === 'boolean'
    );
    
    const instance = { id: _uid(), effectName, params: { ...defaults } };
    if (enabledKey) instance.params[enabledKey] = true;

    if (effectName === 'smearTwist') {
        const count = 10;
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const cellW = 100 / cols;
        const cellH = 100 / rows;
        let placed = 0;
        for (let r = 0; r < rows && placed < count; r++) {
            for (let c = 0; c < cols && placed < count; c++) {
                const jx = Math.random() * 0.8 + 0.1;
                const jy = Math.random() * 0.8 + 0.1;
                instance.params[`smearTwistNx${placed}`] = Math.min(99, Math.round(c * cellW + jx * cellW));
                instance.params[`smearTwistNy${placed}`] = Math.min(99, Math.round(r * cellH + jy * cellH));
                placed++;
            }
        }
        instance.params.smearTwistNodeCount = placed;
    }

    // Give each Film Soup a distinct random bubble layout so stacked instances differ.
    if (effectName === 'filmSoup') {
        instance.params.filmSoupSeed = 1 + Math.floor(Math.random() * 99999);
    }

    // Effects that need a paired marker (viewport → viewportEntry, filmSoup → filmSoupMelt)
    // declare it via `autoEntry`. Push the marker first, then store its id on the instance.
    const autoEntry = effect?.autoEntry;
    if (autoEntry) {
        const entryInst = { id: _uid(), effectName: autoEntry.entryEffectName, params: {} };
        _stack.push(entryInst);
        instance.params[autoEntry.entryIdKey] = entryInst.id;
    }

    _stack.push(instance);
    _notify();
    return instance;
}

export function removeEffect(id) {
    const inst = _stack.find(i => i.id === id);
    const autoEntry = inst && getEffect(inst.effectName)?.autoEntry;
    if (autoEntry) {
        const entryId = inst.params[autoEntry.entryIdKey];
        _stack = entryId
            ? _stack.filter(i => i.id !== entryId)
            : _stack.filter(i => i.effectName !== autoEntry.entryEffectName);
    }
    if (inst?.effectName === 'doubleExposure') {
        const entryId = inst.params.doubleExposureEntryId;
        if (entryId) _stack = _stack.filter(i => i.id !== entryId);
    }
    _stack = _stack.filter(i => i.id !== id);
    _notify();
}

export function insertEffect(effectName, beforeId) {
    const defaults = getEffectDefaults(effectName);
    if (!defaults) return null;
    const instance = { id: _uid(), effectName, params: { ...defaults } };
    const idx = beforeId ? _stack.findIndex(i => i.id === beforeId) : -1;
    _stack.splice(idx === -1 ? _stack.length : idx, 0, instance);
    _notify();
    return instance;
}

export function duplicateEffect(id) {
    const inst = _stack.find(i => i.id === id);
    if (!inst) return null;
    const copy = { id: _uid(), effectName: inst.effectName, params: { ...inst.params } };
    // Reset internal-mode link for the duplicate — it needs its own entry if the user wants it
    if (copy.effectName === 'doubleExposure' && copy.params.doubleExposureMode === 'internal') {
        copy.params.doubleExposureMode = 'external';
        copy.params.doubleExposureEntryId = null;
    }
    const idx = _stack.findIndex(i => i.id === id);

    // Effects with a paired marker (viewport → viewportEntry, filmSoup → filmSoupMelt) need
    // their OWN marker for the duplicate — otherwise the copy shares the original's melt point.
    const autoEntry = getEffect(copy.effectName)?.autoEntry;
    if (autoEntry) {
        const entryInst = { id: _uid(), effectName: autoEntry.entryEffectName, params: {} };
        copy.params[autoEntry.entryIdKey] = entryInst.id;
        _stack.splice(idx + 1, 0, entryInst, copy); // marker just before the copy
    } else {
        _stack.splice(idx + 1, 0, copy);
    }
    _notify();
    return copy;
}

export function moveEffect(id, newIndex) {
    const idx = _stack.findIndex(inst => inst.id === id);
    if (idx === -1) return;
    const [item] = _stack.splice(idx, 1);
    const clampedIndex = Math.max(0, Math.min(_stack.length, newIndex));
    _stack.splice(clampedIndex, 0, item);
    _notify();
}

export function setInstanceParam(id, key, value) {
    const inst = _stack.find(i => i.id === id);
    if (!inst) return;
    inst.params[key] = value;
    _notify(key);
}

export function snapshotStack() {
    return JSON.parse(JSON.stringify(_stack));
}

// Effect renames: old effectName → new effectName + param-prefix remaps.
// Prefixes are tried in order (longest-first where they overlap) and only the
// first match per key is applied. Keeps saved presets loading after renames.
const _RENAMES = [
    { from: 'vhs',           to: 'lineGlitch',       prefixes: [['vhs', 'lineGlitch']] },
    { from: 'digital-smear', to: 'smearTwist',       prefixes: [['digitalSmear', 'smearTwist'], ['smear', 'smearTwist']] },
    { from: 'crtScanlines',  to: 'scanlines',        prefixes: [['crtScan', 'scan']] },
    { from: 'crtCurvature',  to: 'barrelDistortion', prefixes: [['crtCurvature', 'barrelDistortion']] },
];

function _migrateInstance(inst) {
    // crtStatic → grain (legacy, with explicit param remap).
    if (inst.effectName === 'crtStatic') {
        const p = inst.params ?? {};
        const migrated = { ...inst, effectName: 'grain', params: { ...p } };
        const mp = migrated.params;
        if ('crtStaticEnabled'  in mp) { mp.grainEnabled   = mp.crtStaticEnabled;  delete mp.crtStaticEnabled; }
        if ('crtStatic'         in mp) { mp.grainIntensity  = mp.crtStatic;         delete mp.crtStatic; }
        if ('crtStaticType'     in mp) { mp.grainType       = mp.crtStaticType;     delete mp.crtStaticType; }
        if ('crtStaticGrain'    in mp) { mp.grainSize       = mp.crtStaticGrain;    delete mp.crtStaticGrain; }
        for (const key of Object.keys(mp)) {
            if (key.startsWith('crtStatic')) {
                mp['grain' + key.slice('crtStatic'.length)] = mp[key];
                delete mp[key];
            }
        }
        return migrated;
    }

    // Color Gel: the "2/3/4 Colors" dropdown plus free 2D transition anchors
    // became five stops with positions along the gradient axis. Switch off the
    // colors the old zone count never used and drop the dead anchor params.
    if (inst.effectName === 'colorGel' && 'colorGelGradStops' in (inst.params ?? {})) {
        const p = { ...inst.params };
        const zones = Math.max(2, Math.min(4, parseInt(p.colorGelGradStops) || 2));
        const used = ['colorGelColor', 'colorGelColor2', 'colorGelColor3', 'colorGelColor4'].slice(0, zones);
        // The old last zone becomes stop 5 so the gradient still spans the image.
        p.colorGelColor5 = p[used[used.length - 1]] ?? 'palette1';
        for (const key of ['colorGelColor2', 'colorGelColor3', 'colorGelColor4']) {
            if (!used.includes(key) || key === used[used.length - 1]) p[key] = 'none';
        }
        // Space the remaining stops evenly across the axis.
        const active = [1, ...[2, 3, 4].filter(i => p[`colorGelColor${i}`] !== 'none'), 5];
        active.forEach((n, i) => { p[`colorGelPos${n}`] = i / (active.length - 1); });
        delete p.colorGelGradStops;
        for (const key of Object.keys(p)) if (/^colorGelT\d[XY]$/.test(key)) delete p[key];
        return { ...inst, params: p };
    }

    // Prefix-based renames (name + every param key).
    const rename = _RENAMES.find(r => r.from === inst.effectName);
    if (rename) {
        const params = {};
        for (const [k, v] of Object.entries(inst.params ?? {})) {
            let nk = k;
            for (const [oldP, newP] of rename.prefixes) {
                if (k.startsWith(oldP)) { nk = newP + k.slice(oldP.length); break; }
            }
            params[nk] = v;
        }
        return { ...inst, effectName: rename.to, params };
    }

    return inst;
}

export function restoreStack(snapshot) {
    _stack = JSON.parse(JSON.stringify(snapshot)).map(_migrateInstance);
    _notify();
}
