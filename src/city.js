/**
 * An endless Manhattan, drawn in about two dozen draw calls.
 *
 * ## How it is put together
 *
 * `buildings.js` says what shape every building is, as a pure function of
 * (lane, block index). Nothing about a block is stored: height, type, window
 * variant, roof clutter and even whether the slot is occupied are all hashed
 * out of its coordinates, so the city is identical in both directions forever
 * and `roofAt()` can answer for a building that has no geometry allocated to
 * it. This file's only job is turning those descriptions into instances.
 *
 * ## The instancing problem, and the fix
 *
 * Every building needs its own window grid -- a 78-unit tower wants 24 floors
 * and a walk-up wants 6 -- and UV repeat is a property of a *texture*, not of
 * an instance. That is why the previous version needed one Mesh and one cloned
 * texture per building, and why it could never have more than a hundred of
 * them.
 *
 * So each instance carries its own UV scale and offset in an
 * `InstancedBufferAttribute`, and a small `onBeforeCompile` patch applies them
 * to the map, emissive and normal UVs in the vertex shader. One draw call then
 * serves a hundred buildings that share a texture but share nothing else --
 * different floor counts, different tints, different window patterns, because
 * the offset lands them on a different part of the sheet.
 *
 * The same patch carries two other per-instance values: a colour tint (depth
 * cueing, on top of fog) and an emissive multiplier (distant windows are dimmer
 * as well as hazier), plus a height-based darkening that stands in for ambient
 * occlusion down at street level.
 *
 * ## Colliders
 *
 * Webs do not raycast against any of this. `anchorTargets` is a pool of
 * invisible boxes that mirror the massing of the anchor lanes and are never
 * added to the scene -- they render nothing and their matrices are updated by
 * hand. That is what let the visuals change this much without touching a line
 * of the swing, the aim assist or the camera.
 *
 * ## When work happens
 *
 * Instance buffers are rewritten only when the visible block range actually
 * changes, which is a few times a second at swinging speed -- not per frame.
 * Between those, this file does nothing at all.
 */

import * as THREE from 'three';
import * as W from './world.js';
import { describe, blockRange } from './buildings.js';
import { buildFacades } from './facade.js';
import { buildPropGeometries } from './props.js';

/**
 * How lit the windows are, 0 by day and 1 by night.
 *
 * A single uniform object shared by every facade material. three copies the
 * *reference* into each compiled shader's uniform map, so assigning
 * `.value` once dims all seventeen draw calls at the same instant -- which is
 * exactly what is needed, because windows going out one material at a time
 * would be very visible.
 */
const WINDOW_LEVEL = { value: 1 };

/**
 * Teach a MeshStandardMaterial to read per-instance UVs, tint and emissive.
 *
 * The chunk names here (`vMapUv`, `vEmissiveMapUv`, `vNormalMapUv`) are three's
 * own varyings and have been stable since r151; each is guarded by the same
 * `USE_*` define three uses, so the patch is inert for any map not attached.
 */
