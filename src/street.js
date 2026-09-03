/**
 * The avenue below, and the ones crossing it.
 *
 * More than anything else, this is what sells "canyon": a lit surface at the
 * bottom of the frame with converging perspective lines, kerbs running to the
 * vanishing point, lamps receding, and traffic streaking along it. Buildings
 * alone give you a wall; it is the ground plane that tells the eye how deep the
 * wall is and how far down the fall goes.
 *
 * The main road follows the camera in x and its texture scrolls to match, so a
 * strip of geometry a few hundred units long behaves like an endless one. The
 * cross avenues are laid down the gaps `CROSS_SPACING` leaves in the facade,
 * and run away from the camera into the fog.
 *
 * Nothing here allocates after startup: the traffic, lamps and trees are fixed
 * pools that are re-placed rather than rebuilt.
 */

import * as THREE from 'three';
import * as W from './world.js';
import { buildPropGeometries } from './props.js';
import { rngFor } from './rng.js';

const SEED = 'street';

/** Asphalt: worn, patched, with lane markings and a wet sheen. */
function roadTexture() {
  const px = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const rand = rngFor(SEED, 'road');

  g.fillStyle = '#14161d';
  g.fillRect(0, 0, px, px);
  for (let i = 0; i < 2600; i++) {
    const v = 0.06 + rand() * 0.1;
    g.fillStyle = `rgba(${(v * 255) | 0},${(v * 258) | 0},${(v * 280) | 0},0.5)`;
    g.fillRect(rand() * px, rand() * px, 2, 2);
  }
  // Patches and repairs, so the surface is not uniform noise.
  for (let i = 0; i < 22; i++) {
    g.fillStyle = `rgba(0,0,0,${0.1 + rand() * 0.2})`;
    g.fillRect(rand() * px, rand() * px, 20 + rand() * 90, 14 + rand() * 60);
  }
  // Centre line, running along the avenue (the u axis).
  g.fillStyle = 'rgba(216,186,96,0.55)';
  for (let x = 0; x < px; x += 46) g.fillRect(x, px * 0.5 - 2, 26, 4);
  // Lane divides.
  g.fillStyle = 'rgba(200,204,214,0.22)';
  for (const t of [0.24, 0.76]) {
    for (let x = 0; x < px; x += 34) g.fillRect(x, px * t - 1, 18, 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}



/** Paving: slabs, joints, staining. Cracked concrete, not a grey plane. */
function pavingTexture() {
  const px = W.PAVING_PX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const rand = rngFor(SEED, 'paving');

  g.fillStyle = '#2f323c';
  g.fillRect(0, 0, px, px);
  // Slab joints. A pavement is read almost entirely by its grid of lines.
  const slab = px / 4;
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 1.5;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * slab, 0); g.lineTo(i * slab, px);
    g.moveTo(0, i * slab); g.lineTo(px, i * slab);
    g.stroke();
  }
  // Each slab a slightly different tone, so the grid is not mechanical.
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      g.fillStyle = `rgba(255,255,255,${rand() * 0.05})`;
      g.fillRect(x * slab + 2, y * slab + 2, slab - 4, slab - 4);
    }
  }
  for (let i = 0; i < 700; i++) {
    const v = 0.1 + rand() * 0.12;
    g.fillStyle = `rgba(${(v * 255) | 0},${(v * 258) | 0},${(v * 275) | 0},0.4)`;
    g.fillRect(rand() * px, rand() * px, 2, 2);
  }
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(0,0,0,${0.05 + rand() * 0.12})`;
    g.beginPath();
    g.arc(rand() * px, rand() * px, px * (0.02 + rand() * 0.07), 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * A highway sign: green field, white border, two white bars and an arrow.
 *
 * No text. At the distance these are seen a letter is a fraction of a pixel,
 * and a texture that tries to write one reads as noise -- what makes a sign
 * recognisable at range is the shape and the colour, so that is all this draws.
 */
function signTexture() {
  const px = W.GANTRY.tex;
  const cv = document.createElement('canvas');
  cv.width = px;
  cv.height = Math.round(px * W.GANTRY.panel.h / W.GANTRY.panel.w);
  const g = cv.getContext('2d');
  const h = cv.height;

  g.fillStyle = W.GANTRY.green;
  g.fillRect(0, 0, px, h);
  g.strokeStyle = 'rgba(228,236,228,0.85)';
  g.lineWidth = Math.max(2, h * 0.05);
  g.strokeRect(h * 0.09, h * 0.09, px - h * 0.18, h - h * 0.18);

  // Two bars of "text" and an arrow, which is the whole silhouette of a sign.
  g.fillStyle = 'rgba(232,238,232,0.9)';
  g.fillRect(px * 0.1, h * 0.26, px * 0.5, h * 0.14);
  g.fillRect(px * 0.1, h * 0.54, px * 0.34, h * 0.12);
  g.beginPath();
  g.moveTo(px * 0.78, h * 0.28);
  g.lineTo(px * 0.92, h * 0.5);
  g.lineTo(px * 0.78, h * 0.72);
  g.lineTo(px * 0.78, h * 0.58);
  g.lineTo(px * 0.68, h * 0.58);
  g.lineTo(px * 0.68, h * 0.42);
  g.lineTo(px * 0.78, h * 0.42);
  g.closePath();
  g.fill();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createStreet(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const geos = buildPropGeometries();

  // ---------------------------------------------------------------- the road
  const roadTex = roadTexture();
  roadTex.repeat.set(W.STREET_LEN / 40, 1);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(W.STREET_LEN, W.STREET_HALF_W * 2),
    // Slightly metallic and smooth: a night street is always a bit wet, and
    // the reflection of the lamps is what stops it reading as felt.
    new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: W.ROAD_ROUGHNESS,
      metalness: W.ROAD_METALNESS,
      envMapIntensity: W.ROAD_ENV,
    }),
  );
  road.receiveShadow = true;
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, W.STREET_Y, W.PLAYER_Z);
  group.add(road);

  /**
   * The pavement, both sides of both kinds of street.
   *
   * Two meshes rather than one because the paving has to run *along* the
   * corridor, and a shared texture can only point one way -- the same reason
   * the road surfaces are split. Everything at street level stands on these,
   * so they are the one surface worth texturing properly.
   */
  const paveTex = pavingTexture();
  paveTex.repeat.set(W.STREET_LEN / 9, W.SIDEWALK_W / 9);
  const paveTexZ = paveTex.clone();
  paveTexZ.repeat.set(W.SIDEWALK_W / 9, W.CROSS_LEN / 9);
  const paveMat = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.94 });
  const slab = new THREE.BoxGeometry(1, 1, 1);
  const sidewalks = [
    new THREE.InstancedMesh(slab, paveMat(paveTex), 2),
    new THREE.InstancedMesh(slab, paveMat(paveTexZ), W.CROSS_VISIBLE * 2),
  ];

  // ---------------------------------------------------------------- lamps
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x2f3340, roughness: 0.6, metalness: 0.6,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x1a1408, emissive: 0xffc074, emissiveIntensity: 2.4,
  });
  // Both sides of the main avenue, plus both sides of every cross avenue.
  const lampCap = Math.ceil(W.STREET_LEN / W.LAMP.every) * 2
    + W.CROSS_VISIBLE * Math.ceil(W.CROSS_LEN / W.CROSS_LAMP_EVERY) * 2
    + W.BACK_STREETS.length * Math.ceil(W.BACK_LAMP_REACH * 2 / W.BACK_LAMP_EVERY + 1) * 2;
  const lamps = new THREE.InstancedMesh(geos.lamp.geo, lampMat, lampCap);
  const heads = new THREE.InstancedMesh(geos.lampHead.geo, headMat, lampCap);

  // ---------------------------------------------------------------- planting
  //
  // Both tree shapes share one material: the trunk/leaf split lives in the
  // geometry as vertex colours, so `setColorAt` on top of it tints the whole
  // tree without turning the trunk green -- three multiplies the instance
  // colour into the vertex colour rather than replacing it.
  const treeMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.94, metalness: 0,
  });
  const trees = [
    new THREE.InstancedMesh(geos.treeFull.geo, treeMat, W.TREE_CAP),
    new THREE.InstancedMesh(geos.treeYoung.geo, treeMat, W.TREE_CAP),
  ];

  // Medians are broken at every junction, so an avenue is several segments
  // rather than one strip -- hence a pool rather than one instance per avenue.
  const MEDIANS = W.MEDIAN_CAP;
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const medianKerb = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({
    color: W.MEDIAN_KERB_COLOR, roughness: 0.92,
  }), MEDIANS);
  const medianBed = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({
    color: W.MEDIAN_BED_COLOR, roughness: 0.95,
  }), MEDIANS);

  // --------------------------------------------------------------- furniture
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x33363f, roughness: 0.95 });
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xc9cbc0, roughness: 0.85 });
  const hydrantMat = new THREE.MeshStandardMaterial({
    color: W.HYDRANT.color, roughness: 0.6, metalness: 0.25,
  });
  const signalMat = new THREE.MeshStandardMaterial({
    color: 0x23262e, roughness: 0.65, metalness: 0.5,
  });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x1a0a06, emissive: 0xff6b2a, emissiveIntensity: 2.6,
  });
  const manholes = new THREE.InstancedMesh(geos.manhole.geo, stoneMat, W.STREET_FURNITURE_CAP);
  const hydrants = new THREE.InstancedMesh(geos.hydrant.geo, hydrantMat, W.STREET_FURNITURE_CAP);
  const signals = new THREE.InstancedMesh(geos.signal.geo, signalMat, W.CROSS_VISIBLE * 4);
  const lenses = new THREE.InstancedMesh(geos.signalLens.geo, lensMat, W.CROSS_VISIBLE * 4);
  const crossings = [
    new THREE.InstancedMesh(geos.crosswalk.geo, paintMat, W.CROSS_VISIBLE * 2),
    new THREE.InstancedMesh(geos.crosswalk.geo, paintMat, W.CROSS_VISIBLE * 2),
  ];
  /**
   * Overpasses and sign gantries, down the cross avenues only.
   *
   * A cross avenue is four hundred units of empty perspective, and every one
   * of them recedes the same way. Something crossing it part-way down breaks
   * that up and gives the eye a scale reference where there was none.
   *
   * Never over the main avenue: anything that looks solid near the player and
   * cannot be webbed is a lie about the world, and the near lanes are the only
   * place a player reads as reachable.
   */
  const spanMat = new THREE.MeshStandardMaterial({
    color: W.ELEVATED.color, roughness: 0.85, metalness: 0.25,
  });
  const gantries = new THREE.InstancedMesh(geos.gantry.geo, spanMat, W.CROSS_VISIBLE);

  /**
   * The elevated expressway: deck, parapets, piers and ramps.
   *
   * All plain boxes scaled per instance, so there is no geometry for any of it
   * in props.js -- the same approach the medians and the back-street kerbs use.
   * The deck and its parapets are single instances stretched the full length of
   * the road and recentred on the camera every frame, which is what gives it no
   * visible ends; the piers and ramps are pools placed on a world lattice.
   */
  const box = new THREE.BoxGeometry(1, 1, 1);
  const elevDeck = new THREE.InstancedMesh(box, spanMat, 1);
  const elevParapets = new THREE.InstancedMesh(box, spanMat, 2);
  const PIER_CAP = Math.ceil((W.ELEVATED.reach * 2) / W.ELEVATED.pier.every) + 2;
  const elevPiers = new THREE.InstancedMesh(box, spanMat, PIER_CAP);
  const RAMP_CAP = Math.ceil((W.ELEVATED.reach * 2)
    / (W.CROSS_SPACING * W.ELEVATED.ramp.everyAvenues)) + 2;
  const elevRamps = new THREE.InstancedMesh(box, spanMat, RAMP_CAP);
  const signTex = signTexture();
  const gantrySignMat = new THREE.MeshStandardMaterial({
    map: signTex, emissiveMap: signTex, emissive: 0xffffff,
    emissiveIntensity: W.GANTRY.glow, roughness: 0.8,
  });
  const gantrySigns = new THREE.InstancedMesh(geos.gantrySign.geo, gantrySignMat,
    W.CROSS_VISIBLE);

  /** Cars at the kerb. Static, so kept apart from the moving fleet. */
  const parked = new THREE.InstancedMesh(geos['body:car'].geo,
    new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.35 }),
    W.STREET_FURNITURE_CAP);

  /**
   * The cross avenues: a road surface laid down each gap in the facade.
   *
   * The texture is cloned from the main road so the two share one upload on the
   * GPU while getting their own `repeat` -- the markings have to run along the
   * length of each street, and the two streets run at right angles.
   */
  const crossTex = roadTex.clone();
  crossTex.repeat.set(1, W.CROSS_LEN / 40);
  crossTex.offset.set(0, 0);
  const crossGeo = new THREE.PlaneGeometry(W.CROSS_WIDTH, W.CROSS_LEN);
  crossGeo.rotateX(-Math.PI / 2);
  const crossRoads = new THREE.InstancedMesh(
    crossGeo,
    new THREE.MeshStandardMaterial({
      map: crossTex,
      roughness: W.ROAD_ROUGHNESS,
      metalness: W.ROAD_METALNESS,
      envMapIntensity: W.ROAD_ENV,
    }),
    W.CROSS_VISIBLE,
  );

  /**
   * Back streets: roads running along x, part-way down the avenues.
   *
   * The city was a comb -- one road along x and a row of avenues going back,
   * so an avenue ran four hundred units without meeting anything. These are the
   * cross members, and every one of them sits in a gap the building lanes
   * already leave, so nothing had to move to make room.
   *
   * Flat colour rather than the marked asphalt of the near roads: the closest
   * is a hundred units back and the furthest four hundred, where a lane marking
   * is well under a pixel and only adds shimmer. What reads at that range is
   * the lamps and the traffic, which is where the budget goes instead.
   */
  const backGeo = new THREE.PlaneGeometry(1, 1);
  backGeo.rotateX(-Math.PI / 2);
  const backKerbs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: W.BACK_KERB.color, roughness: 0.95 }),
    W.BACK_STREETS.length * 2,
  );
  const backRoads = new THREE.InstancedMesh(
    backGeo,
    new THREE.MeshStandardMaterial({
      color: W.BACK_ROAD_COLOR,
      roughness: W.ROAD_ROUGHNESS,
      metalness: W.ROAD_METALNESS,
      envMapIntensity: W.ROAD_ENV,
    }),
    W.BACK_STREETS.length,
  );

  /**
   * Traffic: real vehicles rather than the abstract streaks this started as.
   *
   * `setColorAt` does the paint, so a yellow cab, a police car and an ordinary
   * saloon are one mesh with three tints. Headlights and taillights are
   * separate instanced meshes sharing each vehicle's matrix, which means one
   * driving away shows red and one coming toward you shows white without
   * anything anywhere deciding that it should.
   */
  const carMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 });
  const signMat = new THREE.MeshStandardMaterial({
    color: 0x3a2a06, emissive: W.TAXI_COLOR, emissiveIntensity: 2.2,
  });
  const headLampMat = new THREE.MeshBasicMaterial({ color: W.HEADLIGHT, fog: true });
  const tailLampMat = new THREE.MeshBasicMaterial({ color: W.TAILLIGHT, fog: true });
  const CARS = W.AVENUE_CARS + W.CROSS_VISIBLE * W.CROSS_CARS
    + W.BACK_STREETS.length * W.BACK_CARS;
  /**
   * One body mesh and two lamp meshes per *shape*, not per type -- a police car
   * and a taxi are the same geometry with different paint, so the seven kinds
   * of vehicle in VEHICLE_TYPES cost four bodies between them.
   *
   * Each pool is sized for the whole fleet because the mix is hashed, not
   * fixed: nothing stops a stretch of avenue from being all buses, and a pool
   * sized for the average would silently drop the tail of that distribution.
   * The same reason `signs` is sized for every car being a cab.
   */
  const shapePools = new Map();
  for (const shape of Object.keys(W.VEHICLE_SHAPES)) {
    shapePools.set(shape, {
      body: new THREE.InstancedMesh(geos[`body:${shape}`].geo, carMat, CARS),
      head: new THREE.InstancedMesh(geos[`head:${shape}`].geo, headLampMat, CARS),
      tail: new THREE.InstancedMesh(geos[`tail:${shape}`].geo, tailLampMat, CARS),
      n: 0,
    });
  }
  const fleetMeshes = [...shapePools.values()].flatMap((g) => [g.body, g.head, g.tail]);
  const signs = new THREE.InstancedMesh(geos.taxiSign.geo, signMat, CARS);
  /** Light bars. Basic material, so `setColorAt` is the strobe -- see BEACON. */
  const beacons = new THREE.InstancedMesh(
    geos.beacon.geo, new THREE.MeshBasicMaterial({ fog: true }), CARS);

  /**
   * Pedestrians: one shared material, three geometries -- standing and a
   * stride leading with each leg -- because a walk cycle cannot be baked into
   * a single mesh the way a car's colour can. Which of the three an instance
   * draws in changes every frame (see `emitPed`), so the three pools are sized
   * for the worst case, every pedestrian in the same pose at once, same as
   * `signs` is sized for every car being a cab.
   */
  const pedMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 });
  const PEDS = W.AVENUE_PEDS + W.CROSS_VISIBLE * W.CROSS_PEDS;
  const pedMeshes = [
    new THREE.InstancedMesh(geos.pedStand.geo, pedMat, PEDS),
    new THREE.InstancedMesh(geos.pedStrideA.geo, pedMat, PEDS),
    new THREE.InstancedMesh(geos.pedStrideB.geo, pedMat, PEDS),
  ];

  for (const m of [lamps, heads, ...trees, medianKerb, medianBed, crossRoads,
    ...fleetMeshes, signs, beacons,
    ...sidewalks, manholes, hydrants, signals, lenses, ...crossings, parked,
    gantries, gantrySigns, backRoads, backKerbs, ...pedMeshes,
    elevDeck, elevParapets, elevPiers, elevRamps]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    group.add(m);
  }
  // Selective on purpose: the shadow pass costs a second draw of everything it
  // touches, and a car's shadow at this distance is a few pixels nobody will
  // ever see. Trees and the road surface are where it actually reads.
  for (const m of [...trees, hydrants, signals, parked, gantries]) {
    m.castShadow = true;
  }
  for (const m of [...trees, crossRoads, medianKerb, medianBed,
    ...sidewalks, ...crossings, manholes, backRoads, backKerbs]) m.receiveShadow = true;

  /**
   * Shared temporaries, reused every frame so nothing allocates in the loop.
   *
   * `scl` is the *unit* scale and must stay that way -- the car, lamp and road
   * placement all pass it to `compose()` read-only. Planting briefly mutated it
   * and left it at a 470-unit median scale, so on the following frame a taxi's
   * headlights were composed at that scale and drew as an enormous glowing
   * streak down the avenue. Anything that needs a real scale uses `scale`.
   */
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3(W.UNIT.x, W.UNIT.y, W.UNIT.z);
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(W.UP.x, W.UP.y, W.UP.z);
  // Ramps tilt about z: rotating the deck's own +x axis up or down.
  const zAxis = new THREE.Vector3(W.AXIS_Z.x, W.AXIS_Z.y, W.AXIS_Z.z);
  const paint = new THREE.Color();
  const tint = new THREE.Color();
  // Base colours kept so the day/night level can scale them without the value
  // decaying a little further every frame it is applied.
  const headBase = new THREE.Color(W.HEADLIGHT);
  const tailBase = new THREE.Color(W.TAILLIGHT);

  const stats = { lamps: 0, cars: 0, taxis: 0, emergency: 0, avenues: 0, trees: 0,
    furniture: 0, spans: 0, back: 0, medians: 0, pedestrians: 0, viaduct: 0 };
  const treeCounts = [0, 0];
  let crossFleets = [];
  let lastCrossBase = null;
  let lastLampAnchor = null;
  let t = 0;

  /**
   * A vehicle's fixed character, derived from where it is rather than stored.
   *
   * Cars are identified by (avenue, slot), so the cab three blocks ahead is the
   * same cab when you get there. Only its position along the street is
   * integrated; everything else is hashed, which is the same trick the
   * buildings use and for the same reason.
   */
  /** The weighted roll over VEHICLE_TYPES, walked cumulatively. */
  function pickType(r) {
    let acc = 0;
    for (const type of W.VEHICLE_TYPES) {
      acc += type.weight;
      if (r < acc) return type;
    }
    return W.VEHICLE_TYPES[0];
  }

  function describeCar(key, slot) {
    const rand = rngFor(SEED, 'car', key, slot);
    const dir = rand() < 0.5 ? 1 : -1;
    const type = pickType(rand());
    const palette = type.shape === 'van' ? W.VAN_COLORS : W.CAR_COLORS;
    const pace = W.VEHICLE.minSpeed + rand() * (W.VEHICLE.maxSpeed - W.VEHICLE.minSpeed);
    return {
      dir,
      type,
      lane: dir * W.VEHICLE.lane * (0.7 + rand() * 0.5),
      speed: pace * type.speed,
      offset: rand(),
      taxi: type.roofSign === true,
      // A type either names its own colour or draws one from the palette its
      // shape implies -- a van is white or a trade colour, a car is not.
      colour: type.color ?? palette[(rand() * palette.length) | 0],
      // So a line of stopped police cars does not strobe as one machine.
      beaconPhase: rand() * Math.PI * 2,
    };
  }

  const avenueCars = [];
  for (let i = 0; i < W.AVENUE_CARS; i++) avenueCars.push(describeCar('avenue', i));
  // One fleet per back street. Hashed on the street's own z, so the traffic two
  // blocks back is the same traffic every time you look at it.
  const backFleets = W.BACK_STREETS.map((st) => {
    const fleet = [];
    for (let i = 0; i < W.BACK_CARS; i++) fleet.push(describeCar(`back${st.z}`, i));
    return { street: st, fleet };
  });

  // Traffic on the viaduct. Hashed on its own key, so the deck carries the same
  // vehicles every time you look at it -- and it is the traffic more than the
  // structure that says the thing is a road rather than a wall in the sky.
  const elevatedCars = [];
  for (let i = 0; i < W.ELEVATED.cars; i++) elevatedCars.push(describeCar('elevated', i));

  /**
   * A pedestrian's fixed character. `side` picks which of a pavement's two
   * edges they walk, `lane` scatters them across its width so a pavement is
   * not a single-file line, and `phase` offsets their stride so a crowd does
   * not step in unison -- see `emitPed`.
   */
  function describePedestrian(key, slot) {
    const rand = rngFor(SEED, 'ped', key, slot);
    const standing = rand() < W.PED_STAND_CHANCE;
    return {
      dir: rand() < 0.5 ? 1 : -1,
      side: rand() < 0.5 ? -1 : 1,
      speed: standing ? 0 : W.PED_SPEED.min + rand() * (W.PED_SPEED.max - W.PED_SPEED.min),
      offset: rand(),
      lane: (rand() - 0.5) * W.PED_LANE,
      phase: rand() * Math.PI * 2,
      colour: W.PED_COLORS[(rand() * W.PED_COLORS.length) | 0],
    };
  }

  const avenuePeds = [];
  for (let i = 0; i < W.AVENUE_PEDS; i++) avenuePeds.push(describePedestrian('avenue', i));

  /**
   * Place one pedestrian in whichever of the three pose meshes their stride
   * calls for this frame, and advance that mesh's running count.
   *
   * A standing pedestrian always draws in the standing pool. A walking one
   * alternates on the sign of its own stride wave -- `t * strideRate * speed`
   * so a fast walker's legs turn over faster than a slow one's, plus a
   * per-pedestrian `phase` so the whole pavement is not in step.
   */
  function emitPed(ped, x, y, z, headingZ, counts) {
    const moving = ped.speed > 0;
    const stride = moving ? Math.sin(t * W.PED.strideRate * ped.speed + ped.phase) : 0;
    const pose = !moving ? 0 : (stride >= 0 ? 1 : 2);
    quat.setFromAxisAngle(yAxis, headingZ ? (ped.dir < 0 ? Math.PI : 0)
      : (ped.dir < 0 ? -Math.PI / 2 : Math.PI / 2));
    m4.compose(pos.set(x, y, z), quat, scl);
    const n = counts[pose]++;
    pedMeshes[pose].setMatrixAt(n, m4);
    paint.setHex(ped.colour, THREE.SRGBColorSpace);
    pedMeshes[pose].setColorAt(n, paint);
  }

  /**
   * Place one vehicle, its lights, and whatever is on its roof.
   *
   * `n` is no longer a fleet-wide index: each shape has its own pool and its
   * own running count, because which mesh a vehicle lands in depends on what
   * it is. The caller no longer needs to know or care.
   */
  function emit(car, x, y, z, headingZ) {
    const shape = shapePools.get(car.type.shape);
    quat.setFromAxisAngle(yAxis, headingZ ? (car.dir < 0 ? Math.PI : 0)
      : (car.dir < 0 ? -Math.PI / 2 : Math.PI / 2));
    m4.compose(pos.set(x, y, z), quat, scl);

    const n = shape.n++;
    shape.body.setMatrixAt(n, m4);
    paint.setHex(car.colour, THREE.SRGBColorSpace);
    shape.body.setColorAt(n, paint);
    shape.head.setMatrixAt(n, m4);
    shape.tail.setMatrixAt(n, m4);

    const roofY = y + W.VEHICLE_SHAPES[car.type.shape].roof;
    if (car.type.roofSign) {
      m4.compose(pos.set(x, roofY + W.VEHICLE.sign.h / 2, z), quat, scl);
      signs.setMatrixAt(stats.taxis, m4);
      stats.taxis++;
    }
    if (car.type.beacon) {
      m4.compose(pos.set(x, roofY + W.BEACON.h / 2, z), quat, scl);
      beacons.setMatrixAt(stats.emergency, m4);
      // Two colours alternate on the sign of the wave; one pulses against it.
      // Either way the strobe is the *colour*, because a basic material has no
      // separate brightness to animate and an InstancedMesh has one of those
      // for the whole batch anyway.
      const wave = Math.sin(t * W.BEACON.rate + car.beaconPhase);
      const bars = car.type.beacon;
      tint.setHex(bars[wave >= 0 ? 0 : bars.length - 1], THREE.SRGBColorSpace);
      if (bars.length === 1 && wave < 0) tint.multiplyScalar(W.BEACON.dim);
      beacons.setColorAt(stats.emergency, tint);
      stats.emergency++;
    }
  }

  /**
   * Plant one tree, choosing its shape, size and shade from its own position.
   *
   * Hashed rather than stored, like everything else here, so the tree outside a
   * given doorway is the same tree every time you pass it -- and so nothing
   * shuffles when the visible span is rebuilt.
   */
  /**
   * Is this point inside a junction?
   *
   * A point that lies on *two* roadways at once is a crossing, and nothing --
   * no median, no tree -- may stand in one. A point on a single road's median
   * or kerb is perfectly fine, which is why the test is an intersection of the
   * three road families rather than a union of them.
   *
   * One predicate covers every planted thing in this file: the main avenue's
   * kerb trees and median run along x and are cut by the cross avenues; a cross
   * avenue's pavement trees and median run along z and are cut by the main
   * avenue and by every back street.
   */
  function inJunction(x, z) {
    const dx = Math.abs(x - Math.round(x / W.CROSS_SPACING) * W.CROSS_SPACING);
    const onCross = dx < W.CROSS_WIDTH / 2 + W.JUNCTION_CLEAR;
    if (!onCross) return false;

    if (Math.abs(z - W.PLAYER_Z) < W.STREET_HALF_W + W.JUNCTION_CLEAR) return true;
    for (const st of W.BACK_STREETS) {
      if (Math.abs(z - st.z) < st.w / 2 + W.JUNCTION_CLEAR) return true;
    }
    return false;
  }

  function plantTree(key, slot, x, z) {
    if (inJunction(x, z)) return;
    const rand = rngFor(SEED, 'tree', key, slot);
    const shape = rand() < 0.62 ? 0 : 1;
    const mesh = trees[shape];
    const n = treeCounts[shape];
    if (n >= W.TREE_CAP) return;

    const size = W.TREE.scaleMin + rand() * (W.TREE.scaleMax - W.TREE.scaleMin);
    m4.compose(
      pos.set(x, W.STREET_Y, z),
      quat.setFromAxisAngle(yAxis, rand() * Math.PI * 2),
      scale.set(size, size * (0.9 + rand() * 0.28), size),
    );
    mesh.setMatrixAt(n, m4);
    // Kept close to white and varied mostly in brightness: a wide hue spread
    // here would tint the trunks as well as the leaves.
    const v = 0.72 + rand() * 0.5;
    tint.setRGB(v * (0.9 + rand() * 0.14), v, v * (0.82 + rand() * 0.2));
    mesh.setColorAt(n, tint);
    treeCounts[shape] = n + 1;
  }

  /**
   * The pavement, the markings and everything standing on them.
   *
   * Rebuilt on the same trigger as the lamps and trees, and placed on a world
   * grid hashed from position -- so the hydrant outside a given doorway is the
   * same hydrant every time you pass it, and nothing shuffles when the visible
   * span moves.
   */
  function furnish(camX, centreZ) {
    let pave = 0;
    let paveZ = 0;
    let hole = 0;
    let hyd = 0;
    let park = 0;
    let sig = 0;
    let crossX = 0;
    let crossZ = 0;
    const yPave = W.STREET_Y + W.SIDEWALK_H / 2;
    const mid = W.STREET_HALF_W + W.SIDEWALK_W / 2;

    // --- the pavement, both sides of the avenue and of every cross street ---
    for (const side of [-1, 1]) {
      m4.compose(pos.set(camX, yPave, W.PLAYER_Z + side * mid), quat.identity(),
        scale.set(W.STREET_LEN, W.SIDEWALK_H, W.SIDEWALK_W));
      sidewalks[0].setMatrixAt(pave++, m4);
    }
    for (const av of crossFleets) {
      for (const side of [-1, 1]) {
        m4.compose(
          pos.set(av.x + side * (W.CROSS_WIDTH / 2 + W.SIDEWALK_W / 2), yPave, centreZ),
          quat.identity(),
          scale.set(W.SIDEWALK_W, W.SIDEWALK_H, W.CROSS_LEN),
        );
        sidewalks[1].setMatrixAt(paveZ++, m4);
      }
    }

    // --- markings and ironwork on the road ---------------------------------
    const from = Math.floor((camX - W.TREE.streetReach) / W.MANHOLE.every);
    const to = Math.ceil((camX + W.TREE.streetReach) / W.MANHOLE.every);
    for (let i = from; i <= to && hole < W.STREET_FURNITURE_CAP; i++) {
      const rand = rngFor(SEED, 'hole', i);
      m4.compose(
        pos.set(i * W.MANHOLE.every + (rand() - 0.5) * 12, W.STREET_Y + 0.01,
          W.PLAYER_Z + (rand() - 0.5) * W.STREET_HALF_W * 1.4),
        quat.identity(), scl,
      );
      manholes.setMatrixAt(hole++, m4);
    }

    for (const av of crossFleets) {
      // A crossing either side of each junction, on both streets.
      for (const side of [-1, 1]) {
        if (crossX < crossings[0].instanceMatrix.count) {
          m4.compose(pos.set(av.x + side * W.CROSSWALK.inset, W.STREET_Y + 0.02, W.PLAYER_Z),
            quat.identity(), scale.set(1, 1, W.STREET_HALF_W * 2 / W.CROSSWALK.depth));
          crossings[0].setMatrixAt(crossX++, m4);
        }
        if (crossZ < crossings[1].instanceMatrix.count) {
          m4.compose(pos.set(av.x, W.STREET_Y + 0.02, W.PLAYER_Z - side * W.CROSSWALK.inset),
            quat.setFromAxisAngle(yAxis, Math.PI / 2),
            scale.set(1, 1, W.CROSS_WIDTH / W.CROSSWALK.depth));
          crossings[1].setMatrixAt(crossZ++, m4);
        }
      }
      // Signals on the corners, arms reaching over the roadway.
      for (const side of [-1, 1]) {
        if (sig >= signals.instanceMatrix.count) break;
        const x = av.x + side * (W.CROSS_WIDTH / 2 + 1.6);
        const z = W.PLAYER_Z + side * (W.STREET_HALF_W + 1.4);
        quat.setFromAxisAngle(yAxis, side > 0 ? Math.PI : 0);
        m4.compose(pos.set(x, W.STREET_Y + W.SIDEWALK_H, z), quat, scl);
        signals.setMatrixAt(sig, m4);
        m4.compose(
          pos.set(x - side * W.SIGNAL.arm, W.STREET_Y + W.SIDEWALK_H + W.SIGNAL.post
            - W.SIGNAL.head.h * 0.6, z + W.SIGNAL.head.d * 0.5),
          quat.identity(), scl,
        );
        lenses.setMatrixAt(sig, m4);
        sig++;
      }
    }

    // --- things standing on the pavement -----------------------------------
    const hFrom = Math.floor((camX - W.TREE.streetReach) / W.HYDRANT.every);
    const hTo = Math.ceil((camX + W.TREE.streetReach) / W.HYDRANT.every);
    for (let i = hFrom; i <= hTo && hyd < W.STREET_FURNITURE_CAP; i++) {
      const rand = rngFor(SEED, 'hyd', i);
      const side = rand() < 0.5 ? -1 : 1;
      m4.compose(
        pos.set(i * W.HYDRANT.every + (rand() - 0.5) * 20, W.STREET_Y + W.SIDEWALK_H,
          W.PLAYER_Z + side * (W.STREET_HALF_W + 1.3)),
        quat.setFromAxisAngle(yAxis, rand() * Math.PI * 2), scl,
      );
      hydrants.setMatrixAt(hyd++, m4);
    }

    // Cars at the kerb, nose to tail, with gaps where the hydrants are.
    const pFrom = Math.floor((camX - W.TREE.streetReach) / W.PARKED.every);
    const pTo = Math.ceil((camX + W.TREE.streetReach) / W.PARKED.every);
    for (let i = pFrom; i <= pTo && park < W.STREET_FURNITURE_CAP; i++) {
      for (const side of [-1, 1]) {
        const rand = rngFor(SEED, 'park', i, side);
        if (rand() > W.PARKED.chance || park >= W.STREET_FURNITURE_CAP) continue;
        paint.setHex(rand() < W.TAXI_RATIO * 0.5 ? W.TAXI_COLOR
          : W.CAR_COLORS[(rand() * W.CAR_COLORS.length) | 0], THREE.SRGBColorSpace);
        m4.compose(
          pos.set(i * W.PARKED.every, W.STREET_Y,
            W.PLAYER_Z + side * (W.STREET_HALF_W - W.PARKED.lateral)),
          quat.setFromAxisAngle(yAxis, side > 0 ? -Math.PI / 2 : Math.PI / 2), scl,
        );
        parked.setMatrixAt(park, m4);
        parked.setColorAt(park, paint);
        park++;
      }
    }

    // --- sign gantries, part-way down some avenues ------------------------
    let gant = 0;
    for (const av of crossFleets) {
      const rand = rngFor(SEED, 'span', av.index);
      if (rand() < W.GANTRY.chance && gant < gantries.instanceMatrix.count) {
        const z = W.GANTRY.zNear - rand() * W.GANTRY.zSpan;
        m4.compose(pos.set(av.x, W.STREET_Y, z), quat.identity(), scl);
        gantries.setMatrixAt(gant, m4);
        gantrySigns.setMatrixAt(gant, m4);
        gant++;
      }
    }
    gantries.count = gant;
    gantrySigns.count = gant;
    for (const m of [gantries, gantrySigns]) m.instanceMatrix.needsUpdate = true;

    sidewalks[0].count = pave;
    sidewalks[1].count = paveZ;
    manholes.count = hole;
    hydrants.count = hyd;
    signals.count = sig;
    lenses.count = sig;
    crossings[0].count = crossX;
    crossings[1].count = crossZ;
    parked.count = park;
    for (const m of [...sidewalks, manholes, hydrants, signals, lenses,
      ...crossings, parked]) m.instanceMatrix.needsUpdate = true;
    if (parked.instanceColor) parked.instanceColor.needsUpdate = true;
    stats.furniture = hole + hyd + sig + park + crossX + crossZ;
    stats.spans = gant;
  }

  /** Everything green, rebuilt when the visible span moves. */
  function plant(camX, centreZ) {
    treeCounts[0] = 0;
    treeCounts[1] = 0;

    // --- the main avenue: kerb trees both sides, plus its median -----------
    const first = Math.floor((camX - W.TREE.streetReach) / W.TREE.everyStreet);
    const last = Math.ceil((camX + W.TREE.streetReach) / W.TREE.everyStreet);
    for (let i = first; i <= last; i++) {
      const x = i * W.TREE.everyStreet;
      for (const side of [-1, 1]) {
        plantTree('street', `${i}:${side}`,
          x, W.PLAYER_Z + side * (W.STREET_HALF_W - 2.6));
      }
    }
    for (let i = first; i <= last; i++) {
      plantTree('median', i, i * W.MEDIAN.treeEvery, W.PLAYER_Z);
    }

    // --- each cross avenue: trees down both pavements, and its median ------
    for (const av of crossFleets) {
      let slot = 0;
      for (let z = W.CROSS_NEAR_Z; z > W.CROSS_NEAR_Z - W.CROSS_LEN;
        z -= W.TREE.everyAvenue) {
        for (const side of [-1, 1]) {
          plantTree(av.index, `s${slot}:${side}`,
            av.x + side * (W.CROSS_WIDTH / 2 - 1.9), z);
        }
        slot++;
      }
      let m = 0;
      for (let z = W.CROSS_NEAR_Z; z > W.CROSS_NEAR_Z - W.CROSS_LEN;
        z -= W.MEDIAN.treeEvery) {
        plantTree(av.index, `m${m++}`, av.x, z);
      }
    }

    // Median strips: a kerb with a planted bed sitting on it, broken at every
    // junction. It used to be one box per avenue running the whole length,
    // which put grass straight across every crossing.
    const kerbY = W.STREET_Y + W.MEDIAN.kerbH / 2;
    const bedY = W.STREET_Y + W.MEDIAN.kerbH + W.MEDIAN.bedH / 2;
    let slotIndex = 0;

    /** One length of median between two junctions, centred on the varying axis. */
    const segment = (from, to, fixed, alongX) => {
      const len = to - from;
      if (len < W.MEDIAN.minSegment || slotIndex >= W.MEDIAN_CAP) return;
      const mid = (from + to) / 2;
      const x = alongX ? mid : fixed;
      const z = alongX ? fixed : mid;
      const w = alongX ? len : W.MEDIAN.w;
      const d = alongX ? W.MEDIAN.w : len;
      m4.compose(pos.set(x, kerbY, z), quat.identity(), scale.set(w, W.MEDIAN.kerbH, d));
      medianKerb.setMatrixAt(slotIndex, m4);
      m4.compose(pos.set(x, bedY, z), quat.identity(),
        scale.set(alongX ? w : w * 0.78, W.MEDIAN.bedH, alongX ? d * 0.78 : d));
      medianBed.setMatrixAt(slotIndex, m4);
      slotIndex++;
    };

    /** Whatever is left of [lo, hi] once the blocked ranges are cut out of it. */
    const gaps = (lo, hi, blocks, emit) => {
      let at = lo;
      for (const [a, b] of blocks.sort((p, q) => p[0] - q[0])) {
        if (b <= at) continue;
        if (a >= hi) break;
        if (a > at) emit(at, a);
        at = b;
      }
      if (at < hi) emit(at, hi);
    };

    // The main avenue, cut by every cross avenue it passes.
    const halfCross = W.CROSS_WIDTH / 2 + W.JUNCTION_CLEAR;
    const lo = camX - W.STREET_LEN / 2;
    const hi = camX + W.STREET_LEN / 2;
    const crossBlocks = [];
    for (let i = Math.floor(lo / W.CROSS_SPACING); i <= Math.ceil(hi / W.CROSS_SPACING); i++) {
      const c = i * W.CROSS_SPACING;
      crossBlocks.push([c - halfCross, c + halfCross]);
    }
    gaps(lo, hi, crossBlocks, (a, b) => segment(a, b, W.PLAYER_Z, true));

    // Every cross avenue, cut by the main road and by each back street.
    const backBlocks = [[
      W.PLAYER_Z - W.STREET_HALF_W - W.JUNCTION_CLEAR,
      W.PLAYER_Z + W.STREET_HALF_W + W.JUNCTION_CLEAR,
    ]];
    for (const st of W.BACK_STREETS) {
      backBlocks.push([st.z - st.w / 2 - W.JUNCTION_CLEAR,
        st.z + st.w / 2 + W.JUNCTION_CLEAR]);
    }
    for (const av of crossFleets) {
      gaps(W.CROSS_NEAR_Z - W.CROSS_LEN, W.CROSS_NEAR_Z, backBlocks.slice(),
        (a, b) => segment(a, b, av.x, false));
    }

    medianKerb.count = slotIndex;
    medianBed.count = slotIndex;
    stats.medians = slotIndex;
    medianKerb.instanceMatrix.needsUpdate = true;
    medianBed.instanceMatrix.needsUpdate = true;

    for (let k = 0; k < trees.length; k++) {
      trees[k].count = treeCounts[k];
      trees[k].instanceMatrix.needsUpdate = true;
      if (trees[k].instanceColor) trees[k].instanceColor.needsUpdate = true;
    }
    stats.trees = treeCounts[0] + treeCounts[1];
  }

  return {
    stats,

    /**
     * Turn the street lighting up and down with the sky. 1 at night, 0 at noon.
     *
     * Car lamps keep a tenth of their brightness in full sun rather than going
     * out entirely -- daytime running lights, and without them the traffic
     * loses the only thing that made it legible at distance.
     */
    setNight(level) {
      headMat.emissiveIntensity = 2.4 * level;
      signMat.emissiveIntensity = 2.2 * level;
      lensMat.emissiveIntensity = 2.6 * (0.35 + 0.65 * level);
      // Retroreflective rather than lit: a highway sign has no lamp of its own,
      // it throws back whatever hits it. So it lifts at night and goes flat by
      // day, which is the opposite of how the windows behave.
      gantrySignMat.emissiveIntensity = W.GANTRY.glow * (0.15 + 0.85 * level);
      const carLight = 0.1 + 0.9 * level;
      headLampMat.color.copy(headBase).multiplyScalar(carLight);
      tailLampMat.color.copy(tailBase).multiplyScalar(carLight);
    },

    update(camX, dt) {
      t += dt;

      // The road slab and its markings follow the camera; scrolling the texture
      // by the same amount keeps the asphalt itself stationary in world space,
      // so it does not slide under the buildings.
      road.position.x = camX;
      roadTex.offset.x = camX / 40;

      // The back streets ride with the camera too. Flat colour, so unlike the
      // main road there is no texture offset to keep in step with them.
      let kerb = 0;
      W.BACK_STREETS.forEach((st, i) => {
        m4.compose(pos.set(camX, W.STREET_Y, st.z), quat.identity(),
          scale.set(W.BACK_STREET_LEN, 1, st.w));
        backRoads.setMatrixAt(i, m4);
        const kw = st.w * W.BACK_KERB.frac;
        for (const side of [-1, 1]) {
          m4.compose(
            pos.set(camX, W.STREET_Y + W.BACK_KERB.h / 2, st.z + side * (st.w + kw) / 2),
            quat.identity(), scale.set(W.BACK_STREET_LEN, W.BACK_KERB.h, kw),
          );
          backKerbs.setMatrixAt(kerb++, m4);
        }
      });
      backRoads.count = W.BACK_STREETS.length;
      backKerbs.count = kerb;
      backRoads.instanceMatrix.needsUpdate = true;
      backKerbs.instanceMatrix.needsUpdate = true;
      stats.back = W.BACK_STREETS.length;

      // --- the elevated expressway ------------------------------------------
      //
      // Rides with the camera like the roads below it, so the deck has no ends
      // to see. Everything here is a scaled box: one deck, two parapets, a
      // rhythm of piers on a world lattice, and a ramp every few hundred units
      // running down to the street underneath.
      const E = W.ELEVATED;
      const deckMid = E.y - E.deckH / 2;
      m4.compose(pos.set(camX, deckMid, E.z), quat.identity(),
        scale.set(W.BACK_STREET_LEN, E.deckH, E.w));
      elevDeck.setMatrixAt(0, m4);
      elevDeck.count = 1;

      for (const side of [-1, 1]) {
        m4.compose(
          pos.set(camX, E.y + E.parapet.h / 2, E.z + side * (E.w - E.parapet.t) / 2),
          quat.identity(), scale.set(W.BACK_STREET_LEN, E.parapet.h, E.parapet.t),
        );
        elevParapets.setMatrixAt(side < 0 ? 0 : 1, m4);
      }
      elevParapets.count = 2;

      // Piers on a world lattice rather than relative to the camera, so a given
      // pier stays put as you fly past it instead of sliding along with you.
      let pier = 0;
      const clear = E.y - E.deckH;
      const pFrom = Math.floor((camX - E.reach) / E.pier.every);
      const pTo = Math.ceil((camX + E.reach) / E.pier.every);
      for (let i = pFrom; i <= pTo && pier < PIER_CAP; i++) {
        m4.compose(pos.set(i * E.pier.every, clear / 2, E.z), quat.identity(),
          scale.set(E.pier.w, clear, E.pier.d));
        elevPiers.setMatrixAt(pier++, m4);
      }
      elevPiers.count = pier;

      /**
       * Ramps. A box scaled to the slope's own length and tilted about z, so
       * its top edge meets the deck and its bottom edge meets the road below --
       * the length has to be the hypotenuse or the ends float. Which way a ramp
       * faces is hashed from its site, so half are on-ramps and half are off.
       */
      let ramp = 0;
      const rampEvery = W.CROSS_SPACING * E.ramp.everyAvenues;
      const rise = E.y - W.STREET_Y;
      const slope = Math.atan2(rise, E.ramp.run);
      const rFrom = Math.floor((camX - E.reach) / rampEvery);
      const rTo = Math.ceil((camX + E.reach) / rampEvery);
      for (let i = rFrom; i <= rTo && ramp < RAMP_CAP; i++) {
        const rand = rngFor(SEED, 'ramp', i);
        // Which way it climbs, and which side of the deck it runs down.
        const dir = rand() < 0.5 ? 1 : -1;
        const side = rand() < 0.5 ? 1 : -1;
        // The foot sits on the junction, so the part framed by the avenue is
        // the part that matters: the road meeting the ground.
        const foot = i * rampEvery;
        m4.compose(
          pos.set(foot + dir * E.ramp.run / 2, W.STREET_Y + rise / 2,
            E.z + side * (E.w + E.ramp.w) / 2),
          // Tilted about z, so the box's own length is what rises. Its length
          // has to be the hypotenuse or the ends hang off the deck and the road.
          quat.setFromAxisAngle(zAxis, dir * slope),
          scale.set(Math.hypot(E.ramp.run, rise), E.ramp.deckH, E.ramp.w),
        );
        elevRamps.setMatrixAt(ramp++, m4);
      }
      elevRamps.count = ramp;

      for (const m of [elevDeck, elevParapets, elevPiers, elevRamps]) {
        m.instanceMatrix.needsUpdate = true;
      }
      stats.viaduct = 1 + 2 + pier + ramp;

      // --- cross avenues, and the fleets on them ---------------------------
      const base = Math.round(camX / W.CROSS_SPACING);
      const half = (W.CROSS_VISIBLE - 1) / 2;
      const centreZ = W.CROSS_NEAR_Z - W.CROSS_LEN / 2;
      // Captured before lastCrossBase is updated: the lamp rebuild below needs
      // to know a junction was crossed, and by then the flag has been cleared.
      const crossChanged = base !== lastCrossBase;
      if (crossChanged) {
        lastCrossBase = base;
        crossFleets = [];
        for (let k = -half; k <= half; k++) {
          const index = base + k;
          const fleet = [];
          for (let i = 0; i < W.CROSS_CARS; i++) fleet.push(describeCar(index, i));
          const peds = [];
          for (let i = 0; i < W.CROSS_PEDS; i++) peds.push(describePedestrian(index, i));
          crossFleets.push({ index, x: index * W.CROSS_SPACING, fleet, peds });
        }
        crossFleets.forEach((av, i) => {
          m4.compose(pos.set(av.x, W.STREET_Y + 0.02, centreZ), quat.identity(), scl);
          crossRoads.setMatrixAt(i, m4);
        });
        crossRoads.count = crossFleets.length;
        crossRoads.instanceMatrix.needsUpdate = true;
        stats.avenues = crossFleets.length;
      }

      for (const pool of shapePools.values()) pool.n = 0;
      stats.taxis = 0;
      stats.emergency = 0;

      for (const av of crossFleets) {
        for (const car of av.fleet) {
          // Wrapped along the length of the avenue, so a handful of cars serve
          // a street that runs out of sight.
          const travel = (car.offset * W.CROSS_LEN + t * car.speed * car.dir) % W.CROSS_LEN;
          const z = W.CROSS_NEAR_Z - ((travel + W.CROSS_LEN) % W.CROSS_LEN);
          emit(car, av.x + car.lane, W.STREET_Y, z, true);
        }
      }

      for (const car of avenueCars) {
        const span = W.STREET_LEN;
        const travel = (car.offset * span + t * car.speed * car.dir) % span;
        const x = camX - span / 2 + ((travel + span) % span);
        emit(car, x, W.STREET_Y, W.PLAYER_Z + car.lane, false);
      }

      // Traffic crossing the avenues, part-way back. These are the lights that
      // actually say "junction": a row of points sliding across a gap you are
      // looking down, which is something no static geometry can do.
      for (const { street, fleet } of backFleets) {
        for (const car of fleet) {
          const span = W.BACK_STREET_LEN;
          const travel = (car.offset * span + t * car.speed * car.dir) % span;
          const x = camX - span / 2 + ((travel + span) % span);
          emit(car, x, W.STREET_Y, street.z + car.lane * (street.w / W.CROSS_WIDTH),
            false);
        }
      }

      // Traffic on the viaduct. Same wrap as the streets below, just at deck
      // height -- which is the whole point of building it as a road.
      for (const car of elevatedCars) {
        const span = W.BACK_STREET_LEN;
        const travel = (car.offset * span + t * car.speed * car.dir) % span;
        const x = camX - span / 2 + ((travel + span) % span);
        emit(car, x, W.ELEVATED.y, W.ELEVATED.z + car.lane * (W.ELEVATED.w / W.CROSS_WIDTH),
          false);
      }

      let drawn = 0;
      for (const pool of shapePools.values()) {
        pool.body.count = pool.n;
        pool.head.count = pool.n;
        pool.tail.count = pool.n;
        pool.body.instanceMatrix.needsUpdate = true;
        if (pool.body.instanceColor) pool.body.instanceColor.needsUpdate = true;
        pool.head.instanceMatrix.needsUpdate = true;
        pool.tail.instanceMatrix.needsUpdate = true;
        drawn += pool.n;
      }
      signs.count = stats.taxis;
      beacons.count = stats.emergency;
      signs.instanceMatrix.needsUpdate = true;
      beacons.instanceMatrix.needsUpdate = true;
      if (beacons.instanceColor) beacons.instanceColor.needsUpdate = true;
      stats.cars = drawn;


      // --- pedestrians, on every pavement in view ---------------------------
      //
      // On the same continuous strips the sidewalks themselves are drawn as
      // (see `furnish`): a pedestrian walking the length of an avenue passes
      // over every junction along it exactly as the pavement it is standing on
      // already does, so there is nothing to cut around here the way the
      // medians needed.
      const pavementY = W.STREET_Y + W.SIDEWALK_H;
      const pedCounts = [0, 0, 0];
      for (const av of crossFleets) {
        for (const ped of av.peds) {
          const travel = (ped.offset * W.CROSS_LEN + t * ped.speed * ped.dir) % W.CROSS_LEN;
          const z = W.CROSS_NEAR_Z - ((travel + W.CROSS_LEN) % W.CROSS_LEN);
          const x = av.x + ped.side * (W.CROSS_WIDTH / 2 + W.SIDEWALK_W / 2 + ped.lane);
          emitPed(ped, x, pavementY, z, true, pedCounts);
        }
      }
      for (const ped of avenuePeds) {
        const span = W.STREET_LEN;
        const travel = (ped.offset * span + t * ped.speed * ped.dir) % span;
        const x = camX - span / 2 + ((travel + span) % span);
        const z = W.PLAYER_Z + ped.side * (W.STREET_HALF_W + W.SIDEWALK_W / 2 + ped.lane);
        emitPed(ped, x, pavementY, z, false, pedCounts);
      }
      for (let k = 0; k < pedMeshes.length; k++) {
        pedMeshes[k].count = pedCounts[k];
        pedMeshes[k].instanceMatrix.needsUpdate = true;
        if (pedMeshes[k].instanceColor) pedMeshes[k].instanceColor.needsUpdate = true;
      }
      stats.pedestrians = pedCounts[0] + pedCounts[1] + pedCounts[2];

      // --- lamps, along the main avenue and up every cross avenue ----------
      const anchor = Math.floor(camX / W.LAMP.every);
      if (anchor !== lastLampAnchor || crossChanged) {
        lastLampAnchor = anchor;
        let i = 0;
        const reach = Math.ceil(W.STREET_LEN / W.LAMP.every / 2);
        for (let k = -reach; k < reach && i < lampCap; k++) {
          const x = (anchor + k) * W.LAMP.every;
          for (const side of [-1, 1]) {
            if (i >= lampCap) break;
            const z = W.PLAYER_Z + side * (W.STREET_HALF_W - 1.2);
            m4.compose(pos.set(x, W.STREET_Y, z),
              quat.setFromAxisAngle(yAxis, side > 0 ? Math.PI : 0), scl);
            lamps.setMatrixAt(i, m4);
            m4.compose(pos.set(x - side * W.LAMP.arm, W.STREET_Y + W.LAMP.h, z),
              quat.identity(), scl);
            heads.setMatrixAt(i, m4);
            i++;
          }
        }
        // A receding row of warm points up each cross street. More than the
        // road surface, this is what reads as an avenue going somewhere.
        for (const av of crossFleets) {
          for (let z = W.CROSS_NEAR_Z; z > W.CROSS_NEAR_Z - W.CROSS_LEN;
            z -= W.CROSS_LAMP_EVERY) {
            for (const side of [-1, 1]) {
              if (i >= lampCap) break;
              const x = av.x + side * (W.CROSS_WIDTH / 2 - 0.8);
              m4.compose(pos.set(x, W.STREET_Y, z),
                quat.setFromAxisAngle(yAxis, side > 0 ? -Math.PI / 2 : Math.PI / 2), scl);
              lamps.setMatrixAt(i, m4);
              m4.compose(pos.set(x, W.STREET_Y + W.LAMP.h, z - side * W.LAMP.arm),
                quat.identity(), scl);
              heads.setMatrixAt(i, m4);
              i++;
            }
          }
        }
        // ...and a row across each of the nearer back streets. The far two
        // carry none: at three hundred units a lamp is one fogged pixel, and
        // the pair of them cost forty instances to say nothing.
        for (const st of W.BACK_STREETS) {
          if (!st.lamps) continue;
          const first = Math.floor((camX - W.BACK_LAMP_REACH) / W.BACK_LAMP_EVERY);
          const last = Math.ceil((camX + W.BACK_LAMP_REACH) / W.BACK_LAMP_EVERY);
          for (let k = first; k <= last; k++) {
            for (const side of [-1, 1]) {
              if (i >= lampCap) break;
              const x = k * W.BACK_LAMP_EVERY;
              const z = st.z + side * (st.w / 2 - 0.8);
              m4.compose(pos.set(x, W.STREET_Y, z),
                quat.setFromAxisAngle(yAxis, side > 0 ? Math.PI : 0), scl);
              lamps.setMatrixAt(i, m4);
              m4.compose(pos.set(x - side * W.LAMP.arm, W.STREET_Y + W.LAMP.h, z),
                quat.identity(), scl);
              heads.setMatrixAt(i, m4);
              i++;
            }
          }
        }
        lamps.count = i;
        heads.count = i;
        stats.lamps = i;
        lamps.instanceMatrix.needsUpdate = true;
        heads.instanceMatrix.needsUpdate = true;

        plant(camX, centreZ);
        furnish(camX, centreZ);
      }
    },
  };
}
