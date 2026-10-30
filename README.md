# herdr-pip

A floating badge for [Herdr](https://herdr.dev) on **Fedora GNOME (Wayland)**: glance at agent status from
any app, fullscreen ones included, click it to pick an agent, and land in your **own Herdr terminal window** on that
agent.

> **Not affiliated with Herdr.** Herdr is only invoked as an external CLI process. See [NOTICE.md](NOTICE.md).
> Inspired by [finna/herdr-hud](https://github.com/finna/herdr-hud) (idea only, no code reused).

## Status: works on GNOME Shell 50.6 (Fedora, Wayland)

| Item | State |
|---|---|
| Herdr CLI JSON shapes | **Verified** on herdr 0.9.5 (macOS capture, same output on Fedora), sanitized in [`test/fixtures`](test/fixtures) |
| Badge visible over a fullscreen window, clicks only inside the badge | **Works** (headless Shell 50.6 and real session) |
| Click badge > pick agent > `herdr agent focus` + raise the herdr window | **Works** (real pointer clicks, `pnpm smoke`) |

Try it: see Development below.

## Design (decided)

1. A floating badge, not a panel: a small "H" circle, always on top (Shell chrome, so it stays over fullscreen
   windows). A 2 px progress ring around it plays the latest status changes one at a time, like a queue
   (blue arc spinning: an agent started working; green ring filling: one is done; red ring pulsing: one is
   blocked; 3 s each), and spins while any agent works. A dot shows that an agent is blocked (red) or done
   (green); the agents themselves are in its menu. The optional top bar icon is the same "H" mark with the same dot.
   It takes clicks only inside itself and stays where you put it: drag it anywhere, also onto another monitor
   (remembered; by default the top-right corner of the primary monitor).
2. When an agent becomes done or blocked, a toast appears next to the badge for a few seconds, also over
   fullscreen windows (GNOME holds its own banners back there). Clicking it jumps to that agent.
   Everything is adjustable in Settings (`gnome-extensions prefs herdr-pip@hungify`): badge size, color,
   opacity and dot, which statuses toast and for how long, session, poll interval.
3. Clicking the badge (or `Super+Shift+H`) lists the agents. Picking one runs `herdr agent focus <pane>` and raises the
   terminal window where your herdr client already runs (found by walking up from the client's process to the
   process that owns a window). **No terminal is launched** and there is no custom chat UI.
4. Only integration surface: Herdr's public CLI, as a separate process (`agent list` polling, `agent focus`).
5. GNOME Shell extension (GNOME 49/50), written in TypeScript and compiled to GJS ES modules, kept thin.

Changed on 2026-10-30: the first version launched its own terminal running `herdr` and kept it above other
windows (`make_above()`). That was dropped in favour of the badge (still in git history, commit deb35b5).

## Layout

```
src/               the extension in TypeScript (strict), plus metadata.json, stylesheet.css, schemas/; see src/README.md
build/             compiled extension (git-ignored); this is what GNOME Shell loads and what ships
scripts/           build / install / pack / test Shell / D-Bus calls / probe / check
test/              node unit tests (TypeScript), Herdr CLI fixtures (sanitized), fake herdr, headless testkit
types/             ambient types for gi:// and Shell modules (@girs/gnome-shell 50)
```

## Development

The code is TypeScript with every strictness flag on (`tsconfig.base.json`: `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, ...) and
type-aware lint (`typescript-eslint` strict + stylistic type-checked). Formatting is oxfmt's (`.oxfmtrc.json`: 4
spaces, single quotes, no bracket spacing, 120 columns); `pnpm lint` runs oxlint first (`.oxlintrc.json`), then
ESLint for the type-aware rules, with the rules oxlint already covers turned off in ESLint. Each code directory has its own
`tsconfig.json` (`src/`, `test/`, `test/headless-testkit/`) extending `tsconfig.base.json`; the root one only covers
`eslint.config.ts` (loaded by ESLint through `jiti`). Package manager: pnpm (`packageManager` in
`package.json`). `tsc` compiles `src/` into readable ES modules in `build/herdr-pip@hungify/`; sources import each other as `./herdr.ts`, rewritten to
`./herdr.js` on build. Pure modules (`herdr.ts`, `appearance.ts`, `ring.ts`, `placement.ts`) have no `gi://` imports, so the
unit tests run them directly with node's type stripping.

One-time setup:

```sh
pnpm install                     # typescript, typescript-eslint, @girs types; nothing here ships
sudo dnf install mutter-devkit   # only for `pnpm dev` (a visible test Shell, GNOME 49+)
```

GNOME Shell cannot reload an extension's code in a running Shell (on Wayland the real session needs a
log out). So develop against a throwaway Shell instead and restart it after each change; it takes a few seconds:

| Command | What it does |
|---|---|
| `pnpm build` | Compile `src/` into `build/` (the `dev*`, `pack` and install scripts do this first) |
| `pnpm dev` | Test Shell in a window on your desktop (devkit), with your real `herdr` in a throwaway HOME |
| `pnpm dev:fake` | Same, with `test/fake-herdr.sh`, so the badge shows blocked / done / working |
| `pnpm dev:headless` | No window; drive it with `scripts/call.sh` and `scripts/testkit.sh Click X Y` / `Drag X1 Y1 X2 Y2`, look with `scripts/testkit.sh Screenshot /abs/shot.png` and `scripts/testkit.sh DebugState` |
| `pnpm check` | Format check + oxlint + ESLint + typecheck + unit tests + build (schema compiled `--strict`), same as CI |
| `pnpm format` | Format the code with oxfmt (`pnpm format:check` only checks) |
| `pnpm smoke` | End-to-end check in a headless Shell with the fake herdr (~10 s): counts, menu by D-Bus and by a real click, focus, drag and reset, toast, top bar icon, herdr missing, 5 disable/enable cycles, D-Bus interface gone after disable, no `JS ERROR`/`JS WARNING` in the log |
| `scripts/check-herdr.sh` | After updating herdr: checks `herdr api schema --json`, the fixtures and a live `agent list` against what `src/herdr.ts` reads |
| `pnpm run pack` | Build `dist/herdr-pip@hungify.shell-extension.zip` from `build/` (plus translations from `po/*.po`) |
| `pnpm pot` | Extract translatable strings into `po/herdr-pip.pot` |

Options for the test Shell (`pnpm dev*` and `scripts/run-headless.sh`):

- `HERDR_PIP_SETTINGS="poll-interval=1"`: settings applied before the extension starts.
- `HERDR_PIP_MONITORS="1920x1080 2560x1440"`: several virtual monitors.

The fake herdr prints `test/fixtures/agent-list.synthetic-blocked.json` for `agent list`, or
`$HOME/fake-agent-list.json` if you write one inside the test Shell. `agent focus X` appends X to
`$HOME/fake-focus.log`.

Each `dev*` command opens a prompt connected to the test Shell and prints the extension's log lines
(`herdr-pip:`, `JS ERROR`) as they happen. Typical loop:

1. Edit code under `src/`.
2. `pnpm check` (seconds; catches most mistakes before a Shell is involved), then `pnpm smoke` for the Shell side.
3. `pnpm dev:fake`, then at its prompt: `ptyxis -s -x herdr &` (a terminal running the fake herdr client),
   `ptyxis -s --fullscreen -T FULLSCREEN &` (a fullscreen window), then click the badge in the window (or `scripts/call.sh`).
4. `exit` and run it again after the next change. Everything it started is cleaned up.

Settings (`prefs.ts`) run in their own process: after `pnpm build`, `gnome-extensions prefs herdr-pip@hungify`
inside the test Shell picks up changes without restarting it.

### Install in your real session

Install a copy from the zip, not a symlink to `build/`:

```sh
pnpm run pack
gnome-extensions install --force dist/herdr-pip@hungify.shell-extension.zip
# log out and back in (Wayland), then:
gnome-extensions enable herdr-pip@hungify
gnome-extensions info herdr-pip@hungify | grep State   # ACTIVE
```

To update, run the same two commands, then log out and back in. `disable`/`enable` is not enough because the Shell
keeps the old code cached until the next login.

Why not a symlink (`scripts/dev-install.sh`): every `pnpm build`/`check`/`smoke` rewrites `build/`, so the running
Shell ends up with old code and a new schema. It then fails on the next enable with errors like
`GSettings key ... not found` (State: ERROR) until you log out. Use the symlink only if you log out after each build.

Settings: `gnome-extensions prefs herdr-pip@hungify`, or from a shell, for example
`gsettings --schemadir ~/.local/share/gnome-shell/extensions/herdr-pip@hungify/schemas set org.gnome.shell.extensions.herdr-pip session work`.

To watch the running badge, run `scripts/fullscreen-probe.sh` in a second terminal. Once a second it logs the badge
state, the herdr window it would raise and the focused window. It needs the test-only testkit
(`scripts/dev-install.sh --with-testkit`), enables it while it runs and disables it on exit. While the testkit is
enabled, any process in your session can take screenshots and inject clicks through it, so remove it when done.

Uninstall: `gnome-extensions uninstall herdr-pip@hungify`. If it fails:

- **State: ERROR:** run `journalctl --user -b -o cat | grep -A4 herdr-pip@hungify` to see the error.
- **Extension not loaded at all:** check that `shell-version` in `src/metadata.json` matches `gnome-shell --version`.

### Known gaps

- The herdr window is found through `/proc` process ancestry. It is not found for a herdr client inside tmux, screen
  or ssh, for a Flatpak terminal using `flatpak-spawn --host`, or for a terminal that hands its children to a
  separate server process (gnome-terminal-server). You then get a notification.
- With several windows of a single-instance terminal (ghostty, Ptyxis), the one titled "herdr" wins. Otherwise the
  most recently used window of that terminal is raised.
- The badge sits in the monitor's work area, so over a fullscreen window it is one top-bar height below the screen
  edge. A fullscreen window on another monitor is not covered by it.
- A fullscreen app can keep `Super+Shift+H` from reaching the Shell. Use `scripts/call.sh OpenMenu` instead.

## Roadmap

M0 hypothesis test, M1 usable on GNOME, then M2 packaging (RPM/COPR, extensions.gnome.org), M3 Windows (Tauri),
M4 macOS, M5 other Linux compositors via layer-shell. Only M0 and M1 are in scope now.

## License

MIT, see [LICENSE](LICENSE).
