# herdr-pip

An always-on-top overlay for [Herdr](https://herdr.dev) on **Fedora GNOME (Wayland)**: glance at agent status
while gaming, and pop open the **real Herdr terminal UI** with a hotkey.

> **Not affiliated with Herdr.** Herdr is only invoked as an external CLI process. See [NOTICE.md](NOTICE.md).
> Inspired by [finna/herdr-hud](https://github.com/finna/herdr-hud) (idea only, no code reused).

## Status: M0 code written, **never run on GNOME**

| Item | State |
|---|---|
| Herdr CLI JSON shapes | **Verified** on herdr 0.9.5 / macOS, sanitized in [`test/fixtures`](test/fixtures) |
| Mutter stacks `above` windows over fullscreen | **Read in source (46-50), not tested** |
| Hotkey works while a game inhibits shortcuts | **Unknown**, new risk found in research |
| M0 (toggle + always-on-top terminal) | **Code written, untested**. Pure helpers pass node unit tests; the Shell part is only syntax-checked. Follow [docs/m0-howto.md](docs/m0-howto.md) |
| M1 (badge, prefs, polling) | **Blocked** until M0 is reviewed |

Read [docs/research.md](docs/research.md) for findings and corrections to the original brief, and
[docs/m0-results.md](docs/m0-results.md) for the (empty) test matrix.

## Design (decided)

1. The panel is a terminal running `herdr` (or `--session <name>` / `--remote <host>`). No custom chat UI.
2. Only integration surface: Herdr's public CLI, as a separate process.
3. Phase 1: GNOME Shell extension in GJS (ESM, GNOME 45+), kept thin.
4. Always-on-top is done inside the compositor: the extension finds the terminal window and calls
   `Meta.Window.make_above()` / `stick()`.

## Layout

```
gnome-extension/   GJS extension (M0, untested) and pure helpers
scripts/           install / devkit / toggle / probe / offline check
test/              node unit tests and captured Herdr CLI fixtures (sanitized)
docs/              research, M0 how-to, M0 results (empty matrix)
```

## Roadmap

M0 hypothesis test, M1 usable on GNOME, then M2 packaging (RPM/COPR, extensions.gnome.org), M3 Windows (Tauri),
M4 macOS, M5 other Linux compositors via layer-shell. Only M0 and M1 are in scope now.

## License

MIT, see [LICENSE](LICENSE).
