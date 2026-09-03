/**
 * Two collectibles: pizza slices, common and worth a point each, and web
 * fluid replenishers, rare and worth a full refill of the player's web.
 *
 * Both live on a world lattice exactly like the scatter planting in
 * `ground.js` -- a slot at `i * spacing` is hashed once for whether anything
 * is there and how high, walked over a window either side of the camera
 * every frame. The one thing that cannot come from that hash is whether a
 * given slot has already been collected *this run*: that is real, mutable
 * state, kept in a `Set` per collectible and cleared by `reset()` whenever a
 * run begins. See the note in `world.js` on why that is a deliberate,
 * bounded exception to this project's usual "nothing is stored" rule rather
 * than an oversight.
 *
 * Each also carries a billboarded additive halo, the same technique the sun
 * and moon use in `atmosphere.js`: a solid object a couple of units across
 * gets lost against a hundred metres of open air and a busy skyline, and a
 * glow bigger than the object is what actually makes it findable at a
 * distance, rather than making the object itself implausibly large.
 */

import * as THREE from 'three';
import * as W from './world.js';
import { buildPropGeometries } from './props.js';
import { rngFor } from './rng.js';

const SEED = 'pickup';

/** A soft round glow, the same shape the sun/moon/steam textures use. */
function haloTexture() {
  const px = W.PICKUP_HALO_TEX_PX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const c = px / 2;
  const glow = g.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(255,255,255,0.95)');
  glow.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, px, px);
  return new THREE.CanvasTexture(cv);
}

/** One collectible type: its own mesh, halo, pool and per-run collected set. */
function createKind(scene, geo, material, haloMat, opts) {
  const mesh = new THREE.InstancedMesh(geo, material, opts.pool);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.castShadow = true;
  scene.add(mesh);

  const halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), haloMat, opts.pool);
  halo.frustumCulled = false;
  halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  halo.count = 0;
  scene.add(halo);

  return { mesh, halo, opts, collected: new Set() };
}

export function createPickups(scene) {
  const geos = buildPropGeometries();
  const haloTex = haloTexture();

  // A little self-illumination on the pizza itself, so it does not go dark
  // and flat at night while its halo burns on regardless.
  const pizzaMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.6,
    emissive: W.PIZZA_COLOR, emissiveIntensity: W.PIZZA_GLOW,
  });
  const fuelMat = new THREE.MeshStandardMaterial({
    color: W.REPLENISHER_BODY,
    emissive: W.REPLENISHER_GLOW_COLOR,
    emissiveIntensity: W.REPLENISHER_GLOW,
  });
  const pizzaHaloMat = new THREE.MeshBasicMaterial({
    map: haloTex, color: W.PIZZA_COLOR, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, opacity: W.PIZZA_HALO.opacity,
  });
  const fuelHaloMat = new THREE.MeshBasicMaterial({
    map: haloTex, color: W.REPLENISHER_GLOW_COLOR, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, opacity: W.FUEL_HALO.opacity,
  });

  const pizza = createKind(scene, geos.pizza.geo, pizzaMat, pizzaHaloMat, {
    kind: 'pizza', spacing: W.PIZZA_SPACING, fill: W.PIZZA_FILL, jitter: W.PIZZA_JITTER,
    y: W.PIZZA_Y, radius: W.PIZZA_RADIUS, pool: W.PIZZA_POOL, halo: W.PIZZA_HALO,
  });
  const fuel = createKind(scene, geos.replenisher.geo, fuelMat, fuelHaloMat, {
    kind: 'fuel', spacing: W.FUEL_SPACING, fill: W.FUEL_FILL, jitter: W.FUEL_JITTER,
    y: W.FUEL_Y, radius: W.FUEL_RADIUS, pool: W.FUEL_POOL, halo: W.FUEL_HALO,
  });

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3(W.UNIT.x, W.UNIT.y, W.UNIT.z);
  const haloScl = new THREE.Vector3();
  const yAxis = new THREE.Vector3(W.UP.x, W.UP.y, W.UP.z);

  const stats = { pizzas: 0, fuel: 0 };
  let t = 0;

  /**
   * Walk one collectible's lattice: place what is visible and not yet
   * collected (plus its halo, billboarded to the camera), and eat anything
   * the player is within radius of.
   *
   * @returns how many were collected this call
   */
  function updateKind(k, camera, camX, playerX, playerY) {
    const from = Math.floor((camX - W.PICKUP_REACH) / k.opts.spacing);
    const to = Math.ceil((camX + W.PICKUP_REACH) / k.opts.spacing);
    let n = 0;
    let taken = 0;
    for (let i = from; i <= to && n < k.opts.pool; i++) {
      if (k.collected.has(i)) continue;
      const rand = rngFor(SEED, k.opts.kind, i);
      if (rand() > k.opts.fill) continue;

      const jitter = (rand() - 0.5) * 2 * k.opts.spacing * k.opts.jitter;
      const x = i * k.opts.spacing + jitter;
      const y = k.opts.y.min + rand() * (k.opts.y.max - k.opts.y.min);
      const phase = rand() * Math.PI * 2;

      if (Math.hypot(playerX - x, playerY - y) < k.opts.radius) {
        k.collected.add(i);
        taken++;
        continue;
      }

      const bob = Math.sin(t * W.PICKUP_BOB_RATE + phase) * W.PICKUP_BOB;
      pos.set(x, y + bob, W.PLAYER_Z);

      quat.setFromAxisAngle(yAxis, t * W.PICKUP_SPIN_RATE + phase);
      m4.compose(pos, quat, scl);
      k.mesh.setMatrixAt(n, m4);

      haloScl.set(k.opts.halo.size, k.opts.halo.size, 1);
      m4.compose(pos, camera.quaternion, haloScl);
      k.halo.setMatrixAt(n, m4);
      n++;
    }
    k.mesh.count = n;
    k.mesh.instanceMatrix.needsUpdate = true;
    k.halo.count = n;
    k.halo.instanceMatrix.needsUpdate = true;
    return taken;
  }

  return {
    stats,

    /** Clear collected state for a fresh run -- the field simply repopulates. */
    reset() {
      pizza.collected.clear();
      fuel.collected.clear();
    },

    /** @returns {{pizzas: number, fuel: number}} collected this call */
    update(camera, playerX, playerY, dt) {
      t += dt;
      fuelMat.emissiveIntensity = W.REPLENISHER_GLOW
        + Math.sin(t * W.REPLENISHER_PULSE.rate) * W.REPLENISHER_PULSE.amount;
      pizzaHaloMat.opacity = W.PIZZA_HALO.opacity
        + Math.sin(t * W.PIZZA_HALO.rate) * W.PIZZA_HALO.amount;
      fuelHaloMat.opacity = W.FUEL_HALO.opacity
        + Math.sin(t * W.FUEL_HALO.rate) * W.FUEL_HALO.amount;

      const camX = camera.position.x;
      const pizzas = updateKind(pizza, camera, camX, playerX, playerY);
      const fuelTaken = updateKind(fuel, camera, camX, playerX, playerY);
      stats.pizzas = pizza.mesh.count;
      stats.fuel = fuel.mesh.count;
      return { pizzas, fuel: fuelTaken };
    },
  };
}
