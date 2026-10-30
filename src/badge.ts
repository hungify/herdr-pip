import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import type Meta from 'gi://Meta';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {WAITING, attentionText, urgentStatus} from './herdr.ts';
import type {Agent, Status, Summary} from './herdr.ts';
import {RING_GAP, RING_WIDTH, STATUS_RGB, badgeStyle, dotStyle} from './appearance.ts';
import type {Appearance} from './appearance.ts';
import {fillAgents} from './menu.ts';
import type {OnFocus} from './menu.ts';
import {RingQueue, ringArcs} from './ring.ts';
import type {RingEvent} from './ring.ts';
import {clampInto, monitorAt, positionToXY, toastXY, xyToPosition} from './placement.ts';
import type {Position, Rect} from './placement.ts';

interface Connectable {
    connect(signal: string, callback: () => unknown): number;
    disconnect(id: number): void;
}

export type OnMoved = (position: Position, monitor: string) => void;

function monitorManager(): Meta.MonitorManager {
    return global.backend.get_monitor_manager();
}

function connectorOf(index: number): string {
    const manager = monitorManager();
    return (
        manager
            .get_monitors()
            ?.map(m => m.get_connector())
            .find(c => manager.get_monitor_for_connector(c) === index) ?? ''
    );
}

export class OverlayBadge {
    private readonly _onFocus: OnFocus;
    private readonly _onMoved: OnMoved;
    private _appearance: Appearance;
    private _position: Position;
    private _monitor: string;
    private _wanted = false;
    private _urgent: Status | null = null;
    private readonly _ringQueue = new RingQueue();
    private _working = false;
    private _dragging: {x: number; y: number; monitor: number} | null = null;
    private _pressGrab: Clutter.Grab | null = null;
    private _toastId = 0;
    private _toastAgent: Agent | null = null;
    private _signals: [Connectable, number][] = [];

    private readonly _actor: St.Widget;
    private readonly _button: St.Button;
    private readonly _ring: St.DrawingArea;
    private readonly _ringTimeline: Clutter.Timeline;
    private readonly _dot: St.Widget;
    private readonly _pan: Clutter.PanGesture;
    private readonly _toast: St.Button;
    private readonly _toastLabel: St.Label;
    private readonly _menu: PopupMenu.PopupMenu;
    private readonly _section: PopupMenu.PopupMenuSection;
    private readonly _manager: PopupMenu.PopupMenuManager;

    constructor({
        onFocus,
        position,
        monitor,
        onMoved,
        appearance,
    }: {
        onFocus: OnFocus;
        position: Position;
        monitor: string;
        onMoved: OnMoved;
        appearance: Appearance;
    }) {
        this._onFocus = onFocus;
        this._onMoved = onMoved;
        this._position = position;
        this._monitor = monitor;
        this._appearance = appearance;

        this._actor = new St.Widget({visible: false});
        this._button = new St.Button({
            style_class: 'herdr-pip-overlay',
            label: 'H',
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: _('Herdr agents'),
        });
        this._dot = new St.Widget({style_class: 'herdr-pip-dot', reactive: false, visible: false});
        this._ring = new St.DrawingArea({reactive: false});
        this._ringTimeline = new Clutter.Timeline({actor: this._ring, duration: 1000, repeat_count: -1});
        this._actor.add_child(this._button);
        this._actor.add_child(this._ring);
        this._actor.add_child(this._dot);
        Main.layoutManager.addChrome(this._actor, {trackFullscreen: false});

        this._pan = new Clutter.PanGesture();
        this._button.add_action(this._pan);

        this._toast = new St.Button({style_class: 'herdr-pip-toast', reactive: true, visible: false});
        this._toastLabel = new St.Label({style_class: 'herdr-pip-toast-label'});
        this._toast.set_child(this._toastLabel);
        Main.layoutManager.addChrome(this._toast, {trackFullscreen: false});

        this._menu = new PopupMenu.PopupMenu(this._button, 0.5, St.Side.TOP);
        this._menu.actor.hide();
        Main.layoutManager.uiGroup.add_child(this._menu.actor);
        this._section = new PopupMenu.PopupMenuSection();
        this._menu.addMenuItem(this._section);
        this._manager = new PopupMenu.PopupMenuManager(this._button);
        this._manager.addMenu(this._menu);

        this._connect(this._pan, 'recognize', () => {
            this._dragBegin();
        });
        this._connect(this._pan, 'pan-update', () => {
            this._dragUpdate();
        });
        this._connect(this._pan, 'end', () => {
            this._dragEnd();
        });
        this._connect(this._pan, 'cancel', () => {
            this._dragEnd();
        });
        this._connect(this._button, 'clicked', () => {
            this.toggleMenu(false);
        });
        this._connect(this._button, 'button-press-event', () => {
            this._pressGrab ??= global.stage.grab(this._button);
            return Clutter.EVENT_PROPAGATE;
        });
        this._connect(this._button, 'button-release-event', () => {
            this._releasePressGrab();
            return Clutter.EVENT_PROPAGATE;
        });
        this._connect(this._toast, 'clicked', () => {
            this._toastClicked();
        });
        this._connect(this._menu, 'open-state-changed', () => {
            this._sync();
        });
        this._connect(Main.layoutManager, 'monitors-changed', () => {
            this._place();
        });
        this._connect(this._button, 'notify::width', () => {
            this._place();
        });
        this._connect(this._ring, 'repaint', () => {
            this._repaintRing();
        });
        this._connect(this._ringTimeline, 'new-frame', () => {
            this._ring.queue_repaint();
        });
        this._connect(this._dot, 'notify::width', () => {
            this._place();
        });
        this._connect(this._toast, 'notify::width', () => {
            this._placeToast();
        });
        this.setAppearance(appearance);
        this.update(WAITING, false);
    }

