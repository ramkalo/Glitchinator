export default {
    name: 'chroma',
    label: 'Chromatic Aberration',
    pass: 'pre-crt',
    paramKeys: ['chromaRedX', 'chromaRedY', 'chromaGreenX', 'chromaGreenY', 'chromaBlueX', 'chromaBlueY', 'chromaScale', 'chromaThreshold', 'chromaThresholdReverse', 'chromaFade', 'chromaFadeRadius', 'chromaFadeInvert', 'chromaFadeX', 'chromaFadeY'],
    params: {
        chromaEnabled:   { default: false },
        chromaRedX:      { default: 0, min: -20, max: 20 },
        chromaRedY:      { default: 0, min: -20, max: 20 },
        chromaGreenX:    { default: 0, min: -20, max: 20 },
        chromaGreenY:    { default: 0, min: -20, max: 20 },
        chromaBlueX:     { default: 0, min: -20, max: 20 },
        chromaBlueY:     { default: 0, min: -20, max: 20 },
        chromaScale:            { default: 1, min: 1, max: 10 },
        chromaThreshold:        { default: 0,  min: 0,   max: 100 },
        chromaThresholdReverse: { default: false },
        chromaFade:             { default: 0,   min: 0,   max: 100 },
        chromaFadeRadius:       { default: 100, min: 1,   max: 100 },
        chromaFadeInvert:       { default: false },
        chromaFadeX:            { default: 0,   min: -50, max: 50  },
        chromaFadeY:            { default: 0,   min: -50, max: 50  },
    },
    enabled: (p) => p.chromaEnabled,
    glsl: `
uniform float chromaRedX; uniform float chromaRedY;
uniform float chromaGreenX; uniform float chromaGreenY;
uniform float chromaBlueX; uniform float chromaBlueY;
uniform float chromaScale;
uniform float chromaThreshold;
uniform int   chromaThresholdReverse;
uniform float chromaFade;
uniform float chromaFadeRadius;
uniform int   chromaFadeInvert;
uniform float chromaFadeX;
uniform float chromaFadeY;

vec4 chromaSample(vec2 offsetPx) {
    return texture(uTex, clamp(vUV + vec2(-offsetPx.x, -offsetPx.y) / uResolution, vec2(0.0), vec2(1.0)));
}

void main() {
    vec4 orig = texture(uTex, vUV);
    float lum = dot(orig.rgb, vec3(0.299, 0.587, 0.114)) * 255.0;
    float thresh = 255.0 * (chromaThreshold / 100.0);
    bool applyChroma = (chromaThresholdReverse == 1) ? (lum <= thresh) : (lum >= thresh);
    if (!applyChroma) { fragColor = orig; return; }

    // Radial fade weight
    float imgX = vUV.x * uResolution.x;
    float imgY = (1.0 - vUV.y) * uResolution.y;
    float cx = (0.5 + chromaFadeX / 100.0) * uResolution.x;
    float cy = (0.5 - chromaFadeY / 100.0) * uResolution.y;
    float mxX = max(cx, uResolution.x - cx);
    float mxY = max(cy, uResolution.y - cy);
    float maxDist = sqrt(mxX*mxX + mxY*mxY);
    float fadeDist = max(1.0, maxDist * (chromaFadeRadius / 100.0));
    float rawDist = distance(vec2(imgX, imgY), vec2(cx, cy));
    float fadeAmt = chromaFade / 100.0;
    float weight;
    if (chromaFadeInvert == 1) {
        if (rawDist < fadeDist) { fragColor = orig; return; }
        float outerRange = max(maxDist - fadeDist, 0.001);
        weight = 1.0 - fadeAmt * (1.0 - min(1.0, (rawDist - fadeDist) / outerRange));
    } else {
        if (rawDist >= fadeDist) { fragColor = orig; return; }
        weight = 1.0 - fadeAmt * (rawDist / fadeDist);
    }

    vec2 rShift = vec2(chromaRedX,   chromaRedY)   * chromaScale * weight;
    vec2 gShift = vec2(chromaGreenX, chromaGreenY) * chromaScale * weight;
    vec2 bShift = vec2(chromaBlueX,  chromaBlueY)  * chromaScale * weight;

    float r = chromaSample(rShift).r;
    float g = chromaSample(gShift).g;
    float b = chromaSample(bShift).b;
    fragColor = vec4(r, g, b, orig.a);
}
`,
};
