# Mojave Particles Pro — Framer Plugin

## Develop

```bash
npm install
# Option A (recommended):
./dev.sh
# Option B:
npm run dev
```
Open in Framer Developer Tools → Open Development Plugin → URL: `https://localhost:5173`

## Pack for Marketplace

```bash
npm run pack
```
This creates `plugin.zip` at the project root. Upload it in the Marketplace dashboard → New Plugin / New Version.

## Notes
- Name (Mojave Particles Pro) and icon are set in `framer.json`.
- Uses HTTPS dev server (mkcert) on port 5173.
- Core particle component is always loaded from a remote Framer shared module; local code files are not used.

## Publishing Checklist (Framer)
- Ensure icon and name are correct (Mojave Particles Pro)
- Test all core flows and functionality
- Test with different project states and browsers
- Verify UI in dark and light mode
- Run `npm run pack` in the plugin root
- Upload the generated `plugin.zip` in the Marketplace dashboard (New Plugin / New Version)
- Fill in the form and submit
