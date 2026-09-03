/**
 * The floor, and what grows on it.
 *
 * Until now there wasn't one. The avenue and the cross streets were slabs of
 * asphalt over nothing at all -- invisible from swinging height, and glaring
 * the moment you look down a cross avenue, where the road ran back three
 * hundred units and then the world stopped existing. Everything past the kerb
 * was the clear colour.
 *
 * Two parts fix it. A single textured plane gives the city a floor: not a grey
 * sheet but the patchwork a city actually is from above -- concrete lots, bare
 * dirt, and green. And a lattice of trees and shrubs stands things up on it, so
 * the floor has depth cues of its own rather than being a painted backdrop
 * lying flat.
 *
 * The plane follows the camera and its texture scrolls by the same amount, the
 * same trick the road uses: a finite piece of geometry that behaves like an
 * endless one because the surface never actually moves in world space.
 */

import * as THREE from 'three';
import * as W from './world.js';
import { buildPropGeometries } from './props.js';
import { rngFor } from './rng.js';

const SEED = 'ground';

/**
 * Concrete, dirt and green in patches.
 *
 * Every blob is drawn nine times -- at the tile and at its eight neighbours --
 * so a patch that runs off one edge arrives on the other and the tile seams
 * disappear. That costs nothing here (this runs once, at startup) and it is the
 * difference between a floor and a visible grid of squares, which at the
 * grazing angles this camera uses would be the first thing you noticed.
 */
