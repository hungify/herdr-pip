# Results

**Status:** tested in a headless GNOME Shell 50.6 (below) and installed in the real session, where the badge
shows.

## Badge design, headless run (2026-10-30)

- GNOME Shell 50.6 (mutter 50.6, Fedora 44), `--headless --wayland --no-x11`, one 1920x1080 virtual monitor
- herdr 0.9.5 (real one for status; `test/fake-herdr.sh` for the agent list and to record `agent focus`)
- How: `scripts/run-headless.sh`. The fullscreen window is `ptyxis -s --fullscreen -T FULLSCREEN`. The herdr client runs in another `ptyxis -s` window. Clicks are real pointer events from a
  virtual device (`scripts/testkit.sh Click`), not D-Bus shortcuts.

| Check | Result |
|---|---|
| Badge ("H" circle, red dot for blocked) visible over the fullscreen window | Yes (screenshot) |
| Click on the fullscreen window, away from the badge | Reaches the window; no menu, it keeps focus |
| Click on the badge | Agent menu (counts + agents) opens over the fullscreen window; it keeps focus until something is picked |
| Click an agent in the menu | `herdr agent focus wA:p1` (the right pane) and the herdr window gets focus over the fullscreen window |
| Herdr window found from the client process | Yes: herdr client > ptyxis-agent > ptyxis (owns the window) |
| `Focus` / `OpenMenu` over D-Bus | Same results |
| Drag the badge over the fullscreen window | Moves, the fullscreen window keeps focus, no menu opens; position saved and restored after disable/enable |
| Click the badge at its new place | Menu opens |
| Agent goes working > done, then working > blocked | Toast "codex · Write tests is done", then "claude · Fix login bug needs you" (red border) next to the badge, over the fullscreen window |
| Click the toast | `herdr agent focus w1:p1` and the herdr window gets focus |
| Change badge text / size / color / opacity / dot while running | Applied immediately (screenshots: "H" 40px > "AI" 64px blue > "her" without dot) |
| `toast-blocked` off, `toast-seconds` 2 | No toast for blocked, toast for done, gone after 2 s |
| Settings window | Opens; all groups (Badge, Look, Toast, Herdr) render |
| disable / enable | No errors |
| Real herdr with no server running | Status `offline`, the "H" is dimmed, no dot |

Bugs found and fixed by these runs:

- Activating the window straight from the menu item was refused (the fullscreen window kept focus). It now activates after
  the menu has closed, with a fresh timestamp from `get_current_time_roundtrip()`.
- Dragging did nothing over the fullscreen window (it worked over the bare desktop): once the pointer left the
  circle, its motion went to the window below and the pan gesture never saw it. The badge now takes a stage
  grab on press and drops it on release.
- Test harness only: the first event of a fresh virtual pointer is dropped, so the testkit primes it.

## Superseded: terminal panel design (headless, 2026-10-30)

The first version launched its own terminal running `herdr` and kept it above other windows with `make_above()` /
`stick()`. Headless it worked with ghostty (matched by app id) and Ptyxis (matched by spawned PID): the panel
showed above a fullscreen window, took focus, and hiding returned focus to the fullscreen window. It was dropped because the
badge plus a jump to the user's own herdr window is what is wanted. Only the original, untested M0 version is in git
history (commit deb35b5); the headless-hardened one was never committed.
