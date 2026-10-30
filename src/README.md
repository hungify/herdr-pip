# src

GNOME Shell 49/50 extension in TypeScript, compiled by `scripts/build.sh` into `build/herdr-pip@hungify/`.
Tested on GNOME Shell 50.6.

Pure modules (no `gi://` imports, unit-tested under node):

- `herdr.ts` Herdr output parsing (`agent list`, errors) into a `Summary`, the herdr command line,
  herdr client detection from `/proc/PID/cmdline`, `/proc/PID/stat` parsing, toast text.
- `appearance.ts` the badge look: color parsing, label, inline style, ring size and colors, the appearance
  settings keys.
- `ring.ts` the progress ring: status changes queued and shown one at a time, and the arcs to draw at a given
  time (spin, fill, pulse).
- `placement.ts` badge and toast geometry: saved fractions to pixels and back, keeping boxes on screen.

Shell modules:

- `extension.ts` wiring only: settings, hotkey and the D-Bus entry points (`OpenMenu`, `Focus`)
  to the parts below. Picking an agent runs `herdr agent focus <pane>` and raises the herdr window.
- `herdrCli.ts` every herdr process: finds the binary (PATH, then `~/.local/bin`), polls `agent list`,
  fires `agent focus`.
- `herdrWindow.ts` the terminal window hosting the herdr client for the configured session: each client process
  walked up to the process that owns a window; a window titled "herdr" wins, then the most recently used.
- `badge.ts` the floating "H" circle with its progress ring (animated with a `Clutter.Timeline` only while
  something is shown) and attention dot, agent menu, toast, and dragging (it stays on the
  monitor it is dropped on, by default the primary one).
- `indicator.ts` the optional top bar icon (`icons/herdr-pip-symbolic.svg`, recolored by the theme) with the
  attention dot and the same agent menu plus Settings.
- `menu.ts` the agent menu shared by the badge and the indicator.
- `prefs.ts` the settings window (separate process).

Settings are documented in `schemas/org.gnome.shell.extensions.herdr-pip.gschema.xml`.

User-facing strings go through gettext (`_()` from the Shell's `extension.js` / `prefs.js`; pure modules take
the translate function as a parameter, `N_()` marks strings translated later). `pnpm pot` writes
`po/herdr-pip.pot`; add `po/<lang>.po` files and `pnpm run pack` compiles them into the zip.

There is no debug code in the extension: `DebugState` lives in the test-only `test/headless-testkit`, which
reads the running extension's state.

Colors: red blocked, green done (finished, not yet seen), blue working, grey idle/unknown. The dot on the
circle shows red if any agent is blocked, else green if any is done, else nothing.

External trigger (for when a fullscreen app keeps the shortcut from reaching the Shell):

```sh
scripts/call.sh                  # OpenMenu (default) | Focus <pane_id>
```

See "Install" in the top-level README.
