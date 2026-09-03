/**
 * Wiring, the frame loop, and the one system that has to reach across all of
 * them: deciding what a click hits.
 */
import * as THREE from 'three';
import * as W from './world.js';
import * as swing from './swing.js';
import { createCity } from './city.js';
import { createStreet } from './street.js';
import { createGround } from './ground.js';
import { createAtmosphere } from './atmosphere.js';
import { createPostFx } from './postfx.js';
import { createPlayer } from './player.js';
import { createWebLine } from './webline.js';
import { createFollow } from './follow.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { probeContrast, probePlayer } from './probe.js';
import { createSpeedLines } from './speed.js';
import { createSteam } from './steam.js';
import { createEffects } from './effects.js';
import { createPickups } from './pickups.js';
import { createBirds } from './birds.js';
import { createEnemies } from './enemies.js';
import { paletteAt, keyDirection, wrapPhase } from './daylight.js';

const canvas = document.querySelector('#view');
const deathOverlay = document.querySelector('#deathOverlay');
const deathSummary = document.querySelector('#deathSummary');
const scoreForm = document.querySelector('#scoreForm');
const scoreName = document.querySelector('#scoreName');
const scoreStatus = document.querySelector('#scoreStatus');
const leaderboardList = document.querySelector('#leaderboard');
const startLeaderboardList = document.querySelector('#startLeaderboard');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(W.FOG_COLOR);
// ACES rolls the highlights off instead of clipping them, which is what keeps a
// frame full of emissive windows from turning into flat white blocks.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
/**
 * `renderer.info` resets itself on every `render()` call, and the post chain
 * calls render once per pass -- so the overlay was reporting the cost of the
 * final full-screen quad and nothing else. It read `draw calls 1`, which is a
 * number that would have gone on looking healthy forever. Reset it by hand at
 * the top of each frame instead, and it counts the whole frame: scene plus
 * every post pass.
 */
renderer.info.autoReset = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // r185 deprecated the soft variant

let phase = W.DAY_START;
let timeScale = 0;                       // index into W.TIME_SCALES
let palette = paletteAt(phase);

// Declared up here rather than beside paintSky below, because `skyTexture()`
// is called a few lines down to build the scene background. Function
// declarations hoist and `const` does not, so leaving these next to their
// functions gives a temporal dead zone error at start-up.
const skyCanvas = document.createElement('canvas');
let skyTex = null;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(palette.fog, palette.density);
scene.background = skyTexture();

const camera = new THREE.PerspectiveCamera(W.FOV, 1, W.NEAR, W.FAR);

/**
 * Three lights, none of which light a window.
 *
 * The key is the sun by day and the moon by night -- one light that swaps to
 * the opposite side of the sky rather than two that fade past each other, so
 * there is always something raking across the facades, catching roof edges,
 * cornices and the tops of setbacks. That is what turns a box into a solid.
 * The rim comes from the far side and cool, separating a near building from
 * the one behind it. The hemisphere fill is sky above and ground below,
 * standing in for bounce.
 *
 * Windows are emissive and light themselves; if they were lit by any of these
 * they would go dim whenever a building faced away -- and would not be able to
 * stay on after dark.
 *
 * Every colour, direction and intensity here is reassigned from the palette
 * each frame. The values below are only what the first frame is built with.
 */
const key = new THREE.DirectionalLight(palette.key, palette.keyI);
key.castShadow = true;
key.shadow.mapSize.set(W.SHADOW_MAP, W.SHADOW_MAP);
key.shadow.bias = W.SHADOW_BIAS;
key.shadow.normalBias = W.SHADOW_NORMAL_BIAS;
{
  const box = key.shadow.camera;
  box.left = -W.SHADOW_EXTENT;
  box.right = W.SHADOW_EXTENT;
  box.top = W.SHADOW_EXTENT;
  box.bottom = -W.SHADOW_EXTENT;
  box.near = W.SHADOW_NEAR;
  box.far = W.SHADOW_FAR;
}
scene.add(key);
// A directional light has no position as far as *lighting* is concerned, but
// its shadow camera very much does. The target has to be in the scene for
// three to keep its matrix, and both ends of the rig travel with the player --
// see `aimShadows`.
scene.add(key.target);
const keyDir = new THREE.Vector3();
const rim = new THREE.DirectionalLight(palette.rim, palette.rimI);
rim.position.set(W.RIM_DIR.x, W.RIM_DIR.y, W.RIM_DIR.z);
scene.add(rim);
const hemi = new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, palette.hemiI);
scene.add(hemi);

