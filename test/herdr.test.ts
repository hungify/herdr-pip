import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
    herdrCommand,
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
    pickHerdrWindow,
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
    assert.equal(summaryText(s), 'No agents');
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

test('herdrCommand puts the session before the subcommand', () => {
    assert.deepEqual(herdrCommand('/bin/herdr', '', 'agent', 'list'), ['/bin/herdr', 'agent', 'list']);
    assert.deepEqual(herdrCommand('/bin/herdr', 'work', 'agent', 'focus', 'w7:p1'), [
        '/bin/herdr',
        '--session',
        'work',
        'agent',
        'focus',
        'w7:p1',
    ]);
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
    assert.equal(summaryText(summarize({missing: true})), 'herdr not found');
    assert.equal(summaryText(WAITING), 'Waiting for the first poll');
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
