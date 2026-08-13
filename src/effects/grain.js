import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('grain');
const blend = buildBlendControl('grain');

const TYPE_MAP = { film: 0, white: 1, grey: 2, color: 3, luma: 4, image: 5 };

export const grainEffect = {
    name: 'grain',
    label: 'Noise',
    kind: 'glsl',
    paramKeys: ['grainIntensity', 'grainSize', 'grainType', ...fade.paramKeys, ...blend.paramKeys],
    handleParams: [...fade.handleParams],
    uiGroups: [
        { keys: ['grainType', 'grainIntensity', 'grainSize'] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    params: {
        grainEnabled:   { default: false, label: 'Enable' },
        grainType:      { default: 'film', label: 'Type', options: [['film', 'Film Grain'], ['white', 'White'], ['grey', 'Greyscale'], ['color', 'Color'], ['luma', 'Luma'], ['image', 'Image']] },
        grainIntensity: { default: 0, min: 0, max: 100, label: 'Intensity' },
        grainSize:      { default: 1, min: 1, max: 200, label: 'Grain Size' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.grainEnabled && p.grainIntensity > 0,
    overlays: { fade: fade.overlay },
    bindUniforms: (gl, prog, p) => {
        const loc = prog._locs['grainType'];
        if (loc != null) gl.uniform1i(loc, TYPE_MAP[p.grainType] ?? 0);
        fade.bindUniforms(gl, prog, p);
        blend.bindUniforms(gl, prog, p);
    },
    glsl: `
uniform float grainIntensity;
uniform float grainSize;
uniform int   grainType;
${fade.glsl}
${blend.glsl}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
    vec4 c = texture(uTex, vUV);
    float intensity = grainIntensity / 100.0;
    // Scale grain size relative to the image resolution (referenced to a 1080px
    // short edge) so a given grainSize covers the same fraction of the image at
    // any resolution. Without this, grain is sized in absolute render-pixels and
    // looks soft in the fit-to-screen preview but harsh in the full-res export.
    float resScale = max(min(uResolution.x, uResolution.y) / 1080.0, 1.0);
    // Piecewise grain-size curve: gentle over the first half of the slider,
    // aggressive (chunky pixels) over the second half.
    float t = clamp((grainSize - 1.0) / 199.0, 0.0, 1.0);
    float sizeCurve = (t < 0.5)
        ? mix(1.0, 8.0, t / 0.5)              // 1..8 px across the lower half (subtle)
        : mix(8.0, 200.0, (t - 0.5) / 0.5);   // 8..200 px across the upper half (steep)
    float gs = max(1.0, sizeCurve * resScale);
    vec2 cellUV = floor(vUV * uResolution / gs) * gs / uResolution;
    vec3 col = c.rgb * 255.0;

    if (grainType == 0) {
        float noise = (hash21(cellUV) - 0.5) * intensity * 150.0;
        col = clamp(col + noise, 0.0, 255.0);
    } else if (grainType == 1) {
        float noise = (hash21(cellUV) - 0.5) * intensity * 255.0;
        col = clamp(col + noise, 0.0, 255.0);
    } else if (grainType == 2) {
        float greyVal = hash21(cellUV) * 255.0;
        col = clamp(mix(col, vec3(greyVal), intensity), 0.0, 255.0);
    } else if (grainType == 3) {
        float nr = (hash21(cellUV + vec2(0.1)) - 0.5) * intensity * 255.0;
        float ng = (hash21(cellUV + vec2(0.2)) - 0.5) * intensity * 255.0;
        float nb = (hash21(cellUV + vec2(0.3)) - 0.5) * intensity * 255.0;
        col = clamp(col + vec3(nr, ng, nb), 0.0, 255.0);
    } else if (grainType == 4) {
        float noise = (hash21(cellUV) - 0.5) * intensity * 255.0;
        float gray    = 0.299*col.r + 0.587*col.g + 0.114*col.b;
        float newGray = clamp(gray + noise, 0.0, 255.0);
        col = clamp(col * (newGray / max(gray, 0.001)), 0.0, 255.0);
    } else {
        float nr = (hash21(cellUV + vec2(0.1)) - 0.5) * 2.0 * intensity;
        float ng = (hash21(cellUV + vec2(0.2)) - 0.5) * 2.0 * intensity;
        float nb = (hash21(cellUV + vec2(0.3)) - 0.5) * 2.0 * intensity;
        col = clamp(col * (1.0 + vec3(nr, ng, nb)), 0.0, 255.0);
    }

    float weight  = ${fade.fnName}();
    vec3 adjusted = col / 255.0;
    vec3 faded    = mix(c.rgb, adjusted, weight);
    if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
}
`,
};
