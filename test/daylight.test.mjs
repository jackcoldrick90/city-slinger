// The day/night cycle, driven headlessly.
//
// This is the system with the worst feedback loop in the project: a bug at
// phase 0.34 is minutes of waiting away from the last time you looked at it.
// These run in about a millisecond and cover the whole cycle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paletteAt, sunDirection, keyDirection, isDaylight, wrapPhase,
} from '../src/daylight.js';
import { DAY_KEYS, DAY_COLOR_KEYS, DAY_NUMBER_KEYS } from '../src/world.js';

const EVERY = (n, fn) => { for (let i = 0; i < n; i++) fn(i / n); };

test('phase wraps, including from negative and beyond one', () => {
  assert.equal(wrapPhase(0), 0);
  assert.equal(wrapPhase(1), 0);
  assert.ok(Math.abs(wrapPhase(-0.25) - 0.75) < 1e-12);
  assert.ok(Math.abs(wrapPhase(2.4) - 0.4) < 1e-12);
});

test('every field is finite and in range, right around the cycle', () => {
  EVERY(500, (p) => {
    const pal = paletteAt(p);
    for (const k of DAY_COLOR_KEYS) {
      assert.ok(Number.isInteger(pal[k]), `${k} not an int at ${p}`);
      assert.ok(pal[k] >= 0 && pal[k] <= 0xffffff, `${k} out of range at ${p}`);
    }
    for (const k of DAY_NUMBER_KEYS) {
      assert.ok(Number.isFinite(pal[k]), `${k} was ${pal[k]} at ${p}`);
    }
    assert.ok(pal.window >= 0 && pal.window <= 1, `window ${pal.window} at ${p}`);
    assert.ok(pal.lamp >= 0 && pal.lamp <= 1, `lamp ${pal.lamp} at ${p}`);
    assert.ok(pal.density > 0, `fog density ${pal.density} at ${p}`);
  });
});

test('landing exactly on a keyframe gives that keyframe', () => {
  for (const key of DAY_KEYS) {
    const pal = paletteAt(key.at);
    for (const k of DAY_COLOR_KEYS) assert.equal(pal[k], key[k], `${k} at ${key.name}`);
    for (const k of DAY_NUMBER_KEYS) {
      assert.ok(Math.abs(pal[k] - key[k]) < 1e-9, `${k} at ${key.name}`);
    }
  }
});

test('the cycle is seamless across midnight', () => {
  // The wrap segment is the one join that is not simply "the next row down",
  // so it is the one that can snap. Approaching 1 from below must land on 0.
  const before = paletteAt(1 - 1e-6);
  const after = paletteAt(0);
  for (const k of DAY_COLOR_KEYS) {
    const d = Math.abs(((before[k] >> 16) & 255) - ((after[k] >> 16) & 255));
    assert.ok(d <= 1, `${k} jumps by ${d} across midnight`);
  }
});

test('nothing in the palette jumps between adjacent frames', () => {
  // A full cycle at 60fps over DAY_LENGTH seconds; no single frame may move
  // exposure or the lamps more than a hair, or the change reads as a flicker.
  let worst = 0;
  const step = 1 / (240 * 60);
  for (let p = 0; p < 1; p += step) {
    const a = paletteAt(p);
    const b = paletteAt(p + step);
    for (const k of DAY_NUMBER_KEYS) worst = Math.max(worst, Math.abs(b[k] - a[k]));
  }
  assert.ok(worst < 0.01, `largest single-frame palette jump was ${worst}`);
});

test('the sun rises in the east, is overhead at noon, and sets in the west', () => {
  assert.ok(sunDirection(0.25).y < 1e-9 && sunDirection(0.25).x > 0.99, 'sunrise');
  assert.ok(sunDirection(0.5).y > 0.99, 'noon');
  assert.ok(sunDirection(0.75).x < -0.99, 'sunset');
  assert.ok(sunDirection(0).y < -0.99, 'midnight');
});

test('it is daylight between sunrise and sunset, and not otherwise', () => {
  assert.ok(isDaylight(0.5), 'noon should be daylight');
  assert.ok(isDaylight(0.35), 'mid-morning should be daylight');
  assert.ok(!isDaylight(0), 'midnight should not be');
  assert.ok(!isDaylight(0.9), 'late evening should not be');
});

test('the key light is always above the horizon — sun by day, moon by night', () => {
  EVERY(400, (p) => {
    const k = keyDirection(p);
    assert.ok(k.y >= -1e-9, `key light below the horizon at phase ${p} (y=${k.y})`);
    assert.ok(Number.isFinite(k.x) && Number.isFinite(k.z));
  });
});

test('windows and street lamps are out at noon and full at midnight', () => {
  assert.equal(paletteAt(0.5).window, 0);
  assert.equal(paletteAt(0.5).lamp, 0);
  assert.equal(paletteAt(0).window, 1);
  assert.equal(paletteAt(0).lamp, 1);
  // And the day is genuinely brighter, not just differently coloured.
  assert.ok(paletteAt(0.5).keyI > paletteAt(0).keyI * 1.5);
});
