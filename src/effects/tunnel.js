import { canvas } from '../renderer/glstate.js';
import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('tunnel');
const blend = buildBlendControl('tunnel');

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

function computeTunnelTs(count, dist, formula, mult, cycles) {
    const N = Math.round(count);
    if (N <= 0) return [];
    if (N === 1) return [0];

    let evalFn = null;
    if (dist === 'formula') evalFn = _buildFormulaFn(formula ?? 'x');

    const raw = [];
    for (let i = 0; i < N; i++) {
        const norm = i / (N - 1); // inclusive 0→1 so first/last shapes anchor to endpoints
        if (dist === 'exponential') {
            raw.push(Math.pow(norm, 3));
        } else if (dist === 'logarithmic') {
            raw.push(norm === 0 ? 0 : Math.log10(1 + 9 * norm));
        } else if (dist === 'sinusoidal') {
            // Amplitude auto-scaled to stay monotonic; endpoints remain anchored at 0 and 1
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

    if (mult) {
        const exp = Math.pow(2, -mult);
        result = result.map(t => Math.pow(Math.max(0, Math.min(1, t)), exp));
    }

    return result;
}

function quadBezier(x0, y0, cx, cy, x1, y1, t) {
    const mt = 1 - t;
    return {
        x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
        y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
    };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpHex(c1, c2, t) {
    const parse = (h) => {
        const s = (h ?? '#ffffff').replace('#', '');
        if (s.length !== 6) return [255, 255, 255];
        return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    };
    const [r1, g1, b1] = parse(c1);
    const [r2, g2, b2] = parse(c2);
    return `rgb(${Math.round(lerp(r1, r2, t))},${Math.round(lerp(g1, g2, t))},${Math.round(lerp(b1, b2, t))})`;
}

function paletteColor(mode, palette) {
    const idx = parseInt((mode ?? 'palette0').replace('palette', ''));
    return (palette?.[isNaN(idx) ? 0 : idx]) ?? '#ffffff';
}

function colorAtT(stops, t) {
    for (let i = 0; i < stops.length - 1; i++) {
        if (t <= stops[i + 1].t) {
            const span = stops[i + 1].t - stops[i].t;
            const local = span < 0.0001 ? 0 : (t - stops[i].t) / span;
            return lerpHex(stops[i].color, stops[i + 1].color, local);
        }
    }
    return stops[stops.length - 1].color;
}

function drawShape(ctx, type, sides, cx, cy, size, rotation) {
    const r = size / 2;
    ctx.beginPath();
    if (type === 'ellipse') {
        ctx.ellipse(cx, cy, Math.max(0.5, r), Math.max(0.5, r), rotation, 0, Math.PI * 2);
    } else {
        const n = type === 'triangle' ? 3
                : type === 'rectangle' ? 4
                : Math.max(3, Math.min(12, Math.round(sides)));
        // Rectangle starts at 45° so sides are axis-aligned; others start pointing up
        const startAngle = type === 'rectangle' ? Math.PI / 4 : -Math.PI / 2;
        for (let i = 0; i < n; i++) {
            const angle = rotation + startAngle + (i / n) * Math.PI * 2;
            const vx = cx + r * Math.cos(angle);
            const vy = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(vx, vy);
            else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
    }
}

function applyTunnel(ctx, p) {
    const W = canvas.width, H = canvas.height;

    const x1 = (p.tunnelX1 ?? 25) / 100 * W;
    const y1 = (p.tunnelY1 ?? 50) / 100 * H;
    const x2 = (p.tunnelX2 ?? 75) / 100 * W;
    const y2 = (p.tunnelY2 ?? 50) / 100 * H;
    const bcx = (p.tunnelCx ?? 50) / 100 * W;
    const bcy = (p.tunnelCy ?? 40) / 100 * H;

    const count = Math.max(2, Math.round(p.tunnelCount ?? 12));
    const ts = computeTunnelTs(
        count,
        p.tunnelRampDist    ?? 'even',
        p.tunnelRampFormula ?? 'x',
        p.tunnelRampMult    ?? 0,
        p.tunnelRampCycles  ?? 3,
    );

    const originSize  = p.tunnelOriginSize  ?? 40;
    const finalSize   = p.tunnelFinalSize   ?? 300;
    const originRot   = (p.tunnelOriginRotation ?? 0) * Math.PI / 180;
    const twist       = (p.tunnelTwist ?? 0) * Math.PI / 180;
    const thickness   = p.tunnelThickness ?? 1;
    const thickScale  = p.tunnelThicknessScale ?? 3;
    const opacity     = p.tunnelLineOpacity ?? 1;
    const opacScale   = p.tunnelLineOpacityScale ?? 1;
    const palette     = p._activePalette;
    const originColor = paletteColor(p.tunnelOriginColorMode, palette);
    const finalColor  = paletteColor(p.tunnelFinalColorMode,  palette);
    const shape       = p.tunnelShape ?? 'ellipse';
    const sides       = p.tunnelPolySides ?? 6;

    // Build sorted color stop list; midpoints with colorMode === 'none' are skipped
    const MID_POS_DEFAULTS = [0.14, 0.29, 0.43, 0.57, 0.71, 0.86];
    const colorStops = [{ t: 0, color: originColor }];
    for (let mi = 0; mi < 6; mi++) {
        const mode = p[`tunnelMid${mi}ColorMode`];
        if (mode && mode !== 'none') {
            colorStops.push({
                t:     p[`tunnelMid${mi}Pos`] ?? MID_POS_DEFAULTS[mi],
                color: paletteColor(mode, palette),
            });
        }
    }
    colorStops.push({ t: 1, color: finalColor });
    colorStops.sort((a, b) => a.t - b.t);

    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < ts.length; i++) {
        const t  = ts[i];
        const pt = quadBezier(x1, y1, bcx, bcy, x2, y2, t);

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, lerp(opacity, opacity * opacScale, t)));
        ctx.strokeStyle = colorAtT(colorStops, t);
        ctx.lineWidth   = Math.max(0.1, lerp(thickness, thickness * thickScale, t));
        drawShape(ctx, shape, sides, pt.x, pt.y, lerp(originSize, finalSize, t), originRot + t * twist);
        ctx.stroke();
        ctx.restore();
    }

    ctx.restore();
}

const FORMULA_INFO = `
<strong>Variable</strong><br>
&nbsp;&nbsp;x — shape index (0 to N−1)<br><br>
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

const PALETTE_OPTIONS = [
    ['palette0','Palette 1'],['palette1','Palette 2'],['palette2','Palette 3'],['palette3','Palette 4'],
    ['palette4','Palette 5'],['palette5','Palette 6'],['palette6','Palette 7'],['palette7','Palette 8'],
];

const MID_COLOR_OPTIONS = [['none', '— Off —'], ...PALETTE_OPTIONS];

const DIST_OPTIONS = [
    ['even',        'Even'],
    ['exponential', 'Exponential'],
    ['logarithmic', 'Logarithmic'],
    ['sinusoidal',  'Sinusoidal'],
    ['formula',     'Custom Formula'],
];

export const tunnelEffect = {
    name:        'tunnel',
    label:       'Tunnel',
    kind:        'context',
    blendPrefix: 'tunnel',
    overlays:    {},
    bindUniforms: (gl, prog, p) => { fade.bindUniforms(gl, prog, p); blend.bindUniforms(gl, prog, p); },
    paramKeys:   [...fade.paramKeys, ...blend.paramKeys],
    params: {
        tunnelEnabled:          { default: false,      label: 'Enable' },
        tunnelX1:               { default: 25,         hidden: true },
        tunnelY1:               { default: 50,         hidden: true },
        tunnelX2:               { default: 75,         hidden: true },
        tunnelY2:               { default: 50,         hidden: true },
        tunnelCx:               { default: 50,         hidden: true },
        tunnelCy:               { default: 40,         hidden: true },
        tunnelShape:            { default: 'ellipse',  label: 'Shape', options: [['ellipse', 'Ellipse'], ['rectangle', 'Rectangle'], ['triangle', 'Triangle'], ['polygon', 'Polygon']] },
        tunnelPolySides:        { default: 6,          min: 3, max: 12, step: 1, label: 'Sides' },
        tunnelCount:            { default: 12,         min: 2, max: 100, step: 1, label: 'Count' },
        tunnelOriginSize:       { default: 40,         min: 5, max: 500, step: 1, label: 'Origin Size' },
        tunnelFinalSize:        { default: 300,        min: 5, max: 6000, step: 1, label: 'Final Size' },
        tunnelOriginRotation:   { default: 0,          min: -180, max: 180, step: 1, label: 'Origin Rotation' },
        tunnelTwist:            { default: 0,          min: -360, max: 360, step: 1, label: 'Twist' },
        tunnelOriginColorMode:  { default: 'palette0', label: 'Origin Color', type: 'paletteSelect', options: PALETTE_OPTIONS },
        tunnelMid0ColorMode:    { default: 'none',     label: 'Stop 1',       type: 'paletteSelect', options: MID_COLOR_OPTIONS },
        tunnelMid0Pos:          { default: 0.14,       min: 0, max: 1, step: 0.01, label: 'Position' },
        tunnelMid1ColorMode:    { default: 'none',     label: 'Stop 2',       type: 'paletteSelect', options: MID_COLOR_OPTIONS },
        tunnelMid1Pos:          { default: 0.29,       min: 0, max: 1, step: 0.01, label: 'Position' },
        tunnelMid2ColorMode:    { default: 'none',     label: 'Stop 3',       type: 'paletteSelect', options: MID_COLOR_OPTIONS },
        tunnelMid2Pos:          { default: 0.43,       min: 0, max: 1, step: 0.01, label: 'Position' },
        tunnelMid3ColorMode:    { default: 'none',     label: 'Stop 4',       type: 'paletteSelect', options: MID_COLOR_OPTIONS },
        tunnelMid3Pos:          { default: 0.57,       min: 0, max: 1, step: 0.01, label: 'Position' },
        tunnelMid4ColorMode:    { default: 'none',     label: 'Stop 5',       type: 'paletteSelect', options: MID_COLOR_OPTIONS },
        tunnelMid4Pos:          { default: 0.71,       min: 0, max: 1, step: 0.01, label: 'Position' },
        tunnelMid5ColorMode:    { default: 'none',     label: 'Stop 6',       type: 'paletteSelect', options: MID_COLOR_OPTIONS },
        tunnelMid5Pos:          { default: 0.86,       min: 0, max: 1, step: 0.01, label: 'Position' },
        tunnelFinalColorMode:   { default: 'palette0', label: 'Final Color',  type: 'paletteSelect', options: PALETTE_OPTIONS },
        tunnelThickness:        { default: 1,          min: 0.5, max: 20, step: 0.5, label: 'Thickness' },
        tunnelThicknessScale:   { default: 3,          min: 0.1, max: 10, step: 0.1, label: 'Thickness Scale' },
        tunnelLineOpacity:      { default: 1,          min: 0, max: 1, step: 0.01, label: 'Opacity' },
        tunnelLineOpacityScale: { default: 1,          min: 0, max: 5, step: 0.1,  label: 'Opacity Scale' },
        tunnelRampDist:         { default: 'even',     label: 'Ramp Formula', options: DIST_OPTIONS },
        tunnelRampMult:         { default: 0,          min: -3, max: 3, step: 0.1, label: 'Multiplier' },
        tunnelRampCycles:       { default: 3,          min: 1, max: 20, step: 1,   label: 'Cycles' },
        tunnelRampFormula:      { default: 'x',        label: 'Formula', info: FORMULA_INFO },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.tunnelEnabled,
    uiGroups: (p) => [
        { label: 'Shape',  keys: ['tunnelShape', ...(p.tunnelShape === 'polygon' ? ['tunnelPolySides'] : [])] },
        { label: 'Series', keys: ['tunnelCount', 'tunnelOriginSize', 'tunnelFinalSize', 'tunnelOriginRotation', 'tunnelTwist'] },
        { label: 'Colors', keys: [
            'tunnelOriginColorMode',
            'tunnelMid0ColorMode', ...(p.tunnelMid0ColorMode !== 'none' ? ['tunnelMid0Pos'] : []),
            'tunnelMid1ColorMode', ...(p.tunnelMid1ColorMode !== 'none' ? ['tunnelMid1Pos'] : []),
            'tunnelMid2ColorMode', ...(p.tunnelMid2ColorMode !== 'none' ? ['tunnelMid2Pos'] : []),
            'tunnelMid3ColorMode', ...(p.tunnelMid3ColorMode !== 'none' ? ['tunnelMid3Pos'] : []),
            'tunnelMid4ColorMode', ...(p.tunnelMid4ColorMode !== 'none' ? ['tunnelMid4Pos'] : []),
            'tunnelMid5ColorMode', ...(p.tunnelMid5ColorMode !== 'none' ? ['tunnelMid5Pos'] : []),
            'tunnelFinalColorMode',
        ]},
        { label: 'Style',  keys: ['tunnelThickness', 'tunnelThicknessScale', 'tunnelLineOpacity', 'tunnelLineOpacityScale'] },
        { label: 'Ramp',   keys: ['tunnelRampDist', ...(p.tunnelRampDist !== 'even' ? ['tunnelRampMult'] : []), ...(p.tunnelRampDist === 'sinusoidal' ? ['tunnelRampCycles'] : []), ...(p.tunnelRampDist === 'formula' ? ['tunnelRampFormula'] : [])] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    canvas2d: applyTunnel,
};
