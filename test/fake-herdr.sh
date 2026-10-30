#!/usr/bin/env bash
fixtures="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/fixtures" && pwd)"
args=" $* "
if [[ "$args" == *" agent list "* ]]; then
    cat "$HOME/fake-agent-list.json" 2>/dev/null || cat "$fixtures/agent-list.synthetic-blocked.json"
    exit 0
fi
if [[ "$args" == *" agent focus "* ]]; then
    echo "${*: -1}" >> "$HOME/fake-focus.log"
    exit 0
fi
printf 'fake herdr client: %s\n' "$*"
while true; do sleep 3600; done
