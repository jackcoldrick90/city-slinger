/**
 * Drones: hostile obstacles flying in against the player's own direction of
 * travel. Touch one and the run ends, the same as hitting the street.
 *
 * They live on a world lattice with their own drift speed, exactly like the
 * clouds and the flying pigeons -- a slot's position depends on world x and
 * elapsed time only, never on the camera. See CLOUD_SPACING's note in
 * world.js for why that matters: recentring on the camera would cancel the
 * camera's own motion out of a drone's position, and it would close on the
 * player at a speed that had nothing to do with the number this file sets.
 *
 * The collision check happens in the same pass that positions each drone,
 * not as a second lookup -- there is exactly one place that computes where a
 * drone is this frame, and the hit test reads it there rather than
 * re-deriving it and risking the two disagreeing.
 *
 * Each also carries a billboarded warning halo, the same technique the
 * pickups use: a solid shape a couple of units across is exactly the size
 * that gets lost against open air, and a threat that cannot be seen coming
 * is not a fair one.
 */

import * as THREE from 'three';
import * as W from './world.js';
import { buildPropGeometries } from './props.js';
import { rngFor } from './rng.js';

const SEED = 'enemy';

/** A soft round glow, the same shape the pickups' halos use. */
function haloTexture() {
  const px = W.DRONE_HALO_TEX_PX;
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

export function createEnemies(scene) {
  const geos = buildPropGeometries();

  const bodyMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.5, metalness: 0.4,
  });
  const body = new THREE.InstancedMesh(geos.drone.geo, bodyMat, W.ENEMY_CAP);
  body.frustumCulled = false;
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  body.count = 0;
  body.castShadow = true;
  scene.add(body);

  // The warning light: brightness lives in the colour itself, the same
  // strobe trick the emergency-vehicle beacons use, because an InstancedMesh
  // has one emissiveIntensity for the whole batch but per-instance colour is
  // free.
  const lightMat = new THREE.MeshBasicMaterial({ color: W.DRONE_LIGHT_COLOR });
  const light = new THREE.InstancedMesh(geos.droneLight.geo, lightMat, W.ENEMY_CAP);
  light.frustumCulled = false;
  light.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  light.count = 0;
  scene.add(light);

  const haloMat = new THREE.MeshBasicMaterial({
    map: haloTexture(), color: W.DRONE_LIGHT_COLOR, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    opacity: W.DRONE_HALO_OPACITY,
  });
  const halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), haloMat, W.ENEMY_CAP);
  halo.frustumCulled = false;
  halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  halo.count = 0;
  scene.add(halo);

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3(W.UNIT.x, W.UNIT.y, W.UNIT.z);
  const haloScl = new THREE.Vector3();
  const yAxis = new THREE.Vector3(W.UP.x, W.UP.y, W.UP.z);
  const tint = new THREE.Color();

  const stats = { flying: 0, tier: 0 };
  let t = 0;

  return {
    stats,

    /** @returns true if a drone is touching (playerX, playerY) this frame */
    update(camera, playerX, playerY, dt) {
      t += dt;
      haloMat.opacity = W.DRONE_HALO_OPACITY
        + Math.sin(t * W.DRONE_HALO_PULSE.rate) * W.DRONE_HALO_PULSE.amount;

      const camX = camera.position.x;
      const from = Math.floor((camX - W.ENEMY_REACH) / W.ENEMY_SPACING);
      const to = Math.ceil((camX + W.ENEMY_REACH) / W.ENEMY_SPACING);
      stats.tier = Math.max(0, Math.min(W.ENEMY_DIFFICULTY_MAX,
        Math.floor(camX / W.ENEMY_DIFFICULTY_STEP)));

      let n = 0;
      let hit = false;
      for (let i = from; i <= to && n < W.ENEMY_CAP; i++) {
        // Tier comes from the slot's own world x, not from the run's score --
        // see ENEMY_DIFFICULTY_STEP's note in world.js.
        const tier = Math.max(0, Math.min(W.ENEMY_DIFFICULTY_MAX,
          Math.floor((i * W.ENEMY_SPACING) / W.ENEMY_DIFFICULTY_STEP)));
        const fill = Math.min(W.ENEMY_FILL_MAX, W.ENEMY_FILL + tier * W.ENEMY_FILL_PER_TIER);

        const rand = rngFor(SEED, 'drone', i);
        if (rand() > fill) continue;

        const jitter = (rand() - 0.5) * 2 * W.ENEMY_SPACING * W.ENEMY_JITTER;
        const speed = (W.ENEMY_SPEED.min + rand() * (W.ENEMY_SPEED.max - W.ENEMY_SPEED.min))
          * (1 + tier * W.ENEMY_SPEED_PER_TIER);
        const y0 = W.ENEMY_Y.min + rand() * (W.ENEMY_Y.max - W.ENEMY_Y.min);
        const phase = rand() * Math.PI * 2;
        // A second wobble, at its own frequency and phase, with an amplitude
        // that only exists past tier 0 -- one smooth sine reads as a glide,
        // two unrelated ones reads as a flight path you cannot predict.
        const erraticRate = W.ENEMY_ERRATIC_RATE.min
          + rand() * (W.ENEMY_ERRATIC_RATE.max - W.ENEMY_ERRATIC_RATE.min);
        const erraticPhase = rand() * Math.PI * 2;
        const erraticAmp = tier * W.ENEMY_ERRATIC_PER_TIER;

        // World-x drift against the direction a run travels, never tied to
        // the camera -- see the file doc.
        const x = i * W.ENEMY_SPACING + jitter - t * speed;
        const y = y0
          + Math.sin(t * W.ENEMY_BOB_RATE + phase) * W.ENEMY_BOB
          + Math.sin(t * erraticRate + erraticPhase) * erraticAmp;

        if (Math.hypot(playerX - x, playerY - y) < W.ENEMY_HIT_RADIUS) hit = true;

        pos.set(x, y, W.PLAYER_Z);
        quat.setFromAxisAngle(yAxis, phase);
        m4.compose(pos, quat, scl);
        body.setMatrixAt(n, m4);

        const lightY = y - W.DRONE.bodyH * 0.5 - W.DRONE.lightDrop;
        pos.set(x, lightY, W.PLAYER_Z);
        m4.compose(pos, quat, scl);
        light.setMatrixAt(n, m4);
        const glow = W.DRONE_LIGHT_DIM
          + (1 - W.DRONE_LIGHT_DIM) * (0.5 + 0.5 * Math.sin(t * W.DRONE_LIGHT_RATE + phase));
        tint.setScalar(glow);
        light.setColorAt(n, tint);

        pos.set(x, lightY, W.PLAYER_Z);
        haloScl.set(W.DRONE_HALO_SIZE, W.DRONE_HALO_SIZE, 1);
        m4.compose(pos, camera.quaternion, haloScl);
        halo.setMatrixAt(n, m4);

        n++;
      }
      body.count = n;
      body.instanceMatrix.needsUpdate = true;
      light.count = n;
      light.instanceMatrix.needsUpdate = true;
      if (light.instanceColor) light.instanceColor.needsUpdate = true;
      halo.count = n;
      halo.instanceMatrix.needsUpdate = true;
      stats.flying = n;
      return hit;
    },
  };
}
