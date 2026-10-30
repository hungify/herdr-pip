# Notice and attribution

**herdr-pip is not affiliated with, endorsed by, or sponsored by Herdr.**

- **Herdr** (<https://herdr.dev>, <https://github.com/herdrdev/herdr>) is
  invoked only as an external CLI process. No Herdr source is embedded, linked
  or copied. Its repository declares Apache-2.0 (checked via the GitHub API on
  2026-10-29); the original project brief said AGPL-3.0, which does not match.
  Either way, the "separate process only" rule stays.
- **finna/herdr-hud** (MIT, <https://github.com/finna/herdr-hud>) is the
  inspiration for "small badge + hotkey-toggled panel". No code or
  architecture is reused.
- **PiP on top** (<https://github.com/Rafostar/gnome-shell-extension-pip-on-top>,
  GPL-2.0) is the reference for the window-matching idea (match on
  `window.title`, re-check on `notify::title`, pick up new windows via
  workspace `window-added`, then `make_above()` / `stick()`). **No code is
  copied.** If any code is ever copied, the affected files must be relicensed
  GPL-2.0-or-later and credited here.
- Captured Herdr CLI output in `test/fixtures/` is sanitized (paths, titles and
  ids replaced); field names and structure are real.