    private _connect(obj: Connectable, signal: string, callback: () => unknown): void {
        this._signals.push([obj, obj.connect(signal, callback)]);
    }

    destroy(): void {
        for (const [obj, id] of this._signals) {
            obj.disconnect(id);
        }
        this._signals = [];
        this._ringTimeline.stop();
        if (this._toastId) {
            GLib.source_remove(this._toastId);
        }
        this._toastId = 0;
        this._dragging = null;
        this._releasePressGrab();
        this._manager.removeMenu(this._menu);
        this._menu.destroy();
        this._toast.destroy();
        this._actor.destroy();
    }

    setAppearance(appearance: Appearance): void {
        this._appearance = appearance;
        this._button.style = badgeStyle(appearance);
        this._dot.style = dotStyle(appearance.size);
        this._syncDot();
        this._syncRing();
        this._place();
    }

    update(summary: Summary, wanted: boolean): void {
        this._wanted = wanted;
        this._button.opacity = summary.kind === 'agents' ? 255 : 160;
        this._urgent = urgentStatus(summary);
        this._working = summary.parts.some(p => p.status === 'working');
        this._syncDot();
        fillAgents(this._section, summary, this._onFocus);
        this._sync();
    }

    queueRing(events: readonly RingEvent[]): void {
        this._ringQueue.push(events);
        this._syncRing();
    }

    setPosition(position: Position, monitor: string): void {
        this._position = position;
        this._monitor = monitor;
        this._place();
    }

    toggleMenu(fromKeyboard: boolean): void {
        if (this._menu.isOpen) {
            this._menu.close(BoxPointer.PopupAnimation.FULL);
            return;
        }
        this._hideToast();
        this._actor.show();
        this._place();
        this._menu.open(BoxPointer.PopupAnimation.FULL);
        if (fromKeyboard) {
            this._menu.actor.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
        }
    }

