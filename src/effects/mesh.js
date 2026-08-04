import { canvas } from '../renderer/glstate.js';
import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('mesh');
const blend = buildBlendControl('mesh');

const MESH_COLOR_OPTIONS = [
    ['palette0', 'Color Palette 1'], ['palette1', 'Color Palette 2'],
    ['palette2', 'Color Palette 3'], ['palette3', 'Color Palette 4'],
    ['palette4', 'Color Palette 5'], ['palette5', 'Color Palette 6'],
    ['palette6', 'Color Palette 7'], ['palette7', 'Color Palette 8'],
    ['paletteRandom', 'Palette Random'],
];

function _buildFormulaFn(formula) {
    try {
        const safe = formula
            .replace(/\^/g, '**')
            .replace(/\bsin\b/g, 'Math.sin')
            .replace(/\bcos\b/g, 'Math.cos')
            .replace(/\btan\b/g, 'Math.tan')
            .replace(/\bsqrt\b/g, 'Math.sqrt')
            .replace(/\babs\b/g, 'Math.abs')
            .replace(/\bpow\b/g, 'Math.pow')
            .replace(/\blog\b/g, 'Math.log')
            .replace(/\bpi\b/gi, 'Math.PI')
            .replace(/(?<![a-zA-Z])e(?![a-zA-Z])/g, 'Math.E');
        // eslint-disable-next-line no-new-func
        return new Function('x', '"use strict"; return (' + safe + ')');
    } catch {
        return null;
    }
}

function computeTs(count, dist, formula, mult, cycles) {
    const N = Math.round(count);
    if (N <= 0) return [];

    let evalFn = null;
    if (dist === 'formula') evalFn = _buildFormulaFn(formula ?? 'x');

    const raw = [];
    for (let i = 0; i < N; i++) {
        const norm = (i + 1) / (N + 1);
        if (dist === 'exponential') {
            raw.push(Math.pow(norm, 3));
        } else if (dist === 'logarithmic') {
            raw.push(Math.log10(1 + 9 * norm));
        } else if (dist === 'sinusoidal') {
            // Auto-scale amplitude to stay monotonic: must be < 1/(cycles*2π)
            const c = Math.max(1, Math.round(cycles ?? 3));
            const amp = 0.9 / (c * 2 * Math.PI);
            raw.push(norm + amp * Math.sin(c * 2 * Math.PI * norm));
        } else if (dist === 'formula') {
            if (evalFn) {
                try {
                    const val = evalFn(i);
                    raw.push(isFinite(val) ? val : norm);
                } catch {
                    raw.push(norm);
                }
            } else {
                raw.push(norm);
            }
        } else {
            raw.push(norm);
        }
    }

    let result = raw;
    if (dist === 'formula' && raw.length > 0) {
        let minV = Infinity, maxV = -Infinity;
        for (const v of raw) { minV = Math.min(minV, v); maxV = Math.max(maxV, v); }
        const range = maxV - minV;
        result = range > 0.0001 ? raw.map(v => (v - minV) / range) : raw.map(() => 0.5);
    }

    // Warp t-values via power curve: negative → cluster toward start, positive → cluster toward end
    if (mult) {
        const exp = Math.pow(2, -mult);
        result = result.map(t => Math.pow(Math.max(0, Math.min(1, t)), exp));
    }

    return result;
}

function lerp2(ax, ay, bx, by, t) {
    return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
}

function applyMesh(ctx, p) {
    const w = canvas.width;
    const h = canvas.height;

    const tlx  = (p.meshTLx / 100) * w, tly  = (p.meshTLy / 100) * h;
    const trx  = (p.meshTRx / 100) * w, try_ = (p.meshTRy / 100) * h;
    const brx  = (p.meshBRx / 100) * w, bry  = (p.meshBRy / 100) * h;
    const blx  = (p.meshBLx / 100) * w, bly  = (p.meshBLy / 100) * h;

    const colorMode = p.meshLineColorMode ?? 'custom';
    const palette   = p._activePalette;
    const palIdx    = colorMode.match(/^palette(\d)$/);

    let _colorIdx = 0;
    function resolveColor() {
        if (colorMode === 'paletteRandom' && palette) {
            const s = Math.sin(_colorIdx++ * 127.1 + 311.7) * 43758.5453;
            return palette[Math.floor((s - Math.floor(s)) * 8)] ?? '#ffffff';
        }
        if (palIdx && palette)
            return palette[parseInt(palIdx[1])] ?? '#ffffff';
        return p.meshLineColor ?? '#ffffff';
    }

    const thickness = p.meshThickness ?? 1;

    ctx.save();
    ctx.lineWidth = thickness;
    ctx.lineCap   = 'round';

    // Quad outline
    ctx.strokeStyle = resolveColor();
    ctx.beginPath();
    ctx.moveTo(tlx, tly);
    ctx.lineTo(trx, try_);
    ctx.lineTo(brx, bry);
    ctx.lineTo(blx, bly);
    ctx.closePath();
    ctx.stroke();

    // X lines: top edge (TL→TR) to bottom edge (BL→BR)
    const xTs = computeTs(p.meshXCount ?? 5, p.meshXDist ?? 'even', p.meshXFormula ?? 'x', p.meshXMult ?? 0, p.meshXCycles ?? 3);
    for (const t of xTs) {
        ctx.strokeStyle = resolveColor();
        const top    = lerp2(tlx, tly, trx, try_, t);
        const bottom = lerp2(blx, bly, brx, bry, t);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.stroke();
    }

    // Y lines: left edge (TL→BL) to right edge (TR→BR)
    const yTs = computeTs(p.meshYCount ?? 5, p.meshYDist ?? 'even', p.meshYFormula ?? 'x', p.meshYMult ?? 0, p.meshYCycles ?? 3);
    for (const t of yTs) {
        ctx.strokeStyle = resolveColor();
        const left  = lerp2(tlx, tly, blx, bly, t);
        const right = lerp2(trx, try_, brx, bry, t);
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.stroke();
    }

    ctx.restore();
}

