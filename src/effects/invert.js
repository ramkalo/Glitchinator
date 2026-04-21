export default {
    name: 'invert',
    label: 'Invert',
    pass: 'pre-crt',
    paramKeys: ['invertMode', 'invertTarget', 'invertIntensity', 'invertReverse'],
    params: {
        invertEnabled:   { default: false },
        invertMode:      { default: 'all' },
        invertTarget:    { default: 'lum' },
        invertIntensity: { default: 100, min: 0, max: 100 },
        invertReverse:   { default: false },
    },
    enabled: (p) => p.invertEnabled,
    bindUniforms: (gl, prog, params) => {
        const modeMap   = { all: 0, rc: 1, gm: 2, by: 3, bw: 4 };
        const targetMap = { lum: 0, r: 1, g: 2, b: 3 };
        const modeLoc   = prog._locs['invertMode'];
        const targetLoc = prog._locs['invertTarget'];
        if (modeLoc   != null) gl.uniform1i(modeLoc,   modeMap[params.invertMode]     ?? 0);
        if (targetLoc != null) gl.uniform1i(targetLoc, targetMap[params.invertTarget] ?? 0);
    },
    glsl: `
uniform float invertIntensity;
uniform int   invertReverse;
uniform int   invertMode;   // 0=all 1=rc 2=gm 3=by 4=bw
uniform int   invertTarget; // 0=lum 1=r 2=g 3=b

void main() {
    vec4 c = texture(uTex, vUV);
    float r = c.r*255.0, g = c.g*255.0, b = c.b*255.0;
    float lum = 0.299*r + 0.587*g + 0.114*b;
    float threshold = 255.0 * (invertIntensity / 100.0);
    float targetVal = (invertTarget==1)?r : (invertTarget==2)?g : (invertTarget==3)?b : lum;
    bool inv = (invertReverse==1) ? (targetVal <= threshold) : (targetVal >= threshold);
    if (inv) {
        if      (invertMode == 0) { r=255.0-r; g=255.0-g; b=255.0-b; }
        else if (invertMode == 1) { r=255.0-r; }
        else if (invertMode == 2) { g=255.0-g; }
        else if (invertMode == 3) { b=255.0-b; }
        else if (invertMode == 4) { float l=255.0-lum; r=l; g=l; b=l; }
    }
    fragColor = vec4(r/255.0, g/255.0, b/255.0, c.a);
}
`,
};
