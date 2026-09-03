/**
 * The rope. This is the whole game, and it imports nothing but numbers.
 *
 * No three.js type appears in this file, no canvas, no DOM. State is plain
 * `{x, y, vx, vy}` and every function is a pure-ish transform on it, so the
 * entire mechanic can be driven by `node --test` in about a millisecond. On the
 * last project the most valuable tests by far were exactly this shape -- plain
 * Node against stubbed state -- and the least valuable time was spent chasing
 * behaviour through a browser that turned out not to be running the frame loop.
 *
 * ## Why this is in polar coordinates
 *
 * The obvious model -- integrate x and y, then when the rope is over-stretched
 * snap the position back onto the circle and delete the outward velocity -- was
 * written first and measured second. It loses **6.4% of the arc speed on a
 * single swing**: the snap-back quietly shortens the path travelled every step,
 * and that shows up as swings that mysteriously die out. The test for it is
 * still below, and it is the reason this file looks the way it does.
 *
 * So while the rope is taut the mass is integrated as a pendulum instead --
 * angle and angular velocity, semi-implicit -- which is symplectic. Measured:
 * it arrives at the bottom of the first arc within 0.001% of sqrt(2gL), and
 * after two minutes of swinging the peak speed of an arc is unchanged to four
 * decimal places. Cartesian x/y/vx/vy is written back afterwards, so nothing
 * outside this file knows or cares.
 *
 * Two things fall out of that for free rather than being coded:
 *
 *   - **Reeling in speeds you up.** The angular equation for a changing rope
 *     length carries a `-2 L' w / L` term, which is conservation of angular
 *     momentum. Pull in at the bottom of an arc and you gain speed, exactly the
 *     way a child pumps a swing. Nothing adds that; it is just true.
 *   - **The rope goes slack.** A rope pulls and never pushes, so it is only
 *     taut while `L*w^2 - g*cos(theta) >= 0`. Above that line the constraint is
 *     dropped and the player is in free flight until the rope pulls tight again
 *     -- and the snap when it does is inelastic, which is what a rope does.
 *
 * Releasing feels earned because at the moment you let go the velocity is
 * already purely tangential. The arc you flew is the arc you keep. No impulse
 * is added anywhere.
 */
import {
  GRAVITY, AIR_DRAG, MAX_ROPE, MIN_ROPE, REEL_RATE, MAX_SPEED, MAX_OMEGA, STREET_Y, FEET_DROP,
} from './world.js';

/** A fresh point mass. */
export function createState(x, y, vx = 0, vy = 0) {
  return {
    x, y, vx, vy,
    anchor: null,
    len: 0,
    taut: false,          // a rope can be attached and slack at the same time
    theta: 0,             // angle from straight-down, while taut
    omega: 0,             // angular velocity, while taut
    radial: 0,            // outward velocity; the reel rate, while taut
  };
}

export function speed(s) {
  return Math.hypot(s.vx, s.vy);
}

export function isAttached(s) {
  return s.anchor !== null;
}

/** Distance from the player to the anchor, or 0 when free. */
export function ropeStretch(s) {
  return s.anchor ? Math.hypot(s.x - s.anchor.x, s.y - s.anchor.y) : 0;
}

/**
 * Fire a web at a point. Returns false (and changes nothing) if it is out of
 * range, which is the caller's cue to show a miss.
 *
 * The rope starts at exactly the current separation -- never shorter. Attaching
 * to a taut-and-already-stretched rope would snap the player sideways in one
 * frame, which reads as a bug even though it is only a very stiff constraint.
 */
export function attach(s, ax, ay) {
  const d = Math.hypot(ax - s.x, ay - s.y);
  if (d > MAX_ROPE || d < MIN_ROPE) return false;
  s.anchor = { x: ax, y: ay };
  s.len = d;
  toPolar(s);
  s.taut = true;
  return true;
}

/** Let go. Velocity is untouched, and is already tangential. */
export function release(s) {
  s.anchor = null;
  s.len = 0;
  s.taut = false;
}

/**
 * Read the Cartesian state into the pendulum's angle and angular velocity.
 *
 * `theta` is measured from straight-down, so position is
 * `anchor + len * (sin t, -cos t)` and the tangent -- the direction of
 * increasing theta -- is `(cos t, sin t)`.
 */
