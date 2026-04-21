export default {
    name: 'waves',
    label: 'Waves Effect',
    pass: 'post',
    paramKeys: ['wavesR', 'wavesG', 'wavesB', 'wavesPhase'],
    params: {
        wavesEnabled: { default: false },
        wavesR:       { default: 0, min: -20, max: 20 },
        wavesG:       { default: 0, min: -20, max: 20 },
        wavesB:       { default: 0, min: -20, max: 20 },
        wavesPhase:   { default: 0, min: 0,   max: 100 },
    },
    enabled: (p) => p.wavesEnabled && (p.wavesR !== 0 || p.wavesG !== 0 || p.wavesB !== 0),
    glsl: `
uniform float wavesR;
uniform float wavesG;
uniform float wavesB;
uniform float wavesPhase;

float wavesFormula(float xN, float yN) {
    return
        3.2 * sin(xN + 0.3 * cos(2.1 * xN) + yN) +
        2.1 * cos(0.73 * xN - 1.4 + yN * 0.7) * sin(0.5 * xN + 0.9 + yN * 0.5) +
        1.8 * sin(2.3 * xN + cos(xN) + yN * 0.3) * exp(-0.02 * pow(xN - 2.0, 2.0)) +
        0.9 * cos(3.7 * xN - 0.8 + yN * 0.4) * (1.0 / (1.0 + 0.15 * xN * xN)) +
        1.2 * sin(0.41 * xN * xN - xN + yN * 0.6);
}

void main() {
    float ampR  = wavesR / 100.0 * 80.0;
    float ampG  = wavesG / 100.0 * 80.0;
    float ampB  = wavesB / 100.0 * 80.0;
    float phase = wavesPhase / 100.0 * 20.0;

    float xNorm = vUV.x * 10.0 + phase;
    float yNorm = (1.0 - vUV.y) * 8.0;
    float wave  = wavesFormula(xNorm, yNorm);

    vec4 orig = texture(uTex, vUV);
    float r = texture(uTex, clamp(vec2(vUV.x + wave * ampR / uResolution.x, vUV.y), vec2(0.0), vec2(1.0))).r;
    float g = texture(uTex, clamp(vec2(vUV.x + wave * ampG / uResolution.x, vUV.y), vec2(0.0), vec2(1.0))).g;
    float b = texture(uTex, clamp(vec2(vUV.x + wave * ampB / uResolution.x, vUV.y), vec2(0.0), vec2(1.0))).b;
    fragColor = vec4(r, g, b, orig.a);
}
`,
};
