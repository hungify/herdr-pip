import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {statusName, summaryText} from './herdr.ts';
import type {Agent, Summary} from './herdr.ts';

export type OnFocus = (agent: Agent) => void;

function fillAgents(section: PopupMenu.PopupMenuSection, summary: Summary, onFocus: OnFocus): void {
    section.removeAll();
    section.addMenuItem(new PopupMenu.PopupMenuItem(summaryText(summary, _), {reactive: false}));
    for (const agent of summary.agents) {
        const item = new PopupMenu.PopupMenuItem(agent.title ? `${agent.agent} · ${agent.title}` : agent.agent);
        item.add_child(
            new St.Label({
                text: agent.statusLabel || statusName(agent.status, _),
                style_class: `herdr-pip-pill herdr-pip-${agent.status}`,
                x_expand: true,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
            }),
        );
        item.connect('activate', () => {
            onFocus(agent);
        });
        section.addMenuItem(item);
    }
}

export class AgentSection {
    readonly section = new PopupMenu.PopupMenuSection();
    private readonly _onFocus: OnFocus;
    private _open = false;
    private _pending: Summary | null = null;

    constructor(onFocus: OnFocus) {
        this._onFocus = onFocus;
    }

    update(summary: Summary): void {
        if (this._open) {
            this._pending = summary;
            return;
        }
        fillAgents(this.section, summary, this._onFocus);
    }

    setOpen(open: boolean): void {
        this._open = open;
        if (!open && this._pending) {
            const summary = this._pending;
            this._pending = null;
            this.update(summary);
        }
    }
}
