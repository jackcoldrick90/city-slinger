/**
 * Air, and what the glass reflects.
 *
 * Three things live here, all cheap:
 *
 * - **An environment map**, drawn as an equirectangular canvas and run through
 *   `PMREMGenerator` so it can be sampled at any roughness. It is what makes a
 *   glass tower reflect a dark sky with a warm band of city glow near the
 *   horizon instead of being a flat blue box, and it lights every other surface
 *   a little as ambient IBL. One 256px texture, generated once.
 *
 * - **Haze cards**: a few very large, very faint gradient planes standing
 *   between the depth lanes. Fog alone is uniform, and uniform fog reads as a
 *   filter over the whole image; discrete layers at known depths give you
 *   distinct planes of distance -- the thing that makes a photograph of a city
 *   look deep. Deliberately faint. The brief said not excessively foggy, and
 *   the failure mode of this technique is milk.
 *
 * - **Dust**, a slow drift of points near the camera. It costs one draw call
 *   and does something no amount of fog can: it gives the empty air between the
 *   player and the buildings a texture, so the gap reads as space rather than
 *   as nothing.
 */

import * as THREE from 'three';
import * as W from './world.js';
import { rngFor } from './rng.js';
import { sunDirection } from './daylight.js';

const SEED = 'air';

/**
 * The sky, as an equirectangular strip: deep blue-black overhead, a warm
 * sodium band at the horizon where a city throws its light back up into the
 * haze, and darkness below.
 */
function skyEquirect(pal) {
  const cv = document.createElement('canvas');
  cv.width = W.ENVMAP_PX * 2;
  cv.height = W.ENVMAP_PX;
  const g = cv.getContext('2d');
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

  const grad = g.createLinearGradient(0, 0, 0, cv.height);
  grad.addColorStop(0, hex(pal.skyTop));
  grad.addColorStop(0.42, hex(pal.skyMid));
  grad.addColorStop(0.52, hex(pal.skyBottom));
  grad.addColorStop(0.62, hex(pal.fog));
  grad.addColorStop(1, hex(pal.fog));
  g.fillStyle = grad;
  g.fillRect(0, 0, cv.width, cv.height);

  // Scattered glow along the horizon: distant districts, out of frame. This is
  // most of what a reflective facade picks up at night -- and almost nothing of
  // what it picks up at noon, so it fades out with the rest of the city lights.
  const rand = rngFor(SEED, 'sky');
  for (let i = 0; i < 42; i++) {
    const x = rand() * cv.width;
    const y = cv.height * (0.48 + rand() * 0.1);
    const r = cv.height * (0.04 + rand() * 0.13);
    const glow = g.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, `rgba(255,186,110,${(0.10 + rand() * 0.16) * pal.window})`);
    glow.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = glow;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The sun: a white-hot core inside a warm halo, drawn once into a canvas.
 *
 * Baking the halo into the texture rather than adding a second glowing quad
 * keeps it to one draw call and means the falloff is authored rather than
 * emergent. Additive blending on top of that is what makes it read as a light
 * source rather than as a pale sticker.
 */
function sunTexture() {
  const px = W.BODY_TEX_PX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const c = px / 2;
  const glow = g.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(255,255,250,1)');
  glow.addColorStop(0.12, 'rgba(255,246,214,1)');
  glow.addColorStop(0.2, 'rgba(255,214,142,0.55)');
  glow.addColorStop(0.42, 'rgba(255,168,84,0.16)');
  glow.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, px, px);
  return new THREE.CanvasTexture(cv);
}

