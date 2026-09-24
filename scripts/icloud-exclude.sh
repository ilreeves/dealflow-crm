#!/bin/sh
# Keep iCloud Drive from syncing generated folders.
#
# This repo lives in an iCloud-synced Documents folder (kept on purpose, for
# the backup). iCloud was racing git and the build: it left "index 2".."index 8"
# conflict copies inside .git and " 2" duplicates through node_modules and
# .next — enough to break `tsc` on duplicate type files. The source files stay
# synced; only these regenerable folders are excluded (history lives on GitHub).
#
# macOS-only and idempotent; a no-op anywhere else (e.g. Vercel's Linux build).
[ "$(uname -s)" = "Darwin" ] || exit 0
cd "$(dirname "$0")/.." || exit 0
for d in .git node_modules .next; do
  mkdir -p "$d"
  xattr -w 'com.apple.fileprovider.ignore#P' 1 "$d" 2>/dev/null || true
done
