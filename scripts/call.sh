#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

method="${1:-OpenMenu}"
shift || true
exec gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" \
    --method "$DBUS_IFACE.$method" "$@"
