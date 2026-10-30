import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {WAITING, urgentStatus} from './herdr.ts';
import type {Summary} from './herdr.ts';
import {AgentSection} from './menu.ts';
import type {OnFocus} from './menu.ts';

export class StatusIndicator {
    readonly button: PanelMenu.Button;
    private readonly _icon: St.Icon;
    private readonly _dot: St.Widget;
    private readonly _agents: AgentSection;

    constructor({icon, onFocus, onPreferences}: {icon: Gio.Icon; onFocus: OnFocus; onPreferences: () => void}) {
        this.button = new PanelMenu.Button(0.5, 'Herdr PiP');

        const box = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._icon = new St.Icon({gicon: icon, style_class: 'system-status-icon'});
        this._dot = new St.Widget({
            style_class: 'herdr-pip-indicator-dot',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
            visible: false,
        });
        box.add_child(this._icon);
        box.add_child(this._dot);
        this.button.add_child(box);

        const menu = this.button.menu as PopupMenu.PopupMenu;
        this._agents = new AgentSection(onFocus);
        menu.addMenuItem(this._agents.section);
        menu.connect('open-state-changed', (_menu, open: boolean) => {
            this._agents.setOpen(open);
        });
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        menu.addAction(_('Settings'), onPreferences);

        this.update(WAITING);
    }

    update(summary: Summary): void {
        const urgent = urgentStatus(summary);
        this._dot.visible = urgent !== null;
        this._dot.style_class = urgent ? `herdr-pip-indicator-dot herdr-pip-${urgent}` : 'herdr-pip-indicator-dot';
        this._icon.opacity = summary.kind === 'agents' ? 255 : 128;
        this._agents.update(summary);
    }

    destroy(): void {
        this.button.destroy();
    }
}
