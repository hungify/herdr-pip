import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {durationText, menuOrder, showProjects, statusName, summaryText} from './herdr.ts';
import type {Agent, Summary} from './herdr.ts';

export type OnFocus = (agent: Agent) => void;

interface AgeLabel {
    label: St.Label;
    since: number;
}

function sideLabel(text: string, styleClass: string, expand = false): St.Label {
    return new St.Label({
        text,
        style_class: styleClass,
        x_expand: expand,
        x_align: expand ? Clutter.ActorAlign.END : Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.CENTER,
    });
}

function fillAgents(section: PopupMenu.PopupMenuSection, summary: Summary, onFocus: OnFocus): AgeLabel[] {
    section.removeAll();
    section.addMenuItem(new PopupMenu.PopupMenuItem(summaryText(summary, _), {reactive: false}));
    const projects = showProjects(summary.agents);
    const ages: AgeLabel[] = [];
    for (const agent of menuOrder(summary.agents)) {
        const item = new PopupMenu.PopupMenuItem(agent.title ? `${agent.agent} · ${agent.title}` : agent.agent);
        if (projects && agent.project) {
            item.insert_child_below(sideLabel(agent.project, 'herdr-pip-project'), item.label);
        }
        if (agent.since !== null) {
            const label = sideLabel('', 'herdr-pip-age', true);
            item.add_child(label);
            ages.push({label, since: agent.since});
        }
        const pill = sideLabel(
            agent.statusLabel || statusName(agent.status, _),
            `herdr-pip-pill herdr-pip-${agent.status}`,
            agent.since === null,
        );
        item.add_child(pill);
        item.connect('activate', () => {
            onFocus(agent);
        });
        section.addMenuItem(item);
    }
    return ages;
}

export class AgentSection {
    readonly section = new PopupMenu.PopupMenuSection();
    private readonly _onFocus: OnFocus;
    private _open = false;
    private _pending: Summary | null = null;
    private _ages: AgeLabel[] = [];

    constructor(onFocus: OnFocus) {
        this._onFocus = onFocus;
    }

    update(summary: Summary): void {
        if (this._open) {
            this._pending = summary;
            return;
        }
        this._ages = fillAgents(this.section, summary, this._onFocus);
        this._syncAges();
    }

    setOpen(open: boolean): void {
        this._open = open;
        if (open) {
            this._syncAges();
        } else if (this._pending) {
            const summary = this._pending;
            this._pending = null;
            this.update(summary);
        }
    }

    // The menu is not rebuilt while its agents keep their status, so the times are refreshed on every open.
    private _syncAges(): void {
        const now = Date.now();
        for (const {label, since} of this._ages) {
            label.text = durationText(Math.max(0, now - since));
        }
    }
}
