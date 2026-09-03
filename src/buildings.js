/**
 * What shape a building is.
 *
 * Pure description, no three.js: a seeded roll in, a list of boxes and rooftop
 * props out. Nothing here touches a scene graph, which means the massing can be
 * reasoned about (and tested) without a renderer, and `city.js` stays purely
 * about turning descriptions into instances.
 *
 * The important property is that this is a **function of (lane, block index)**
 * and nothing else. Nothing is stored. Block 400 is always the same building as
 * block 400 and a different one from block 12, in both directions, forever --
 * so the city is consistent without remembering a byte, and `roofAt()` can
 * answer for a building that has no geometry allocated to it at all. That idea
 * is lifted wholesale from the previous project, where it was the one that
 * worked best.
 *
 * Four types, weighted and then biased by height, because the thing that makes
 * a skyline read as Manhattan rather than as noise is that the shapes correlate
 * with the sizes: brownstones are short, setback towers are tall, and a
 * three-storey glass curtain wall does not exist.
 */

import { rngFor, range } from './rng.js';
import * as W from './world.js';

const SEED = 'city';

/** Is this x inside a cross street -- the gap left clear in every lane? */
export function inCrossStreet(x, width) {
  const nearest = Math.round(x / W.CROSS_SPACING) * W.CROSS_SPACING;
  return Math.abs(x - nearest) < (W.CROSS_WIDTH + width) / 2;
}

/** Does a cross street sit within one block either side of this x? */
function besideCrossStreet(x, pitch) {
  const nearest = Math.round(x / W.CROSS_SPACING) * W.CROSS_SPACING;
  const d = Math.abs(x - nearest);
  return d >= W.CROSS_WIDTH / 2 && d <= pitch * 1.5;
}

/** Pick an architectural type, weighted and then biased by how tall it is. */
function pickArch(rand, height) {
  const w = { ...W.ARCH_WEIGHT };
  if (height < W.SHORT_FOR_ARCH) { w.deco = 0; w.glass = 0; }
  if (height > W.TALL_FOR_ARCH) { w.deco *= 2.4; w.glass *= 2.2; w.apartment *= 0.35; }
  let total = 0;
  for (const k of W.ARCH_ORDER) total += w[k];
  let roll = rand() * total;
  for (const k of W.ARCH_ORDER) {
    roll -= w[k];
    if (roll <= 0) return k;
  }
  return W.ARCH.COMMERCIAL;
}

/**
 * The stack of boxes that make up one building.
 *
 * A podium at the pavement, then the shaft, then setbacks stepping in as it
 * rises, then a crown. Every step is a fraction of the building's own size, so
 * a 40-unit walk-up and a 130-unit tower set back in the same proportions
 * rather than by the same number of metres.
 */
function massing(rand, arch, x, z, height, width, depth) {
  const parts = [];
  const push = (cx, cy, cz, w, h, d, kind) =>
    parts.push({ x: cx, y: cy, z: cz, w, h, d, kind });

  let y = W.STREET_Y;
  let remaining = height;
  let w = width;
  let d = depth;

  if (rand() < W.MASSING.baseChance) {
    const bh = height * W.MASSING.baseHeight;
    const bw = width * (1 + W.MASSING.baseFlare);
    push(x, y + bh / 2, z, bw, bh, d * (1 + W.MASSING.baseFlare), 'base');
    y += bh;
    remaining -= bh;
  }

  const steps = rand() < W.MASSING.setbackChance[arch]
    ? 1 + Math.floor(rand() * W.MASSING.setbackMax[arch]) : 0;

  let sectionH = steps ? remaining * W.MASSING.setbackFirst : remaining;
  for (let i = 0; i <= steps; i++) {
    const h = Math.min(sectionH, remaining);
    if (h <= 0) break;
    push(x, y + h / 2, z, w, h, d, i === 0 ? 'shaft' : 'setback');
    // A cornice on the step: the horizontal shadow line that makes a setback
    // read as a setback rather than as the building simply getting thinner.
    if (i < steps) {
      push(x, y + h, z, w + W.LEDGE_DEPTH * 2, W.LEDGE_H, d + W.LEDGE_DEPTH * 2, 'ledge');
    }
    y += h;
    remaining -= h;
    w *= 1 - W.MASSING.setbackInset;
    d *= 1 - W.MASSING.setbackInset;
    sectionH = remaining * W.MASSING.setbackRise;
  }

  if (rand() < W.MASSING.crownChance[arch] && remaining > 0) {
    push(x, y + remaining / 2, z, w * 0.7, remaining, d * 0.7, 'crown');
    y += remaining;
  }

  return { parts, roof: y, roofW: w, roofD: d };
}

