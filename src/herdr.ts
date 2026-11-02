const STATUSES = ['blocked', 'done', 'working', 'idle', 'unknown'] as const;
export type Status = (typeof STATUSES)[number];

export const ATTENTION: readonly Status[] = ['blocked', 'done'];

export interface Agent {
    agent: string;
    status: Status;
    statusLabel: string;
    title: string;
    paneId: string;
    focused: boolean;
    // Last directory of the agent's working directory, to tell agents of different projects apart.
    project: string;
    // When this extension saw the agent enter its status (ms since the epoch); null when it was already in it.
    since: number | null;
}

interface StatusCount {
    status: Status;
    count: number;
}

export interface Summary {
    kind: 'agents' | 'offline' | 'missing' | 'error' | 'waiting';
    agents: Agent[];
    parts: StatusCount[];
    attention: boolean;
    message: string;
}

interface PollResult {
    exitOk?: boolean;
    stdout?: string;
    stderr?: string;
    missing?: boolean;
}

interface HerdrError {
    code: string;
    message: string;
}

function isStatus(value: unknown): value is Status {
    return STATUSES.some(s => s === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function str(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
}

function firstText(values: readonly unknown[], fallback: string): string {
    for (const value of values) {
        if (typeof value === 'string' && value.trim() !== '') {
            return value;
        }
    }

    return fallback;
}

export function herdrCommand(herdrPath: string, session: string, ...args: string[]): string[] {
    return session ? [herdrPath, `--session=${session}`, ...args] : [herdrPath, ...args];
}

export function isPaneId(paneId: string): boolean {
    return /^[^-\s]\S*$/.test(paneId);
}

const NOT_CLIENT = new Set([
    'server',
    'agent',
    'pane',
    'workspace',
    'worktree',
    'tab',
    'api',
    'status',
    'notification',
    'integration',
    'config',
    'channel',
    'machine',
    'update',
    'completion',
    'completions',
    'terminal',
    'plugin',
    '--version',
    '-V',
    '--help',
    '-h',
    '--default-config',
    '--skill',
]);

const INTERPRETER = /^(?:env|sh|bash|dash|zsh|ksh|fish)$/;

function sessionName(session: string): string {
    return session === 'default' ? '' : session;
}

function basename(path: string | undefined): string {
    return path?.split('/').pop() ?? '';
}

export function isHerdrClient(argv: readonly string[], session = ''): boolean {
    const start = basename(argv[0]) === 'herdr' ? 0 : INTERPRETER.test(basename(argv[0])) ? 1 : -1;
    if (start < 0 || basename(argv[start]) !== 'herdr') {
        return false;
    }
    const args = argv.slice(start + 1);
    if (args.includes('--remote') || args.includes('--machine')) {
        return false;
    }

    let attached = '';
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--session') {
            attached = args[++i] ?? '';
        } else if (arg?.startsWith('--session=') === true) {
            attached = arg.slice('--session='.length);
        } else if (arg === 'session') {
            if (args[i + 1] !== 'attach') {
                return false;
            }
            attached = args[i + 2] ?? '';
            break;
        } else if (arg !== undefined && NOT_CLIENT.has(arg)) {
            return false;
        }
    }
    return sessionName(attached) === sessionName(session);
}

export function parsePpid(stat: string): number {
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const ppid = Number(fields[1]);
    return Number.isInteger(ppid) && ppid > 0 ? ppid : 0;
}

export async function windowOwner(
    pid: number,
    hasWindow: (pid: number) => boolean,
    parent: (pid: number) => Promise<number>,
): Promise<number> {
    const seen = new Set<number>();
    for (let p = pid; p > 1 && !seen.has(p); p = await parent(p)) {
        if (hasWindow(p)) {
            return p;
        }
        seen.add(p);
    }
    return 0;
}

export function parseError(text: string): HerdrError | null {
    const root = parseJson(text);
    const error = isRecord(root) ? root['error'] : null;
    return isRecord(error) && typeof error['code'] === 'string'
        ? {code: error['code'], message: str(error['message'], '')}
        : null;
}

