import { blendMapTexture, blendMapImage, blendMapPosX, blendMapPosY, blendMapRot, blendMapZoom } from '../../renderer/glstate.js';

let _fallbackTex = null;
function _getFallbackTex(gl) {
    if (_fallbackTex) return _fallbackTex;
    _fallbackTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, _fallbackTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return _fallbackTex;
}

const THRESHOLD_GLSL = `
uniform float __P__Threshold;
uniform int   __P__ThresholdTarget;
uniform int   __P__ThresholdReverse;

bool __FN__(vec4 color) {
    float val;
    if      (__P__ThresholdTarget == 1) val = color.r;
    else if (__P__ThresholdTarget == 2) val = color.g;
    else if (__P__ThresholdTarget == 3) val = color.b;
    else                                val = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float thresh = __P__Threshold / 100.0;
    return (__P__ThresholdReverse == 1) ? (val <= thresh) : (val >= thresh);
}
`;

const BLEND_MODES = [
    ['screen',     'Screen'],
    ['multiply',   'Multiply'],
    ['add',        'Add'],
    ['overlay',    'Overlay'],
    ['difference', 'Difference'],
    ['normal',     'Normal'],
    ['blend_map',  'Blend Map'],
];

const BLEND_MAP = { normal: 0, screen: 1, multiply: 2, add: 3, overlay: 4, difference: 5, blend_map: 6 };

const BLEND_GLSL = `
uniform int   __P__BlendEnabled;
uniform int   __P__BlendMode;
uniform float __P__Opacity;
uniform sampler2D uBlendMapTex;
uniform float blendMapPosX;
uniform float blendMapPosY;
uniform float blendMapRot;
uniform float blendMapZoom;
uniform vec2  uBlendMapTexSize;
uniform int   __P__BlendMapInvert;
uniform float __P__BlendMapAmount;
uniform float __P__BlendMapScale;
uniform float __P__BlendMapRadius;

float __P__BlendCh(float a, float b) {
    if      (__P__BlendMode == 1) return 1.0 - (1.0-a)*(1.0-b);
    else if (__P__BlendMode == 2) return a * b;
    else if (__P__BlendMode == 3) return min(1.0, a + b);
    else if (__P__BlendMode == 4) return a < 0.5 ? 2.0*a*b : 1.0 - 2.0*(1.0-a)*(1.0-b);
    else if (__P__BlendMode == 5) return abs(a - b);
    return b;
}

vec3 __P__Blend(vec3 base, vec3 src) {
    if (__P__BlendEnabled != 1) return src;
    if (__P__BlendMode == 6) {
        float baseA = uResolution.x / uResolution.y;
        // Work in an isotropic, frame-centered space (1 unit = frame height) so rotation
        // is a true rotation instead of a shear skewed by the base aspect ratio.
        vec2 p = vUV - 0.5;
        p.x *= baseA;
        p -= vec2(blendMapPosX / 100.0 * baseA, blendMapPosY / 100.0);
        float bmRad = blendMapRot * 3.14159265 / 180.0;
        float bmCos = cos(bmRad), bmSin = sin(bmRad);
        p = mat2(bmCos, bmSin, -bmSin, bmCos) * p;
        p /= max(blendMapZoom / 100.0, 0.01);
        // Map isotropic space -> texture space, preserving the map image's aspect ("contain").
        // disp = the frame extent in isotropic units; without a map it stays neutral.
        vec2 disp = vec2(baseA, 1.0);
        if (uBlendMapTexSize.x > 0.0 && uBlendMapTexSize.y > 0.0) {
            float imgA = uBlendMapTexSize.x / uBlendMapTexSize.y;
            disp = imgA > baseA ? vec2(baseA, baseA / imgA) : vec2(imgA, 1.0);
        }
        vec2 bmUV = p / disp + 0.5;
        float L = dot(texture(uBlendMapTex, bmUV).rgb, vec3(0.299, 0.587, 0.114));
        if (__P__BlendMapInvert == 1) L = 1.0 - L;
        L = L + __P__BlendMapRadius / 100.0;
        L = clamp((L - 0.5) * float(__P__BlendMapScale) + 0.5, 0.0, 1.0);
        float blendScale = clamp(__P__BlendMapAmount / 100.0, 0.001, 1.0);
        float weight = clamp((L - (1.0 - blendScale)) / blendScale, 0.0, 1.0);
        return mix(base, src, weight);
    }
    vec3 blended = vec3(
        __P__BlendCh(base.r, src.r),
        __P__BlendCh(base.g, src.g),
        __P__BlendCh(base.b, src.b)
    );
    return mix(base, blended, __P__Opacity / 100.0);
}
`;

const BLEND_THRESHOLD_GLSL = `
uniform float __P__Threshold;
uniform int   __P__ThresholdTarget;
uniform int   __P__ThresholdReverse;

bool __FN__(vec4 destColor, vec4 srcColor) {
    if (__P__BlendEnabled != 1) return true;
    if (__P__BlendMode == 6) return true;
    vec4 color = destColor;
    float val;
    if      (__P__ThresholdTarget == 1) val = color.r;
    else if (__P__ThresholdTarget == 2) val = color.g;
    else if (__P__ThresholdTarget == 3) val = color.b;
    else                                val = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float thresh = __P__Threshold / 100.0;
    return (__P__ThresholdReverse == 1) ? (val <= thresh) : (val >= thresh);
}
`;