/** The moon: a pale disc with maria, and a much tighter halo than the sun's. */
function moonTexture() {
  const px = W.BODY_TEX_PX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const c = px / 2;
  const r = px * 0.24;

  const halo = g.createRadialGradient(c, c, r * 0.9, c, c, c);
  halo.addColorStop(0, 'rgba(198,214,255,0.30)');
  halo.addColorStop(0.5, 'rgba(170,190,255,0.07)');
  halo.addColorStop(1, 'rgba(150,175,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, px, px);

  const face = g.createRadialGradient(c - r * 0.3, c - r * 0.3, 0, c, c, r);
  face.addColorStop(0, '#fdfdf6');
  face.addColorStop(0.75, '#e2e4dc');
  face.addColorStop(1, '#c3c7c2');
  g.fillStyle = face;
  g.beginPath();
  g.arc(c, c, r, 0, Math.PI * 2);
  g.fill();

  // Maria. Seeded, so the moon is the same moon every night.
  const rand = rngFor(SEED, 'moon');
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.78;
    const rr = r * (0.07 + rand() * 0.19);
    g.fillStyle = `rgba(120,126,132,${0.10 + rand() * 0.16})`;
    g.beginPath();
    g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, rr, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  return new THREE.CanvasTexture(cv);
}

/**
 * One cloud: a handful of overlapping soft-edged puffs, not a single blob.
 * A lone radial gradient reads as a smoke ring; several offset and
 * overlapping ones read as a cumulus silhouette, for the same reason the
 * ragged-blob trick works for the ground texture.
 */
function cloudTexture() {
  const px = W.CLOUD_TEX_PX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  // Solid and bright through most of its radius, with the falloff to
  // transparent packed into the outer rim -- the earlier version faded from
  // the centre out, which reads as haze rather than as a lit, opaque puff.
  const puff = (x, y, r) => {
    const glow = g.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.7, 'rgba(255,255,255,0.98)');
    glow.addColorStop(0.88, 'rgba(255,255,255,0.7)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  // A wide, low, lumpy body -- more overlapping puffs at more varied sizes
  // than the first pass, which is the difference between a cumulus bank and
  // a cluster of three circles.
  const cy = px * 0.56;
  puff(px * 0.50, cy, px * 0.30);
  puff(px * 0.30, cy + px * 0.07, px * 0.24);
  puff(px * 0.70, cy + px * 0.06, px * 0.26);
  puff(px * 0.16, cy + px * 0.11, px * 0.16);
  puff(px * 0.85, cy + px * 0.10, px * 0.17);
  puff(px * 0.40, cy - px * 0.15, px * 0.22);
  puff(px * 0.60, cy - px * 0.16, px * 0.21);
  puff(px * 0.50, cy - px * 0.24, px * 0.16);
  return new THREE.CanvasTexture(cv);
}

/** A soft vertical gradient, transparent at the top, used for the haze cards. */
function hazeTexture() {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, cv.height);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, cv.width, cv.height);
  return new THREE.CanvasTexture(cv);
}

/**
 * A far skyline's silhouette, baked into a texture's alpha channel: a strip
 * of white blocks of varying width and height, rooted to the bottom edge,
 * with the occasional antenna spire. Colour comes later, from the material --
 * this only ever says where a building is and how tall.
 *
 * Every block is drawn at its true x and again one tile-width either side, the
 * same trick the ground texture uses, so the strip tiles seamlessly when the
 * material repeats it -- without that, the seam between one tile and the next
 * would be the only sharp edge on an otherwise soft horizon.
 */
