# gnome-extension (M0)

Minimal extension for the M0 hypothesis test. **Written but never run on a real GNOME Shell.**

- `extension.js` hotkey / D-Bus toggle, launches a terminal running `herdr`, finds its window,
  applies `make_above()` + `stick()`, hides it with `minimize()` and re-activates the previously focused window.
- `terminals.js` pure helpers (terminal detection, argv, window matching, geometry), unit-tested under node.
- `schemas/` GSettings: `toggle-hotkey`, `terminal`, `session`.
- `metadata.json` lists `shell-version` 49 and 50. This is **unverified** against the target machine:
  adjust it to the output of `gnome-shell --version`.

External trigger (for the case where a game inhibits compositor shortcuts):

```sh
scripts/toggle.sh            # Toggle | Show | Hide | DebugState
```

See `docs/m0-howto.md`.
