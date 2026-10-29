#!/usr/bin/env bash
# Start a nested GNOME Shell for development. GNOME 49+ removed --nested.
set -euo pipefail

version="$(gnome-shell --version | grep -oE '[0-9]+' | head -n1)"
if [ "${version:-0}" -ge 49 ]; then
    flag="--devkit"
    command -v mutter-devkit >/dev/null 2>&1 || [ -x /usr/libexec/mutter-devkit ] ||
        echo "warning: mutter-devkit not found; install it (on Fedora it may pull in mutter-devel)" >&2
else
    flag="--nested"
fi

echo "GNOME Shell $version, running: dbus-run-session gnome-shell $flag --wayland"
echo "Nested isolation is weak: extension side effects can still reach your real session."
exec dbus-run-session gnome-shell "$flag" --wayland
