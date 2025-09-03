#!/bin/bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$ROOT_DIR/.pack-tmp"
ZIP_PATH="$ROOT_DIR/plugin.zip"

KEEP_STAGE=0
KEEP_DIST=0
for arg in "$@"; do
  case "$arg" in
    --keep-stage)
      KEEP_STAGE=1
      shift
      ;;
    --keep-dist)
      KEEP_DIST=1
      shift
      ;;
  esac
done

echo "[pack] Root: $ROOT_DIR"

# 1) Build (prefer npm, then pnpm, then yarn)
if command -v npm >/dev/null 2>&1; then
  (cd "$ROOT_DIR" && npm run build)
elif command -v pnpm >/dev/null 2>&1; then
  (cd "$ROOT_DIR" && pnpm build)
elif command -v yarn >/dev/null 2>&1; then
  (cd "$ROOT_DIR" && yarn build)
else
  echo "[pack] No package runner found (npm/pnpm/yarn). Aborting." >&2
  exit 1
fi

if [[ ! -d "$DIST_DIR" ]]; then
  echo "[pack] Build did not produce dist/. Aborting." >&2
  exit 1
fi

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

# 2) Copy built files into staging root
rsync -a "$DIST_DIR/" "$STAGE_DIR/"

# 3) Ensure framer.json and icons live at the root of the archive
cp "$ROOT_DIR/framer.json" "$STAGE_DIR/"
if [[ -f "$ROOT_DIR/public/icon.png" ]]; then
  cp "$ROOT_DIR/public/icon.png" "$STAGE_DIR/"
fi
if [[ -f "$ROOT_DIR/public/icon-dark.png" ]]; then
  cp "$ROOT_DIR/public/icon-dark.png" "$STAGE_DIR/"
fi

# Safety: ensure reference-only files are never included
rm -f "$STAGE_DIR/particles.tsx" "$STAGE_DIR/particles.jsx" "$STAGE_DIR/particles.js" "$STAGE_DIR/particles.mjs" || true

# 4) Create zip from staging root (versioned + latest symlink)
# Detect version from framer.json
FRAMER_VERSION=$(grep -oE '"version"\s*:\s*"[^"]+"' "$ROOT_DIR/framer.json" 2>/dev/null | head -n1 | sed -E 's/.*"([^"]+)".*/\1/')
if [[ -n "$FRAMER_VERSION" ]]; then
  ZIP_VERSIONED="$ROOT_DIR/plugin-$FRAMER_VERSION.zip"
else
  ZIP_VERSIONED="$ZIP_PATH"
fi

rm -f "$ZIP_VERSIONED" "$ZIP_PATH"
(cd "$STAGE_DIR" && zip -qr "$ZIP_VERSIONED" .)
# Keep a stable name for upload, but also save versioned archive to avoid confusion
cp "$ZIP_VERSIONED" "$ZIP_PATH"

echo "[pack] Wrote $ZIP_VERSIONED"
echo "[pack] Updated latest -> $ZIP_PATH"
echo "[pack] Upload plugin.zip in Framer → Creator Dashboard → Your Plugin → New Version"

# 5) Cleanup staging to avoid duplicates alongside dist/
if [[ "$KEEP_STAGE" -eq 0 ]]; then
  rm -rf "$STAGE_DIR"
  echo "[pack] Cleaned staging directory $STAGE_DIR"
else
  echo "[pack] Kept staging directory (requested): $STAGE_DIR"
fi

# 6) Optionally remove dist to avoid source/build duplicates in workspace
if [[ "$KEEP_DIST" -eq 0 ]]; then
  rm -rf "$DIST_DIR"
  echo "[pack] Removed build directory $DIST_DIR"
else
  echo "[pack] Kept build directory (requested): $DIST_DIR"
fi
