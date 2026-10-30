# herdr-pip

An always-on-top overlay for [Herdr](https://herdr.dev) on **Fedora GNOME (Wayland)**: glance at agent status
while gaming, and pop open the **real Herdr terminal UI** with a hotkey.

> **Not affiliated with Herdr.** Herdr is only invoked as an external CLI process. See [NOTICE.md](NOTICE.md).
> Inspired by [finna/herdr-hud](https://github.com/finna/herdr-hud) (idea only, no code reused).

## Status

Skeleton only: license, layout and recorded Herdr CLI output in [`test/fixtures`](test/fixtures)
(herdr 0.9.5 on macOS). Nothing is implemented yet.

## Design (decided)

1. The panel is a terminal running `herdr` (or `--session <name>` / `--remote <host>`). No custom chat UI.
2. Only integration surface: Herdr's public CLI, as a separate process.
3. Phase 1: GNOME Shell extension in GJS (ESM, GNOME 45+), kept thin.
4. Always-on-top is done inside the compositor: the extension finds the terminal window and calls
   `Meta.Window.make_above()` / `stick()`.

## Layout

```
gnome-extension/   GJS extension (empty until M0)
scripts/           toggle / install / probe helpers (empty until M0)
test/fixtures/     captured Herdr CLI output (sanitized)
```

## Roadmap

M0 hypothesis test, M1 usable on GNOME, then M2 packaging (RPM/COPR, extensions.gnome.org), M3 Windows (Tauri),
M4 macOS, M5 other Linux compositors via layer-shell. Only M0 and M1 are in scope now.

## License

MIT, see [LICENSE](LICENSE).
