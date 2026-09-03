// The rope, driven headlessly. No browser, no canvas, no three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, attach, release, step, speed, ropeStretch,
} from '../src/swing.js';
import {
  GRAVITY, MAX_ROPE, MIN_ROPE, FIXED_DT, STREET_Y, MAX_SPEED, FEET_DROP,
} from '../src/world.js';

const EPS = 1e-9;

test('attach refuses anything out of range, and changes nothing when it does', () => {
  const s = createState(0, 100);
  assert.equal(attach(s, MAX_ROPE + 1, 100), false);
  assert.equal(s.anchor, null);
  assert.equal(attach(s, MIN_ROPE / 2, 100), false);
  assert.equal(s.anchor, null);

  assert.equal(attach(s, 0, 100 + MAX_ROPE / 2), true);
  assert.equal(s.len, MAX_ROPE / 2);
});

test('the rope is never stretched past its length, over random play', () => {
  let worst = 0;
  for (let seed = 0; seed < 400; seed++) {
    // Deterministic pseudo-random play: attach somewhere in reach, then swing.
    const a = Math.sin(seed * 12.9898) * 43758.5453;
    const r = (n) => Math.abs((Math.sin((seed + n) * 78.233) * 43758.5453) % 1);
    const s = createState(0, 200, (r(1) - 0.5) * 60, (r(2) - 0.5) * 60);
    const ang = a % (Math.PI * 2);
    const len = MIN_ROPE + r(3) * (MAX_ROPE - MIN_ROPE);
    if (!attach(s, s.x + Math.cos(ang) * len, s.y + Math.sin(ang) * len)) continue;
    for (let i = 0; i < 300; i++) {
      step(s, FIXED_DT, { reel: r(4) > 0.5 });
      worst = Math.max(worst, ropeStretch(s) - s.len);
    }
  }
  // Position is projected exactly onto the circle, so the only slack is float
  // error. Anything larger means the constraint is not being applied.
  assert.ok(worst < 1e-9, `rope overstretched by ${worst}`);
});

test('a pendulum from horizontal arrives at the bottom at sqrt(2gL)', () => {
  const len = 20;
  const s = createState(len, 100);          // level with the anchor, hanging right
  assert.equal(attach(s, 0, 100), true);

  let lowest = Infinity;
  let atLowest = 0;
  for (let i = 0; i < 2000; i++) {
    step(s, FIXED_DT);
    if (s.y < lowest) { lowest = s.y; atLowest = speed(s); }
  }
  const ideal = Math.sqrt(2 * Math.abs(GRAVITY) * len);
  const err = Math.abs(atLowest - ideal) / ideal;
  // Measured at 0.0004%. The Cartesian project-and-clamp version this replaced
  // scored 6.35% here, which is the entire reason swing.js is in polar form.
  assert.ok(err < 0.001, `bottom speed ${atLowest.toFixed(3)} vs ideal ${ideal.toFixed(3)} — ${(err * 100).toFixed(3)}% off`);
});

test('a swing does not die out: two minutes on, the arc is the same size', () => {
  const s = createState(20, 100);
  attach(s, 0, 100);
  const peakOver = (seconds) => {
    let peak = 0;
    for (let i = 0; i < seconds / FIXED_DT; i++) { step(s, FIXED_DT); peak = Math.max(peak, speed(s)); }
    return peak;
  };
  const first = peakOver(10);
  for (let i = 0; i < 10; i++) peakOver(10);
  const last = peakOver(10);
  const drift = Math.abs(last - first) / first;
  assert.ok(drift < 1e-4, `arc speed drifted ${(drift * 100).toFixed(4)}% over two minutes`);
});

test('release preserves velocity exactly', () => {
  const s = createState(20, 100);
  attach(s, 0, 100);
  for (let i = 0; i < 60; i++) step(s, FIXED_DT);
  const before = { vx: s.vx, vy: s.vy };
  release(s);
  assert.equal(s.anchor, null);
  assert.equal(s.vx, before.vx);
  assert.equal(s.vy, before.vy);
});

test('reeling in shortens the rope but never below MIN_ROPE', () => {
  const s = createState(20, 100);
  attach(s, 0, 100);
  const start = s.len;
  step(s, FIXED_DT, { reel: true });
  assert.ok(s.len < start);
  for (let i = 0; i < 5000; i++) step(s, FIXED_DT, { reel: true });
  assert.equal(s.len, MIN_ROPE);
});

test('halving the timestep does not change where the player ends up', () => {
  const run = (dt, steps) => {
    const s = createState(20, 100);
    attach(s, 0, 100);
    for (let i = 0; i < steps; i++) step(s, dt);
    return s;
  };
  const coarse = run(FIXED_DT, 120);          // 1 second
  const fine = run(FIXED_DT / 2, 240);        // 1 second
  const drift = Math.hypot(coarse.x - fine.x, coarse.y - fine.y);
  assert.ok(drift < 0.2, `1s of swing drifts ${drift.toFixed(4)} units between timesteps`);
});

test('the street is hit by the feet, not the waist', () => {
  const s = createState(0, 10, 5, 0);
  let result = 'ok';
  for (let i = 0; i < 1000 && result === 'ok'; i++) result = step(s, FIXED_DT);
  assert.equal(result, 'grounded');
  assert.equal(s.y, STREET_Y + FEET_DROP);
});

test('speed is clamped, so no bounce can fling the player off the map', () => {
  const s = createState(0, 500, MAX_SPEED * 3, 0);
  step(s, FIXED_DT);
  assert.ok(speed(s) <= MAX_SPEED + EPS);
});
