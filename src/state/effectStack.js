import { EFFECTS, getEffectDefaults, getEffect } from '../effects/registry.js';
import { clearCutCapture } from '../effects/cutCapture.js';

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

/**
 * Whether another instance of `effectName` may be added. Singleton effects
 * (e.g. Metadata, Embed Hidden) are capped at one instance in the stack.
 */
export function canAddEffect(effectName) {
    const effect = getEffect(effectName);
    if (effect?.singleton && _stack.some(i => i.effectName === effectName)) return false;
    return true;
}

export function addEffect(effectName) {
    const defaults = getEffectDefaults(effectName);
    if (!defaults) return null;
    if (!canAddEffect(effectName)) return _stack.find(i => i.effectName === effectName) ?? null;

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

    // Effects that spawn a connected, independently-movable partner (cut → paste) declare
    // it via `autoPair`. Insert the partner right after the owner, cross-linked by id.
    const autoPair = effect?.autoPair;
    if (autoPair) {
        const partnerInst = {
            id: _uid(),
            effectName: autoPair.partnerEffectName,
            params: { ...(getEffectDefaults(autoPair.partnerEffectName) || {}) },
        };
        instance.params[autoPair.partnerIdKey] = partnerInst.id;
        partnerInst.params[autoPair.backIdKey] = instance.id;
        _stack.push(instance, partnerInst);
        _notify();
        return instance;
    }

    _stack.push(instance);
    _notify();
    return instance;
}

export function removeEffect(id) {
    const inst = _stack.find(i => i.id === id);
    const toRemove = new Set([id]);

    const autoEntry = inst && getEffect(inst.effectName)?.autoEntry;
    if (autoEntry) {
        const entryId = inst.params[autoEntry.entryIdKey];
        if (entryId) toRemove.add(entryId);
        else for (const i of _stack) if (i.effectName === autoEntry.entryEffectName) toRemove.add(i.id);
    }
    if (inst?.effectName === 'doubleExposure') {
        const entryId = inst.params.doubleExposureEntryId;
        if (entryId) toRemove.add(entryId);
    }

    // autoPair partners delete together, in either direction (owner→partner, partner→owner).
    if (inst) {
        const ap = getEffect(inst.effectName)?.autoPair;
        if (ap && inst.params[ap.partnerIdKey]) toRemove.add(inst.params[ap.partnerIdKey]);
        for (const other of _stack) {
            const oap = getEffect(other.effectName)?.autoPair;
            if (oap && other.params[oap.partnerIdKey] === id) toRemove.add(other.id);
        }
    }

    for (const rid of toRemove) clearCutCapture(rid);   // drop any live cut capture for removed layers
    _stack = _stack.filter(i => !toRemove.has(i.id));
    _notify();
}

export function insertEffect(effectName, beforeId) {
    const defaults = getEffectDefaults(effectName);
    if (!defaults) return null;
    if (!canAddEffect(effectName)) return _stack.find(i => i.effectName === effectName) ?? null;
    const instance = { id: _uid(), effectName, params: { ...defaults } };
    const idx = beforeId ? _stack.findIndex(i => i.id === beforeId) : -1;
    _stack.splice(idx === -1 ? _stack.length : idx, 0, instance);
    _notify();
    return instance;
}

