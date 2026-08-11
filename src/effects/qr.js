// QR Code — an Overlay effect that generates a QR / barcode (or a stylized Mars-parachute pattern)
// and draws it onto the canvas as a size/rotate sticker. It's a `context` effect with
// `blendPrefix: 'qr'`, so the renderer composites it through the shared GLSL blend + fade path
// (see src/renderer/webgl.js:408-433), exactly like the Shape Sticker effect it's modeled on.
//
// Colors come from the shared palette (consumer pattern): dark/background are `paletteSelect`
// params resolved at render against the nearest upstream Color Palette effect (`p._activePalette`).
// Heavy generation is cached per instance in qrEngine.js.

import { canvas } from '../renderer/glstate.js';
import { buildFadeControl, buildBlendControl } from './controls/index.js';
import { STANDARD_COLOR_OPTIONS, resolveColorKey } from './colorOptions.js';
import { getQR, resetQR, normalizePayload, TYPE_META } from './qrEngine.js';

const fade  = buildFadeControl('qr');
const blend = buildBlendControl('qr');

const TYPE_OPTIONS = [
    ['qr', 'Standard QR'], ['microqr', 'Micro QR'], ['rmqr', 'rMQR'],
    ['barcode', 'Barcode'], ['pdf417', 'PDF417'], ['maxicode', 'MaxiCode'],
    ['hanxin', 'Han Xin'], ['aztec', 'Aztec'], ['mars', 'Mars Parachute'],
];

function applyQR(ctx, p) {
    const text = normalizePayload(p.qrText, p.qrIsUrl);
    if (!text) { resetQR(p._instanceId); return; }

    const W = canvas.width, H = canvas.height;
    const palette = p._activePalette;
    const meta = TYPE_META[p.qrType] || TYPE_META.qr;

    const dark = resolveColorKey(p.qrColor, palette, p.qrColorCustom) ?? '#000000';
    const bg = p.qrBg === 'none'
        ? 'transparent'
        : (resolveColorKey(p.qrBg, palette, p.qrBgCustom) ?? '#ffffff');

    const qr = getQR(p._instanceId, {
        qrType: p.qrType,
        text,
        coords: p.qrType === 'mars' ? (p.qrMarsCoords || '') : '',
        ecc: p.qrEcc,
        moduleShape: meta.moduleShapeable ? p.qrModuleShape : 'square',
        centerGap: meta.moduleShapeable ? (p.qrCenterGap || 0) : 0,
        overallShape: p.qrOverallShape,
        dark,
        bg,
    });
    if (!qr) return;   // still generating (or generation failed)

    const sx = (0.5 + p.qrX / 100) * W;
    const sy = (0.5 - p.qrY / 100) * H;
    const sw = (p.qrSize / 100) * W;
    const sh = sw * (qr.height / qr.width);   // preserve the symbology's native aspect ratio

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((p.qrAngle || 0) * Math.PI / 180);
    ctx.imageSmoothingEnabled = false;         // crisp module edges when scaled
    ctx.drawImage(qr, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
}

export const qrEffect = {
    name: 'qr',
    label: 'QR Code',
    kind: 'context',
    blendPrefix: 'qr',
    bindUniforms: (gl, prog, p) => { fade.bindUniforms(gl, prog, p); blend.bindUniforms(gl, prog, p); },
    paramKeys: [
        'qrText', 'qrIsUrl', 'qrType', 'qrEcc', 'qrMarsCoords', 'qrModuleShape', 'qrOverallShape', 'qrCenterGap',
        'qrColor', 'qrColorCustom', 'qrBg', 'qrBgCustom',
        'qrX', 'qrY', 'qrSize', 'qrAngle',
        ...fade.paramKeys,
        ...blend.paramKeys,
    ],
    handleParams: ['qrX', 'qrY', 'qrSize', 'qrAngle', ...fade.handleParams],
    overlays: { fade: fade.overlay },
    params: {
        qrEnabled:      { default: false, label: 'Enable' },
        qrText:         { default: '', type: 'text', label: 'Text / URL' },
        qrIsUrl:        { default: false, label: 'URL mode' },
        qrType:         { default: 'qr', label: 'Type', options: TYPE_OPTIONS },
        qrEcc:          { default: 'H', label: 'Error Correction', options: [['L', 'Low'], ['M', 'Medium'], ['Q', 'Quartile'], ['H', 'High']] },
        qrMarsCoords:   { default: '', label: 'GPS Coords — outer ring (e.g. 34 11 58 N 118 10 31 W)' },
        qrModuleShape:  { default: 'square', label: 'Module Shape', options: [['square', 'Square'], ['circle', 'Circle'], ['hexagon', 'Hexagon']] },
        qrOverallShape: { default: 'square', label: 'Overall Shape', options: [['square', 'Square'], ['rounded', 'Rounded'], ['circle', 'Circle']] },
        qrCenterGap:    { default: 0, min: 0, max: 35, label: 'Center Gap % (for a logo)' },
        qrColor:        { default: 'palette0', label: 'Code Color', type: 'paletteSelect', options: [...STANDARD_COLOR_OPTIONS, ['custom', 'Custom']], customParam: 'qrColorCustom' },
        qrColorCustom:  { default: '#000000', type: 'color', hidden: true },
        qrBg:           { default: 'custom', label: 'Background', type: 'paletteSelect', options: [['none', 'Transparent'], ...STANDARD_COLOR_OPTIONS, ['custom', 'Custom']], customParam: 'qrBgCustom' },
        qrBgCustom:     { default: '#ffffff', type: 'color', hidden: true },
        qrX:            { default: 0,  min: -50,  max: 50,  label: 'Center X' },
        qrY:            { default: 0,  min: -50,  max: 50,  label: 'Center Y' },
        qrSize:         { default: 40, min: 1,    max: 300, label: 'Size' },
        qrAngle:        { default: 0,  min: -180, max: 180, label: 'Angle' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.qrEnabled,
    uiGroups: (p) => {
        const meta = TYPE_META[p.qrType] || TYPE_META.qr;
        const content = p.qrType === 'mars'
            ? ['qrText', 'qrType', 'qrMarsCoords']            // Mars: message words + optional coord ring
            : ['qrText', 'qrIsUrl', 'qrType', 'qrEcc'];
        return [
            { label: 'Content', keys: content },
            { label: 'Style', keys: meta.moduleShapeable ? ['qrOverallShape', 'qrModuleShape', 'qrCenterGap'] : ['qrOverallShape'] },
            { label: 'Colors', keys: ['qrColor', 'qrBg'] },
            blend.uiGroup,
            fade.uiGroup,
        ];
    },
    canvas2d: applyQR,
};