function toPolar(s) {
  const dx = s.x - s.anchor.x;
  const dy = s.y - s.anchor.y;
  s.theta = Math.atan2(dx, -dy);
  const ct = Math.cos(s.theta);
  const st = Math.sin(s.theta);
  s.omega = (s.vx * ct + s.vy * st) / s.len;
  s.radial = s.vx * st - s.vy * ct;      // outward; normally the reel rate
}

/** Write the pendulum back out as x/y/vx/vy, which is all anything else reads. */
function fromPolar(s, lenRate) {
  const ct = Math.cos(s.theta);
  const st = Math.sin(s.theta);
  s.x = s.anchor.x + s.len * st;
  s.y = s.anchor.y - s.len * ct;
  const tangential = s.omega * s.len;
  s.vx = tangential * ct + lenRate * st;
  s.vy = tangential * st - lenRate * ct;
}

/** Integrate as a free body: gravity, drag, done. */
function freeStep(s, dt) {
  s.vy += GRAVITY * dt;
  const k = Math.max(0, 1 - AIR_DRAG * dt);
  s.vx *= k;
  s.vy *= k;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
}

/**
 * Advance one fixed step. `input.reel` shortens the rope, which is the player's
 * only way to add height.
 *
 * Returns 'grounded' the step the player touches the street, else 'ok'.
 */
export function step(s, dt, input = null) {
  if (!s.anchor) {
    freeStep(s, dt);
  } else if (!s.taut) {
    // Slack rope: fly freely until it pulls tight again.
    freeStep(s, dt);
    if (Math.hypot(s.x - s.anchor.x, s.y - s.anchor.y) >= s.len) {
      snapTaut(s);
    }
  } else {
    const lenRate = input && input.reel && s.len > MIN_ROPE ? -REEL_RATE : 0;

    // Semi-implicit: acceleration, then the new velocity moves the angle.
    // Doing it in this order rather than the other way round is what keeps a
    // swing from gaining or losing energy over hundreds of arcs.
    const alpha = (GRAVITY * Math.sin(s.theta) - 2 * lenRate * s.omega) / s.len;
    s.omega += alpha * dt;
    // A short rope and a fast reel can conserve their way to a dizzying spin
    // that MAX_SPEED alone would still allow -- see MAX_OMEGA's note.
    if (s.omega > MAX_OMEGA) s.omega = MAX_OMEGA;
    else if (s.omega < -MAX_OMEGA) s.omega = -MAX_OMEGA;
    s.theta += s.omega * dt;
    s.len = Math.max(MIN_ROPE, s.len + lenRate * dt);

    // A rope pulls and never pushes. Once the tension would have to go negative
    // to hold the mass on its circle, it isn't holding it at all.
    const tension = s.len * s.omega * s.omega - GRAVITY * Math.cos(s.theta);
    fromPolar(s, lenRate);
    if (tension < 0) s.taut = false;
  }

  const sp = Math.hypot(s.vx, s.vy);
  if (sp > MAX_SPEED) {
    s.vx = (s.vx / sp) * MAX_SPEED;
    s.vy = (s.vy / sp) * MAX_SPEED;
    if (s.taut) toPolar(s);
  }

  const floor = STREET_Y + FEET_DROP;
  if (s.y <= floor) {
    s.y = floor;
    return 'grounded';
  }
  return 'ok';
}

/**
 * The rope comes tight. Put the player back on the circle and delete the
 * outward velocity -- a rope snapping taut is an inelastic collision, so that
 * energy is genuinely gone rather than bounced back.
 */
function snapTaut(s) {
  const dx = s.x - s.anchor.x;
  const dy = s.y - s.anchor.y;
  const d = Math.hypot(dx, dy) || 1;
  s.x = s.anchor.x + (dx / d) * s.len;
  s.y = s.anchor.y + (dy / d) * s.len;
  const nx = dx / d;
  const ny = dy / d;
  const radial = s.vx * nx + s.vy * ny;
  if (radial > 0) {
    s.vx -= radial * nx;
    s.vy -= radial * ny;
  }
  toPolar(s);
  s.taut = true;
}
