// Cloak — anti-scrape pixel perturbation.
//
// Perturbs the image's underlying pixel data to resist AUTOMATED matching, exploiting the gap
// between human vision and machines:
//   • A luma-neutral CHROMA perturbation (injected in Cb/Cr, converted back to RGB) is nearly
//     invisible — human colour acuity is far lower than luminance acuity — yet changes every
//     RGB value a scraper reads. This reliably breaks exact-file/duplicate hashing and degrades
//     naive scrapers / OCR. Contrast-masking hides it further inside busy detail.
//   • Perceptual hashes (pHash/dHash) key on LOW-FREQUENCY LUMINANCE, which chroma barely
//     touches. A small low-frequency luminance ripple (scaled by strength², so it stays subtle
//     until high strength) gives PARTIAL pHash / reverse-image-search resistance — at a rising
//     visible cost.
//
// HONEST SCOPE: this is a deterrent. It does NOT defeat modern AI vision models
// (GPT/Claude/Gemini), face recognition, or a determined editor. Follows the grain.js pattern.

import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('scramble');
const blend = buildBlendControl('scramble');

const INFO =
    'Perturbs pixel data to resist automated matching. Good against: exact-file / duplicate ' +
    'hashing and naive scrapers & OCR (near-invisible). Partial, and grows visible with ' +
    'Strength: perceptual-hash (pHash) matching and reverse-image-search dedup. Does NOT defeat ' +
    'AI vision models (GPT/Claude/Gemini), face recognition, or a determined editor. Use the ' +
    'lowest strength that does the job.';

export const scrambleEffect = {
    name: 'scramble',
    label: 'Cloak',
    kind: 'glsl',
    paramKeys: ['scrambleStrength', ...fade.paramKeys, ...blend.paramKeys],
    handleParams: [...fade.handleParams],
    uiGroups: [
        { keys: ['scrambleInfo'] },
        { keys: ['scrambleStrength'] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    params: {
        scrambleEnabled:  { default: false, label: 'Enable' },
        scrambleInfo:     { default: null, type: 'info', label: INFO },
        scrambleStrength: { default: 0, min: 0, max: 100, label: 'Strength' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.scrambleEnabled && p.scrambleStrength > 0,
    overlays: { fade: fade.overlay },
    bindUniforms: (gl, prog, p) => {
        fade.bindUniforms(gl, prog, p);
        blend.bindUniforms(gl, prog, p);
    },
    glsl: `
uniform float scrambleStrength;
${fade.glsl}
${blend.glsl}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float luma601(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// RGB delta from shifting only Cb/Cr (BT.601). Y is untouched, so this carries ~zero luminance:
// the eye barely registers it while every RGB channel a scraper reads still moves.
vec3 chromaDelta(float dCb, float dCr) {
    return dCb * vec3(0.0, -0.344136, 1.772) + dCr * vec3(1.402, -0.714136, 0.0);
}

// Cheap local-luma high-pass: large on busy detail, ~0 on flat regions. Hides the perturbation
// in texture (contrast masking).
float textureMask(vec2 uv) {
    vec2 t = 1.0 / uResolution;
    float l0 = luma601(texture(uTex, uv).rgb);
    float lx = luma601(texture(uTex, uv + vec2(t.x, 0.0)).rgb);
    float ly = luma601(texture(uTex, uv + vec2(0.0, t.y)).rgb);
    float grad = abs(l0 - lx) + abs(l0 - ly);
    return mix(0.35, 1.0, smoothstep(0.0, 0.12, grad));
}

void main() {
    vec4 c = texture(uTex, vUV);
    float s = scrambleStrength / 100.0;
    vec2 px = vUV * uResolution;
    float mask = textureMask(vUV);

    // Chroma perturbation: structured mid/high-frequency carriers + two-band hash injected into
    // Cb/Cr only. Coherent (not i.i.d. noise a model averages away) and near-invisible.
    float nHi = hash21(floor(px))       - 0.5;
    float nLo = hash21(floor(px / 3.0)) - 0.5;
    float w1  = sin(dot(px, vec2(0.90,  0.20)) * 0.45);
    float w2  = sin(dot(px, vec2(-0.30, 0.85)) * 0.45);
    float amp = 0.18 * s * mask;
    vec3 layer = c.rgb + chromaDelta((nLo * 0.6 + w1 * 0.4) * amp, (nHi * 0.5 + w2 * 0.5) * amp);

    // Low-frequency luminance ripple: this is what actually nudges perceptual hashes (they read
    // low-freq luma). s*s keeps it invisible at low strength and only apparent when pushed high.
    float lf = sin(dot(px, vec2(0.013, 0.007))) + sin(dot(px, vec2(-0.009, 0.017)));
    layer += vec3(lf * 0.5 * (0.06 * s * s));

    layer = clamp(layer, 0.0, 1.0);

    float weight = ${fade.fnName}();
    vec3 faded   = mix(c.rgb, layer, weight);
    if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
}
`,
};