const atmosphere = createAtmosphere(scene, renderer, palette);
const city = createCity(scene);
const street = createStreet(scene);
const ground = createGround(scene);
const player = createPlayer(scene);
const web = createWebLine(scene);
const follow = createFollow(camera);
const input = createInput(canvas);
const hud = createHud(document.body);
const audio = createAudio();
const speedLines = createSpeedLines(scene);
const steam = createSteam(scene);
const effects = createEffects(scene);
const pickups = createPickups(scene);
const birds = createBirds(scene);
const enemies = createEnemies(scene);
const postfx = createPostFx(renderer, scene, camera);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const anchorWorld = new THREE.Vector3();
const aim = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const roofPoint = new THREE.Vector3();
/**
 * The plane the player lives in. A miss has to travel along *this*, not along
 * the camera ray -- the ray points mostly into the screen, so a web fired at it
 * shoots away from the viewer and projects to a near-vertical streak heading
 * for the vanishing point. It looked like the strand was drawn upside down.
 */
const AIM_PLANE = new THREE.Plane(
  new THREE.Vector3(W.PLANE_NORMAL.x, W.PLANE_NORMAL.y, W.PLANE_NORMAL.z),
  -W.PLAYER_Z,
);

/**
 * A vertical gradient, rendered as a full-screen background quad and repainted
 * every frame from the palette.
 *
 * One pixel wide by 256 tall, so "repaint and re-upload every frame" is a
 * kilobyte of texture and a single `createLinearGradient` -- cheaper than any
 * of the schemes for avoiding it, and it means the sky can never be a frame
 * out of step with the light.
 */
function skyTexture() {
  skyCanvas.width = 1;
  skyCanvas.height = W.SKY_TEX_H;
  skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  paintSky(palette);
  return skyTex;
}

function paintSky(pal) {
  const g = skyCanvas.getContext('2d');
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const grad = g.createLinearGradient(0, 0, 0, skyCanvas.height);
  grad.addColorStop(0, hex(pal.skyTop));
  grad.addColorStop(0.55, hex(pal.skyMid));
  grad.addColorStop(1, hex(pal.skyBottom));
  g.fillStyle = grad;
  g.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
  skyTex.needsUpdate = true;
}

/**
 * Push the palette into every system that has an opinion about the time of day.
 *
 * Deliberately one function: the failure mode of a day/night cycle is that one
 * subsystem is left out and disagrees with the rest -- lamps still burning at
 * noon, a sunlit street under a black sky -- and a single list of assignments
 * is the cheapest way to see at a glance that nothing is missing.
 */
function applyPalette(pal) {
  const dir = keyDirection(pal.phase);
  keyDir.set(dir.x, dir.y, dir.z).normalize();
  key.color.setHex(pal.key);
  key.intensity = pal.keyI;
  rim.color.setHex(pal.rim);
  rim.intensity = pal.rimI;
  hemi.color.setHex(pal.hemiSky);
  hemi.groundColor.setHex(pal.hemiGround);
  hemi.intensity = pal.hemiI;

  scene.fog.color.setHex(pal.fog);
  scene.fog.density = pal.density;
  renderer.toneMappingExposure = pal.exposure;
  paintSky(pal);

  city.setWindowLevel(pal.window);
  street.setNight(pal.lamp);
  steam.setNight(pal.lamp);
  player.setEmissive(pal.suit);
  atmosphere.setPalette(pal);
  postfx.setStrength(pal.bloom);
}

/**
 * Point the shadow rig at the player.
 *
 * The shadow camera is a fixed-size box, so it has to travel. Left at the world
 * origin it works beautifully for the first few seconds and then the player
 * swings out of it and every shadow in the scene disappears at once -- which
 * looks like the feature breaking rather than the volume running out.
 */
