import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PIP_UUID = 'herdr-pip@hungify';

interface PipInternals {
    _settings: Gio.Settings;
    _summary: {kind: string; parts: unknown; message: string} | null;
    _indicator: unknown;
    _badge: {
        _actor: {visible: boolean; get_position(): [number, number]};
        _button: {width: number; has_style_class_name(name: string): boolean};
        _menu: {isOpen: boolean};
        _toast: {visible: boolean};
        _toastLabel: {text: string};
    };
}

interface HerdrWindowModule {
    findHerdrWindow: (session: string, cancellable: Gio.Cancellable) => Promise<Meta.Window | null>;
}

function describe(win: Meta.Window | null) {
    return (
        win && {
            title: win.get_title(),
            wmClass: win.get_wm_class(),
            pid: win.get_pid(),
            fullscreen: win.fullscreen,
            hasFocus: win.has_focus(),
        }
    );
}

const DBUS_PATH = '/io/github/hungify/HerdrPipTestkit';
const DBUS_XML = `
<node>
  <interface name="io.github.hungify.HerdrPipTestkit">
    <method name="Screenshot"><arg type="s" direction="in" name="path"/></method>
    <method name="DebugState"><arg type="s" direction="out" name="json"/></method>
    <method name="Drag">
      <arg type="d" direction="in" name="x1"/><arg type="d" direction="in" name="y1"/>
      <arg type="d" direction="in" name="x2"/><arg type="d" direction="in" name="y2"/>
    </method>
    <method name="Click">
      <arg type="d" direction="in" name="x"/><arg type="d" direction="in" name="y"/>
    </method>
  </interface>
</node>`;

const now = () => GLib.get_monotonic_time();

class Testkit {
    private readonly _dbus: Gio.DBusExportedObject;
    private readonly _pointer: Clutter.VirtualInputDevice;
    private _startupId = 0;
    private _timerId = 0;
    private _pending: Gio.DBusMethodInvocation | null = null;
    private _primed = false;

    constructor() {
        this._dbus = Gio.DBusExportedObject.wrapJSObject(DBUS_XML, this);
        this._dbus.export(Gio.DBus.session, DBUS_PATH);
        this._pointer = Clutter.get_default_backend()
            .get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        if (Main.layoutManager._startingUp) {
            this._startupId = Main.layoutManager.connect('startup-complete', () => {
                Main.overview.hide();
            });
        } else {
            Main.overview.hide();
        }
    }

    destroy(): void {
        this._finish('testkit disabled');
        if (this._startupId) {
            Main.layoutManager.disconnect(this._startupId);
        }
        this._dbus.unexport();
    }

    private _moveTo(x: number, y: number): void {
        if (!this._primed) {
            this._primed = true;
            this._pointer.notify_absolute_motion(now(), x + 1, y + 1);
        }
        this._pointer.notify_absolute_motion(now(), x, y);
    }

    private _button(state: Clutter.ButtonState): void {
        this._pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, state);
    }

    private _sequence(ms: number, step: (i: number) => boolean, invocation: Gio.DBusMethodInvocation): void {
        this._finish('interrupted by a newer pointer call');
        this._pending = invocation;
        let i = 0;
        let done = false;
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            if (done) {
                this._timerId = 0;
                this._finish(null);
                return GLib.SOURCE_REMOVE;
            }
            done = !step(i++);
            return GLib.SOURCE_CONTINUE;
        });
    }

    private _finish(error: string | null): void {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
        const invocation = this._pending;
        this._pending = null;
        if (!invocation) {
            return;
        }
        if (error !== null) {
            invocation.return_error_literal(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED, error);
        } else {
            invocation.return_value(null);
        }
    }

    ClickAsync([x, y]: [number, number], invocation: Gio.DBusMethodInvocation): void {
        this._moveTo(x, y);
        this._sequence(
            150,
            () => {
                this._button(Clutter.ButtonState.PRESSED);
                this._button(Clutter.ButtonState.RELEASED);
                return false;
            },
            invocation,
        );
    }

    DragAsync([x1, y1, x2, y2]: [number, number, number, number], invocation: Gio.DBusMethodInvocation): void {
        const steps = 10;
        this._moveTo(x1, y1);
        this._sequence(
            60,
            i => {
                if (i === 0) {
                    this._button(Clutter.ButtonState.PRESSED);
                } else if (i <= steps) {
                    const f = i / steps;
                    this._pointer.notify_absolute_motion(now(), x1 + (x2 - x1) * f, y1 + (y2 - y1) * f);
                } else {
                    this._button(Clutter.ButtonState.RELEASED);
                    return false;
                }
                return true;
            },
            invocation,
        );
    }

    DebugStateAsync(_params: [], invocation: Gio.DBusMethodInvocation): void {
        this._debugState()
            .then(json => {
                invocation.return_value(new GLib.Variant('(s)', [json]));
            })
            .catch((e: unknown) => {
                invocation.return_error_literal(Gio.io_error_quark(), Gio.IOErrorEnum.FAILED, String(e));
            });
    }

    private async _debugState(): Promise<string> {
        const ext = Main.extensionManager.lookup(PIP_UUID);
        const pip = (ext.stateObj as unknown as {_pip: PipInternals | null} | undefined)?._pip;
        if (!pip) {
            throw new Error(`${PIP_UUID} is not enabled`);
        }
        const {findHerdrWindow} = (await import(ext.dir.get_child('herdrWindow.js').get_uri())) as HerdrWindowModule;
        const herdrWindow = await findHerdrWindow(pip._settings.get_string('session'), new Gio.Cancellable());
        const badge = pip._badge;
        return JSON.stringify({
            shell: Config.PACKAGE_VERSION,
            status: pip._summary && {
                kind: pip._summary.kind,
                parts: pip._summary.parts,
                message: pip._summary.message,
            },
            indicator: pip._indicator !== null,
            badgeVisible: badge._actor.visible,
            badgeInactive: badge._button.has_style_class_name('herdr-pip-inactive'),
            badgeRect: [...badge._actor.get_position(), badge._button.width],
            menuOpen: badge._menu.isOpen,
            toast: badge._toast.visible ? badge._toastLabel.text : null,
            badgePosition: pip._settings.get_value('badge-position').deepUnpack(),
            focus: describe(global.display.focus_window),
            herdrWindow: describe(herdrWindow),
        });
    }

    ScreenshotAsync([path]: [string], invocation: Gio.DBusMethodInvocation): void {
        const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
        const shooter = new Shell.Screenshot();
        shooter.screenshot(false, stream, (_source, res) => {
            try {
                shooter.screenshot_finish(res);
                stream.close(null);
                invocation.return_value(null);
            } catch (e) {
                invocation.return_error_literal(Gio.io_error_quark(), Gio.IOErrorEnum.FAILED, String(e));
            }
        });
    }
}

export default class TestkitExtension extends Extension {
    private _kit: Testkit | null = null;

    override enable(): void {
        this._kit = new Testkit();
    }

    override disable(): void {
        this._kit?.destroy();
        this._kit = null;
    }
}
