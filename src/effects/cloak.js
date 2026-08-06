// Cloak — invisible in-pixel payloads (Layer 2). SINGLETON.
//
// Renders nothing; a pass-through whose params are read at export time (src/ui/export.js).
// Five schemes give artists a palette of trade-offs between capacity, stealth, and robustness:
//
//   Spatial / LSB family — PNG-only. Exact pixels, so any re-encode (a social-media repost,
//   a screenshot, a JPEG save) destroys them. Great for lossless channels: a PNG behind a
//   download link, a chat-app *file attachment* (not the inline preview), direct transfer.
//     'standard'   — plain LSB in natural order, documented format, optional AES passphrase.
//     'randomized' — LSB scattered by a password-seeded permutation (private without the key).
//     'edge'       — LSB hidden only in high-gradient / textured pixels (Sobel), harder to spot.
//     'pvd'        — pixel-value differencing: more bits where texture is busy (high capacity).
//
//   Frequency domain — survives moderate JPEG re-compression + resize (e.g. a repost):
//     'robust'     — DCT watermark (src/util/robustWatermark.js). SHORT TEXT only (~29 chars),
//                    best-effort. This is the only scheme that survives a social-media re-upload.
//
// Single shared pixel resource, so only one instance is allowed — hence `singleton: true`.

export const cloakEffect = {
    name: 'cloak',
    label: 'Cloak',
    kind: 'glsl',
    singleton: true,
    paramKeys: [],
    params: {
        cloakEnabled:    { default: false, label: 'Enable' },
        cloakType:       { default: 'text', label: 'Type', options: [['text', 'Text'], ['image', 'Image']] },
        cloakText:       { default: '', type: 'text', label: 'Hidden Text' },
        cloakImage:      { default: null, type: 'imageData', label: 'Hidden Image' },
        cloakScheme:     { default: 'standard', label: 'Scheme', options: [
            ['standard',   'Standard LSB (documented)'],
            ['randomized', 'Randomized LSB (password-seeded)'],
            ['edge',       'Edge-Adaptive (Sobel)'],
            ['pvd',        'PVD (high capacity)'],
            ['robust',     'Resilient (survives re-compression)'],
        ] },
        cloakPassphrase: { default: '', type: 'password', label: 'Passphrase (optional)' },
        cloakKey:        { default: '', type: 'password', label: 'Password / seed' },
        cloakStrength:   { default: 'medium', label: 'Strength', options: [['low', 'Low (most invisible)'], ['medium', 'Medium'], ['high', 'High (most durable)']] },
    },
    // Never renders — the work happens at export. Kept out of the render pass entirely.
    enabled: () => false,
    uiGroups: (p) => {
        const scheme = p.cloakScheme || 'standard';
        const groups = [];
        if (scheme === 'robust') {
            // Resilient is short-text only; image/passphrase/key don't apply.
            groups.push({ label: 'Payload — short text (~29 chars), survives a repost', keys: ['cloakText'] });
            groups.push({ label: 'Scheme', keys: ['cloakScheme'] });
            groups.push({ label: 'Strength', keys: ['cloakStrength'] });
        } else {
            groups.push({ label: 'Content', keys: ['cloakType'] });
            groups.push((p.cloakType || 'text') === 'image'
                ? { label: 'Payload — PNG only; a re-upload destroys it', keys: ['cloakImage'] }
                : { label: 'Payload — PNG only; a re-upload destroys it', keys: ['cloakText'] });
            groups.push({ label: 'Scheme', keys: ['cloakScheme'] });
            // Standard uses an AES passphrase; the scattered schemes use a password seed.
            groups.push(scheme === 'standard'
                ? { label: 'Encryption', keys: ['cloakPassphrase'] }
                : { label: 'Password (seeds the hiding pattern)', keys: ['cloakKey'] });
        }
        return groups;
    },
    glsl: `void main() { fragColor = texture(uTex, vUV); }`,
};
