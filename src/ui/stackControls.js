import { getEffect } from '../effects/registry.js';
import { setInstanceParam } from '../state/effectStack.js';
import { saveState } from '../state/undo.js';

let activeSliderGroup = null;

// Special UI metadata for params that need non-default rendering
const PARAM_LABELS = {
    // transform
    transformEnabled: 'Enable', rotate90: '90°', rotate180: '180°', rotate270: '270°', flipH: 'Flip H', flipV: 'Flip V',
    // crop
    cropEnabled: 'Enable', cropAspect: 'Aspect', cropFlipAspect: 'Flip Aspect', cropX: 'X', cropY: 'Y', cropScale: 'Scale',
    // blackBox
    blackBoxEnabled: 'Enable', blackBoxX: 'X', blackBoxY: 'Y', blackBoxW: 'Width', blackBoxH: 'Height', blackBoxAngle: 'Angle',
    blackBoxFill: 'Fill', blackBoxGrainSize: 'Grain Size', blackBoxStaticSeed: 'Static',
    blackBoxGrabMode: 'Grab Mode',
    // basic
    basicEnabled: 'Enable', brightness: 'Brightness', contrast: 'Contrast',
    saturation: 'Saturation', highlights: 'Highlights', shadows: 'Shadows',
    temperature: 'Temperature', tint: 'Tint',
    basicFadeEnabled: 'Enable Fade', basicFadeShape: 'Shape',
    basicFade: 'Fade', basicFadeW: 'Width', basicFadeH: 'Height',
    basicFadeSlope: 'Transition Slope', basicFadeInvert: 'Invert Fade',
    basicFadeX: 'Center X', basicFadeY: 'Center Y',
    // grain
    grainEnabled: 'Enable', grainIntensity: 'Intensity', grainSize: 'Grain Size',
    // glow
    glowEnabled: 'Enable', glowThreshold: 'Threshold', glowRadius: 'Radius', glowIntensity: 'Intensity',
    glowFade: 'Fade', glowFadeEnabled: 'Enable Fade', glowFadeShape: 'Shape',
    glowFadeSlope: 'Transition Slope', glowFadeInvert: 'Invert Fade',
    glowFadeAngle: 'Angle', glowFadeW: 'Width', glowFadeH: 'Height',
    glowFadeX: 'X', glowFadeY: 'Y',
    // blur
    blurEdge: 'Edge Intensity', blurCenter: 'Center Intensity',
    blurEnabled: 'Enable', blurMode: 'Mode', blurRadius: 'Blur Radius',
    blurMajor: 'Major Axis', blurMinor: 'Minor Axis', blurAngle: 'Angle',
    blurCenterX: 'Center X', blurCenterY: 'Center Y',
    blurPasses: 'Blur Power',
    // vignette
    vignetteEnabled: 'Enable', vignetteMode: 'Mode', vignetteMajor: 'Major Axis',
    vignetteMinor: 'Minor Axis', vignetteAngle: 'Angle', vignetteEdge: 'Edge Brightness',
    vignetteCenter: 'Center Brightness', vignetteCenterX: 'Center X', vignetteCenterY: 'Center Y',
    vignetteTransition: 'Transition',
    // chroma
    chromaEnabled: 'Enable', chromaMode: 'Mode', chromaScale: 'Scale',
    chromaRedX: 'Red X', chromaRedY: 'Red Y', chromaGreenX: 'Green X', chromaGreenY: 'Green Y',
    chromaBlueX: 'Blue X', chromaBlueY: 'Blue Y', chromaCyanX: 'Cyan X', chromaCyanY: 'Cyan Y',
    chromaMagentaX: 'Magenta X', chromaMagentaY: 'Magenta Y', chromaYellowX: 'Yellow X', chromaYellowY: 'Yellow Y',
    chromaThreshold: 'Threshold', chromaThresholdTarget: 'Target', chromaThresholdReverse: 'Reverse Threshold',
    chromaFadeEnabled: 'Enable Fade', chromaFade: 'Fade', chromaFadeSlope: 'Transition Slope', chromaFadeInvert: 'Invert Fade',
    // invert
    invertEnabled: 'Enable', invertColorA: 'Color A', invertColorB: 'Color B',
    invertTarget: 'Target', invertIntensity: 'Threshold', invertReverse: 'Reverse Threshold',
    // digitize
    digitizeEnabled: 'Enable', pixelSize: 'Pixel Size', pixelColors: '# Colors',
    digitizeDither: 'Dithering', digitizeNoise: 'Noise',
    // vhs
    vhsEnabled: 'Enable', vhsTracking: 'Line Glitch', vhsTrackingThickness: 'Thickness', vhsTrackingAmount: 'Amount', vhsTrackingSeed: 'Spacing', vhsTrackingColor: 'Line Color',
    vhsTrackingAngle: 'Line Angle', vhsTrackingWobble: 'Angle Wobble', vhsTrackingWobbleSeed: 'Wobble Seed', vhsTrackingWobbleBtn: 'Wobble Lines',
    // text
    textEnabled: 'Enable', text: 'Text', textFont: 'Font', textSize: 'Size',
    textBold: 'Bold', textItalic: 'Italic', textStrike: 'Strikethrough', textLineHeight: 'Line Height',
    textColor: 'Color', textBg: 'Background',
    textWrap: 'Word Wrap', textAlign: 'Justify', textVAlign: 'V-Align',
    textTLx: 'TL X', textTLy: 'TL Y', textTRx: 'TR X', textTRy: 'TR Y',
    textBRx: 'BR X', textBRy: 'BR Y', textBLx: 'BL X', textBLy: 'BL Y',
    textBoxReset: 'Reset Box',
    // waves
    wavesEnabled: 'Enable', wavesR: 'Red', wavesG: 'Green', wavesB: 'Blue', wavesPhase: 'Phase',
    wavesFadeEnabled: 'Enable Fade', wavesFadeShape: 'Shape',
    wavesFade: 'Fade', wavesFadeW: 'Width', wavesFadeH: 'Height',
    wavesFadeSlope: 'Transition Slope', wavesFadeInvert: 'Invert Fade',
    wavesFadeX: 'Center X', wavesFadeY: 'Center Y',
    // lineDrag
    lineDragEnabled: 'Enable', lineDragX: 'X', lineDragY: 'Y', lineDragAngle: 'Angle', lineDragDir: 'Direction',
    lineDragTarget: 'Target', lineDragThreshold: 'Threshold',
    lineDragThresholdReverse: 'Reverse Threshold', lineDragThresholdOnDest: 'On Destination',
    lineDragFadeEnabled: 'Enable Fade', lineDragFadeShape: 'Shape',
    lineDragFade: 'Fade', lineDragFadeW: 'Width', lineDragFadeH: 'Height',
    lineDragFadeSlope: 'Transition Slope', lineDragFadeInvert: 'Invert Fade',
    lineDragFadeX: 'Center X', lineDragFadeY: 'Center Y',
    // digitalSmear
    smearEnabled: 'Enable', smearWidth: 'Width', smearDirection: 'Direction', smearShift: 'Shift',
    // corrupted
    corruptedEnabled: 'Enable', corruptedSeeds: 'Seeds', corruptedSeed: 'Seed',
    corruptedPattern: 'Pattern', corruptedColor: 'Color', corruptedColorMode: 'Color Mode',
    corruptedInfect: 'Infect', corruptedChunkSize: 'Chunk Size',
    corruptedCluster: 'Cluster', corruptedX: 'Center X', corruptedY: 'Center Y',
    // crt
    crtCurvatureEnabled: 'Enable', crtCurvatureStrength: 'Strength',
    crtCurvatureX: 'Center X', crtCurvatureY: 'Center Y',
    crtCurvatureMajor: 'Major Axis', crtCurvatureMinor: 'Minor Axis', crtCurvatureAngle: 'Angle',
    crtScanlineEnabled: 'Enable', crtScanline: 'Scanline', crtScanSpacing: 'Scan Spacing',
    crtStaticEnabled: 'Enable', crtStatic: 'Static', crtStaticType: 'Static Type', crtStaticGrain: 'Grain Size',
    // viewport
    vpEnabled: 'Enable', vpShape: 'Shape', vpPost: 'Post Mode', vpInvert: 'Invert', vpSides: 'Sides',
    // doubleExposure
    doubleExposureEnabled: 'Enable', doubleExposureChannelMode: 'Channels',
    doubleExposureBlendMode: 'Blend Mode', doubleExposureIntensity: 'Threshold',
    doubleExposureReverse: 'Reverse Threshold',
    // chanSat
    chanSatEnabled: 'Enable', chanSatRed: 'Red', chanSatGreen: 'Green', chanSatBlue: 'Blue',
    chanSatThreshold: 'Target Saturation', chanSatAmount: 'Saturation',
    // matrixRain
    matrixRainEnabled: 'Enable', matrixRainText: 'Text', matrixRainMode: 'Mode',
    matrixRainInjectEnabled: 'Enable Inject', matrixRainInjectPercent: 'Inject %', matrixRainInjectSeed: 'Inject Seed',
    matrixRainSpaceInject: 'Inject Spaces',
    matrixRainDirection: 'Direction', matrixRainOrder: 'Order',
    matrixRainSize: 'Size', matrixRainCharSpacing: 'Char Spacing',
    matrixRainLineSpacing: 'Line Spacing', matrixRainWordSpacing: 'Word Spacing',
    matrixRainFont: 'Font',
    matrixRainX: 'X', matrixRainY: 'Y',
    matrixRainColor: 'Color', matrixRainOpacity: 'Opacity',
};

