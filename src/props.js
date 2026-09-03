/**
 * The things that make a roofline read as New York.
 *
 * Each prop is built once as a **merged** geometry -- a water tower is a
 * cylinder, a cone and four legs welded into one buffer -- so the whole object
 * is a single instanced draw call rather than six. Six hundred water tower
 * parts as separate meshes would be six hundred draw calls; as seven merged
 * geometries with a few hundred instances each, it is seven.
 *
 * Everything is generated here in code. There is no model file anywhere in this
 * project.
 */

import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import * as W from './world.js';

/** Transform a geometry by translation (and optional rotation) for merging. */
function placed(geo, x, y, z, rx = 0, rz = 0) {
  const g = geo.clone();
  const m = new THREE.Matrix4();
  m.makeRotationFromEuler(new THREE.Euler(rx, 0, rz));
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

const merge = (parts) => BGU.mergeGeometries(parts, false);

/**
 * A wooden water tank on a steel frame. Origin at its feet, so an instance can
 * be dropped straight onto a roof height.
 */
function waterTower() {
  const P = W.PROPS.tank;
  const parts = [];
  const legGeo = new THREE.BoxGeometry(0.16, P.legs, 0.16);
  const s = P.r * 0.62;
  for (const [lx, lz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
    parts.push(placed(legGeo, lx, P.legs / 2, lz));
  }
  parts.push(placed(new THREE.CylinderGeometry(P.r, P.r * 0.92, P.h, 12),
    0, P.legs + P.h / 2, 0));
  // The conical lid. Unmistakable from a very long way off.
  parts.push(placed(new THREE.ConeGeometry(P.r * 1.08, P.r * 0.9, 12),
    0, P.legs + P.h + P.r * 0.45, 0));
  // Hoop bands around the staves.
  for (const t of [0.28, 0.72]) {
    parts.push(placed(new THREE.TorusGeometry(P.r * 1.01, 0.05, 4, 12),
      0, P.legs + P.h * t, 0, Math.PI / 2));
  }
  return merge(parts);
}

/** A rooftop stair bulkhead with a small parapet. */
function bulkhead() {
  const P = W.PROPS.bulkhead;
  return merge([
    placed(new THREE.BoxGeometry(P.w, P.h, P.d), 0, P.h / 2, 0),
    placed(new THREE.BoxGeometry(P.w * 1.12, 0.22, P.d * 1.12), 0, P.h, 0),
  ]);
}

/** Air handling: a box, a fan cowl, a duct. */
function hvac() {
  const P = W.PROPS.hvac;
  return merge([
    placed(new THREE.BoxGeometry(P.w, P.h, P.d), 0, P.h / 2, 0),
    placed(new THREE.CylinderGeometry(P.w * 0.26, P.w * 0.26, 0.3, 10),
      P.w * 0.2, P.h + 0.15, 0),
    placed(new THREE.BoxGeometry(0.5, 0.9, 0.5), -P.w * 0.3, P.h + 0.45, 0),
  ]);
}

/** A guyed mast with a red obstruction light at the top (drawn emissive). */
function mast() {
  const P = W.PROPS.mast;
  const parts = [placed(new THREE.CylinderGeometry(P.r, P.r * 1.6, P.h, 6), 0, P.h / 2, 0)];
  for (const t of [0.35, 0.7]) {
    parts.push(placed(new THREE.TorusGeometry(P.r * 3, 0.04, 3, 8), 0, P.h * t, 0, Math.PI / 2));
  }
  return merge(parts);
}

function dish() {
  const P = W.PROPS.dish;
  return merge([
    placed(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), 0, 0.55, 0),
    placed(new THREE.SphereGeometry(P.r, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.42),
      0, 1.3, 0, Math.PI * 0.75),
  ]);
}

/** A billboard frame. The panel itself gets the emissive material. */
function signFrame() {
  const P = W.PROPS.sign;
  const parts = [];
  for (const lx of [-P.w * 0.4, 0, P.w * 0.4]) {
    parts.push(placed(new THREE.BoxGeometry(0.18, P.h * 1.5, 0.18), lx, P.h * 0.75, 0));
  }
  return merge(parts);
}

function signPanel() {
  const P = W.PROPS.sign;
  return new THREE.BoxGeometry(P.w, P.h, 0.12);
}

/**
 * One storey of fire escape: a platform, a rail, and the ladder down to the
 * next one.
 *
 * Built at true size and stacked one instance per floor, rather than as a tall
 * ladder scaled to fit. Scaling it was the obvious approach and it is wrong in
 * a way that is invisible in the code and glaring on screen: a non-uniform y
 * scale stretches the 6cm platforms along with everything else, so a 50-unit
 * building got platforms three units thick. Geometry that is stacked keeps its
 * proportions; geometry that is stretched does not.
 */
function fireEscape() {
  const P = W.PROPS.escape;
  const h = W.FACADE.apartment.floorH;
  const parts = [
    placed(new THREE.BoxGeometry(P.w, 0.07, P.depth), 0, 0, P.depth / 2),
    placed(new THREE.BoxGeometry(P.w, 0.06, 0.06), 0, h * 0.36, P.depth),
  ];
  for (const lx of [-P.w / 2, P.w / 2]) {
    parts.push(placed(new THREE.BoxGeometry(0.06, h * 0.38, 0.06), lx, h * 0.19, P.depth));
  }
  // The diagonal run down to the platform below, and its two stringers.
  parts.push(placed(new THREE.BoxGeometry(0.5, h * 0.92, 0.06),
    P.w * 0.26, -h * 0.46, P.depth * 0.62, 0, 0.3));
  return merge(parts);
}

/** A street lamp with a cantilevered arm; the head is a separate emissive box. */
function lamp() {
  const P = W.LAMP;
  return merge([
    placed(new THREE.CylinderGeometry(P.r, P.r * 1.7, P.h, 7), 0, P.h / 2, 0),
    placed(new THREE.BoxGeometry(P.arm, 0.11, 0.11), P.arm / 2, P.h, 0),
  ]);
}

/**
 * Paint a geometry's vertices a single colour, so several differently-coloured
 * parts can merge into one buffer and draw in one call.
 *
 * `mergeGeometries` insists every input carries the same attributes, and also
 * that they are either all indexed or all non-indexed. Cylinders are indexed
 * and icosahedra are not, so a tree built from both fails with a message about
 * compatible attributes that says nothing about which part is at fault --
 * hence the `toNonIndexed()` on everything on the way in -- guarded, because
 * three warns on the console every time it is handed something already flat.
 */
function painted(geo, hex, x, y, z, rx = 0, rz = 0) {
  const placedGeo = placed(geo, x, y, z, rx, rz);
  const g = placedGeo.index ? placedGeo.toNonIndexed() : placedGeo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * A street tree: tapered trunk, two overlapping faceted canopy blobs.
 *
 * Trunk and leaves are different colours in one geometry via vertex colours,
 * so a whole tree is a single instance in a single draw call -- and
 * `setColorAt` on top of that still works, because three multiplies the
 * instance colour into the vertex colour rather than replacing it. That is
 * what gives a row of trees its spread of greens.
 *
 * @param full  a mature rounded canopy, or a younger narrower one
 */
function tree(full) {
  const T = W.TREE;
  const h = full ? T.trunkH : T.trunkH * 1.5;
  const r = full ? T.canopyR : T.canopyR * 0.66;
  const parts = [
    painted(new THREE.CylinderGeometry(T.trunkR * 0.68, T.trunkR, h, T.trunkSegs),
      W.TRUNK_COLOR, 0, h / 2, 0),
    painted(new THREE.IcosahedronGeometry(r, 0), W.CANOPY_COLOR, 0, h + r * 0.5, 0),
  ];
  // A second, smaller blob offset off-centre. One sphere reads as a lollipop;
  // two overlapping ones read as foliage, for twenty more triangles.
  parts.push(painted(new THREE.IcosahedronGeometry(r * 0.72, 0), W.CANOPY_COLOR,
    r * (full ? 0.45 : 0.3), h + r * (full ? 1.05 : 1.25), -r * 0.28));
  return merge(parts);
}

/**
 * A car, pointing down -z. Body, cabin, and nothing else -- at the distances
 * these are seen, anything more is invisible.
 *
 * The body carries no colour of its own: `InstancedMesh.setColorAt` gives every
 * instance its own tint, so one geometry and one draw call covers the whole
 * fleet, taxis included. That is also why the roof sign is separate -- it is
 * the only part of a cab that is a different *shape* rather than a different
 * colour.
 */
function vehicleBody(shape) {
  const S = W.VEHICLE_SHAPES[shape];
  return merge([
    placed(new THREE.BoxGeometry(S.body.w, S.body.h, S.body.d), 0, S.body.h / 2, 0),
    placed(new THREE.BoxGeometry(S.cabin.w, S.cabin.h, S.cabin.d),
      0, S.body.h + S.cabin.h / 2, S.body.d * S.cabin.z),
  ]);
}

function taxiSign() {
  const V = W.VEHICLE;
  return new THREE.BoxGeometry(V.sign.w, V.sign.h, V.sign.d);
}

/**
 * A pair of lamps at one end of a vehicle, merged so the pair is one instance.
 *
 * Built per shape rather than shared and offset at draw time: the pair's spread
 * comes from the body's width and its height from the body's height, so a bus's
 * headlights are genuinely a bus's, not a car's pushed forward. `end` is -1 for
 * the front (a vehicle faces its own -z) and +1 for the back.
 */
function lampPair(shape, end) {
  const V = W.VEHICLE;
  const S = W.VEHICLE_SHAPES[shape];
  const geo = new THREE.BoxGeometry(V.lampW, V.lampH, V.lampD);
  const y = S.body.h * (shape === 'car' ? 0.72 : 0.42);
  const z = end * S.body.d / 2;
  return merge([
    placed(geo, -S.body.w * 0.33, y, z),
    placed(geo, S.body.w * 0.33, y, z),
  ]);
}

/** An emergency light bar. One box; the strobe lives in its instance colour. */
function beacon() {
  return new THREE.BoxGeometry(W.BEACON.w, W.BEACON.h, W.BEACON.d);
}

/**
 * A fire hydrant. Three cylinders and two nozzles, and instantly a New York
 * pavement rather than a grey strip.
 */
function hydrant() {
  const H = W.HYDRANT;
  return merge([
    placed(new THREE.CylinderGeometry(H.r * 1.35, H.r * 1.5, H.h * 0.12, 8), 0, H.h * 0.06, 0),
    placed(new THREE.CylinderGeometry(H.r, H.r * 1.1, H.h * 0.72, 8), 0, H.h * 0.48, 0),
    placed(new THREE.SphereGeometry(H.r * 1.05, 8, 6), 0, H.h * 0.86, 0),
    placed(new THREE.CylinderGeometry(H.r * 0.34, H.r * 0.34, H.r * 1.9, 6),
      0, H.h * 0.6, 0, Math.PI / 2),
  ]);
}

/** A traffic signal: post, cantilevered arm, and the housing on the end. */
function signal() {
  const S = W.SIGNAL;
  return merge([
    placed(new THREE.CylinderGeometry(S.r, S.r * 1.5, S.post, 7), 0, S.post / 2, 0),
    placed(new THREE.BoxGeometry(S.arm, S.r * 1.4, S.r * 1.4), S.arm / 2, S.post, 0),
    placed(new THREE.BoxGeometry(S.head.w, S.head.h, S.head.d),
      S.arm, S.post - S.head.h / 2, 0),
    // The hood over the lens, which is most of a signal's silhouette.
    placed(new THREE.BoxGeometry(S.head.w * 1.1, S.lens * 0.5, S.head.d * 0.9),
      S.arm, S.post - S.head.h * 0.25, S.head.d * 0.4),
  ]);
}

/** The lit lens, kept separate so it can carry an emissive material. */
function signalLens() {
  return new THREE.SphereGeometry(W.SIGNAL.lens, 8, 6);
}

/** A manhole cover, which is also where the steam comes from. */
function manhole() {
  const M = W.MANHOLE;
  return merge([
    placed(new THREE.CylinderGeometry(M.r, M.r, M.h, 12), 0, M.h / 2, 0),
    placed(new THREE.TorusGeometry(M.r * 0.62, M.h * 0.5, 4, 12), 0, M.h, 0, Math.PI / 2),
  ]);
}

/**
 * A shrub: three overlapping lobes sitting on the ground, no trunk.
 *
 * Deliberately a different *kind* of thing from a scaled-down tree. A row of
 * small trees still reads as a row of trees; what makes a planted lot look
 * planted is a mixture of silhouettes, and the cheapest second silhouette
 * available is a mass with no stem under it.
 */
function shrub() {
  const S = W.SHRUB;
  const parts = [];
  for (let i = 0; i < S.lobes; i++) {
    const a = (i / S.lobes) * Math.PI * 2;
    const r = S.r * (i === 0 ? 1 : 0.7);
    parts.push(painted(new THREE.IcosahedronGeometry(r, 0), W.SHRUB_COLOR,
      Math.cos(a) * S.r * 0.5, r * 0.68, Math.sin(a) * S.r * 0.5));
  }
  return merge(parts);
}

/** The steel of a sign gantry: two posts and the beam between them. */
function gantry() {
  const G = W.GANTRY;
  const parts = [
    placed(new THREE.BoxGeometry(G.span, G.beam.h, G.beam.d), 0, G.post.h, 0),
  ];
  for (const side of [-1, 1]) {
    parts.push(placed(new THREE.CylinderGeometry(G.post.r, G.post.r * 1.4, G.post.h, 6),
      side * G.span / 2, G.post.h / 2, 0));
  }
  return merge(parts);
}

/** The panel, separate so it can carry the green sign texture and a glow. */
function gantrySign() {
  const G = W.GANTRY;
  return placed(new THREE.BoxGeometry(G.panel.w, G.panel.h, G.panel.d),
    0, G.post.h - G.beam.h / 2 - G.panel.h / 2, 0);
}

/** One crossing: a row of stripes welded into a single instanceable slab. */
function crosswalk() {
  const C = W.CROSSWALK;
  const parts = [];
  const pitch = C.stripeW + C.gap;
  const span = (C.stripes - 1) * pitch;
  for (let i = 0; i < C.stripes; i++) {
    parts.push(placed(new THREE.BoxGeometry(C.stripeW, 0.02, C.depth),
      i * pitch - span / 2, 0, 0));
  }
  return merge(parts);
}

/**
 * A pedestrian, mid-stride. One geometry, one flat colour per instance --
 * exactly the trick `carBody()` already uses -- so a figure reads as a coat
 * colour rather than a modelled outfit, which is all it needs to be at the
 * range a sidewalk is seen from.
 *
 * There is no skinned rig: three fixed poses are built by calling this once
 * per pose rather than as three near-duplicate blocks, which is what keeps
 * them from drifting out of proportion with each other. `phase` runs from -1
 * (right leg leading) through 0 (standing) to +1 (left leg leading).
 *
 * A limb is a single box rotated about its joint rather than its centre, which
 * needs its origin moved there first: built pointing straight down from y=0,
 * `translate()` bakes that shift into the buffer, and only then does `placed()`
 * apply the stride rotation -- so the rotation pivots at the hip or shoulder,
 * not at the limb's midpoint. An arm swings opposite the leg on the same side,
 * which is what a walk looks like and a marionette does not.
 */
function pedestrian(phase) {
  const P = W.PED;
  const swing = phase * P.swing;
  const legGeo = new THREE.BoxGeometry(P.legW, P.legH, P.legD);
  legGeo.translate(0, -P.legH / 2, 0);
  const armGeo = new THREE.BoxGeometry(P.armW, P.armH, P.armD);
  armGeo.translate(0, -P.armH / 2, 0);

  const hipY = P.legH;
  const shoulderY = hipY + P.torsoH * P.shoulderFrac;

  return merge([
    placed(legGeo, -P.stanceW / 2, hipY, 0, swing, 0),
    placed(legGeo, P.stanceW / 2, hipY, 0, -swing, 0),
    placed(armGeo, -P.shoulderW / 2, shoulderY, 0, -swing * P.armSwing, 0),
    placed(armGeo, P.shoulderW / 2, shoulderY, 0, swing * P.armSwing, 0),
    placed(new THREE.BoxGeometry(P.torsoW, P.torsoH, P.torsoD),
      0, hipY + P.torsoH / 2, 0),
    placed(new THREE.BoxGeometry(P.headW, P.headH, P.headW),
      0, hipY + P.torsoH + P.headH / 2, 0),
  ]);
}

/**
 * A pizza slice. `CylinderGeometry` with a `thetaLength` short of a full turn
 * is already a pie-wedge -- the crust is the curved side, the two straight
 * cuts are the radial faces -- so the whole shape is one primitive rather
 * than a hand-built wedge. Two pepperoni discs, in fixed positions rather
 * than random ones, are what keep it reading as a slice instead of a wedge
 * of cheese; every slice is the same slice, and that is fine at this size.
 */
function pizza() {
  const P = W.PIZZA;
  const parts = [
    painted(new THREE.CylinderGeometry(P.r, P.r, P.h, 10, 1, false, -P.angle / 2, P.angle),
      W.PIZZA_COLOR, 0, 0, 0),
  ];
  const PP = W.PEPPERONI;
  for (const a of [PP.a1, PP.a2]) {
    parts.push(painted(new THREE.CylinderGeometry(PP.r, PP.r, PP.h, 8), W.PEPPERONI_COLOR,
      Math.cos(a) * PP.d, P.h / 2 + PP.h / 2, Math.sin(a) * PP.d));
  }
  return merge(parts);
}

/**
 * A ground-floor storefront's shell: a lit glass front, a doorway, and an
 * awning with a neon tube along its top edge. `type` only changes the
 * palette -- cafe, bar, restaurant and generic store are the same shapes
 * with different vertex colours, the same way the four facade variants are
 * the same window grid with a different one.
 *
 * The sign itself -- the part that actually names the place -- is a separate
 * mesh with a real texture; see `shopSignPanel()` and `city.js`, which is
 * also what needs a real letter, not a colour.
 *
 * Built at a unit width (`S.w === 1`); `city.js` scales it to each building's
 * actual frontage via the instance's own x scale, the same trick `pushProp`
 * already uses for rooftop tanks and hydrants.
 */
function shopfront(type) {
  const S = W.SHOPFRONT;
  const C = W.SHOP_COLORS[type];
  const parts = [
    // The glass front: wide and the brightest part of the whole thing -- a
    // lit interior is what a shopfront actually looks like after dark.
    painted(new THREE.BoxGeometry(S.w, S.glassH, S.glassD), C.glass, 0, S.glassH / 2, 0),
    // A doorway, off-centre, dark enough to read as an opening rather than
    // more glass.
    painted(new THREE.BoxGeometry(S.doorW, S.glassH, S.glassD * 1.4), W.SHOP_DOOR_COLOR,
      S.w * 0.5 - S.doorW * 0.5 - S.doorMargin, S.glassH / 2, 0),
  ];
  // The awning: pre-translated so its pivot sits at the wall, not its own
  // middle, the same trick the pedestrian's limbs use -- rotating it then
  // droops the outer edge downward instead of swinging the whole slab through
  // the wall.
  const awning = new THREE.BoxGeometry(S.w * 1.04, S.awningT, S.awningD);
  awning.translate(0, 0, S.awningD / 2);
  parts.push(painted(awning, C.awning, 0, S.glassH + S.awningT / 2, S.glassD / 2, -S.awningTilt));
  // A neon tube along the awning's top edge -- the accent line a real diner
  // canopy carries, riding the shell's own emissive-by-vertex-colour material
  // for free rather than needing one of its own.
  parts.push(painted(new THREE.BoxGeometry(S.w * 1.04, S.neonH, S.neonH), C.sign,
    0, S.glassH + S.awningT + S.neonH / 2, S.glassD / 2));
  return merge(parts);
}

/**
 * The sign panel's shape: one plain slab, shared by every shop type. Only the
 * material differs per type -- see `city.js`, which builds a canvas texture
 * per type and applies it here the way `gantrySign` applies one to a plain
 * panel in `street.js`.
 */
function shopSignPanel() {
  const S = W.SHOP_SIGN;
  return new THREE.BoxGeometry(S.w, S.h, S.d);
}

/**
 * A perched pigeon: a body, a head and a beak, all round or conical shapes
 * that read as a bird from any angle -- which is the point, since these sit
 * on a rooftop the camera can pass at almost any relative bearing.
 */
function pigeonPerch() {
  const B = W.PIGEON;
  return merge([
    painted(new THREE.SphereGeometry(B.bodyR, 8, 6), W.PIGEON_BODY_COLOR, 0, B.bodyR * 0.8, 0),
    painted(new THREE.SphereGeometry(B.headR, 8, 6), W.PIGEON_HEAD_COLOR,
      B.headOffset, B.bodyR * 0.8 + B.headY, 0),
    painted(new THREE.ConeGeometry(B.beakR, B.beakLen, 6), W.PIGEON_BEAK_COLOR,
      B.headOffset + B.beakLen * 0.5, B.bodyR * 0.8 + B.headY, 0, 0, -Math.PI / 2),
  ]);
}

/**
 * A hostile drone: a flat body and four rotor arms in an X, all one merged,
 * vertex-coloured mesh. The warning light underneath is deliberately not
 * part of this mesh -- it has to pulse per-instance, the same reason the
 * vehicle beacons in `street.js` are their own geometry.
 *
 * Each arm's cylinder is rotated about Y before it is placed, not after --
 * `painted()` only carries the X/Z rotations the rest of this file's parts
 * need, so pointing something outward in the horizontal plane has to be baked
 * into the geometry itself first.
 */
function drone() {
  const D = W.DRONE;
  const parts = [
    painted(new THREE.BoxGeometry(D.bodyW, D.bodyH, D.bodyD), W.DRONE_BODY_COLOR, 0, 0, 0),
  ];
  for (let k = 0; k < 4; k++) {
    const angle = Math.PI / 4 + k * (Math.PI / 2);
    const cx = Math.cos(angle);
    const cz = Math.sin(angle);

    const arm = new THREE.CylinderGeometry(D.armR, D.armR, D.armLen, 6);
    arm.rotateZ(Math.PI / 2);
    arm.rotateY(angle);
    parts.push(painted(arm, W.DRONE_BODY_COLOR, cx * D.armLen / 2, 0, cz * D.armLen / 2));

    parts.push(painted(new THREE.CylinderGeometry(D.rotorR, D.rotorR, D.rotorH, 10),
      W.DRONE_ROTOR_COLOR, cx * D.armLen, D.bodyH * 0.3, cz * D.armLen));
  }
  return merge(parts);
}

/** The drone's warning light: one small sphere, coloured per-instance to pulse. */
function droneLight() {
  return new THREE.SphereGeometry(W.DRONE.lightR, 8, 6);
}

/** The web replenisher: a canister with a domed cap and a short neck. */
function replenisher() {
  const R = W.REPLENISHER;
  return merge([
    placed(new THREE.CylinderGeometry(R.r, R.r, R.h, 10), 0, R.h / 2, 0),
    placed(new THREE.SphereGeometry(R.r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, R.h, 0),
    placed(new THREE.CylinderGeometry(R.r * 0.55, R.r * 0.55, R.neckH, 8),
      0, R.h + R.neckH / 2, 0),
  ]);
}

let cache = null;

/**
 * Every prop geometry, built once. Each becomes one InstancedMesh.
 * `emissive: true` marks the ones that light themselves.
 *
 * Memoised because both `city.js` (rooftops) and `street.js` (lamps, traffic,
 * trees) need this set, and building it twice meant two copies of every buffer
 * uploaded to the GPU for no benefit whatsoever.
 */
export function buildPropGeometries() {
  if (cache) return cache;
  cache = {
    tank: { geo: waterTower(), emissive: false },
    bulkhead: { geo: bulkhead(), emissive: false },
    hvac: { geo: hvac(), emissive: false },
    mast: { geo: mast(), emissive: false },
    dish: { geo: dish(), emissive: false },
    sign: { geo: signFrame(), emissive: false },
    signPanel: { geo: signPanel(), emissive: true },
    escape: { geo: fireEscape(), emissive: false },
    lamp: { geo: lamp(), emissive: false },
    lampHead: { geo: new THREE.BoxGeometry(0.9, 0.28, 0.5), emissive: true },
    taxiSign: { geo: taxiSign(), emissive: true },
    beacon: { geo: beacon(), emissive: true },
    treeFull: { geo: tree(true), emissive: false, vertexColors: true },
    treeYoung: { geo: tree(false), emissive: false, vertexColors: true },
    hydrant: { geo: hydrant(), emissive: false },
    signal: { geo: signal(), emissive: false },
    signalLens: { geo: signalLens(), emissive: true },
    manhole: { geo: manhole(), emissive: false },
    crosswalk: { geo: crosswalk(), emissive: false },
    shrub: { geo: shrub(), emissive: false, vertexColors: true },
    pedStand: { geo: pedestrian(0), emissive: false },
    pedStrideA: { geo: pedestrian(1), emissive: false },
    pedStrideB: { geo: pedestrian(-1), emissive: false },
    gantry: { geo: gantry(), emissive: false },
    gantrySign: { geo: gantrySign(), emissive: true },
    pizza: { geo: pizza(), emissive: false, vertexColors: true },
    replenisher: { geo: replenisher(), emissive: true },
    pigeon: { geo: pigeonPerch(), emissive: false, vertexColors: true },
    drone: { geo: drone(), emissive: false, vertexColors: true },
    droneLight: { geo: droneLight(), emissive: true },
    shopSign: { geo: shopSignPanel(), emissive: true },
  };
  // One shopfront geometry per type, keyed `shop:cafe`, `shop:bar` and so on --
  // built from the table rather than listed by hand, the same as the vehicle
  // shapes below.
  for (const type of W.SHOP_TYPES) {
    cache[`shop:${type}`] = { geo: shopfront(type), emissive: false, vertexColors: true };
  }
  // One body and two lamp pairs per shape, keyed `body:car`, `head:bus` and so
  // on. Built from the table rather than listed by hand, so adding a shape to
  // world.js is the whole change.
  for (const shape of Object.keys(W.VEHICLE_SHAPES)) {
    cache[`body:${shape}`] = { geo: vehicleBody(shape), emissive: false };
    cache[`head:${shape}`] = { geo: lampPair(shape, -1), emissive: true };
    cache[`tail:${shape}`] = { geo: lampPair(shape, 1), emissive: true };
  }
  return cache;
}
