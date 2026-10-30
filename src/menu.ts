import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {statusName, summaryText} from './herdr.ts';
import type {Agent, Summary} from './herdr.ts';

export type OnFocus = (agent: Agent) => void;

export function fillAgents(section: PopupMenu.PopupMenuSection, summary: Summary, onFocus: OnFocus): void {
    section.removeAll();
    section.addMenuItem(new PopupMenu.PopupMenuItem(summaryText(summary, _), {reactive: false}));
    for (const agent of summary.agents) {
        const item = new PopupMenu.PopupMenuItem(`${agent.agent}  ${agent.title}`);
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