// Select options for enum params
const PARAM_OPTIONS = {
    vpShape: [['rectangle', 'Rectangle'], ['circle', 'Circle'], ['triangle', 'Triangle'], ['polygon', 'Polygon']],
    cropAspect: [['original', 'Original'], ['1:1', '1:1 (Square)'], ['4:3', '4:3'], ['16:9', '16:9'], ['3:2', '3:2']],
    blurMode:     [['ellipse', 'Ellipse'], ['rectangle', 'Rectangle']],
    vignetteMode: [['ellipse', 'Ellipse'], ['rectangle', 'Rectangle']],
    chromaMode:             [['classic', 'Linear'], ['outline', 'Radial'], ['waves', 'Waves']],
    chromaFadeShape:        [['ellipse', 'Ellipse'], ['rectangle', 'Rectangle']],
    chromaThresholdTarget:  [['lum', 'Luminance'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']],
    invertColorA: [
        ['all', 'All Colors'],
        ['r',  'Red'],
        ['g',  'Green'],
        ['b',  'Blue'],
        ['c',  'Cyan'],
        ['y',  'Yellow'],
        ['m',  'Magenta'],
        ['w',  'White'],
        ['bk', 'Black'],
    ],
    invertColorB: [
        ['r',  'Red'],
        ['g',  'Green'],
        ['b',  'Blue'],
        ['c',  'Cyan'],
        ['y',  'Yellow'],
        ['m',  'Magenta'],
        ['w',  'White'],
        ['bk', 'Black'],
    ],
    invertTarget: [['lum', 'Luminance'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']],
    vhsTrackingColor: [['shift', 'Shift (default)'], ['white', 'White'], ['black', 'Black'], ['noise', 'Noise'], ['color', 'Color Noise']],
    textColor: [
        ['white','White'], ['black','Black'],
        ['red','Red'], ['green','Green'], ['blue','Blue'],
        ['cyan','Cyan'], ['yellow','Yellow'], ['magenta','Magenta'],
        ['greyNoise','Grey Noise'], ['colorNoise','Color Noise'],
    ],
    textBg: [
        ['none','None'], ['black','Black'], ['white','White'],
        ['semi-black','Semi Black'], ['semi-white','Semi White'],
    ],
    textAlign:  [['left','Left'], ['center','Center'], ['right','Right'], ['justify','Justify']],
    textVAlign: [['top','Top'], ['middle','Middle'], ['bottom','Bottom']],
    textFont: [
        ["'JetBrains Mono', monospace",  'JetBrains Mono'],
        ['monospace',                    'Monospace'],
        ["'Courier New', monospace",     'Courier New'],
        ["'Arial', sans-serif",          'Arial'],
        ["'Georgia', serif",             'Georgia'],
        ["'Times New Roman', serif",     'Times New Roman'],
        ['neogreekrunic',                'neogreekrunic'],
        ['splitbitsv2',                  'splitbitsv2'],
    ],
    glowFadeShape: [['ellipse', 'Ellipse'], ['rectangle', 'Rectangle']],
    crtStaticType: [['white', 'White'], ['grey', 'Greyscale'], ['color', 'Color'], ['luma', 'Luma'], ['image', 'Image']],
    doubleExposureChannelMode: [['all', 'All'], ['r', 'R only'], ['g', 'G only'], ['b', 'B only'], ['rg', 'R + G'], ['rb', 'R + B'], ['gb', 'G + B']],
    doubleExposureBlendMode: [['screen', 'Screen'], ['multiply', 'Multiply'], ['add', 'Add'], ['overlay', 'Overlay'], ['difference', 'Difference']],
    smearDirection: [['ltr', 'Left → Right'], ['rtl', 'Right → Left'], ['ttb', 'Top → Bottom'], ['btu', 'Bottom → Top']],
    corruptedPattern: [
        ['splat',        'Splat'],
        ['rubble',       'Rubble'],
        ['detonation',   'Detonation'],
        ['outbreak',     'Outbreak'],
        ['overgrowth',   'Overgrowth'],
        ['worm',         'Worm'],
        ['3-worms',      '3 Worms'],

    ],
    corruptedColor: [
        ['r', 'Red'], ['g', 'Green'], ['b', 'Blue'],
        ['c', 'Cyan'], ['m', 'Magenta'], ['y', 'Yellow'], ['rgb', 'White'],
        ['static', 'Static Noise'], ['color-static', 'Color Static'],
        ['perimeter', 'Perimeter'], ['inside', 'Inside'], ['border', 'Image Border'],
        ['center', 'Image Center'], ['random-img', 'Random from Image'],
    ],
    corruptedColorMode: [['per-chunk', 'Per Chunk'], ['per-zone', 'Per Zone'], ['glitched', 'Glitched']],
    matrixRainMode: [
        ['wordOrder',         'Word Order'],
        ['spaceShuffle',      'Space Shuffle'],
        ['wordShuffle',       'Word Shuffle'],
        ['randomFromContent', 'Random from Content'],
        ['randomAlpha',       'Random Alpha'],
        ['randomNumeric',     'Random Numeric'],
        ['randomAlphanumeric','Random Alphanumeric'],
        ['randomExtended',    'Random Extended (96)'],
    ],
    matrixRainDirection: [['columns', 'Columns'], ['rows', 'Rows']],
    matrixRainOrder:     [['forward', 'Forward'], ['reverse', 'Reverse']],
    matrixRainFont: [
        ['monospace',                   'Monospace'],
        ["'Courier New', monospace",    'Courier New'],
        ["'JetBrains Mono', monospace", 'JetBrains Mono'],
        ["'Arial', sans-serif",         'Arial'],
        ["'Georgia', serif",            'Georgia'],
        ["'Times New Roman', serif",    'Times New Roman'],
        ['neogreekrunic', 'neogreekrunic'],
        ['splitbitsv2', 'splitbitsv2'],
    ],
    matrixRainColor: [
        ['red', 'Red'], ['green', 'Green'], ['blue', 'Blue'],
        ['cyan', 'Cyan'], ['yellow', 'Yellow'], ['magenta', 'Magenta'],
        ['black', 'Black'], ['white', 'White'],
        ['greyNoise', 'Greyscale Noise'],
        ['colorNoise', 'Color Noise'],
        ['imagePaletteNoise',   'Image Palette Inside'],
        ['imagePaletteRandom',  'Image Palette Noise'],
    ],
    blackBoxFill: [
        ['black', 'Black'],
        ['white', 'White'],
        ['red', 'Red'],
        ['green', 'Green'],
        ['blue', 'Blue'],
        ['cyan', 'Cyan'],
        ['yellow', 'Yellow'],
        ['magenta', 'Magenta'],
        ['random', 'Random'],
        ['bw', 'B&W'],
        ['image', 'Image'],
        ['image-static', 'Image Static'],
        ['image-grab', 'Image Grab'],
    ],
    blackBoxGrabMode: [['skew', 'Skew'], ['wrap', 'Wrap']],
    basicFadeShape:   [['ellipse', 'Ellipse'], ['rectangle', 'Rectangle']],
    wavesFadeShape:   [['ellipse', 'Ellipse'], ['rectangle', 'Rectangle']],
    lineDragDir:       [['down', 'Down'], ['up', 'Up'], ['right', 'Right'], ['left', 'Left']],
    lineDragTarget:    [['lum', 'Luminance'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']],
    lineDragFadeShape: [['ellipse', 'Ellipse'], ['rectangle', 'Rectangle']],
};

// Build all parameter controls for one effect instance into a container div.
export function buildEffectBody(inst, onRebuild) {
    const effect = getEffect(inst.effectName);
    if (!effect) return document.createElement('div');

    const enabledKey = Object.keys(effect.params).find(k =>
        k.endsWith('Enabled') &&
        (effect.params[k].default === true || effect.params[k].default === false)
    );

    const content = document.createElement('div');
    content.className = 'tool-content';

    const rawGroups = typeof effect.uiGroups === 'function' ? effect.uiGroups(inst.params) : effect.uiGroups;
    const groups = rawGroups
        ? rawGroups
        : [{ keys: Object.keys(effect.params).filter(k => k !== enabledKey && k !== 'rotate180' && k !== 'rotate270') }];

    for (const group of groups) {
        if (group.label) {
            const header = document.createElement('div');
            header.className = 'control-section-header';
            header.textContent = group.label;
            content.appendChild(header);
        }
        for (const key of group.keys) {
            if (key === enabledKey) continue;
            if (key === 'rotate180' || key === 'rotate270') continue;
            if (effect.handleParams?.includes(key)) continue;
            const schema = effect.params[key];
            if (!schema) continue;
            const controlEl = buildControl(inst, key, schema, onRebuild, group.labels?.[key]);
            if (controlEl) content.appendChild(controlEl);
        }
    }

    if (inst.effectName === 'blackBox' && inst.params.blackBoxFill === 'image-grab') {
        const modeControl = buildControl(inst, 'blackBoxGrabMode', effect.params.blackBoxGrabMode, onRebuild);
        if (modeControl) content.appendChild(modeControl);

        const matchRow = document.createElement('div');
        matchRow.className = 'control-group';
        matchRow.innerHTML = `<div class="control-row"><button class="btn">Match Dimensions</button></div>`;
        matchRow.querySelector('button').addEventListener('click', () => {
            saveState();
            setInstanceParam(inst.id, 'blackBoxW', inst.params.blackBoxGrabW);
            setInstanceParam(inst.id, 'blackBoxH', inst.params.blackBoxGrabH);
        });
        content.appendChild(matchRow);
    }

    if (inst.effectName === 'doubleExposure') {
        const row = document.createElement('div');
        row.className = 'control-group';
        row.innerHTML = `
            <div class="control-row">
                <button class="btn" id="loadSecondImageBtnStack_${inst.id}">Load 2nd Image</button>
                <span id="secondImageName" style="font-size:0.75rem;color:var(--text-dim);margin-left:8px;">No image</span>
            </div>`;
        row.querySelector('button').addEventListener('click', () => {
            document.getElementById('secondFileInput').click();
        });
        content.insertBefore(row, content.firstChild ? content.firstChild.nextSibling : null);
    }

    if (inst.effectName === 'invert') {
        const swapRow = document.createElement('div');
        swapRow.className = 'control-group';
        swapRow.innerHTML = `<div class="control-row"><button class="btn">⇄ Swap Colors</button></div>`;
        const swapBtn = swapRow.querySelector('button');
        swapBtn.addEventListener('click', () => {
            saveState();
            const a = inst.params.invertColorA;
            const b = inst.params.invertColorB;
            setInstanceParam(inst.id, 'invertColorA', b);
            setInstanceParam(inst.id, 'invertColorB', a);
            if (onRebuild) onRebuild();
        });
        const colorASelect = content.querySelector('[data-inst-param="invertColorA"]');
        const colorAGroup = colorASelect?.closest('.control-group');
        if (colorAGroup) colorAGroup.after(swapRow);
        else content.appendChild(swapRow);

        const colorBSelect = content.querySelector('[data-inst-param="invertColorB"]');
        const colorBGroup  = colorBSelect?.closest('.control-group');

        function syncAllColorsState() {
            const isAll = colorASelect?.value === 'all';
            if (colorBSelect) colorBSelect.disabled = isAll;
            if (colorBGroup)  colorBGroup.style.opacity = isAll ? '0.4' : '';
            swapBtn.disabled = isAll;
        }

        colorASelect?.addEventListener('change', syncAllColorsState);
        syncAllColorsState();
    }

    return content;
}

function buildControl(inst, key, schema, onRebuild, labelOverride) {
    const label = labelOverride ?? PARAM_LABELS[key] ?? key;
    const currentVal = inst.params[key];

    // Action button — schema.button names the param to randomize when clicked
    if (schema.button) {
        const group = document.createElement('div');
        group.className = 'control-group';
        const row = document.createElement('div');
        row.className = 'control-row';
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = label;
        btn.addEventListener('click', () => {
            saveState();
            setInstanceParam(inst.id, schema.button, Math.floor(Math.random() * 999) + 1);
        });
        row.appendChild(btn);
        group.appendChild(row);
        return group;
    }

    // Reset Box button for text effect
    if (key === 'textBoxReset') {
        const group = document.createElement('div');
        group.className = 'control-group';
        const row = document.createElement('div');
        row.className = 'control-row';
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = label;
        btn.addEventListener('click', () => {
            saveState();
            setInstanceParam(inst.id, 'textTLx', 10);
            setInstanceParam(inst.id, 'textTLy', 65);
            setInstanceParam(inst.id, 'textTRx', 90);
            setInstanceParam(inst.id, 'textTRy', 65);
            setInstanceParam(inst.id, 'textBRx', 90);
            setInstanceParam(inst.id, 'textBRy', 95);
            setInstanceParam(inst.id, 'textBLx', 10);
            setInstanceParam(inst.id, 'textBLy', 95);
        });
        row.appendChild(btn);
        group.appendChild(row);
        return group;
    }

    // Rotate checkboxes (radio-like - only one can be checked)
    if (key === 'rotate90') {
        const group = document.createElement('div');
        group.className = 'control-group';
        
        const row = document.createElement('div');
        row.className = 'control-row';
        
        const rotations = [
            { key: 'rotate90', label: '90°' },
            { key: 'rotate180', label: '180°' },
            { key: 'rotate270', label: '270°' },
        ];
        
        for (const r of rotations) {
            const wrapper = document.createElement('label');
            wrapper.className = 'checkbox-label';
            wrapper.style.marginRight = '12px';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = inst.params[r.key];
            checkbox.addEventListener('change', () => {
                saveState();
                if (checkbox.checked) {
                    for (const r2 of rotations) {
                        setInstanceParam(inst.id, r2.key, r2.key === r.key);
                    }
                } else {
                    for (const r2 of rotations) {
                        setInstanceParam(inst.id, r2.key, false);
                    }
                }
                if (onRebuild) onRebuild();
            });
            
            wrapper.appendChild(checkbox);
            wrapper.appendChild(document.createTextNode(' ' + r.label));
            row.appendChild(wrapper);
        }
        
        group.appendChild(row);
        return group;
    }

    // Boolean → checkbox
    if (schema.default === false || schema.default === true) {
        const wrapper = document.createElement('label');
        wrapper.className = 'checkbox-label';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = currentVal;
        checkbox.dataset.instParam = key;
        checkbox.addEventListener('change', () => {
            saveState();
            setInstanceParam(inst.id, key, checkbox.checked);
        });
        wrapper.appendChild(checkbox);
        wrapper.appendChild(document.createTextNode(' ' + label));
        return wrapper;
    }

    // Enum → select
    if (PARAM_OPTIONS[key]) {
        const group = document.createElement('div');
        group.className = 'control-group';
        const row = document.createElement('div');
        row.className = 'control-row';
        const labelEl = document.createElement('span');
        labelEl.className = 'control-label';
        labelEl.textContent = label;
        const select = document.createElement('select');
        select.dataset.instParam = key;
        for (const [val, text] of PARAM_OPTIONS[key]) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = text;
            if (val === currentVal) opt.selected = true;
            select.appendChild(opt);
        }
        select.addEventListener('change', () => {
            saveState();
            setInstanceParam(inst.id, key, select.value);
            if (onRebuild) onRebuild();
        });
        row.appendChild(labelEl);
        row.appendChild(select);
        group.appendChild(row);
        return group;
    }

    // Textarea for multi-line text entry
    if (key === 'matrixRainText' || key === 'text') {
        const group = document.createElement('div');
        group.className = 'control-group';
        const labelEl = document.createElement('div');
        labelEl.className = 'control-section-header';
        labelEl.style.cssText = 'font-size:0.75rem;margin-bottom:2px;';
        labelEl.textContent = label;
        const textarea = document.createElement('textarea');
        textarea.value = currentVal;
        textarea.rows = 4;
        textarea.dataset.instParam = key;
        textarea.style.cssText = 'width:100%;resize:vertical;box-sizing:border-box;font-size:0.8rem;';
        if (key === 'text') textarea.maxLength = 5000;
        textarea.addEventListener('input', () => {
            setInstanceParam(inst.id, key, textarea.value);
        });
        group.appendChild(labelEl);
        group.appendChild(textarea);
        if (key === 'text') {
            const tsBtn = document.createElement('button');
            tsBtn.className = 'btn';
            tsBtn.textContent = 'Timestamp';
            tsBtn.style.cssText = 'padding:2px 8px;font-size:0.7rem;margin-top:4px;';
            tsBtn.addEventListener('click', () => {
                const now = new Date();
                const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
                const ts = `${months[now.getMonth()]} ${String(now.getDate()).padStart(2,'0')} ${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
                setInstanceParam(inst.id, key, ts);
                textarea.value = ts;
            });
            group.appendChild(tsBtn);
        }
        return group;
    }

    // Seed → Randomize button
    if (key === 'vhsTrackingSeed' || key === 'blackBoxStaticSeed' || key === 'corruptedSeed'
        || key === 'matrixRainInjectSeed') {
        const group = document.createElement('div');
        group.className = 'control-group';
        const row = document.createElement('div');
        row.className = 'control-row';
        const labelEl = document.createElement('span');
        labelEl.className = 'control-label';
        labelEl.textContent = label;
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm';
        btn.textContent = 'Randomize';
        btn.addEventListener('click', () => {
            saveState();
            setInstanceParam(inst.id, key, Math.floor(Math.random() * 99998) + 1);
        });
        row.appendChild(labelEl);
        row.appendChild(btn);
        group.appendChild(row);
        return group;
    }

    // String (free-text) → text input
    if (typeof schema.default === 'string') {
        const group = document.createElement('div');
        group.className = 'control-group';
        const row = document.createElement('div');
        row.className = 'control-row';
        const labelEl = document.createElement('span');
        labelEl.className = 'control-label';
        labelEl.textContent = label;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentVal;
        input.dataset.instParam = key;
        input.style.cssText = 'width:120px;';
        input.addEventListener('input', () => {
            setInstanceParam(inst.id, key, input.value);
        });
        row.appendChild(labelEl);
        row.appendChild(input);
        
        group.appendChild(row);
        return group;
    }

    // Number with min/max → range slider
    if ('min' in schema && 'max' in schema) {
        const group = document.createElement('div');
        group.className = 'control-group slider-group';

        const row = document.createElement('div');
        row.className = 'control-row';

        const labelEl = document.createElement('span');
        labelEl.className = 'control-label';
        labelEl.textContent = label;

        const step = schema.step ?? (Math.abs(schema.max - schema.min) <= 1 ? 0.01 : 1);

        const decBtn = document.createElement('button');
        decBtn.className = 'slider-btn slider-btn--dec';
        decBtn.textContent = '−';
        decBtn.tabIndex = -1;

        const trackWrapper = document.createElement('div');
        trackWrapper.className = 'slider-track-wrapper';

        const range = document.createElement('input');
        range.type = 'range';
        range.min = schema.min;
        range.max = schema.max;
        range.step = step;
        range.value = currentVal;
        range.dataset.instParam = key;

        const defaultVal = schema.default ?? schema.min;
        const pct = Math.max(2, Math.min(98,
            ((defaultVal - schema.min) / (schema.max - schema.min)) * 100
        ));
        const resetBtn = document.createElement('button');
        resetBtn.className = 'slider-btn slider-btn--reset';
        resetBtn.textContent = '↺';
        resetBtn.title = `Reset to ${defaultVal}`;
        resetBtn.tabIndex = -1;
        resetBtn.style.left = `${pct}%`;

        const incBtn = document.createElement('button');
        incBtn.className = 'slider-btn slider-btn--inc';
        incBtn.textContent = '+';
        incBtn.tabIndex = -1;

        trackWrapper.appendChild(range);
        trackWrapper.appendChild(resetBtn);

        const valueSpan = document.createElement('span');
        valueSpan.className = 'control-value';
        valueSpan.textContent = currentVal;

        function applyValue(v) {
            const clamped = Math.min(schema.max, Math.max(schema.min, v));
            range.value = clamped;
            const parsed = parseFloat(range.value);
            setInstanceParam(inst.id, key, parsed);
            valueSpan.textContent = parsed;
            range.dispatchEvent(new InputEvent('input', { bubbles: true }));
        }

        function activateGroup() {
            if (activeSliderGroup === group) return;
            if (activeSliderGroup) activeSliderGroup.classList.remove('slider-group--active');
            activeSliderGroup = group;
            group.classList.add('slider-group--active');
        }

        range.addEventListener('mousedown', activateGroup);
        range.addEventListener('touchstart', activateGroup, { passive: true });
        range.addEventListener('focus', activateGroup);
        range.addEventListener('input', () => {
            const v = parseFloat(range.value);
            setInstanceParam(inst.id, key, v);
            valueSpan.textContent = v;
        });

        decBtn.addEventListener('click', () => { activateGroup(); applyValue(parseFloat(range.value) - step); });
        incBtn.addEventListener('click', () => { activateGroup(); applyValue(parseFloat(range.value) + step); });
        resetBtn.addEventListener('click', () => { activateGroup(); applyValue(defaultVal); });

        row.appendChild(labelEl);
        row.appendChild(decBtn);
        row.appendChild(trackWrapper);
        row.appendChild(incBtn);
        row.appendChild(valueSpan);
        group.appendChild(row);
        return group;
    }

    // Plain number (no range) → number input
    if (typeof schema.default === 'number') {
        const group = document.createElement('div');
        group.className = 'control-group';
        const row = document.createElement('div');
        row.className = 'control-row';
        const labelEl = document.createElement('span');
        labelEl.className = 'control-label';
        labelEl.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.value = currentVal;
        input.dataset.instParam = key;
        input.addEventListener('input', () => {
            setInstanceParam(inst.id, key, parseFloat(input.value) || 0);
        });
        row.appendChild(labelEl);
        row.appendChild(input);
        group.appendChild(row);
        return group;
    }

    return null;
}
