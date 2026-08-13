// Color Curve editor — the custom canvas UI for the colorCurve effect.
//
// A draggable-node curve over a live histogram backdrop. Click empty space to add
// a node, drag to move (endpoints are x-pinned, interior nodes clamp between their
// neighbors), double-click a node to remove it. The
// smooth line is the exact monotone-cubic LUT the shader applies (shared code), so
// what you draw is what you get. The x-axis meaning follows the mode/channel: value
// or per-channel input for Value mode, luma for Luma vs Sat, hue for the hue modes.

import { setInstanceParam, getStack, onStackChange } from '../../state/effectStack.js';
import { saveState } from '../../state/undo.js';
import { getPixelsBeforeInstance } from '../../renderer/webgl.js';
import { MAX_NODES, readNodes, sampleCurveLUT, resetModeUpdates } from '../../effects/colorCurve.js';

const W = 280, H = 200, PAD = 10;   // internal canvas size + plot padding
const HIT = 12;                     // node hit radius, canvas px
const EPS = 0.02;                   // min x gap between neighbours

const FLAT_MODES = new Set(['hueSat', 'hueLuma', 'lumaSat']);
const Y_LABEL = {
    value: 'Output', hueHue: 'New Hue', hueSat: 'Saturation ±', hueLuma: 'Luma ±', lumaSat: 'Saturation ±',
};

