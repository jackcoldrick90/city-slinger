/**
 * The web-slinger: a jointed figure with no model file, no rig and no
 * animation clip.
 *
 * An ordinary guy rather than a licensed superhero -- brown hair, a blue
 * shirt, jeans and brown boots -- built entirely from primitive geometry, so
 * nothing here is anyone else's artwork.
 *
 * ## Segments and joints
 *
 * The body is eleven rigid segments hung off nine pivots. A pivot is an empty
 * `Group` placed at the joint with the segment offset below it, so rotating it
 * swings the limb about the joint rather than about its own middle -- the
 * difference between a knee bending and a shin sliding.
 *
 * Limbs are capsules rather than boxes. At this size the rounding is barely two
 * pixels, but it is the difference between a figure and a stack of bricks in
 * silhouette, which is the only thing legible at fifty pixels tall.
 *
 * ## One mesh per segment
 *
 * Each segment is welded into a single geometry with **vertex colours**, so a
 * shin and its darker boot -- or a pelvis and its belt -- are one mesh and one
 * draw call rather than three. Only parts that actually move relative to each
 * other get their own mesh.
 *
 * The emissive is multiplied by the vertex colour through a two-line shader
 * patch. Without it the material's single emissive value would light the dark
 * boots exactly as brightly as the blue shirt, and every accent would wash
 * out at night -- which is precisely when the emissive is there to help.
 */
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import * as W from './world.js';
import { targetPose, stepPose, restPose } from './pose.js';

const B = W.BODY;

/**
 * Colour a geometry's vertices and place it, ready to be welded into a segment.
 *
 * `mergeGeometries` needs every input to carry the same attributes and to agree
 * about being indexed, so everything is forced non-indexed on the way in --
 * boxes and capsules disagree otherwise, with an error that names neither.
 */
