// Overwrite — editable file-container metadata (Layer 3). SINGLETON.
//
// Renders nothing; a pass-through whose params are read at export time (see src/ui/export.js)
// and written via src/util/imageMeta.js. Covers standard fields (c) and arbitrary custom
// fields (d), plus a machine-readable AI opt-out. Written as XMP (PNG chunk / JPEG APP1) and,
// optionally for JPEG, classic EXIF. Single source of truth for the file's metadata, so only
// one instance is allowed (`singleton: true`).

// param key → imageMeta.standard field name
const STD_MAP = {
    metaMake: 'make', metaModel: 'model', metaLens: 'lens', metaFocalLength: 'focalLength',
    metaExposureTime: 'exposureTime', metaFNumber: 'fNumber', metaISO: 'iso',
    metaCopyright: 'copyright', metaCreator: 'creator', metaPublisher: 'publisher',
    metaSoftware: 'software', metaDescription: 'description', metaDateTime: 'dateTime',
};

export const overwriteEffect = {
    name: 'overwrite',
    label: 'Overwrite',
    kind: 'glsl',
    singleton: true,
    paramKeys: [],
    params: {
        overwriteEnabled:  { default: false, label: 'Enable' },
        metaPreserveOriginal: { default: false, label: 'Copy metadata from loaded image' },
        metaMake:         { default: '', type: 'text', label: 'Camera Make' },
        metaModel:        { default: '', type: 'text', label: 'Camera Model' },
        metaLens:         { default: '', type: 'text', label: 'Lens' },
        metaFocalLength:  { default: '', type: 'text', label: 'Focal Length (mm)' },
        metaExposureTime: { default: '', type: 'text', label: 'Shutter / Exposure' },
        metaFNumber:      { default: '', type: 'text', label: 'Aperture (f/)' },
        metaISO:          { default: '', type: 'text', label: 'ISO' },
        metaCopyright:    { default: '', type: 'text', label: 'Copyright' },
        metaCreator:      { default: '', type: 'text', label: 'Creator / Artist' },
        metaPublisher:    { default: '', type: 'text', label: 'Publisher' },
        metaSoftware:     { default: '', type: 'text', label: 'Software' },
        metaDescription:  { default: '', type: 'text', label: 'Description' },
        metaDateTime:     { default: '', type: 'text', label: 'Date' },
        metaGpsLat:       { default: '', type: 'text', label: 'GPS Latitude (decimal, e.g. 37.7749)' },
        metaGpsLon:       { default: '', type: 'text', label: 'GPS Longitude (decimal, e.g. -122.4194)' },
        metaGpsAlt:       { default: '', type: 'text', label: 'GPS Altitude (meters, optional)' },
        metaCustom:       { default: '[]', type: 'keyvalue', label: 'Custom Fields' },
        metaAiOptOut:     { default: false, label: 'AI opt-out signal (no-AI-training)' },
        metaWriteXMP:     { default: true,  label: 'Write XMP (PNG + JPEG)' },
        metaWriteEXIF:    { default: false, label: 'Write classic EXIF (JPEG only)' },
    },
    enabled: () => false,
    uiGroups: [
        { label: 'Preserve', keys: ['metaPreserveOriginal'] },
        { label: 'Camera', keys: ['metaMake', 'metaModel', 'metaLens', 'metaFocalLength', 'metaExposureTime', 'metaFNumber', 'metaISO'] },
        { label: 'Rights & Source', keys: ['metaCopyright', 'metaCreator', 'metaPublisher', 'metaSoftware', 'metaDescription', 'metaDateTime'] },
        { label: 'Location (GPS)', keys: ['metaGpsLat', 'metaGpsLon', 'metaGpsAlt'] },
        { label: 'Custom Fields', keys: ['metaCustom'] },
        { label: 'Protect', keys: ['metaAiOptOut'] },
        { label: 'Output', keys: ['metaWriteXMP', 'metaWriteEXIF'] },
    ],
    glsl: `void main() { fragColor = texture(uTex, vUV); }`,
};

// Collect the standard-field values from an instance's params into the imageMeta shape.
export function collectMetadataFields(p) {
    const standard = {};
    for (const [k, short] of Object.entries(STD_MAP)) {
        if (p[k]) standard[short] = p[k];
    }
    let custom = [];
    try { custom = JSON.parse(p.metaCustom || '[]').filter(e => e && e.key); } catch { /* ignore */ }

    // GPS entered as decimal degrees; only included when both lat & lon parse to real numbers.
    let gps = null;
    const lat = parseFloat(p.metaGpsLat);
    const lon = parseFloat(p.metaGpsLon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
        gps = { lat, lon };
        const alt = parseFloat(p.metaGpsAlt);
        if (Number.isFinite(alt)) gps.alt = alt;
    }

    return { standard, custom, aiOptOut: !!p.metaAiOptOut, gps };
}
