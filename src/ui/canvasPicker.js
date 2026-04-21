import { canvas } from '../renderer/glstate.js';
import { setInstanceParam, getStack, onStackChange } from '../state/effectStack.js';
import { saveState } from '../state/undo.js';

const uiOverlay = document.getElementById('uiOverlay');
const uiCtx     = uiOverlay.getContext('2d');

// Active overlay state — only one active at a time
let _mode      = null;   // 'fade' | 'blur' | 'blackBox' | null
let _instId    = null;
let _dragging  = false;
let _xKey      = null;
let _yKey      = null;
let _handle    = null;   // blackBox: 'center' | 'tl' | 'tr' | 'br' | 'bl'

// Redraw whenever any stack param changes (e.g. a slider)
onStackChange(() => {
    if (!_instId) return;
    const inst = getStack().find(i => i.id === _instId);
    if (!inst) { _hideActive(); return; }
    if (_mode === 'fade')     drawFade(inst.params);
    if (_mode === 'blur')     drawBlur(inst.params);
    if (_mode === 'blackBox') drawBlackBox(inst.params);
});

// ── Public API ────────────────────────────────────────────────────────────────

export function showFadeOverlay(inst) {
    _activate('fade', inst, 'basicFadeX', 'basicFadeY');
    drawFade(inst.params);
}

export function hideFadeOverlay() {
    if (_mode === 'fade') _hideActive();
}

export function showBlurOverlay(inst) {
    _activate('blur', inst, 'blurCenterX', 'blurCenterY');
    drawBlur(inst.params);
}

export function hideBlurOverlay() {
    if (_mode === 'blur') _hideActive();
}

export function showBlackBoxOverlay(inst) {
    _activate('blackBox', inst, 'blackBoxX', 'blackBoxY');
    drawBlackBox(inst.params);
}

export function hideBlackBoxOverlay() {
    if (_mode === 'blackBox') _hideActive();
}

// ── Activation / deactivation ─────────────────────────────────────────────────

function _activate(mode, inst, xKey, yKey) {
    // Clean up any previous listeners before switching
    uiOverlay.removeEventListener('pointerdown', onDown);
    uiOverlay.removeEventListener('pointermove', onHover);

    _mode     = mode;
    _instId   = inst.id;
    _dragging = false;
    _xKey     = xKey;
    _yKey     = yKey;

    uiOverlay.style.pointerEvents = 'auto';
    uiOverlay.addEventListener('pointerdown', onDown);
    uiOverlay.addEventListener('pointermove', onHover);
}

function _hideActive() {
    _mode     = null;
    _instId   = null;
    _dragging = false;
    _xKey     = null;
    _yKey     = null;
    clear();
    uiOverlay.style.pointerEvents = 'none';
    uiOverlay.style.cursor = '';
    uiOverlay.removeEventListener('pointerdown', onDown);
    uiOverlay.removeEventListener('pointermove', onHover);
}

// ── Drawing ───────────────────────────────────────────────────────────────────

function syncSize() {
    const r = canvas.getBoundingClientRect();
    uiOverlay.width  = r.width;
    uiOverlay.height = r.height;
}

function clear() {
    uiCtx.clearRect(0, 0, uiOverlay.width, uiOverlay.height);
}

function drawHandle(cx, cy) {
    // Filled dot with drop shadow
    uiCtx.beginPath();
    uiCtx.arc(cx, cy, 7, 0, Math.PI * 2);
    uiCtx.fillStyle   = 'rgba(255,255,255,0.92)';
    uiCtx.shadowColor = 'rgba(0,0,0,0.55)';
    uiCtx.shadowBlur  = 4;
    uiCtx.fill();
    uiCtx.shadowBlur  = 0;
    uiCtx.strokeStyle = 'rgba(0,0,0,0.4)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.stroke();
    // Cross-hair lines
    uiCtx.strokeStyle = 'rgba(255,255,255,0.75)';
    uiCtx.lineWidth   = 1;
    uiCtx.beginPath();
    uiCtx.moveTo(cx - 12, cy); uiCtx.lineTo(cx + 12, cy);
    uiCtx.moveTo(cx, cy - 12); uiCtx.lineTo(cx, cy + 12);
    uiCtx.stroke();
}

// Basic Adjustments fade — handle dot always visible, dashed circle only while dragging
function drawFade(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);

    const cx = (0.5 + p.basicFadeX / 100) * w;
    const cy = (0.5 - p.basicFadeY / 100) * h;

    if (_dragging) {
        const mxX = Math.max(cx, w - cx);
        const mxY = Math.max(cy, h - cy);
        const r   = Math.sqrt(mxX * mxX + mxY * mxY) * (p.basicFadeRadius / 100);
        uiCtx.beginPath();
        uiCtx.arc(cx, cy, r, 0, Math.PI * 2);
        uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
        uiCtx.lineWidth   = 1.5;
        uiCtx.setLineDash([5, 5]);
        uiCtx.stroke();
        uiCtx.setLineDash([]);
    }

    drawHandle(cx, cy);
}

