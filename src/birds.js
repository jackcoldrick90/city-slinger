/**
 * Pigeons in flight: a small flock of flat, camera-facing billboards, each
 * wings up, level or down depending on where it is in its own flap cycle.
 *
 * See PIGEON's doc in world.js for why these are billboards rather than 3D
 * geometry (a wing this small either vanishes edge-on or needs real
 * aerodynamic rotation to avoid it), and why they live on a world lattice
 * with their own drift speed rather than one recentred on the camera -- the
 * cloud system got exactly that wrong first, and the fix is the same one
 * applied here from the start.
 */

import * as THREE from 'three';
import * as W from './world.js';
import { rngFor } from './rng.js';

const SEED = 'pigeon';

/**
 * A minimal flying-bird glyph: two wing strokes meeting at a shallow dip,
 * drawn in white so the material's own colour tints it. `wingY` sets how far
 * the wingtips sit above or below the body at this point in the flap.
 */
function birdTexture(wingY) {
  const px = W.PIGEON_TEX_PX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const c = px / 2;
  g.strokeStyle = '#fff';
  g.lineWidth = px * 0.09;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(c - px * 0.34, c + wingY);
  g.quadraticCurveTo(c - px * 0.1, c - px * 0.06, c, c);
  g.quadraticCurveTo(c + px * 0.1, c - px * 0.06, c + px * 0.34, c + wingY);
  g.stroke();
  return new THREE.CanvasTexture(cv);
}

export function createBirds(scene) {
  const px = W.PIGEON_TEX_PX;
  // Wings up (raised, negative -- canvas y runs down), level, and down.
  const frames = [-px * 0.2, px * 0.02, px * 0.16].map((wingY) => {
    const mat = new THREE.MeshBasicMaterial({
      map: birdTexture(wingY), color: W.PIGEON_SPRITE_COLOR,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, W.PIGEON_CAP);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const counts = [0, 0, 0];
  const stats = { flying: 0 };
  let t = 0;

  return {
    stats,

    update(camera, dt) {
      t += dt;
      counts[0] = 0;
      counts[1] = 0;
      counts[2] = 0;

      const camX = camera.position.x;
      const from = Math.floor((camX - W.PIGEON_REACH) / W.PIGEON_SPACING);
      const to = Math.ceil((camX + W.PIGEON_REACH) / W.PIGEON_SPACING);
      let n = 0;
      for (let i = from; i <= to && n < W.PIGEON_CAP; i++) {
        const rand = rngFor(SEED, 'fly', i);
        const jitter = (rand() - 0.5) * 2 * W.PIGEON_SPACING * W.PIGEON_JITTER;
        const speed = W.PIGEON_SPEED.min + rand() * (W.PIGEON_SPEED.max - W.PIGEON_SPEED.min);
        const dir = rand() < 0.5 ? -1 : 1;
        const bobRate = W.PIGEON_BOB_RATE * (0.8 + rand() * 0.4);
        const phase = rand() * Math.PI * 2;
        const y0 = W.PIGEON_Y.min + rand() * (W.PIGEON_Y.max - W.PIGEON_Y.min);
        const z = W.PIGEON_Z.min + rand() * (W.PIGEON_Z.max - W.PIGEON_Z.min);

        // World-x drift, never tied to the camera -- see the file doc.
        const x = i * W.PIGEON_SPACING + jitter + t * speed * dir;
        const y = y0 + Math.sin(t * bobRate + phase) * W.PIGEON_BOB;

        const flap = Math.sin(t * W.PIGEON_FLAP_RATE + phase);
        const frame = flap > 0.33 ? 0 : flap < -0.33 ? 2 : 1;

        pos.set(x, y, z);
        // Mirrored on the camera's own right axis to face the way it flies.
        scl.set(W.PIGEON_SIZE * dir, W.PIGEON_SIZE, 1);
        m4.compose(pos, camera.quaternion, scl);
        frames[frame].setMatrixAt(counts[frame], m4);
        counts[frame]++;
        n++;
      }
      for (let k = 0; k < frames.length; k++) {
        frames[k].count = counts[k];
        frames[k].instanceMatrix.needsUpdate = true;
      }
      stats.flying = n;
    },
  };
}
