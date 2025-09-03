# Code Explanation — Mojave Particles Pro

This repository is trimmed to the distributable `plugin.zip` and documentation. The source structure and build setup are summarized here for future reference.

## High-Level Architecture
- React + TypeScript app built with Vite.
- Framer Plugin UI lives in `src/plugin.tsx` and mounts into `index.html` → `#root`.
- Rendering/preview handled by `src/EnhancedParticleRenderer.tsx`.
- Entry point `src/main.tsx` bootstraps the plugin.
- Static assets (icons) are referenced by `index.html` and included in the final package.

## Build & Output
- Vite compiles the project into `dist/` generating:
  - `dist/index.html`
  - `dist/index-<hash>.mjs`
  - `dist/icon*.png`
- Packaging step flattens `dist/` and adds `framer.json` at the root of `plugin.zip`.
- Final `plugin.zip` must contain at root: `index.html`, `index-*.mjs`, icons, and `framer.json`.

## Key Config Files (in source)
- `vite.config.ts`: sets `base: './'`, plugins, and build target.
- `framer.json`: Framer plugin manifest with `main: "index.html"`.
- `scripts/pack.js`: creates `plugin.zip` by flattening `dist/` and including `framer.json`.

## Why Flatten the Build?
Framer expects the entry HTML at the root of the archive. If `index.html` sits under `/dist`, the plugin will not open in Framer. Our pack script resolves this by moving the contents of `dist/` to the root of the zip and adding `framer.json`.

