import { buildFadeControl, buildBlendControl } from './controls/index.js';
import { resolveColorKey, STANDARD_COLOR_OPTIONS } from './colorOptions.js';

const fade  = buildFadeControl('caustics');
const blend = buildBlendControl('caustics');

function hexToRgb01(hex) {
    const n = parseInt((hex || '#ffffff').replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const causticsEffect = {
    name: 'caustics',
    label: 'Caustics',
    kind: 'glsl',
    // Numeric render params auto-bind to like-named uniforms. Light color, angle→radians
    // and the center vec2 are bound manually below.
    paramKeys: ['causticsNumber', 'causticsChop', 'causticsCrossAngle', 'causticsLineDeviation',
                'causticsSharpness', 'causticsDiffusion', 'causticsBrightness', 'causticsContrast',
                'causticsClumping', 'causticsDispersion', 'causticsSeed',
                ...fade.paramKeys, ...blend.paramKeys],
    // Position line + angle are edited via canvas handles, not sliders.
    handleParams: ['causticsCenterX', 'causticsCenterY', 'causticsAngle', ...fade.handleParams],
    // Hand-rolled overlay draws the position line/rotation handle AND the fade shape inline.
    overlays: {},
    uiGroups: [
        { keys: ['causticsNumber', 'causticsChop', 'causticsCrossAngle', 'causticsLineDeviation',
                 'causticsSharpness', 'causticsDiffusion', 'causticsBrightness', 'causticsContrast',
                 'causticsClumping', 'causticsDispersion', 'causticsColor', 'causticsShuffleBtn'] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    params: {
        causticsEnabled:    { default: false, label: 'Enable' },
        causticsNumber:     { default: 12, min: 4, max: 30, step: 1, label: 'Number' },
        causticsChop:       { default: 45, min: 0, max: 100, label: 'Chop' },
        causticsCrossAngle: { default: 50, min: 0, max: 100, label: 'Intersection' },
        causticsLineDeviation: { default: 25, min: 0, max: 100, label: 'Line Deviation' },
        causticsSharpness:  { default: 55, min: 0, max: 100, label: 'Sharpness' },
        causticsDiffusion:  { default: 50, min: 0, max: 100, label: 'Diffusion' },
        causticsBrightness: { default: 70, min: 0, max: 100, label: 'Brightness' },
        causticsContrast:   { default: 45, min: 0, max: 100, label: 'Contrast' },
        causticsClumping:   { default: 0,  min: 0, max: 100, label: 'Clumping' },
        causticsDispersion: { default: 25, min: 0, max: 100, label: 'Dispersion' },
        causticsAngle:      { default: 0,  min: -180, max: 180, label: 'Angle' },
        causticsCenterX:    { default: 0,  min: -50, max: 50 },
        causticsCenterY:    { default: 0,  min: -50, max: 50 },
        causticsColor:      { default: 'palette7', type: 'paletteSelect', options: STANDARD_COLOR_OPTIONS, label: 'Light Color' },
        causticsSeed:       { default: 1,  min: 1, max: 999, step: 1, hidden: true },
        causticsShuffleBtn: { default: null, button: 'causticsSeed', label: 'Shuffle' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.causticsEnabled,
    bindUniforms: (gl, prog, p) => {
        const locs = prog._locs;
        const setF  = (k, v) => { if (locs[k] != null) gl.uniform1f(locs[k], v); };
        const set2f = (k, a, b) => { if (locs[k] != null) gl.uniform2f(locs[k], a, b); };
        const set3v = (k, a) => { if (locs[k] != null) gl.uniform3fv(locs[k], a); };

        setF('causticsAngle', (p.causticsAngle ?? 0) * Math.PI / 180);
        // Center as a fraction of resolution, y-down (shader uses y-down px).
        set2f('causticsCenter', 0.5 + (p.causticsCenterX ?? 0) / 100,
                                0.5 - (p.causticsCenterY ?? 0) / 100);
        const hex = resolveColorKey(p.causticsColor, p._activePalette) ?? '#ffffff';
        set3v('causticsColor', hexToRgb01(hex));

        fade.bindUniforms(gl, prog, p);
        blend.bindUniforms(gl, prog, p);
    },
    glsl: `
uniform float causticsNumber;
uniform float causticsChop;
uniform float causticsCrossAngle;
uniform float causticsLineDeviation;
uniform float causticsSharpness;
uniform float causticsDiffusion;
uniform float causticsBrightness;
uniform float causticsContrast;
uniform float causticsClumping;
uniform float causticsDispersion;
uniform float causticsAngle;
uniform vec2  causticsCenter;
uniform vec3  causticsColor;
uniform float causticsSeed;
${fade.glsl}
${blend.glsl}
float causticsHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// 2-D value noise, used to warp (wiggle) the lattice and vary line brightness.
float causticsVN2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = causticsHash2(i);
    float b = causticsHash2(i + vec2(1.0, 0.0));
    float c = causticsHash2(i + vec2(0.0, 1.0));
    float d = causticsHash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// A caustic line value at distance-to-line d: a sharp bright core plus a wide soft
// diffusion glow that bleeds off the line. 'diff' blends core → glow.
float causticsLineVal(float d, float coreW, float glowW, float diff) {
    float core = 1.0 - smoothstep(0.0, coreW, d);
    float glow = 1.0 - smoothstep(0.0, glowW, d);
    glow = glow * glow;                              // soft falloff
    return core * (1.0 - 0.55 * diff) + glow * diff * 1.1;
}

// One family of N INDEPENDENT lines. Like Line Glitch's bands, each line gets its own
// angle (base + per-line wobble), position and wiggle, so lines genuinely diverge and
// cross. Returns per-channel brightness (dispersion offsets the R/B lines).
vec3 causticsFamily(vec2 base, float baseAng, float fN, float span,
                    float coreW, float glowW, float diff, float disp,
                    float devRad, float wampl, float wfreq, float sd) {
    vec3 val = vec3(0.0);
    for (int i = 0; i < 32; i++) {
        if (float(i) >= fN) break;
        float fi  = float(i);
        float ri  = causticsHash2(vec2(fi, 1.0) + sd) * 2.0 - 1.0;   // per-line angle wobble
        float ang = baseAng + devRad * ri;
        vec2  ni  = vec2(sin(ang),  cos(ang));                        // line normal
        vec2  ta  = vec2(cos(ang), -sin(ang));                        // along the line
        float xi  = ((fi + 0.5) / fN - 0.5) * span
                  + (causticsHash2(vec2(fi, 2.0) + sd) - 0.5) * (span / fN) * 0.6;
        float al  = dot(base, ta);
        float wig = ((causticsVN2(vec2(al * wfreq,       fi * 4.3 + sd))       * 2.0 - 1.0)
                  +  (causticsVN2(vec2(al * wfreq * 2.6, fi * 4.3 + sd + 5.0)) * 2.0 - 1.0) * 0.5) * wampl;
        float bd  = dot(base, ni) - xi - wig;                         // signed dist to this line
        val.r = max(val.r, causticsLineVal(abs(bd - disp), coreW, glowW, diff));
        val.g = max(val.g, causticsLineVal(abs(bd),        coreW, glowW, diff));
        val.b = max(val.b, causticsLineVal(abs(bd + disp), coreW, glowW, diff));
    }
    return val;
}

void main() {
    vec4 c = texture(uTex, vUV);
    vec3 layer = c.rgb;

    if (causticsBrightness > 0.0) {
        float aspect = uResolution.x / max(uResolution.y, 1.0);

        // Position: pan the whole pattern rigidly by translating the screen coordinate.
        vec2  posOff = vec2(causticsCenter.x - 0.5, 0.5 - causticsCenter.y);
        vec2  vT = vUV - posOff;
        vec2  uvp = vec2(vT.x * aspect, vT.y);
        vec2  centerAdj = vec2(0.5 * aspect, 0.5);

        // Orient the whole mesh by the Angle handle; work in normalized field coords.
        float a = causticsAngle;
        mat2  Rm = mat2(cos(a), -sin(a), sin(a), cos(a));
        vec2  base = Rm * (uvp - centerAdj);

        // Two families of N INDEPENDENT lines that crisscross. Number = lines per family;
        // Intersection = angle between families; Line Deviation = per-line angle wobble;
        // Chop = per-line wiggle. Where the families cross you get bright caustic nodes.
        float fN      = floor(causticsNumber + 0.5);
        float span    = 2.0;
        float spacing = span / max(fN, 1.0);
        float diff    = causticsDiffusion / 100.0;
        float coreW   = spacing * mix(0.30, 0.04, causticsSharpness / 100.0);   // line width
        float glowW   = spacing * mix(0.18, 0.90, diff);                        // glow spread
        float disp    = coreW * mix(0.0, 0.7, causticsDispersion / 100.0);
        float devRad  = radians(mix(0.0, 40.0, causticsLineDeviation / 100.0)); // per-line wobble
        float wampl   = spacing * mix(0.08, 1.5, causticsChop / 100.0);         // per-line wiggle
        float wfreq   = 5.5;
        float ixAng   = radians(mix(25.0, 155.0, causticsCrossAngle / 100.0));  // cross angle

        vec3 valA = causticsFamily(base, 0.0,   fN, span, coreW, glowW, diff, disp, devRad, wampl, wfreq, causticsSeed);
        vec3 valB = causticsFamily(base, ixAng, fN, span, coreW, glowW, diff, disp, devRad, wampl, wfreq, causticsSeed + 91.0);
        vec3 lineRGB = valA + valB;   // families sum → bright crossing nodes

        // Vary brightness across the field: some nodes bright, some stretches dim.
        float vary = causticsVN2(base * fN * 0.5 + 30.0 + causticsSeed) * 0.6
                   + causticsVN2(base * fN * 1.1 + 63.0 + causticsSeed) * 0.4;
        vary = mix(0.35, 1.12, vary * vary);
        lineRGB *= vary;

        // Clumping: a low-frequency mask dims the caustics in patches → plumes.
        float clump = causticsClumping / 100.0;
        if (clump > 0.0) {
            float m = causticsVN2(base * 1.1 + 40.0 + causticsSeed);
            lineRGB *= mix(1.0, smoothstep(0.35, 0.70, m), clump);
        }

        // Contrast = gamma (deepen the dark cells); Brightness = intensity.
        lineRGB = pow(clamp(lineRGB, 0.0, 1.0), vec3(mix(0.7, 2.0, causticsContrast / 100.0)));
        lineRGB *= (causticsBrightness / 100.0) * 1.5;

        // Additive light — screen the caustic lines over the image (never darkens it).
        layer = 1.0 - (1.0 - c.rgb) * (1.0 - causticsColor * clamp(lineRGB, 0.0, 1.0));
    }

    float weight = ${fade.fnName}();
    vec3  faded  = mix(c.rgb, layer, weight);
    if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
}
`,
};
