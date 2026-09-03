// How the figure is arranged, driven headlessly. `pose.js` imports no three.js,
// which is the only reason this file can exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetPose, stepPose, restPose } from '../src/pose.js';
import { BODY, POSE_EASE } from '../src/world.js';

const free = (vx, vy) => targetPose({ attached: false, theta: 0, vx, vy });
const held = (theta, vx = 10, vy = 0) => targetPose({ attached: true, theta, vx, vy });

/** Every combination of inputs the physics can actually produce. */
function everyInput(fn) {
  for (const attached of [true, false]) {
    for (const vx of [-95, -40, -1, 0, 1, 40, 95]) {
      for (const vy of [-95, -30, 0, 30, 95]) {
        for (const theta of [-Math.PI, -1.2, 0, 1.2, Math.PI, 7.5]) {
          fn(targetPose({ attached, theta, vx, vy }), { attached, vx, vy, theta });
        }
      }
    }
  }
}

test('hanging from a web, the body lines up with the rope', () => {
  for (const theta of [-1.2, -0.3, 0, 0.4, 1.1]) {
    assert.equal(held(theta).body, theta);
  }
});

test('the web arm reaches straight up the rope, and only while attached', () => {
  assert.equal(held(0.5).shoulderWeb, Math.PI);
  assert.notEqual(free(10, 0).shoulderWeb, Math.PI);
});

test('the arm taking the weight is the straighter of the two', () => {
  // An arm holding your entire bodyweight is nearly locked; the free one is not.
  const p = held(0.2, 30);
  assert.ok(p.elbowWeb < p.elbowFree,
    `web elbow ${p.elbowWeb} should be straighter than free ${p.elbowFree}`);
});

test('in free flight the body leans into the direction of travel', () => {
  assert.ok(free(20, 0).body < 0, 'moving right should lean right');
  assert.ok(free(-20, 0).body > 0, 'moving left should lean left');
});

test('the lean is clamped, so terminal velocity is not a cartwheel', () => {
  for (const vx of [-500, -90, 90, 500]) {
    assert.ok(Math.abs(free(vx, 0).body) <= BODY.maxLean + 1e-9,
      `lean ${free(vx, 0).body} exceeded ${BODY.maxLean} at vx=${vx}`);
  }
});

test('knees and elbows never hyperextend', () => {
  // The one invariant a hinge has. Signed hinge angles are how procedural
  // figures end up with their shins pointing through their thighs.
  everyInput((p, at) => {
    for (const hinge of ['elbowWeb', 'elbowFree', 'kneeFront', 'kneeBack']) {
      assert.ok(p[hinge] >= 0,
        `${hinge} went to ${p[hinge]} at ${JSON.stringify(at)}`);
      assert.ok(p[hinge] <= Math.PI * 0.75,
        `${hinge} folded through itself at ${p[hinge]}`);
    }
  });
});

test('the two legs never take the same pose, so they read as two legs', () => {
  for (const attached of [true, false]) {
    for (const vx of [8, 45, 90]) {
      const p = targetPose({ attached, theta: 0.3, vx, vy: -10 });
      assert.notEqual(p.hipFront, p.hipBack);
      assert.notEqual(p.kneeFront, p.kneeBack);
    }
  }
});

test('legs tuck further the faster he goes', () => {
  const at = (v) => targetPose({ attached: true, theta: 0, vx: v, vy: 0 }).kneeFront;
  assert.ok(at(30) > at(10));
  assert.ok(at(60) > at(30));
  assert.equal(at(BODY.tuckAtSpeed * 2), at(BODY.tuckAtSpeed), 'tuck saturates');
});

test('every angle is a finite number, for any input the physics can produce', () => {
  everyInput((p, at) => {
    for (const [k, v] of Object.entries(p)) {
      assert.ok(Number.isFinite(v), `${k} was ${v} at ${JSON.stringify(at)}`);
    }
  });
});

test('a target pose names exactly the joints the figure has', () => {
  // Guards the join between this file and player.js: a joint added here and
  // not read there animates nothing, silently.
  assert.deepEqual(
    Object.keys(targetPose({ attached: true, theta: 0, vx: 0, vy: 0 })).sort(),
    Object.keys(restPose()).sort(),
  );
});

test('easing converges on the target, and stops there', () => {
  const cur = restPose();
  const tgt = targetPose({ attached: true, theta: 0.9, vx: 40, vy: -10 });
  for (let i = 0; i < 600; i++) stepPose(cur, tgt, 1 / 120);
  for (const k of Object.keys(tgt)) {
    assert.ok(Math.abs(cur[k] - tgt[k]) < 1e-6, `${k} settled at ${cur[k]}, wanted ${tgt[k]}`);
  }
});

test('easing never overshoots', () => {
  // A spring would ring; this must not, or a knee snaps past straight.
  const cur = restPose();
  const tgt = targetPose({ attached: true, theta: 1.0, vx: 60, vy: 0 });
  for (let i = 0; i < 400; i++) {
    stepPose(cur, tgt, 1 / 60);
    for (const k of Object.keys(tgt)) {
      const over = tgt[k] >= 0 ? cur[k] - tgt[k] : tgt[k] - cur[k];
      assert.ok(over <= 1e-9, `${k} overshot to ${cur[k]} past ${tgt[k]}`);
    }
  }
});

test('the ease runs at the same speed whatever the frame rate', () => {
  // The reason it is `1 - exp(-rate*dt)` and not `lerp(a, b, 0.2)`: the second
  // animates at a different speed on every machine, and nobody ever notices.
  const run = (dt, steps) => {
    const cur = restPose();
    const tgt = targetPose({ attached: true, theta: 1.1, vx: 50, vy: -20 });
    for (let i = 0; i < steps; i++) stepPose(cur, tgt, dt);
    return cur;
  };
  const slow = run(1 / 30, 15);        // half a second
  const fast = run(1 / 240, 120);      // half a second
  for (const k of Object.keys(slow)) {
    assert.ok(Math.abs(slow[k] - fast[k]) < 0.01,
      `${k} drifted ${Math.abs(slow[k] - fast[k]).toFixed(4)} between 30fps and 240fps`);
  }
});

test('the body takes the short way round when a web attaches', () => {
  // On attach, `body` jumps from a small lean to a rope angle most of a turn
  // away. Easing the long way spins the figure through the floor.
  const cur = restPose();
  cur.body = -3.0;
  const tgt = { ...restPose(), body: 3.0 };
  const first = { ...cur };
  stepPose(cur, tgt, 1 / 60);
  assert.ok(cur.body < first.body,
    'should have moved away from +3 through -pi, not toward it the long way');
});

test('limbs lag the torso, which is what reads as mass', () => {
  assert.ok(POSE_EASE.spine > POSE_EASE.elbow, 'the spine must lead the elbows');
  assert.ok(POSE_EASE.hip > POSE_EASE.knee, 'the hip must lead the knee');
  assert.ok(POSE_EASE.body > POSE_EASE.shoulder, 'the body must lead the arms');
});
