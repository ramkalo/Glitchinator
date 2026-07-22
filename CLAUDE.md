# BXTRXT

Browser-based image editor with retro VFX effects.

## Commands

```
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview # Preview production build
```

## Working Rules

- Never start a dev/preview/test server (`npm run dev`, `npm run preview`, vite) — the user runs
  the app themselves.
- Never try to visually confirm changes in a browser. Verification is `npm run build` plus written
  manual test steps for the user.
- Never commit, create branches, or create worktrees. Leave changes in the working tree.

## Key Files

- `src/main.js` — Entry point
- `src/effects/registry.js` — Effect definitions
- `src/state/effectStack.js` — Effect stack CRUD
- `src/renderer/pipeline.js` — Processing pipeline
- `src/effects/*.js` — Individual effect modules

## Architecture

Effect stack: effects render strictly in the user-defined stack order. There is no fixed
pipeline — nothing forces one effect before another. Each effect has a `kind` tag
(`transform` | `glsl` | `context` | `reveal` | `marker`) that describes *how* it is
rendered, never *when*.

To add a new effect:
1. Create `src/effects/myEffect.js`
2. Add to `EFFECTS` in `src/effects/registry.js`