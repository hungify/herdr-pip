import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
    herdrBase,
    isHerdrClient,
    parsePpid,
    newAttention,
    attentionText,
    parseAgentList,
    parseError,
    countByStatus,
    summarize,
    summaryText,
    urgentStatus,
    WAITING,
    badgeWanted,
    toastAgents,
    parseSocketPath,
    subscribeRequest,
    parseStreamLine,
    alertSound,
    pickHerdrWindow,
    isPaneId,
    windowOwner,
    stampSince,
    menuOrder,
    showProjects,
    durationText,
} from '../src/herdr.ts';
import type {Agent, Status} from '../src/herdr.ts';

const fixture = (name: string): string => readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');

test('parseAgentList reads the captured list', () => {
    const agents = parseAgentList(fixture('agent-list.json'));
    assert.ok(agents);
    assert.equal(agents.length, 3);
    assert.deepEqual(agents[1], {
        agent: 'codex',
        status: 'working',
        statusLabel: '',
        title: 'Example task 2',
        paneId: 'wA:p1',
        focused: true,
        project: 'example',
        since: null,
    });
    assert.deepEqual(countByStatus(agents), {blocked: 0, done: 1, working: 2, idle: 0, unknown: 0});
});

test('parseAgentList rejects other output and maps odd statuses to unknown', () => {
    assert.equal(parseAgentList('not json'), null);
    assert.equal(parseAgentList(fixture('agent-get.json')), null);
    assert.equal(parseAgentList(fixture('error-server-not-running.json')), null);
    const [a] = parseAgentList('{"result":{"agents":[{"agent_status":"dancing"}]}}') ?? [];
    assert.ok(a);
    assert.equal(a.status, 'unknown');
    assert.equal(a.agent, '?');
});

test("parseAgentList prefers Herdr's display overrides (metadata, rename alias)", () => {
    const agents = parseAgentList(fixture('agent-list.synthetic-metadata.json'));
    assert.ok(agents);
    assert.deepEqual(
        agents.map(a => [a.agent, a.title, a.status, a.statusLabel]),
        [
            ['Claude: auth', 'Refactor auth middleware', 'done', 'review ready'],
            ['fixer', '', 'blocked', ''],
            ['?', 'zsh', 'unknown', ''],
        ],
    );
});

test('parseError', () => {
    assert.equal(parseError(fixture('error-agent-not-found.json'))?.code, 'agent_not_found');
    assert.equal(parseError('boom'), null);
    assert.equal(parseError(fixture('agent-list.json')), null);
});

test('summarize: agents, attention and order', () => {
    const s = summarize({exitOk: true, stdout: fixture('agent-list.synthetic-blocked.json')});
    assert.equal(s.kind, 'agents');
    assert.ok(s.attention);
    assert.deepEqual(s.parts, [
        {status: 'blocked', count: 1},
        {status: 'done', count: 1},
        {status: 'working', count: 1},
    ]);
    assert.equal(summaryText(s), '1 blocked · 1 done · 1 working');
});

test('urgentStatus: blocked before done, nothing without attention', () => {
    assert.equal(
        urgentStatus(summarize({exitOk: true, stdout: fixture('agent-list.synthetic-blocked.json')})),
        'blocked',
    );
    assert.equal(
        urgentStatus(summarize({exitOk: true, stdout: '{"result":{"agents":[{"agent_status":"done"}]}}'})),
        'done',
    );
    assert.equal(
        urgentStatus(summarize({exitOk: true, stdout: '{"result":{"agents":[{"agent_status":"working"}]}}'})),
        null,
    );
});

test('summarize: only working is not attention', () => {
    const s = summarize({exitOk: true, stdout: '{"result":{"agents":[{"agent_status":"working"}]}}'});
    assert.ok(!s.attention);
    assert.equal(summaryText(s), '1 working');
});

test('summarize: empty list', () => {
    const s = summarize({exitOk: true, stdout: '{"result":{"agents":[]}}'});
    assert.equal(s.kind, 'agents');
    assert.equal(summaryText(s), 'No agents running');
});

test('summarize: errors', () => {
    assert.equal(summarize({exitOk: false, stderr: fixture('error-server-not-running.json')}).kind, 'offline');
    assert.equal(
        summaryText(summarize({exitOk: false, stderr: fixture('error-server-not-running.json')})),
        'Herdr is not running',
    );
    assert.equal(summarize({missing: true}).kind, 'missing');
    const e = summarize({exitOk: false, stderr: fixture('error-agent-not-found.json')});
    assert.equal(e.kind, 'error');
    assert.match(e.message, /^agent_not_found: /);
    assert.equal(summarize({exitOk: false, stderr: 'segfault\n'}).message, 'segfault');
    assert.ok(!e.attention);
});