export function parseAgentList(text: string): Agent[] | null {
    const root = parseJson(text);
    const result = isRecord(root) ? root['result'] : null;
    const agents = isRecord(result) ? result['agents'] : null;
    if (!Array.isArray(agents)) {
        return null;
    }
    return agents.map((a: unknown): Agent => {
        const r = isRecord(a) ? a : {};
        const status = isStatus(r['agent_status']) ? r['agent_status'] : 'unknown';
        const labels = isRecord(r['state_labels']) ? r['state_labels'] : {};
        return {
            agent: firstText([r['display_agent'], r['name'], r['agent']], '?'),
            status,
            statusLabel: firstText([labels[status]], ''),
            title: firstText([r['title'], r['terminal_title_stripped'], r['terminal_title']], ''),
            paneId: str(r['pane_id'], ''),
            focused: r['focused'] === true,
            project: basename(firstText([r['cwd'], r['foreground_cwd']], '').replace(/\/+$/, '')),
            since: null,
        };
    });
}

export function countByStatus(agents: readonly Agent[]): Record<Status, number> {
    const counts: Record<Status, number> = {blocked: 0, done: 0, working: 0, idle: 0, unknown: 0};
    for (const a of agents) {
        counts[a.status]++;
    }
    return counts;
}

export function summarize({exitOk = false, stdout = '', stderr = '', missing = false}: PollResult): Summary {
    if (missing) {
        return {kind: 'missing', agents: [], parts: [], attention: false, message: ''};
    }

    const agents = exitOk ? parseAgentList(stdout) : null;
    if (agents) {
        const counts = countByStatus(agents);
        const parts = STATUSES.filter(s => counts[s] > 0).map(s => ({status: s, count: counts[s]}));
        return {
            kind: 'agents',
            agents,
            parts,
            attention: ATTENTION.some(s => counts[s] > 0),
            message: '',
        };
    }

    const error = parseError(stderr) ?? parseError(stdout);
    if (error?.code === 'server_not_running') {
        return {kind: 'offline', agents: [], parts: [], attention: false, message: ''};
    }
    return {
        kind: 'error',
        agents: [],
        parts: [],
        attention: false,
        message: error ? `${error.code}: ${error.message}` : (stderr.trim() || 'unexpected output').slice(0, 200),
    };
}

export const WAITING: Summary = {kind: 'waiting', agents: [], parts: [], attention: false, message: ''};

export type Gettext = (text: string) => string;

const untranslated: Gettext = text => text;

export function statusName(status: Status, _: Gettext = untranslated): string {
    switch (status) {
        case 'blocked':
            return _('blocked');
        case 'done':
            return _('done');
        case 'working':
            return _('working');
        case 'idle':
            return _('idle');
        case 'unknown':
            return _('unknown');
    }
}

export function summaryText(summary: Summary, _: Gettext = untranslated): string {
    switch (summary.kind) {
        case 'agents':
            return summary.parts.length
                ? summary.parts.map(p => `${p.count} ${statusName(p.status, _)}`).join(' · ')
                : _('No agents running');
        case 'offline':
            return _('Herdr is not running');
        case 'missing':
            return _('herdr command not found');
        case 'waiting':
            return _('Checking Herdr…');
        case 'error':
            return summary.message;
    }
}

export function urgentStatus(summary: Summary): Status | null {
    return summary.parts.find(p => ATTENTION.includes(p.status))?.status ?? null;
}

export function newAttention(prev: readonly Agent[] | null, agents: readonly Agent[]): Agent[] {
    if (!prev) {
        return [];
    }
    const before = new Map(prev.map(a => [a.paneId, a.status]));
    return agents.filter(a => ATTENTION.includes(a.status) && before.get(a.paneId) !== a.status);
}

export function attentionText(agent: Pick<Agent, 'agent' | 'title' | 'status'>, _: Gettext = untranslated): string {
    const who = agent.title ? `${agent.agent} · ${agent.title}` : agent.agent;
    return (agent.status === 'blocked' ? _('%s needs you') : _('%s is done')).replace('%s', who);
}