function aimShadows() {
  key.target.position.set(follow.x, follow.y, W.PLAYER_Z);
  key.target.updateMatrixWorld();
  key.position.copy(key.target.position).addScaledVector(keyDir, W.SHADOW_DIST);
}

/** Phase 0..1 as a clock, for the overlay. */
function clockOf(p) {
  const mins = Math.floor(p * 1440);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- run state

const state = swing.createState(0, W.SPAWN_Y, W.LAUNCH_VX, 0);
const run = {
  started: false,
  startX: 0,
  best: 0,
  respawnAt: 0,          // 0 when alive
  webFiredAt: 0,
  fired: 0,
  hits: 0,
  misses: 0,
  lastMiss: '—',
  assist: '—',
  lastProbe: null,
  lastPlayerProbe: null,
  webFuel: W.WEB_FUEL_MAX,
  pizzas: 0,
  bestPizzas: 0,
  spawnAt: 0,
  milestone: 0,          // the last MILESTONE_STEP crossed this run, 0 = none yet
  deathCause: null,       // 'drone' | 'fuel' | 'fall', set just before die() is called
  deathDistance: 0,
  deathShown: false,      // the death screen is up, waiting on the restart button
};

function beginRun(fromX) {
  state.x = fromX;
  state.y = W.SPAWN_Y;
  state.vx = W.LAUNCH_VX;
  state.vy = 0;
  swing.release(state);
  run.startX = fromX;
  run.spawnAt = performance.now();
  run.webFuel = W.WEB_FUEL_MAX;
  run.pizzas = 0;
  run.milestone = 0;
  run.deathShown = false;
  pickups.reset();
  follow.reset(state.x, state.y);
}

/**
 * Decide what a click hits.
 *
 * Everything about this can fail invisibly -- a ray that hits nothing, a roof
 * behind the player, a building just out of reach -- so every outcome is
 * counted and the last failure is named in the overlay. A click that does
 * nothing and says nothing is indistinguishable from a broken event handler,
 * which is a day this project would rather not have.
 */
function fireWeb() {
  run.fired++;

  // A charge is spent by a successful attach, not by a miss -- the aim-assist
  // fan and the roofline fallback already answer the aiming question, so the
  // resource this gates is distance travelled, not accuracy.
  if (run.webFuel <= 0) {
    run.misses++;
    run.assist = 'miss';
    run.lastMiss = 'out of web fluid';
    return;
  }

  // Where the aim crosses the player's own plane: the direction a failed web
  // should travel, and the direction the roofline fallback matches against.
  pointer.set(input.ndcX, input.ndcY);
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(AIM_PLANE, aimPoint)) {
    aim.subVectors(aimPoint, player.handWorld);
  } else {
    aim.copy(raycaster.ray.direction);
  }

  let reason = 'nothing in that direction';
  const tryPoint = (point, how) => {
    if (point.y < state.y + W.AIM_MIN_RISE) { reason = 'that roof is below you'; return false; }
    if (!swing.attach(state, point.x, point.y)) {
      reason = Math.hypot(point.x - state.x, point.y - state.y) > W.MAX_ROPE
        ? 'out of reach' : 'too close';
      return false;
    }
    anchorWorld.copy(point);
    run.hits++;
    run.assist = how;
    run.webFiredAt = performance.now();
    run.webFuel--;
    audio.thwip();
    effects.attach(anchorWorld);
    return true;
  };

  // 1 & 2: the exact ray, then a small fan around it.
  for (const [dx, dy] of W.AIM_FAN) {
    pointer.set(input.ndcX + dx * W.AIM_FAN_NDC, input.ndcY + dy * W.AIM_FAN_NDC);
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(city.anchorTargets, false)) {
      if (tryPoint(hit.point, dx === 0 && dy === 0 ? 'exact' : 'fan')) return;
    }
  }

  // 3: the roofline of whichever reachable building best matches the aim.
  const roof = bestRoofline();
  if (roof && tryPoint(roof, 'roofline')) return;

  run.misses++;
  run.lastMiss = reason;
  run.assist = 'miss';
  web.showMiss(player.handWorld, aim, performance.now());
}

