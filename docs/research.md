# Research notes (pre-M0)

Date: 2026-10-29. Machine: macOS (Darwin 25.6), herdr 0.9.5 installed, **no GNOME**.
Everything below is either read from a source (linked) or observed from the real
Herdr CLI. Nothing here has been run on Fedora/GNOME. Labels:
**[observed]** ran it, **[source]** read it in upstream code/docs, **[unverified]** still needs M0.

## 1. Corrections to the original brief

| Brief said | Found | Impact |
|---|---|---|
| Herdr is AGPL-3.0-or-later | `herdrdev/herdr` is **Apache-2.0** [source: GitHub API, herdr.dev] | None on design (CLI-only stays). NOTICE updated |
| Herdr states: idle/done, working, blocked | Schema enum is `idle, working, blocked, done, unknown` [observed: `herdr api schema --json`] | Parser must treat `unknown` as neutral, not an error |
| "Evidence suggests Mutter keeps above-windows over fullscreen" | Source says yes (see 3), but search results show KWin/GTK behave differently | Still needs a real test; do not claim it works |
| Terminals: foot, kitty, ghostty, gnome-terminal | Fedora Workstation ships **Ptyxis** by default | Add Ptyxis to detection (see 4) |

## 2. Herdr CLI

- `herdr agent list`, `agent get <target>`, `workspace list`, `pane list`, `session list --json`,
  `status` all work and print JSON (except `status`, plain text) [observed]. Captured in `test/fixtures/`.
- `herdr api schema --json` prints the bundled JSON schema (protocol 22, ~270 KB) [observed].
  Use it to validate fixtures instead of guessing fields.
- `herdr api snapshot` prints live session state [source: `--help`]. Not evaluated yet.
- **Statuses** [observed + docs]: `working`; `blocked` = approval/question UI recognized;
  `done` = idle but *not yet marked seen*; `idle` = ready for input; `unknown` = classifier not confident.
  Consequence: a "done" badge count means "finished, unseen", and it clears once the user looks. Good for a badge.
- `agent list` returns only panes with a detected agent, with fields:
  `agent, agent_status, completion_seq?, cwd, focused, foreground_cwd, pane_id, revision, state_change_seq, tab_id, terminal_id, terminal_title, terminal_title_stripped, workspace_id`.
  `completion_seq` is optional. Titles may contain non-ASCII (spinner glyphs, Vietnamese text).
- **Errors** [observed]: JSON `{"id":..., "error":{"code","message"}}` on **stderr**, exit 1; invalid CLI syntax exits 2 [docs].
  Known codes: `server_not_running`, `agent_not_found`, plus `agent_not_ready, agent_blocked, agent_prompt_stalled, agent_not_running, agent_not_idle, timeout` [docs].
- `herdr --session <missing> agent list` returns `server_not_running` and **does not spawn a server** [observed].
  So polling a down session is safe and cheap to handle as a neutral state.
- Polling cost: each poll spawns the `herdr` binary. Acceptable at a few seconds; an event-driven option
  (`herdr agent wait`, socket subscriptions) exists but conflicts with decision 2 (CLI only), so stay with polling.
- Prior art around Herdr (none reused): `finna/herdr-hud`, `penso/herdr-gpui` (native GPUI client),
  `missuo/herdrm` (macOS console), `dcolinmorgan/herdr-remote` (menu bar/phone).

## 3. Always-on-top over fullscreen (Mutter)

- Mutter `meta_window_get_default_layer()` in `gnome-46`, `48`, `49`, `50` and `main` [source: `src/core/window.c`]:
  `wm_state_below -> BOTTOM`; `wm_state_above && !maximized -> TOP`; otherwise `NORMAL`
  (DOCK drops to BOTTOM when the monitor is fullscreen). **There is no fullscreen layer**, so an "above"
  window should stack over a fullscreen game. Note the `!maximized` clause: **never maximize the panel**.