export function badgeWanted(mode: string, summary: Summary): boolean {
    return mode === 'always' || (mode === 'attention' && summary.attention);
}

export function toastAgents(
    prev: readonly Agent[] | null,
    agents: readonly Agent[],
    enabled: {done: boolean; blocked: boolean},
): Agent[] {
    return newAttention(prev, agents).filter(a => (a.status === 'blocked' ? enabled.blocked : enabled.done));
}

export function pickHerdrWindow<T>(windows: readonly T[], title: (window: T) => string | null): T | null {
    return windows.find(w => /herdr/i.test(title(w) ?? '')) ?? windows[0] ?? null;
}

export function parseSocketPath(statusOutput: string): string | null {
    const path = /^socket:[ \t]*(\S.*)$/m.exec(statusOutput)?.[1]?.trim();
    return path !== undefined && path !== '' ? path : null;
}

const PANE_EVENTS = ['pane.created', 'pane.closed', 'pane.exited', 'pane.agent_detected'];

// One events.subscribe per connection: herdr closes the socket on a second request, so a new pane set means a
// new connection. Status changes can only be subscribed per pane.
export function subscribeRequest(paneIds: readonly string[]): string {
    const subscriptions = [
        ...PANE_EVENTS.map(type => ({type})),
        ...paneIds.toSorted().map(paneId => ({type: 'pane.agent_status_changed', pane_id: paneId})),
    ];
    return `${JSON.stringify({id: 'herdr-pip', method: 'events.subscribe', params: {subscriptions}})}\n`;
}

export type StreamLine = {kind: 'started'} | {kind: 'event'} | {kind: 'error'; message: string} | {kind: 'other'};

export function parseStreamLine(line: string): StreamLine {
    const value = parseJson(line);
    if (!isRecord(value)) {
        return {kind: 'other'};
    }
    if (typeof value['event'] === 'string') {
        return {kind: 'event'};
    }
    const result = value['result'];
    if (isRecord(result) && result['type'] === 'subscription_started') {
        return {kind: 'started'};
    }
    const error = parseError(line);
    return error ? {kind: 'error', message: `${error.code}: ${error.message}`} : {kind: 'other'};
}

// The sound for agents that just turned blocked or done: blocked wins, done only in "attention" mode.
export function alertSound(fresh: readonly Agent[], mode: string): 'blocked' | 'done' | null {
    if (mode === 'never') {
        return null;
    }
    if (fresh.some(a => a.status === 'blocked')) {
        return 'blocked';
    }
    return mode === 'attention' && fresh.some(a => a.status === 'done') ? 'done' : null;
}

// Carries over when each agent entered its status. herdr reports no times, so a change is stamped when it is
// first seen; agents already in their status at the first poll stay null. A new pane counts as a change.
export function stampSince(prev: readonly Agent[] | null, agents: readonly Agent[], now: number): Agent[] {
    if (!prev) {
        return agents.map(a => ({...a, since: null}));
    }
    const before = new Map(prev.map(a => [a.paneId, a]));
    return agents.map(a => {
        const old = before.get(a.paneId);
        return {...a, since: old?.status === a.status ? old.since : now};
    });
}

// Menu order: blocked, done, working, idle, unknown; within a status the longest waiting first (unknown times
// count as oldest), then herdr's order.
export function menuOrder(agents: readonly Agent[]): Agent[] {
    const rank = (a: Agent): number => STATUSES.indexOf(a.status);
    const since = (a: Agent): number => a.since ?? 0;
    return agents.toSorted((a, b) => rank(a) - rank(b) || since(a) - since(b));
}

// Projects are only worth showing when the agents span more than one.
export function showProjects(agents: readonly Agent[]): boolean {
    return new Set(agents.map(a => a.project).filter(p => p !== '')).size > 1;
}

export function durationText(ms: number): string {
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) {
        return '<1m';
    }
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}