function groundTexture() {
  const px = W.GROUND.tex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const rand = rngFor(SEED, 'floor');

  g.fillStyle = W.GROUND.concrete;
  g.fillRect(0, 0, px, px);

  /** One shape, painted at the tile and at all eight neighbours. */
  const wrapped = (draw) => {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        g.save();
        g.translate(ox * px, oy * px);
        draw();
        g.restore();
      }
    }
  };

  const blob = (x, y, r, fill) => wrapped(() => {
    g.fillStyle = fill;
    g.beginPath();
    // Ragged rather than round: a lot has corners, a park has a wandering edge.
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const rr = r * (0.62 + rngFor(SEED, 'edge', (x | 0), (y | 0), i)());
      const px2 = x + Math.cos(a) * rr;
      const py2 = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px2, py2); else g.lineTo(px2, py2);
    }
    g.closePath();
    g.fill();
  });

  // Green first and largest -- parks, yards, the strips between blocks.
  for (let i = 0; i < 14; i++) {
    blob(rand() * px, rand() * px, px * (0.05 + rand() * 0.11), W.GROUND.green);
  }
  for (let i = 0; i < 10; i++) {
    blob(rand() * px, rand() * px, px * (0.03 + rand() * 0.06), W.GROUND.dirt);
  }
  // Hard-edged lots and low roofs on top, so the whole thing is not organic.
  for (let i = 0; i < 26; i++) {
    wrapped(() => {
      const v = 0.13 + rand() * 0.12;
      g.fillStyle = `rgba(${(v * 255) | 0},${(v * 262) | 0},${(v * 290) | 0},0.75)`;
      g.fillRect(rand() * px, rand() * px, px * (0.04 + rand() * 0.12),
        px * (0.04 + rand() * 0.1));
    });
  }
  // Grain, so it does not read as flat vector art at close range.
  for (let i = 0; i < 2200; i++) {
    const v = 0.08 + rand() * 0.1;
    g.fillStyle = `rgba(${(v * 255) | 0},${(v * 255) | 0},${(v * 268) | 0},0.45)`;
    g.fillRect(rand() * px, rand() * px, 2, 2);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createGround(scene) {
  const geos = buildPropGeometries();

  // ------------------------------------------------------------ the surface
  const tex = groundTexture();
  const tile = W.GROUND.w / W.GROUND.repeat;      // world units per tile
  tex.repeat.set(W.GROUND.repeat, W.GROUND.d / tile);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(W.GROUND.w, W.GROUND.d),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0 }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, W.STREET_Y - W.GROUND.drop, W.PLAYER_Z - W.GROUND.d / 2 + W.SCATTER.zNear);
  plane.receiveShadow = true;
  scene.add(plane);

  // ------------------------------------------------------------ the planting
  //
  // Same material and the same vertex-coloured trunk/leaf split as the street
  // trees, so this is two more draw calls rather than a second tree system.
  const leafMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.94, metalness: 0,
  });
  const growth = [
    new THREE.InstancedMesh(geos.treeFull.geo, leafMat, W.SCATTER.cap),
    new THREE.InstancedMesh(geos.treeYoung.geo, leafMat, W.SCATTER.cap),
    new THREE.InstancedMesh(geos.shrub.geo, leafMat, W.SCATTER.cap),
  ];
  for (const m of growth) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(W.UP.x, W.UP.y, W.UP.z);
  const tint = new THREE.Color();

  const stats = { trees: 0, shrubs: 0 };
  const counts = [0, 0, 0];
  let lastCell = null;

  /**
   * Is this point clear of everything that is already on the ground?
   *
   * Four rules, and between them they decide the whole look: nothing on the
   * main avenue, nothing on a cross avenue, nothing inside a building lane's
   * depth band, and nothing on a back street. What is left is the strips
   * between the rows of buildings -- which is what you see when you look down a
   * cross street, and is the only place greenery could plausibly be.
   */
  function clear(x, z) {
    const road = W.STREET_HALF_W + W.SIDEWALK_W + W.SCATTER.clear;
    if (Math.abs(z - W.PLAYER_Z) < road) return false;

    const cross = W.CROSS_WIDTH / 2 + W.SIDEWALK_W + W.SCATTER.clear;
    if (Math.abs(x - Math.round(x / W.CROSS_SPACING) * W.CROSS_SPACING) < cross) return false;

    for (const lane of W.LANES) {
      if (Math.abs(z - lane.z) < lane.depth / 2 + W.SCATTER.laneMargin) return false;
    }

    // The back streets run through exactly the gaps this scatter fills, so
    // without this rule every one of them would come up planted.
    for (const st of W.BACK_STREETS) {
      // Road plus its kerbs, so nothing comes up through the pavement either.
      const half = st.w * (1 + W.BACK_KERB.frac) / 2;
      if (Math.abs(z - st.z) < half + W.SCATTER.clear) return false;
    }
    return true;
  }

  return {
    stats,

    /**
     * The ground is rebuilt only when the camera crosses a lattice cell, not
     * every frame: the placement is hashed from world position, so between
     * cells the answer cannot have changed.
     */
    update(camX) {
      plane.position.x = camX;
      tex.offset.x = camX / tile;

      const cell = Math.round(camX / W.SCATTER.pitch);
      if (cell === lastCell) return;
      lastCell = cell;

      counts[0] = 0;
      counts[1] = 0;
      counts[2] = 0;

      const from = Math.floor((camX - W.SCATTER.reachX) / W.SCATTER.pitch);
      const to = Math.ceil((camX + W.SCATTER.reachX) / W.SCATTER.pitch);
      for (let i = from; i <= to; i++) {
        for (let k = 0; ; k++) {
          const z = W.SCATTER.zNear - k * W.SCATTER.pitch;
          if (z < W.SCATTER.zFar) break;

          const rand = rngFor(SEED, 'plant', i, k);
          const roll = rand();
          const isTree = roll < W.SCATTER.treeChance;
          const isShrub = !isTree
            && roll < W.SCATTER.treeChance + W.SCATTER.shrubChance;
          if (!isTree && !isShrub) continue;

          const jx = (rand() - 0.5) * W.SCATTER.pitch * W.SCATTER.jitter * 2;
          const jz = (rand() - 0.5) * W.SCATTER.pitch * W.SCATTER.jitter * 2;
          const x = i * W.SCATTER.pitch + jx;
          const zz = z + jz;
          if (!clear(x, zz)) continue;

          const slot = isShrub ? 2 : (rand() < 0.55 ? 0 : 1);
          if (counts[slot] >= W.SCATTER.cap) continue;

          const s = isShrub
            ? W.SHRUB.scaleMin + rand() * (W.SHRUB.scaleMax - W.SHRUB.scaleMin)
            : W.TREE.scaleMin + rand() * (W.TREE.scaleMax - W.TREE.scaleMin);
          scale.set(s, s * (0.85 + rand() * 0.4), s);
          m4.compose(pos.set(x, W.STREET_Y - W.GROUND.drop, zz),
            quat.setFromAxisAngle(yAxis, rand() * Math.PI * 2), scale);
          growth[slot].setMatrixAt(counts[slot], m4);
          // A multiplier, not a colour: three multiplies the instance tint into
          // the geometry's own vertex colours, so anything but a near-white
          // value here would tint the trunks along with the leaves. Variation
          // lives in brightness, the same as the street trees.
          const v = 0.66 + rand() * 0.52;
          tint.setRGB(v * (0.88 + rand() * 0.16), v, v * (0.8 + rand() * 0.2));
          growth[slot].setColorAt(counts[slot], tint);
          counts[slot]++;
        }
      }

      for (let k = 0; k < growth.length; k++) {
        growth[k].count = counts[k];
        growth[k].instanceMatrix.needsUpdate = true;
        if (growth[k].instanceColor) growth[k].instanceColor.needsUpdate = true;
      }
      stats.trees = counts[0] + counts[1];
      stats.shrubs = counts[2];
    },
  };
}
