#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

method="${1:?usage: testkit.sh Screenshot /abs/path.png | Click X Y | Drag X1 Y1 X2 Y2 | DebugState}"
shift
exec gdbus call --session --dest "$DBUS_DEST" --object-path "$TESTKIT_PATH" \
    --method "$TESTKIT_IFACE.$method" "$@"