    toast(agents: readonly Agent[], seconds: number): void {
        const [first] = agents;
        if (!first) {
            return;
        }
        this._toastAgent = first;
        const more = agents.length > 1 ? ` ${_('(+%d more)').replace('%d', String(agents.length - 1))}` : '';
        this._toastLabel.text = attentionText(first, _) + more;
        this._toast.style_class = `herdr-pip-toast herdr-pip-toast-${first.status}`;
        this._toast.opacity = 255;
        this._toast.show();
        this._placeToast();

        if (this._toastId) {
            GLib.source_remove(this._toastId);
        }
        this._toastId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._toastId = 0;
            this._toast.ease({
                opacity: 0,
                duration: 300,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._hideToast();
                },
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    private _toastClicked(): void {
        const agent = this._toastAgent;
        this._hideToast();
        if (agent) {
            this._onFocus(agent);
        }
    }

    private _hideToast(): void {
        if (this._toastId) {
            GLib.source_remove(this._toastId);
        }
        this._toastId = 0;
        this._toast.remove_all_transitions();
        this._toast.hide();
        this._toastAgent = null;
    }

    private _ringState() {
        if (!this._appearance.ring || !this._actor.visible) {
            return null;
        }
        return this._ringQueue.current(GLib.get_monotonic_time() / 1000, this._working);
    }

    private _syncRing(): void {
        const animate = this._ringState() !== null;
        if (animate && !this._ringTimeline.is_playing()) {
            this._ringTimeline.start();
        } else if (!animate && this._ringTimeline.is_playing()) {
            this._ringTimeline.stop();
        }
        this._ring.visible = this._appearance.ring;
        this._ring.queue_repaint();
    }

    private _repaintRing(): void {
        const cr = this._ring.get_context();
        const [width, height] = this._ring.get_surface_size();
        const cx = width / 2,
            cy = height / 2;
        const radius = Math.min(width, height) / 2 - RING_WIDTH / 2;
        cr.setLineCap(Cairo.LineCap.ROUND);

        cr.setLineWidth(RING_WIDTH + 2);
        cr.setSourceRGBA(0, 0, 0, 0.25);
        cr.arc(cx, cy, radius, 0, 2 * Math.PI);
        cr.stroke();
        cr.setLineWidth(RING_WIDTH);
        cr.setSourceRGBA(1, 1, 1, 0.3);
        cr.arc(cx, cy, radius, 0, 2 * Math.PI);
        cr.stroke();

        const state = this._ringState();
        if (state) {
            const [r, g, b] = STATUS_RGB[state.status];
            for (const arc of ringArcs(state, GLib.get_monotonic_time() / 1000)) {
                cr.setSourceRGBA(r / 255, g / 255, b / 255, arc.alpha);
                cr.arc(cx, cy, radius, arc.start, arc.end);
                cr.stroke();
            }
        } else if (this._ringTimeline.is_playing()) {
            this._ringTimeline.stop();
        }
        cr.$dispose();
    }

    private _syncDot(): void {
        const urgent = this._appearance.dot ? this._urgent : null;
        this._dot.visible = urgent !== null;
        this._dot.style_class = urgent ? `herdr-pip-dot herdr-pip-${urgent}` : 'herdr-pip-dot';
    }

    private _sync(): void {
        this._actor.visible = this._wanted || this._menu.isOpen;
        this._syncRing();
        this._place();
    }

    private _monitorIndex(): number {
        if (this._dragging) {
            return this._dragging.monitor;
        }
        const saved = this._monitor ? monitorManager().get_monitor_for_connector(this._monitor) : -1;
        return saved >= 0 ? saved : Main.layoutManager.primaryIndex;
    }

    private _workArea(monitor = this._monitorIndex()): Rect | null {
        return monitor < 0 ? null : Main.layoutManager.getWorkAreaForMonitor(monitor);
    }

    private _place(): void {
        if (!this._actor.visible || this._dragging) {
            return;
        }
        const area = this._workArea();
        if (!area) {
            return;
        }
        const size = this._button.width;
        this._dot.set_position(size - this._dot.width, 0);
        const outset = RING_GAP + RING_WIDTH;
        this._ring.set_position(-outset, -outset);
        this._ring.set_size(size + 2 * outset, size + 2 * outset);
        this._actor.set_position(...positionToXY(this._position, size, area));
        this._placeToast();
    }

    private _placeToast(): void {
        if (!this._toast.visible) {
            return;
        }
        const area = this._workArea();
        if (!area) {
            return;
        }
        this._toast.set_position(
            ...toastXY(this._actor.get_position(), this._button.width, this._toast.width, this._toast.height, area),
        );
    }

    private _dragBegin(): void {
        if (this._menu.isOpen) {
            this._menu.close(BoxPointer.PopupAnimation.NONE);
        }
        const [x, y] = this._actor.get_position();
        this._dragging = {x, y, monitor: this._monitorIndex()};
    }

    private _dragUpdate(): void {
        if (!this._dragging) {
            return;
        }
        const delta = this._pan.get_accumulated_delta_abs();
        const size = this._button.width;
        const x = this._dragging.x + delta.get_x();
        const y = this._dragging.y + delta.get_y();
        const under = monitorAt(x + size / 2, y + size / 2, Main.layoutManager.monitors);
        if (under >= 0) {
            this._dragging.monitor = under;
        }
        const area = this._workArea();
        if (!area) {
            return;
        }
        this._actor.set_position(...clampInto(x, y, size, size, area));
        this._placeToast();
    }

    private _releasePressGrab(): void {
        this._pressGrab?.dismiss();
        this._pressGrab = null;
    }

    private _dragEnd(): void {
        this._releasePressGrab();
        const dragging = this._dragging;
        if (!dragging) {
            return;
        }
        this._dragging = null;
        const area = this._workArea(dragging.monitor);
        if (!area) {
            return;
        }
        this._monitor = connectorOf(dragging.monitor);
        this._position = xyToPosition(this._actor.get_position(), this._button.width, area);
        this._place();
        this._onMoved(this._position, this._monitor);
    }
}