function patchForInstancing(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindowLevel = WINDOW_LEVEL;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        attribute vec4 iUv;
        attribute vec3 iTint;
        attribute float iEmiss;
        varying vec3 vITint;
        varying float vIEmiss;
        varying float vWorldY;
      `)
      .replace('#include <uv_vertex>', /* glsl */`
        #include <uv_vertex>
        #ifdef USE_MAP
          vMapUv = vMapUv * iUv.xy + iUv.zw;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = vEmissiveMapUv * iUv.xy + iUv.zw;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = vNormalMapUv * iUv.xy + iUv.zw;
        #endif
        vITint = iTint;
        vIEmiss = iEmiss;
        vWorldY = ( modelMatrix * instanceMatrix * vec4( position, 1.0 ) ).y;
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        varying vec3 vITint;
        varying float vIEmiss;
        varying float vWorldY;
        uniform float uWindowLevel;
      `)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', /* glsl */`
        float streetAo = mix( ${W.AO_FLOOR.toFixed(3)}, 1.0,
          smoothstep( 0.0, ${W.AO_TOP.toFixed(1)}, vWorldY ) );
        vec4 diffuseColor = vec4( diffuse * vITint * streetAo, opacity );
      `)
      .replace('#include <emissivemap_fragment>', /* glsl */`
        #include <emissivemap_fragment>
        totalEmissiveRadiance *= vIEmiss * uWindowLevel;
      `);
  };
  // Without this, three may hand back a cached program compiled before the
  // patch. All facade materials share one patch, so one constant key is right.
  material.customProgramCacheKey = () => 'facade-instanced-v1';
  return material;
}

function facadeMaterial(set, type) {
  const glass = type === W.ARCH.GLASS;
  return patchForInstancing(new THREE.MeshStandardMaterial({
    map: set.map,
    emissiveMap: set.emissiveMap,
    normalMap: set.normalMap,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    // Glass reflects the sky and the city; brick and concrete do not.
    metalness: glass ? 0.82 : 0.04,
    roughness: glass ? 0.24 : 0.88,
    envMapIntensity: glass ? W.ENV_INTENSITY : W.ENV_INTENSITY * 0.25,
    normalScale: new THREE.Vector2(1, 1),
  }));
}

/** An InstancedMesh with the three extra per-instance attributes attached. */
function facadeMesh(geometry, material, cap) {
  const mesh = new THREE.InstancedMesh(geometry, material, cap);
  mesh.count = 0;
  mesh.frustumCulled = false;    // instances span far more than the mesh bounds
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const uv = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  const emiss = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
  for (const a of [uv, tint, emiss]) a.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('iUv', uv);
  geometry.setAttribute('iTint', tint);
  geometry.setAttribute('iEmiss', emiss);
  mesh.userData.attrs = { uv, tint, emiss };
  return mesh;
}

/**
 * A shop sign: the type's name, lit neon, on a dark field, with a tube line
 * top and bottom -- the part a coloured box could never fake, and the actual
 * complaint a plain panel drew: nothing told a café from a bar.
 *
 * The glow is built in two layers the way a real neon tube reads: a soft
 * pass in the shop's own accent colour underneath, then a tighter,
 * almost-white pass on top for the tube's own hot core. One flat blurred
 * pass alone looks like a backlit sticker, not a lit tube -- and, measured
 * against an actual screenshot, the *first* version of this blurred so far
 * past the letterform that the word was no longer legible at all before
 * bloom ever touched it. These radii are small on purpose: bloom is what
 * adds the rest of the glow at render time, so the texture only needs to
 * supply a crisp core and a short halo, not the whole effect pre-baked in.
 */
function shopSignTexture(type) {
  const w = W.SHOP_SIGN_TEX_W;
  const h = W.SHOP_SIGN_TEX_H;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const color = hex(W.SHOP_COLORS[type].sign);

  g.fillStyle = '#0a0806';
  g.fillRect(0, 0, w, h);

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${h * 0.58}px Arial, sans-serif`;

  g.shadowColor = color;
  g.shadowBlur = h * 0.1;
  g.fillStyle = color;
  g.fillText(W.SHOP_LABELS[type], w / 2, h * 0.52);
  g.shadowBlur = h * 0.03;
  g.fillStyle = '#fdf6ec';
  g.fillText(W.SHOP_LABELS[type], w / 2, h * 0.52);

  // The tube line real diner canopies carry, top and bottom of the panel.
  g.shadowBlur = h * 0.06;
  g.fillStyle = color;
  g.fillRect(w * 0.05, h * 0.08, w * 0.9, h * 0.045);
  g.fillRect(w * 0.05, h * 0.875, w * 0.9, h * 0.045);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createCity(scene) {
  const facades = buildFacades();
  const propGeos = buildPropGeometries();

  // One box, shared by every facade instance in the city.
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  /**
   * Facade meshes, keyed `type:variant`. Instances are grouped by the texture
   * they use, because that is the only thing a draw call cannot vary.
   */
  const facadeMeshes = new Map();
  for (const type of W.ARCH_ORDER) {
    facades.sets[type].forEach((set, v) => {
      // A fresh geometry per mesh: the per-instance attributes live on the
      // geometry, so they cannot be shared between InstancedMeshes.
      const mesh = facadeMesh(unitBox.clone(), facadeMaterial(set, type), W.FACADE_CAP_PER_MESH);
      mesh.userData.set = set;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      facadeMeshes.set(`${type}:${v}`, mesh);
    });
  }

  // Ledges and cornices are untextured stone: one material, one mesh.
  const trimMesh = facadeMesh(unitBox.clone(), patchForInstancing(
    new THREE.MeshStandardMaterial({
      color: W.TRIM_COLOR, roughness: 0.92, metalness: 0.05,
      envMapIntensity: W.TRIM_ENV,
    }),
  ), W.TRIM_CAP);
  trimMesh.castShadow = true;
  trimMesh.receiveShadow = true;
  scene.add(trimMesh);

  const metal = new THREE.MeshStandardMaterial({
    color: 0x4a4e5c, roughness: 0.72, metalness: 0.55,
  });
  const litPanel = new THREE.MeshStandardMaterial({
    color: 0x120c08, emissive: 0xffb45a, emissiveIntensity: 1.6, roughness: 0.6,
  });

  /**
   * The rooftop kinds, named explicitly rather than taken from everything
   * `props.js` happens to export -- that module also builds street furniture,
   * traffic and trees, and iterating all of it silently added empty instanced
   * meshes to the scene for things this file never places.
   */
  const ROOF_KINDS = ['tank', 'bulkhead', 'hvac', 'mast', 'dish', 'sign', 'signPanel', 'escape'];

  const propMeshes = new Map();
  for (const kind of ROOF_KINDS) {
    const def = propGeos[kind];
    const mesh = new THREE.InstancedMesh(def.geo, def.emissive ? litPanel : metal, W.PROP_CAP);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    propMeshes.set(kind, mesh);
  }

  /**
   * Shopfronts. A different material from the rooftop props above, because
   * "café glass" and "bar sign" and "restaurant awning" all need their own
   * colour, and `litPanel` is one colour for every instance -- the same
   * problem the player's suit solved, and the same fix: vertex colours, with
   * emissive multiplied by them so the sign glows and the awning next to it
   * mostly does not.
   */
  const shopMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.55,
    emissive: 0xffffff, emissiveIntensity: W.SHOP_EMISSIVE,
  });
  shopMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;',
    );
  };
  shopMat.customProgramCacheKey = () => 'shop-vcolor-emissive';

  const shopMeshes = new Map();
  for (const type of W.SHOP_TYPES) {
    const def = propGeos[`shop:${type}`];
    const mesh = new THREE.InstancedMesh(def.geo, shopMat, W.SHOP_CAP);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    scene.add(mesh);
    shopMeshes.set(type, mesh);
  }

  /**
   * The sign panels: one shared geometry (`shopSign`), one material per type
   * because each carries its own canvas texture. `map` and `emissiveMap` are
   * the same texture, the same trick `gantrySign` in street.js uses -- the
   * sign is a colour by day and lit by night, off the one canvas.
   */
  const shopSignMeshes = new Map();
  const shopSignMats = [];
  for (const type of W.SHOP_TYPES) {
    const tex = shopSignTexture(type);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff,
      emissiveIntensity: W.SHOP_SIGN_GLOW, roughness: 0.7,
    });
    shopSignMats.push(mat);
    const mesh = new THREE.InstancedMesh(propGeos.shopSign.geo, mat, W.SHOP_CAP);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    scene.add(mesh);
    shopSignMeshes.set(type, mesh);
  }

  // Perched pigeons: their own vertex-coloured mesh for the same reason the
  // trees and shrubs get one -- a body and a head are two different greys in
  // one instance, which `metal`/`litPanel` cannot give them.
  const pigeonMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const pigeonMesh = new THREE.InstancedMesh(propGeos.pigeon.geo, pigeonMat, W.PROP_CAP);
  pigeonMesh.count = 0;
  pigeonMesh.frustumCulled = false;
  pigeonMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pigeonMesh.castShadow = true;
  scene.add(pigeonMesh);

  /**
   * Collider proxies. Never added to the scene -- they exist only to be
   * raycast, and their world matrices are updated by hand at the end of a
   * rebuild.
   */
  const colliderPool = [];
  for (let i = 0; i < W.COLLIDER_POOL; i++) {
    const box = new THREE.Mesh(unitBox);
    box.matrixAutoUpdate = false;
    colliderPool.push(box);
  }

  const anchorTargets = [];
  const stats = {
    live: 0, spawned: 0, retired: 0, poolMisses: 0, anchorable: 0,
    facades: 0, props: 0, shops: 0, pigeons: 0, rebuilds: 0, facadeTex: facades.count,
    litWindows: facades.litTotal,
  };

  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const tintColor = new THREE.Color();
  const yAxis = new THREE.Vector3(W.UP.x, W.UP.y, W.UP.z);
  let lastFrom = null;
  let lastTo = null;

  /** Push one box instance into a facade mesh. Returns false if it is full. */
  function pushFacade(mesh, part, set, desc, lane) {
    const i = mesh.count;
    if (i >= mesh.instanceMatrix.count) return false;

    m4.compose(
      pos.set(part.x, part.y, part.z),
      quat.identity(),
      scl.set(part.w, part.h, part.d),
    );
    mesh.setMatrixAt(i, m4);

    const { uv, tint, emiss } = mesh.userData.attrs;
    if (set) {
      // The whole point of the exercise: this instance's own window grid.
      // Real floor heights, so the count of storeys is a consequence of how
      // tall the building is rather than a texture stretched to fit.
      uv.setXYZW(i,
        part.w / (set.cellW * set.cols),
        part.h / (set.floorH * set.rows),
        desc.uvOffset[0],
        desc.uvOffset[1] + part.y / (set.floorH * set.rows));
    } else {
      uv.setXYZW(i, 1, 1, 0, 0);
    }

    // Depth cueing beyond fog: far lanes are darker, cooler and less bright.
    //
    // `setHSL` takes sRGB and converts into the linear working space, so a
    // lightness of 0.5 lands at about 0.21 linear -- which, multiplied into an
    // already dark albedo, is most of how the walls once ended up at 1/255.
    const shade = 0.78 + desc.shade * 0.42;
    tintColor.setHSL(0.62, 0.16 * (1 - lane.tint * 0.6), 0.78)
      .multiplyScalar(shade * (0.55 + lane.tint * 0.5));
    tint.setXYZ(i, tintColor.r, tintColor.g, tintColor.b);
    emiss.setX(i, (0.22 + lane.tint * 0.58) * (0.75 + desc.shade * 0.5));

    mesh.count = i + 1;
    return true;
  }

  function pushProp(kind, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) {
    const mesh = propMeshes.get(kind);
    const i = mesh.count;
    if (i >= mesh.instanceMatrix.count) { stats.poolMisses++; return; }
    m4.compose(
      pos.set(x, y, z),
      quat.setFromAxisAngle(yAxis, ry),
      scl.set(sx, sy, sz),
    );
    mesh.setMatrixAt(i, m4);
    mesh.count = i + 1;
    stats.props++;
  }

  function placeProps(desc) {
    for (const p of desc.props) {
      switch (p.kind) {
        case 'tank':
        case 'bulkhead':
        case 'hvac':
        case 'mast':
        case 'dish':
          pushProp(p.kind, p.x, p.y, p.z, 1, 1, 1, desc.shade * Math.PI);
          break;
        case 'sign':
          pushProp('sign', p.x, p.y, p.z);
          pushProp('signPanel', p.x, p.y + W.PROPS.sign.h * 0.75, p.z);
          break;
        case 'escape': {
          // One instance per storey, at true size. See props.js.
          const floor = W.FACADE.apartment.floorH;
          const storeys = Math.min(W.PROPS.escape.rungs,
            Math.floor((p.span - floor * 2) / floor));
          for (let k = 1; k <= storeys; k++) {
            pushProp('escape', p.x, p.y + k * floor, p.z + desc.depth / 2);
          }
          break;
        }
        case 'pigeon': {
          const i = pigeonMesh.count;
          if (i >= pigeonMesh.instanceMatrix.count) { stats.poolMisses++; break; }
          m4.compose(
            pos.set(p.x, p.y, p.z),
            quat.setFromAxisAngle(yAxis, desc.shade * Math.PI * 2),
            scl.set(W.UNIT.x, W.UNIT.y, W.UNIT.z),
          );
          pigeonMesh.setMatrixAt(i, m4);
          pigeonMesh.count = i + 1;
          stats.pigeons++;
          break;
        }
        default:
          break;
      }
    }
  }

  /**
   * The one shopfront a building gets: the shell, spanning most of its
   * frontage, and the sign above it at the same width so the two always read
   * as one storefront. `sx` is the only axis that scales on either mesh --
   * height and depth stay real-world constants regardless of how wide the
   * building is, which is what keeps a shopfront on a broad commercial base
   * from turning into a stretched decal.
   */
  function placeShopfront(desc, lane) {
    if (!desc.shop) return;
    const sx = desc.width * W.SHOP_WIDTH_FRAC;
    const x = desc.x;
    const z = lane.z + desc.depth / 2;

    const shell = shopMeshes.get(desc.shop);
    const i = shell.count;
    if (i >= shell.instanceMatrix.count) { stats.poolMisses++; return; }
    m4.compose(pos.set(x, W.STREET_Y, z), quat.identity(), scl.set(sx, W.UNIT.y, W.UNIT.z));
    shell.setMatrixAt(i, m4);
    shell.count = i + 1;
    stats.shops++;

    const sign = shopSignMeshes.get(desc.shop);
    const j = sign.count;
    if (j >= sign.instanceMatrix.count) { stats.poolMisses++; return; }
    const S = W.SHOPFRONT;
    const signY = W.STREET_Y + S.glassH + S.awningT + S.panelGap + W.SHOP_SIGN.h / 2;
    m4.compose(
      pos.set(x, signY, z + S.glassD / 2),
      quat.identity(),
      scl.set(sx, W.UNIT.y, W.UNIT.z),
    );
    sign.setMatrixAt(j, m4);
    sign.count = j + 1;
  }

  function rebuild(camX) {
    for (const mesh of facadeMeshes.values()) mesh.count = 0;
    for (const mesh of propMeshes.values()) mesh.count = 0;
    for (const mesh of shopMeshes.values()) mesh.count = 0;
    for (const mesh of shopSignMeshes.values()) mesh.count = 0;
    pigeonMesh.count = 0;
    trimMesh.count = 0;
    anchorTargets.length = 0;
    stats.facades = 0;
    stats.props = 0;
    stats.shops = 0;
    stats.pigeons = 0;
    stats.poolMisses = 0;
    stats.live = 0;

    let collider = 0;

    for (let li = 0; li < W.LANES.length; li++) {
      const lane = W.LANES[li];
      const { from, to } = blockRange(lane, camX);

      for (let n = from; n <= to; n++) {
        const desc = describe(li, lane, n);
        if (!desc) continue;
        stats.live++;

        const mesh = facadeMeshes.get(`${desc.arch}:${desc.variant}`);
        for (const part of desc.parts) {
          const isTrim = part.kind === 'ledge';
          const target = isTrim ? trimMesh : mesh;
          const ok = pushFacade(target, part, isTrim ? null : target.userData.set, desc, lane);
          if (!ok) { stats.poolMisses++; continue; }
          stats.facades++;

          // One collider per massing part, so a setback roof is a real ledge a
          // web can catch rather than an approximation of the whole block.
          if (lane.anchor && collider < colliderPool.length && !isTrim) {
            const box = colliderPool[collider++];
            box.position.set(part.x, part.y, part.z + part.d / 2);
            box.scale.set(part.w, part.h, part.d);
            box.updateMatrix();
            box.updateMatrixWorld(true);
            anchorTargets.push(box);
          }
        }

        // A parapet slab capping the roof.
        //
        // Not decoration: a BoxGeometry has one set of UVs for all six faces,
        // so the facade texture -- lit windows and all -- was being drawn
        // across the top of every building. Capping it hides the top face
        // behind plain stone, and a raised parapet edge is what a real roof
        // has anyway. Same instanced mesh as the cornices, so it is free.
        pushFacade(trimMesh, {
          x: desc.x,
          y: desc.roof + W.LEDGE_H / 2,
          z: desc.z,
          w: desc.roofW + W.LEDGE_DEPTH * 2,
          h: W.LEDGE_H,
          d: desc.roofD + W.LEDGE_DEPTH * 2,
          kind: 'cap',
        }, null, desc, lane);

        placeProps(desc);
        placeShopfront(desc, lane);
      }
    }

    for (const mesh of [...facadeMeshes.values(), trimMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      const { uv, tint, emiss } = mesh.userData.attrs;
      uv.needsUpdate = true;
      tint.needsUpdate = true;
      emiss.needsUpdate = true;
    }
    for (const mesh of propMeshes.values()) mesh.instanceMatrix.needsUpdate = true;
    for (const mesh of shopMeshes.values()) mesh.instanceMatrix.needsUpdate = true;
    for (const mesh of shopSignMeshes.values()) mesh.instanceMatrix.needsUpdate = true;
    pigeonMesh.instanceMatrix.needsUpdate = true;

    stats.anchorable = anchorTargets.length;
    stats.rebuilds++;
  }

  return {
    stats,
    anchorTargets,

    /**
     * 0 by day, 1 by night. Drives every lit window in one assignment -- and
     * the rooftop signs, which are a separate material and were left burning
     * at midday the first time this was wired up. Anything emissive has to be
     * on this list or it announces itself the moment the sun comes up.
     */
    setWindowLevel(level) {
      WINDOW_LEVEL.value = level;
      litPanel.emissiveIntensity = 1.6 * level;
      // A floor rather than 0 at noon: a café's glass and awning are still a
      // colour by day, just not a glowing one -- the sign should dim, not
      // vanish the moment the sun is up.
      shopMat.emissiveIntensity = W.SHOP_EMISSIVE * (0.15 + 0.85 * level);
      for (const mat of shopSignMats) mat.emissiveIntensity = W.SHOP_SIGN_GLOW * (0.15 + 0.85 * level);
    },

    /**
     * Roof height at a world x, for the highest anchorable building near it.
     * Answers for blocks that have no geometry, because identity is derived.
     */
    roofAt(x) {
      let best = W.STREET_Y;
      for (let li = 0; li < W.LANES.length; li++) {
        const lane = W.LANES[li];
        if (!lane.anchor) continue;
        const desc = describe(li, lane, Math.round(x / lane.pitch));
        if (desc && desc.roof > best) best = desc.roof;
      }
      return best;
    },

    /**
     * Rebuild only when the visible span has actually moved on. Between block
     * boundaries this costs one comparison, which is why a city ten times the
     * size of the old one is cheaper per frame than the old one was.
     */
    update(camX) {
      const near = W.LANES[W.LANES.length - 2];
      const { from, to } = blockRange(near, camX);
      if (from === lastFrom && to === lastTo) {
        stats.spawned = 0;
        stats.retired = 0;
        return;
      }
      stats.spawned = from !== lastFrom ? 1 : 0;
      stats.retired = to !== lastTo ? 1 : 0;
      lastFrom = from;
      lastTo = to;
      rebuild(camX);
    },
  };
}
