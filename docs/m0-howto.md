# Running herdr-pip on Fedora

How to build, try and install the extension; results are in `docs/m0-results.md`.

## 0. Prerequisites

```sh
gnome-shell --version      # record it; edit src/metadata.json "shell-version" to match
herdr --version
pnpm install               # dev tooling: eslint, typescript, GNOME Shell 50 types
scripts/check.sh           # lint, types, unit tests, build (needs node and glib-compile-schemas)
```

If your GNOME version is not 49 or 50, update `shell-version` first, otherwise the Shell will not load the extension.
On a development release, list at most one.

## 1. Install

```sh
scripts/dev-install.sh                  # the extension only
scripts/dev-install.sh --with-testkit   # also the test-only herdr-pip-testkit@hungify (step 4 needs it)
```

The testkit is left disabled. While enabled it exposes Screenshot/Click/Drag on the session bus, so run
`scripts/dev-install.sh` again without the flag to remove it when done.
A newly linked extension is only seen by a Shell started afterwards.

The symlink points at `build/`, so log out after every build: a running Shell with old code and a new schema
fails with State: ERROR. For everyday use install the zip instead (see "Install in your real session" in the README).

## 2. Try it in a test Shell first

Headless needs nothing extra and touches nothing in your session (throwaway HOME, own session bus,
leftover processes started with that HOME are killed on exit):

```sh
scripts/run-headless.sh                       # interactive shell talking to the headless Shell
# inside it:
ptyxis -s -x herdr &                         # a terminal running herdr (the window to jump to)
ptyxis -s --fullscreen -T FULLSCREEN &       # a fullscreen window
scripts/call.sh OpenMenu; scripts/testkit.sh DebugState
scripts/testkit.sh Click 1655 60             # click the badge (test-only extension in test/headless-testkit)
scripts/testkit.sh Screenshot /tmp/shot.png  # screenshot

HERDR_PIP_FAKE_HERDR=1 HERDR_PIP_SETTINGS="poll-interval=1" scripts/run-headless.sh
HERDR_PIP_MONITORS="1920x1080 2560x1440" scripts/run-headless.sh   # several virtual monitors
# fake herdr: `agent list` prints test/fixtures/agent-list.synthetic-blocked.json,
# or $HOME/fake-agent-list.json if you write one inside the headless shell;
# `agent focus X` appends X to $HOME/fake-focus.log
```

Same isolation, but visible and interactive in a window on your desktop (GNOME 49+ replaced
`--nested` with `--devkit`; `mutter-devkit` is a small package):

```sh
sudo dnf install mutter-devkit
HERDR_PIP_DEVKIT=1 scripts/run-headless.sh
# apps started from that prompt open inside the window, e.g. a fullscreen one:
ptyxis -s -x herdr &
ptyxis -s --fullscreen -T FULLSCREEN &
# then click the badge inside the window
```

Logs: `journalctl -f -o cat /usr/bin/gnome-shell` (look for `herdr-pip:`).
A test Shell runs apart from your real session, so it proves load, badge, menu and focus only.

## 3. Real session

Log out and in, then `gnome-extensions enable herdr-pip@hungify`. Keep herdr running in a terminal as usual.
Click the badge (top right) or press `Super+Shift+H`, pick an agent.

Settings: `gnome-extensions prefs herdr-pip@hungify`. From a shell:

```sh
gsettings --schemadir build/herdr-pip@hungify/schemas set org.gnome.shell.extensions.herdr-pip session work
gsettings --schemadir build/herdr-pip@hungify/schemas set org.gnome.shell.extensions.herdr-pip overlay-badge attention
```

Instead of the symlink you can install the zip: `pnpm run pack`, then
`gnome-extensions install --force dist/herdr-pip@hungify.shell-extension.zip`. Remove the symlinks in
`~/.local/share/gnome-shell/extensions/` first, then log out and back in.

## 4. Inspect the running badge

`scripts/fullscreen-probe.sh` (in a second terminal) logs once a second the badge state, the herdr window it would
raise and the focused window. It enables the test-only testkit extension while it runs, for its `DebugState`, and
disables it again on exit. While it is enabled, any process in your session can also take screenshots and inject
pointer clicks and drags through the testkit's D-Bus methods, so do not leave it running.

## Known gaps

- The herdr window is found through `/proc` process ancestry. A herdr client inside tmux, ssh or a terminal that
  hands its children to a separate server process (gnome-terminal-server) is not found; you then get a notification.
- With several windows of a single-instance terminal (ghostty, Ptyxis) the one titled "herdr" wins, else the
  most recently used window of that terminal.
- The badge stays where it was dragged to, on that monitor (saved by connector name); by default the top-right
  corner of the primary monitor. It is placed in the monitor's work area, so over a fullscreen window it sits one
  top-bar height below the screen edge. A fullscreen window on the other monitor is not covered by it.
- A fullscreen app can keep `Super+Shift+H` from reaching the Shell; `scripts/call.sh OpenMenu` is the fallback.
