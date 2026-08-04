import { canvas } from '../renderer/glstate.js';
import { buildFadeControl, buildBlendControl } from './controls/index.js';
import { resolveColorKey, STANDARD_COLOR_OPTIONS } from './colorOptions.js';

const fade  = buildFadeControl('drawTool');
const blend = buildBlendControl('drawTool');

function mkRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

function buildStrokePath(ctx, pts, w, h) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
        const px = (pts[i].x / 100) * w;
        const py = (pts[i].y / 100) * h;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
}

function strokeColor(stroke, activePalette) {
    // Prefer the palette key (resolved live); fall back to a literal hex stored
    // on older strokes for backward compatibility.
    if (stroke.colorKey) return resolveColorKey(stroke.colorKey, activePalette) || stroke.color || '#000000';
    return stroke.color || '#000000';
}

function renderSolidStroke(ctx, stroke, w, h, activePalette) {
    ctx.save();
    buildStrokePath(ctx, stroke.points, w, h);
    ctx.strokeStyle = strokeColor(stroke, activePalette);
    ctx.lineWidth   = stroke.size;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
    ctx.restore();
}

function renderStaticStroke(ctx, stroke, w, h, activePalette) {
    const grainSize  = Math.max(1, Math.round(stroke.grainSize ?? 4));
    const staticType = stroke.staticType ?? 'greyscale';
    const rand       = mkRng(stroke.seed ?? 1);
    const RGBCYM     = ['#ff0000', '#00ff00', '#0000ff', '#00ffff', '#ffff00', '#ff00ff'];

    const noiseOC  = new OffscreenCanvas(w, h);
    const noiseCtx = noiseOC.getContext('2d');
    const imgData  = noiseCtx.createImageData(w, h);
    const data     = imgData.data;
    const cols     = Math.ceil(w / grainSize);
    const rows     = Math.ceil(h / grainSize);

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            let r, g, b;
            if (staticType === 'greyscale') {
                const val = Math.floor(rand() * 256);
                r = g = b = val;
            } else if (staticType === 'rgbcym') {
                const hex = RGBCYM[Math.floor(rand() * 6)];
                const rgb = hex.match(/\w{2}/g).map(v => parseInt(v, 16));
                r = rgb[0]; g = rgb[1]; b = rgb[2];
            } else if (staticType === 'colorPalette' && activePalette) {
                const hex = activePalette[Math.floor(rand() * 8)] ?? '#000000';
                const rgb = hex.match(/\w{2}/g).map(v => parseInt(v, 16));
                r = rgb[0]; g = rgb[1]; b = rgb[2];
            } else {
                r = g = b = 0;
            }
            const px = col * grainSize;
            const py = row * grainSize;
            for (let gy = 0; gy < grainSize && py + gy < h; gy++) {
                for (let gx = 0; gx < grainSize && px + gx < w; gx++) {
                    const idx = ((py + gy) * w + (px + gx)) * 4;
                    data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
                }
            }
        }
    }
    noiseCtx.putImageData(imgData, 0, 0);

    const maskOC  = new OffscreenCanvas(w, h);
    const maskCtx = maskOC.getContext('2d');
    buildStrokePath(maskCtx, stroke.points, w, h);
    maskCtx.strokeStyle = '#fff';
    maskCtx.lineWidth   = stroke.size;
    maskCtx.lineCap     = 'round';
    maskCtx.lineJoin    = 'round';
    maskCtx.stroke();

    noiseCtx.globalCompositeOperation = 'destination-in';
    noiseCtx.drawImage(maskOC, 0, 0);

    ctx.drawImage(noiseOC, 0, 0);
}

function applyDrawTool(ctx, p) {
    let strokes;
    try { strokes = JSON.parse(p.drawToolStrokes || '[]'); } catch { return; }
    if (!strokes.length) return;

    const w = canvas.width;
    const h = canvas.height;

    for (const stroke of strokes) {
        if (!stroke.points?.length) continue;
        if (stroke.fillType === 'static') {
            renderStaticStroke(ctx, stroke, w, h, p._activePalette);
        } else {
            renderSolidStroke(ctx, stroke, w, h, p._activePalette);
        }
    }
}

export const drawToolEffect = {
    name:        'drawTool',
    label:       'Draw',
    kind:        'context',
    blendPrefix: 'drawTool',
    bindUniforms: (gl, prog, p) => { fade.bindUniforms(gl, prog, p); blend.bindUniforms(gl, prog, p); },
    paramKeys:   [...fade.paramKeys, ...blend.paramKeys],
    overlays:    { fade: fade.overlay },
    params: {
        drawToolEnabled:    { default: false,       label: 'Enable' },
        drawToolSize:       { default: 10, min: 1, max: 100, label: 'Brush Size' },
        drawToolFillType:   { default: 'solid',     label: 'Fill Type',    options: [['solid', 'Solid'], ['static', 'Static']] },
        drawToolColor:      { default: 'palette0',  label: 'Color', type: 'paletteSelect', options: STANDARD_COLOR_OPTIONS },
        drawToolStaticType: { default: 'greyscale', label: 'Static Type',  options: [['greyscale', 'Greyscale'], ['rgbcym', 'RGBCYM'], ['colorPalette', 'Color Palette']] },
        drawToolGrainSize:  { default: 4, min: 1, max: 50, label: 'Grain Size' },
        drawToolStrokes:    { default: '[]', hidden: true },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.drawToolEnabled,
    uiGroups: (p) => {
        const brushKeys = ['drawToolSize', 'drawToolFillType'];
        if (p.drawToolFillType === 'static') {
            brushKeys.push('drawToolStaticType', 'drawToolGrainSize');
        } else {
            brushKeys.push('drawToolColor');
        }
        return [
            { label: 'Brush', keys: brushKeys },
            blend.uiGroup,
            fade.uiGroup,
        ];
    },
    canvas2d: applyDrawTool,
};
