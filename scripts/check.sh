#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ -d node_modules ] || { echo "node_modules missing: run pnpm install" >&2; exit 1; }
pnpm --silent format:check
echo "format OK"
pnpm --silent lint
echo "lint OK"
pnpm --silent typecheck
echo "types OK"
pnpm --silent test
scripts/build.sh >/dev/null
echo "build OK"
if command -v shellcheck >/dev/null; then
    shellcheck -x scripts/*.sh test/fake-herdr.sh
    echo "shellcheck OK"
else
    echo "shellcheck not installed, skipped (sudo dnf install ShellCheck)"
fi
