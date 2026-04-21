export default {
    name: 'crtCurvature',
    label: 'CRT Curvature',
    pass: 'post',
    paramKeys: ['crtCurvature', 'crtCurvatureRadius', 'crtCurvatureIntensity', 'crtCurvatureX', 'crtCurvatureY'],
    params: {
        crtCurvatureEnabled:   { default: false },
        crtCurvature:          { default: 0,   min: 0,   max: 100 },
        crtCurvatureRadius:    { default: 100, min: 0,   max: 100 },
        crtCurvatureIntensity: { default: 100, min: 0,   max: 100 },
        crtCurvatureX:         { default: 0,   min: -50, max: 50  },
        crtCurvatureY:         { default: 0,   min: -50, max: 50  },
    },
    enabled: (p) => p.crtCurvatureEnabled,
    glsl: `
uniform float crtCurvature;
uniform float crtCurvatureRadius;
uniform float crtCurvatureIntensity;
uniform float crtCurvatureX;
uniform float crtCurvatureY;

void main() {
    float cx = (0.5 + crtCurvatureX / 100.0) * uResolution.x;
    float cy = (0.5 - crtCurvatureY / 100.0) * uResolution.y;
    float maxRadius = min(uResolution.x, uResolution.y) * (crtCurvatureRadius / 100.0);
    float k = (crtCurvature / 100.0) * (crtCurvatureIntensity / 100.0);

    float imgX = vUV.x * uResolution.x;
    float imgY = (1.0 - vUV.y) * uResolution.y;
    float dx = imgX - cx;
    float dy = imgY - cy;
    float r  = sqrt(dx * dx + dy * dy);

    float srcX = imgX;
    float srcY = imgY;
    if (r > 0.0 && r < maxRadius) {
        float factor = 1.0 - k * pow(1.0 - r / maxRadius, 2.0);
        srcX = cx + dx * factor;
        srcY = cy + dy * factor;
    }

    vec2 sampleUV = clamp(vec2(srcX / uResolution.x, 1.0 - srcY / uResolution.y), vec2(0.0), vec2(1.0));
    fragColor = texture(uTex, sampleUV);
}
`,
};
