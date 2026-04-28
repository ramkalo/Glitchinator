export default {
    name: 'invert',
    label: 'Invert',
    pass: 'pre-crt',
    paramKeys: ['invertColorA', 'invertColorB', 'invertTarget', 'invertIntensity', 'invertReverse'],
    params: {
        invertEnabled:   { default: false },
        invertColorA:    { default: 'all' },
        invertColorB:    { default: 'bk' },
        invertTarget:    { default: 'lum' },
        invertIntensity: { default: 0, min: 0, max: 100 },
        invertReverse:   { default: false },
    },
    enabled: (p) => p.invertEnabled,
    bindUniforms: (gl, prog, params) => {
        const colorVec = {
            r: [1,0,0], g: [0,1,0], b: [0,0,1],
            c: [0,1,1], y: [1,1,0], m: [1,0,1],
            bk: [0,0,0], w: [1,1,1],
        };
        const targetMap = { lum: 0, r: 1, g: 2, b: 3 };
        const aLoc      = prog._locs['invertColorA'];
        const bLoc      = prog._locs['invertColorB'];
        const targetLoc = prog._locs['invertTarget'];
        const allLoc    = prog._locs['invertAllColors'];
        const isAll     = params.invertColorA === 'all';
        const a = colorVec[params.invertColorA] ?? [0,0,0];
        const b = colorVec[params.invertColorB] ?? [1,1,1];
        if (aLoc      != null) gl.uniform3f(aLoc,      ...a);
        if (bLoc      != null) gl.uniform3f(bLoc,      ...b);
        if (targetLoc != null) gl.uniform1i(targetLoc, targetMap[params.invertTarget] ?? 0);
        if (allLoc    != null) gl.uniform1i(allLoc,    isAll ? 1 : 0);
    },
    glsl: `
uniform float invertIntensity;
uniform int   invertReverse;
uniform int   invertAllColors;
uniform vec3  invertColorA;  // dark pole
uniform vec3  invertColorB;  // bright pole
uniform int   invertTarget;  // 0=lum 1=r 2=g 3=b

void main() {
    vec4 c = texture(uTex, vUV);
    float r = c.r*255.0, g = c.g*255.0, b = c.b*255.0;
    float lum = 0.299*r + 0.587*g + 0.114*b;
    float threshold = 255.0 * (invertIntensity / 100.0);
    float targetVal = (invertTarget==1)?r : (invertTarget==2)?g : (invertTarget==3)?b : lum;
    bool inv = (invertReverse==1) ? (targetVal <= threshold) : (targetVal >= threshold);
    if (inv) {
        if (invertAllColors == 1) {
            fragColor = vec4(1.0 - c.r, 1.0 - c.g, 1.0 - c.b, c.a);
            return;
        }
        vec3 mapped = mix(invertColorA, invertColorB, lum / 255.0);
        r = mapped.r * 255.0;
        g = mapped.g * 255.0;
        b = mapped.b * 255.0;
    }
    fragColor = vec4(r/255.0, g/255.0, b/255.0, c.a);
}
`,
};
