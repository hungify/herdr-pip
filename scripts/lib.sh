# shellcheck shell=bash
# Shared constants for the helper scripts.
# shellcheck disable=SC2034
UUID="herdr-pip@hungify"
DBUS_DEST="org.gnome.Shell"
DBUS_PATH="/io/github/hungify/HerdrPip"
DBUS_IFACE="io.github.hungify.HerdrPip"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
