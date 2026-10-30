import type {Agent, Status} from './herdr.ts';

type RingStatus = 'working' | 'done' | 'blocked';

export type RingKind = 'spin' | 'fill' | 'pulse';

export interface RingState {
    kind: RingKind;
    status: RingStatus;
    since: number;
}

export interface RingArc {
    start: number;
    end: number;
    alpha: number;
}

const KIND: Record<RingStatus, RingKind> = {working: 'spin', done: 'fill', blocked: 'pulse'};

export const SHOW_MS = 3000;
const SPIN_MS = 1200;
const SPIN_LENGTH = 0.28 * 2 * Math.PI;
const FILL_MS = 600;
const PULSE_MS = 1000;
const TOP = -Math.PI / 2;

function isRingStatus(status: Status): status is RingStatus {
    return status === 'working' || status === 'done' || status === 'blocked';
}

export interface RingEvent {
    paneId: string;
    status: RingStatus;
}

export function ringEvents(prev: readonly Agent[] | null, agents: readonly Agent[]): RingEvent[] {
    if (!prev) {
        return [];
    }
    const before = new Map(prev.map(a => [a.paneId, a.status]));
    const events: RingEvent[] = [];
    for (const {paneId, status} of agents) {
        if (isRingStatus(status) && before.get(paneId) !== status) {
            events.push({paneId, status});
        }
    }

    return events;
}

export class RingQueue {
    private _items: (RingEvent & {since: number | null})[] = [];

    push(events: readonly RingEvent[]): void {
        for (const event of events) {
            this._items = this._items.filter(i => i.since !== null || i.paneId !== event.paneId);
            this._items.push({...event, since: null});
        }
    }

    clear(): void {
        this._items = [];
    }

    current(now: number, working: boolean): RingState | null {
        let head = this._items[0];
        while (head && head.since !== null && now - head.since >= SHOW_MS) {
            this._items.shift();
            head = this._items[0];
        }
        if (head) {
            head.since ??= now;
            return {kind: KIND[head.status], status: head.status, since: head.since};
        }
        return working ? {kind: 'spin', status: 'working', since: 0} : null;
    }
}

export function ringArcs(state: RingState, now: number): RingArc[] {
    switch (state.kind) {
        case 'spin': {
            const start = TOP + 2 * Math.PI * ((now % SPIN_MS) / SPIN_MS);
            return [{start, end: start + SPIN_LENGTH, alpha: 1}];
        }
        case 'fill': {
            const t = Math.min(1, Math.max(0, (now - state.since) / FILL_MS));
            const eased = 1 - (1 - t) ** 3;
            return eased > 0 ? [{start: TOP, end: TOP + 2 * Math.PI * eased, alpha: 1}] : [];
        }
        case 'pulse': {
            const phase = (2 * Math.PI * ((now - state.since) % PULSE_MS)) / PULSE_MS;
            return [{start: TOP, end: TOP + 2 * Math.PI, alpha: 0.6 + 0.4 * Math.cos(phase)}];
        }
    }
}