/** What sits on the roof, and clinging to the front. */
function rooftop(rand, arch, x, z, roof, roofW, roofD, tier) {
  const props = [];
  if (tier > W.PROP_TIER_MAX) return props;
  const P = W.PROPS;
  const jitter = (span) => (rand() - 0.5) * span;

  // Water towers: the single most New York silhouette there is, and far more
  // common on pre-war stock than on a glass tower.
  const tankChance = arch === W.ARCH.GLASS ? P.tank.chance * 0.2 : P.tank.chance;
  if (rand() < tankChance) {
    props.push({ kind: 'tank', x: x + jitter(roofW * 0.5), y: roof, z: z + jitter(roofD * 0.4) });
  }
  if (rand() < P.bulkhead.chance) {
    props.push({ kind: 'bulkhead', x: x + jitter(roofW * 0.45), y: roof, z: z + jitter(roofD * 0.4) });
  }
  const hvacs = arch === W.ARCH.COMMERCIAL || arch === W.ARCH.GLASS ? P.hvac.max : 1;
  for (let i = 0; i < hvacs; i++) {
    if (rand() < P.hvac.chance) {
      props.push({ kind: 'hvac', x: x + jitter(roofW * 0.7), y: roof, z: z + jitter(roofD * 0.6) });
    }
  }
  if (rand() < P.mast.chance) {
    props.push({ kind: 'mast', x: x + jitter(roofW * 0.3), y: roof, z: z + jitter(roofD * 0.3) });
  }
  if (rand() < P.dish.chance) {
    props.push({ kind: 'dish', x: x + jitter(roofW * 0.6), y: roof, z: z + jitter(roofD * 0.4) });
  }
  if (rand() < P.sign.chance) {
    props.push({ kind: 'sign', x, y: roof, z });
  }
  // Fire escapes, on the street face of pre-war walk-ups only.
  if (arch === W.ARCH.APARTMENT && tier === 0 && rand() < P.escape.chance) {
    props.push({ kind: 'escape', x, y: W.STREET_Y, z, span: roof });
  }
  // A small flock, at the roof's edge rather than its middle -- real pigeons
  // perch on a parapet, not the flat centre of a roof.
  if (rand() < P.pigeon.chance) {
    const count = 1 + Math.floor(rand() * P.pigeon.max);
    for (let i = 0; i < count; i++) {
      props.push({
        kind: 'pigeon', x: x + jitter(roofW * 0.85), y: roof, z: z + jitter(roofD * 0.85),
      });
    }
  }
  return props;
}

/**
 * Describe the building at (lane, block index), or null if that slot is empty.
 *
 * `force` overrides the fill roll, which is how the blocks either side of a
 * cross street are guaranteed to be occupied in the anchor lanes -- a gameplay
 * requirement, not a decorative one.
 */
export function describe(laneIndex, lane, n) {
  const x = n * lane.pitch;
  const rand = rngFor(SEED, 'b', laneIndex, n);

  const width = range(rand, lane.wMin, lane.wMax);
  if (inCrossStreet(x, width)) return null;

  const force = lane.anchor && besideCrossStreet(x, lane.pitch);
  if (!force && rand() > lane.fill) return null;

  const height = W.roofY(lane, rand() ** lane.skew);   // skewed: tall ones are rarer
  const arch = pickArch(rand, height);
  const depth = lane.depth * (0.85 + rand() * 0.3);

  const shape = massing(rand, arch, x, lane.z, height, width, depth);

  // A ground-floor storefront, on the lanes close enough to actually read one.
  // Rolled last so it never shifts the sequence the rest of this description
  // depends on -- only lanes at or under SHOP_TIER_MAX ever spend a roll here.
  const shop = lane.tier <= W.SHOP_TIER_MAX && rand() < W.SHOP_CHANCE
    ? W.SHOP_TYPES[(rand() * W.SHOP_TYPES.length) | 0]
    : null;

  return {
    x,
    z: lane.z,
    arch,
    height,
    width,
    depth,
    variant: (rand() * W.FACADE_VARIANTS) | 0,
    uvOffset: [rand(), rand()],
    shade: rand(),
    parts: shape.parts,
    roof: shape.roof,
    roofW: shape.roofW,
    roofD: shape.roofD,
    props: rooftop(rand, arch, x, lane.z, shape.roof, shape.roofW, shape.roofD, lane.tier),
    shop,
  };
}

/** The block index range a lane needs built for a camera at `camX`. */
export function blockRange(lane, camX) {
  return {
    from: Math.floor((camX - lane.back) / lane.pitch),
    to: Math.ceil((camX + lane.ahead) / lane.pitch),
  };
}
