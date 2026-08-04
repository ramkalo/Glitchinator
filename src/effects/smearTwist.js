import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('smearTwist');
const blend = buildBlendControl('smearTwist');

const NODE_SLOTS = 24;
const nodeParamKeys = Array.from({ length: NODE_SLOTS }, (_, i) => [`smearTwistNx${i}`, `smearTwistNy${i}`]).flat();
const nodeParamDefs = Object.fromEntries(
    Array.from({ length: NODE_SLOTS }, (_, i) => [
        [`smearTwistNx${i}`, { default: 0, min: 0, max: 100 }],
        [`smearTwistNy${i}`, { default: 0, min: 0, max: 100 }],
    ]).flat()
);

export const smearTwistEffect = {
    name:  'smearTwist',
    label: 'Smear & Twist',
    kind:  'glsl',
    paramKeys: [
        'smearTwistMode',
        'smearTwistRadius', 'smearTwistNodeMode', 'smearTwistRandomCount',
        'smearTwistLinearDx', 'smearTwistLinearDy', 'smearTwistRotAngle', 'smearTwistRadialAmt',
        ...fade.paramKeys, ...blend.paramKeys,
    ],
    handleParams: [
        'smearTwistCenterX', 'smearTwistCenterY', 'smearTwistNodeCount',
        ...nodeParamKeys,
        ...fade.handleParams,
    ],
    uiGroups: (p) => {
        const mode = p.smearTwistMode ?? 'linear';
        const groups = [
            { keys: ['smearTwistMode'] },
            { keys: ['smearTwistNodeMode'] },
        ];
        if ((p.smearTwistNodeMode ?? 'manual') === 'random') {
            groups.push({ keys: ['smearTwistRandomCount'] });
        }
        groups.push({ keys: ['smearTwistRadius'] });
        if (mode === 'linear')     groups.push({ keys: ['smearTwistLinearDx', 'smearTwistLinearDy'] });
        if (mode === 'rotational') groups.push({ keys: ['smearTwistRotAngle'] });
        if (mode === 'radial')     groups.push({ keys: ['smearTwistRadialAmt'] });
        groups.push(blend.uiGroup, fade.uiGroup);
        return groups;
    },
    params: {
        smearTwistEnabled: { default: false, label: 'Enable' },
        smearTwistMode: {
            default: 'linear', label: 'Mode',
            options: [['linear','Linear'],['rotational','Rotational'],['radial','Radial']],
        },

        // Node shared
        smearTwistNodeCount:   { default: 0,  min: 0,   max: 24 },
        smearTwistRadius:      { default: 15, min: 1,   max: 100, label: 'Radius' },
        smearTwistNodeMode:    { default: 'random', label: 'Placement',
            options: [['manual','Manual'],['random','Random']] },
        smearTwistRandomCount: { default: 8,  min: 1,   max: 24,  label: 'Node Count' },

        // Center handle
        smearTwistCenterX: { default: 50, min: 0, max: 100 },
        smearTwistCenterY: { default: 50, min: 0, max: 100 },

        // 24 node slots
        ...nodeParamDefs,

        // Linear mode
        smearTwistLinearDx: { default: 50, min: -100, max: 100, label: 'Shift X' },
        smearTwistLinearDy: { default: 0, min: -100, max: 100, label: 'Shift Y' },

        // Rotational mode
        smearTwistRotAngle: { default: 45, min: -180, max: 180, label: 'Angle' },

        // Radial mode
        smearTwistRadialAmt: { default: 50, min: -100, max: 100, label: 'Amount' },

        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.smearTwistEnabled && (p.smearTwistNodeCount ?? 0) > 0,
    overlays: { fade: fade.overlay },
    bindUniforms: (gl, prog, p) => {
        const locs = prog._locs;
        const si = (k, v) => { if (locs[k] != null) gl.uniform1i(locs[k], v); };

        si('smearTwistMode',      { linear: 0, rotational: 1, radial: 2 }[p.smearTwistMode] ?? 0);
        si('smearTwistNodeCount', p.smearTwistNodeCount ?? 0);

        if (locs['smearTwistCenter'] != null) {
            gl.uniform2f(locs['smearTwistCenter'],
                (p.smearTwistCenterX ?? 50) / 100,
                1.0 - (p.smearTwistCenterY ?? 50) / 100
            );
        }

        const count = Math.min(NODE_SLOTS, p.smearTwistNodeCount ?? 0);
        const nodes = new Float32Array(NODE_SLOTS * 2);
        for (let i = 0; i < count; i++) {
            nodes[i * 2]     =  (p[`smearTwistNx${i}`] ?? 0) / 100;
            nodes[i * 2 + 1] = 1.0 - (p[`smearTwistNy${i}`] ?? 0) / 100;
        }
        if (locs['smearTwistNodes[0]'] != null) gl.uniform2fv(locs['smearTwistNodes[0]'], nodes);

        fade.bindUniforms(gl, prog, p);
        blend.bindUniforms(gl, prog, p);
    },
    glsl: `
uniform int   smearTwistMode;       // 0=linear 1=rotational 2=radial
uniform vec2  smearTwistNodes[24];
uniform int   smearTwistNodeCount;
uniform float smearTwistRadius;
uniform float smearTwistLinearDx;
uniform float smearTwistLinearDy;
uniform float smearTwistRotAngle;
uniform float smearTwistRadialAmt;
uniform vec2  smearTwistCenter;
${fade.glsl}
${blend.glsl}

float smearTwistGauss(float d, float sigma) {
    return exp(-(d * d) / (2.0 * sigma * sigma));
}

void main() {
    vec4 c = texture(uTex, vUV);

    float sigma    = smearTwistRadius / 100.0 * 0.25;
    vec2  totalDisp = vec2(0.0);
    float totalW   = 0.0;

    for (int i = 0; i < 24; i++) {
        if (i >= smearTwistNodeCount) break;
        vec2  nPos = smearTwistNodes[i];
        float d    = distance(vUV, nPos);
        float w    = smearTwistGauss(d, sigma);

        vec2 disp = vec2(0.0);
        if (smearTwistMode == 0) {
            disp = -vec2(smearTwistLinearDx, smearTwistLinearDy) / 100.0 * 0.15;
        } else if (smearTwistMode == 1) {
            vec2  rel    = nPos - smearTwistCenter;
            float rotRad = smearTwistRotAngle * 3.14159265 / 180.0;
            float cosR   = cos(rotRad);
            float sinR   = sin(rotRad);
            vec2  rotated = vec2(rel.x * cosR - rel.y * sinR,
                                 rel.x * sinR + rel.y * cosR);
            disp = (rotated - rel) * 0.5;
        } else {
            vec2 dir = normalize(nPos - smearTwistCenter + vec2(0.0001));
            disp = dir * smearTwistRadialAmt / 100.0 * 0.15;
        }

        totalDisp += w * disp;
        totalW    += w;
    }

    vec2 uv = vUV;
    if (totalW > 0.001) {
        uv = clamp(vUV + totalDisp / max(totalW, 1.0), vec2(0.0), vec2(1.0));
    }

    float weight  = ${fade.fnName}();
    vec3 adjusted = texture(uTex, uv).rgb;
    vec3 faded    = mix(c.rgb, adjusted, weight);
    if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
}
`,
};
