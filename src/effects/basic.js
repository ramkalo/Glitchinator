export default {
    name: 'basic',
    label: 'Basic Adjustments',
    pass: 'pre-crt',
    paramKeys: ['brightness', 'contrast', 'saturation', 'highlights', 'shadows', 'temperature', 'tint', 'basicFade', 'basicFadeRadius', 'basicFadeInvert', 'basicFadeX', 'basicFadeY'],
    uiGroups: [
        { keys: ['brightness', 'contrast', 'saturation', 'highlights', 'shadows', 'temperature', 'tint'] },
        { label: 'Fade', keys: ['basicFade', 'basicFadeRadius', 'basicFadeInvert'] },
    ],
    params: {
        basicEnabled:  { default: false },
        brightness:    { default: 0, min: -100, max: 100 },
        contrast:      { default: 0, min: -100, max: 100 },
        saturation:    { default: 0, min: -100, max: 100 },
        highlights:    { default: 0, min: -100, max: 100 },
        shadows:       { default: 0, min: -100, max: 100 },
        temperature:   { default: 0, min: -100, max: 100 },
        tint:          { default: 0, min: -100, max: 100 },
        basicFade:           { default: 0,   min: 0,   max: 100 },
        basicFadeRadius:       { default: 100, min: 1,   max: 100 },
        basicFadeInvert:     { default: false },
        basicFadeX:         { default: 0,   min: -50, max: 50  },
        basicFadeY:         { default: 0,   min: -50, max: 50  },
    },
    enabled: (p) => p.basicEnabled &&
        (p.brightness!==0 || p.contrast!==0 || p.saturation!==0 ||
         p.highlights!==0 || p.shadows!==0 || p.temperature!==0 || p.tint!==0 ||
         p.basicFade!==0),
    glsl: `
uniform float brightness;
uniform float contrast;
uniform float saturation;
uniform float highlights;
uniform float shadows;
uniform float temperature;
uniform float tint;
uniform float basicFade;
uniform float basicFadeRadius;
uniform float basicFadeX;
uniform float basicFadeY;
uniform int   basicFadeInvert;

void main() {
    vec4 c = texture(uTex, vUV);
    vec3 orig = c.rgb * 255.0;
    float r = orig.r, g = orig.g, b = orig.b;

    // Radial fade weight
    float imgX = vUV.x * uResolution.x;
    float imgY = (1.0 - vUV.y) * uResolution.y;
    float cx = (0.5 + basicFadeX / 100.0) * uResolution.x;
    float cy = (0.5 - basicFadeY / 100.0) * uResolution.y;
    float mxX = max(cx, uResolution.x - cx);
    float mxY = max(cy, uResolution.y - cy);
    float fadeDist = max(1.0, sqrt(mxX*mxX + mxY*mxY) * (basicFadeRadius / 100.0));
    float dx = imgX - cx, dy = imgY - cy;
    float t = sqrt(dx*dx + dy*dy) / fadeDist;
    float fadeAmt = basicFade / 100.0;
    float weight = (basicFadeInvert == 1)
        ? clamp(1.0 - fadeAmt * (1.0 - t), 0.0, 1.0)
        : max(0.0, 1.0 - fadeAmt * t);

    // Adjustments (working in 0-255 range to match CPU code)
    float lum = 0.299*r + 0.587*g + 0.114*b;
    float cf  = (contrast + 100.0) / 100.0;
    if (highlights != 0.0) { float hf = highlights*(lum/255.0)*0.3; r+=hf; g+=hf; b+=hf; }
    if (shadows    != 0.0) { float sf = shadows*((255.0-lum)/255.0)*0.3; r+=sf; g+=sf; b+=sf; }
    r = r*cf + brightness; g = g*cf + brightness; b = b*cf + brightness;
    if (saturation != 0.0) {
        float sat = 1.0 + saturation/100.0;
        float gray = 0.299*r + 0.587*g + 0.114*b;
        r = gray + sat*(r-gray); g = gray + sat*(g-gray); b = gray + sat*(b-gray);
    }
    if (temperature != 0.0) { float tmp = temperature/100.0; r += tmp*25.0; b -= tmp*25.0; }
    if (tint != 0.0) { g += tint*0.25; }

    vec3 final = clamp(orig + (vec3(r,g,b) - orig) * weight, 0.0, 255.0) / 255.0;
    fragColor = vec4(final, c.a);
}
`,
};
