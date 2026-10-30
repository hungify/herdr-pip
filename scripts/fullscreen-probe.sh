#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

interval="${1:-1}"
gnome-extensions enable "$TESTKIT_UUID"
trap 'gnome-extensions disable "$TESTKIT_UUID"' EXIT
while true; do
    raw="$(gdbus call --session --dest "$DBUS_DEST" --object-path "$TESTKIT_PATH" \
        --method "$TESTKIT_IFACE.DebugState" 2>&1)" || { echo "$(date +%T) call failed: $raw"; sleep "$interval"; continue; }
    json="${raw#\(\'}"
    json="${json%\',\)}"
    if command -v jq >/dev/null 2>&1; then
        echo "$(date +%T) $(echo "$json" | jq -c '{badgeVisible, menuOpen, herdrWindow: .herdrWindow.title, focus: (.focus | if . then {title, wmClass, fullscreen} else null end)}')"
    else
        echo "$(date +%T) $json"
    fi
    sleep "$interval"
done
