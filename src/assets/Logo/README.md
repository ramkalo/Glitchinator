# BXTRXT Logos

Drop logo images into this folder to add them to the pool.

## Naming convention
`BXTRXTLogo-XXXXXXX.ext` — 7-digit zero-padded number, e.g. `BXTRXTLogo-0000001.jpg`

## Supported formats
JPG only. Images should be **480×100px**.

## How it works
Vite discovers all matching files at **build time** via `import.meta.glob`. The app picks one at random on each page load. Clicking the logo swaps it for a different random one (never the same one twice in a row).

**After adding new logos:** restart the dev server (`npm run dev`) or run a fresh build (`npm run build`) so Vite picks up the new files.
