import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {badgeWanted, isPaneId, toastAgents} from './herdr.ts';
import {ringEvents} from './ring.ts';
import type {Summary} from './herdr.ts';
import {APPEARANCE_KEYS} from './appearance.ts';
import type {Appearance} from './appearance.ts';
import {OverlayBadge} from './badge.ts';
import {HerdrCli} from './herdrCli.ts';
import {findHerdrWindow} from './herdrWindow.ts';
import {StatusIndicator} from './indicator.ts';
import type {OnFocus} from './menu.ts';
import type {Position} from './placement.ts';

const KEY_HOTKEY = 'menu-hotkey';
const DBUS_PATH = '/io/github/hungify/HerdrPip';
const DBUS_XML = `
<node>
  <interface name="io.github.hungify.HerdrPip">
    <method name="OpenMenu"/>
    <method name="Focus"><arg type="s" direction="in" name="pane_id"/></method>
  </interface>
</node>`;

class HerdrPip {
    private readonly _ext: Extension;
    private readonly _settings: Gio.Settings;
    private readonly _settingsIds: number[];
    private readonly _dbus: Gio.DBusExportedObject;
    private readonly _herdr: HerdrCli;
    private readonly _badge: OverlayBadge;
    private readonly _cancellable = new Gio.Cancellable();
    private _indicator: StatusIndicator | null = null;
    private _summary: Summary | null = null;

    constructor(ext: Extension) {
        this._ext = ext;
        this._settings = ext.getSettings();

        this._badge = new OverlayBadge({
            onFocus: this._onFocus,
            position: this._badgePosition(),
            monitor: this._settings.get_string('badge-monitor'),
            onMoved: ([x, y], monitor) => {
                this._settings.set_value('badge-position', new GLib.Variant('(dd)', [x, y]));
                this._settings.set_string('badge-monitor', monitor);
            },
            appearance: this._appearance(),
        });

        Main.wm.addKeybinding(
            KEY_HOTKEY,
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => {
                this._badge.toggleMenu(true);
            },
        );

        this._dbus = Gio.DBusExportedObject.wrapJSObject(DBUS_XML, this);
        this._dbus.export(Gio.DBus.session, DBUS_PATH);

        this._herdr = new HerdrCli(
            () => this._settings.get_string('session'),
            summary => {
                this._onSummary(summary);
            },
        );
        this._syncIndicator();

        this._settingsIds = [
            this._settings.connect('changed::poll-interval', () => {
                this._herdr.start(this._pollInterval());
            }),
            this._settings.connect('changed::session', () => {
                this._summary = null;
                this._badge.clearRing();
                this._herdr.restart();
            }),
            this._settings.connect('changed::show-indicator', () => {
                this._syncIndicator();
            }),
            this._settings.connect('changed::overlay-badge', () => {
                this._syncStatus();
            }),
            ...['badge-position', 'badge-monitor'].map(key =>
                this._settings.connect(`changed::${key}`, () => {
                    this._badge.setPosition(this._badgePosition(), this._settings.get_string('badge-monitor'));
                }),
            ),
            ...APPEARANCE_KEYS.map(key =>
                this._settings.connect(`changed::${key}`, () => {
                    this._badge.setAppearance(this._appearance());
                }),
            ),
        ];
        this._herdr.start(this._pollInterval());
    }

    destroy(): void {
        Main.wm.removeKeybinding(KEY_HOTKEY);
        for (const id of this._settingsIds) {
            this._settings.disconnect(id);
        }
        this._herdr.destroy();
        this._badge.destroy();
        this._indicator?.destroy();
        this._indicator = null;
        this._cancellable.cancel();
        this._dbus.unexport();
    }

    OpenMenu(): void {
        this._badge.toggleMenu(true);
    }

    Focus(paneId: string): void {
        if (!isPaneId(paneId)) {
            throw new Error(`not a pane id: ${paneId}`);
        }
        this._focusAgent(paneId);
    }

    private _onSummary(summary: Summary): void {
        const changed = JSON.stringify(summary) !== JSON.stringify(this._summary);
        const prev = this._summary?.kind === 'agents' ? this._summary.agents : null;
        this._summary = summary;
        if (summary.kind === 'agents') {
            this._badge.queueRing(ringEvents(prev, summary.agents));
        }
        if (summary.kind === 'agents' && this._settings.get_boolean('toast')) {
            const enabled = {
                done: this._settings.get_boolean('toast-done'),
                blocked: this._settings.get_boolean('toast-blocked'),
            };
            this._badge.toast(toastAgents(prev, summary.agents, enabled), this._settings.get_uint('toast-seconds'));
        }
        if (changed) {
            this._syncStatus();
        }
    }

    private readonly _onFocus: OnFocus = agent => {
        this._focusAgent(agent.paneId);
    };

    private _focusAgent(paneId: string): void {
        if (!this._herdr.focus(paneId)) {
            Main.notify('Herdr PiP', _('herdr was not found in PATH or ~/.local/bin'));
            return;
        }
        findHerdrWindow(this._settings.get_string('session'), this._cancellable)
            .then(win => {
                if (this._cancellable.is_cancelled()) {
                    return;
                }
                if (!win) {
                    Main.notify(
                        'Herdr PiP',
                        _('Herdr is not open in a terminal window. Run herdr in a terminal first.'),
                    );
                    return;
                }
                Main.activateWindow(win, global.display.get_current_time_roundtrip());
            })
            .catch((e: unknown) => {
                console.error(`herdr-pip: finding the herdr window failed: ${String(e)}`);
            });
    }

    private _appearance(): Appearance {
        return {
            size: this._settings.get_uint('badge-size'),
            color: this._settings.get_string('badge-color'),
            opacity: this._settings.get_uint('badge-opacity'),
            dot: this._settings.get_boolean('badge-dot'),
            ring: this._settings.get_boolean('badge-ring'),
        };
    }

    private _badgePosition(): Position {
        const [x, y] = this._settings.get_value('badge-position').deepUnpack<[number, number]>();
        return [x, y];
    }

    private _pollInterval(): number {
        return this._settings.get_uint('poll-interval');
    }

    private _syncIndicator(): void {
        const wanted = this._settings.get_boolean('show-indicator');
        if (wanted && !this._indicator) {
            this._indicator = new StatusIndicator({
                icon: new Gio.FileIcon({
                    file: this._ext.dir.resolve_relative_path('icons/herdr-pip-symbolic.svg'),
                }),
                onFocus: this._onFocus,
                onPreferences: () => {
                    this._ext.openPreferences();
                },
            });
            Main.panel.addToStatusArea(this._ext.uuid, this._indicator.button);
        } else if (!wanted && this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._syncStatus();
    }

    private _syncStatus(): void {
        const summary = this._summary;
        if (!summary) {
            return;
        }
        this._indicator?.update(summary);
        this._badge.update(summary, badgeWanted(this._settings.get_string('overlay-badge'), summary));
    }
}

export default class HerdrPipExtension extends Extension {
    private _pip: HerdrPip | null = null;

    override enable(): void {
        this._pip = new HerdrPip(this);
    }

    override disable(): void {
        this._pip?.destroy();
        this._pip = null;
    }
}
