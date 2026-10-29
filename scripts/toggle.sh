#!/usr/bin/env bash
# Call the extension over D-Bus: toggle.sh [Toggle|Show|Hide|DebugState]
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

method="${1:-Toggle}"
exec gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" \
    --method "$DBUS_IFACE.$method"
