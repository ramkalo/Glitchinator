// Preferences — user-facing UI settings, persisted to localStorage.
// Currently: UI side (effect list + library on the left or right).

const STORAGE_KEY = 'bxtrxt-prefs';

const defaults = {
    uiSide: 'right',      // 'right' | 'left'
    autoSwitchTab: true,  // jump to Current Effects when an effect is added
};

function load() {
    try {
        return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
        return { ...defaults };
    }
}

function save(prefs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch {}
}

let prefs = load();

function applyUiSide() {
    const container = document.querySelector('.app-container');
    if (container) container.classList.toggle('ui-left', prefs.uiSide === 'left');
    document.querySelectorAll('#uiSideToggle .pref-seg-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.side === prefs.uiSide);
    });
}

function applyAutoSwitch() {
    document.querySelectorAll('#autoSwitchToggle .pref-seg-btn').forEach(btn => {
        btn.classList.toggle('active', (btn.dataset.auto === 'on') === prefs.autoSwitchTab);
    });
}

// Read a live preference value (prefs is mutated in place, so this stays current).
export function getPref(key) { return prefs[key]; }

// Apply persisted prefs to the DOM as early as possible (before modal wiring).
export function applyPreferences() {
    applyUiSide();
    applyAutoSwitch();
}

export function initPreferences() {
    applyPreferences();

    const modal = document.getElementById('prefsModal');
    const closeBtn = document.getElementById('closePrefsBtn');
    const toggle = document.getElementById('uiSideToggle');

    // Desktop header trigger + mobile toolbar trigger both open the modal.
    ['prefsBtn', 'prefsBtnMobile'].forEach(id => {
        const b = document.getElementById(id);
        if (b && modal) b.addEventListener('click', () => modal.classList.remove('hidden'));
    });
    if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    if (toggle) {
        toggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.pref-seg-btn');
            if (!btn) return;
            prefs.uiSide = btn.dataset.side;
            save(prefs);
            applyUiSide();
        });
    }

    const autoToggle = document.getElementById('autoSwitchToggle');
    if (autoToggle) {
        autoToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.pref-seg-btn');
            if (!btn) return;
            prefs.autoSwitchTab = btn.dataset.auto === 'on';
            save(prefs);
            applyAutoSwitch();
        });
    }
}
