#!/usr/bin/env bash
# Checks that run anywhere (no GNOME needed): unit tests, schema, JSON, syntax.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

node --test test/*.test.mjs
glib-compile-schemas --strict --dry-run gnome-extension/schemas && echo "schema OK"
node -e 'JSON.parse(require("fs").readFileSync("gnome-extension/metadata.json","utf8"))' && echo "metadata.json OK"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp gnome-extension/extension.js "$tmp/extension.mjs"
node --check "$tmp/extension.mjs" && echo "extension.js syntax OK"