test('herdrBase puts the session right after the binary', () => {
    assert.deepEqual(herdrBase('/bin/herdr', ''), ['/bin/herdr']);
    assert.deepEqual(herdrBase('/bin/herdr', 'work'), ['/bin/herdr', '--session=work']);
});

test('isHerdrClient: default session', () => {
    assert.ok(isHerdrClient(['herdr']));
    assert.ok(isHerdrClient(['/home/u/.local/bin/herdr']));
    assert.ok(isHerdrClient(['herdr', 'session', 'attach', 'default']));
    assert.ok(isHerdrClient(['/bin/bash', '/tmp/home/.local/bin/herdr']), 'script run via an interpreter');
    assert.ok(!isHerdrClient(['herdr', 'server']));
    assert.ok(!isHerdrClient(['herdr', 'agent', 'list']));
    assert.ok(!isHerdrClient(['herdr', '--session', 'work', 'agent', 'list']));
    assert.ok(!isHerdrClient(['herdr', 'session', 'list']));
    assert.ok(!isHerdrClient(['herdr', '--session', 'work']));
    assert.ok(!isHerdrClient(['herdr', '--remote', 'box']));
    assert.ok(!isHerdrClient(['zsh']));
    assert.ok(!isHerdrClient(['herdr-hud']));
    assert.ok(!isHerdrClient(['herdr', 'terminal', 'title', 'set', 'x']));
    assert.ok(!isHerdrClient(['herdr', 'plugin', 'list']));
    assert.ok(!isHerdrClient(['herdr', '--version']));
    assert.ok(!isHerdrClient(['herdr', '--default-config']));
});

test('isHerdrClient: named session', () => {
    assert.ok(isHerdrClient(['herdr', '--session', 'work'], 'work'));
    assert.ok(isHerdrClient(['herdr', 'session', 'attach', 'work'], 'work'));
    assert.ok(!isHerdrClient(['herdr'], 'work'));
    assert.ok(isHerdrClient(['herdr'], 'default'));
    assert.ok(isHerdrClient(['herdr', '--session=work'], 'work'));
    assert.ok(!isHerdrClient(['herdr', '--session=work', 'agent', 'list'], 'work'));
});

test('isHerdrClient: herdr must be the program, not an argument', () => {
    assert.ok(isHerdrClient(['/usr/bin/env', 'herdr']));
    assert.ok(!isHerdrClient(['vim', 'herdr']));
    assert.ok(!isHerdrClient(['less', '/home/u/.local/bin/herdr']));
    assert.ok(!isHerdrClient(['bash', '-c', 'herdr']));
});

test('isPaneId rejects empty values and anything that reads as a flag', () => {
    assert.ok(isPaneId('wA:p1'));
    assert.ok(!isPaneId(''));
    assert.ok(!isPaneId('--help'));
    assert.ok(!isPaneId('w1 p1'));
});

const ppidLoop = (pid: number) => Promise.resolve(pid === 7 ? 8 : 7);

test('windowOwner stops at the nearest ancestor that owns a window', async () => {
    // herdr 30 > shell 20 > terminal 10 (window) > editor 5 (window) > systemd 1
    const ppid = new Map([
        [30, 20],
        [20, 10],
        [10, 5],
        [5, 1],
    ]);
    const parent = (pid: number) => Promise.resolve(ppid.get(pid) ?? 0);
    const windows = new Set([10, 5]);
    assert.equal(await windowOwner(30, p => windows.has(p), parent), 10);
    assert.equal(await windowOwner(30, () => false, parent), 0);
    assert.equal(await windowOwner(7, () => false, ppidLoop), 0, 'a ppid loop ends');
});

test('parsePpid', () => {
    assert.equal(parsePpid('6039 (herdr) S 5223 6039 5223 34816'), 5223);
    assert.equal(parsePpid('42 (weird) name)) R 7 42 7'), 7);
    assert.equal(parsePpid('garbage'), 0);
});

const agent = (paneId: string, status: Status): Agent => ({
    agent: 'claude',
    title: 'T',
    paneId,
    status,
    statusLabel: status,
    focused: false,
    project: '',
    since: null,
});

test('newAttention: only transitions into blocked or done', () => {
    assert.deepEqual(newAttention(null, [agent('p1', 'done')]), [], 'first poll stays quiet');
    assert.deepEqual(newAttention([agent('p1', 'working')], [agent('p1', 'done')]), [agent('p1', 'done')]);
    assert.deepEqual(newAttention([agent('p1', 'done')], [agent('p1', 'done')]), [], 'no repeat');
    assert.deepEqual(newAttention([agent('p1', 'done')], [agent('p1', 'blocked')]), [agent('p1', 'blocked')]);
    assert.deepEqual(newAttention([agent('p1', 'blocked')], [agent('p1', 'working')]), []);
    assert.deepEqual(newAttention([], [agent('p2', 'blocked')]), [agent('p2', 'blocked')], 'new agent already blocked');
    assert.deepEqual(newAttention([agent('p1', 'done')], [agent('p1', 'idle')]), [], 'seen: done -> idle');
});