export function buildCurveEditorControl(inst, { onRebuild } = {}) {
    const group = document.createElement('div');
    group.className = 'control-group';

    const label = document.createElement('div');
    label.className = 'control-label';
    label.textContent = 'Curve';
    label.style.marginBottom = '4px';
    group.appendChild(label);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText = `width:100%;aspect-ratio:${W}/${H};display:block;border:1px solid var(--border);border-radius:4px;touch-action:none;cursor:crosshair;`;
    group.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:0.7rem;color:var(--text-dim);margin:4px 0;';
    hint.textContent = 'Click to add · drag to move · double-click a node to remove';
    group.appendChild(hint);

    const resetRow = document.createElement('div');
    resetRow.className = 'control-row';
    resetRow.style.marginTop = '6px';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn';
    resetBtn.textContent = '⟲ Reset Curve';
    resetRow.appendChild(resetBtn);
    group.appendChild(resetRow);

    // --- helpers ---
    const mode    = () => inst.params.curveMode ?? 'value';
    const channel = () => inst.params.curveChannel ?? 'luma';
    const toPxX = (nx) => PAD + nx * (W - 2 * PAD);
    const toPxY = (ny) => (H - PAD) - ny * (H - 2 * PAD);
    const clamp01 = (v) => Math.min(1, Math.max(0, v));

    // Which input axis the x-coordinate (and histogram) represents.
    const histAxis = () => {
        const m = mode();
        if (m === 'hueHue' || m === 'hueSat' || m === 'hueLuma') return 'hue';
        if (m === 'value') return channel();     // 'luma' | 'r' | 'g' | 'b'
        return 'luma';                           // lumaSat
    };

    const rgbToHue = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        if (d < 1e-4) return 0;
        let h;
        if (mx === r)      h = ((g - b) / d) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else               h = (r - g) / d + 4;
        h /= 6; if (h < 0) h += 1;
        return h;
    };
    const pixelValue = (r, g, b, ax) => {
        if (ax === 'r') return r / 255;
        if (ax === 'g') return g / 255;
        if (ax === 'b') return b / 255;
        if (ax === 'hue') return rgbToHue(r, g, b);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    };

    // --- node persistence ---
    const loadNodes = () => readNodes(inst.params, mode());
    function commit(nodes) {
        const m = mode();
        setInstanceParam(inst.id, `curve_${m}_count`, nodes.length);
        for (let i = 0; i < nodes.length; i++) {
            setInstanceParam(inst.id, `curve_${m}_Nx${i}`, Math.round(nodes[i].x * 1000) / 1000);
            setInstanceParam(inst.id, `curve_${m}_Ny${i}`, Math.round(nodes[i].y * 1000) / 1000);
        }
    }

    // --- histogram ---
    let histBins = null;
    function computeHistogram() {
        if (!inst.params.curveShowHistogram) { histBins = null; return; }
        const res = getPixelsBeforeInstance(getStack(), inst.id);
        if (!res) { histBins = null; return; }
        const { pixels } = res;
        const ax = histAxis();
        const bins = new Float32Array(256);
        const stride = 4 * 3;   // subsample every 3rd pixel
        for (let i = 0; i < pixels.length; i += stride) {
            if (pixels[i + 3] === 0) continue;
            const v = pixelValue(pixels[i], pixels[i + 1], pixels[i + 2], ax);
            let b = Math.floor(v * 255);
            if (b < 0) b = 0; else if (b > 255) b = 255;
            bins[b]++;
        }
        let mx = 0;
        for (let i = 0; i < 256; i++) if (bins[i] > mx) mx = bins[i];
        if (mx > 0) for (let i = 0; i < 256; i++) bins[i] = Math.sqrt(bins[i] / mx);
        histBins = bins;
    }

    // --- drawing ---
    function stripColor(t, ax) {
        if (ax === 'hue') return `hsl(${t * 360},100%,50%)`;
        const v = Math.round(t * 255);
        if (ax === 'r') return `rgb(${v},0,0)`;
        if (ax === 'g') return `rgb(0,${v},0)`;
        if (ax === 'b') return `rgb(0,0,${v})`;
        return `rgb(${v},${v},${v})`;
    }

    function repaint() {
        ctx.clearRect(0, 0, W, H);
        // Plot background.
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(PAD, PAD, W - 2 * PAD, H - 2 * PAD);

        // Histogram backdrop.
        if (inst.params.curveShowHistogram && histBins) {
            ctx.fillStyle = 'rgba(255,255,255,0.16)';
            ctx.beginPath();
            ctx.moveTo(toPxX(0), toPxY(0));
            for (let i = 0; i < 256; i++) ctx.lineTo(toPxX(i / 255), toPxY(histBins[i]));
            ctx.lineTo(toPxX(1), toPxY(0));
            ctx.closePath();
            ctx.fill();
        }

        // Grid.
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.lineWidth = 1;
        for (let k = 1; k < 4; k++) {
            const gx = toPxX(k / 4), gy = toPxY(k / 4);
            ctx.beginPath(); ctx.moveTo(gx, PAD); ctx.lineTo(gx, H - PAD); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(PAD, gy); ctx.lineTo(W - PAD, gy); ctx.stroke();
        }

        // Reference line (identity diagonal, or mid-line for adjustment modes).
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        if (FLAT_MODES.has(mode())) { ctx.moveTo(toPxX(0), toPxY(0.5)); ctx.lineTo(toPxX(1), toPxY(0.5)); }
        else                        { ctx.moveTo(toPxX(0), toPxY(0));   ctx.lineTo(toPxX(1), toPxY(1)); }
        ctx.stroke();
        ctx.setLineDash([]);

        // x-axis colour strip.
        const ax = histAxis();
        const stripW = W - 2 * PAD;
        for (let x = 0; x < stripW; x++) {
            ctx.fillStyle = stripColor(x / (stripW - 1), ax);
            ctx.fillRect(PAD + x, H - PAD + 2, 1, PAD - 4);
        }

        // The curve — the shader's exact LUT.
        const nodes = loadNodes();
        const lut = sampleCurveLUT(nodes);
        ctx.strokeStyle = '#5ac8fa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < lut.length; i++) {
            const x = toPxX(i / (lut.length - 1)), y = toPxY(lut[i]);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Nodes.
        for (let i = 0; i < nodes.length; i++) {
            ctx.beginPath();
            ctx.arc(toPxX(nodes[i].x), toPxY(nodes[i].y), 5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#1c6ea4';
            ctx.stroke();
        }

        hint.textContent = `X: ${ax === 'hue' ? 'Hue' : ax === 'luma' ? 'Luma' : ax.toUpperCase()} · Y: ${Y_LABEL[mode()] ?? 'Output'} · click to add, double-click to remove`;
    }

    // --- pointer interaction ---
    const evt = (e) => {
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width * W;
        const py = (e.clientY - rect.top) / rect.height * H;
        return { px, py, nx: (px - PAD) / (W - 2 * PAD), ny: 1 - (py - PAD) / (H - 2 * PAD) };
    };

    let drag = null; // { nodes, index, isEnd }

    canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const { px, py, nx, ny } = evt(e);
        const nodes = loadNodes();

        let hit = -1, best = HIT * HIT;
        for (let i = 0; i < nodes.length; i++) {
            const dx = toPxX(nodes[i].x) - px, dy = toPxY(nodes[i].y) - py;
            const d = dx * dx + dy * dy;
            if (d <= best) { best = d; hit = i; }
        }

        canvas.setPointerCapture(e.pointerId);
        saveState();

        if (hit >= 0) {
            drag = { nodes, index: hit, isEnd: hit === 0 || hit === nodes.length - 1 };
        } else {
            if (nodes.length >= MAX_NODES) { drag = null; return; }
            const cx = clamp01(nx), cy = clamp01(ny);
            let idx = nodes.findIndex(p => p.x > cx);
            if (idx <= 0) idx = 1;                        // never before the first endpoint
            if (idx > nodes.length - 1) idx = nodes.length - 1; // never after the last endpoint
            nodes.splice(idx, 0, { x: cx, y: cy });
            commit(nodes);
            drag = { nodes, index: idx, isEnd: false };
        }
        repaint();
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const { nx, ny } = evt(e);
        const { nodes, index: i } = drag;
        if (drag.isEnd) {
            nodes[i].y = clamp01(ny);                     // endpoints: x pinned
        } else {
            const lo = nodes[i - 1].x + EPS, hi = nodes[i + 1].x - EPS;
            nodes[i].x = Math.min(Math.max(nx, lo), Math.max(lo, hi));
            nodes[i].y = clamp01(ny);
        }
        commit(nodes);
        repaint();
    });

    const endDrag = () => {
        drag = null;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);

    canvas.addEventListener('dblclick', (e) => {
        const { px, py } = evt(e);
        const nodes = loadNodes();
        let hit = -1, best = HIT * HIT;
        for (let i = 1; i < nodes.length - 1; i++) {     // interior only
            const dx = toPxX(nodes[i].x) - px, dy = toPxY(nodes[i].y) - py;
            const d = dx * dx + dy * dy;
            if (d <= best) { best = d; hit = i; }
        }
        if (hit >= 0 && nodes.length > 2) {
            saveState();
            nodes.splice(hit, 1);
            commit(nodes);
            repaint();
        }
    });

    resetBtn.addEventListener('click', () => {
        saveState();
        const upd = resetModeUpdates(mode());
        for (const [k, v] of Object.entries(upd)) setInstanceParam(inst.id, k, v);
        repaint();
    });

    // Recompute the histogram when the upstream stack changes (debounced). Our own
    // node edits don't affect it (it samples the state *before* this effect), so the
    // debounce just coalesces churn. Unsubscribe once the widget leaves the DOM.
    let histTimer = null;
    let unsub = null;
    const scheduleHist = () => {
        clearTimeout(histTimer);
        histTimer = setTimeout(() => {
            if (!document.contains(canvas)) { if (unsub) unsub(); return; }
            computeHistogram();
            repaint();
        }, 200);
    };
    unsub = onStackChange(() => {
        if (!document.contains(canvas)) { if (unsub) unsub(); return; }
        scheduleHist();
    });

    computeHistogram();
    repaint();
    return group;
}
