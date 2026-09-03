// Copy the three.js ES module build out of node_modules into vendor/, so the
// page can `import ... from 'three'` through an import map with no bundler and
// no CDN. vendor/ is committed; node_modules/ is not.
//
// Two files, not one. Since r167 `three.module.js` is a thin re-export shell
// that imports the actual library from `./three.core.js` next to it -- copy
// only the first and every import fails at runtime with a 404 that looks like
// a broken import map. The pair is copied non-minified on purpose: this is an
// experiment, and a readable stack trace is worth the bytes.
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FROM = join(ROOT, 'node_modules', 'three', 'build');
const TO = join(ROOT, 'vendor', 'three');
const FILES = ['three.module.js', 'three.core.js'];

/**
 * Post-processing addons, for the bloom pass.
 *
 * These live under `examples/jsm` but they are part of three.js, not a third
 * party -- they just are not in the core bundle. Only the files actually
 * reached are copied, hand-walked from the import graph rather than mirroring
 * the whole examples directory. They import each other by relative path and
 * import three by bare specifier, so the page's import map needs a
 * `three/addons/` entry as well as `three` itself.
 */
const ADDONS = [
  'postprocessing/EffectComposer.js',
  'postprocessing/Pass.js',
  'postprocessing/RenderPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/MaskPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
  'shaders/CopyShader.js',
  'shaders/LuminosityHighPassShader.js',
  'shaders/OutputShader.js',
  'utils/BufferGeometryUtils.js',
];

mkdirSync(TO, { recursive: true });
let total = 0;
for (const f of FILES) {
  copyFileSync(join(FROM, f), join(TO, f));
  const kb = statSync(join(TO, f)).size / 1024;
  total += kb;
  console.log(`vendored ${f}  ${kb.toFixed(0)}kB`);
}

const ADDON_FROM = join(ROOT, 'node_modules', 'three', 'examples', 'jsm');
const ADDON_TO = join(TO, 'addons');
for (const f of ADDONS) {
  const dest = join(ADDON_TO, f);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(ADDON_FROM, f), dest);
  total += statSync(dest).size / 1024;
}
console.log(`vendored ${ADDONS.length} addon files`);
console.log(`total ${(total / 1024).toFixed(1)}MB in vendor/three`);
