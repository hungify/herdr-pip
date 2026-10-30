import test from 'node:test';
import assert from 'node:assert/strict';
import {clampInto, monitorAt, positionToXY, toastXY, xyToPosition} from '../src/placement.ts';

const area = {x: 0, y: 32, width: 1920, height: 1048};

test('positionToXY: default is the top-right corner inside the margin', () => {
    assert.deepEqual(positionToXY([-1, -1], 52, area), [1920 - 12 - 52, 32 + 12]);
    assert.deepEqual(positionToXY([0, 0], 52, area), [12, 44]);
    assert.deepEqual(positionToXY([1, 1], 52, area), [1856, 1016]);
});

test('xyToPosition is the inverse of positionToXY, clamped to 0..1', () => {
    for (const pos of [
        [0, 0],
        [0.25, 0.5],
        [1, 1],
    ] as const) {
        const [fx, fy] = xyToPosition(positionToXY([pos[0], pos[1]], 52, area), 52, area);
        assert.ok(Math.abs(fx - pos[0]) < 0.001 && Math.abs(fy - pos[1]) < 0.001, pos.join(','));
    }
    assert.deepEqual(xyToPosition([-50, 5000], 52, area), [0, 1]);
});

test('clampInto keeps the box inside the area', () => {
    assert.deepEqual(clampInto(-10, 0, 100, 50, area), [0, 32]);
    assert.deepEqual(clampInto(1900, 1070, 100, 50, area), [1820, 1030]);
});

test('toastXY puts the toast on the side with more room', () => {
    assert.deepEqual(toastXY([100, 100], 52, 300, 40, area), [160, 106]);
    assert.deepEqual(toastXY([1800, 100], 52, 300, 40, area), [1492, 106]);
});

test('monitorAt finds the monitor under a point, -1 in a gap', () => {
    const monitors = [
        {x: 0, y: 0, width: 1920, height: 1080},
        {x: 1920, y: 0, width: 2560, height: 1440},
    ];
    assert.equal(monitorAt(100, 100, monitors), 0);
    assert.equal(monitorAt(1920, 1200, monitors), 1);
    assert.equal(monitorAt(100, 1200, monitors), -1);
});

test('positions survive odd input: fractions above 1, areas too small for the badge', () => {
    assert.deepEqual(positionToXY([5, 5], 52, area), positionToXY([1, 1], 52, area));
    const tiny = {x: 0, y: 0, width: 60, height: 60};
    assert.deepEqual(xyToPosition([12, 12], 52, tiny), [0, 0], 'no NaN when there is no free room');
});
