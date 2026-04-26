# BXTRXT

Browser-based image editor with retro VFX effects.

## Commands

```
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview # Preview production build
```

## Key Files

- `src/main.js` — Entry point
- `src/effects/registry.js` — Effect definitions
- `src/state/effectStack.js` — Effect stack CRUD
- `src/renderer/pipeline.js` — Processing pipeline
- `src/effects/*.js` — Individual effect modules

## Architecture

Effect stack: ordered list of effects applied in sequence.

To add a new effect:
1. Create `src/effects/myEffect.js`
2. Add to `EFFECTS` in `src/effects/registry.js`