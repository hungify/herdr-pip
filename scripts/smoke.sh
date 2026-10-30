#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if [ -z "${HERDR_PIP_INNER:-}" ]; then
    exec env HERDR_PIP_FAKE_HERDR=1 HERDR_PIP_SETTINGS="poll-interval=1" \
        "$REPO_ROOT/scripts/run-headless.sh" "$REPO_ROOT/scripts/smoke.sh"
fi

schemas="$REPO_ROOT/build/$UUID/schemas"
fixture="$REPO_ROOT/test/fixtures/agent-list.synthetic-blocked.json"
passed=0

ok() {
    echo "ok    $1"
    passed=$((passed + 1))
}

fail() {
    echo "FAIL  $1"
    [ -n "${2:-}" ] && echo "      last state: $2"
    grep -E 'JS ERROR|JS WARNING|Gjs-CRITICAL' "$HOME/shell.log" | head -20 || true
    exit 1
}

setting() {
    gsettings --schemadir "$schemas" set "$SCHEMA" "$1" "$2"
}

call() {
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.$1" "${@:2}" >/dev/null
}

testkit() {
    gdbus call --session --dest "$DBUS_DEST" --object-path "$TESTKIT_PATH" --method "$TESTKIT_IFACE.$1" "${@:2}"
}

extension() {
    gdbus call --session --dest "$DBUS_DEST" --object-path /org/gnome/Shell \
        --method "org.gnome.Shell.Extensions.$1Extension" "$UUID" >/dev/null
}

state() {
    local raw
    raw="$(testkit DebugState 2>/dev/null)" || return 1
    raw="${raw#\(\'}"
    printf '%s' "${raw%\',\)}"
}

wait_for() {
    local deadline=$((SECONDS + ${3:-10})) json=''
    while [ "$SECONDS" -lt "$deadline" ]; do
        json="$(state || true)"
        if [ -n "$json" ] && jq -e "$2" >/dev/null 2>&1 <<<"$json"; then
            ok "$1"
            return
        fi
        sleep 0.2
    done
    fail "$1" "$json"
}

wait_file() {
    local deadline=$((SECONDS + 10))
    while [ "$SECONDS" -lt "$deadline" ]; do
        if grep -qx "$3" "$2" 2>/dev/null; then
            ok "$1"
            return
        fi
        sleep 0.2
    done
    fail "$1" "$(cat "$2" 2>/dev/null)"
}

badge_center() {
    state | jq -r '.badgeRect | "\(.[0] + .[2] / 2) \(.[1] + .[2] / 2)"'
}

wait_for "badge shows the fixture counts" \
    '.status.kind == "agents" and .badgeVisible and
     ([.status.parts[] | "\(.count) \(.status)"] | join(", ")) == "1 blocked, 1 done, 1 working"'
wait_for "top bar icon is shown" '.indicator'

call OpenMenu
wait_for "OpenMenu opens the menu" '.menuOpen'
call OpenMenu
wait_for "OpenMenu again closes it" '.menuOpen | not'

read -r x y <<<"$(badge_center)"
testkit Click "$x" "$y" >/dev/null
wait_for "a real click on the badge opens the menu" '.menuOpen'
call OpenMenu
wait_for "menu closed again" '.menuOpen | not'

call Focus wA:p1
wait_file "Focus runs herdr agent focus" "$HOME/fake-focus.log" 'wA:p1'

read -r x y <<<"$(badge_center)"
testkit Drag "$x" "$y" 900 500 >/dev/null
wait_for "dragging moves the badge and saves the position" \
    '.badgePosition[0] >= 0 and .badgePosition[0] < 0.6 and .menuOpen == false'
setting badge-position '(-1.0, -1.0)'
setting badge-monitor "''"
wait_for "resetting the position puts it back in the corner" '.badgePosition == [-1, -1]'

jq '(.result.agents[] | select(.agent_status == "working")).agent_status = "done"' "$fixture" \
    >"$HOME/fake-agent-list.json"
wait_for "an agent that becomes done shows a toast" '(.toast // "") | test("is done")'

setting show-indicator false
wait_for "the top bar icon can be turned off" '.indicator | not'
setting show-indicator true
wait_for "and on again" '.indicator'

herdr_link="$(readlink "$HOME/.local/bin/herdr")"
rm "$HOME/.local/bin/herdr"
wait_for "without herdr the status is missing and the badge is grey" '.status.kind == "missing" and .badgeInactive'
ln -s "$herdr_link" "$HOME/.local/bin/herdr"
wait_for "with herdr back the agents return in color" '.status.kind == "agents" and (.badgeInactive | not)'

for _ in 1 2 3 4 5; do
    extension Disable
    extension Enable
done
wait_for "five disable/enable cycles leave a working badge" '.status.kind == "agents" and .badgeVisible'

exported() {
    gdbus introspect --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" 2>/dev/null | grep -qF "interface $DBUS_IFACE "
}

extension Disable
deadline=$((SECONDS + 10))
while state >/dev/null || exported; do
    [ "$SECONDS" -lt "$deadline" ] || fail "disable removes the badge state and the D-Bus interface" "$(state)"
    sleep 0.2
done
ok "disable removes the badge state and the D-Bus interface"
extension Enable
wait_for "enable brings it back" '.status.kind == "agents" and .badgeVisible'

if grep -qE 'JS ERROR|JS WARNING|Gjs-CRITICAL' "$HOME/shell.log"; then
    fail "no errors or warnings in the Shell log"
fi
ok "no errors or warnings in the Shell log"

echo "smoke: $passed checks passed"
