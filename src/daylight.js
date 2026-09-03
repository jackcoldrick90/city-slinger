/**
 * What the world looks like at a given time of day.
 *
 * Pure: a phase in, a palette out. No three.js, no scene graph, no canvas --
 * which means the entire cycle can be driven headlessly and checked in a
 * millisecond, rather than by staring at a four-minute animation waiting for
 * dawn to see whether it looks right.
 *
 * That matters more here than anywhere else in the project. Every other system
 * is wrong in a way you can see immediately; a day/night cycle is wrong in a
 * way you have to *wait* for, and a bug at phase 0.34 is three and a half
 * minutes from the last time you looked.
 *
 * The keyframes themselves are data in `world.js`. This file only knows how to
 * find the two that bracket a phase and blend between them -- including across
 * the wrap at midnight, which is the one piece of arithmetic here with any
 * teeth in it.
 */

import {
  DAY_KEYS, DAY_COLOR_KEYS, DAY_NUMBER_KEYS, SUN_TILT,
} from './world.js';

const TAU = Math.PI * 2;

/** Wrap into [0, 1). Phase goes negative when time is scrubbed backwards. */
export function wrapPhase(phase) {
  return ((phase % 1) + 1) % 1;
}

/** Blend two packed sRGB hex colours. Channel-wise, which is enough here. */
function mixHex(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16)
    | (Math.round(ag + (bg - ag) * t) << 8)
    | Math.round(ab + (bb - ab) * t);
}

/**
 * The two keyframes either side of `phase`, and how far between them it sits.
 *
 * The last keyframe wraps round to the first, so the small hours between
 * `night` at 0.87 and `midnight` at 0.00 interpolate across the seam instead of
 * snapping. Getting this wrong gives a visible jolt once per cycle at a time
 * nobody is watching.
 */
function bracket(phase) {
  const last = DAY_KEYS.length - 1;
  for (let i = 0; i < last; i++) {
    if (phase >= DAY_KEYS[i].at && phase < DAY_KEYS[i + 1].at) {
      const span = DAY_KEYS[i + 1].at - DAY_KEYS[i].at;
      return { a: DAY_KEYS[i], b: DAY_KEYS[i + 1], t: (phase - DAY_KEYS[i].at) / span };
    }
  }
  // Past the final keyframe, or before the first: the wrap segment.
  const span = 1 - DAY_KEYS[last].at + DAY_KEYS[0].at;
  const into = phase >= DAY_KEYS[last].at
    ? phase - DAY_KEYS[last].at
    : phase + (1 - DAY_KEYS[last].at);
  return { a: DAY_KEYS[last], b: DAY_KEYS[0], t: into / span };
}

/**
 * Where the sun is.
 *
 * Not keyframed -- it is just a circle, and deriving it means the light can
 * never drift out of step with the sky colours the way two hand-authored
 * tables would. Phase 0.25 puts it on the eastern horizon, 0.5 overhead, 0.75
 * on the western one. The fixed `z` tilt is what makes it rake across the
 * building faces the camera can actually see rather than lighting their tops.
 */
export function sunDirection(phase) {
  const a = wrapPhase(phase) * TAU - Math.PI / 2;
  return { x: Math.cos(a), y: Math.sin(a), z: SUN_TILT };
}

/** True while the sun is above the horizon. */
export function isDaylight(phase) {
  return sunDirection(phase).y > 0;
}

/**
 * The key light's direction: the sun by day, the moon by night.
 *
 * Swapping to the moon rather than letting the sun sink below the horizon
 * keeps a light on the facades all night, and puts it on the opposite side of
 * the sky -- which is both correct and the reason the city looks different at
 * 2am than it does at noon beyond simply being darker.
 */
export function keyDirection(phase) {
  const sun = sunDirection(phase);
  if (sun.y > 0) return sun;
  return { x: -sun.x, y: -sun.y, z: SUN_TILT };
}

/** The full palette at a phase. Every field of a keyframe, interpolated. */
export function paletteAt(phase) {
  const p = wrapPhase(phase);
  const { a, b, t } = bracket(p);
  // Smoothstep rather than linear: the eye reads a linear ramp between two
  // colours as a hard edge at each keyframe, because the *rate* changes there
  // even though the value does not.
  const e = t * t * (3 - 2 * t);

  const out = { phase: p, name: e < 0.5 ? a.name : b.name };
  for (const k of DAY_COLOR_KEYS) out[k] = mixHex(a[k], b[k], e);
  for (const k of DAY_NUMBER_KEYS) out[k] = a[k] + (b[k] - a[k]) * e;
  return out;
}
