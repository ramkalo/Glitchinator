// Embed (Hidden) — invisible in-pixel payloads (Layer 2). SINGLETON.
//
// Renders nothing; a pass-through whose params are read at export time (src/ui/export.js).
// Three schemes:
//   'standard' — LSB steg, documented, optionally passphrase-encrypted (text or image).
//   'bxtrxt'   — LSB steg, key-scattered, private (text or image).
//   'robust'   — DCT watermark (src/util/robustWatermark.js): SHORT TEXT that survives
//                moderate JPEG re-compression + resize (e.g. sent through a chat app).
// LSB schemes are PNG-only (export forces PNG) and die on any re-encode; robust survives
// lossy but carries only a short message and is best-effort. Single shared pixel resource,
// so only one instance is allowed — hence `singleton: true`.

export const embedHiddenEffect = {
    name: 'embedHidden',
    label: 'Embed',
    kind: 'glsl',
    singleton: true,
    paramKeys: [],
    params: {
        embedHiddenEnabled:    { default: false, label: 'Enable' },
        embedHiddenType:       { default: 'text', label: 'Type', options: [['text', 'Text'], ['image', 'Image']] },
        embedHiddenText:       { default: '', type: 'text', label: 'Hidden Text' },
        embedHiddenImage:      { default: null, type: 'imageData', label: 'Hidden Image' },
        embedHiddenScheme:     { default: 'standard', label: 'Scheme', options: [['standard', 'Standard (documented)'], ['bxtrxt', 'BXTRXT (private)'], ['robust', 'Robust (survives compression)']] },
        embedHiddenPassphrase: { default: '', type: 'password', label: 'Passphrase (optional)' },
        embedHiddenKey:        { default: '', type: 'password', label: 'Key' },
        embedHiddenStrength:   { default: 'medium', label: 'Strength', options: [['low', 'Low (most invisible)'], ['medium', 'Medium'], ['high', 'High (most durable)']] },
    },
    // Never renders — the work happens at export. Kept out of the render pass entirely.
    enabled: () => false,
    uiGroups: (p) => {
        const scheme = p.embedHiddenScheme || 'standard';
        const groups = [];
        if (scheme === 'robust') {
            // Robust is short-text only; the image type/passphrase/key don't apply.
            groups.push({ label: 'Payload (short text — survives compression)', keys: ['embedHiddenText'] });
            groups.push({ label: 'Scheme', keys: ['embedHiddenScheme'] });
            groups.push({ label: 'Strength', keys: ['embedHiddenStrength'] });
        } else {
            groups.push({ label: 'Content', keys: ['embedHiddenType'] });
            groups.push((p.embedHiddenType || 'text') === 'image'
                ? { label: 'Payload', keys: ['embedHiddenImage'] }
                : { label: 'Payload', keys: ['embedHiddenText'] });
            groups.push({ label: 'Scheme', keys: ['embedHiddenScheme'] });
            groups.push(scheme === 'bxtrxt'
                ? { label: 'Key', keys: ['embedHiddenKey'] }
                : { label: 'Encryption', keys: ['embedHiddenPassphrase'] });
        }
        return groups;
    },
    glsl: `void main() { fragColor = texture(uTex, vUV); }`,
};
