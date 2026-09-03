/**
 * Facade texture sets, drawn into canvases at startup.
 *
 * Each set is three maps that agree with each other:
 *
 *   - **colour** -- the wall itself. Brick coursing, concrete banding, spandrel
 *     glass; plus the window reveal drawn as a darker recess and a lighter sill,
 *     which is most of what stops a window reading as a square painted on.
 *   - **emissive** -- only the lit windows, on black. Black emits nothing, so
 *     the unlit ones cost nothing and stay genuinely dark.
 *   - **normal** -- generated from a height field drawn alongside the colour,
 *     via Sobel. This is the part that makes a facade respond to the moonlight:
 *     mullions catch it, reveals fall into shadow, and the building stops
 *     looking like a decal.
 *
 * The height field is the trick worth keeping. Rather than authoring a normal
 * map, everything is drawn twice -- once in colour, once in greyscale height --
 * and the normal map is differentiated out of the second. Adding a detail means
 * drawing it in two places, never computing a normal by hand.
 *
 * Textures repeat, and each building gets its own UV scale and offset, so the
 * same sheet gives a 30-storey tower and a 6-storey walk-up completely
 * different facades. That, plus four variants per type, is what keeps a city
 * built from four textures from looking like it.
 */

import * as THREE from 'three';
import { rngFor } from './rng.js';
import * as W from './world.js';

const SEED = 'facade';

/** Wall palettes, per architectural type. Hue, saturation and lightness. */
const WALL = {
  apartment: [[0.045, 0.38, 0.40], [0.06, 0.32, 0.35], [0.03, 0.42, 0.32]],
  commercial: [[0.60, 0.07, 0.38], [0.58, 0.10, 0.33], [0.09, 0.13, 0.40]],
  deco: [[0.09, 0.19, 0.41], [0.07, 0.23, 0.36], [0.10, 0.16, 0.43]],
  glass: [[0.58, 0.26, 0.19], [0.55, 0.34, 0.16], [0.52, 0.22, 0.21]],
};

function canvas(px) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  return { cv, g: cv.getContext('2d') };
}

const hsl = (h, s, l) => `hsl(${h * 360} ${s * 100}% ${l * 100}%)`;
const grey = (v) => `rgb(${(v * 255) | 0},${(v * 255) | 0},${(v * 255) | 0})`;

/**
 * Brick, concrete banding or spandrel glass, depending on type. Drawn into the
 * colour context and the height context together.
 */
