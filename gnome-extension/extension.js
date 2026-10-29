// M0 hypothesis test: toggle a terminal running `herdr` that stays above
// other windows. UNTESTED on a real GNOME Shell, see docs/m0-results.md.
//
// The window-matching idea (match the title, re-check on notify::title, then
// make_above()/stick()) comes from PiP on top by Rafostar (GPL-2.0,
// https://github.com/Rafostar/gnome-shell-extension-pip-on-top). No code is copied.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

import {
    buildCommand, detectTerminal, herdrArgv, matchesPanel, panelGeometry,
} from './terminals.js';

const KEY_HOTKEY = 'toggle-hotkey';
const LAUNCH_WINDOW_SECONDS = 15;
const DBUS_PATH = '/io/github/hungify/HerdrPip';
const DBUS_XML = `
<node>
  <interface name="io.github.hungify.HerdrPip">
    <method name="Toggle"/>
    <method name="Show"/>
    <method name="Hide"/>
    <method name="DebugState"><arg type="s" direction="out" name="json"/></method>
  </interface>
</node>`;

export default class HerdrPipExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._panel = null;
        this._panelSignals = [];
        this._previous = null;
        this._previousSignal = 0;
        this._needsPlacement = false;
        this._launching = false;
        this._launchTimeoutId = 0;
        this._idleIds = new Set();
        this._watchers = new Map();
        this._procs = new Set();
        this._terminal = null;

        Main.wm.addKeybinding(KEY_HOTKEY, this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL, () => this.toggle());

        this._createdId = global.display.connect('window-created',
            (_display, win) => this._consider(win, true));
        for (const actor of global.get_window_actors())
            this._consider(actor.meta_window, false);

        // External trigger, for when a game inhibits compositor shortcuts:
        // gdbus call --session --dest org.gnome.Shell --object-path /io/github/hungify/HerdrPip \
        //   --method io.github.hungify.HerdrPip.Toggle
        this._dbus = Gio.DBusExportedObject.wrapJSObject(DBUS_XML, this);
        this._dbus.export(Gio.DBus.session, DBUS_PATH);
    }

    disable() {
        Main.wm.removeKeybinding(KEY_HOTKEY);

        if (this._createdId) {
            global.display.disconnect(this._createdId);
            this._createdId = 0;
        }
        this._unwatchAll();
        if (this._launchTimeoutId) {
            GLib.source_remove(this._launchTimeoutId);
            this._launchTimeoutId = 0;
        }
        for (const id of this._idleIds)
            GLib.source_remove(id);
        this._idleIds.clear();

        this._setPrevious(null);
        if (this._panel) {
            const win = this._panel;
            this._releasePanel();
            if (win.above)
                win.unmake_above();
            if (win.on_all_workspaces)
                win.unstick();
        }

        this._dbus?.unexport();
        this._dbus = null;
        this._procs.clear();
        this._watchers = null;
        this._idleIds = null;
        this._procs = null;
        this._settings = null;
    }

    // D-Bus and hotkey entry points

    Toggle() {
        this.toggle();
    }

    Show() {
        if (this._panel)
            this._show();
        else
            this._launch();
    }

    Hide() {
        if (this._panel && !this._panel.minimized)
            this._hide();
    }

    DebugState() {
        const describe = win => win && {
            title: win.get_title(),
            wmClass: win.get_wm_class(),
            appId: win.gtk_application_id,
            fullscreen: win.fullscreen,
            minimized: win.minimized,
            above: win.above,
            onAllWorkspaces: win.on_all_workspaces,
            hasFocus: win.has_focus(),
            monitor: win.get_monitor(),
            frame: (r => ({x: r.x, y: r.y, width: r.width, height: r.height}))(win.get_frame_rect()),
        };
        return JSON.stringify({
            shell: Config.PACKAGE_VERSION,
            terminal: this._terminal,
            launching: this._launching,
            panel: describe(this._panel),
            focus: describe(global.display.focus_window),
            previous: describe(this._previous),
        });
    }

    toggle() {
        const win = this._panel;
        if (!win)
            this._launch();
        else if (!win.minimized && win.has_focus())
            this._hide();
        else
            this._show();
    }

    // Window discovery

    _consider(win, created) {
        if (this._panel || win.get_window_type() !== Meta.WindowType.NORMAL)
            return;

        if (this._matches(win)) {
            this._adopt(win, this._launching);
            return;
        }

        // Identity (app id / title) can arrive after creation. Only watch
        // while we are waiting for a window we launched ourselves.
        if (created && this._launching && !this._watchers.has(win)) {
            const ids = ['notify::title', 'notify::wm-class', 'notify::gtk-application-id']
                .map(sig => win.connect(sig, () => this._consider(win, false)));
            ids.push(win.connect('unmanaged', () => this._unwatch(win)));
            this._watchers.set(win, ids);
        }
    }

    _matches(win) {
        return matchesPanel({
            wmClass: win.get_wm_class() ?? '',
            appId: win.gtk_application_id ?? '',
            title: win.get_title() ?? '',
        });
    }

    _unwatch(win) {
        const ids = this._watchers?.get(win);
        if (!ids)
            return;
        for (const id of ids)
            win.disconnect(id);
        this._watchers.delete(win);
    }

    _unwatchAll() {
        if (!this._watchers)
            return;
        for (const win of [...this._watchers.keys()])
            this._unwatch(win);
    }

    _adopt(win, show) {
        this._unwatchAll();
        this._endLaunch();
        this._panel = win;
        this._needsPlacement = show;
        this._panelSignals = [win.connect('unmanaged', () => this._releasePanel())];

        win.make_above();
        win.stick();

        if (show) {
            const id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._idleIds?.delete(id);
                if (this._panel === win)
                    this._show();
                return GLib.SOURCE_REMOVE;
            });
            this._idleIds.add(id);
        }
    }

    _releasePanel() {
        const win = this._panel;
        if (!win)
            return;
        for (const id of this._panelSignals)
            win.disconnect(id);
        this._panelSignals = [];
        this._panel = null;
    }

    // Show / hide

    _show() {
        const win = this._panel;
        if (!win)
            return;

        const focus = global.display.focus_window;
        if (focus && focus !== win)
            this._setPrevious(focus);

        if (win.minimized)
            win.unminimize();

        if (this._needsPlacement) {
            this._needsPlacement = false;
            const monitor = this._previous?.get_monitor() ?? global.display.get_current_monitor();
            const area = Main.layoutManager.getWorkAreaForMonitor(monitor);
            const g = panelGeometry({x: area.x, y: area.y, width: area.width, height: area.height});
            win.move_resize_frame(true, g.x, g.y, g.width, g.height);
        }

        win.make_above();
        win.stick();
        win.activate(global.get_current_time());
    }

    _hide() {
        const win = this._panel;
        if (!win)
            return;
        win.minimize();
        // Give focus back explicitly instead of relying on Mutter's choice.
        if (this._previous)
            this._previous.activate(global.get_current_time());
    }

    _setPrevious(win) {
        if (this._previous === win)
            return;
        if (this._previous && this._previousSignal)
            this._previous.disconnect(this._previousSignal);
        this._previous = win;
        this._previousSignal = win
            ? win.connect('unmanaged', () => {
                this._previous = null;
                this._previousSignal = 0;
            })
            : 0;
    }

    // Launching

    _findHerdr() {
        return GLib.find_program_in_path('herdr') ??
            [GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', 'herdr'])]
                .find(p => GLib.file_test(p, GLib.FileTest.IS_EXECUTABLE)) ?? null;
    }

    _launch() {
        if (this._launching)
            return;

        const herdr = this._findHerdr();
        if (!herdr) {
            Main.notify('Herdr PiP', 'herdr was not found in PATH or ~/.local/bin');
            return;
        }
        const terminal = detectTerminal(
            name => GLib.find_program_in_path(name) !== null,
            this._settings.get_string('terminal'));
        if (!terminal) {
            Main.notify('Herdr PiP', 'No supported terminal found');
            return;
        }
        const argv = buildCommand(terminal, herdrArgv(herdr, this._settings.get_string('session')));

        try {
            const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            this._procs.add(proc);
            proc.wait_async(null, () => this._procs?.delete(proc));
        } catch (e) {
            console.error(`herdr-pip: failed to launch ${argv[0]}: ${e.message}`);
            Main.notify('Herdr PiP', `Failed to launch ${terminal}`);
            return;
        }

        this._terminal = terminal;
        this._launching = true;
        this._launchTimeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, LAUNCH_WINDOW_SECONDS, () => {
                this._launchTimeoutId = 0;
                this._launching = false;
                this._unwatchAll();
                console.error(`herdr-pip: no window matched after launching ${terminal}`);
                return GLib.SOURCE_REMOVE;
            });
    }

    _endLaunch() {
        this._launching = false;
        if (this._launchTimeoutId) {
            GLib.source_remove(this._launchTimeoutId);
            this._launchTimeoutId = 0;
        }
    }
}
