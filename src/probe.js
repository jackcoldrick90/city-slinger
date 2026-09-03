/**
 * A luminance probe. Point it at two places on the screen and it tells you how
 * far apart they actually are, in light.
 *
 * This exists because of four bugs on the last project that all looked like
 * transparency problems and were all the same thing: a colour drawn too close
 * to what was behind it. Smog painted in the sky's own horizon colour -- a lift
 * of 2 parts in 255. Steam that measured *darker* than the pavement it rose
 * from. Every one was found in seconds by sampling the canvas and comparing
 * luminance, and every one had already had its opacity raised twice by eye
 * before anyone measured it.
 *
 * So: never judge a colour against its background. Measure it. Press P.
 *
 * It samples **patches, not pixels**, and that detail is the difference between
 * this working and not. The first version read one pixel at the centre of a
 * building face, which lands on unlit wall almost every time, and duly reported
 * a contrast of exactly zero against a city full of lit windows. A subject is
 * compared by its brightest pixel -- the window, the suit -- and a backdrop by
 * its median, which ignores anything bright that happens to be passing through.
 *
 * `readPixels` must run in the same tick as `render()`, before the compositor
 * takes the frame -- so the game calls this immediately after rendering, never
 * from a timer.
 */
import * as THREE from 'three';

const REC709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const PATCH = 26;           // device pixels sampled per sample, square
const SKY_CLEARANCE = 3;    // units above a roof, for the backdrop sample

/**
 * Luminance statistics over a square patch.
 *
 * Three numbers, because on a facade they answer three different questions.
 * `max` is the brightest lit window. `median` sits in the window reveals, which
 * are deliberately near-black, so it is useless as a reading of the wall. `p75`
 * is the wall itself -- the brighter half of the patch, above the reveals and
 * below the lit glass. Reading the median as "the wall" reported 1/255 for a
 * facade that was merely dark, which sent the first round of tuning at the
 * wrong problem.
 */
function samplePatch(renderer, cx, cy) {
  const gl = renderer.getContext();
  const half = PATCH >> 1;
  const px = new Uint8Array(PATCH * PATCH * 4);
  gl.readPixels(cx - half, cy - half, PATCH, PATCH, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const lums = [];
  for (let i = 0; i < px.length; i += 4) lums.push(REC709(px[i], px[i + 1], px[i + 2]));
  lums.sort((a, b) => a - b);
  return {
    max: lums[lums.length - 1],
    median: lums[lums.length >> 1],
    p75: lums[Math.floor(lums.length * 0.75)],
  };
}

/** World point -> device pixel, with readPixels' bottom-left origin. */
function screenPixel(renderer, camera, v3) {
  const size = renderer.getSize(new THREE.Vector2());
  const dpr = renderer.getPixelRatio();
  const p = v3.clone().project(camera);
  const half = PATCH >> 1;
  const x = Math.round(((p.x + 1) / 2) * size.x * dpr);
  const y = Math.round(((p.y + 1) / 2) * size.y * dpr);
  return {
    x, y,
    // The whole patch has to be inside the buffer or readPixels returns zeroes
    // for the part that is not, which reads as a very dark background.
    onScreen: x > half && y > half
      && x < size.x * dpr - half && y < size.y * dpr - half,
    scale: (size.y * dpr) / 100,
  };
}

/**
 * Compare the player against whatever is directly behind him.
 *
 * This is the measurement that actually matters in a game: a character the eye
 * cannot pick out of the background is unplayable long before it is ugly, and
 * it is the single easiest thing to get wrong while looking at a figure you
 * already know the position of.
 */
export function probePlayer(renderer, camera, playerRoot) {
  const at = screenPixel(renderer, camera, playerRoot.position);
  if (!at.onScreen) return { reason: 'player not clear of the screen edge' };
  const body = samplePatch(renderer, at.x, at.y);
  const behind = samplePatch(renderer, at.x + Math.round(at.scale * 4), at.y);
  return { subject: body.max, backdrop: behind.median, gap: body.max - behind.median };
}

/**
 * Compare the brightest lit window on a building against the backdrop just
 * above its roofline.
 *
 * Tries every anchorable building rather than just the first, and says why it
 * gave up when none works -- a probe that returns null and prints nothing is
 * indistinguishable from a key that never registered.
 */
export function probeContrast(renderer, camera, city) {
  const face = new THREE.Vector3();
  const sky = new THREE.Vector3();

  // Tallest first. Sampling the *centre* of an arbitrary massing part -- which
  // is what this did at first -- lands on whatever building happens to be in
  // front of it, and duly reported a contrast of 7 for a city full of lit
  // windows. The upper storeys of the tallest thing in shot are the only part
  // guaranteed to have sky behind it rather than more city.
  const tall = [...city.anchorTargets]
    .sort((a, b) => (b.position.y + b.scale.y / 2) - (a.position.y + a.scale.y / 2))
    .slice(0, 12);

  let tried = 0;
  for (const target of tall) {
    tried++;
    const roof = target.position.y + target.scale.y / 2;
    face.set(target.position.x, roof - target.scale.y * 0.18, target.position.z + target.scale.z / 2);
    sky.set(face.x, roof + SKY_CLEARANCE, face.z);

    const a = screenPixel(renderer, camera, face);
    const b = screenPixel(renderer, camera, sky);
    if (!a.onScreen || !b.onScreen) continue;

    const wall = samplePatch(renderer, a.x, a.y);
    const air = samplePatch(renderer, b.x, b.y);
    // Three numbers, not two: the brightest pixel in the patch is a lit window,
    // the median is the wall between them, and the third is the sky. A facade
    // needs to beat the sky *and* the windows need to beat the facade -- and it
    // is entirely possible to get one of those right and the other wrong.
    return {
      subject: wall.max,
      wall: wall.p75,
      backdrop: air.median,
      gap: wall.max - air.median,
    };
  }
  return { reason: `no rooftop with sky behind it in shot (of ${tried})` };
}
