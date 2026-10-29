#!/usr/bin/env bash
# Print the extension's view of the panel and the focused window once a
# second, for filling docs/m0-results.md while a game is running.
# Usage: fullscreen-probe.sh [interval_seconds]   (Ctrl+C to stop)
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

interval="${1:-1}"
while true; do
    raw="$(gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" \
        --method "$DBUS_IFACE.DebugState" 2>&1)" || { echo "$(date +%T) call failed: $raw"; sleep "$interval"; continue; }
    # gdbus prints ('<json>',); strip the tuple wrapper and quotes.
    json="${raw#\(\'}"
    json="${json%\',\)}"
    if command -v jq >/dev/null 2>&1; then
        echo "$(date +%T) $(echo "$json" | jq -c '{panel: (.panel | if . then {above, minimized, hasFocus, onAllWorkspaces, frame} else null end), focus: (.focus | if . then {title, wmClass, fullscreen} else null end)}')"
    else
        echo "$(date +%T) $json"
    fi
    sleep "$interval"
done
