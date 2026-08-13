import { buildFadeControl, buildBlendControl } from './controls/index.js';
import { resolveColorKey, STANDARD_COLOR_OPTIONS } from './colorOptions.js';

const fade  = buildFadeControl('lineDrag');
const blend = buildBlendControl('lineDrag');

function hexToRgb01(hex) {
    const n = parseInt((hex || '#000000').replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const lineDragEffect = {
    name:  'lineDrag',
    label: 'Line Drag',
    kind:  'glsl',

    handleParams: ['lineDragX', 'lineDragY', 'lineDragAngle', 'lineDragPointX', 'lineDragPointY', ...fade.handleParams],

    paramKeys: [
        'lineDragX', 'lineDragY', 'lineDragAngle', 'lineDragDir',
        'lineDragMode', 'lineDragPointX', 'lineDragPointY', 'lineDragCurve', 'lineDragBgColor', 'lineDragBgOpacity',
        ...blend.paramKeys,
        ...fade.paramKeys,
    ],

    params: {
        lineDragEnabled: { default: false, label: 'Enable' },
        lineDragMode:    { default: 'parallel', label: 'Mode', options: [['parallel', 'Parallel'], ['converge', 'Converge'], ['diverge', 'Diverge']] },
        lineDragX:       { default: 50, min: 0, max: 100, label: 'X' },
        lineDragY:       { default: 50, min: 0, max: 100, label: 'Y' },
        lineDragAngle:   { default: 0, min: -89, max: 89, step: 1, label: 'Angle' },
        lineDragDir:     { default: 'down', label: 'Direction', options: [['down', 'Down'], ['up', 'Up'], ['right', 'Right'], ['left', 'Left']] },
        lineDragPointX:  { default: 50, min: 0, max: 100, label: 'Point X' },
        lineDragPointY:  { default: 100, min: 0, max: 100, label: 'Point Y' },
        lineDragCurve:   { default: 60, min: 0, max: 100, label: 'Curve' },
        lineDragBgColor: { default: 'palette0', type: 'paletteSelect', options: STANDARD_COLOR_OPTIONS, label: 'Background' },
        lineDragBgOpacity: { default: 100, min: 0, max: 100, label: 'BG Opacity' },
        ...blend.params,
        ...fade.params,
    },

    uiGroups: [
        { keys: ['lineDragEnabled', 'lineDragMode', 'lineDragAngle', 'lineDragDir', 'lineDragCurve', 'lineDragBgColor', 'lineDragBgOpacity'] },
        blend.uiGroup,
        fade.uiGroup,
    ],

    enabled: (p) => p.lineDragEnabled,

    bindUniforms: (gl, prog, p) => {
        const s  = prog._locs;
        const si = (k, v) => { if (s[k] != null) gl.uniform1i(s[k], v); };
        const s3 = (k, a) => { if (s[k] != null) gl.uniform3fv(s[k], a); };
        si('lineDragDir', { down: 0, up: 1, right: 2, left: 3 }[p.lineDragDir] ?? 0);
        si('lineDragMode', { parallel: 0, converge: 1, diverge: 2 }[p.lineDragMode] ?? 0);
        const hex = resolveColorKey(p.lineDragBgColor, p._activePalette) ?? '#000000';
        s3('lineDragBgColor', hexToRgb01(hex));
        fade.bindUniforms(gl, prog, p);
        blend.bindUniforms(gl, prog, p);
    },

    glsl: `
uniform float lineDragX;
uniform float lineDragY;
uniform float lineDragAngle;
uniform int   lineDragDir;
uniform int   lineDragMode;
uniform float lineDragPointX;
uniform float lineDragPointY;
uniform float lineDragCurve;
uniform vec3  lineDragBgColor;
uniform float lineDragBgOpacity;
${blend.glsl}
${fade.glsl}
void main() {
    vec2 uv = vUV;

    float lineX = lineDragX / 100.0;
    float lineY = 1.0 - lineDragY / 100.0;
    float slope = -tan(lineDragAngle * 3.14159265 / 180.0);
    float curve = lineDragCurve / 100.0;
    vec2  focal = vec2(lineDragPointX / 100.0, 1.0 - lineDragPointY / 100.0);
    // Diverge fans from an auto point BEHIND the line (opposite the drag region);
    // higher Curve pulls it closer for a wider fan. Distance from the anchor:
    float divD  = mix(2.0, 0.15, curve);

    vec2 sampleUV;
    bool inDragRegion;
    bool isBackground = false;

    if (lineDragDir == 0 || lineDragDir == 1) {
        // Vertical drag: streaks run along columns; warp the sampled column.
        float lineYraw = lineY + slope * (uv.x - lineX);
        float sampleY  = clamp(lineYraw, 0.0, 1.0);
        bool  below    = uv.y < sampleY;
        inDragRegion   = (lineDragDir == 0) ? below : !below;

        if (lineDragMode == 0) {
            sampleUV = vec2(uv.x, sampleY);
        } else {
            // t: 0 at the control line, 1 at the far edge of the drag region.
            float t = (lineDragDir == 0)
                ? clamp((lineYraw - uv.y) / max(lineYraw, 1e-4), 0.0, 1.0)
                : clamp((uv.y - lineYraw) / max(1.0 - lineYraw, 1e-4), 0.0, 1.0);
            // Converge samples along rays through the user's focal point (in front of the
            // line); diverge uses the SAME rays but through an auto point behind the line,
            // which fans the streaks apart. One code path, different focal point.
            vec2 fp = (lineDragMode == 1)
                ? focal
                : vec2(lineX, lineY + ((lineDragDir == 0) ? divD : -divD));
            float denom  = (uv.y - fp.y) - slope * (uv.x - fp.x);
            denom        = (abs(denom) < 1e-4) ? (denom < 0.0 ? -1e-4 : 1e-4) : denom;
            float k      = (lineY + slope * (fp.x - lineX) - fp.y) / denom;
            float radial = fp.x + k * (uv.x - fp.x);
            float col    = mix(uv.x, radial, t * curve);
            float cy = lineY + slope * (col - lineX);
            sampleUV = vec2(col, cy);
            isBackground = (col < 0.0 || col > 1.0 || cy < 0.0 || cy > 1.0);
        }
    } else {
        if (abs(slope) < 0.001) {
            fragColor = texture(uTex, uv);
            return;
        }
        // Horizontal drag: streaks run along rows; warp the sampled row.
        float lineXraw = lineX + (uv.y - lineY) / slope;
        float sampleX  = clamp(lineXraw, 0.0, 1.0);
        bool  rightOf  = uv.x > sampleX;
        inDragRegion   = (lineDragDir == 2) ? rightOf : !rightOf;

        if (lineDragMode == 0) {
            sampleUV = vec2(sampleX, uv.y);
        } else {
            float t = (lineDragDir == 2)
                ? clamp((uv.x - lineXraw) / max(1.0 - lineXraw, 1e-4), 0.0, 1.0)
                : clamp((lineXraw - uv.x) / max(lineXraw, 1e-4), 0.0, 1.0);
            vec2 fp = (lineDragMode == 1)
                ? focal
                : vec2(lineX + ((lineDragDir == 2) ? -divD : divD), lineY);
            float denom  = (uv.y - fp.y) - slope * (uv.x - fp.x);
            denom        = (abs(denom) < 1e-4) ? (denom < 0.0 ? -1e-4 : 1e-4) : denom;
            float k      = (lineY + slope * (fp.x - lineX) - fp.y) / denom;
            float radial = fp.y + k * (uv.y - fp.y);
            float row    = mix(uv.y, radial, t * curve);
            float cx = lineX + (row - lineY) / slope;
            sampleUV = vec2(cx, row);
            isBackground = (row < 0.0 || row > 1.0 || cx < 0.0 || cx > 1.0);
        }
    }

    vec4 origColor    = texture(uTex, uv);
    // Background fades to the underlying image as BG Opacity drops (100 = solid).
    vec3 bgColor      = mix(origColor.rgb, lineDragBgColor, lineDragBgOpacity / 100.0);
    vec4 sampledColor = isBackground ? vec4(bgColor, origColor.a) : texture(uTex, sampleUV);

    bool passThreshold = ${blend.thresholdFn}(origColor, sampledColor);
    vec4 effectColor = (inDragRegion && (passThreshold || isBackground)) ? sampledColor : origColor;

    float weight = ${fade.fnName}();

    vec3 mixed = mix(origColor.rgb, effectColor.rgb, weight);
    fragColor = vec4(${blend.blendFn}(origColor.rgb, mixed), origColor.a);
}
`,
};
