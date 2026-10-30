#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

out="build/$UUID"
kit="build/$TESTKIT_UUID"
rm -rf "$out" "$kit"
node -e 'JSON.parse(require("fs").readFileSync("src/metadata.json", "utf8"))'
pnpm exec tsc -p src
pnpm exec tsc -p test/headless-testkit
cp src/metadata.json src/stylesheet.css "$out/"
cp -r src/schemas src/icons "$out/"
glib-compile-schemas --strict "$out/schemas"
cp test/headless-testkit/metadata.json "$kit/"
echo "built $out and $kit"
