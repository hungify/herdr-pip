#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

"$REPO_ROOT/scripts/build.sh" >/dev/null
src="$REPO_ROOT/build/$UUID"
extra=()
for f in "$src"/*.js; do
    case "$(basename "$f")" in
    extension.js|prefs.js) ;;
    *) extra+=("--extra-source=$(basename "$f")") ;;
    esac
done
extra+=("--extra-source=icons")
if compgen -G "$REPO_ROOT/po/*.po" >/dev/null; then
    extra+=("--podir=$REPO_ROOT/po")
fi
mkdir -p "$REPO_ROOT/dist"
gnome-extensions pack "$src" --force --out-dir="$REPO_ROOT/dist" "${extra[@]}"
echo "built $REPO_ROOT/dist/$UUID.shell-extension.zip"