function part(geo, hex, x, y, z, rx = 0, rz = 0) {
  const m = new THREE.Matrix4()
    .makeRotationFromEuler(new THREE.Euler(rx, 0, rz))
    .setPosition(x, y, z);
  let g = geo.clone().applyMatrix4(m);
  // Only if it needs it: three warns loudly when asked to un-index geometry
  // that never was, and some primitives here already are not.
  if (g.index) g = g.toNonIndexed();
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

const weld = (parts) => BGU.mergeGeometries(parts, false);

/** A capsule of a given total length, hanging down from the origin. */
function limb(spec) {
  return new THREE.CapsuleGeometry(spec.r, Math.max(0.01, spec.len - spec.r * 2), 3, 8);
}

/** An empty pivot with a segment hung beneath it. */
function joint(geometry, material, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.add(new THREE.Mesh(geometry, material));
  return pivot;
}

export function createPlayer(scene) {
  /**
   * Two clothing materials rather than one, split shirt and jeans.
   *
   * The emissive colour is a single uniform per material, so one material for
   * the whole figure would have the jeans glowing shirt-blue. Splitting them
   * keeps each half's self-illumination the colour it should be, and vertex
   * colours carry the variation within each half -- skin, hair and boots all
   * ride on top of whichever half they are welded into.
   */
  const clothing = (glow) => {
    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      emissive: glow,
      emissiveIntensity: W.SUIT_EMISSIVE,
    });
    mat.onBeforeCompile = (shader) => {
      // `.rgb`, not `vColor`. Since r165 three declares the colour varying as
      // `varying vec4 vColor` whenever USE_COLOR is set -- always, whether or
      // not the attribute carries alpha. Older versions declared it vec3 for a
      // 3-component attribute, so the obvious form compiled everywhere it used
      // to and fails here with a type error rather than a missing symbol.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;',
      );
    };
    mat.customProgramCacheKey = () => 'suit-vcolor-emissive';
    return mat;
  };
  const warm = clothing(W.SHIRT_BLUE);
  const cool = clothing(W.JEANS_BLUE);
  const eyeMat = new THREE.MeshBasicMaterial({ color: W.EYE_DARK });

  const root = new THREE.Group();
  scene.add(root);


  // --- pelvis: the one segment fixed to the root ---------------------------
  root.add(new THREE.Mesh(weld([
    part(limb(B.pelvis), W.JEANS_BLUE, 0, B.hipY + B.pelvis.len / 2, 0),
    part(limb(B.belt), W.BELT_BROWN, 0, B.waistY - B.belt.len, 0),
  ]), cool));

  // --- spine -----------------------------------------------------------------
  const chest = joint(
    part(limb(B.chest), W.SHIRT_BLUE, 0, B.chestY, 0),
    warm, 0, B.waistY, 0,
  );
  root.add(chest);

  // --- neck and head -------------------------------------------------------
  const head = joint(weld([
    part(limb(B.neck), W.SKIN_TONE, 0, 0, 0),
    part(new THREE.SphereGeometry(B.headR, 12, 8), W.SKIN_TONE, 0, B.headY, 0),
    // Hair: a cap over the crown, sitting proud of the scalp so it reads as
    // a hairline rather than a second, smaller head.
    part(new THREE.SphereGeometry(B.headR * B.hair.rScale, 12, 8, 0, Math.PI * 2, 0, B.hair.thetaLength),
      W.HAIR_BROWN, 0, B.headY, 0),
  ]), warm, 0, B.neckY, 0);
  const eyes = new THREE.Group();
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(B.eye.w, B.eye.h, B.eye.d), eyeMat,
    );
    eye.position.set(side * B.eyeX, B.headY + B.eyeY, B.eyeZ);
    eyes.add(eye);
  }
  head.add(eyes);
  chest.add(head);

  // --- arms: shoulder -> upper arm -> elbow -> forearm + wrist + hand -------
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = joint(
      part(limb(B.upperArm), W.SHIRT_BLUE, 0, -B.upperArm.len / 2, 0),
      warm, side * B.shoulderX, B.shoulderY, 0,
    );
    const elbow = joint(weld([
      part(limb(B.foreArm), W.SHIRT_BLUE, 0, -B.foreArm.len / 2, 0),
      part(limb(B.glove), W.SKIN_TONE, 0, -B.foreArm.len + B.glove.len / 2, 0),
      part(new THREE.SphereGeometry(B.hand.r, 8, 6), W.SKIN_TONE,
        0, -B.foreArm.len - B.hand.r * 0.4, 0),
    ]), warm, 0, -B.upperArm.len, 0);
    shoulder.add(elbow);
    chest.add(shoulder);
    // Where the web leaves the hand, tracked as an empty so the strand can be
    // positioned from the real fingertip rather than an estimate.
    const grip = new THREE.Object3D();
    grip.position.set(0, -B.foreArm.len - B.hand.r, 0);
    elbow.add(grip);
    arms.push({ shoulder, elbow, grip, side });
  }

  // --- legs: hip -> thigh -> knee -> shin + boot + foot ---------------------
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = joint(
      part(limb(B.thigh), W.JEANS_BLUE, 0, -B.thigh.len / 2, 0),
      cool, side * B.hipX, B.hipY, 0,
    );
    const knee = joint(weld([
      part(limb(B.shin), W.JEANS_BLUE, 0, -B.shin.len / 2, 0),
      part(limb(B.boot), W.BOOT_BROWN, 0, -B.shin.len + B.boot.len / 2, 0),
      part(new THREE.BoxGeometry(B.foot.w, B.foot.h, B.foot.d), W.BOOT_BROWN,
        0, -B.shin.len - B.ankleDrop + B.foot.h / 2, B.footZ),
    ]), cool, 0, -B.thigh.len, 0);
    hip.add(knee);
    root.add(hip);
    legs.push({ hip, knee, side });
  }

  // His own shadow on the wall he is swinging past is the cheapest possible
  // proof that he is in the scene rather than drawn over it.
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const pose = restPose();
  const target = restPose();

  return {
    root,
    /** Where the web leaves the hand, in world space. */
    handWorld: new THREE.Vector3(),

    /**
     * @param state  the physics
     * @param dt     seconds, for the joint easing -- see `stepPose`
     */
    update(state, dt) {
      Object.assign(target, targetPose({
        attached: state.anchor !== null,
        theta: state.theta,
        vx: state.vx,
        vy: state.vy,
      }));
      stepPose(pose, target, dt);

      root.position.set(state.x, state.y, W.PLAYER_Z);
      root.rotation.z = pose.body;
      chest.rotation.z = pose.spine;
      head.rotation.z = pose.head;

      // The web always leaves the arm nearer the anchor, so the strand never
      // crosses the body.
      const anchorLeft = state.anchor ? state.anchor.x < state.x : state.vx < 0;
      const web = arms[anchorLeft ? 0 : 1];
      const free = arms[anchorLeft ? 1 : 0];
      web.shoulder.rotation.set(web.side * B.armSpread, 0, pose.shoulderWeb);
      web.elbow.rotation.z = -pose.elbowWeb;
      free.shoulder.rotation.set(free.side * B.armSpread, 0, pose.shoulderFree);
      free.elbow.rotation.z = -pose.elbowFree;

      // The trailing leg is whichever is behind; swapping them with facing
      // keeps the lead leg leading rather than the pose mirroring at zero.
      const lead = legs[state.vx < 0 ? 0 : 1];
      const trail = legs[state.vx < 0 ? 1 : 0];
      lead.hip.rotation.set(lead.side * B.legSpread, 0, pose.hipFront);
      lead.knee.rotation.z = -pose.kneeFront;
      trail.hip.rotation.set(trail.side * B.legSpread, 0, pose.hipBack);
      trail.knee.rotation.z = -pose.kneeBack;

      // matrixWorld is stale until this is forced: the rotations above were set
      // after the last render, and the web strand is positioned from the hand
      // in the same frame. Without it the strand trails one frame behind the
      // arm, which at 40 units/s is a visible detachment.
      root.updateMatrixWorld(true);
      web.grip.getWorldPosition(this.handWorld);
      return pose;
    },

    /**
     * The suit's self-illumination, dropped in daylight.
     *
     * It exists because at night he measured 27 against buildings at 24 and was
     * invisible. In full sun the opposite is true -- the sun does the work, and
     * leaving the emissive up makes him read as a cartoon sticker pasted over a
     * lit city.
     */
    setEmissive(level) {
      warm.emissiveIntensity = level;
      cool.emissiveIntensity = level;
    },

    setOpacity(alpha) {
      for (const m of [warm, cool, eyeMat]) {
        m.transparent = alpha < 1;
        m.opacity = alpha;
      }
    },
  };
}