test('attentionText', () => {
    assert.equal(attentionText({agent: 'claude', title: 'Fix bug', status: 'blocked'}), 'claude · Fix bug needs you');
    assert.equal(attentionText({agent: 'codex', title: '', status: 'done'}), 'codex is done');
    const german: Record<string, string> = {'%s is done': '%s ist fertig', 'done': 'fertig'};
    const _ = (text: string): string => german[text] ?? text;
    assert.equal(attentionText({agent: 'codex', title: '', status: 'done'}, _), 'codex ist fertig');
    assert.equal(
        summaryText(summarize({exitOk: true, stdout: '{"result":{"agents":[{"agent_status":"done"}]}}'}), _),
        '1 fertig',
    );
});

test('isHerdrClient: remote, machine and one-shot flags are not clients', () => {
    assert.ok(!isHerdrClient(['herdr', '--machine', 'box', 'agent', 'list']));
    for (const flag of ['-V', '-h', '--help', '--skill']) {
        assert.ok(!isHerdrClient(['herdr', flag]), flag);
    }
    assert.ok(isHerdrClient(['herdr', '--session']), 'a missing session name means the default one');
});

test('summarize: error fallbacks', () => {
    const fromStdout = summarize({exitOk: false, stdout: fixture('error-server-not-running.json')});
    assert.equal(fromStdout.kind, 'offline', 'an error printed on stdout is read too');
    assert.equal(summarize({exitOk: false}).message, 'unexpected output');
    assert.equal(summarize({exitOk: false, stderr: 'x'.repeat(300)}).message.length, 200);
    assert.equal(summarize({exitOk: true, stdout: 'not json'}).kind, 'error');
});

test('summaryText for every kind and the quiet statuses', () => {
    assert.equal(summaryText(summarize({missing: true})), 'herdr command not found');
    assert.equal(summaryText(WAITING), 'Checking Herdr…');
    const quiet = '{"result":{"agents":[{"agent_status":"idle"},{"agent_status":"bogus"}]}}';
    assert.equal(summaryText(summarize({exitOk: true, stdout: quiet})), '1 idle · 1 unknown');
});

test('badgeWanted follows the overlay-badge mode', () => {
    const attention = summarize({exitOk: true, stdout: fixture('agent-list.synthetic-blocked.json')});
    const calm = summarize({exitOk: true, stdout: '{"result":{"agents":[{"agent_status":"working"}]}}'});
    assert.ok(badgeWanted('always', calm));
    assert.ok(badgeWanted('attention', attention));
    assert.ok(!badgeWanted('attention', calm));
    assert.ok(!badgeWanted('never', attention));
});

test('toastAgents respects the done and blocked switches', () => {
    const prev = [agent('p1', 'working'), agent('p2', 'working')];
    const now = [agent('p1', 'done'), agent('p2', 'blocked')];
    assert.deepEqual(toastAgents(prev, now, {done: true, blocked: true}), now);
    assert.deepEqual(toastAgents(prev, now, {done: false, blocked: true}), [agent('p2', 'blocked')]);
    assert.deepEqual(toastAgents(prev, now, {done: true, blocked: false}), [agent('p1', 'done')]);
    assert.deepEqual(toastAgents(null, now, {done: true, blocked: true}), [], 'first poll stays quiet');
});

const windowTitle = (w: {title: string | null}) => w.title;

test('pickHerdrWindow prefers a window titled herdr, else the first, untitled ones included', () => {
    const zsh = {title: 'zsh'};
    const herdr = {title: 'Herdr — work'};
    const untitled = {title: null};
    assert.equal(pickHerdrWindow([zsh, herdr], windowTitle), herdr);
    assert.equal(pickHerdrWindow([untitled, zsh], windowTitle), untitled);
    assert.equal(pickHerdrWindow([], windowTitle), null);
});

test('alertSound: blocked wins, done only in attention mode', () => {
    const blocked = agent('p1', 'blocked');
    const done = agent('p2', 'done');
    assert.equal(alertSound([done, blocked], 'blocked'), 'blocked');
    assert.equal(alertSound([done], 'blocked'), null);
    assert.equal(alertSound([done], 'attention'), 'done');
    assert.equal(alertSound([done, blocked], 'attention'), 'blocked');
    assert.equal(alertSound([blocked], 'never'), null);
    assert.equal(alertSound([], 'attention'), null);
});

