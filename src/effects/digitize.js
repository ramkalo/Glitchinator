import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('digitize');
const blend = buildBlendControl('digitize');

export const digitizeEffect = {
    name: 'digitize',
    label: 'Digitize',
    kind: 'glsl',
    paramKeys: ['pixelSize', 'pixelColors', 'digitizeSnapToPalette', 'digitizeDither', 'digitizeNoise', ...fade.paramKeys, ...blend.paramKeys],
    handleParams: [...fade.handleParams],
    uiGroups: [
        { keys: ['pixelSize', 'pixelColors'] },
        { keys: ['digitizeSnapToPalette'] },
        { keys: ['digitizeDither', 'digitizeNoise'] },
        blend.uiGroup,
        fade.uiGroup,
    ],
    params: {
        digitizeEnabled: { default: false, label: 'Enable' },
        pixelSize:       { default: 1,  min: 1,  max: 256,  label: 'Pixel Size' },
        pixelColors:     { default: 16, min: 2,  max: 256, label: '# Colors' },
        digitizeSnapToPalette: { default: false, label: 'Snap to Palette Colors' },
        digitizeDither:  { default: 0,  min: 0,  max: 100, label: 'Dithering' },
        digitizeNoise:   { default: 0,  min: 0,  max: 100, label: 'Noise' },
        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.digitizeEnabled,
    overlays: { fade: fade.overlay },
    bindUniforms: (gl, prog, p) => {
        fade.bindUniforms(gl, prog, p);
        blend.bindUniforms(gl, prog, p);
        if (p.digitizeSnapToPalette && p._activePalette) {
            const floats = p._activePalette.flatMap(hex => [
                parseInt(hex.slice(1, 3), 16) / 255,
                parseInt(hex.slice(3, 5), 16) / 255,
                parseInt(hex.slice(5, 7), 16) / 255,
            ]);
            const loc = gl.getUniformLocation(prog, 'paletteColors');
            if (loc) gl.uniform3fv(loc, floats);
        } else if (p.digitizeSnapToPalette && !p._activePalette) {
            const loc = gl.getUniformLocation(prog, 'digitizeSnapToPalette');
            if (loc) gl.uniform1i(loc, 0);
        }
    },
    glsl: `
uniform float pixelSize;
uniform float pixelColors;
uniform bool digitizeSnapToPalette;
uniform vec3 paletteColors[8];
uniform float digitizeDither;
uniform float digitizeNoise;
${fade.glsl}
${blend.glsl}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 rgb2hsl(vec3 c) {
    float maxC = max(c.r, max(c.g, c.b));
    float minC = min(c.r, min(c.g, c.b));
    float l = (maxC + minC) * 0.5;
    float d = maxC - minC;
    float s = (d < 0.0001) ? 0.0 : d / (1.0 - abs(2.0 * l - 1.0));
    float h = 0.0;
    if (d > 0.0001) {
        if (maxC == c.r)      h = mod((c.g - c.b) / d, 6.0);
        else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
        else                  h = (c.r - c.g) / d + 4.0;
        h /= 6.0;
    }
    return vec3(h, s, l);
}

vec3 hsl2rgb(vec3 hsl) {
    float h = hsl.x, s = hsl.y, l = hsl.z;
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c * 0.5;
    vec3 rgb;
    if      (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
    else                   rgb = vec3(c, 0.0, x);
    return clamp(rgb + m, 0.0, 1.0);
}

void main() {
    vec4 c = texture(uTex, vUV);
    vec2 pixelCoord = vUV * uResolution;

    vec2 cellUV = (pixelSize > 1.0)
        ? floor(pixelCoord / pixelSize) * pixelSize / uResolution
        : vUV;
    vec4 cell = texture(uTex, clamp(cellUV, vec2(0.0), vec2(1.0)));
    vec3 col = cell.rgb * 255.0;

    float qstep = 256.0 / pixelColors;
    col.r = floor(col.r / qstep) * qstep;
    col.g = floor(col.g / qstep) * qstep;
    col.b = floor(col.b / qstep) * qstep;

    if (digitizeSnapToPalette) {
        vec3 norm   = col / 255.0;
        vec3 hslCur = rgb2hsl(norm);
        // Only snap pixels that have a meaningful hue
        if (hslCur.y > 0.05) {
            float minDist = 1e9;
            int   nearIdx = -1;
            vec3  hslPals[8];
            for (int i = 0; i < 8; i++) {
                hslPals[i] = rgb2hsl(paletteColors[i]);
                // Skip palette colors with no meaningful hue (grays, blacks, whites)
                if (hslPals[i].y < 0.05) continue;
                float hueDiff = abs(fract(hslPals[i].x - hslCur.x + 0.5) - 0.5);
                if (hueDiff < minDist) { minDist = hueDiff; nearIdx = i; }
            }
            if (nearIdx >= 0) {
                float delta  = fract(hslPals[nearIdx].x - hslCur.x + 0.5) - 0.5;
                float newHue = fract(hslCur.x + delta);
                col = hsl2rgb(vec3(newHue, hslCur.y, hslCur.z)) * 255.0;
            }
        }
    }

    if (digitizeDither > 0.0) {
        const float bayer[16] = float[16](
             0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
            12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,
             3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
            15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0
        );
        int bx = int(mod(pixelCoord.x, 4.0));
        int by = int(mod(pixelCoord.y, 4.0));
        float threshold = bayer[by * 4 + bx];
        float ditherAmt = digitizeDither / 100.0;
        col += (threshold - 0.5) * 32.0 * ditherAmt;
        col.r = round(col.r / 32.0) * 32.0;
        col.g = round(col.g / 32.0) * 32.0;
        col.b = round(col.b / 32.0) * 32.0;
    }

    if (digitizeNoise > 0.0) {
        col += (hash21(vUV) - 0.5) * (digitizeNoise / 100.0) * 80.0;
    }

    float weight  = ${fade.fnName}();
    vec3 adjusted = clamp(col, 0.0, 255.0) / 255.0;
    vec3 faded    = mix(c.rgb, adjusted, weight);
    if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
}
`,
};
