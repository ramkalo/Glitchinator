export default {
    name: 'crtScanlines',
    label: 'CRT Scanlines',
    pass: 'post',
    paramKeys: ['crtScanline', 'crtScanSpacing'],
    params: {
        crtScanlineEnabled: { default: false },
        crtScanline:        { default: 0, min: 0, max: 100 },
        crtScanSpacing:     { default: 4, min: 2, max: 12  },
    },
    enabled: (p) => p.crtScanlineEnabled,
    glsl: `
uniform float crtScanline;
uniform float crtScanSpacing;

void main() {
    vec4 c = texture(uTex, vUV);
    float darken  = 1.0 - (crtScanline / 100.0) * 0.7;
    float spacing = floor(crtScanSpacing);
    float row     = floor((1.0 - vUV.y) * uResolution.y);
    if (mod(row, spacing) < 1.0) {
        fragColor = vec4(c.rgb * darken, c.a);
    } else {
        fragColor = c;
    }
}
`,
};
