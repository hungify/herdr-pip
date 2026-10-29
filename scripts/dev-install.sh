#!/usr/bin/env bash
# Symlink the extension into the user extension dir and compile its schema.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

src="$REPO_ROOT/gnome-extension"
dest="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

glib-compile-schemas --strict "$src/schemas"
mkdir -p "$(dirname "$dest")"
ln -sfn "$src" "$dest"
echo "linked $dest -> $src"
echo
echo "Shell version: $(gnome-shell --version 2>/dev/null || echo 'gnome-shell not found')"
echo "A new extension is only seen by a Shell started after the link exists:"
echo "  - nested:  scripts/run-devkit.sh, then in its terminal: gnome-extensions enable $UUID"
echo "  - real:    log out and in, then: gnome-extensions enable $UUID"
