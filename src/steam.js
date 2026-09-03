/**
 * Steam rising through the road.
 *
 * The single most New York thing that can happen at street level, and it costs
 * one draw call: a plume of soft billboarded quads that climb from a vent,
 * spread, and fade.
 *
 * Vents sit on a world grid rather than following the camera, so a given
 * stretch of road always smokes and the plumes stay put as you swing past them.
 * The pool of quads is fixed and recycled -- a puff that reaches the end of its
 * life is reset to the bottom of whichever vent is nearest now, which is what
 * lets five plumes be drawn from one buffer that never grows.
 *
 * The quads are billboarded by copying the camera's rotation. That works here
 * because this camera never rolls; a general solution would need a per-particle
 * lookAt and would cost far more than the effect is worth.
 */

import * as THREE from 'three';
import * as W from './world.js';
import { rngFor } from './rng.js';

const SEED = 'steam';

/** A soft round puff: opaque-ish core, nothing at all at the edge. */
function puffTexture() {
  const px = W.STEAM.tex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const c = px / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(240,244,255,0.30)');
  grad.addColorStop(1, 'rgba(225,232,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, px, px);
  return new THREE.CanvasTexture(cv);
}

export function createSteam(scene) {
  const count = W.STEAM.vents * W.STEAM.perVent;
  /**
   * Additive, because the fade has to live in the *colour*.
   *
   * An InstancedMesh has one opacity for the whole batch, so a puff cannot dim
   * on its own through alpha -- but `setColorAt` is per-instance. Under normal
   * blending, multiplying a puff's colour toward black turns it into a dark
   * blob against anything lit; under additive, black is exactly invisible,
   * which is the behaviour a fade needs.
   */
  const material = new THREE.MeshBasicMaterial({
    map: puffTexture(),
    transparent: true,
    opacity: W.STEAM.opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.renderOrder = 2;
  scene.add(mesh);

  // Each puff carries only its own age and wander; the vent it belongs to is
  // recomputed on reset, which is how the plumes migrate with the player.
  const rand = rngFor(SEED, 'puffs');
  const puffs = [];
  for (let i = 0; i < count; i++) {
    puffs.push({
      vent: (i / W.STEAM.perVent) | 0,
      age: rand() * W.STEAM.life,
      drift: (rand() - 0.5) * W.STEAM.drift,
      lean: (rand() - 0.5) * W.STEAM.drift * 0.4,
      spin: rand() * Math.PI * 2,
      size: 0.7 + rand() * 0.6,
    });
  }

  const vents = [];
  for (let v = 0; v < W.STEAM.vents; v++) vents.push(new THREE.Vector3());

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const tint = new THREE.Color();
  const stats = { puffs: 0 };

  return {
    stats,

    update(camX, camera, dt) {
      // Vents on a world lattice around the camera, offset to one side of the
      // road so a plume is not always dead centre of the avenue.
      const base = Math.round(camX / W.STEAM.every);
      const half = (W.STEAM.vents - 1) / 2;
      for (let v = 0; v < W.STEAM.vents; v++) {
        const index = base + v - half;
        const jitter = rngFor(SEED, 'vent', index);
        vents[v].set(
          index * W.STEAM.every + (jitter() - 0.5) * W.STEAM.every * 0.4,
          W.STREET_Y,
          W.PLAYER_Z + (jitter() - 0.5) * W.STREET_HALF_W * 1.2,
        );
      }

      quat.copy(camera.quaternion);
      let n = 0;
      for (const p of puffs) {
        p.age += dt;
        if (p.age > W.STEAM.life) p.age -= W.STEAM.life;
        const t = p.age / W.STEAM.life;

        const vent = vents[p.vent];
        // Rises fast at first and slows as it cools and spreads.
        const climb = Math.sqrt(t) * W.STEAM.rise;
        pos.set(
          vent.x + p.drift * t + p.lean * t * t * W.STEAM.spread,
          vent.y + climb,
          vent.z + p.lean * t,
        );
        const size = (W.STEAM.size.min
          + (W.STEAM.size.max - W.STEAM.size.min) * t) * p.size;
        // In at the vent, out at the top: a puff that pops into existence at
        // full opacity reads as a bug rather than as steam.
        const fade = Math.min(1, t * 6) * (1 - t) ** 1.4;
        scl.set(size, size, 1);
        m4.compose(pos, quat, scl);
        mesh.setMatrixAt(n, m4);
        tint.setScalar(fade);
        mesh.setColorAt(n, tint);
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      stats.puffs = n;
    },

    /** Steam reads best against a dark street; ease it back in daylight. */
    setNight(level) {
      material.opacity = W.STEAM.opacity * (0.45 + 0.55 * level);
    },
  };
}
