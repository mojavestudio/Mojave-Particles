# Mojave Particles Pro — Build & Publishing Guide

This guide captures the full workflow and requirements for building, packaging, and publishing a Framer plugin. It includes the feedback that led to the correct `plugin.zip` format.

## Goals
- Enable reproducible builds.
- Ensure the packaged `plugin.zip` opens correctly in Framer.
- Provide a single reference for future contributors or AI agents.

## Prerequisites
- Node.js 18+ and npm 8+
- Framer account with Developer Tools enabled

## Project Layout (source)
```
mojave-particles/
  src/
    EnhancedParticleRenderer.tsx
    main.tsx
    plugin.tsx
    vite-env.d.ts
  public/
    icon.png
    icon-dark.png
  framer.json
  index.html
  scripts/pack.js
  vite.config.ts
  package.json
```

## Development
- `npm install`
- Start HTTPS dev server on port 5173:
  - `./dev.sh` (recommended), or `npm run dev`
- In Framer → Plugins → Developer Tools → Open Development Plugin → URL: `https://localhost:5173` → Load.

## Build
- `npm run build` produces `dist/` with:
  - `dist/index.html`
  - `dist/index-<hash>.mjs`
  - icons and static assets

## Packaging (Critical)
Framer requires the entry HTML at the root of the zip. Use the provided pack command which builds and prepares the zip:
- `npm run pack`
- Resulting `plugin.zip` contains at root:
  - `framer.json`
  - `index.html`
  - `index-<hash>.mjs`
  - `icon*.png`

Reference: Framer docs — Publishing your Plugin: [Publishing your Plugin](https://www.framer.com/developers/publishing)

## Real-world Feedback & Fix
- Marketplace review reported: “plugin doesn't open because the root path has no content; HTML is at `/dist/index.html`.”
- Root cause: zip created from `npm run build` output without flattening.
- Fix: use `npm run pack` which flattens `dist/` and ensures `index.html` is at the zip root alongside `framer.json`.

## Updating
- Make changes, bump version in `framer.json` if required.
- `npm run pack` to regenerate `plugin.zip`.
- Upload new zip via Creator Dashboard → your plugin → New Version.

## Submission Checklist
- `framer.json` present at archive root with correct `main: "index.html"` and updated `version`.
- `index.html` at archive root; JS bundle referenced relatively (Vite `base: './'`).
- Bundled JS file present at root (e.g., `index-XXXX.mjs`).
- Icons present at root.
- Plugin loads in Framer (test via Developer Tools if needed).

## Troubleshooting
- Plugin doesn’t open after upload:
  - Check the zip contents. If `index.html` is under `/dist`, re-run `npm run pack`.
  - Ensure `vite.config.ts` sets `base: './'`.
  - Verify `framer.json` exists and `main` points to `index.html`.
- Local dev not loading:
  - Use `https` and port `5173`.
  - Insecure cert errors: use `vite-plugin-mkcert` during dev.

## Command Reference
- `npm run dev` — start dev server
- `npm run build` — build production assets
- `npm run pack` — build and package `plugin.zip`

