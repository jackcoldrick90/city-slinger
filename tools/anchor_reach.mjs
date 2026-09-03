/**
 * How often is there actually something to swing from?
 *
 * "There isn't enough to grab" is the kind of complaint that is very easy to
 * answer by feel and get wrong. This walks a long stretch of the real city --
 * the same `describe()` the renderer uses -- and, at a range of altitudes,
 * counts the fraction of positions with a reachable anchor and the longest
 * run without one.
 *
 * Reachability mirrors `fireWeb` exactly: a point on a massing part, at least
 * AIM_MIN_RISE above the player and no further than MAX_ROPE away. Getting that
 * rule wrong here would make the whole measurement worse than useless, so it is
 * derived the same way -- clamp along, then take the lowest usable height.
 */
import * as W from '../src/world.js';
import { describe } from '../src/buildings.js';

const SPAN = 12000;      // units of city walked
const STEP = 4;

/** Closest reachable point on one massing part, or null. */
function reach(part, px, py) {
  const dx = Math.min(part.x + part.w / 2, Math.max(part.x - part.w / 2, px)) - px;
  const yLo = Math.max(part.y - part.h / 2, py + W.AIM_MIN_RISE);
  const yHi = part.y + part.h / 2;
  if (yLo > yHi) return null;                    // the whole part is below you
  const d = Math.hypot(dx, yLo - py);
  return d <= W.MAX_ROPE && d >= W.MIN_ROPE ? d : null;
}

const lanes = W.LANES.map((lane, li) => ({ lane, li })).filter((l) => l.lane.anchor);

function survey(py) {
  let found = 0;
  let total = 0;
  let dry = 0;
  let worstDry = 0;

  for (let px = 0; px < SPAN; px += STEP) {
    total++;
    let ok = false;
    for (const { lane, li } of lanes) {
      const from = Math.floor((px - W.MAX_ROPE) / lane.pitch);
      const to = Math.ceil((px + W.MAX_ROPE) / lane.pitch);
      for (let n = from; n <= to && !ok; n++) {
        const desc = describe(li, lane, n);
        if (!desc) continue;
        for (const part of desc.parts) {
          if (part.kind === 'ledge') continue;
          if (reach(part, px, py) !== null) { ok = true; break; }
        }
      }
      if (ok) break;
    }
    if (ok) { found++; dry = 0; } else { dry += STEP; worstDry = Math.max(worstDry, dry); }
  }
  return { pct: (found / total) * 100, worstDry };
}

console.log(`anchor reach over ${SPAN} units  (rope ${W.MAX_ROPE}, rise ${W.AIM_MIN_RISE})`);
for (const py of [25, 35, 45, 55, 65, 75, 85]) {
  const { pct, worstDry } = survey(py);
  const bar = '#'.repeat(Math.round(pct / 4)).padEnd(25);
  console.log(`  y=${String(py).padStart(3)}  ${bar} ${pct.toFixed(1).padStart(5)}%   longest gap ${worstDry}u`);
}