/**
 * The most plausible roof edge for the direction pointed.
 *
 * A roof is where a web visibly *should* catch, and it is always above the
 * building, so this can never hand back an anchor beneath the player. The x is
 * clamped to the building's own footprint, so the web lands on the near corner
 * of a building you are alongside rather than its far one.
 */
function bestRoofline() {
  const wantX = aim.x;
  const wantY = aim.y;
  const wantLen = Math.hypot(wantX, wantY) || 1;
  let best = null;
  let bestDot = 0;

  for (const mesh of city.anchorTargets) {
    const halfW = mesh.scale.x / 2;
    const x = Math.min(mesh.position.x + halfW,
      Math.max(mesh.position.x - halfW, state.x + wantX));
    const y = mesh.position.y + mesh.scale.y / 2;
    const dx = x - state.x;
    const dy = y - state.y;
    const d = Math.hypot(dx, dy);
    if (d > W.MAX_ROPE || d < W.MIN_ROPE || dy < W.AIM_MIN_RISE) continue;
    const dot = (dx * wantX + dy * wantY) / (d * wantLen);
    if (dot > bestDot) {
      bestDot = dot;
      best = roofPoint.set(x, y, mesh.position.z);
    }
  }
  return best;
}

// ---------------------------------------------------------------- the loop

let last = performance.now();
let accumulator = 0;
let fps = 60;
let steps = 0;

function frame(now) {
  requestAnimationFrame(frame);

  renderer.info.reset();
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-6) - fps) * 0.1;

  if (run.started) {
    phase = wrapPhase(phase + (dt * W.TIME_SCALES[timeScale]) / W.DAY_LENGTH);
    simulate(dt, now);
  }
  palette = paletteAt(phase);
  applyPalette(palette);

  city.update(follow.x);
  ground.update(follow.x);
  street.update(follow.x, dt);
  player.update(state, dt);
  web.update(player.handWorld, state.anchor ? anchorWorld : null,
    now - run.webFiredAt, now, dt, state.taut);
  follow.update(state, dt);
  // After the camera has moved, not before: the star shell, the sun and moon,
  // the speed streaks, the shadow box and the pickups' billboarded halos are
  // all positioned relative to it, and a frame of lag there shows up as the
  // sky (or a halo) sliding against the city.
  atmosphere.update(camera, dt);
  aimShadows();
  speedLines.update(follow.x, follow.y, state.vx, state.vy);
  steam.update(follow.x, camera, dt);
  birds.update(camera, dt);
  effects.update(camera, state, dt);
  if (run.started && !run.respawnAt) {
    const got = pickups.update(camera, state.x, state.y, dt);
    run.pizzas += got.pizzas;
    run.bestPizzas = Math.max(run.bestPizzas, run.pizzas);
    if (got.fuel > 0) run.webFuel = W.WEB_FUEL_MAX;

    const hit = enemies.update(camera, state.x, state.y, dt);
    // A brief grace window after a spawn or respawn: a drone's position is
    // continuous from the moment the page loaded, so without this a run
    // could end before the player had ever seen what killed them.
    if (hit && now - run.spawnAt > W.ENEMY_GRACE_MS) { run.deathCause = 'drone'; die(now); }
  } else {
    enemies.update(camera, state.x, state.y, dt);
  }
  postfx.setMotion(state.vx, state.vy, ...playerOnScreen());

  postfx.render();

  // readPixels has to happen in the same tick as the render that produced the
  // frame, so the probe runs here rather than from the keydown handler.
  if (input.probeRequested) {
    run.lastProbe = probeContrast(renderer, camera, city);
    run.lastPlayerProbe = probePlayer(renderer, camera, player.root);
  }
  if (input.bloomToggleRequested) postfx.toggle();
  if (input.motionToggleRequested) postfx.toggleMotion();
  if (input.timeScaleRequested) timeScale = (timeScale + 1) % W.TIME_SCALES.length;

  hud.setScore(Math.max(0, state.x - run.startX), run.best);
  hud.setPizzas(run.pizzas, run.bestPizzas);
  hud.setFuel(run.webFuel, W.WEB_FUEL_MAX);
  hud.setDebug(input.debug, debugRows(dt));
  input.endFrame();
}

