# Herdr CLI fixtures

Captured from the real CLI: **herdr 0.9.5, protocol 22, macOS, 2026-10-29**.
Paths, titles, workspace labels and terminal ids are sanitized; field names and
structure are untouched. Re-checked on Fedora 2026-10-30 against herdr 0.9.5 (the
latest stable release then): live `agent list` output and `herdr api schema --json` match these shapes.

| File | Command | Notes |
|---|---|---|
| `agent-list.json` | `herdr agent list` | claude `done`, codex `working`, claude `working` |
| `agent-list.synthetic-blocked.json` | derived from above | **Synthetic**: only `agent_status` values edited so `blocked` is covered. The value is valid per `herdr api schema --json` |
| `agent-list.synthetic-metadata.json` | built from the 0.9.5 `AgentInfo` schema and the `pane.report_metadata` example in docs/socket-api.mdx | **Synthetic**: `display_agent`, `name` (rename alias), metadata `title`, `state_labels`, and null/absent optional fields. Not captured: no hook in use on the capture machine |
| `agent-get.json` | `herdr agent get <pane_id>` | |
| `workspace-list.json` | `herdr workspace list` | workspace-level `agent_status` roll-up |
| `session-list.json` | `herdr session list --json` | |
| `status.txt` | `herdr status` | plain text, not JSON |
| `error-server-not-running.json` | `herdr --session <missing> agent list` | stderr, exit 1. Does **not** start a server |
| `error-agent-not-found.json` | `herdr agent get nope` | stderr, exit 1 |

Facts the parser can rely on (observed): the agent list only contains panes
where an agent was detected (3 of 12 panes in the capture); `completion_seq`
is absent on some agents; success and error are both JSON, errors on stderr.
