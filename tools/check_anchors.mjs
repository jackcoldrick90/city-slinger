// Fails if a positional literal appears anywhere in src/ except world.js.
//
// This exists because on the last project the same bug was shipped three times:
// a vertical position written as a bare number, correct in the viewport it was
// measured in and silently wrong in every other. The fix was never subtle -- it
// was that nobody could *find* the numbers. A grep can.
//
// Zero is allowed. `position.set(0, 0, 0)` is a reset, not a measurement, and
// the failure mode this guards against is an unfindable magic row -- 0 is
// findable by inspection. Every other number must come from world.js.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');
const EXEMPT = new Set(['world.js']);

const NUM = String.raw`-?(?:0|0\.0+)`;          // the only literal allowed
const RULES = [
  // mesh.position.y = 42
  { re: /\.position\.[xyz]\s*=\s*(-?[\d.]+)/g, what: 'position.<axis> = <number>' },
  // mesh.position.set(1, 2, 3) — flagged if ANY component is a non-zero literal
  { re: /\.position\.set\(([^)]*)\)/g, what: 'position.set(<numbers>)', args: true },
  // new Vector3(1, 2, 3)
  { re: /new\s+(?:THREE\.)?Vector3\(([^)]*)\)/g, what: 'new Vector3(<numbers>)', args: true },
  // { x: 1, y: 2 } style anchors handed to the physics
  { re: /\by\s*:\s*(-?[\d.]+)/g, what: 'y: <number>' },
];

const allowed = new RegExp(`^${NUM}$`);
let bad = 0;
let checked = 0;

const FILES = readdirSync(SRC).filter(f => f.endsWith('.js')).sort();

// Syntax-check every file, one process each.
//
// `node --check src/*.js` looks like it does this and does not: node reads only
// the first path and exits 0, so a syntax error in any other file passes
// silently. That is the same class of bug as code written and never called --
// a green check that measured nothing -- so this loop counts what it checked
// and prints the number.
for (const file of FILES) {
  try {
    execFileSync(process.execPath, ['--check', join(SRC, file)], { stdio: 'pipe' });
    checked++;
  } catch (e) {
    console.error(`${file}: syntax error\n${e.stderr?.toString().trim()}`);
    bad++;
  }
}

for (const file of FILES) {
  if (EXEMPT.has(file)) continue;
  const lines = readFileSync(join(SRC, file), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line))) {
        const parts = rule.args
          ? m[1].split(',').map(s => s.trim()).filter(Boolean)
          : [m[1]];
        const offenders = parts.filter(p => /^-?[\d.]+$/.test(p) && !allowed.test(p));
        if (offenders.length) {
          console.error(
            `${file}:${i + 1}  ${rule.what} -> ${offenders.join(', ')}\n    ${line.trim()}`);
          bad++;
        }
      }
    }
  });
}

if (bad) {
  console.error(`\n${bad} problem(s). Positional numbers belong in world.js.`);
  process.exit(1);
}
console.log(`ok — ${checked} file(s) parsed, 0 positional literals outside world.js`);
