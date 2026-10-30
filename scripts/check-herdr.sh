#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

schema="$(herdr api schema --json)"
echo "$(herdr --version), protocol $(jq -r '.protocol // .version // "?"' <<<"$schema")"
fail=0
check() { if [ "$2" = true ]; then echo "ok    $1"; else echo "FAIL  $1"; fail=1; fi; }

# shellcheck disable=SC2016
info='.schemas.success_response["$defs"].AgentInfo'
check "status enum is idle/working/blocked/done/unknown" \
    "$(jq '.schemas.event["$defs"].AgentStatus.enum | sort == ["blocked","done","idle","unknown","working"]' <<<"$schema")"
check "agent_list result has agents[] of AgentInfo" \
    "$(jq '[.schemas.success_response["$defs"].ResponseResult.oneOf[] | select(.properties.type.const? == "agent_list") | .properties.agents.items["$ref"]] | first | test("AgentInfo$")' <<<"$schema")"
for field in agent agent_status pane_id focused display_agent name title terminal_title terminal_title_stripped state_labels; do
    check "AgentInfo has $field" "$(jq --arg f "$field" "$info.properties | has(\$f)" <<<"$schema")"
done
check "ErrorBody has code and message" \
    "$(jq '.schemas.error_response["$defs"].ErrorBody.required | index("code") != null and index("message") != null' <<<"$schema")"

req="$(jq -c "$info.required" <<<"$schema")"
known="$(jq -c "$info.properties | keys" <<<"$schema")"
live="$(mktemp)"
trap 'rm -f "$live"' EXIT
herdr agent list >"$live" 2>/dev/null || echo '{"result":{"agents":[]}}' >"$live"
for f in test/fixtures/agent-list*.json "$live"; do
    name="$f"; [ "$f" = "$live" ] && name="live agent list"
    check "$name matches AgentInfo" "$(jq --argjson req "$req" --argjson known "$known" \
        '[.result.agents[] | (($req - keys) + (keys - $known)) | length == 0] | all' "$f")"
done
exit "$fail"
