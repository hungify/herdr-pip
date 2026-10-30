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
                : _('No agents');
        case 'offline':
            return _('Herdr is not running');
        case 'missing':
            return _('herdr not found');
        case 'waiting':
            return _('Waiting for the first poll');
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