function drawWall(c, h, px, type, rand, base) {
  c.fillStyle = hsl(base[0], base[1], base[2]);
  c.fillRect(0, 0, px, px);
  h.fillStyle = grey(0.5);
  h.fillRect(0, 0, px, px);

  if (type === W.ARCH.APARTMENT) {
    // Brick coursing. Individual bricks at this scale would alias into mush,
    // so it is the mortar lines that get drawn -- which is what the eye reads
    // as brick from across a street anyway.
    const course = px / 46;
    for (let y = 0; y < px; y += course) {
      const shade = 0.04 + rand() * 0.03;
      c.fillStyle = `rgba(0,0,0,${shade})`;
      c.fillRect(0, y, px, 1);
      h.fillStyle = grey(0.44);
      h.fillRect(0, y, px, 1);
    }
  } else if (type === W.ARCH.GLASS) {
    // Vertical mullions: the structural rhythm of a curtain wall.
    const step = px / W.FACADE.glass.cols;
    for (let x = 0; x <= px; x += step / 2) {
      c.fillStyle = 'rgba(150,175,210,0.10)';
      c.fillRect(x - 1, 0, 2, px);
      h.fillStyle = grey(0.78);
      h.fillRect(x - 1, 0, 2, px);
    }
  } else if (type === W.ARCH.DECO) {
    // Vertical piers, the defining Art Deco move: the eye is pulled upward.
    const step = px / W.FACADE.deco.cols;
    for (let x = 0; x <= px; x += step) {
      c.fillStyle = 'rgba(255,240,215,0.05)';
      c.fillRect(x - 2, 0, 4, px);
      h.fillStyle = grey(0.72);
      h.fillRect(x - 2, 0, 4, px);
    }
  } else {
    // Concrete: horizontal floor bands between the window rows.
    const step = px / W.FACADE.commercial.rows;
    for (let y = 0; y <= px; y += step) {
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.fillRect(0, y - 2, px, 4);
      h.fillStyle = grey(0.6);
      h.fillRect(0, y - 2, px, 4);
    }
  }

  // Grime and staining, so no two areas of wall are identical.
  for (let i = 0; i < 90; i++) {
    const x = rand() * px;
    const y = rand() * px;
    const r = px * (0.02 + rand() * 0.08);
    c.fillStyle = `rgba(0,0,0,${0.02 + rand() * 0.05})`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
}

/**
 * One window: recess in the height field, reveal and sill in colour, and the
 * lit pane in emissive.
 *
 * Returns whether it was lit, so the caller can keep whole floors dark.
 */
function drawWindow(c, h, e, x, y, w, hgt, type, rand, floorLit, spec) {
  const inset = Math.max(2, Math.min(w, hgt) * W.WINDOW_INSET);

  // Height field: the pane sits back from the wall, the frame stands proud.
  h.fillStyle = grey(0.82);
  h.fillRect(x - inset * 0.5, y - inset * 0.5, w + inset, hgt + inset);
  h.fillStyle = grey(0.18);
  h.fillRect(x, y, w, hgt);

  // Colour: a genuinely dark reveal. An unlit window has to read as a hole in
  // the wall, and it can only do that if the wall around it is bright enough to
  // be a wall -- which is why the palettes above were lifted at the same time.
  c.fillStyle = 'rgba(0,0,0,0.66)';
  c.fillRect(x, y, w, hgt);
  c.fillStyle = 'rgba(255,255,255,0.10)';
  c.fillRect(x - inset * 0.5, y + hgt, w + inset, Math.max(1, inset * 0.7));
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(x - inset * 0.5, y - inset * 0.5, w + inset, Math.max(1, inset * 0.6));

  if (!floorLit || rand() > spec.lit) return false;

  // Lit. Warm domestic or cool fluorescent, and never at full strength --
  // a little variation in brightness reads as different rooms.
  const warm = rand() < spec.warm;
  // Never at full strength. Uniformly hot windows are what makes a facade read
  // as a sticker sheet; a spread of levels reads as different rooms.
  const level = 0.34 + rand() * 0.48;
  const col = warm
    ? `rgba(255,${(178 + rand() * 50) | 0},${(96 + rand() * 60) | 0},${level})`
    : `rgba(${(186 + rand() * 40) | 0},${(214 + rand() * 30) | 0},255,${level})`;
  e.fillStyle = col;
  e.fillRect(x, y, w, hgt);

  // A blind half-drawn, or a brighter pane nearer the glass. Small asymmetries
  // matter more than the lighting model does at this distance.
  if (rand() < 0.3) {
    e.fillStyle = 'rgba(0,0,0,0.55)';
    e.fillRect(x, y, w, hgt * (0.2 + rand() * 0.45));
  }
  // The lit room spills onto its own reveal.
  c.fillStyle = `rgba(255,200,140,${0.1 * level})`;
  c.fillRect(x - inset * 0.5, y + hgt, w + inset, Math.max(1, inset * 0.7));
  return true;
}

/** Sobel the height canvas into a tangent-space normal map. */
function normalFromHeight(heightCanvas, px, strength) {
  const src = heightCanvas.getContext('2d').getImageData(0, 0, px, px).data;
  const { cv, g } = canvas(px);
  const out = g.createImageData(px, px);
  const at = (x, y) => src[(((y + px) % px) * px + ((x + px) % px)) * 4] / 255;

  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
        - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
        - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      // Canvas y runs down and tangent space y runs up, so dy is negated.
      let nx = -dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len;
      const i = (y * px + x) * 4;
      out.data[i] = (nx * 0.5 + 0.5) * 255;
      out.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      out.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return cv;
}

function texture(cv, srgb) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** One {map, emissiveMap, normalMap} set for a type and variant. */
function buildSet(type, variant) {
  const px = W.FACADE_TEX_PX;
  const spec = W.FACADE[type];
  const rand = rngFor(SEED, type, variant);
  const base = WALL[type][(rand() * WALL[type].length) | 0];

  const col = canvas(px);
  const hgt = canvas(px);
  const emi = canvas(px);
  emi.g.fillStyle = '#000';
  emi.g.fillRect(0, 0, px, px);

  drawWall(col.g, hgt.g, px, type, rand, base);

  const cellW = px / spec.cols;
  const cellH = px / spec.rows;
  // Window proportions vary per variant, not just per building: a tall narrow
  // sash and a wide office light are different buildings, not different tints.
  const wFrac = 0.42 + rand() * 0.3;
  const hFrac = type === W.ARCH.APARTMENT ? 0.5 + rand() * 0.16 : 0.44 + rand() * 0.28;

  /**
   * Per-column character, decided once for the whole sheet so it runs the full
   * height of the building the way real structure does.
   *
   * A grid where every bay is identical is the single most artificial thing a
   * procedural facade can do, and jittering positions does not fix it -- it
   * just makes the same grid look wobbly. What actually breaks it up is that
   * bays *differ in kind*: some are blank piers carrying structure, some are
   * paired narrow sashes, the rest are single windows of varying width.
   */
  const bays = [];
  for (let i = 0; i < spec.cols; i++) {
    const roll = rand();
    bays.push({
      blank: roll < (type === W.ARCH.GLASS ? 0.06 : 0.16),
      paired: roll > 0.72 && type !== W.ARCH.GLASS,
      width: wFrac * (0.82 + rand() * 0.36),
    });
  }

  let lit = 0;
  for (let row = 0; row < spec.rows; row++) {
    const floorLit = rand() > W.DARK_FLOOR_CHANCE;
    // Storey heights vary a little; a double-height floor reads as a lobby or
    // a mechanical level and is very common in the real thing.
    const tall = rand() < 0.12;
    const h = cellH * hFrac * (tall ? 1.35 : 1);
    for (let colIx = 0; colIx < spec.cols; colIx++) {
      const bay = bays[colIx];
      if (bay.blank) continue;
      const y = row * cellH + (cellH - h) / 2;

      if (bay.paired) {
        const w = cellW * bay.width * 0.42;
        const gap = cellW * 0.06;
        const x0 = colIx * cellW + (cellW - (w * 2 + gap)) / 2;
        for (const x of [x0, x0 + w + gap]) {
          if (drawWindow(col.g, hgt.g, emi.g, x, y, w, h, type, rand, floorLit, spec)) lit++;
        }
      } else {
        const w = cellW * bay.width;
        const x = colIx * cellW + (cellW - w) / 2;
        if (drawWindow(col.g, hgt.g, emi.g, x, y, w, h, type, rand, floorLit, spec)) lit++;
      }
    }
  }

  return {
    type,
    lit,
    map: texture(col.cv, true),
    emissiveMap: texture(emi.cv, true),
    normalMap: texture(normalFromHeight(hgt.cv, px, type === W.ARCH.GLASS ? 1.4 : 2.2), false),
    cellW: spec.cellW,
    floorH: spec.floorH,
    cols: spec.cols,
    rows: spec.rows,
  };
}

/**
 * Every facade set, plus the count of lit windows drawn -- reported in the
 * overlay, because a texture generator that silently produced black sheets is
 * exactly the kind of thing that passes every syntax check there is.
 */
export function buildFacades() {
  const sets = {};
  let litTotal = 0;
  for (const type of W.ARCH_ORDER) {
    sets[type] = [];
    for (let v = 0; v < W.FACADE_VARIANTS; v++) {
      const set = buildSet(type, v);
      litTotal += set.lit;
      sets[type].push(set);
    }
  }
  return { sets, litTotal, count: W.ARCH_ORDER.length * W.FACADE_VARIANTS };
}
