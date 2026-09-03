/**
 * Streaks in the air, so speed is something you can see.
 *
 * The near field is the only place motion is legible. Buildings a hundred units
 * away barely move across the frame however fast you are going, so the eye has
 * nothing to measure against and eighty units per second looks like fifteen.
 * A scatter of short streaks a few units from the camera fixes that on its own.
 *
 * They are static in the world and recycled around the camera, exactly like the
 * dust: that way the streaming comes from the camera genuinely moving past
 * them, rather than from an invented flow that would have to be tuned to agree
 * with the player's actual velocity and would drift the moment it did not.
 *
 * One instanced mesh, ninety instances, one draw call. Nothing allocates.
 */

import * as THREE from 'three';
import * as W from './world.js';
import { rngFor } from './rng.js';

const SEED = 'streaks';

export function createSpeedLines(scene) {
  const material = new THREE.MeshBasicMaterial({
    color: W.STREAK_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, W.STREAK_THICK, W.STREAK_THICK),
    material,
    W.STREAK_COUNT,
  );
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  scene.add(mesh);

  // Local offsets from the focus point, recycled rather than regenerated.
  const rand = rngFor(SEED, 'place');
  const local = [];
  for (let i = 0; i < W.STREAK_COUNT; i++) {
    local.push({
      x: (rand() - 0.5) * W.STREAK_BOX.w,
      y: (rand() - 0.5) * W.STREAK_BOX.h,
      z: (rand() - 0.5) * W.STREAK_BOX.d + W.STREAK_Z,
      scale: 0.5 + rand() * 0.9,
    });
  }

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, W.UNIT.z);
  let lastX = null;
  let lastY = null;
  const stats = { streaks: 0 };

  const wrap = (v, span) => ((v + span / 2) % span + span) % span - span / 2;

  return {
    stats,

    /**
     * @param focusX,focusY  where the camera is looking
     * @param vx,vy          the player's velocity, which sets length and angle
     */
    update(focusX, focusY, vx, vy) {
      const speed = Math.hypot(vx, vy);
      const strength = Math.min(1, Math.max(0,
        (speed - W.STREAK_MIN_SPEED) / (W.STREAK_AT_SPEED - W.STREAK_MIN_SPEED)));

      material.opacity = W.STREAK_OPACITY * strength;
      if (strength <= 0.001) {
        mesh.count = 0;
        stats.streaks = 0;
        lastX = focusX;
        lastY = focusY;
        return;
      }

      // Slide the local offsets by however far the camera moved, then wrap.
      // The streaks stay put in the world; the box around them does not.
      const dx = lastX === null ? 0 : focusX - lastX;
      const dy = lastY === null ? 0 : focusY - lastY;
      lastX = focusX;
      lastY = focusY;

      // Along the direction of travel, smeared: the faster you go the longer
      // each streak, which is the whole point of them.
      const angle = Math.atan2(vy, vx);
      quat.setFromAxisAngle(zAxis, angle);
      const len = W.STREAK_LEN.min
        + (W.STREAK_LEN.max - W.STREAK_LEN.min) * strength;

      for (let i = 0; i < W.STREAK_COUNT; i++) {
        const s = local[i];
        s.x = wrap(s.x - dx, W.STREAK_BOX.w);
        s.y = wrap(s.y - dy, W.STREAK_BOX.h);
        pos.set(focusX + s.x, focusY + s.y, s.z);
        scl.set(len * s.scale, 1, 1);
        m4.compose(pos, quat, scl);
        mesh.setMatrixAt(i, m4);
      }
      mesh.count = W.STREAK_COUNT;
      mesh.instanceMatrix.needsUpdate = true;
      stats.streaks = W.STREAK_COUNT;
    },
  };
}
