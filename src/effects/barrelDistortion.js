import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('barrelDistortion');
const blend = buildBlendControl('barrelDistortion');

export const barrelDistortionEffect = {
    name: 'barrelDistortion',
    label: 'Barrel Distortion',
    kind: 'glsl',
    paramKeys: ['barrelDistortionStrength', 'barrelDistortionX', 'barrelDistortionY', 'barrelDistortionMajor', 'barrelDistortionMinor', 'barrelDistortionAngle', ...fade.paramKeys, ...blend.paramKeys],
    handleParams: ['barrelDistortionX', 'barrelDistortionY', 'barrelDistortionAngle', ...fade.handleParams],
    uiGroups: [
        { keys: ['barrelDistortionEnabled', 'barrelDistortionStrength'] },
        { label: 'Shape & Position', keys: ['barrelDistortionMajor', 'barrelDistortionMinor', 'barrelDistortionAngle', 'barrelDistortionX', 'barrelDistortionY'] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    params: {
        barrelDistortionEnabled:   { default: false, label: 'Enable' },
        barrelDistortionStrength:  { default: 70,   min: -100,   max: 100, label: 'Strength' },
        barrelDistortionX:         { default: 0,   min: -50, max: 50,   label: 'Center X' },
        barrelDistortionY:         { default: 0,   min: -50, max: 50,   label: 'Center Y' },
        barrelDistortionMajor:     { default: 60,  min: 0,   max: 150,  label: 'Major Axis' },
        barrelDistortionMinor:     { default: 60,  min: 0,   max: 150,  label: 'Minor Axis' },
        barrelDistortionAngle:     { default: 0,   min: 0,   max: 180,  label: 'Angle' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.barrelDistortionEnabled,
    overlays: { fade: fade.overlay },
    bindUniforms: (gl, prog, p) => { fade.bindUniforms(gl, prog, p); blend.bindUniforms(gl, prog, p); },
    glsl: `
uniform float barrelDistortionStrength;
uniform float barrelDistortionX;
uniform float barrelDistortionY;
uniform float barrelDistortionMajor;
uniform float barrelDistortionMinor;
uniform float barrelDistortionAngle;
${fade.glsl}
${blend.glsl}
void main() {
    vec4 c = texture(uTex, vUV);
    float cx = (0.5 + barrelDistortionX / 100.0) * uResolution.x;
    float cy = (0.5 - barrelDistortionY / 100.0) * uResolution.y;
    float k = barrelDistortionStrength / 100.0;

    float imgX = vUV.x * uResolution.x;
    float imgY = (1.0 - vUV.y) * uResolution.y;
    float dx = imgX - cx;
    float dy = imgY - cy;

    float angleRad = barrelDistortionAngle * 3.14159265 / 180.0;
    float cosA = cos(angleRad);
    float sinA = sin(angleRad);
    float rx = dx * cosA + dy * sinA;
    float ry = -dx * sinA + dy * cosA;

    float a = max((barrelDistortionMajor / 100.0) * 0.7071 * uResolution.x, 1e-5);
    float b = max((barrelDistortionMinor / 100.0) * 0.7071 * uResolution.y, 1e-5);

    float dist = sqrt((rx/a)*(rx/a) + (ry/b)*(ry/b));
    float falloff = max(0.0, 1.0 - dist);
    float factor = 1.0 - k * falloff;

    float srcX = cx + dx * factor;
    float srcY = cy + dy * factor;

    vec2 sampleUV = clamp(vec2(srcX / uResolution.x, 1.0 - srcY / uResolution.y), vec2(0.0), vec2(1.0));
    vec3 distorted = texture(uTex, sampleUV).rgb;
    float weight = ${fade.fnName}();
    vec3 adjusted = mix(c.rgb, distorted, weight);
    if (!${blend.thresholdFn}(c, vec4(adjusted, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, adjusted), c.a);
}
`,
};