function skylineTexture() {
  const w = W.SKYLINE_TEX_W, h = W.SKYLINE_TEX_H;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  const rand = rngFor(SEED, 'skyline');
  g.fillStyle = '#fff';

  const wrapped = (bx, draw) => {
    for (const ox of [-1, 0, 1]) draw(bx + ox * w);
  };

  let x = 0;
  while (x < w) {
    const bw = w * (W.SKYLINE_BLOCK.wMin + rand() * (W.SKYLINE_BLOCK.wMax - W.SKYLINE_BLOCK.wMin));
    const bh = h * (W.SKYLINE_BLOCK.hMin + rand() * (W.SKYLINE_BLOCK.hMax - W.SKYLINE_BLOCK.hMin));
    const spire = rand() < W.SKYLINE_SPIRE_CHANCE;
    const sw = bw * W.SKYLINE_SPIRE.wFrac;
    const sh = h * (W.SKYLINE_SPIRE.hMin + rand() * (W.SKYLINE_SPIRE.hMax - W.SKYLINE_SPIRE.hMin));
    wrapped(x, (px) => {
      g.fillRect(px, h - bh, bw, bh);
      if (spire) g.fillRect(px + bw / 2 - sw / 2, h - bh - sh, sw, sh);
    });
    x += bw + w * (W.SKYLINE_GAP.min + rand() * (W.SKYLINE_GAP.max - W.SKYLINE_GAP.min));
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createAtmosphere(scene, renderer, palette) {
  /**
   * PMREM turns the flat sky canvas into a roughness-filtered environment, and
   * it is what a glass tower actually reflects.
   *
   * It cannot be rebuilt every frame -- it is several render passes -- but it
   * also cannot be built once, because the sky it reflects changes completely
   * over a cycle and a noon tower reflecting a midnight sky looks broken.
   *
   * So it is rebuilt on *drift*: whenever the sky palette has moved more than
   * ENV_DRIFT, which over a four-minute cycle works out at roughly a dozen
   * rebuilds. The count is in the overlay, because "how often is this actually
   * happening" is the only question that matters about it.
   */
  const stats = {
    haze: W.HAZE_LAYERS.length, dust: W.DUST_COUNT, stars: W.STAR_COUNT,
    clouds: W.CLOUD_CAP, farSkyline: 1, envBuilds: 0, sunUp: false,
  };
  // The phase the bodies were last positioned for; setPalette runs before
  // update in the frame, so it records it and update reads it back.
  let phaseOf = 0;

  const pmrem = new THREE.PMREMGenerator(renderer);
  let target = null;
  let builtFor = null;

  const drift = (a, b) => Math.max(
    Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)),
    Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)),
    Math.abs((a & 255) - (b & 255)),
  );

  function rebuildEnv(pal) {
    const raw = skyEquirect(pal);
    const next = pmrem.fromEquirectangular(raw);
    raw.dispose();
    if (target) target.dispose();
    target = next;
    scene.environment = target.texture;
    builtFor = pal;
    stats.envBuilds++;
  }

  const hazeTex = hazeTexture();
  const cards = [];
  const cardMats = [];
  for (const layer of W.HAZE_LAYERS) {
    const mat = new THREE.MeshBasicMaterial({
      map: hazeTex,
      color: palette.fog,
      transparent: true,
      opacity: layer.opacity,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const card = new THREE.Mesh(new THREE.PlaneGeometry(W.HAZE_W, layer.h), mat);
    card.position.set(0, W.STREET_Y + layer.h / 2, layer.z);
    card.renderOrder = -1;
    scene.add(card);
    cards.push(card);
    cardMats.push(mat);
  }

  // The far skyline: one plane, past the last real building lane, textured
  // with the silhouette above rather than a gradient. Its own tex.repeat and
  // tile width are computed once here so `update` only ever does the offset
  // arithmetic that has to happen every frame.
  const skylineTex = skylineTexture();
  skylineTex.repeat.set(W.SKYLINE_REPEAT, 1);
  const skylineTile = W.SKYLINE_W / W.SKYLINE_REPEAT;
  const skylineMat = new THREE.MeshBasicMaterial({
    map: skylineTex,
    color: palette.fog,
    transparent: true,
    opacity: W.SKYLINE_OPACITY,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const skyline = new THREE.Mesh(
    new THREE.PlaneGeometry(W.SKYLINE_W, W.SKYLINE_H), skylineMat,
  );
  skyline.position.set(0, W.STREET_Y + W.SKYLINE_H / 2, W.SKYLINE_Z);
  skyline.renderOrder = -2;
  scene.add(skyline);

  // Dust. Positions are generated once in a box and the whole cloud is moved
  // with the camera, wrapping in x -- so nothing is allocated per frame.
  const rand = rngFor(SEED, 'dust');
  const positions = new Float32Array(W.DUST_COUNT * 3);
  const phases = new Float32Array(W.DUST_COUNT);
  for (let i = 0; i < W.DUST_COUNT; i++) {
    positions[i * 3] = (rand() - 0.5) * W.DUST_BOX.w;
    positions[i * 3 + 1] = rand() * W.DUST_BOX.h;
    positions[i * 3 + 2] = (rand() - 0.5) * W.DUST_BOX.d;
    phases[i] = rand() * Math.PI * 2;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: W.DUST_COLOR,
    size: W.DUST_SIZE,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  }));
  dust.frustumCulled = false;
  scene.add(dust);

  const base = positions.slice();
  let t = 0;

  /**
   * Stars, on a shell that travels with the camera.
   *
   * Because the shell never gets nearer, they never parallax -- and because its
   * radius is beyond every building, the skyline occludes them. Both of those
   * are what separate a star field from white specks floating over the city,
   * which is what the dust was doing when it was mistaken for one.
   */
  const starRand = rngFor(SEED, 'stars');
  const starPos = new Float32Array(W.STAR_COUNT * 3);
  const starCol = new Float32Array(W.STAR_COUNT * 3);
  for (let i = 0; i < W.STAR_COUNT; i++) {
    // Uniform on a sphere, then keep only the upper hemisphere -- there is no
    // sky below the horizon and points down there are simply inside the ground.
    const u = starRand() * 2 - 1;
    const a = starRand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    starPos[i * 3] = Math.cos(a) * r * W.STAR_RADIUS;
    starPos[i * 3 + 1] = Math.abs(u) * W.STAR_RADIUS;
    starPos[i * 3 + 2] = Math.sin(a) * r * W.STAR_RADIUS;
    // A spread of brightness and a little colour: a uniform field reads as a
    // texture, a varied one reads as a sky.
    const mag = 0.35 + starRand() ** 2 * 0.65;
    const warm = starRand();
    starCol[i * 3] = mag * (0.86 + warm * 0.18);
    starCol[i * 3 + 1] = mag * 0.95;
    starCol[i * 3 + 2] = mag * (1.0 - warm * 0.12);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const starMat = new THREE.PointsMaterial({
    size: W.STAR_SIZE,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  /**
   * Clouds live on a world lattice, the same idea as the scatter planting and
   * the expressway piers: a slot at `i * CLOUD_SPACING` gets its height,
   * depth, size and drift speed from a hash of `i`, so a given patch of sky
   * always holds the same cloud rather than a new one every frame.
   *
   * The first version instead recentred every instance on the camera every
   * frame -- the same trick the haze cards use for a seamless backdrop -- and
   * for a backdrop that is right, but for a discrete object it is wrong: it
   * cancels the camera's own motion out of the cloud's position, so the cloud
   * moves at exactly the player's speed and never once passes overhead. A
   * lattice slot's position depends on world x and elapsed time only, never
   * on the camera, which is what makes the drift actually independent.
   */
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTexture(),
    color: W.CLOUD_DAY_COLOR,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const cloudColor = new THREE.Color();
  const clouds = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1), cloudMat, W.CLOUD_CAP,
  );
  clouds.frustumCulled = false;
  clouds.count = 0;
  scene.add(clouds);

  // The sun and the moon. Billboards, fog off, never writing depth -- but still
  // depth *tested*, so the skyline can rise in front of them.
  const sunMat = new THREE.MeshBasicMaterial({
    map: sunTexture(), transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
  });
  const moonMat = new THREE.MeshBasicMaterial({
    map: moonTexture(), transparent: true, depthWrite: false, fog: false,
  });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(W.SUN_DISC, W.SUN_DISC), sunMat);
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(W.MOON_DISC, W.MOON_DISC), moonMat);
  for (const body of [sun, moon]) {
    body.frustumCulled = false;
    scene.add(body);
  }

  const bodyDir = new THREE.Vector3();
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const cloudM4 = new THREE.Matrix4();
  const cloudPos = new THREE.Vector3();
  const cloudScale = new THREE.Vector3();

  /** Put a disc on the visible side of the sky. See SUN_VIS_SWING. */
  function placeBody(mesh, x, y, camera) {
    bodyDir.set(x * W.SUN_VIS_SWING, y * W.SUN_VIS_SWING, -1).normalize();
    mesh.position.copy(camera.position).addScaledVector(bodyDir, W.SKY_BODY_DIST);
    mesh.quaternion.copy(camera.quaternion);
  }

  rebuildEnv(palette);

  return {
    stats,

    /**
     * Follow the sky. Haze takes the fog colour so the two never disagree, and
     * the dust fades back in daylight -- at night the high motes read as stars,
     * which is a happy accident worth keeping, but in a blue sky they read as
     * dirt on the lens.
     */
    setPalette(pal) {
      for (const mat of cardMats) mat.color.setHex(pal.fog);
      skylineMat.color.setHex(pal.fog);
      dust.material.opacity = 0.2 * (0.15 + 0.85 * pal.window);
      // Stars follow the darkness rather than the clock, so they fade with the
      // same signal that puts the windows on. Steeply, though: a linear fade
      // left them faintly visible against a blue midday sky, which is the sort
      // of thing that reads as dirt on the lens rather than as stars.
      starMat.opacity = pal.window ** 3;
      stars.visible = starMat.opacity > 0.01;

      // Clouds go from sunlit white to a moonlit grey with the same darkness
      // signal as the stars -- an unlit cloud at night genuinely is a darker
      // colour, not just a fainter version of the daylight one.
      cloudColor.setHex(W.CLOUD_DAY_COLOR).lerp(
        new THREE.Color(W.CLOUD_NIGHT_COLOR), pal.window,
      );
      cloudMat.color.copy(cloudColor);
      cloudMat.opacity = W.CLOUD_OPACITY.day
        + (W.CLOUD_OPACITY.night - W.CLOUD_OPACITY.day) * pal.window;

      // The two bodies cross over as the sun crosses the horizon.
      const elev = sunDirection(pal.phase).y;
      sunMat.opacity = clamp01((elev + W.BODY_FADE * 0.4) / W.BODY_FADE);
      moonMat.opacity = clamp01((-elev + W.BODY_FADE * 0.4) / W.BODY_FADE) * 0.95;
      sun.visible = sunMat.opacity > 0.01;
      moon.visible = moonMat.opacity > 0.01;
      stats.sunUp = elev > 0;
      phaseOf = pal.phase;
      scene.environmentIntensity = pal.env;
      if (!builtFor
        || drift(builtFor.skyMid, pal.skyMid) > W.ENV_DRIFT
        || drift(builtFor.skyBottom, pal.skyBottom) > W.ENV_DRIFT) {
        rebuildEnv(pal);
      }
    },

    update(camera, dt) {
      const camX = camera.position.x;
      for (const card of cards) card.position.x = camX;

      // The plane itself recentres on the camera every frame, exactly like
      // the haze cards -- an infinite backdrop with no edge to run out of.
      // What actually reads as distance is the texture scrolling *slower*
      // than that: at full speed a plane sixty units behind the last real
      // building would race past at the same rate as that building, and the
      // two would read as the same depth however far apart their z is.
      skyline.position.x = camX;
      skylineTex.offset.x = (camX * W.SKYLINE_PARALLAX) / skylineTile;

      stars.position.copy(camera.position);
      const s = sunDirection(phaseOf);
      if (sun.visible) placeBody(sun, s.x, s.y, camera);
      if (moon.visible) placeBody(moon, -s.x, -s.y, camera);

      t += dt;
      // A slow lateral drift, so the air is moving without anything flying.
      const attr = dustGeo.attributes.position;
      for (let i = 0; i < W.DUST_COUNT; i++) {
        const drift = Math.sin(t * 0.25 + phases[i]) * W.DUST_DRIFT;
        attr.array[i * 3] = base[i * 3] + drift;
        attr.array[i * 3 + 1] = base[i * 3 + 1] + Math.cos(t * 0.19 + phases[i]) * W.DUST_DRIFT * 0.5;
      }
      attr.needsUpdate = true;
      dust.position.set(camX, camera.position.y - W.DUST_BOX.h / 2, W.PLAYER_Z + W.DUST_Z);

      // Clouds: a world lattice walked over a window either side of the
      // camera, exactly like the scatter planting. Each slot's own hash gives
      // it a height, depth, size and a wind speed that varies per cloud, so
      // the bank drifts at its own pace instead of in lockstep with the
      // camera -- see the note above on why that has to be world x, not camX.
      const cloudFrom = Math.floor((camX - W.CLOUD_REACH) / W.CLOUD_SPACING);
      const cloudTo = Math.ceil((camX + W.CLOUD_REACH) / W.CLOUD_SPACING);
      let cloudN = 0;
      for (let i = cloudFrom; i <= cloudTo && cloudN < W.CLOUD_CAP; i++) {
        const rand = rngFor(SEED, 'cloud', i);
        const jitter = (rand() - 0.5) * 2 * W.CLOUD_SPACING * W.CLOUD_JITTER;
        const speed = W.CLOUD_DRIFT * (1 + (rand() * 2 - 1) * W.CLOUD_SPEED_VAR);
        const x = i * W.CLOUD_SPACING + jitter + t * speed;
        const y = W.CLOUD_Y.min + rand() * (W.CLOUD_Y.max - W.CLOUD_Y.min);
        const z = W.CLOUD_Z.min + rand() * (W.CLOUD_Z.max - W.CLOUD_Z.min);
        const size = W.CLOUD_SIZE.min + rand() * (W.CLOUD_SIZE.max - W.CLOUD_SIZE.min);
        cloudM4.compose(cloudPos.set(x, y, z), camera.quaternion, cloudScale.set(size, size, 1));
        clouds.setMatrixAt(cloudN, cloudM4);
        cloudN++;
      }
      clouds.count = cloudN;
      clouds.instanceMatrix.needsUpdate = true;
      stats.clouds = cloudN;
    },
  };
}
