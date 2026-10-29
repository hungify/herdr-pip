# Running M0 on Fedora

M0 code is written but **has never run on a real GNOME Shell**. Everything below is the procedure to
run it and fill `docs/m0-results.md`. Expect to fix API details.

## 0. Prerequisites

```sh
gnome-shell --version      # record it; edit gnome-extension/metadata.json "shell-version" to match
herdr --version
scripts/check.sh           # offline checks (needs node and glib-compile-schemas)
```

If your GNOME version is not 49 or 50, update `shell-version` first, otherwise the Shell will not load the extension.
On a development release, list at most one.

## 1. Install

```sh
scripts/dev-install.sh
```

A newly linked extension is only seen by a Shell started afterwards.

## 2. Try it in a nested shell first

```sh
scripts/run-devkit.sh      # GNOME 49+: --devkit (needs mutter-devkit). Older: --nested
# in a terminal inside the nested session:
gnome-extensions enable herdr-pip@hungify
```

Logs: `journalctl -f -o cat /usr/bin/gnome-shell` (look for `herdr-pip:`).
The nested session cannot show a real fullscreen game over the real compositor, so it only proves load,
launch, matching and focus return.

## 3. Real session

Log out and in, then `gnome-extensions enable herdr-pip@hungify`. Press `Super+Shift+H` (or `scripts/toggle.sh`).

Settings (no prefs UI yet, M1):

```sh
gsettings --schemadir gnome-extension/schemas set org.gnome.shell.extensions.herdr-pip terminal foot
gsettings --schemadir gnome-extension/schemas set org.gnome.shell.extensions.herdr-pip session work
```

## 4. Fill the matrix

In a second terminal run `scripts/fullscreen-probe.sh` to log `above`, `minimized`, `hasFocus`, `onAllWorkspaces`
and the focused window's `fullscreen` flag. For each row of `docs/m0-results.md` run the game and check:

- **A above the game**: press the hotkey; do you see the panel, and does the probe say `above: true`?
- **B can type**: type into Herdr.
- **C focus returns**: press the hotkey again; does the game receive keys, and does the probe's `focus` show the game?
- **D no leak**: while hidden, do keys or the mouse reach the game as normal and nothing else?
- **E hotkey works under inhibit**: with the game focused, does `Super+Shift+H` fire? If not, try `scripts/toggle.sh`
  from another device/session, and note whether `Super+Esc` restores the shortcut.

## Known gaps in the M0 code (things most likely to need a fix)

- Window placement is applied once, right after the new window is adopted; Mutter may ignore it on an unmapped window.
- If `_show()` is called before the window maps, `activate()` may be refused by focus-stealing prevention.
- Matching relies on the app id. Ptyxis has no app id option, so it matches by title, and Herdr may overwrite the title.
- Terminal flags (`foot --app-id`, `kitty --class`, `ghostty --class=`, `ptyxis -x`, `gnome-terminal --`) are from docs/source, not run.
- `disable()` leaves the terminal running; it only removes above/sticky.
- No prefs UI, no badge, no polling: those are M1.
