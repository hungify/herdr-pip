import test from 'node:test';
import assert from 'node:assert/strict';
import {parseColor, badgeStyle, dotStyle, shade} from '../src/appearance.ts';

test('parseColor', () => {
    assert.deepEqual(parseColor('#241f31'), [36, 31, 49]);
    assert.deepEqual(parseColor('#FFF'), [255, 255, 255]);
    assert.deepEqual(parseColor('rgb(192,28,40)'), [192, 28, 40]);
    assert.deepEqual(parseColor('rgba(1, 2, 3, 0.5)'), [1, 2, 3]);
    assert.equal(parseColor('red'), null);
    assert.equal(parseColor('#12345'), null);
    assert.equal(parseColor(''), null);
    assert.deepEqual(parseColor('rgb(300, 0, 0)'), [255, 0, 0], 'channels are clamped');
});

test('badgeStyle', () => {
    assert.equal(
        badgeStyle({size: 40, color: '#241f31', opacity: 85}),
        'width: 40px; height: 40px; border-radius: 20px; font-size: 17px; ' +
            'background-color: rgba(36, 31, 49, 0.85); background-gradient-direction: vertical; ' +
            'background-gradient-start: rgba(91, 87, 101, 0.85); background-gradient-end: rgba(29, 25, 39, 0.85);',
    );
    assert.match(
        badgeStyle({size: 96, color: 'nonsense', opacity: 10}),
        /background-color: rgba\(53, 132, 228, 0\.1\)/,
        'falls back to the default color',
    );
});

test('dotStyle', () => {
    assert.equal(dotStyle(52), 'width: 13px; height: 13px; border-radius: 26px;');
    assert.equal(dotStyle(24), 'width: 8px; height: 8px; border-radius: 16px;');
});

test('shade', () => {
    assert.deepEqual(shade([100, 100, 100], 0.5), [178, 178, 178]);
    assert.deepEqual(shade([100, 100, 100], -0.5), [50, 50, 50]);
    assert.deepEqual(shade([10, 20, 30], 0), [10, 20, 30]);
});
