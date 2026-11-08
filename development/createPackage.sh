#!/bin/sh
# Builds the DisnOff IPK into the specified directory (defaults to parent dir).
# Run from anywhere: sh development/createPackage.sh [outdir]
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/..}"
chmod 755 "$ROOT"/tools/*.sh "$ROOT"/tools/lib/*.sh
ares-package -o "$OUT" -e "*README.md" -e "*Screenshot.png" -e "*development/*" -e "*tests/*" -e "*.github/*" -e "*.git/*" -e "*dist/*" -e "*.gitignore" "$ROOT"
sha256sum "$OUT"/com.disnoff.patcher_*.ipk
