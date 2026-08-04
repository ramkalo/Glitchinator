import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('hueShift');
const blend = buildBlendControl('hueShift');

export const hueShiftEffect = {
    name: 'hueShift',
    label: 'Hue Shift',
    kind: 'glsl',
    paramKeys: ['hueCenter', 'hueWidth','hueRotate', 'hueFeather', ...fade.paramKeys, ...blend.paramKeys],
    handleParams: [...fade.handleParams],
    uiGroups: [
        { keys: ['hueCenter', 'hueWidth', 'hueRotate', 'hueFeather'] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    params: {
        hueShiftEnabled: { default: false, label: 'Enable' },
        hueCenter:       { default: 180,   min: 0,    max: 360, label: 'Original Colors' },
        hueRotate:       { default: 180,   min: -360, max: 360, label: 'New Color' },
        hueWidth:        { default: 80, min: 1,    max: 180,  label: 'Slice Size' },
        hueFeather:      { default: 20,  min: 0,    max: 100, label: 'Feathering' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.hueShiftEnabled,
    overlays: { fade: fade.overlay },
    bindUniforms: (gl, prog, p) => { fade.bindUniforms(gl, prog, p); blend.bindUniforms(gl, prog, p); },
    glsl: `
uniform float hueRotate;
uniform float hueCenter;
uniform float hueWidth;
uniform float hueFeather;
${fade.glsl}
${blend.glsl}

vec3 rgb2hsl(vec3 c) {
    float maxC = max(c.r, max(c.g, c.b));
    float minC = min(c.r, min(c.g, c.b));
    float l = (maxC + minC) * 0.5;
    float d = maxC - minC;
    float s = (d < 0.0001) ? 0.0 : d / (1.0 - abs(2.0 * l - 1.0));
    float h = 0.0;
    if (d > 0.0001) {
        if (maxC == c.r)      h = mod((c.g - c.b) / d, 6.0);
        else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
        else                  h = (c.r - c.g) / d + 4.0;
        h /= 6.0;
    }
    return vec3(h, s, l);
}

vec3 hsl2rgb(vec3 hsl) {
    float h = hsl.x, s = hsl.y, l = hsl.z;
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c * 0.5;
    vec3 rgb;
    if      (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
    else                   rgb = vec3(c, 0.0, x);
    return clamp(rgb + m, 0.0, 1.0);
}

void main() {
    vec4 c = texture(uTex, vUV);
    vec3 hsl = rgb2hsl(c.rgb);

    // Angular distance from this pixel's hue to the target center, in degrees
    float hue360 = hsl.x * 360.0;
    float diff   = abs(fract((hue360 - hueCenter) / 360.0 + 0.5) - 0.5) * 360.0;

    // Feather pulls the gradient inward: 0 = hard cutoff at edge, 100 = full dome from center
    float halfWidth  = hueWidth * 0.5;
    float gradStart  = halfWidth * (1.0 - clamp(hueFeather / 100.0, 0.0, 1.0));
    float affected   = (hueWidth >= 360.0) ? 1.0
                     : 1.0 - smoothstep(gradStart, halfWidth, diff);

    hsl.x = fract(hsl.x + (hueRotate / 360.0) * affected);
    vec3 shifted = hsl2rgb(hsl);

    float weight  = ${fade.fnName}();
    vec3 faded    = mix(c.rgb, shifted, weight);
    if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
}
`,
};
