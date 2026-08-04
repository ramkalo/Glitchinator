import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('scanlines');
const blend = buildBlendControl('scanlines');

export const scanlinesEffect = {
    name: 'scanlines',
    label: 'Scanlines',
    kind: 'glsl',
    paramKeys: ['scanline', 'scanSpacing', ...fade.paramKeys, ...blend.paramKeys],
    handleParams: [...fade.handleParams],
    uiGroups: [
        { label: 'Warning: this app is still under development. When using the CRT scanlines effect you may notice difference between what you see and what gets exported. Until I fix this issue I recommend taking a screen shot of the final image as this will often preserve moire effects better', keys: [] },
        { keys: ['scanlineEnabled', 'scanline', 'scanSpacing'] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    params: {
        scanlineEnabled: { default: false, label: 'Enable' },
        scanline:        { default: 0, min: 0, max: 100, label: 'Scanline' },
        scanSpacing:     { default: 4, min: 2, max: 12,  label: 'Scan Spacing' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.scanlineEnabled,
    overlays: { fade: fade.overlay },
    bindUniforms: (gl, prog, p) => { fade.bindUniforms(gl, prog, p); blend.bindUniforms(gl, prog, p); },
    glsl: `
uniform float scanline;
uniform float scanSpacing;
${fade.glsl}
${blend.glsl}
void main() {
    vec4 c = texture(uTex, vUV);
    float darken  = 1.0 - (scanline / 100.0) * 0.7;
    float spacing = floor(scanSpacing);
    float row     = floor((1.0 - vUV.y) * uResolution.y);
    float weight  = ${fade.fnName}();
    if (mod(row, spacing) < 1.0) {
        vec3 adjusted = c.rgb * darken;
        vec3 faded = mix(c.rgb, adjusted, weight);
        if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
        fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
    } else {
        fragColor = c;
    }
}
`,
};
