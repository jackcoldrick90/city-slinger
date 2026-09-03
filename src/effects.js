/**
 * Three short, triggered effects: a flash where a web catches, a burst of
 * dust where a run ends, and a streak trailing the player once he is moving
 * fast enough for it to read as speed.
 *
 * All three share one shape, the same one `webline.js` uses for spent webs: a
 * fixed ring-buffer pool, sized generously at startup and never reallocated.
 * Triggering an effect means overwriting whichever slot is oldest rather than
 * searching for a free one, and a slot with no live effect in it is simply
 * skipped when the instanced mesh is rebuilt each frame. Nothing here
 * allocates after `createEffects` returns.
 */

import * as THREE from 'three';
import * as W from './world.js';
import { rngFor } from './rng.js';

const SEED = 'impact';

/** A tight, bright core -- the flash reads as an event, not a glow. */
function flashTexture() {
  const px = W.FLASH_TEX_PX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const c = px / 2;
  const glow = g.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, px, px);
  return new THREE.CanvasTexture(cv);
}

/** A soft round puff, the same shape steam uses. */
function dustTexture() {
  const px = W.DUST_TEX_PX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const c = px / 2;
  const glow = g.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(255,255,255,0.85)');
  glow.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, px, px);
  return new THREE.CanvasTexture(cv);
}

/**
 * A horizontal fade: opaque at the left edge, gone by the right. The trail
 * quad's geometry is translated so its pivot sits at that opaque edge, which
 * is what lets the pivot stay pinned to the player while the transparent end
 * trails away behind him.
 */
function trailTexture() {
  const w = W.TRAIL_TEX_PX;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = 4;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, cv.height);
  return new THREE.CanvasTexture(cv);
}

