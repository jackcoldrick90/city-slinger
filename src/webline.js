/**
 * The strand, the ones you have let go of, and the miss.
 *
 * ## Why it is a mesh and not a line
 *
 * WebGL ignores `LineBasicMaterial.linewidth` on essentially every desktop and
 * mobile driver -- it is permanently one device pixel, which at speed and
 * against a lit city is close to invisible. That is a rendering detail that
 * reads as "the web isn't drawing", so the strand gets real geometry.
 *
 * ## Why it is not a cylinder either
 *
 * It was one, and a cylinder is the wrong shape for a filament: straight,
 * uniform and dead. A strand is now a thin tapered tube swept along a sagging
 * curve, with a highlight travelling down its length. Silk catches light in
 * moving glints, and that is most of what sells it as thread rather than pipe.
 *
 * The tube is built **once** -- a fixed ring of vertices and a fixed index
 * buffer -- and every frame only rewrites positions and colours in place. No
 * geometry is rebuilt and nothing is allocated while the game is running, which
 * is what makes it affordable to have eight of them.
 *
 * ## Spent webs
 *
 * Letting go does not delete the strand. It stays anchored where you left it,
 * hangs from the building, and swings on a damped pendulum with a wind term
 * until it fades. Nothing tells this module that a web was released -- it
 * notices the anchor going away, which keeps the whole behaviour local to the
 * file that draws it.
 */

import * as THREE from 'three';
import * as W from './world.js';

/**
 * A tube of fixed topology whose spine can be moved anywhere each frame.
 *
 * Rings of WEB_SIDES vertices along WEB_SEGMENTS spans. The frame is built from
 * one arbitrary perpendicular rather than swept Frenet-style: a strand is
 * nearly straight and a full frame walk would only buy twisting nobody can see
 * at this width.
 */