- Contrast: KWin puts fullscreen above keep-above, and GTK's Wayland `set_keep_above` is a no-op
  [source: Mutter #1258, KWin MR 4953]. That is why this must be done from the Shell via `Meta.Window`, not from the app.
- Still **[unverified]**: direct-scanout/unredirect of the game, Xwayland and Proton windows, focus
  behaviour, pointer-lock games, VRR. All covered by the M0 matrix.
- Shell chrome added with `Main.layoutManager.addChrome()` lives in `uiGroup`, above the window group, so the
  M1 badge should be visible over fullscreen unless `trackFullscreen` hides it. **[unverified]**.

## 4. Hotkey risk: keyboard-shortcuts-inhibit (new, not in the brief)

Mutter lets a focused Wayland surface (games, VMs, remote desktops) inhibit compositor shortcuts
[source: Mutter commit adding the inhibit mechanism]. While inhibited, **extension keybindings are expected to
stop firing too**, except the restore key (`Super+Escape` by default). This could make the toggle hotkey
dead exactly when a game is focused. **[unverified]**. M0 needs a row for it. Mitigations to evaluate:
expose a D-Bus method on the extension so any external trigger (controller daemon, `gdbus call`) can toggle;
document the restore key.

## 5. Terminal detection and window identity

| Terminal | Set window id / title | Notes |
|---|---|---|
| foot | `--app-id`, `--title` [source: man page] | Best candidate; Wayland-native |
| ghostty | `class` config sets the Wayland app id; `title` config [source: docs] | `gtk-single-instance` interacts with `class`; use a distinct class |
| kitty | `--title`, `--class` (verify) | `--class` not confirmed in this pass |
| Ptyxis (Fedora default) | `--new-window`, `--title`, `--standalone`, `-x` [source: `ptyxis-application.c`] | No app-id option found; single instance. Match by title, use `--standalone` |
| gnome-terminal | `--title`, `--role`, `--geometry`, `app-id` option exists in source | Single `gnome-terminal-server`; verify what `app-id` does |

Matching rule for M0: prefer app id / `wm_class`, fall back to title. Title is fragile because Herdr or the shell can overwrite it
**[unverified: does Herdr set the terminal title?]**. Re-check on `notify::title` like PiP on top does.

## 6. Dev loop and GNOME versions

- GNOME 48 and older: `dbus-run-session gnome-shell --nested --wayland`.
  **GNOME 49+: `--nested` was removed**; use `dbus-run-session gnome-shell --devkit --wayland`, which needs the
  `mutter-devkit` binary (on Fedora this reportedly drags in `mutter-devel`) [source: gjs.guide, GNOME Discourse, RH Bugzilla 2418788].
  The brief said "`--devkit` on recent GNOME", which matches.
- Nested isolation is weak: it does not protect the host from side effects.
- ESM extensions: `Extension` from `resource:///org/gnome/shell/extensions/extension.js`, default-export class with `enable()`/`disable()` [source: gjs.guide].
- A GNOME 50 port guide was a draft MR at the time of searching; **read it before pinning `shell-version`**. Actual versions must come from `gnome-shell --version` on the target.

## 7. extensions.gnome.org review rules that shape the design [source: gjs.guide review guidelines]

- Create nothing before `enable()`; destroy widgets, disconnect signals and remove **every** main-loop source in `disable()`.
- No `Mainloop`, `Lang`, `ByteArray`; no minified code; no excessive logging; no bundled binaries.
- Spawned processes discouraged but allowed if handled carefully; scripts should be GJS. **Our terminal launch is a spawn of a user-chosen terminal; justify it in the description.**
- `prefs.js` must not import `Clutter`, `Meta`, `St`, `Shell`; Shell must not import `Gtk/Gdk/Adw`.
- Schema id must start with `org.gnome.shell.extensions`, path `/org/gnome/shell/extensions`, file `<id>.gschema.xml` in the zip.
- `uuid` is `name@namespace` (namespace not `gnome.org`); list only stable `shell-version`s.
- Licensing must be GPL-compatible; MIT is acceptable. Code copied from another extension must be attributed.
- The guidelines also forbid AI-generated code the author cannot justify and explain: review everything before submitting.

## 8. PiP on top (reference only)

GPL-2.0 [source: GitHub API]. Approach [source: `extension.js`]: matches on `window.title` (not `wm_class`), calls
`window.make_above()` / `unmake_above()` and `stick()` / `unstick()` dynamically, listens to workspace `window-added`/`window-removed`,
`switch-workspace` and per-window `notify::title`; in `disable()` it only un-above/unsticks windows that have the flag set.
We re-implement the idea; no code copied, so MIT stays valid.

## 9. Sources

- Herdr: <https://herdr.dev>, <https://herdr.dev/docs/agent-automation/>, <https://github.com/herdrdev/herdr>
- PiP on top: <https://github.com/Rafostar/gnome-shell-extension-pip-on-top>
- herdr-hud: <https://github.com/finna/herdr-hud>
- Review guidelines: <https://gjs.guide/extensions/review-guidelines/review-guidelines.html>
- Creating/running extensions: <https://gjs.guide/extensions/development/creating.html>
- GNOME 49 nested sessions: <https://discourse.gnome.org/t/gnome-49-nested-sessions-no-longer-possible/30987>
- Mutter stacking: `src/core/window.c` (`meta_window_get_default_layer`) on branches gnome-46/48/49/50/main
- Mutter #1258 (keep-above on Wayland): <https://gitlab.gnome.org/GNOME/mutter/-/issues/1258>
- KWin layer rule: <https://invent.kde.org/plasma/kwin/-/merge_requests/4953>
- foot man page: <https://codeberg.org/dnkl/foot>; Ptyxis source: <https://gitlab.gnome.org/chergert/ptyxis>
