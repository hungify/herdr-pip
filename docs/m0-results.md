# M0 results

**Status: NOT RUN.** The M0 code exists (see `docs/m0-howto.md`) but has not been run on any GNOME Shell. This file is the empty test matrix; do not fill a cell without a run.

## Environment (fill in)

- `gnome-shell --version`:
- `herdr --version`:
- Terminal + version:
- GPU / driver, monitors, VRR:
- Date:

## Matrix

For each scenario: **A** shows above the game? **B** can type into the panel? **C** focus returns to the game after hide?
**D** any input leaks into the game while hidden? **E** hotkey still works while the game has focus (shortcut inhibit)?

| Scenario | A | B | C | D | E | Notes |
|---|---|---|---|---|---|---|
| Windowed game | | | | | | |
| Borderless game | | | | | | |
| Wayland-native fullscreen | | | | | | |
| Proton / Xwayland fullscreen | | | | | | |
| Game with pointer lock (FPS) | | | | | | |

## Extra checks

- [ ] Panel stays above after switching workspace (`stick`)
- [ ] Panel does not trap focus (old Mutter Wayland bug, ~GNOME 42)
- [ ] Window matching works for: foot / ghostty / kitty / Ptyxis (note which)
- [ ] Does Herdr overwrite the terminal title?

## Recommendation

(continue / change approach, after results)
