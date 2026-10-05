#!/usr/bin/env bash
# Assembles the release archive deployed to Azure App Service (docs/DEPLOYMENT.md).
# Run from the repository root after `npm ci` and `npm run build`. Reads the working
# tree only; production dependencies are installed in a temporary directory.
# Usage: scripts/package-release.sh <commit-sha> <output.zip>
set -euo pipefail

commit="${1:?commit SHA required}"
output_dir="$(cd "$(dirname "${2:?output zip path required}")" && pwd)"
output="$output_dir/$(basename "$2")"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

if [ ! -f apps/web/.next/BUILD_ID ]; then
  echo "No Next.js build found: run npm run build first." >&2
  exit 1
fi

# Manifests and TypeScript sources needed at runtime (tsx runs the custom server).
cp package.json package-lock.json "$stage/"
for workspace in packages/*; do
  mkdir -p "$stage/$workspace"
  cp "$workspace/package.json" "$stage/$workspace/"
  cp -R "$workspace/src" "$stage/$workspace/"
done
mkdir -p "$stage/apps/web"
cp apps/web/package.json apps/web/server.ts apps/web/next.config.ts apps/web/tsconfig.json "$stage/apps/web/"
cp -R apps/web/src apps/web/public "$stage/apps/web/"
rsync -a --exclude cache apps/web/.next "$stage/apps/web/"
printf '{"commit":"%s","builtAt":"%s"}\n' "$commit" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$stage/apps/web/build-info.json"

# Production dependencies only, built for the machine running this script (Linux x64 in CI).
(cd "$stage" && npm ci --omit=dev --no-audit --no-fund)

# Zip deployment does not reliably keep symlinks: replace workspace links with copies.
for link in "$stage"/node_modules/@incision/*; do
  target="$(cd "$link" && pwd -P)"
  rm "$link"
  if [ "$(basename "$link")" != "web" ]; then
    cp -R "$target" "$link"
  fi
done

rm -f "$output"
(cd "$stage" && zip -qr "$output" .)
echo "Release archive: $output ($(du -h "$output" | cut -f1))"
