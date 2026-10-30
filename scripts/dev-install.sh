#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

extensions="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions"

"$REPO_ROOT/scripts/build.sh"
mkdir -p "$extensions"
for uuid in "$UUID" "$TESTKIT_UUID"; do
    ln -sfn "$REPO_ROOT/build/$uuid" "$extensions/$uuid"
    echo "linked $extensions/$uuid -> $REPO_ROOT/build/$uuid"
done
echo "$TESTKIT_UUID stays disabled; scripts/fullscreen-probe.sh enables it while it runs."
echo
echo "Shell version: $(gnome-shell --version 2>/dev/null || echo 'gnome-shell not found')"
echo "A new extension is only seen by a Shell started after the link exists:"
echo "  - test Shell (isolated, no link needed): pnpm dev"
echo "  - real:    log out and in, then: gnome-extensions enable $UUID"
