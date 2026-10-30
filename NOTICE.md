# Notice and attribution

**herdr-pip is not affiliated with, endorsed by, or sponsored by Herdr.**

- **Herdr** (<https://herdr.dev>, <https://github.com/herdrdev/herdr>) is
  invoked only as an external CLI process. No Herdr source is embedded, linked
  or copied. Its repository declares Apache-2.0 (checked via the GitHub API on
  2026-10-29); the original project brief said AGPL-3.0, which does not match.
  Either way, the "separate process only" rule stays.
- **finna/herdr-hud** (MIT, <https://github.com/finna/herdr-hud>) is the
  inspiration for the floating "H" badge with an attention count. No code or
  architecture is reused (herdr-hud is a native macOS/Windows app with its own
  agent panel; this is a GNOME Shell extension that hands off to Herdr itself).
- **PiP on top** (<https://github.com/Rafostar/gnome-shell-extension-pip-on-top>,
  GPL-2.0) was the reference for the first version's window matching and
  `make_above()`. That code was removed on 2026-10-30; no code was ever copied.
- Captured Herdr CLI output in `test/fixtures/` is sanitized (paths, titles and
  ids replaced); field names and structure are real.