// Blur — ellipse/rectangle always visible, handle dot always visible
function drawBlur(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);

    const cx    = (0.5 + p.blurCenterX / 100) * w;
    const cy    = (0.5 - p.blurCenterY / 100) * h;
    const a     = Math.max(1, (p.blurMajor / 100) * 0.7071 * w);
    const b     = Math.max(1, (p.blurMinor / 100) * 0.7071 * h);
    const angle = p.blurAngle * Math.PI / 180;

    uiCtx.save();
    uiCtx.translate(cx, cy);
    uiCtx.rotate(angle);
    uiCtx.beginPath();
    if (p.blurMode === 'rectangle') {
        uiCtx.rect(-a, -b, 2 * a, 2 * b);
    } else {
        uiCtx.ellipse(0, 0, a, b, 0, 0, Math.PI * 2);
    }
    uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.setLineDash([5, 5]);
    uiCtx.stroke();
    uiCtx.setLineDash([]);
    uiCtx.restore();

    drawHandle(cx, cy);
}

// BlackBox — rotated box outline + center move handle + 4 corner resize handles
function getBlackBoxHandles(p) {
    const W = uiOverlay.width, H = uiOverlay.height;
    const cx  = (0.5 + p.blackBoxX / 100) * W;
    const cy  = (0.5 - p.blackBoxY / 100) * H;
    const bw  = (p.blackBoxW / 100) * W;
    const bh  = (p.blackBoxH / 100) * H;
    const ang = (p.blackBoxAngle ?? 0) * Math.PI / 180;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const rot = (lx, ly) => [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
    return {
        center: [cx, cy],
        tl:  rot(-bw / 2, -bh / 2),
        tr:  rot(+bw / 2, -bh / 2),
        br:  rot(+bw / 2, +bh / 2),
        bl:  rot(-bw / 2, +bh / 2),
        rot: rot(0, -bh / 2 - 20),
    };
}

function drawRotHandle(cx, cy) {
    uiCtx.beginPath();
    uiCtx.arc(cx, cy, 6, 0, Math.PI * 2);
    uiCtx.fillStyle   = 'rgba(255,255,255,0.92)';
    uiCtx.shadowColor = 'rgba(0,0,0,0.55)';
    uiCtx.shadowBlur  = 4;
    uiCtx.fill();
    uiCtx.shadowBlur  = 0;
    uiCtx.strokeStyle = 'rgba(0,0,0,0.4)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.stroke();
}

function drawCornerHandle(cx, cy) {
    const s = 5;
    uiCtx.save();
    uiCtx.translate(cx, cy);
    uiCtx.shadowColor = 'rgba(0,0,0,0.55)';
    uiCtx.shadowBlur  = 4;
    uiCtx.fillStyle   = 'rgba(255,255,255,0.92)';
    uiCtx.fillRect(-s, -s, s * 2, s * 2);
    uiCtx.shadowBlur  = 0;
    uiCtx.strokeStyle = 'rgba(0,0,0,0.4)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.strokeRect(-s, -s, s * 2, s * 2);
    uiCtx.restore();
}

function drawBlackBox(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);

    const cx  = (0.5 + p.blackBoxX / 100) * W;
    const cy  = (0.5 - p.blackBoxY / 100) * H;
    const bw  = (p.blackBoxW / 100) * W;
    const bh  = (p.blackBoxH / 100) * H;
    const ang = (p.blackBoxAngle ?? 0) * Math.PI / 180;

    uiCtx.save();
    uiCtx.translate(cx, cy);
    uiCtx.rotate(ang);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.setLineDash([5, 5]);
    uiCtx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    uiCtx.setLineDash([]);
    uiCtx.restore();

    const handles = getBlackBoxHandles(p);

    // Connector line: top-centre of box → rotation handle
    // Local [0, -bh/2] rotated: screen_x = cx + (bh/2)*sin, screen_y = cy - (bh/2)*cos
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const tcx = cx + (bh / 2) * sin;
    const tcy = cy - (bh / 2) * cos;
    uiCtx.beginPath();
    uiCtx.moveTo(tcx, tcy);
    uiCtx.lineTo(handles.rot[0], handles.rot[1]);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.lineWidth   = 1;
    uiCtx.stroke();

    drawHandle(handles.center[0], handles.center[1]);
    for (const key of ['tl', 'tr', 'br', 'bl']) {
        drawCornerHandle(handles[key][0], handles[key][1]);
    }
    drawRotHandle(handles.rot[0], handles.rot[1]);
}

// ── Pointer events ────────────────────────────────────────────────────────────

const HIT_RADIUS = 18;

