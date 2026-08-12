// Shared mutable state for the one active overlay at a time.
// All overlay modules import this object and read/write its properties.
export const state = {
    mode:        null,   // 'fade' | 'crop' | 'viewport' | 'lineDrag' | 'chroma' | 'vignette' | 'barrelDistortion' | 'transform' | 'corrupted' | 'text' | 'doubleExposure' | 'shapeSticker' | 'matrixRain' | 'smearTwist' | null
    instId:      null,
    dragging:    false,
    xKey:        null,
    yKey:        null,
    shapeKey:    null,   // param key for shape enum (fade, lineDrag, doubleExposure)
    wKey:        null,
    hKey:        null,
    angleKey:    null,
    enabledKey:  null,   // param key for fade enabled boolean
    skewKey:     null,   // param key for text skew X angle
    handle:      null,   // currently grabbed handle name
    dragAnchor:  null,   // mode-specific drag anchor state
    vpResetting: false,  // re-entrancy guard for _resetPolygonVertices
    cutResetting: false, // re-entrancy guard for resetCutVertices
    cutActive:    -1,    // index of the selected pasted copy in the Cut Out tool
    collageTarget: null, // cell index currently under the pointer during a collage swap-drag
};