function createStrand(scene, colour) {
  const rings = W.WEB_SEGMENTS + 1;
  const count = rings * W.WEB_SIDES;
  const position = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const index = [];
  for (let i = 0; i < W.WEB_SEGMENTS; i++) {
    for (let j = 0; j < W.WEB_SIDES; j++) {
      const a = i * W.WEB_SIDES + j;
      const b = i * W.WEB_SIDES + ((j + 1) % W.WEB_SIDES);
      index.push(a, b, a + W.WEB_SIDES, b, b + W.WEB_SIDES, a + W.WEB_SIDES);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.setIndex(index);

  const material = new THREE.MeshBasicMaterial({
    color: colour,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    fog: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  // Scratch, reused every frame.
  const dir = new THREE.Vector3();
  const n1 = new THREE.Vector3();
  const n2 = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const point = new THREE.Vector3();
  const UP = new THREE.Vector3(W.UP.x, W.UP.y, W.UP.z);
  const SIDE = new THREE.Vector3(W.UNIT.x, 0, 0);

  return {
    mesh,
    material,

    /**
     * Sweep the tube from `a` to `b`, sagging by `sag` (a fraction of length)
     * and with the shimmer at phase `t`.
     */
    shape(a, b, sag, t) {
      dir.subVectors(b, a);
      const len = dir.length();
      if (len < 1e-4) { mesh.visible = false; return; }
      dir.divideScalar(len);

      // Any perpendicular will do; only avoid the degenerate parallel case.
      n1.crossVectors(dir, Math.abs(dir.y) > 0.95 ? SIDE : UP).normalize();
      n2.crossVectors(dir, n1);

      // A quadratic Bezier whose control point is pulled down: the catenary a
      // hanging thread makes, near enough at this scale.
      mid.addVectors(a, b).multiplyScalar(0.5).addScaledVector(UP, -len * sag);

      const pos = geo.attributes.position.array;
      const col = geo.attributes.color.array;
      for (let i = 0; i <= W.WEB_SEGMENTS; i++) {
        const u = i / W.WEB_SEGMENTS;
        const inv = 1 - u;
        // Bezier point: (1-u)^2 a + 2(1-u)u mid + u^2 b
        point.set(
          inv * inv * a.x + 2 * inv * u * mid.x + u * u * b.x,
          inv * inv * a.y + 2 * inv * u * mid.y + u * u * b.y,
          inv * inv * a.z + 2 * inv * u * mid.z + u * u * b.z,
        );
        // Thicker at the anchor, finer at the hand.
        const r = W.WEB_RADIUS * (1 - W.WEB_TAPER * (1 - u));

        // The glint: a narrow band running the length of the strand, wrapping.
        const d = Math.abs(((u - t) % 1 + 1.5) % 1 - 0.5);
        const glint = W.WEB_SHIMMER.base
          + W.WEB_SHIMMER.gain * Math.exp(-(d * d) / (W.WEB_SHIMMER.width ** 2));

        for (let j = 0; j < W.WEB_SIDES; j++) {
          const ang = (j / W.WEB_SIDES) * Math.PI * 2;
          const k = (i * W.WEB_SIDES + j) * 3;
          const cos = Math.cos(ang) * r;
          const sin = Math.sin(ang) * r;
          pos[k] = point.x + n1.x * cos + n2.x * sin;
          pos[k + 1] = point.y + n1.y * cos + n2.y * sin;
          pos[k + 2] = point.z + n1.z * cos + n2.z * sin;
          // Facets away from the light read darker, so the tube has a round.
          const facet = 0.72 + 0.28 * Math.cos(ang);
          col[k] = col[k + 1] = col[k + 2] = glint * facet;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      mesh.visible = true;
    },

    hide() { mesh.visible = false; },
  };
}

export function createWebLine(scene) {
  const live = createStrand(scene, W.WEB_COLOR);

  /**
   * The strands you have let go of. A fixed ring, oldest reused first, so the
   * count never grows and nothing is allocated mid-run.
   */
  const spent = [];
  for (let i = 0; i < W.SPENT_WEBS; i++) {
    spent.push({
      strand: createStrand(scene, W.WEB_COLOR),
      anchor: new THREE.Vector3(),
      free: new THREE.Vector3(),
      len: 0,
      angle: 0,
      spin: 0,
      phase: 0,
      age: Infinity,
    });
  }
  let next = 0;

  const lastAnchor = new THREE.Vector3();
  const lastHand = new THREE.Vector3();
  let attached = false;
  let miss = null;
  let t = 0;

  /** Hang a released strand from where it was anchored. */
  function drop() {
    const s = spent[next];
    next = (next + 1) % spent.length;
    s.anchor.copy(lastAnchor);
    s.len = lastAnchor.distanceTo(lastHand) * W.SPENT_WIND.droop;
    // It starts swinging from wherever the hand was, so the release reads as
    // continuous rather than the strand snapping to vertical.
    s.angle = Math.atan2(lastHand.x - lastAnchor.x, -(lastHand.y - lastAnchor.y));
    s.spin = 0;
    s.phase = Math.random() * Math.PI * 2;
    s.age = 0;
  }

  return {
    /** Show a web that failed to find anything, so the click is not silent. */
    showMiss(from, towards, now) {
      miss = {
        from: from.clone(),
        to: from.clone().addScaledVector(towards.clone().normalize(), W.MISS_LEN),
        started: now,
      };
    },

    /**
     * @param hand    world position of the hand
     * @param anchor  world position of the anchor, or null
     * @param since   ms since the web was fired, for the thwip travel
     * @param taut    whether the rope is loaded; a slack one sags further
     */
    update(hand, anchor, since, now, dt, taut) {
      t += dt;

      // Noticing the release here, rather than being told, keeps the whole
      // spent-web behaviour inside the file that draws it.
      if (attached && (!anchor || lastAnchor.distanceToSquared(anchor) > 1e-6)) drop();
      attached = !!anchor;
      if (anchor) {
        lastAnchor.copy(anchor);
        lastHand.copy(hand);
      }

      // --- the strands you have let go of --------------------------------
      for (const s of spent) {
        if (s.age === Infinity) continue;
        s.age += dt;
        if (s.age > W.SPENT_LIFE + W.SPENT_FADE) { s.age = Infinity; s.strand.hide(); continue; }

        // A damped pendulum with a slow gust forcing it. Nothing more is
        // needed: a thread has almost no mass and reads entirely as sway.
        const gust = Math.sin(t / W.SPENT_WIND.period + s.phase)
          * Math.cos(t * 0.37 + s.phase * 1.7) * W.SPENT_WIND.gust;
        s.spin += (-Math.sin(s.angle) * W.SPENT_WIND.gravity + gust) * dt;
        s.spin -= s.spin * W.SPENT_WIND.damping * dt;
        s.angle += s.spin * dt;

        s.free.set(
          s.anchor.x + Math.sin(s.angle) * s.len,
          s.anchor.y - Math.cos(s.angle) * s.len,
          s.anchor.z,
        );
        const fade = Math.min(1, Math.max(0, (W.SPENT_LIFE + W.SPENT_FADE - s.age) / W.SPENT_FADE));
        s.strand.material.opacity = fade;
        s.strand.shape(s.anchor, s.free, W.WEB_SAG_SLACK, (t * W.WEB_SHIMMER.speed * 0.4) % 1);
      }

      // --- the live strand -------------------------------------------------
      if (anchor) {
        miss = null;
        // It shoots out rather than appearing: a hard cut at 40 units long
        // reads as a glitch.
        const travel = Math.min(1, since / W.THWIP_MS);
        const tip = lastHand.clone().lerp(anchor, travel);
        live.material.opacity = 1;
        live.shape(hand, tip, taut ? W.WEB_SAG_TAUT : W.WEB_SAG_SLACK,
          (t * W.WEB_SHIMMER.speed) % 1);
        return;
      }
      if (miss) {
        const age = (now - miss.started) / W.MISS_MS;
        if (age >= 1) { miss = null; live.hide(); return; }
        const tip = miss.from.clone().lerp(miss.to, Math.min(1, age * 2));
        live.material.opacity = 1 - age;
        live.shape(hand, tip, W.WEB_SAG_SLACK, (t * W.WEB_SHIMMER.speed) % 1);
        return;
      }
      live.hide();
    },

    get spentCount() { return spent.filter((s) => s.age !== Infinity).length; },
  };
}