function getCentre() {
    const inst = getStack().find(i => i.id === _instId);
    if (!inst) return null;
    const p = inst.params;
    return {
        cx: (0.5 + p[_xKey] / 100) * uiOverlay.width,
        cy: (0.5 - p[_yKey] / 100) * uiOverlay.height,
    };
}

function hitTest(e) {
    const c = getCentre();
    if (!c) return false;
    const rect = canvas.getBoundingClientRect();
    const dx = (e.clientX - rect.left) - c.cx;
    const dy = (e.clientY - rect.top)  - c.cy;
    return Math.sqrt(dx * dx + dy * dy) <= HIT_RADIUS;
}

function hitTestBlackBox(e) {
    const inst = getStack().find(i => i.id === _instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const handles = getBlackBoxHandles(inst.params);
    for (const [name, [hx, hy]] of Object.entries(handles)) {
        const dx = mx - hx, dy = my - hy;
        if (Math.sqrt(dx * dx + dy * dy) <= HIT_RADIUS) return name;
    }
    return null;
}

function onHover(e) {
    if (_dragging) return;
    if (_mode === 'blackBox') {
        const h = hitTestBlackBox(e);
        uiOverlay.style.cursor = h === 'center' ? 'grab' : h === 'rot' ? 'crosshair' : h ? 'nwse-resize' : 'default';
    } else {
        uiOverlay.style.cursor = hitTest(e) ? 'grab' : 'default';
    }
}

function onDown(e) {
    if (_mode === 'blackBox') {
        const h = hitTestBlackBox(e);
        if (!h) return;
        _handle   = h;
        _dragging = true;
        uiOverlay.setPointerCapture(e.pointerId);
        uiOverlay.style.cursor = h === 'center' ? 'grabbing' : h === 'rot' ? 'crosshair' : 'nwse-resize';
    } else {
        if (!hitTest(e)) return;
        _dragging = true;
        uiOverlay.setPointerCapture(e.pointerId);
        uiOverlay.style.cursor = 'grabbing';
    }
    uiOverlay.addEventListener('pointermove', onDrag);
    uiOverlay.addEventListener('pointerup',   onUp);
}

function onDrag(e) {
    const inst = getStack().find(i => i.id === _instId);
    if (!inst) return;
    const rect = canvas.getBoundingClientRect();

    if (_mode === 'blackBox') {
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const W  = uiOverlay.width, H = uiOverlay.height;
        if (_handle === 'center') {
            const x = Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100)));
            const y = Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100)));
            setInstanceParam(_instId, 'blackBoxX', x);
            setInstanceParam(_instId, 'blackBoxY', y);
        } else if (_handle === 'rot') {
            // Rotation — angle of mouse relative to box center, offset so 0° = up
            const p  = inst.params;
            const cx = (0.5 + p.blackBoxX / 100) * W;
            const cy = (0.5 - p.blackBoxY / 100) * H;
            let deg  = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;
            if (deg > 180)  deg -= 360;
            if (deg < -180) deg += 360;
            setInstanceParam(_instId, 'blackBoxAngle', Math.round(deg));
        } else {
            // Symmetric resize around center — project mouse onto local box axes
            const p   = inst.params;
            const cx  = (0.5 + p.blackBoxX / 100) * W;
            const cy  = (0.5 - p.blackBoxY / 100) * H;
            const ang = (p.blackBoxAngle ?? 0) * Math.PI / 180;
            const cos = Math.cos(ang), sin = Math.sin(ang);
            const dx  = mx - cx, dy = my - cy;
            const lx  = dx * cos + dy * sin;
            const ly  = -dx * sin + dy * cos;
            setInstanceParam(_instId, 'blackBoxW', Math.round(Math.max(1, Math.min(100, Math.abs(lx) * 2 / W * 100))));
            setInstanceParam(_instId, 'blackBoxH', Math.round(Math.max(1, Math.min(100, Math.abs(ly) * 2 / H * 100))));
        }
    } else {
        const x = Math.round(Math.max(-50, Math.min(50, ((e.clientX - rect.left) / rect.width  - 0.5) * 100)));
        const y = Math.round(Math.max(-50, Math.min(50, -((e.clientY - rect.top)  / rect.height - 0.5) * 100)));
        setInstanceParam(_instId, _xKey, x);
        setInstanceParam(_instId, _yKey, y);
    }
    // onStackChange fires → draw() called automatically
}

function onUp() {
    _dragging = false;
    _handle   = null;
    uiOverlay.style.cursor = 'default';
    uiOverlay.removeEventListener('pointermove', onDrag);
    uiOverlay.removeEventListener('pointerup',   onUp);
    saveState();
    const inst = getStack().find(i => i.id === _instId);
    if (!inst) return;
    if (_mode === 'fade')     drawFade(inst.params);
    if (_mode === 'blur')     drawBlur(inst.params);
    if (_mode === 'blackBox') drawBlackBox(inst.params);
}
