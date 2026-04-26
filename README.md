# BXTRXT

Browser-based image editor with retro VFX effects. Works offline via PWA.

## Run

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview # Preview production build
```

## Architecture

### Effect Stack
The app uses an ordered stack of effects. Each effect is applied in sequence to the image.

- **src/state/effectStack.js** — Stack CRUD, stores effect instances
- **src/effects/registry.js** — Effect definitions (EFFECTS array, EFFECT_CATALOG)

### Processing Pipeline
- **src/renderer/pipeline.js** — Main processing entry, debounced
- **src/renderer/canvas2d.js** — Canvas 2D effect rendering
- **src/renderer/webgl.js** — WebGL fallback rendering
- **src/renderer/glstate.js** — WebGL state management

### Effect Module Structure
Each effect in `src/effects/` exports an object:
```js
{
  name: 'effectName',
  label: 'Effect Label',
  pass: 'pre-crt', // transform|pre-crt|context|post
  params: { key: { default: 0, min: -100, max: 100 } },
  canvas2d(ctx, params, imageData) { /* ... */ }
}
```

## Available Effects

| Effect | File | Description |
|--------|------|-------------|
| Basic Adjustments | basic.js | Brightness, contrast, saturation, highlights, shadows, temperature, tint |
| Black Box | blackBox.js | Solid black rectangle censor bar |
| Chromatic Aberration | chroma.js | RGB channel offset |
| CRT Curvature | crtCurvature.js | Barrel distortion |
| CRT Scanlines | crtScanlines.js | Horizontal scanline darkening |
| CRT Static | crtStatic.js | Random noise overlay |
| Crop | crop.js | Image cropping |
| Digitize | digitize.js | Ordered dithering, digital noise |
| Double Exposure | doubleExposure.js | Blend two images |
| Film Grain | grain.js | Analog noise texture |
| Glow | glow.js | Bloom halo effect |
| Invert | invert.js | Color inversion |
| Pixel Art | pixelArt.js | Pixel size reduction, color quantization |
| Rotate | transform.js | Flip and rotate |
| VHS Effect | vhs.js | Tracking errors, color bleed, noise |
| VHS Timestamp | vhs.js | Timestamp text overlay |
| Vignette | vignette.js | Radial edge darkening |
| Waves | waves.js | Wave distortion per channel |

## Adding a New Effect

1. Create `src/effects/myEffect.js` with effect definition object
2. Import and add to `EFFECTS` array in `src/effects/registry.js`
3. Effect auto-appears in UI catalog via `EFFECT_CATALOG`

## Key Files

- `src/main.js` — Entry point, UI event handlers
- `src/effects/registry.js` — Effect definitions, param schemas
- `src/state/params.js` — Global params state
- `src/state/effectStack.js` — Effect stack state
- `src/ui/stackPanel.js` — Effect list UI
- `src/ui/controls.js` — Slider controls generation

## Tech Stack

- Vite — Build tool
- Canvas 2D — Primary rendering pipeline
- WebGL — GPU fallback
- PWA — Offline support
- Capacitor — Mobile app wrapper