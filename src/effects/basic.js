import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('basic');
const blend = buildBlendControl('basic');

export const basicEffect = {
    name: 'basic',
    label: 'Basic Adjustments',
    kind: 'glsl',
    paramKeys: [
        'brightness', 'contrast', 'saturation', 'highlights', 'shadows', 'temperature', 'tint',
        ...fade.paramKeys,
        ...blend.paramKeys,
    ],
    handleParams: [...fade.handleParams],
    uiGroups: [
        { keys: ['brightness', 'contrast', 'saturation', 'highlights', 'shadows', 'temperature', 'tint'] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    params: {
        basicEnabled:  { default: false, label: 'Enable' },
        brightness:    { default: 0, min: -100, max: 100, label: 'Brightness' },
        contrast:      { default: 0, min: -100, max: 100, label: 'Contrast' },
        saturation:    { default: 0, min: -100, max: 100, label: 'Saturation' },
        highlights:    { default: 0, min: -100, max: 100, label: 'Highlights' },
        shadows:       { default: 0, min: -100, max: 100, label: 'Shadows' },
        temperature:   { default: 0, min: -100, max: 100, label: 'Temperature' },
        tint:          { default: 0, min: -100, max: 100, label: 'Tint' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.basicEnabled &&
        (p.brightness!==0 || p.contrast!==0 || p.saturation!==0 ||
         p.highlights!==0 || p.shadows!==0 || p.temperature!==0 || p.tint!==0 ||
         p.basicFade!==0),
    overlays: { fade: fade.overlay },
    bindUniforms: (gl, prog, p) => {
        fade.bindUniforms(gl, prog, p);
        blend.bindUniforms(gl, prog, p);
    },
    glsl: `
uniform float brightness;
uniform float contrast;
uniform float saturation;
uniform float highlights;
uniform float shadows;
uniform float temperature;
uniform float tint;
${fade.glsl}
${blend.glsl}
void main() {
    vec4 c = texture(uTex, vUV);
    vec3 orig = c.rgb * 255.0;
    float r = orig.r, g = orig.g, b = orig.b;

    float weight = ${fade.fnName}();

    // Adjustments (working in 0-255 range to match CPU code)
    float lum = 0.299*r + 0.587*g + 0.114*b;
    float cf  = (contrast + 100.0) / 100.0;
    float bf  = 1.0 + brightness / 100.0;
    if (highlights != 0.0) { float hf = highlights*(lum/255.0)*0.3; r+=hf; g+=hf; b+=hf; }
    if (shadows    != 0.0) { float sf = shadows*((255.0-lum)/255.0)*0.3; r+=sf; g+=sf; b+=sf; }
    r = r*bf; g = g*bf; b = b*bf;
    r = (r-128.0)*cf + 128.0; g = (g-128.0)*cf + 128.0; b = (b-128.0)*cf + 128.0;
    if (saturation != 0.0) {
        float sat = 1.0 + saturation/100.0;
        float gray = 0.299*r + 0.587*g + 0.114*b;
        r = gray + sat*(r-gray); g = gray + sat*(g-gray); b = gray + sat*(b-gray);
    }
    if (temperature != 0.0) { float tmp = temperature/100.0; r += tmp*25.0; b -= tmp*25.0; }
    if (tint != 0.0) { g += tint*0.25; }

    vec3 adjusted = clamp(vec3(r,g,b), 0.0, 255.0) / 255.0;
    if (!${blend.thresholdFn}(c, vec4(adjusted, c.a))) { fragColor = c; return; }
    vec3 blended = ${blend.blendFn}(c.rgb, adjusted);
    vec3 final = mix(c.rgb, blended, weight);
    fragColor = vec4(final, c.a);
}
`,
};