export function createEffects(scene) {
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const tint = new THREE.Color();
  const zAxis = new THREE.Vector3(W.AXIS_Z.x, W.AXIS_Z.y, W.AXIS_Z.z);

  // ---------------------------------------------------------- anchor flash
  const flashMat = new THREE.MeshBasicMaterial({
    map: flashTexture(),
    color: W.FLASH_COLOR,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const flashMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1), flashMat, W.FLASH_POOL,
  );
  flashMesh.frustumCulled = false;
  flashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  flashMesh.count = 0;
  scene.add(flashMesh);
  const flashes = [];
  for (let i = 0; i < W.FLASH_POOL; i++) flashes.push({ age: Infinity, x: 0, y: 0, z: 0 });
  let flashNext = 0;

  // ---------------------------------------------------------- landing dust
  const dustMat = new THREE.MeshBasicMaterial({
    map: dustTexture(),
    color: W.DUST_BURST_COLOR,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const dustMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1), dustMat, W.DUST_BURST_POOL,
  );
  dustMesh.frustumCulled = false;
  dustMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dustMesh.count = 0;
  scene.add(dustMesh);
  const dustRand = rngFor(SEED, 'dust');
  const dustParticles = [];
  for (let i = 0; i < W.DUST_BURST_POOL; i++) {
    dustParticles.push({ age: Infinity, x: 0, y: 0, z: 0, vx: 0, vz: 0, size: 1 });
  }
  let dustNext = 0;

  // ---------------------------------------------------------- speed trail
  // Geometry translated so the pivot sits at the quad's opaque edge -- the
  // same pre-translated-pivot trick `props.js` uses for limbs, so the mesh's
  // own position, not an offset, is what stays pinned to the player.
  const trailGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
  const trailMat = new THREE.MeshBasicMaterial({
    map: trailTexture(),
    color: W.TRAIL_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  trail.matrixAutoUpdate = false;
  scene.add(trail);

  const stats = { flashes: 0, dust: 0 };

  return {
    stats,

    /** A web has just caught. */
    attach(point) {
      const f = flashes[flashNext];
      flashNext = (flashNext + 1) % flashes.length;
      f.age = 0;
      f.x = point.x;
      f.y = point.y;
      f.z = point.z;
    },

    /** The run has just ended at (x, y, z). */
    land(x, y, z) {
      for (let i = 0; i < W.DUST_BURST_COUNT; i++) {
        const p = dustParticles[dustNext];
        dustNext = (dustNext + 1) % dustParticles.length;
        const a = dustRand() * Math.PI * 2;
        const speed = W.DUST_BURST_SPEED.min
          + dustRand() * (W.DUST_BURST_SPEED.max - W.DUST_BURST_SPEED.min);
        p.age = 0;
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = Math.cos(a) * speed;
        p.vz = Math.sin(a) * speed;
        p.size = 0.7 + dustRand() * 0.6;
      }
    },

    update(camera, state, dt) {
      quat.copy(camera.quaternion);

      let fn = 0;
      for (const f of flashes) {
        if (f.age === Infinity) continue;
        f.age += dt;
        if (f.age > W.FLASH_LIFE) { f.age = Infinity; continue; }
        const t = f.age / W.FLASH_LIFE;
        const size = W.FLASH_SIZE.start + (W.FLASH_SIZE.end - W.FLASH_SIZE.start) * t;
        pos.set(f.x, f.y, f.z);
        scl.set(size, size, 1);
        m4.compose(pos, quat, scl);
        flashMesh.setMatrixAt(fn, m4);
        tint.setScalar(1 - t);
        flashMesh.setColorAt(fn, tint);
        fn++;
      }
      flashMesh.count = fn;
      flashMesh.instanceMatrix.needsUpdate = true;
      if (flashMesh.instanceColor) flashMesh.instanceColor.needsUpdate = true;
      stats.flashes = fn;

      let dn = 0;
      for (const p of dustParticles) {
        if (p.age === Infinity) continue;
        p.age += dt;
        if (p.age > W.DUST_BURST_LIFE) { p.age = Infinity; continue; }
        const t = p.age / W.DUST_BURST_LIFE;
        pos.set(p.x + p.vx * t, p.y + W.DUST_BURST_RISE * t, p.z + p.vz * t);
        const size = (W.DUST_BURST_SIZE.start
          + (W.DUST_BURST_SIZE.end - W.DUST_BURST_SIZE.start) * t) * p.size;
        scl.set(size, size, 1);
        m4.compose(pos, quat, scl);
        dustMesh.setMatrixAt(dn, m4);
        tint.setScalar((1 - t) ** 1.3);
        dustMesh.setColorAt(dn, tint);
        dn++;
      }
      dustMesh.count = dn;
      dustMesh.instanceMatrix.needsUpdate = true;
      if (dustMesh.instanceColor) dustMesh.instanceColor.needsUpdate = true;
      stats.dust = dn;

      // The trail shares its threshold with the ambient speed streaks: both
      // exist to answer "is this fast?" and should agree on the answer.
      const speed = Math.hypot(state.vx, state.vy);
      const strength = Math.min(1, Math.max(0,
        (speed - W.STREAK_MIN_SPEED) / (W.STREAK_AT_SPEED - W.STREAK_MIN_SPEED)));
      trailMat.opacity = W.TRAIL_OPACITY * strength;
      if (strength > 0.001) {
        const len = W.TRAIL_LEN.min + (W.TRAIL_LEN.max - W.TRAIL_LEN.min) * strength;
        const angle = Math.atan2(state.vy, state.vx);
        // The pivot (the geometry's opaque edge) stays at the player; the
        // transparent far edge is what the rotation and scale carry away
        // from him, backward along wherever he is actually heading.
        quat.setFromAxisAngle(zAxis, angle + Math.PI);
        pos.set(state.x, state.y, W.PLAYER_Z);
        scl.set(len, W.TRAIL_WIDTH, 1);
        m4.compose(pos, quat, scl);
        trail.matrix.copy(m4);
      }
    },
  };
}