export function buildThresholdControl(prefix, defaults = {}) {
    const p   = prefix;
    const cap = p.charAt(0).toUpperCase() + p.slice(1);
    const thresholdFn = `calc${cap}ThresholdMet`;
    const glsl = THRESHOLD_GLSL.replaceAll('__P__', p).replaceAll('__FN__', thresholdFn);

    return {
        glsl,
        fnName: thresholdFn,
        params: {
            [`${p}Threshold`]:        { default: defaults.threshold ?? 0, min: 0, max: 100, label: 'Threshold' },
            [`${p}ThresholdTarget`]:  { default: 'lum', options: [['lum', 'Luminance'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']], label: 'Target' },
            [`${p}ThresholdReverse`]: { default: false, label: 'Reverse Threshold' },
        },
        paramKeys: [`${p}Threshold`, `${p}ThresholdTarget`, `${p}ThresholdReverse`],
        uiGroup: { label: 'Threshold', keys: [`${p}Threshold`, `${p}ThresholdTarget`, `${p}ThresholdReverse`] },
        bindUniforms(gl, prog, params) {
            const locs = prog._locs;
            const si = (k, v) => { if (locs[k] != null) gl.uniform1i(locs[k], v); };
            si(`${p}ThresholdTarget`,  { lum: 0, r: 1, g: 2, b: 3 }[params[`${p}ThresholdTarget`]] ?? 0);
            si(`${p}ThresholdReverse`, params[`${p}ThresholdReverse`] ? 1 : 0);
        },
    };
}

export function buildBlendControl(prefix, defaults = {}) {
    const p   = prefix;
    const cap = p.charAt(0).toUpperCase() + p.slice(1);
    const thresholdFn = `calc${cap}ThresholdMet`;

    const glsl = BLEND_GLSL.replaceAll('__P__', p)
               + BLEND_THRESHOLD_GLSL.replaceAll('__P__', p).replaceAll('__FN__', thresholdFn);

    return {
        glsl,
        thresholdFn,
        blendFn:   `${p}Blend`,
        blendChFn: `${p}BlendCh`,
        params: {
            [`${p}BlendEnabled`]:      { default: false, label: 'Enable Blend' },
            [`${p}BlendMode`]:         { default: defaults.mode    ?? 'normal', options: BLEND_MODES, label: 'Blend Mode' },
            [`${p}Opacity`]:           { default: defaults.opacity ?? 50, min: 0, max: 100, label: 'Opacity' },
            [`${p}Threshold`]:         { default: defaults.threshold ?? 0, min: 0, max: 100, label: 'Threshold' },
            [`${p}ThresholdTarget`]:   { default: 'lum', options: [['lum', 'Luminance'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']], label: 'Threshold Target' },
            [`${p}ThresholdReverse`]:  { default: false, label: 'Reverse Threshold' },
            [`${p}BlendMapAmount`]:    { default: 100, min: 0, max: 100, label: 'Blend Amount' },
            [`${p}BlendMapScale`]:     { default: 1, min: 1, max: 10, label: 'Map Scale' },
            [`${p}BlendMapRadius`]:    { default: 0, min: -50, max: 50, label: 'Map Radius' },
            [`${p}BlendMapInvert`]:    { default: false, label: 'Invert Map' },
        },
        paramKeys: [
            `${p}BlendEnabled`, `${p}BlendMode`, `${p}Opacity`,
            `${p}Threshold`, `${p}ThresholdTarget`, `${p}ThresholdReverse`,
            `${p}BlendMapAmount`, `${p}BlendMapScale`, `${p}BlendMapRadius`, `${p}BlendMapInvert`,
        ],
        uiGroup: {
            label: 'Blend',
            conditionKey: `${p}BlendEnabled`,
            keys: [
                `${p}BlendEnabled`, `${p}BlendMode`, `${p}Opacity`,
                `${p}Threshold`, `${p}ThresholdTarget`, `${p}ThresholdReverse`,
                `${p}BlendMapAmount`, `${p}BlendMapScale`, `${p}BlendMapRadius`, `${p}BlendMapInvert`,
            ],
        },
        bindUniforms(gl, prog, params) {
            const locs = prog._locs;
            const si = (k, v) => { if (locs[k] != null) gl.uniform1i(locs[k], v); };
            si(`${p}BlendEnabled`,     params[`${p}BlendEnabled`] ? 1 : 0);
            si(`${p}BlendMode`,        BLEND_MAP[params[`${p}BlendMode`]] ?? 1);
            si(`${p}ThresholdTarget`,  { lum: 0, r: 1, g: 2, b: 3 }[params[`${p}ThresholdTarget`]] ?? 0);
            si(`${p}ThresholdReverse`, params[`${p}ThresholdReverse`] ? 1 : 0);
            si(`${p}BlendMapInvert`,   params[`${p}BlendMapInvert`] ? 1 : 0);

            const mapLoc = locs['uBlendMapTex'];
            if (mapLoc != null) {
                gl.activeTexture(gl.TEXTURE2);
                gl.bindTexture(gl.TEXTURE_2D, blendMapTexture ?? _getFallbackTex(gl));
                gl.uniform1i(mapLoc, 2);
            }
            const sf = (name, v) => { const loc = locs[name]; if (loc != null) gl.uniform1f(loc, v); };
            sf('blendMapPosX', blendMapPosX);
            sf('blendMapPosY', blendMapPosY);
            sf('blendMapRot',  blendMapRot);
            sf('blendMapZoom', blendMapZoom);

            // Map image's own pixel dimensions, so the shader can preserve its aspect ratio.
            // (0, 0) when no map is loaded keeps the shader's aspect correction neutral.
            const sizeLoc = locs['uBlendMapTexSize'];
            if (sizeLoc != null) {
                if (blendMapImage) gl.uniform2f(sizeLoc, blendMapImage.width, blendMapImage.height);
                else               gl.uniform2f(sizeLoc, 0, 0);
            }
        },
    };
}
