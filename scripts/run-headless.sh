#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if [ -z "${HERDR_PIP_INNER:-}" ]; then
    home="$(mktemp -d -t herdr-pip-home.XXXXXX)"
    # cleanup runs from the trap: SC2317 on shellcheck < 0.10, SC2329 on newer
    # shellcheck disable=SC2317,SC2329
    cleanup() {
        for env in /proc/[0-9]*/environ; do
            grep -qzx "HOME=$home" "$env" 2>/dev/null || continue
            pid="${env#/proc/}"
            kill "${pid%/environ}" 2>/dev/null || true
        done
        rm -rf "$home"
    }
    trap cleanup EXIT
    mkdir -p "$home/.local/share/gnome-shell/extensions" "$home/.local/bin"
    "$REPO_ROOT/scripts/build.sh" >/dev/null
    ln -s "$REPO_ROOT/build/$UUID" "$home/.local/share/gnome-shell/extensions/$UUID"
    ln -s "$REPO_ROOT/build/$TESTKIT_UUID" "$home/.local/share/gnome-shell/extensions/$TESTKIT_UUID"
    if [ -n "${HERDR_PIP_FAKE_HERDR:-}" ]; then
        herdr="$REPO_ROOT/test/fake-herdr.sh"
    else
        herdr="$(command -v herdr || true)"
        [ -z "$herdr" ] && [ -x "$HOME/.local/bin/herdr" ] && herdr="$HOME/.local/bin/herdr"
    fi
    [ -n "$herdr" ] && ln -s "$herdr" "$home/.local/bin/herdr"

    env -i HOME="$home" USER="$USER" PATH="$home/.local/bin:/usr/local/bin:/usr/bin:/bin" \
        LANG="${LANG:-C.UTF-8}" XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" TERM="${TERM:-xterm}" \
        HERDR_PIP_SETTINGS="${HERDR_PIP_SETTINGS:-}" HERDR_PIP_DEVKIT="${HERDR_PIP_DEVKIT:-}" HERDR_PIP_MONITORS="${HERDR_PIP_MONITORS:-}" \
        HERDR_PIP_HOST_WAYLAND="${WAYLAND_DISPLAY:-}" HERDR_PIP_INNER=1 dbus-run-session -- "${BASH_SOURCE[0]}" "$@"
    exit $?
fi

gsettings set org.gnome.shell enabled-extensions "['$UUID', '$TESTKIT_UUID']"
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell welcome-dialog-last-shown-version '999'
for kv in show-indicator=true ${HERDR_PIP_SETTINGS:-}; do
    gsettings --schemadir "$REPO_ROOT/build/$UUID/schemas" set "$SCHEMA" "${kv%%=*}" "${kv#*=}"
done

log="$HOME/shell.log"
display="herdr-pip-$$"
if [ -n "${HERDR_PIP_DEVKIT:-}" ]; then
    [ -x /usr/libexec/mutter-devkit ] || command -v mutter-devkit >/dev/null ||
        { echo "mutter-devkit not found: sudo dnf install mutter-devkit" >&2; exit 1; }
    WAYLAND_DISPLAY="$HERDR_PIP_HOST_WAYLAND" gnome-shell --devkit --wayland --no-x11 \
        --wayland-display "$display" >"$log" 2>&1 &
else
    monitors=()
    for size in ${HERDR_PIP_MONITORS:-1920x1080}; do
        monitors+=(--virtual-monitor "$size")
    done
    gnome-shell --headless --wayland --no-x11 "${monitors[@]}" \
        --wayland-display "$display" >"$log" 2>&1 &
fi
shell=$!
export WAYLAND_DISPLAY="$display"
trap 'kill "$shell" 2>/dev/null; wait "$shell" 2>/dev/null || true' EXIT

for _ in $(seq 100); do
    gdbus call --session --dest "$DBUS_DEST" --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Extensions.GetExtensionInfo "$UUID" 2>/dev/null |
        grep -q "'state': <1.0>" &&
        gdbus introspect --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" 2>/dev/null |
        grep -qF "interface $DBUS_IFACE " && break
    kill -0 "$shell" 2>/dev/null || { cat "$log"; exit 1; }
    sleep 0.2
done
echo "test shell up, log: $log"

if [ $# -gt 0 ]; then
    "$@"
else
    (tail -n +1 -f "$log" | grep --line-buffered -E 'herdr-pip:|JS ERROR|JS WARNING|Gjs-CRITICAL') &
    logger=$!
    echo "exit (or Ctrl+D) stops the test Shell; full log: $log"
    PS1='(herdr-pip test) \w$ ' bash --norc -i || true
    pkill -P "$logger" 2>/dev/null || true
    kill "$logger" 2>/dev/null || true
fi
