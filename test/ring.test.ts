import test from 'node:test';
import assert from 'node:assert/strict';
import {RingQueue, SHOW_MS, ringArcs, ringEvents} from '../src/ring.ts';
import type {Agent, Status} from '../src/herdr.ts';

const a = (paneId: string, status: Status): Agent => ({
    agent: 'claude',
    title: '',
    paneId,
    status,
    statusLabel: '',
    focused: false,
});

test('ringEvents: transitions into working, done or blocked; quiet on the first poll', () => {
    assert.deepEqual(ringEvents(null, [a('p1', 'working')]), []);
    assert.deepEqual(ringEvents([a('p1', 'idle')], [a('p1', 'working'), a('p2', 'done')]), [
        {paneId: 'p1', status: 'working'},
        {paneId: 'p2', status: 'done'},
    ]);
    assert.deepEqual(ringEvents([a('p1', 'working')], [a('p1', 'working')]), []);
    assert.deepEqual(ringEvents([a('p1', 'done')], [a('p1', 'idle')]), []);
});

test('RingQueue shows one event at a time, then falls back to spinning while working', () => {
    const q = new RingQueue();
    assert.equal(q.current(0, false), null);
    assert.deepEqual(q.current(0, true), {kind: 'spin', status: 'working', since: 0});

    q.push([
        {paneId: 'p1', status: 'done'},
        {paneId: 'p2', status: 'blocked'},
    ]);
    assert.deepEqual(q.current(1000, true), {kind: 'fill', status: 'done', since: 1000});
    assert.equal(q.current(1000 + SHOW_MS - 1, true)?.status, 'done');
    assert.deepEqual(q.current(1000 + SHOW_MS, true), {kind: 'pulse', status: 'blocked', since: 1000 + SHOW_MS});
    assert.equal(q.current(1000 + 2 * SHOW_MS, false), null);
});

test('RingQueue keeps only the latest pending event per agent', () => {
    const q = new RingQueue();
    q.push([{paneId: 'p1', status: 'working'}]);
    assert.equal(q.current(0, true)?.status, 'working');
    q.push([
        {paneId: 'p2', status: 'working'},
        {paneId: 'p2', status: 'done'},
    ]);
    assert.equal(q.current(SHOW_MS, true)?.status, 'done');
    assert.equal(q.current(2 * SHOW_MS, false), null);
});

test('ringArcs: spin rotates, fill grows to a full circle, pulse breathes', () => {
    const [s0] = ringArcs({kind: 'spin', status: 'working', since: 0}, 0);
    const [s1] = ringArcs({kind: 'spin', status: 'working', since: 0}, 300);
    assert.ok(s0 && s1 && s1.start > s0.start);

    assert.deepEqual(ringArcs({kind: 'fill', status: 'done', since: 100}, 100), []);
    const [full] = ringArcs({kind: 'fill', status: 'done', since: 0}, 5000);
    assert.ok(full && Math.abs(full.end - full.start - 2 * Math.PI) < 1e-9);

    const [p0] = ringArcs({kind: 'pulse', status: 'blocked', since: 0}, 0);
    const [p1] = ringArcs({kind: 'pulse', status: 'blocked', since: 0}, 500);
    assert.ok(p0 && p1 && p0.alpha === 1 && p1.alpha < 0.3);
});

test('RingQueue.clear drops queued events', () => {
    const queue = new RingQueue();
    queue.push([{paneId: 'p1', status: 'done'}]);
    queue.clear();
    assert.equal(queue.current(0, false), null);
});
