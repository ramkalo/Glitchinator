import { params } from '../state/params.js';
import { canvas } from '../renderer/glstate.js';

// --- VHS timestamp overlay (draws to canvas context) --------------------

export function applyVHSTimestamp(ctx, p = params) {
    ctx.font = `${p.vhsTimestampSize}px JetBrains Mono, monospace`;

    if (p.vhsTimestampColor === 'black') {
        ctx.fillStyle   = 'rgba(0,0,0,0.85)';
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    } else {
        ctx.fillStyle   = 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    }
    ctx.lineWidth = 2;

    const ts = p.vhsTimestamp;
    const x = (0.5 + p.vhsTimestampX / 100) * canvas.width;
    const y = (0.5 - p.vhsTimestampY / 100) * canvas.height;

    ctx.strokeText(ts, x, y);
    ctx.fillText(ts, x, y);
}

// --- CSS overlay canvas renderer -----------------------------------
// Draws the timestamp onto an absolutely-positioned transparent canvas that
// sits on top of the main canvas. Prevents timestamp from being re-rendered
// on every pixel operation.

export function renderTimestampOverlay(overlayCanvas) {
    overlayCanvas.width  = canvas.width;
    overlayCanvas.height = canvas.height;
    const octx = overlayCanvas.getContext('2d');
    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (params.vhsTimestampEnabled && params.vhsTimestamp) {
        applyVHSTimestamp(octx);
    }
}

// --- Effect definitions -------------------------------------------------

export const vhsEffect = {
    name: 'vhs',
    label: 'VHS Effect',
    pass: 'pre-crt',
    paramKeys: ['vhsTracking', 'vhsTrackingThickness', 'vhsTrackingAmount', 'vhsTrackingSeed', 'vhsTrackingColor', 'vhsBleed', 'vhsNoise'],
    params: {
        vhsEnabled:  { default: false },
        vhsTracking:          { default: 0,  min: 0,   max: 100 },

        vhsTrackingThickness: { default: 3,  min: 1,   max: 50  },
        vhsTrackingAmount:    { default: 2,  min: 2,   max: 20  },
        vhsTrackingSeed:      { default: 1 },
        vhsTrackingColor:     { default: 'shift' },
        vhsBleed:    { default: 0, min: 0, max: 20  },
        vhsNoise:    { default: 0, min: 0, max: 100 },
    },
    enabled: (p) => p.vhsEnabled,
    bindUniforms: (gl, prog, p) => {
        const loc = prog._locs['vhsTrackingColor'];
        if (loc != null) gl.uniform1i(loc, { shift: 0, white: 1, black: 2, noise: 3, color: 4 }[p.vhsTrackingColor] ?? 0);
    },
    glsl: `
uniform float vhsBleed;
uniform float vhsTracking;
uniform float vhsTrackingAmount;
uniform float vhsTrackingThickness;
uniform float vhsTrackingSeed;
uniform int   vhsTrackingColor;
uniform float vhsNoise;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
    // Bleed: red bleeds right (sample from left), blue bleeds left (sample from right)
    float bleedU = vhsBleed / uResolution.x;
    float r = texture(uTex, clamp(vec2(vUV.x - bleedU, vUV.y), vec2(0.0), vec2(1.0))).r;
    float g = texture(uTex, vUV).g;
    float b = texture(uTex, clamp(vec2(vUV.x + bleedU, vUV.y), vec2(0.0), vec2(1.0))).b;
    vec4 col = vec4(r, g, b, texture(uTex, vUV).a);

    // Tracking bands — LCG matches JS Math.imul (both 32-bit unsigned wrap)
    if (vhsTracking > 0.0) {
        float row = (1.0 - vUV.y) * uResolution.y;
        int numBands = int(vhsTrackingAmount);
        float maxShift = ceil(vhsTracking / 100.0 * uResolution.x * 0.2);
        uint lcgState = uint(max(vhsTrackingSeed, 1.0)) * uint(1664525) + uint(1013904223);

        for (int t = 0; t < 20; t++) {
            if (t >= numBands) break;
            lcgState = uint(1664525) * lcgState + uint(1013904223);
            float bandY = float(lcgState) / 4294967296.0 * uResolution.y;
            bandY = clamp(bandY, 0.0, uResolution.y - vhsTrackingThickness);

            uint hsh = (uint(t + 1) * uint(2654435761)) % uint(1000);
            float shift = (float(hsh) / 999.0 * 2.0 - 1.0) * maxShift;

            if (row >= bandY && row < bandY + vhsTrackingThickness) {
                if      (vhsTrackingColor == 1) { col = vec4(1.0); }
                else if (vhsTrackingColor == 2) { col = vec4(0.0, 0.0, 0.0, 1.0); }
                else if (vhsTrackingColor == 3) { float n = hash21(vUV); col = vec4(n, n, n, 1.0); }
                else if (vhsTrackingColor == 4) { col = vec4(hash21(vUV), hash21(vUV + vec2(0.1)), hash21(vUV + vec2(0.2)), 1.0); }
                else { col = texture(uTex, vec2(clamp(vUV.x + shift / uResolution.x, 0.0, 1.0), vUV.y)); }
                break;
            }
        }
    }

    // Noise
    if (vhsNoise > 0.0) {
        float noise = (hash21(vUV + vec2(0.5)) - 0.5) * 120.0 * (vhsNoise / 100.0);
        col.rgb = clamp(col.rgb + noise / 255.0, 0.0, 1.0);
    }

    fragColor = col;
}
`,
};

export const vhsTimestampEffect = {
    name: 'vhsTimestamp',
    label: 'VHS Timestamp',
    pass: 'context',
    paramKeys: ['vhsTimestamp', 'vhsTimestampSize', 'vhsTimestampX', 'vhsTimestampY', 'vhsTimestampColor'],
    params: {
        vhsTimestampEnabled: { default: false },
        vhsTimestamp:        { default: 'DEC 31 1999 11:59:59' },
        vhsTimestampSize:    { default: 64,           min: 8,  max: 512 },
        vhsTimestampX:       { default: 0,             min: -50, max: 50  },
        vhsTimestampY:       { default: 40,            min: -50, max: 50  },
        vhsTimestampColor:   { default: 'white' },
    },
    enabled: (p) => p.vhsTimestampEnabled && !!p.vhsTimestamp,
    canvas2d: applyVHSTimestamp,  // (ctx) => void
};
