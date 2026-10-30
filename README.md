# herdr-pip

A floating badge for [Herdr](https://herdr.dev) on **GNOME Shell 49/50 (Wayland)**. It shows agent status over any
window, fullscreen ones included. Click it, pick an agent, and you land in your own Herdr terminal window on that
agent.

Status: works on GNOME Shell 50.6 (Fedora 44) with herdr 0.9.5. Not tried on 49 yet.

## Features

- **Badge**: an "H" circle that stays above fullscreen windows. A ring shows status changes (blue spin: working,
  green fill: done, red pulse: blocked) and a dot shows that an agent is blocked (red) or done (green). Drag it
  anywhere, also to another monitor.
- **Agent menu**: click the badge or press `Super+Shift+H`. Picking an agent runs `herdr agent focus <pane>` and
  raises the terminal window where your herdr client runs. No terminal is launched.
- **Toasts** next to the badge when an agent is done or blocked. Click one to jump to that agent.
- Optional top bar icon. Settings: `gnome-extensions prefs herdr-pip@hungify`.
- D-Bus `OpenMenu` / `Focus` for when a fullscreen app blocks the shortcut: `scripts/call.sh OpenMenu`.

## Install

```sh
pnpm install
pnpm run pack
gnome-extensions install --force dist/herdr-pip@hungify.shell-extension.zip
# log out and back in, then:
gnome-extensions enable herdr-pip@hungify
gnome-extensions info herdr-pip@hungify | grep State   # ACTIVE
```

To update, run `pnpm run pack` and `gnome-extensions install --force …` again, then log out and back in. The Shell
keeps the old code until the next login, so `disable`/`enable` is not enough.

Install the zip, not a symlink to `build/` (`scripts/dev-install.sh`). Every build rewrites `build/`, so a running Shell
ends up with old code and a new schema, and shows State: ERROR until you log out.

Uninstall: `gnome-extensions uninstall herdr-pip@hungify`.

If State is ERROR, see the error with `journalctl --user -b -o cat | grep -A4 herdr-pip@hungify`. If the extension
is not listed at all, check that `shell-version` in `src/metadata.json` matches `gnome-shell --version`.

## Development

TypeScript compiled by `tsc` into GJS modules in `build/`. The code layout is described in [src/README.md](src/README.md).

```sh
pnpm install
sudo dnf install mutter-devkit   # only for `pnpm dev`
```

A running Shell cannot reload extension code, so develop against a throwaway test Shell:

| Command | What it does |
|---|---|
| `pnpm check` | Format, lint, typecheck, unit tests, build. Same as CI |
| `pnpm smoke` | End-to-end checks in a headless Shell with a fake herdr (~10 s) |
| `pnpm dev` | Test Shell in a window, with your real `herdr` and a throwaway HOME |
| `pnpm dev:fake` | Same, with `test/fake-herdr.sh` (blocked / done / working agents) |
| `pnpm dev:headless` | No window. Drive it with `scripts/call.sh` and `scripts/testkit.sh` |
| `pnpm format` | Format with oxfmt |
| `pnpm run pack` | Build the extension zip into `dist/` |
| `pnpm pot` | Extract translatable strings into `po/herdr-pip.pot` |
| `scripts/check-herdr.sh` | After a herdr update: check its schema and output against what `src/herdr.ts` reads |

Typical loop:

1. Edit `src/`.
2. Run `pnpm check`, then `pnpm smoke`.
3. Run `pnpm dev:fake`. At its prompt, start `ptyxis -s -x herdr &` and `ptyxis -s --fullscreen -T FULLSCREEN &`,
   then click the badge.
4. `exit`, and run it again after the next change.

Test Shell options: `HERDR_PIP_SETTINGS="poll-interval=1"` and `HERDR_PIP_MONITORS="1920x1080 2560x1440"`.

`scripts/fullscreen-probe.sh` logs the badge state in your real session once a second. It needs the test-only testkit
(`scripts/dev-install.sh --with-testkit`). While the testkit is enabled, any process in your session can take
screenshots and inject clicks through it, so remove it when done (`scripts/dev-install.sh` without the flag).

## Known gaps

- The herdr window is found through `/proc` process ancestry. It is not found when herdr runs inside tmux, screen or
  ssh, in a Flatpak terminal, or under gnome-terminal-server.
- Over a fullscreen window the badge sits one top-bar height below the screen edge. It does not cover a fullscreen
  window on another monitor.

## Roadmap

M0 hypothesis test, M1 usable on GNOME, then M2 packaging (RPM/COPR, extensions.gnome.org), M3 Windows, M4 macOS,
M5 other Linux compositors. Only M0 and M1 are in scope now.

## License

MIT, see [LICENSE](LICENSE).
