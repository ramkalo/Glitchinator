export default {
    name: 'grain',
    label: 'Film Grain',
    pass: 'pre-crt',
    paramKeys: ['grainIntensity', 'grainSize'],
    params: {
        grainEnabled:   { default: false },
        grainIntensity: { default: 0, min: 0, max: 100 },
        grainSize:      { default: 1, min: 1, max: 10 },
    },
    enabled: (p) => p.grainEnabled && p.grainIntensity > 0,
    glsl: `
uniform float grainIntensity;
uniform float grainSize;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
    vec4 c = texture(uTex, vUV);
    float intensity = grainIntensity / 100.0 * 150.0;
    float gs = max(1.0, grainSize);
    // Snap to grain cell so pixels in the same cell share one value (matches CPU clumping)
    vec2 cellUV = floor(vUV * uResolution / gs) * gs / uResolution;
    float noise = (hash21(cellUV) - 0.5) * intensity;
    fragColor = vec4(clamp(c.rgb * 255.0 + noise, 0.0, 255.0) / 255.0, c.a);
}
`,
};