const FORMULA_INFO = `
<strong>Variable</strong><br>
&nbsp;&nbsp;x — line index (0 to N−1)<br><br>
<strong>Operators</strong><br>
&nbsp;&nbsp;+ &nbsp;− &nbsp;* &nbsp;/ &nbsp;% &nbsp;^ &nbsp;**<br><br>
<strong>Functions</strong><br>
&nbsp;&nbsp;sin(x) &nbsp; cos(x) &nbsp; tan(x)<br>
&nbsp;&nbsp;sqrt(x) &nbsp; abs(x) &nbsp; log(x)<br>
&nbsp;&nbsp;pow(x, y)<br><br>
<strong>Constants</strong><br>
&nbsp;&nbsp;pi &nbsp;&nbsp; e<br><br>
<em style="color:var(--text-dim)">Output is auto-normalized to [0,1].<br>Falls back to even distribution on any error.</em>
`.trim();

const DIST_OPTIONS = [
    ['even',        'Even'],
    ['exponential', 'Exponential'],
    ['logarithmic', 'Logarithmic'],
    ['sinusoidal',  'Sinusoidal'],
    ['formula',     'Custom Formula'],
];

export const meshEffect = {
    name:        'mesh',
    label:       'Mesh',
    kind:        'context',
    blendPrefix: 'mesh',
    bindUniforms: (gl, prog, p) => { fade.bindUniforms(gl, prog, p); blend.bindUniforms(gl, prog, p); },
    paramKeys:   [...fade.paramKeys, ...blend.paramKeys],
    overlays:    {},
    params: {
        meshEnabled:   { default: false,      label: 'Enable' },
        meshTLx:       { default: 10, hidden: true },
        meshTLy:       { default: 10, hidden: true },
        meshTRx:       { default: 90, hidden: true },
        meshTRy:       { default: 10, hidden: true },
        meshBRx:       { default: 90, hidden: true },
        meshBRy:       { default: 90, hidden: true },
        meshBLx:       { default: 10, hidden: true },
        meshBLy:       { default: 90, hidden: true },
        meshXCount:    { default: 5,   min: 0, max: 200, label: 'X Lines' },
        meshXDist:     { default: 'even', options: DIST_OPTIONS, label: 'X Distribution' },
        meshXMult:     { default: 0,   min: -3, max: 3, step: 0.1, label: 'X Multiplier' },
        meshXCycles:   { default: 3,   min: 1, max: 20, step: 1,   label: 'X Cycles' },
        meshXFormula:  { default: 'x', label: 'X Formula', info: FORMULA_INFO },
        meshYCount:    { default: 5,   min: 0, max: 200, label: 'Y Lines' },
        meshYDist:     { default: 'even', options: DIST_OPTIONS, label: 'Y Distribution' },
        meshYMult:     { default: 0,   min: -3, max: 3, step: 0.1, label: 'Y Multiplier' },
        meshYCycles:   { default: 3,   min: 1, max: 20, step: 1,   label: 'Y Cycles' },
        meshYFormula:  { default: 'x', label: 'Y Formula', info: FORMULA_INFO },
        meshLineColorMode: { default: 'palette0', label: 'Color', type: 'paletteSelect', options: MESH_COLOR_OPTIONS },
        meshLineColor: { default: '#ffffff', type: 'color', label: 'Custom Color', hidden: true },
        meshThickness: { default: 1, min: 0.5, max: 10, step: 0.5, label: 'Thickness' },
        meshScale:     { default: 1, min: 0.1, max: 10, step: 0.05, label: 'Scale' },
        meshRotate:    { default: 0, min: -180, max: 180, step: 1, label: 'Rotate' },
        meshResetBox:  { default: null, label: 'Reset Box' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.meshEnabled,
    uiGroups: (p) => [
        { label: 'Shape',   keys: ['meshScale', 'meshRotate', 'meshResetBox'] },
        { label: 'X Lines', keys: ['meshXCount', 'meshXDist', ...(p.meshXDist !== 'even' ? ['meshXMult'] : []), ...(p.meshXDist === 'sinusoidal' ? ['meshXCycles'] : []), ...(p.meshXDist === 'formula' ? ['meshXFormula'] : [])] },
        { label: 'Y Lines', keys: ['meshYCount', 'meshYDist', ...(p.meshYDist !== 'even' ? ['meshYMult'] : []), ...(p.meshYDist === 'sinusoidal' ? ['meshYCycles'] : []), ...(p.meshYDist === 'formula' ? ['meshYFormula'] : [])] },
        { label: 'Style',   keys: ['meshLineColorMode', 'meshThickness'] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    canvas2d: applyMesh,
};
