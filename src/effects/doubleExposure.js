import { secondTexture } from '../renderer/glstate.js';

export default {
    name: 'doubleExposure',
    label: 'Double Exposure',
    pass: 'pre-crt',
    paramKeys: ['doubleExposureChannelMode', 'doubleExposureBlendMode', 'doubleExposureIntensity', 'doubleExposureReverse'],
    params: {
        doubleExposureEnabled:    { default: false },
        doubleExposureChannelMode:{ default: 'all' },
        doubleExposureBlendMode:  { default: 'screen' },
        doubleExposureIntensity:  { default: 100, min: 0, max: 100 },
        doubleExposureReverse:    { default: false },
    },
    enabled: (p) => p.doubleExposureEnabled && !!secondTexture,
    bindUniforms: (gl, prog, p) => {
        // Channel mode bitmask: r=1, g=2, b=4
        const chanMap = { all: 7, r: 1, g: 2, b: 4, rg: 3, rb: 5, gb: 6 };
        const blendMap = { normal: 0, screen: 1, multiply: 2, add: 3, overlay: 4, difference: 5 };
        const chanLoc  = prog._locs['doubleExposureChannelMode'];
        const blendLoc = prog._locs['doubleExposureBlendMode'];
        if (chanLoc  != null) gl.uniform1i(chanLoc,  chanMap[p.doubleExposureChannelMode]  ?? 7);
        if (blendLoc != null) gl.uniform1i(blendLoc, blendMap[p.doubleExposureBlendMode] ?? 1);

        // Bind second image to texture unit 1
        const texLoc = prog._locs['uSecondTex'];
        if (texLoc != null && secondTexture) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, secondTexture);
            gl.uniform1i(texLoc, 1);
        }
    },
    glsl: `
uniform sampler2D uSecondTex;
uniform float doubleExposureIntensity;
uniform int   doubleExposureReverse;
uniform int   doubleExposureChannelMode;
uniform int   doubleExposureBlendMode;

float blendCh(float a, float b) {
    if      (doubleExposureBlendMode == 1) return 1.0 - (1.0-a)*(1.0-b);
    else if (doubleExposureBlendMode == 2) return a * b;
    else if (doubleExposureBlendMode == 3) return min(1.0, a + b);
    else if (doubleExposureBlendMode == 4) return a < 0.5 ? 2.0*a*b : 1.0 - 2.0*(1.0-a)*(1.0-b);
    else if (doubleExposureBlendMode == 5) return abs(a - b);
    return a;
}

void main() {
    vec4 orig = texture(uTex, vUV);
    vec4 sec  = texture(uSecondTex, vUV);

    float lum = dot(orig.rgb, vec3(0.299, 0.587, 0.114)) * 255.0;
    float thresh = 255.0 * (doubleExposureIntensity / 100.0);
    bool doBlend = (doubleExposureReverse == 1) ? (lum <= thresh) : (lum >= thresh);
    if (!doBlend) { fragColor = orig; return; }

    vec3 result = orig.rgb;
    if ((doubleExposureChannelMode & 1) != 0) result.r = blendCh(orig.r, sec.r);
    if ((doubleExposureChannelMode & 2) != 0) result.g = blendCh(orig.g, sec.g);
    if ((doubleExposureChannelMode & 4) != 0) result.b = blendCh(orig.b, sec.b);
    fragColor = vec4(result, orig.a);
}
`,
};