function simulate(dt, now) {
  if (run.respawnAt) {
    const t = Math.min(1, (now - run.respawnAt) / W.RESPAWN_MS);
    player.setOpacity(1 - t);
    // The run does not resume on its own any more -- it waits on the
    // restart button, so the fade only ever needs to go one way.
    if (t >= 1 && !run.deathShown) showDeathScreen();
    if (run.deathShown && input.restartRequested) restart();
    return;
  }

  if (input.pressedThisFrame) fireWeb();
  if (input.releasedThisFrame && swing.isAttached(state)) swing.release(state);
  if (input.restartRequested) beginRun(state.x);

  // Fixed steps, capped. A tab that has been in the background for a minute
  // comes back with an enormous dt, and without the cap it would try to
  // simulate the whole minute in one frame and lock the page.
  accumulator += dt;
  steps = 0;
  while (accumulator >= W.FIXED_DT && steps < W.MAX_STEPS) {
    const result = swing.step(state, W.FIXED_DT, { reel: input.down && swing.isAttached(state) });
    accumulator -= W.FIXED_DT;
    steps++;
    if (result === 'grounded') {
      run.deathCause = run.webFuel <= 0 ? 'fuel' : 'fall';
      die(now);
      break;
    }
  }
  if (steps === W.MAX_STEPS) accumulator = 0;

  audio.setSpeed(swing.speed(state));
  const distance = state.x - run.startX;
  run.best = Math.max(run.best, distance);

  const milestone = Math.floor(distance / W.MILESTONE_STEP);
  if (milestone > run.milestone) {
    run.milestone = milestone;
    const body = W.MILESTONE_MESSAGES[(milestone - 1) % W.MILESTONE_MESSAGES.length];
    hud.setHint(`${(milestone * W.MILESTONE_STEP).toLocaleString()}m ${body}`);
    setTimeout(() => hud.setHint(''), W.MILESTONE_HINT_MS);
  }
}

function die(now) {
  effects.land(state.x, W.STREET_Y, W.PLAYER_Z);
  swing.release(state);
  state.vx = 0;
  state.vy = 0;
  run.respawnAt = now;
  run.deathDistance = state.x - run.startX;
  hud.setHint('');
}

const LEADERBOARD_CACHE_KEY = 'leaderboard-cache';

/** Whatever the last successful fetch returned, or null on a first-ever visit. */
function cachedLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // private browsing, storage disabled, or corrupt JSON
  }
}

/**
 * The leaderboard is decoration on top of the game, never load-bearing for
 * it -- `npm run dev` serves static files only, with no `/api` route behind
 * it, so every fetch here is expected to fail there. Every failure is caught
 * and swallowed silently for exactly that reason.
 *
 * Shared by two lists: the start screen's, loaded once at startup, and the
 * death screen's, reloaded after every death and every submitted score.
 *
 * A fresh `fetch` is a round trip plus whatever a scale-to-zero Neon compute
 * takes to wake up -- visible as a blank list for a beat before it fills in,
 * which is what read as "not instant". The cached copy from the *last*
 * successful fetch renders synchronously, before that request has even gone
 * out, so only the very first visit a browser ever makes is not instant.
 */
async function loadLeaderboard(target) {
  const cached = cachedLeaderboard();
  if (cached) renderLeaderboard(target, cached);

  try {
    const res = await fetch('/api/scores');
    if (!res.ok) return;
    const rows = await res.json();
    renderLeaderboard(target, rows);
    try { localStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify(rows)); } catch {
      // Storage can be full or disabled -- the freshly rendered list stands either way.
    }
  } catch {
    // No API locally, or genuinely offline -- the cached render above stands.
  }
}

/** Built with real DOM nodes and `textContent`, never `innerHTML` -- a
 * player's own submitted name is untrusted text shown to every other player,
 * and this is what keeps one from being able to inject markup into it. */
