import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('lineGlitch');
const blend = buildBlendControl('lineGlitch');

export const lineGlitchEffect = {
    name: 'lineGlitch',
    label: 'Line Glitch',
    kind: 'glsl',
    paramKeys: ['lineGlitchTracking', 'lineGlitchTrackingThickness', 'lineGlitchTrackingAmount', 'lineGlitchTrackingSeed', 'lineGlitchTrackingColor',
                'lineGlitchTrackingAngle', 'lineGlitchTrackingWobble', 'lineGlitchTrackingWobbleSeed', ...fade.paramKeys, ...blend.paramKeys],
    handleParams: [...fade.handleParams],
    uiGroups: [
        { keys: ['lineGlitchTracking', 'lineGlitchTrackingThickness', 'lineGlitchTrackingAmount', 'lineGlitchTrackingSeed', 'lineGlitchTrackingColor', 'lineGlitchTrackingAngle', 'lineGlitchTrackingWobble', 'lineGlitchTrackingWobbleSeed', 'lineGlitchTrackingWobbleBtn'] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    params: {
        lineGlitchEnabled:            { default: false, label: 'Enable' },
        lineGlitchTracking:           { default: 0,  min: 0,    max: 256, label: 'Line Glitch' },
        lineGlitchTrackingThickness:  { default: 3,  min: 1,    max: 256,  label: 'Thickness' },
        lineGlitchTrackingAmount:     { default: 2,  min: 2,    max: 512,  label: 'Amount' },
        lineGlitchTrackingSeed:       { default: 1,                        label: 'Spacing & Thickness' },
        lineGlitchTrackingColor:      { default: 'shift', label: 'Line Color', options: [['shift', 'Shift (default)'], ['white', 'White'], ['black', 'Black'], ['noise', 'Noise'], ['color', 'Color Noise']] },
        lineGlitchTrackingAngle:      { default: 0,  min: -180, max: 180, label: 'Line Angle' },
        lineGlitchTrackingWobble:     { default: 0,  min: 0,    max: 90,  label: 'Angle Wobble' },
        lineGlitchTrackingWobbleSeed: { default: 1,  min: 1,    max: 999, step: 1, label: 'Wobble Seed' },
        lineGlitchTrackingWobbleBtn:  { default: null, button: 'lineGlitchTrackingWobbleSeed', label: 'Wobble Those Lines' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.lineGlitchEnabled,
    overlays: { fade: fade.overlay },
    bindUniforms: (gl, prog, p) => {
        const loc = prog._locs['lineGlitchTrackingColor'];
        if (loc != null) gl.uniform1i(loc, { shift: 0, white: 1, black: 2, noise: 3, color: 4 }[p.lineGlitchTrackingColor] ?? 0);
        fade.bindUniforms(gl, prog, p);
        blend.bindUniforms(gl, prog, p);
    },
    glsl: `
uniform float lineGlitchTracking;
uniform float lineGlitchTrackingAmount;
uniform float lineGlitchTrackingThickness;
uniform float lineGlitchTrackingSeed;
uniform int   lineGlitchTrackingColor;
uniform float lineGlitchTrackingAngle;
uniform float lineGlitchTrackingWobble;
uniform float lineGlitchTrackingWobbleSeed;
${fade.glsl}
${blend.glsl}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
    vec4 c = texture(uTex, vUV);
    vec4 col = c;

    if (lineGlitchTracking > 0.0) {
        float px = vUV.x * uResolution.x;
        float py = (1.0 - vUV.y) * uResolution.y;
        int numBands = int(lineGlitchTrackingAmount);
        float maxShift = ceil(lineGlitchTracking / 100.0 * uResolution.x * 0.2);
        uint lcgState = uint(max(lineGlitchTrackingSeed, 1.0)) * uint(1664525) + uint(1013904223);

        float baseRad   = lineGlitchTrackingAngle  * (3.14159265 / 180.0);
        float wobbleRad = lineGlitchTrackingWobble * (3.14159265 / 180.0);

        for (int t = 0; t < 20; t++) {
            if (t >= numBands) break;
            lcgState = uint(1664525) * lcgState + uint(1013904223);
            float bandY = float(lcgState) / 4294967296.0 * uResolution.y;
            bandY = clamp(bandY, 0.0, uResolution.y - 1.0);

            uint wblState = uint(t + 1) ^ uint(max(lineGlitchTrackingWobbleSeed, 1.0));
            wblState = uint(1664525) * wblState + uint(1013904223);
            wblState = uint(1664525) * wblState + uint(1013904223);
            float wblRand   = float(wblState) / 4294967296.0 * 2.0 - 1.0;
            float lineAngle = baseRad + wobbleRad * wblRand;

            float proj = px * sin(lineAngle) + py * cos(lineAngle);

            uint hsh = (uint(t + 1) * uint(2654435761)) % uint(1000);
            float shift = (float(hsh) / 999.0 * 2.0 - 1.0) * maxShift;
            float thickMult = 0.5 + float((uint(t + 1) * uint(2246822519)) % uint(1000)) / 999.0;
            float bandThickness = max(1.0, lineGlitchTrackingThickness * thickMult);

            if (proj >= bandY && proj < bandY + bandThickness) {
                if      (lineGlitchTrackingColor == 1) { col = vec4(1.0); }
                else if (lineGlitchTrackingColor == 2) { col = vec4(0.0, 0.0, 0.0, 1.0); }
                else if (lineGlitchTrackingColor == 3) { float n = hash21(vUV); col = vec4(n, n, n, 1.0); }
                else if (lineGlitchTrackingColor == 4) { col = vec4(hash21(vUV), hash21(vUV + vec2(0.1)), hash21(vUV + vec2(0.2)), 1.0); }
                else { col = texture(uTex, vec2(clamp(vUV.x + shift / uResolution.x, 0.0, 1.0), vUV.y)); }
                break;
            }
        }
    }

    float weight = ${fade.fnName}();
    vec3 faded   = mix(c.rgb, col.rgb, weight);
    if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
}
`,
};
