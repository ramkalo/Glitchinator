export default {
    name: 'pixelArt',
    label: 'Pixel Art',
    pass: 'pre-crt',
    paramKeys: ['pixelSize', 'pixelColors'],
    params: {
        pixelArtEnabled: { default: false },
        pixelSize:       { default: 24, min: 2, max: 32 },
        pixelColors:     { default: 16, min: 2, max: 64 },
    },
    enabled: (p) => p.pixelArtEnabled,
    glsl: `
uniform float pixelSize;
uniform float pixelColors;

void main() {
    vec2 pixelCoord = vUV * uResolution;
    vec2 cellUV = floor(pixelCoord / pixelSize) * pixelSize / uResolution;
    vec4 c = texture(uTex, clamp(cellUV, vec2(0.0), vec2(1.0)));
    vec3 col = c.rgb * 255.0;
    float qstep = 256.0 / pixelColors;
    col.r = floor(col.r / qstep) * qstep;
    col.g = floor(col.g / qstep) * qstep;
    col.b = floor(col.b / qstep) * qstep;
    fragColor = vec4(col / 255.0, c.a);
}
`,
};