const list = (fields: string): string => `{"result":{"agents":[{${fields}}]}}`;
const stamped = (a: Agent, since: number | null): Agent => ({...a, since});
const at = (paneId: string, status: Status, since: number | null): Agent => stamped(agent(paneId, status), since);
const in_ = (project: string): Agent => ({...agent('p', 'idle'), project});

test('parseAgentList: project is the last directory of cwd', () => {
    assert.equal(parseAgentList(list('"cwd":"/home/u/code/api/"'))?.[0]?.project, 'api');
    assert.equal(parseAgentList(list('"foreground_cwd":"/srv/web"'))?.[0]?.project, 'web');
    assert.equal(parseAgentList(list('"agent":"claude"'))?.[0]?.project, '');
});

test('stampSince: keeps the time while the status holds, stamps changes and new panes', () => {
    assert.deepEqual(stampSince(null, [agent('p1', 'done')], 50), [stamped(agent('p1', 'done'), null)], 'first poll');
    const prev = [stamped(agent('p1', 'done'), 10), stamped(agent('p2', 'working'), null)];
    assert.deepEqual(stampSince(prev, [agent('p1', 'done'), agent('p2', 'blocked'), agent('p3', 'idle')], 50), [
        stamped(agent('p1', 'done'), 10),
        stamped(agent('p2', 'blocked'), 50),
        stamped(agent('p3', 'idle'), 50),
    ]);
});

test('menuOrder: by status, then longest waiting, then herdr order', () => {
    const order = menuOrder([
        at('w', 'working', 1),
        at('d', 'done', 5),
        at('b2', 'blocked', 30),
        at('i', 'idle', null),
        at('b1', 'blocked', 20),
        at('b0', 'blocked', null),
        at('b3', 'blocked', 30),
    ]);
    assert.deepEqual(
        order.map(a => a.paneId),
        ['b0', 'b1', 'b2', 'b3', 'd', 'w', 'i'],
    );
});

test('showProjects: only when agents span several projects', () => {
    assert.equal(showProjects([in_('api'), in_('api')]), false);
    assert.equal(showProjects([in_('api'), in_('')]), false);
    assert.equal(showProjects([in_('api'), in_('web')]), true);
});

test('durationText', () => {
    assert.equal(durationText(30_000), '<1m');
    assert.equal(durationText(4 * 60_000 + 59_000), '4m');
    assert.equal(durationText(59 * 60_000), '59m');
    assert.equal(durationText(2 * 3_600_000 + 1), '2h');
    assert.equal(durationText(3 * 86_400_000), '3d');
});

test('parseSocketPath: reads the socket line of herdr status server', () => {
    const out = 'status: running\nversion: 0.9.5\nsocket: /home/u/.config/herdr/herdr.sock\n';
    assert.equal(parseSocketPath(out), '/home/u/.config/herdr/herdr.sock');
    assert.equal(parseSocketPath('status: not running\nsocket: /a b/herdr.sock'), '/a b/herdr.sock');
    assert.equal(parseSocketPath('status: running\n'), null);
    assert.equal(parseSocketPath('socket:   \n'), null);
});

test('subscribeRequest: pane events plus a status subscription per pane, one JSON line', () => {
    const line = subscribeRequest(['w2:p1', 'w1:p3']);
    assert.ok(line.endsWith('\n'));
    const req = JSON.parse(line) as {method: string; params: {subscriptions: {type: string; pane_id?: string}[]}};
    assert.equal(req.method, 'events.subscribe');
    assert.deepEqual(
        req.params.subscriptions.filter(s => s.type === 'pane.agent_status_changed').map(s => s.pane_id),
        ['w1:p3', 'w2:p1'],
    );
    assert.ok(req.params.subscriptions.some(s => s.type === 'pane.agent_detected'));
    const empty = JSON.parse(subscribeRequest([])) as {params: {subscriptions: unknown[]}};
    assert.equal(empty.params.subscriptions.length, 4);
});

test('parseStreamLine: ack, events, errors', () => {
    assert.deepEqual(parseStreamLine('{"id":"herdr-pip","result":{"type":"subscription_started"}}'), {kind: 'started'});
    assert.deepEqual(
        parseStreamLine('{"event":"pane.agent_status_changed","data":{"pane_id":"w1:p1","agent_status":"done"}}'),
        {kind: 'event'},
    );
    assert.deepEqual(parseStreamLine('{"id":"x","error":{"code":"invalid_request","message":"bad"}}'), {
        kind: 'error',
        message: 'invalid_request: bad',
    });
    assert.deepEqual(parseStreamLine('not json'), {kind: 'other'});
    assert.deepEqual(parseStreamLine('{"id":"x","result":{"type":"pong"}}'), {kind: 'other'});
});
