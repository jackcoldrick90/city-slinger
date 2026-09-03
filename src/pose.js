/**
 * How the figure is arranged, given what the physics is doing.
 *
 * Pure: numbers in, radians out, no three.js and no scene graph. There is no
 * animation clip anywhere in this project and nothing is keyframed -- the
 * character leans into an arc because the arc is an input to this function, so
 * it does it correctly for arcs nobody anticipated.
 *
 * Being a separate module from `player.js` is the whole point: `player.js`
 * imports three.js and therefore cannot be loaded by `node --test`, and this
 * can.
 *
 * ## Two halves
 *
 * `targetPose` says where every joint *wants* to be. `stepPose` moves the
 * current pose toward that, one joint at a time, at a rate set per joint.
 *
 * The second half is what stops it looking like a puppet. Driving the joints
 * straight from the target snaps them between poses in a single frame; letting
 * them chase it, with the spine leading and the elbows and knees trailing,
 * gives the limbs the lag and follow-through that reads as mass. It is the
 * cheapest secondary animation there is -- one `exp()` per joint.
 *
 * ## Sign conventions, which matter more than they look
 *
 * The figure faces +x. A positive rotation about z swings a downward-hanging
 * limb *forward*, toward +x. So hip and shoulder angles are signed, and
 * **elbow and knee angles are magnitudes** -- always zero or more, applied
 * negatively, because a joint that can go either way is a joint that will
 * eventually hyperextend. The tests assert exactly that.
 */
import { BODY, POSE_EASE } from './world.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Every joint the figure has, at rest. */
export function restPose() {
  return {
    body: 0, spine: 0, head: 0,
    shoulderWeb: 0, elbowWeb: 0,
    shoulderFree: 0, elbowFree: 0,
    hipFront: 0, kneeFront: 0,
    hipBack: 0, kneeBack: 0,
  };
}

/** Which easing rate governs each joint. */
const RATE = {
  body: 'body', spine: 'spine', head: 'head',
  shoulderWeb: 'shoulder', shoulderFree: 'shoulder',
  elbowWeb: 'elbow', elbowFree: 'elbow',
  hipFront: 'hip', hipBack: 'hip',
  kneeFront: 'knee', kneeBack: 'knee',
};

/**
 * @param {object} p
 * @param {boolean} p.attached  is a web currently holding
 * @param {number}  p.theta     rope angle from straight-down, when attached
 * @param {number}  p.vx        world velocity
 * @param {number}  p.vy
 * @returns {object} the target angle of every joint, in radians
 */
export function targetPose({ attached, theta, vx, vy }) {
  const speed = Math.hypot(vx, vy);
  const dir = vx < 0 ? -1 : 1;                       // which way he faces
  const fast = clamp(speed / BODY.tuckAtSpeed, 0, 1);
  const dive = vy < 0 ? clamp(-vy / BODY.diveAtSpeed, 0, 1) : 0;
  const rise = vy > 0 ? clamp(vy / BODY.diveAtSpeed, 0, 1) : 0;

  // Attached: the body's up-axis points along the rope, so it hangs from the
  // web the way a body actually would. Free: it leans into the direction of
  // travel, harder the faster it is going.
  const lean = clamp(-vx * BODY.leanPerSpeed, -BODY.maxLean, BODY.maxLean);
  const body = attached ? theta : lean;

  const pose = restPose();
  pose.body = body;

  if (attached) {
    // Hanging: chest opens slightly against the pull, head turned up the rope.
    pose.spine = -0.14 - 0.16 * fast;
    pose.head = -0.20 - 0.12 * fast;

    // The web arm reaches straight up the rope. Once the body is aligned to the
    // rope that is simply "up" in local space, which is a rotation of pi from
    // the shoulder's resting hang -- with the elbow only just off locked,
    // because an arm taking your whole weight is nearly straight.
    pose.shoulderWeb = Math.PI;
    pose.elbowWeb = 0.10 + 0.10 * fast;

    // The free arm counterweights: out and back, elbow folding with speed.
    pose.shoulderFree = -dir * (0.5 + 0.55 * fast);
    pose.elbowFree = 0.55 + 0.55 * fast;

    // Legs trail and tuck. The trailing leg lags the leading one, which is
    // what stops the two reading as one thick limb.
    pose.hipFront = dir * (0.30 + 0.85 * fast);
    pose.kneeFront = 0.45 + 1.05 * fast;
    pose.hipBack = dir * (0.05 + 0.40 * fast);
    pose.kneeBack = 0.20 + 0.65 * fast;
  } else {
    // Free flight. Diving is streamlined -- arms swept back, legs extended.
    // Rising after a release is the opposite: a tuck at the top of the arc.
    pose.spine = rise > dive ? -0.26 * rise : 0.20 * dive;
    pose.head = -0.10 - 0.22 * rise + 0.16 * dive;

    pose.shoulderWeb = -dir * (0.75 + 0.55 * fast);
    pose.shoulderFree = -dir * (0.40 + 0.45 * fast);
    pose.elbowWeb = 0.35 + 0.55 * fast;
    pose.elbowFree = 0.50 + 0.45 * fast;

    const tuck = clamp(fast * (0.55 + 0.75 * rise), 0, 1);
    pose.hipFront = dir * (1.20 * tuck - 0.45 * dive * (1 - tuck));
    pose.kneeFront = 0.25 + 1.35 * tuck;
    pose.hipBack = dir * (0.65 * tuck - 0.60 * dive * (1 - tuck));
    pose.kneeBack = 0.18 + 0.85 * tuck;
  }

  // Hinges are magnitudes, never signed. See the note at the top.
  pose.elbowWeb = Math.max(0, pose.elbowWeb);
  pose.elbowFree = Math.max(0, pose.elbowFree);
  pose.kneeFront = Math.max(0, pose.kneeFront);
  pose.kneeBack = Math.max(0, pose.kneeBack);
  return pose;
}

/** Shortest signed way round from `a` to `b`. */
function shortest(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Move the current pose toward a target, in place.
 *
 * Frame-rate independent by construction: `1 - exp(-rate * dt)` composes, so
 * two steps of dt land in the same place as one step of 2*dt. The obvious
 * `lerp(a, b, 0.2)` does not, and silently animates at a different speed on
 * every machine.
 *
 * Angles take the short way round, which matters at exactly one moment: the
 * frame a web attaches, when `body` jumps from a small lean to a rope angle
 * that may be most of a turn away. Without it the figure spins the long way.
 */
export function stepPose(current, target, dt) {
  for (const joint of Object.keys(current)) {
    const rate = POSE_EASE[RATE[joint]];
    const step = 1 - Math.exp(-rate * dt);
    current[joint] += shortest(current[joint], target[joint]) * step;
  }
  return current;
}