function renderLeaderboard(target, rows) {
  target.textContent = '';
  rows.forEach((row, i) => {
    const li = document.createElement('li');
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}`;
    const name = document.createElement('span');
    name.className = 'lb-name';
    name.textContent = row.name;
    const dist = document.createElement('span');
    dist.className = 'lb-dist';
    dist.textContent = `${row.distance}m`;
    li.append(rank, name, dist);
    target.appendChild(li);
  });
}

/** Populate and reveal the death screen -- once per death, not once per frame. */
function showDeathScreen() {
  run.deathShown = true;
  const cause = W.DEATH_LABELS[run.deathCause] ?? W.DEATH_LABELS.fall;
  deathSummary.textContent = `You reached ${Math.max(0, Math.round(run.deathDistance))}m. ${cause}`;
  scoreForm.hidden = false;
  scoreName.value = '';
  scoreStatus.hidden = true;
  deathOverlay.hidden = false;
  loadLeaderboard(leaderboardList);
}

/** Hide the death screen and start the next life. */
function restart() {
  deathOverlay.hidden = true;
  run.respawnAt = 0;
  run.deathShown = false;
  player.setOpacity(1);
  beginRun(state.x + W.SPAWN_AHEAD);
}

/** One probe reading, or the reason there isn't one. Never a blank row. */
function probeRow(what, r) {
  if (!r) return `probe ${what}: press P`;
  if (r.reason) return `probe ${what}: ${r.reason}`;
  const wall = r.wall === undefined ? '' : ` wall ${r.wall.toFixed(0)}`;
  return `probe ${what}: lit ${r.subject.toFixed(0)}${wall} vs backdrop ${r.backdrop.toFixed(0)}`
    + `  ->  gap ${r.gap.toFixed(0)}`;
}

const onScreen = new THREE.Vector3();

/** The player's position in uv, which is where the motion blur leaves off. */
function playerOnScreen() {
  onScreen.set(state.x, state.y, W.PLAYER_Z).project(camera);
  return [(onScreen.x + 1) / 2, (onScreen.y + 1) / 2];
}

function debugRows(dt) {
  const info = renderer.info.render;
  const c = city.stats;
  const p = run.lastProbe;
  const q = run.lastPlayerProbe;
  return [
    `fps ${fps.toFixed(0)}  dt ${(dt * 1000).toFixed(1)}ms  steps ${steps}`,
    `${clockOf(phase)}  ${palette.name}  phase ${phase.toFixed(3)}  time x${W.TIME_SCALES[timeScale]}  env builds ${atmosphere.stats.envBuilds}`,
    `view ${canvas.clientWidth}x${canvas.clientHeight}px  = ${view.w.toFixed(0)}x${view.h.toFixed(0)} units  cam back ${follow.distance.toFixed(0)}`,
    `draw calls ${info.calls}  tris ${info.triangles}  bloom ${postfx.enabled ? 'on' : 'OFF'}`
      + `  blur ${postfx.motion ? 'on' : 'OFF'}  shadows ${renderer.shadowMap.enabled ? W.SHADOW_MAP : 'off'}  streaks ${speedLines.stats.streaks}`,
    `buildings ${c.live} in ${W.LANES.length} lanes  facades ${c.facades}  props ${c.props}  shops ${c.shops}  perched pigeons ${c.pigeons}  overflow ${c.poolMisses}`,
    `city rebuilds ${c.rebuilds}  facade textures ${c.facadeTex}  lit windows drawn ${c.litWindows}`,
    `avenues ${street.stats.avenues}  cars ${street.stats.cars} (${street.stats.taxis} cabs, ${street.stats.emergency} blues)  lamps ${street.stats.lamps}  trees ${street.stats.trees}  street ${street.stats.furniture}  steam ${steam.stats.puffs}`,
    `gantries ${street.stats.spans}  viaduct ${street.stats.viaduct}  back streets ${street.stats.back}  medians ${street.stats.medians}  pedestrians ${street.stats.pedestrians}  ground trees ${ground.stats.trees}  shrubs ${ground.stats.shrubs}`,
    `haze ${atmosphere.stats.haze}  far skyline ${atmosphere.stats.farSkyline}  dust ${atmosphere.stats.dust}  stars ${atmosphere.stats.stars}  clouds ${atmosphere.stats.clouds}  ${atmosphere.stats.sunUp ? 'sun up' : 'moon up'}  windows ${(palette.window * 100).toFixed(0)}%  lamps ${(palette.lamp * 100).toFixed(0)}%`,
    `anchor colliders ${c.anchorable}`,
    `player x ${state.x.toFixed(1)} y ${state.y.toFixed(1)}  |v| ${swing.speed(state).toFixed(1)}  roof below ${city.roofAt(state.x).toFixed(0)}`,
    `rope ${state.anchor ? (state.taut ? 'taut' : 'SLACK') : 'free'}  len ${state.len.toFixed(1)}  theta ${state.theta.toFixed(2)}`,
    `webs fired ${run.fired}  hit ${run.hits}  missed ${run.misses}  via ${run.assist}  hanging ${web.spentCount}  last miss: ${run.lastMiss}`,
    `flashes ${effects.stats.flashes}  dust ${effects.stats.dust}`,
    `pizzas on screen ${pickups.stats.pizzas}  fuel on screen ${pickups.stats.fuel}  webFuel ${run.webFuel}/${W.WEB_FUEL_MAX}  pizzas collected ${run.pizzas} (best ${run.bestPizzas})`,
    `pigeons flying ${birds.stats.flying}  drones ${enemies.stats.flying}  difficulty tier ${enemies.stats.tier}`,
    `audio started=${audio.state.started} gain-honoured=${audio.state.gainHonoured} thwips ${audio.state.thwips}`,
    probeRow('window', p),
    probeRow('player', q),
  ];
}

// ---------------------------------------------------------------- start-up

let view = { w: 0, h: 0 };

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, W.MAX_DPR));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  // Stand back far enough to keep a playable width of city in shot, but never
  // further than the cap -- see MIN_VIEW_W.
  const halfFov = Math.tan((W.FOV / 2) * (Math.PI / 180));
  const needed = W.MIN_VIEW_W / (2 * halfFov * camera.aspect);
  const dist = Math.min(W.CAM_DIST * W.CAM_PULLBACK_MAX, Math.max(W.CAM_DIST, needed));
  follow.setDistance(dist);
  follow.apply(camera);

  view = { w: 2 * dist * halfFov * camera.aspect, h: 2 * dist * halfFov };
  // The composer owns its own render targets; without this the post chain keeps
  // rendering at the old size and the image stretches.
  postfx.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

/**
 * The start screen's light choice.
 *
 * Day and Night pin `phase` and freeze the clock (`TIME_SCALE_PAUSED`) so the
 * chosen look never drifts under the player -- useful for practising the swing
 * without the light changing on you. Cycle leaves both where they already are:
 * `DAY_START` and the default `timeScale`, which is what every run looked like
 * before this menu existed.
 *
 * The palette is applied every frame regardless of `run.started` (see
 * `frame()`), so picking a mode repaints the city behind the overlay
 * immediately -- the button is a preview, not just a choice.
 */
document.querySelectorAll('.mode').forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    if (mode === 'day') { phase = W.DAY_PHASE; timeScale = W.TIME_SCALE_PAUSED; }
    else if (mode === 'night') { phase = W.NIGHT_PHASE; timeScale = W.TIME_SCALE_PAUSED; }
    palette = paletteAt(phase);
    applyPalette(palette);

    document.querySelector('#overlay').hidden = true;
    audio.start();                     // must be inside the gesture
    run.started = true;
    hud.setHint('hold to reel in · let go to fly');
    setTimeout(() => hud.setHint(''), 4000);
  });
});

document.querySelector('#restartBtn').addEventListener('click', restart);

scoreForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = scoreName.value.trim();
  if (!name) return;
  scoreForm.hidden = true;
  scoreStatus.hidden = false;
  scoreStatus.textContent = 'submitting…';
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        distance: Math.max(0, Math.round(run.deathDistance)),
        cause: run.deathCause ?? 'fall',
      }),
    });
    scoreStatus.textContent = res.ok ? 'on the board.' : 'could not submit that score.';
    if (res.ok) loadLeaderboard(leaderboardList);
  } catch {
    scoreStatus.textContent = 'could not reach the leaderboard.';
  }
});

loadLeaderboard(startLeaderboardList);

beginRun(0);
city.update(follow.x);
ground.update(follow.x);
requestAnimationFrame(frame);
