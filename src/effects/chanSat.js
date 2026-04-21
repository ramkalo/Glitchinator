export default {
    name:  'chanSat',
    label: 'Channel Saturation',
    pass:  'pre-crt',
    paramKeys: ['chanSatRed', 'chanSatGreen', 'chanSatBlue', 'chanSatThreshold', 'chanSatAmount', 'chanSatBlend'],
    params: {
        chanSatEnabled:   { default: false },
        chanSatRed:       { default: false },
        chanSatGreen:     { default: false },
        chanSatBlue:      { default: false },
        chanSatThreshold: { default: 20,  min: 0,    max: 100 },
        chanSatAmount:    { default: 0,   min: -100, max: 100  },
        chanSatBlend:     { default: 100, min: 0,    max: 100  },
    },
    enabled:  (p) => p.chanSatEnabled,
    glsl: `
uniform float chanSatThreshold;
uniform float chanSatAmount;
uniform float chanSatBlend;
uniform int   chanSatRed;
uniform int   chanSatGreen;
uniform int   chanSatBlue;

vec3 rgb2hsl(vec3 c) {
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float l  = (mx + mn) * 0.5;
    if (mx == mn) return vec3(0.0, 0.0, l);
    float d = mx - mn;
    float s = (l > 0.5) ? d / (2.0 - mx - mn) : d / (mx + mn);
    float h;
    if      (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else                h = (c.r - c.g) / d + 4.0;
    return vec3(h / 6.0, s, l);
}
float h2r(float p, float q, float t) {
    if (t < 0.0) t += 1.0; if (t > 1.0) t -= 1.0;
    if (t < 1.0/6.0) return p + (q-p)*6.0*t;
    if (t < 0.5)     return q;
    if (t < 2.0/3.0) return p + (q-p)*(2.0/3.0-t)*6.0;
    return p;
}
vec3 hsl2rgb(float h, float s, float l) {
    if (s == 0.0) return vec3(l);
    float q = (l < 0.5) ? l*(1.0+s) : l+s-l*s;
    float p = 2.0*l - q;
    return vec3(h2r(p,q,h+1.0/3.0), h2r(p,q,h), h2r(p,q,h-1.0/3.0));
}

void main() {
    vec4 c = texture(uTex, vUV);
    vec3 hsl = rgb2hsl(c.rgb);
    float h = hsl.x, s = hsl.y, l = hsl.z;
    float threshold = chanSatThreshold / 100.0;
    float satDelta  = chanSatAmount    / 100.0;
    float blend     = chanSatBlend     / 100.0;
    if (s < threshold) { fragColor = c; return; }
    bool isRed   = h < 1.0/6.0 || h >= 5.0/6.0;
    bool isGreen = h >= 1.0/6.0 && h < 0.5;
    bool isBlue  = h >= 0.5     && h < 5.0/6.0;
    bool match = (isRed&&chanSatRed==1)||(isGreen&&chanSatGreen==1)||(isBlue&&chanSatBlue==1);
    if (!match) { fragColor = c; return; }
    float newS   = clamp(s + satDelta, 0.0, 1.0);
    vec3  modRgb = hsl2rgb(h, newS, l);
    fragColor = vec4(c.rgb + (modRgb - c.rgb) * blend, c.a);
}
`,
};