export function duplicateEffect(id) {
    const inst = _stack.find(i => i.id === id);
    if (!inst) return null;
    if (!canAddEffect(inst.effectName)) return null; // singletons can't be duplicated
    const copy = { id: _uid(), effectName: inst.effectName, params: { ...inst.params } };
    // Reset internal-mode link for the duplicate — it needs its own entry if the user wants it
    if (copy.effectName === 'doubleExposure' && copy.params.doubleExposureMode === 'internal') {
        copy.params.doubleExposureMode = 'external';
        copy.params.doubleExposureEntryId = null;
    }
    const idx = _stack.findIndex(i => i.id === id);

    // autoPair owner (cut): duplicate the whole connected pair as a fresh linked pair so the
    // copy doesn't share the original's Paste layer.
    const ap = getEffect(copy.effectName)?.autoPair;
    if (ap) {
        const partner = _stack.find(i => i.id === inst.params[ap.partnerIdKey]);
        const partnerCopy = {
            id: _uid(),
            effectName: ap.partnerEffectName,
            params: partner ? { ...partner.params } : { ...(getEffectDefaults(ap.partnerEffectName) || {}) },
        };
        copy.params[ap.partnerIdKey] = partnerCopy.id;
        partnerCopy.params[ap.backIdKey] = copy.id;
        _stack.splice(idx + 1, 0, copy, partnerCopy);
        _notify();
        return copy;
    }

    // autoPair partner (paste): duplicate just this layer as a standalone (unlinked) copy.
    const ownerAp = EFFECTS.map(e => e.autoPair).find(a => a && a.partnerEffectName === copy.effectName);
    if (ownerAp) {
        copy.params[ownerAp.backIdKey] = null;
        _stack.splice(idx + 1, 0, copy);
        _notify();
        return copy;
    }

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
    // Ghost-category naming cleanup — id now matches the UI label. Note the swap: Redact vacates
    // the `cloak` id (→ `redact`) so the former Embed effect can take it.
    { from: 'cloak',         to: 'redact',           prefixes: [['cloak', 'redact']] },
    { from: 'watermark',     to: 'ghostmark',        prefixes: [['watermark', 'ghostmark']] },
    { from: 'embedHidden',   to: 'cloak',            prefixes: [['embedHidden', 'cloak']] },
    { from: 'metadata',      to: 'overwrite',        prefixes: [['metadata', 'overwrite']] },
    // Transform split into Flip / Rotate / Tilt — the discrete flips/turns became Flip.
    { from: 'transform',     to: 'flip',             prefixes: [['transform', 'flip']] },
];

function _migrateInstance(inst) {
    // Legacy single-effect Cut Out → connected Cut + Paste pair. Old cut instances carry the
    // image/paste data directly and lack the `cutPasteId` link that new cut instances always have.
    // The capture is now live, so the old baked `cutImage` is discarded — only shape + copy layout
    // carry over.
    if (inst.effectName === 'cut' && !('cutPasteId' in (inst.params ?? {}))) {
        const p = inst.params ?? {};
        const cutId   = inst.id || _uid();
        const pasteId = _uid();
        const vertOffsets = {};
        for (let i = 0; i < 12; i++) {
            vertOffsets[`cutV${i}x`] = p[`cutV${i}x`] ?? 0;
            vertOffsets[`cutV${i}y`] = p[`cutV${i}y`] ?? 0;
        }
        const cutInst = {
            id: cutId, effectName: 'cut',
            params: {
                ...getEffectDefaults('cut'),
                cutShape: p.cutShape ?? 'rectangle',
                cutSides: p.cutSides ?? 6,
                cutErase: p.cutErase ?? false,
                cutX: p.cutX ?? 0, cutY: p.cutY ?? 0,
                cutW: p.cutW ?? 30, cutH: p.cutH ?? 20,
                cutRot: p.cutRot ?? 0,
                ...vertOffsets,
                cutPasteId: pasteId,
            },
        };
        const pasteInst = {
            id: pasteId, effectName: 'paste',
            params: {
                ...getEffectDefaults('paste'),
                // Keep old copies if present; otherwise the paste default (one centered copy) stands.
                ...(p.cutPastes && p.cutPastes !== '[]' ? { cutPastes: p.cutPastes } : {}),
                pasteCutId: cutId,
            },
        };
        return [cutInst, pasteInst];
    }

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
        // Cloak (formerly Embed): the private 'bxtrxt' scheme was renamed 'randomized'.
        if (rename.to === 'cloak' && params.cloakScheme === 'bxtrxt') params.cloakScheme = 'randomized';
        return { ...inst, effectName: rename.to, params };
    }

    return inst;
}

export function restoreStack(snapshot) {
    // Drop instances whose effect no longer exists (e.g. an effect deleted since a preset was
    // saved) so the stack panel never tries to render a dead effect. _migrateInstance may
    // expand one legacy instance into several (old single-effect Cut Out → Cut + Paste pair).
    _stack = JSON.parse(JSON.stringify(snapshot))
        .flatMap(inst => { const r = _migrateInstance(inst); return Array.isArray(r) ? r : [r]; })
        .filter(i => getEffect(i.effectName));
    _notify();
}
