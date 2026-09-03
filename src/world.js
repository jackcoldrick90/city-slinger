/**
 * Every constant in the game lives here. Nothing else in src/ may hold a
 * positional literal, and `npm run check` fails the build if one appears.
 *
 * This rule is the single most expensive lesson from the last project. There,
 * literals like `150` and `176` were rows measured in one viewport, with that
 * fact recorded only in the author's head -- and when the viewport changed they
 * were unfindable, and were missed three separate times. A bare `150` cannot be
 * audited. `GROUND_Y - PROP_H` audits itself.
 *
 * Units are loosely metres: the player is 2.2 tall, a city block is 20 across.
 * Gravity is NOT 9.8. Real gravity on a 30-metre rope gives a pendulum with a
 * ten-second period, which reads as slow motion. Everything here is tuned for
 * feel and then written down, not derived.
 */

// ---------------------------------------------------------------- the world

export const STREET_Y = 0;         // the deck. Touching it ends a run.
export const PLAYER_Z = 0;         // the player never leaves this plane
/**
 * How far the feet hang below the point the physics actually tracks.
 *
 * The rope holds a single point mass, and that point is the torso centre --
 * where a body hanging from its own arms really does pivot. The feet are
 * `legY + leg.h` below it (see BODY), so this is what the street test has to
 * use. Without it the player sinks to mid-thigh in the tarmac before dying.
 */
export const FEET_DROP = 1.7;
/**
 * A run starts and respawns *in mid-air*, not on a roof.
 *
 * The first build spawned on the tallest local rooftop, which turned out to be
 * unplayable in the most obvious way in hindsight: from the top of the tallest
 * building, every other building is below you, and a web only attaches to
 * something above. There was nothing to swing from. Swinging altitude wants to
 * sit well under the skyline, so the city is something you fall through rather
 * than stand on.
 */
export const SPAWN_Y = 46;
export const SPAWN_AHEAD = 40;     // how far ahead of the fall a respawn lands


// ---------------------------------------------------------------- physics

export const GRAVITY = -34;        // units/s^2 -- tuned, not physical
export const AIR_DRAG = 0.12;      // per second, applied only when free
export const MAX_ROPE = 34;        // furthest a web will reach: ~1.7 blocks
export const MIN_ROPE = 5;         // reel-in floor: closer and you hit the wall
export const REEL_RATE = 11;       // units/s of rope pulled in while held
/**
 * The speed cap. A full drop on MAX_ROPE alone reaches sqrt(2 * -GRAVITY *
 * MAX_ROPE) =~ 48 units/s; this leaves genuine headroom above that for
 * skilled reeling to pay off, without the pumping mechanic being able to
 * compound into something the camera and the buildings sweeping past can no
 * longer be read at. It was 95 -- reachable by pumping the reel-in on a big
 * arc -- and it turned "swinging fast" into "the screen is a blur and you
 * cannot see the next building," which is the opposite of what the speed
 * feedback (streaks, motion blur, the trail) exists to sell.
 */
export const MAX_SPEED = 55;
/**
 * A separate cap on rotation rate, not just linear speed.
 *
 * MAX_SPEED alone does not stop a tight loop from spinning wildly: tangential
 * speed is `len * omega`, so the same capped speed means a much higher
 * angular rate at a short rope than a long one. The first value here, 3.6,
 * overcorrected badly: at a perfectly ordinary loop radius of 10 units,
 * MAX_SPEED alone already implies omega ~= 5.5 rad/s, above that cap -- so it
 * was clamping down on completely normal loops, not just extreme ones, which
 * is what read as the loop suddenly losing its fluidity rather than as a
 * safety limit that stays out of the way.
 *
 * 7 rad/s only starts doing anything once the rope is reeled in past about 8
 * units, at MAX_SPEED -- comfortably below any loop radius that should feel
 * normal, and it still meaningfully tames the genuinely extreme case (a
 * fully reeled-in MIN_ROPE loop, which implies ~11 rad/s uncapped).
 */
export const MAX_OMEGA = 7;
export const LAUNCH_VX = 14;       // the shove a run starts with

export const FIXED_DT = 1 / 120;   // physics step
export const MAX_STEPS = 5;        // per frame, so a restored tab cannot spiral

// ---------------------------------------------------------------- the city

/**
 * The x spacing of the anchor lanes' blocks -- and therefore of the anchors a
 * web can catch. It is the one city dimension that is really a gameplay
 * dimension. Every other size is per-lane (see LANES), because a building 360
 * units away and one 18 units away should not be the same size or built to the
 * same reach.
 */
export const BLOCK_PITCH = 20;

/**
 * The depth lanes, back to front.
 *
 * `z` is the only thing that produces parallax here. There is no per-layer
 * scroll factor to hand-tune, because a perspective camera does that
 * arithmetic itself -- objects near the player sweep past, the skyline barely
 * moves, and none of it is coded. That is most of the reason this project is in
 * three.js at all.
 *
 * Nine lanes reaching out to z = -360, so the city recedes instead of stopping.
 * The far lanes use a coarser `pitch` and a wider `reach`: at that distance a
 * building is a few pixels wide, so they need to cover far more x to fill the
 * frame while costing fewer instances to do it.
 *
 * `tier` selects the level of detail: 0 gets full massing, roof props and a
 * normal-mapped facade; 1 drops most props; 2 and 3 are simple slabs that exist
 * to be a hazy silhouette.
 *
 * `skew` biases the height roll: 1 is uniform across the lane's range, and
 * higher values push most buildings toward `hMin` and make the tall ones rare.
 * It is what lets the near kerb hold the occasional enormous foreground slab
 * without becoming a wall -- see that lane's note.
 */
export const LANES = [
  /**
   * The back of the city.
   *
   * The far lanes exist to be a silhouette, and a silhouette with gaps in it
   * reads as a small town. `fill` here is close to 1 and the pitch is tighter
   * than the near lanes' -- at this distance a building is a few pixels wide,
   * so density costs almost nothing per instance and is the only thing that
   * separates "a city going back" from "some towers with sky between them".
   * The furthest lane sits past the end of every cross avenue, so an avenue
   * runs into buildings rather than into fog with nothing behind it.
   */
  { z: -500, tier: 3, hMin: 44, hMax: 168, fill: 0.96, anchor: false, tint: 0.06,
    skew: 1.30, pitch: 58, back: 560, ahead: 800, wMin: 34, wMax: 56, depth: 38 },
  { z: -360, tier: 3, hMin: 40, hMax: 155, fill: 0.97, anchor: false, tint: 0.10,
    skew: 1.35, pitch: 44, back: 420, ahead: 620, wMin: 30, wMax: 48, depth: 34 },
  { z: -250, tier: 3, hMin: 38, hMax: 138, fill: 0.96, anchor: false, tint: 0.17,
    skew: 1.35, pitch: 38, back: 320, ahead: 500, wMin: 26, wMax: 40, depth: 30 },
  { z: -172, tier: 2, hMin: 36, hMax: 122, fill: 0.94, anchor: false, tint: 0.28,
    skew: 1.35, pitch: 32, back: 250, ahead: 400, wMin: 22, wMax: 33, depth: 26 },
  { z: -118, tier: 2, hMin: 34, hMax: 108, fill: 0.92, anchor: false, tint: 0.40,
    skew: 1.35, pitch: 27, back: 200, ahead: 330, wMin: 18, wMax: 27, depth: 22 },
  { z: -80,  tier: 1, hMin: 32, hMax: 104, fill: 0.84, anchor: false, tint: 0.55,
    skew: 1.35, pitch: 24, back: 170, ahead: 280, wMin: 15, wMax: 22, depth: 18 },
  { z: -56,  tier: 1, hMin: 30, hMax: 100, fill: 0.82, anchor: false, tint: 0.70,
    skew: 1.30, pitch: 22, back: 150, ahead: 250, wMin: 13, wMax: 21, depth: 16 },
  /**
   * The two anchor lanes: the near city, and the only thing a web can catch.
   *
   * Their numbers are set by measurement, not by eye. `npm run anchors` walks
   * twelve thousand units of the real city and reports how often there is
   * something reachable at each altitude, and it found the flaw these values
   * fix: at swinging height the city was fine, but anchors thinned out badly as
   * the player rose -- 65% coverage at y=85 with dead stretches of 216 units.
   *
   * That is the worst possible shape for a difficulty curve, because a good
   * swing *gains height*. Playing well took you into the part of the city with
   * nothing to grab, and the run ended for reasons that had nothing to do with
   * the swing you had just made.
   *
   * So: a higher floor, a higher ceiling, a `skew` below 1 that biases the roll
   * upward rather than down, and more of them. Variety at the low end comes
   * from the scenery lanes and the near kerb, which are free to be short.
   */
  { z: -38,  tier: 0, hMin: 46, hMax: 132, fill: 0.84, anchor: true,  tint: 0.86,
    skew: 0.95, pitch: BLOCK_PITCH, back: 120, ahead: 220, wMin: 13, wMax: 19, depth: 15 },
  { z: -18,  tier: 0, hMin: 44, hMax: 124, fill: 0.74, anchor: true,  tint: 1.00,
    skew: 0.95, pitch: BLOCK_PITCH, back: 120, ahead: 220, wMin: 13, wMax: 19, depth: 15 },
  /**
   * The near kerb, and the foreground slabs.
   *
   * This lane sits between the camera and the player, twenty-six units from the
   * lens, so a building here is enormous -- a fifty-unit tower covers the full
   * height of the frame. For a long time that meant capping the whole lane at
   * 26 units, which kept it safe and made it scenery: a low band along the
   * bottom of the shot and nothing more.
   *
   * The cap was the wrong tool. What makes a tall foreground building a problem
   * is not its height but how *often* it is there. At fourteen units wide and
   * this close it covers under a third of the frame's width, so it reads as a
   * slab sweeping past rather than a wall -- provided it is rare. `skew: 5.5`
   * is what makes it rare: most rolls land near hMin and stay shopfront-sized,
   * while about one building in ten rises far enough to sweep the camera.
   *
   * Everything else about the lane is unchanged. It still frames the bottom of
   * the shot, still gives the strongest parallax in the scene because it is the
   * closest thing to the camera, and still carries the fire escapes and water
   * tanks you see at eye level.
   */
  { z: +14,  tier: 0, hMin: 7,  hMax: 72,  fill: 0.5,  anchor: false, tint: 1.05,
    skew: 5.5, pitch: 18, back: 110, ahead: 190, wMin: 11, wMax: 19, depth: 13 },
];

/**
 * Cross streets: the thing that makes it read as Manhattan rather than a wall.
 *
 * Every few blocks, one x-band is left empty in *every* lane at once, so the
 * eye looks straight down a side street and sees rows of buildings receding
 * into the haze. A grid city seen side-on is mostly a facade; it is the gaps
 * that tell you there is a city behind it.
 *
 * The blocks either side of a gap are force-occupied in the anchor lanes, which
 * is a gameplay guarantee rather than a decorative one: without it a cross
 * street could line up with random empty blocks and leave a span longer than
 * MAX_ROPE with nothing to grab, ending a run through no fault of the player.
 */
export const CROSS_SPACING = 100;   // world units between cross streets
export const CROSS_WIDTH = 17;      // the clear span of one

// ---------------------------------------------------------------- facades

/**
 * Architectural types, and how common each is.
 *
 * Weighted to feel like Manhattan rather than a random skyline: the bulk is
 * pre-war apartment stock and mid-rise commercial, with glass towers and Art
 * Deco setbacks as the punctuation. `buildings.js` biases the roll by height as
 * well -- a 20-storey brownstone and a 3-storey glass tower are both wrong.
 */
export const ARCH = Object.freeze({
  APARTMENT: 'apartment',
  COMMERCIAL: 'commercial',
  DECO: 'deco',
  GLASS: 'glass',
});
export const ARCH_ORDER = Object.freeze([
  ARCH.APARTMENT, ARCH.COMMERCIAL, ARCH.DECO, ARCH.GLASS,
]);
export const ARCH_WEIGHT = Object.freeze({
  apartment: 0.36, commercial: 0.28, deco: 0.20, glass: 0.16,
});
export const TALL_FOR_ARCH = 62;    // above this, towers dominate the roll
export const SHORT_FOR_ARCH = 30;   // below this, only low-rise types appear

/**
 * Facade grids, per type, in world units.
 *
 * Real proportions, because they are what stops it reading as a texture: a
 * floor is a bit over three metres, an apartment window is narrower and more
 * closely spaced than an office one, and a glass tower's module is wider than
 * either. These set the per-instance UV repeat, so a 78-unit building really
 * does get 24 floors of windows rather than the same grid stretched.
 */
export const FACADE = Object.freeze({
  apartment: { cellW: 2.4, floorH: 3.0, cols: 6, rows: 6, lit: 0.34, warm: 0.88 },
  commercial: { cellW: 3.6, floorH: 3.9, cols: 5, rows: 5, lit: 0.46, warm: 0.42 },
  deco: { cellW: 2.7, floorH: 3.4, cols: 6, rows: 6, lit: 0.38, warm: 0.72 },
  glass: { cellW: 3.3, floorH: 3.7, cols: 5, rows: 6, lit: 0.40, warm: 0.30 },
});
export const FACADE_VARIANTS = 4;   // texture sets per type
export const FACADE_TEX_PX = 512;
export const DARK_FLOOR_CHANCE = 0.22;  // whole floors with the lights out
export const WINDOW_INSET = 0.16;   // fraction of a cell the reveal occupies

// ---------------------------------------------------------------- massing

/**
 * How buildings are shaped, per type. All fractions of the building's own size,
 * so a 40-unit tower and a 130-unit one set back in the same proportions.
 */
export const MASSING = Object.freeze({
  setbackChance: { apartment: 0.35, commercial: 0.25, deco: 0.95, glass: 0.4 },
  setbackMax: { apartment: 2, commercial: 2, deco: 4, glass: 2 },
  setbackInset: 0.13,        // how much narrower each step is
  setbackFirst: 0.45,        // fraction of height the first setback sits at
  setbackRise: 0.62,         // each further step, fraction of what is left
  baseChance: 0.55,          // a wider podium at street level
  baseHeight: 0.09,
  baseFlare: 0.06,
  crownChance: { apartment: 0.1, commercial: 0.15, deco: 0.8, glass: 0.55 },
});

// ---------------------------------------------------------------- rooftops

/**
 * The things on top. Water towers and bulkheads are the single most New York
 * detail available, and they are three boxes and a cone each.
 */
export const PROPS = Object.freeze({
  tank: { r: 1.5, h: 3.2, legs: 1.6, chance: 0.55 },      // water tower
  hvac: { w: 2.6, h: 1.5, d: 2.2, chance: 0.7, max: 3 },
  mast: { r: 0.13, h: 9, chance: 0.35 },                  // antenna
  dish: { r: 1.0, chance: 0.25 },
  bulkhead: { w: 4.0, h: 2.6, d: 3.4, chance: 0.6 },      // stair housing
  sign: { w: 7, h: 2.4, chance: 0.14 },                   // lit rooftop sign
  escape: { chance: 0.6, rungs: 13, w: 2.4, depth: 0.9 }, // fire escape, per storey
  pigeon: { chance: 0.4, max: 4 },                        // a small flock, per roof
});
export const PROP_TIER_MAX = 1;     // lanes beyond this tier get no props
export const LEDGE_DEPTH = 0.32;    // cornice/ledge proud of the facade
export const LEDGE_H = 0.7;
/**
 * Cornice and parapet stone.
 *
 * Kept deliberately dark and matte. The first version used a light grey with
 * the same environment intensity as the glass, and every roofline in the city
 * lit up as a bright periwinkle bar -- the eye went straight to the trim
 * instead of to the buildings. Trim is a shadow line, not a highlight.
 */
export const TRIM_COLOR = 0x3b3f4e;
export const TRIM_ENV = 0.25;

// ---------------------------------------------------------------- shopfronts

/**
 * Ground-floor storefronts: a lit glass front, a doorway, an awning with a
 * neon tube along its edge, and -- doing most of the work -- a real neon sign
 * naming the place, laid over the base of a building the same way a rooftop
 * tank sits on top of one. An instanced prop `city.js` places, not a change
 * to the facade texture underneath it.
 *
 * The sign is the part a coloured box cannot fake. It is a separate mesh
 * from the glass/awning shell, with its own material, because it needs a
 * real canvas texture -- a word, a glow, a couple of tube lines -- and the
 * shell's per-instance vertex colour has no way to draw a letter. Same split
 * `street.js` already uses for `gantry`/`gantrySign`.
 *
 * Only the tier-0/1 lanes get them (`SHOP_TIER_MAX`): the far lanes are a few
 * pixels wide, and a storefront that cannot be read is a wasted instance.
 * `SHOP_CHANCE` is short of 1 so a plain lobby or a blank pier of wall between
 * shops still turns up -- a street of nothing but storefronts reads as a mall,
 * not as Manhattan.
 */
export const SHOP_TYPES = Object.freeze(['cafe', 'bar', 'restaurant', 'store']);
export const SHOP_LABELS = Object.freeze({
  cafe: 'CAFE', bar: 'BAR', restaurant: 'DINER', store: 'STORE',
});
export const SHOP_CHANCE = 0.65;
export const SHOP_TIER_MAX = 1;
export const SHOP_WIDTH_FRAC = 0.86;  // leaves a plain pier of wall either side
export const SHOP_CAP = 90;           // instances per type

export const SHOPFRONT = Object.freeze({
  w: 1,                // unit width -- city.js scales this to the real frontage
  glassH: 3.0,
  glassD: 0.18,
  doorW: 0.16,          // fraction of the unit width
  doorMargin: 0.05,
  awningT: 0.14,
  awningD: 1.05,
  awningTilt: 0.35,     // radians, drooping away from the wall
  neonH: 0.06,          // the tube along the awning's top edge
  panelGap: 0.1,        // clearance between the awning and the sign above it
});
export const SHOP_DOOR_COLOR = 0x14100c;
/**
 * The shell's own wash -- glass, awning, tube trim. Measured down from an
 * initial 1.6: the vertex colours here are already pale and bright (glass in
 * particular), so multiplying by anything past about 0.5 pushes every
 * channel over 1 before tone mapping, and the whole panel clips to a flat
 * white card -- exactly the "lighting is too intense" failure, and it also
 * bled into the sign above it, since a blown-out surface blooms far enough
 * to wash out whatever is next to it on screen.
 */
export const SHOP_EMISSIVE = 0.45;
export const SHOP_COLORS = Object.freeze({
  cafe: { glass: 0xffc98a, awning: 0x8a3b2a, sign: 0xffe6b0 },
  bar: { glass: 0xff5a7a, awning: 0x2a1830, sign: 0xff3d6e },
  restaurant: { glass: 0xffb15a, awning: 0x1e4a34, sign: 0xffd27a },
  store: { glass: 0x9fd8ff, awning: 0x1a3a5c, sign: 0xbfeaff },
});

/**
 * The sign panel: bigger than the old plain box on purpose, sized to actually
 * carry a word rather than just a colour. `w` is a fraction of the same
 * scaled width the shell uses, so the two stay the same width as each other
 * regardless of how wide the building is.
 */
export const SHOP_SIGN = Object.freeze({ w: 0.94, h: 0.7, d: 0.1 });
export const SHOP_SIGN_TEX_W = 512;
export const SHOP_SIGN_TEX_H = 176;
/**
 * The sign's own glow. Also measured down, for the same reason as
 * SHOP_EMISSIVE -- the texture's own bright pixels (a near-white letter core,
 * a saturated colour glow) were already close to 1, and 3.2 turned every one
 * of them into flat white long before the letter's outline stopped being
 * legible. This is tuned to sit just past the bloom threshold: enough to
 * read as lit, not enough to erase its own shape.
 */
export const SHOP_SIGN_GLOW = 1.05;

// ---------------------------------------------------------------- pigeons

/**
 * Perched pigeons are real geometry: a body, a head and a beak, all round or
 * conical shapes that read fine from any angle, which is why they do not
 * need the billboard trick the flying ones below rely on. `rooftop()` in
 * buildings.js clusters a few together at a roof's edge, not its middle --
 * nobody perches in the centre of a flat roof.
 */
export const PIGEON = Object.freeze({
  bodyR: 0.16, headR: 0.09, headOffset: 0.16, headY: 0.05, beakR: 0.025, beakLen: 0.09,
});
export const PIGEON_BODY_COLOR = 0x7d8188;
export const PIGEON_HEAD_COLOR = 0x5c6169;
export const PIGEON_BEAK_COLOR = 0x2a2420;

/**
 * Flying pigeons are flat, camera-facing billboards, not 3D geometry -- a
 * bird this small is its silhouette, and a 3D wing built as a box either
 * disappears edge-on in a pure side view or needs real aerodynamic rotation
 * to avoid it, for a shape that is at most a few screen pixels across. Three
 * canvas silhouettes, wings up/level/down, swapped per instance by the same
 * phase trick the pedestrian's stride uses, is a flap.
 *
 * They live on a world lattice with their own drift speed, never one
 * recentred on the camera. Clouds did exactly that first and the result was
 * a cloud that moved at precisely the player's speed and never once passed
 * overhead -- recentring on the camera cancels the camera's own motion out
 * of the object's position. See CLOUD_SPACING's note for the full story.
 */
export const PIGEON_CAP = 24;
export const PIGEON_SPACING = 60;
export const PIGEON_REACH = 140;
export const PIGEON_JITTER = 0.7;
export const PIGEON_Y = Object.freeze({ min: 20, max: 95 });
export const PIGEON_Z = Object.freeze({ min: -34, max: 6 });
export const PIGEON_SPEED = Object.freeze({ min: 9, max: 16 });
export const PIGEON_BOB = 1.4;         // vertical undulation -- flight isn't a straight line
export const PIGEON_BOB_RATE = 1.8;
export const PIGEON_FLAP_RATE = 7;     // wingbeats/s, roughly
export const PIGEON_SIZE = 1.1;        // billboard size, world units
export const PIGEON_TEX_PX = 48;
export const PIGEON_SPRITE_COLOR = 0x2a2c30;

// ---------------------------------------------------------------- enemies

/**
 * Drones: hostile obstacles flying in against the player's own direction of
 * travel -- world -x, while a run is +x -- so meeting one is a closing
 * speed, not a slow drift you can always out-pace. Touch one and the run
 * ends, the same as hitting the street.
 *
 * They live on the same world-lattice-with-independent-drift shape every
 * flying thing in this project uses (see CLOUD_SPACING's note for why that
 * has to be world x and elapsed time, never the camera). `ENEMY_GRACE_MS` is
 * the one thing that shape doesn't give you for free: a slot's position is
 * continuous from the moment the game loads, so without a short grace window
 * after a spawn or respawn, a drone that happened to already be near x=0
 * could kill the player before they had ever seen it coming.
 */
export const ENEMY_CAP = 10;
export const ENEMY_SPACING = 150;
export const ENEMY_REACH = 170;
export const ENEMY_JITTER = 0.6;
export const ENEMY_FILL = 0.5;         // fraction of slots that actually hold a drone
export const ENEMY_Y = Object.freeze({ min: 18, max: 88 });
export const ENEMY_SPEED = Object.freeze({ min: 14, max: 23 });
export const ENEMY_BOB = 0.6;
export const ENEMY_BOB_RATE = 2.4;
export const ENEMY_HIT_RADIUS = 2.4;
export const ENEMY_GRACE_MS = 1600;    // brief invulnerability after a spawn/respawn

/**
 * Difficulty by distance, not by run: a slot's tier comes from its own world
 * x (`i * ENEMY_SPACING`), the same "identity from position" rule everything
 * else in this project follows, rather than from how far the current run has
 * gone. That means the city itself gets harder further out, permanently --
 * dying and respawning nearby does not locally reset it, which is the point:
 * a fixed skyline that only ever got easier the tenth time you passed it
 * would be a strange kind of endless.
 *
 * Two things scale with tier: more drones (`ENEMY_FILL`), and less
 * predictable ones -- an extra sine layered onto the smooth bob, at its own
 * per-drone frequency and phase, whose amplitude grows with tier. One smooth
 * wave reads as a glide; two at different, unrelated frequencies reads as a
 * flight path you cannot extrapolate from watching it for a second.
 */
export const ENEMY_DIFFICULTY_STEP = 500;    // world units of x per difficulty tier
export const ENEMY_DIFFICULTY_MAX = 6;       // tiers stop compounding past here
export const ENEMY_FILL_MAX = 0.85;
export const ENEMY_FILL_PER_TIER = 0.06;
export const ENEMY_SPEED_PER_TIER = 0.1;     // fractional closing-speed increase per tier
export const ENEMY_ERRATIC_PER_TIER = 0.45;  // extra wobble amplitude per tier
export const ENEMY_ERRATIC_RATE = Object.freeze({ min: 3.2, max: 5.5 });

// Sized to actually read at swinging distance, not to look right close up --
// the first pass measured against a screenshot as too small and too easy to
// lose against the city, the same complaint the pickups had before they got
// a halo. Doubled in scale, plus a halo of its own here.
export const DRONE = Object.freeze({
  bodyW: 1.05, bodyH: 0.42, bodyD: 1.05,
  armLen: 1.0, armR: 0.075,
  rotorR: 0.5, rotorH: 0.04,
  lightR: 0.17, lightDrop: 0.32,
});
export const DRONE_BODY_COLOR = 0x3a3f48;
export const DRONE_ROTOR_COLOR = 0x16181c;
export const DRONE_LIGHT_COLOR = 0xff3b30;
export const DRONE_LIGHT_RATE = 6.5;   // pulses/s
export const DRONE_LIGHT_DIM = 0.15;   // floor brightness between pulses

/**
 * A warning halo around the light -- a billboarded additive glow, the same
 * technique the sun/moon/pickups use, because a solid shape a couple of
 * units across is exactly the size that gets lost against a hundred metres
 * of open air, and a threat that cannot be seen coming is not a fair one.
 */
export const DRONE_HALO_TEX_PX = 64;
export const DRONE_HALO_SIZE = 2.6;
export const DRONE_HALO_OPACITY = 0.55;
export const DRONE_HALO_PULSE = Object.freeze({ rate: 6.5, amount: 0.25 });

// ---------------------------------------------------------------- street

export const STREET_HALF_W = 15;    // kerb to kerb, either side of PLAYER_Z
export const STREET_LEN = 900;      // road slab length, recentred on the camera
export const KERB_H = 0.45;

/**
 * The pavement, and what stands on it.
 *
 * The street is only in frame when the player is low -- a dive, a bad swing,
 * the last second of a run -- and looking down a cross avenue, which is the
 * angle you get constantly. Both are close range, so this is where flat ground
 * shows up as flat ground. Everything below is placed on a world grid and
 * hashed from its position, so a hydrant stays outside the same doorway every
 * time you pass it.
 */
export const SIDEWALK_W = 6.5;      // out from the kerb
export const SIDEWALK_H = 0.42;     // above the road
export const PAVING_PX = 256;

export const CROSSWALK = Object.freeze({
  stripes: 7, stripeW: 0.9, gap: 0.75, depth: 5.5, inset: 11,
});
export const MANHOLE = Object.freeze({ r: 0.62, h: 0.06, every: 43 });
export const HYDRANT = Object.freeze({ r: 0.16, h: 0.92, every: 57, color: 0xb8352c });
export const SIGNAL = Object.freeze({
  post: 5.2, arm: 2.6, r: 0.09,
  head: { w: 0.36, h: 0.95, d: 0.32 },
  lens: 0.13,
});
export const PARKED = Object.freeze({ every: 12, chance: 0.5, lateral: 2.2 });
export const STREET_FURNITURE_CAP = 220;

/**
 * Steam.
 *
 * The single most New York thing that can happen at street level, and it is
 * about thirty lines: a plume of soft quads rising from a vent, spreading and
 * fading. Vents sit on a world grid so a given manhole always smokes.
 */
export const STEAM = Object.freeze({
  vents: 5,           // simultaneous plumes kept alive around the camera
  perVent: 26,        // quads in each
  every: 60,          // world units between vents along a corridor
  rise: 9,            // how high a puff climbs before it is spent
  drift: 2.2,         // sideways wander over its life
  spread: 2.4,        // how wide the plume opens out
  life: 3.6,          // seconds
  size: Object.freeze({ min: 1.1, max: 4.6 }),
  // Measured against night asphalt rather than guessed: 0.45 reads as a
  // spotlight on the road, 0.13 barely separates from it. 0.22 is a plume.
  opacity: 0.22,
  tex: 96,
});
/**
 * Wet asphalt, but only slightly.
 *
 * A night street wants some sheen -- a matte road reads as felt. But at the
 * grazing angles this camera sees it from, a metalness of 0.35 turns the
 * whole surface into a mirror of the sky and the road comes out as a flat
 * bright blue slab. Low enough to catch the lamps, not enough to catch the sky.
 */
export const ROAD_METALNESS = 0.2;
export const ROAD_ROUGHNESS = 0.5;
export const ROAD_ENV = 0.4;
export const LAMP = Object.freeze({ h: 7.5, r: 0.13, arm: 1.8, every: 26, glow: 0.9 });
// ---------------------------------------------------------------- avenues

/**
 * The cross avenues.
 *
 * The gaps already existed -- `CROSS_SPACING` leaves an x-band clear in every
 * lane at once so the eye can look through the facade. What was missing was
 * anything *in* them: a bare gap reads as a hole in the scenery, not as a
 * street. Laying a road surface down each one and running traffic up it turns
 * the same gap into four hundred units of receding perspective, which is the
 * cheapest depth cue in the whole scene and the one that makes the city look
 * inhabited rather than modelled.
 *
 * A cross avenue starts just behind the camera plane and runs back past the
 * furthest lane, so it never visibly ends -- it fades out in the fog instead.
 */
export const CROSS_LEN = 470;
export const CROSS_NEAR_Z = 30;      // near end, behind the camera
export const CROSS_VISIBLE = 5;      // avenues kept around the camera
export const CROSS_LAMP_EVERY = 34;

/**
 * Streets running the other way, part-way down the avenues.
 *
 * The city had one road along x and a row of avenues going back, which is a
 * comb rather than a grid: look down any avenue and it ran four hundred units
 * without ever meeting anything. Manhattan's whole character is that it does
 * not -- a cross street arrives every couple of hundred feet, and the
 * intersections are what make it read as *blocks* instead of as corridors.
 *
 * The z values are not free. Every one sits in a gap the building lanes already
 * leave between them (see LANES), which is why this costs no change at all to
 * the city: nothing is standing where these run, by construction.
 *
 * They get wider with distance for the same reason every lane behind the player
 * does -- the whole city is built at increasing scale with depth, because a
 * constant width at four hundred units is a sub-pixel line. A back street the
 * same width as the near one would simply not be there.
 */
export const BACK_STREETS = Object.freeze([
  Object.freeze({ z: -98, w: 9, lamps: true }),
  // Wider than its neighbours because the expressway's ramps come down onto
  // it -- see ELEVATED.ramp, which offsets them clear of the deck above.
  Object.freeze({ z: -144, w: 18, lamps: true }),
  Object.freeze({ z: -210, w: 16, lamps: true }),
  Object.freeze({ z: -304, w: 21, lamps: false }),
  Object.freeze({ z: -429, w: 27, lamps: false }),
]);
export const BACK_STREET_LEN = 900;   // slab length, recentred on the camera
export const BACK_LAMP_EVERY = 30;
export const BACK_LAMP_REACH = 130;   // either side of the camera
export const BACK_CARS = 12;          // per back street
export const BACK_ROAD_COLOR = 0x171921;
/**
 * A raised kerb either side of every back street, as a fraction of its width.
 *
 * Measured rather than chosen. Against the ground's concrete (luminance 46 of
 * 255) the road surface sits 21 points *below* and reads as a shadow, not a
 * street -- which is fine at night, when the lamps do the work, and does
 * nothing at all at noon. The kerb sits 16 points above it, so a back street is
 * a dark band between two light lines from either end of the day.
 */
export const BACK_KERB = Object.freeze({ frac: 0.3, h: 0.3, color: 0x3a3e48 });

/**
 * Traffic.
 *
 * Cars are small boxes with two emissive pairs, and the pairs are what actually
 * do the work: at three hundred units a vehicle is nine pixels of dark metal
 * that reads as nothing, while its lights are two pixels that bloom into a
 * legible point. A line of white points coming toward you and red points going
 * away is what a night avenue looks like from above.
 *
 * Orientation handles the colours for free -- a car driving away has its rear
 * toward the camera, so it shows red without anything deciding that it should.
 */
export const VEHICLE = Object.freeze({
  sign: { w: 0.66, h: 0.26, d: 0.34 },   // the roof light on a cab
  lampW: 0.46, lampH: 0.22, lampD: 0.18,   // oversized: at 300 units these
                                           // are the only part still legible
  lane: 3.2,                              // offset from an avenue's centre line
  minSpeed: 15,
  maxSpeed: 29,
});

/**
 * The four body shapes, and nothing else.
 *
 * A shape is a *geometry* -- one instanced draw call each -- and it is
 * deliberately not the same list as VEHICLE_TYPES below. A police car is a
 * saloon with a different paint job and a light bar, not a different mesh, so
 * it shares the `car` shape; an ambulance shares `van`. Seven kinds of vehicle
 * therefore cost four body meshes rather than seven, which is the whole reason
 * the two tables are separate.
 *
 * `cabin.z` is a fraction of the body's own length, so the cab of a van sits
 * proportionally as far forward as the cab of a car. `roof` is where anything
 * mounted on top starts -- a taxi sign, a light bar -- measured from the road.
 */
export const VEHICLE_SHAPES = Object.freeze({
  car: Object.freeze({
    body: { w: 1.9, h: 0.8, d: 4.3 },
    cabin: { w: 1.68, h: 0.6, d: 2.0, z: -0.06 },
    roof: 1.4,
  }),
  van: Object.freeze({
    body: { w: 2.05, h: 1.55, d: 5.6 },
    cabin: { w: 1.9, h: 0.5, d: 1.7, z: -0.3 },
    roof: 2.05,
  }),
  /**
   * A bus is one long box and a roof band -- no cab step, because at the range
   * a bus is legible from, its silhouette is length and height and nothing
   * else. The band exists to break up a shape that would otherwise read as a
   * shipping container.
   */
  bus: Object.freeze({
    body: { w: 2.35, h: 2.6, d: 10.8 },
    cabin: { w: 2.15, h: 0.22, d: 9.4, z: 0.02 },
    roof: 2.82,
  }),
  fire: Object.freeze({
    body: { w: 2.45, h: 2.15, d: 9.2 },
    cabin: { w: 2.2, h: 0.6, d: 2.8, z: -0.31 },
    roof: 2.75,
  }),
});

/**
 * What is actually driving around, and how common each kind is.
 *
 * Weighted to read as Midtown rather than as a vehicle catalogue: yellow is
 * still the colour the eye associates with the traffic (see TAXI_COLOR), the
 * bulk of the rest is ordinary cars and delivery vans, and the loud things are
 * rare enough that seeing one is an event. An emergency vehicle every other
 * block would be noise, not life.
 *
 * `beacon` is the list of colours its light bar strobes through -- two for a
 * police car alternating, one for everything else pulsing. `speed` scales the
 * base pace, so a bus lumbers and a fire engine is the fastest thing on the
 * road, which is most of what tells them apart in motion.
 *
 * Weights sum to 1. `pickType` in street.js walks them cumulatively.
 */
export const VEHICLE_TYPES = Object.freeze([
  Object.freeze({ name: 'car', shape: 'car', weight: 0.36, speed: 1 }),
  Object.freeze({
    name: 'taxi', shape: 'car', weight: 0.34, speed: 1, roofSign: true,
    color: 0xf5b912,
  }),
  Object.freeze({ name: 'van', shape: 'van', weight: 0.14, speed: 0.92 }),
  Object.freeze({ name: 'bus', shape: 'bus', weight: 0.07, speed: 0.72, color: 0x2f6ea8 }),
  Object.freeze({
    name: 'police', shape: 'car', weight: 0.04, speed: 1.25, color: 0x1d2b46,
    beacon: Object.freeze([0xff2418, 0x2f6bff]),
  }),
  Object.freeze({
    name: 'ambulance', shape: 'van', weight: 0.03, speed: 1.2, color: 0xe9ecf2,
    beacon: Object.freeze([0xff2418]),
  }),
  Object.freeze({
    name: 'fire', shape: 'fire', weight: 0.02, speed: 1.3, color: 0xc0221c,
    beacon: Object.freeze([0xff2418]),
  }),
]);

/**
 * The light bar on an emergency vehicle.
 *
 * A `MeshBasicMaterial`, not an emissive standard one: an InstancedMesh has a
 * single `emissiveIntensity` for the whole batch, so a strobe cannot live
 * there -- but a basic material's colour *is* its brightness, and `setColorAt`
 * is per instance. The same reasoning as the steam plumes, arrived at for the
 * same reason.
 */
export const BEACON = Object.freeze({
  w: 1.0, h: 0.16, d: 0.32,
  rate: 7.4,          // strobes per second
  dim: 0.1,           // how far a single-colour bar drops between pulses
});
export const VAN_COLORS = Object.freeze([0xd9dbe0, 0x3a4656, 0x6a5540, 0x2f4a3c, 0x8a8f98]);
export const AVENUE_CARS = 34;       // on the main avenue, running along x
export const CROSS_CARS = 20;        // per cross avenue, running along z
/**
 * Roughly the real proportion in Midtown, and high enough that yellow is the
 * colour the eye associates with the traffic rather than an occasional accent.
 */
export const TAXI_RATIO = 0.42;
export const TAXI_COLOR = 0xf5b912;
export const CAR_COLORS = Object.freeze([0x20242e, 0x2c3442, 0x3b2c2c, 0x233240, 0x4a4a52]);
export const HEADLIGHT = 0xfff4d6;
export const TAILLIGHT = 0xff2e18;

/**
 * Pedestrians on the pavement.
 *
 * One geometry per pose, tinted per instance exactly the way the traffic
 * already is (see `carBody()`): a whole figure is a flat colour rather than a
 * modelled outfit, and at the range a sidewalk is seen from that is what a
 * coat reads as anyway.
 *
 * There is no skinned rig. Three fixed poses -- standing, and a stride leading
 * with each leg -- are built by one function taking a `phase` from -1 to 1
 * (see `pedestrian()` in props.js), and which pose an instance draws in is
 * decided fresh every frame from `sin(t * strideRate * speed + phase)`, phase
 * being per-pedestrian so a whole pavement does not step in unison. It is the
 * same trick the traffic lights use to look independent from a shared pool.
 */
export const PED = Object.freeze({
  legW: 0.16, legH: 0.86, legD: 0.2,
  armW: 0.13, armH: 0.62, armD: 0.16,
  torsoW: 0.44, torsoH: 0.62, torsoD: 0.26,
  headW: 0.24, headH: 0.26,
  stanceW: 0.22, shoulderW: 0.42, shoulderFrac: 0.94,
  swing: 0.62,       // radians a leg rotates at the hip, full stride
  armSwing: 0.8,     // arm rotation relative to the leg on the same side
  strideRate: 2.6,   // stride cycles per second at speed 1
});
export const PED_COLORS = Object.freeze([
  0x2c3b52, 0x6b2e2e, 0x3a4a2e, 0x5a4a2c, 0x2e2e38, 0x7a5a3a, 0x40506a, 0x6a3550,
]);
export const PED_SPEED = Object.freeze({ min: 0.9, max: 1.9 });   // walking pace, units/s
export const PED_STAND_CHANCE = 0.22;   // stays put rather than walking
export const PED_LANE = 2.1;            // spread either side of centre, within the pavement
export const AVENUE_PEDS = 44;          // main avenue, both sidewalks
export const CROSS_PEDS = 18;           // per cross avenue, both pavements

// ---------------------------------------------------------------- the sky

/**
 * The day/night cycle.
 *
 * One number -- `phase`, 0 to 1 -- drives every visual system in the project:
 * light directions and colours, the sky gradient, fog, whether the windows are
 * lit, whether the street lamps are on, exposure and bloom. Keeping it to a
 * single input is what makes the whole thing testable without a renderer, and
 * what stops the sky and the lighting from ever disagreeing about what time it
 * is.
 *
 * Phase 0 is midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. A run starts just
 * before the small hours, so the city opens on the look it was designed for and
 * dawn arrives about a minute and a half in.
 */
export const DAY_LENGTH = 240;      // seconds for a full cycle
export const DAY_START = 0.85;
export const TIME_SCALES = Object.freeze([1, 12, 60, 0]);   // cycled with T
export const TIME_SCALE_PAUSED = TIME_SCALES.indexOf(0);   // the frozen entry

/**
 * The two fixed-light choices on the start screen.
 *
 * `DAY_PHASE` is noon, the middle of the flattest, best-lit stretch of the
 * cycle. `NIGHT_PHASE` is not midnight -- it is the 'night' keyframe itself
 * (0.87), the same look `DAY_START` already opens a run on, chosen once for
 * the reason recorded there: it is the look the city was designed for.
 */
export const DAY_PHASE = 0.5;
export const NIGHT_PHASE = 0.87;
export const SUN_TILT = 0.45;       // z component, so the sun rakes the facades
export const ENV_DRIFT = 16;        // channel change that triggers an env rebuild

/**
 * Keyframes, in phase order. Everything between them is interpolated.
 *
 * These are the whole art direction of the cycle, and they are data rather than
 * code on purpose -- retiming dawn or cooling the noon light is an edit to a
 * table, not to a renderer.
 *
 * `window` and `lamp` are the ones that matter most for the feel: they take the
 * emissive windows and the street lighting to zero through the middle of the
 * day, which is what stops a sunlit city from looking like a night city with
 * the brightness turned up.
 */
export const DAY_KEYS = Object.freeze([
  { at: 0.00, name: 'midnight',
    skyTop: 0x05060e, skyMid: 0x0e1024, skyBottom: 0x1b1436,
    fog: 0x0e1226, density: 0.0028,
    key: 0xaec6ff, keyI: 3.2, rim: 0x5f7ae0, rimI: 1.7,
    hemiSky: 0x2a2350, hemiGround: 0x3a2a1c, hemiI: 2.8,
    window: 1, lamp: 1, exposure: 1.05, bloom: 0.34, env: 0.9, suit: 0.55 },

  { at: 0.20, name: 'first light',
    skyTop: 0x0a1024, skyMid: 0x1d2547, skyBottom: 0x3d3a60,
    fog: 0x242b46, density: 0.0030,
    key: 0x8fa8d8, keyI: 2.2, rim: 0x6d80c0, rimI: 1.3,
    hemiSky: 0x3a4270, hemiGround: 0x4a4038, hemiI: 3.0,
    window: 0.88, lamp: 1, exposure: 1.0, bloom: 0.30, env: 1.0, suit: 0.5 },

  { at: 0.28, name: 'sunrise',
    skyTop: 0x2a3a6b, skyMid: 0x8a6a75, skyBottom: 0xdc8c52,
    fog: 0x9c7a6c, density: 0.0033,
    key: 0xffb066, keyI: 4.6, rim: 0x88a0d8, rimI: 1.5,
    hemiSky: 0x7a86b0, hemiGround: 0x6a5240, hemiI: 3.5,
    window: 0.45, lamp: 0.55, exposure: 0.95, bloom: 0.22, env: 1.1, suit: 0.30 },

  { at: 0.50, name: 'noon',
    skyTop: 0x2f6bd0, skyMid: 0x7fb0e8, skyBottom: 0xcadef2,
    fog: 0xa8c4e0, density: 0.0026,
    key: 0xfff4e0, keyI: 5.6, rim: 0xbfd4ff, rimI: 1.2,
    hemiSky: 0x9fc4f0, hemiGround: 0x8a7a66, hemiI: 4.0,
    window: 0, lamp: 0, exposure: 0.84, bloom: 0.11, env: 1.45, suit: 0.10 },

  /**
   * Mid-afternoon, and the only keyframe here that exists purely to *stop*
   * something happening: without it the window and lamp levels start climbing
   * the moment noon is past, and the city had a fifth of its lights on at half
   * two in the afternoon. This holds daylight until the sun is genuinely low
   * and compresses the whole lights-on ramp into the last hour.
   */
  { at: 0.62, name: 'afternoon',
    skyTop: 0x2c62c4, skyMid: 0x7ea6dc, skyBottom: 0xc9d6e6,
    fog: 0xa6bed8, density: 0.0027,
    key: 0xffeccb, keyI: 5.2, rim: 0xb4c8f4, rimI: 1.25,
    hemiSky: 0x98b8e4, hemiGround: 0x88745e, hemiI: 3.9,
    window: 0.04, lamp: 0.05, exposure: 0.86, bloom: 0.13, env: 1.35, suit: 0.14 },

  { at: 0.71, name: 'sunset',
    skyTop: 0x243a72, skyMid: 0x9c6a6a, skyBottom: 0xea944c,
    fog: 0xac7c5e, density: 0.0034,
    key: 0xff9a4a, keyI: 4.3, rim: 0x8090d0, rimI: 1.5,
    hemiSky: 0x8a80a8, hemiGround: 0x6a4a34, hemiI: 3.4,
    window: 0.42, lamp: 0.65, exposure: 0.95, bloom: 0.24, env: 1.1, suit: 0.30 },

  { at: 0.79, name: 'dusk',
    skyTop: 0x101a3c, skyMid: 0x2a2a54, skyBottom: 0x5c3c5c,
    fog: 0x38304e, density: 0.0031,
    key: 0x9a8ad0, keyI: 1.8, rim: 0x6a7ad0, rimI: 1.6,
    hemiSky: 0x40386a, hemiGround: 0x4a3628, hemiI: 3.0,
    window: 0.92, lamp: 1, exposure: 1.0, bloom: 0.30, env: 1.0, suit: 0.45 },

  { at: 0.87, name: 'night',
    skyTop: 0x05060e, skyMid: 0x0e1024, skyBottom: 0x1b1436,
    fog: 0x0e1226, density: 0.0028,
    key: 0xaec6ff, keyI: 3.2, rim: 0x5f7ae0, rimI: 1.7,
    hemiSky: 0x2a2350, hemiGround: 0x3a2a1c, hemiI: 2.8,
    window: 1, lamp: 1, exposure: 1.05, bloom: 0.34, env: 0.9, suit: 0.55 },
]);

/** Fields interpolated as colours rather than as plain numbers. */
export const DAY_COLOR_KEYS = Object.freeze([
  'skyTop', 'skyMid', 'skyBottom', 'fog', 'key', 'rim', 'hemiSky', 'hemiGround',
]);
export const DAY_NUMBER_KEYS = Object.freeze([
  'density', 'keyI', 'rimI', 'hemiI', 'window', 'lamp', 'exposure', 'bloom',
  'env', 'suit',
]);

// ---------------------------------------------------------------- planting

/**
 * Street trees.
 *
 * Two shapes rather than one scaled shape: a full rounded canopy and a taller,
 * narrower young tree. Variety in a procedural scene almost always wants to be
 * variety *of kind* rather than of size -- a row of identical trees at
 * different scales still reads as a row of identical trees. Scale and tint
 * then vary on top of that.
 *
 * The canopies are detail-0 icosahedra: twenty faces, hard-edged, which suits
 * the faceted look of everything else here and costs about sixty triangles for
 * a whole tree.
 */
export const TREE = Object.freeze({
  trunkR: 0.17,
  trunkH: 2.7,
  trunkSegs: 5,
  canopyR: 1.55,
  scaleMin: 0.72,
  scaleMax: 1.5,
  everyStreet: 26,     // spacing along the main avenue's kerbs
  everyAvenue: 24,     // spacing along a cross avenue
  jitter: 0.3,         // fraction of the spacing a tree may shift
  /**
   * How far along the main avenue trees are planted, either side of the
   * camera. The road slab runs 900 units because it is two triangles; trees
   * are sixty each, so they only cover what can actually be seen.
   */
  streetReach: 150,
});
export const TRUNK_COLOR = 0x4a3a2c;
export const CANOPY_COLOR = 0x35513a;
export const TREE_CAP = 320;          // per tree shape

/**
 * The planted median that separates the two directions of traffic -- the Park
 * Avenue detail, and the reason an avenue reads as an avenue rather than as a
 * gap between buildings. A kerb with a bed on top, running the length of each
 * street, punctuated with trees.
 */
export const MEDIAN = Object.freeze({
  w: 1.9, kerbH: 0.34, bedH: 0.24, treeEvery: 26,
  // Below this a segment is a stub between two closely spaced junctions and
  // reads as debris in the roadway rather than as a median.
  minSegment: 6,
});
export const MEDIAN_CAP = 72;       // segments, across every avenue at once

/**
 * How far short of a roadway anything planted has to stop.
 *
 * The medians used to be one continuous box per avenue, which meant the main
 * avenue's planted strip ran straight through every cross-street junction --
 * grass across a road, which is the one thing a median never does. Trees had
 * the same fault and it was worse: a tree standing in the middle of an
 * intersection.
 *
 * The rule that fixes both is that a point lying on *two* roadways at once is
 * a junction, and nothing may stand there. A point on one road's median or kerb
 * is fine; the crossing is not. See `inJunction` in street.js.
 */
export const JUNCTION_CLEAR = 2.5;
export const MEDIAN_KERB_COLOR = 0x3a3d47;
export const MEDIAN_BED_COLOR = 0x2c4423;

// ---------------------------------------------------------------- the ground

/**
 * The floor between the roads.
 *
 * There was none. The avenue and the cross streets were slabs of asphalt
 * floating over nothing, which is invisible while you are up at swinging height
 * and painfully obvious the moment you look down a cross avenue: the street ran
 * back a few hundred units and then the world simply stopped being there.
 *
 * One plane fixes it, and it is worth texturing properly rather than filling
 * with grey, because what a city's floor actually looks like from above is a
 * patchwork -- lots, yards, roofs of low buildings, and green. `drop` keeps it
 * just under STREET_Y so the roads and pavements always win the depth test
 * against it rather than fighting for the same plane.
 */
export const GROUND = Object.freeze({
  w: 1600, d: 1200,
  drop: 0.08,          // below STREET_Y
  tex: 512,
  repeat: 22,          // tiles across the plane's width
  concrete: '#2b2e35',
  green: '#22371f',
  dirt: '#33302a',
});

/**
 * Planting on the ground, away from the kerbs.
 *
 * A lattice rather than a random spray, so a given lot always has the same
 * bushes in it. The rejection rules are the whole design: a cell is dropped if
 * it lands on a road, on a pavement, or inside any building lane's depth band.
 * What survives is the strips *between* the rows of buildings -- which is
 * exactly what you see when you look down a cross avenue, and nowhere else.
 */
export const SCATTER = Object.freeze({
  pitch: 16,           // world units between lattice cells
  jitter: 0.44,        // fraction of a cell a plant may shift
  reachX: 200,         // either side of the camera
  zNear: 24,
  zFar: -440,
  // Raised once the back streets went in: they run through the same gaps this
  // scatter fills and took about half the surviving cells with them, so the
  // strips that are left have to be planted harder to read the same.
  treeChance: 0.38,
  shrubChance: 0.52,   // ...of the cells that did not get a tree
  clear: 2.5,          // keep this far off any kerb
  laneMargin: 2.5,     // ...and this far outside a building lane's depth
  cap: 260,            // per shape
});

/** A low planted mass: three overlapping lobes and no trunk. */
export const SHRUB = Object.freeze({
  r: 0.78, lobes: 3, scaleMin: 0.6, scaleMax: 1.6,
});
export const SHRUB_COLOR = 0x2e4a2a;

// --------------------------------------------------------- the expressway

/**
 * Bridges across the cross avenues, and the signs that go with them.
 *
 * A cross avenue is four hundred units of empty perspective, and empty is the
 * problem: every one of them recedes identically. Something crossing it at
 * height breaks that up, gives the eye a scale reference part-way down, and is
 * the single strongest cue that the city continues sideways as well as back.
 *
 * They sit on the *cross* avenues only, never over the main one. Anything that
 * looks solid near the player and cannot be webbed is a lie about the world,
 * and the near lanes are the only place a player reads as reachable.
 *
 * `y` is the top of the deck. Well below the anchor lanes' floor, so a bridge
 * never sits in front of something you were aiming at.
 */
/**
 * The elevated expressway.
 *
 * This replaces a much worse idea. The first version dropped a thirty-unit
 * bridge across each cross avenue at a hashed depth, and it read as exactly
 * what it was: a slab hanging in the air. Both ends stopped dead in the gap
 * between two rows of buildings, supported by two piers and connected to
 * nothing. A bridge is only legible as a bridge if you can see where the road
 * on it comes from and where it goes.
 *
 * So it is no longer per-avenue furniture. It is a *road* -- one continuous
 * viaduct running along x for the same length as the ground streets, riding
 * with the camera exactly the way they do, so it has no visible ends at all.
 * It crosses every cross avenue rather than a random half of them, which is
 * also what "consistent" means here: an elevated highway does not appear over
 * one junction and not the next.
 *
 * `z` deliberately matches a BACK_STREETS entry. A real elevated expressway is
 * built over an existing street, its piers standing in that street's median --
 * and it means the ramps have something real to land on.
 */
export const ELEVATED = Object.freeze({
  z: -144,             // above the back street at the same z
  y: 16,               // top of the deck
  w: 11,
  deckH: 1.3,
  parapet: Object.freeze({ h: 1.15, t: 0.45 }),
  /**
   * Piers every `every` units along the length. This is most of what makes it
   * read as a viaduct rather than a plank: one support is a trestle, a rhythm
   * of them going away down the street is infrastructure.
   */
  pier: Object.freeze({ every: 24, w: 2.2, d: 3.0 }),
  reach: 210,          // piers and ramps kept this far either side of camera
  cars: 12,            // traffic on the deck
  /**
   * On and off ramps: a sloped deck peeling off beside the viaduct and running
   * down to the street underneath. Without these the road still had no visible
   * beginning -- it was continuous, but nothing ever joined or left it.
   *
   * `everyAvenues` rather than a distance in units, because a cross avenue is
   * the *only* sightline to this depth: everywhere else the view is blocked by
   * the rows of buildings in front. A ramp at an arbitrary x would be correct
   * and invisible. Landing them at junctions is both where a real one goes and
   * the only place one can be seen from.
   *
   * `run` is short for the rise, giving a grade no highway engineer would sign
   * off. That is deliberate and it is the same trade the back streets make on
   * width: the visible slice of this thing is seventeen units wide, and a ramp
   * shallow enough to be accurate would read as a flat line in that window.
   */
  ramp: Object.freeze({ everyAvenues: 1, run: 48, w: 4.6, deckH: 0.9 }),
  color: 0x33363f,
});

/**
 * A sign gantry: two posts, a beam, and a green panel.
 *
 * No legible text -- at the distance these are seen a letter is a fraction of a
 * pixel, and a texture that tries reads as noise. What makes a highway sign
 * recognisable at range is its shape and its colour: a wide green rectangle
 * with white bars and an arrow. That is all this draws.
 */
export const GANTRY = Object.freeze({
  chance: 0.55,
  post: { r: 0.24, h: 8.2 },
  beam: { h: 0.5, d: 0.5 },
  panel: { w: 10.5, h: 3.2, d: 0.24 },
  // Wide enough that the posts stand on the pavement rather than in the
  // roadway: the kerb is 8.5 units off an avenue's centre line.
  span: 21,
  tex: 256,
  green: '#1c4a2a',
  zNear: -40,
  zSpan: 300,
  glow: 0.35,          // retroreflective, so it lifts under the lamps
});

// ---------------------------------------------------------------- atmosphere

export const HAZE_LAYERS = Object.freeze([
  { z: -300, h: 150, opacity: 0.30 },
  { z: -200, h: 120, opacity: 0.24 },
  { z: -130, h: 100, opacity: 0.16 },
  { z: -70, h: 80, opacity: 0.09 },
]);
export const HAZE_W = 1400;

/**
 * A second, further-back skyline -- the thing the real city fades into rather
 * than fog with nothing behind it.
 *
 * It sits 60 units past the last real building lane (LANES' farthest is
 * z=-500) so it only ever shows above rooflines and through gaps, never
 * competing with actual geometry. It is one plane, not a lane of buildings:
 * a silhouette baked into a texture's alpha channel, tinted the same fog
 * colour the haze cards use so it recolours for free across the day/night
 * cycle, with no lit windows and no massing -- at this distance neither would
 * read as anything but noise.
 *
 * Its texture scrolls at a fraction of the camera's own motion (`parallax`),
 * which is the actual depth cue: a backdrop that races past at the same rate
 * as the near buildings reads as flat, however far back its z sits.
 */
export const SKYLINE_Z = -560;
export const SKYLINE_W = 1700;
export const SKYLINE_H = 210;         // clears the tallest far-lane roof (168) with room
export const SKYLINE_TEX_W = 1024;
export const SKYLINE_TEX_H = 128;
export const SKYLINE_REPEAT = 3;      // texture tiles across SKYLINE_W
export const SKYLINE_PARALLAX = 0.35; // fraction of camera speed the pattern scrolls at
export const SKYLINE_OPACITY = 0.55;
export const SKYLINE_GAP = Object.freeze({ min: 0.006, max: 0.024 }); // fraction of tex width, between blocks
export const SKYLINE_BLOCK = Object.freeze({ wMin: 0.03, wMax: 0.08, hMin: 0.35, hMax: 0.95 });
export const SKYLINE_SPIRE_CHANCE = 0.22;
export const SKYLINE_SPIRE = Object.freeze({ wFrac: 0.1, hMin: 0.08, hMax: 0.22 });

/**
 * Dust: motes in the air near the camera, and nothing more than that.
 *
 * The first version was far too assertive -- big bright white points spread
 * 45 units either side of the player plane, which put half of them *between*
 * the camera and the city. They read as stars stuck to the foreground, which
 * is exactly what they looked like. Smaller, dimmer, warmer, fewer, and pushed
 * back behind the player so they sit in the canyon rather than in front of it.
 */
export const DUST_COUNT = 150;
export const DUST_BOX = Object.freeze({ w: 130, h: 90, d: 46 });
export const DUST_Z = -22;          // centre of the drift box, behind the player
export const DUST_SIZE = 0.17;
export const DUST_DRIFT = 1.4;
export const DUST_COLOR = 0xc4bba8;
export const ENVMAP_PX = 256;

/**
 * Stars: a shell of points that follows the camera and never parallaxes.
 *
 * At this radius they sit beyond every building, so the skyline occludes them
 * properly -- which is the whole difference between a star field and specks on
 * the lens. `sizeAttenuation` is off so they stay a constant pixel size instead
 * of swelling as the shell moves with you.
 */
export const STAR_COUNT = 620;
export const STAR_RADIUS = 700;
export const STAR_SIZE = 1.8;       // device pixels

/**
 * Clouds: billboards on a world lattice, the same idea as the scatter
 * planting -- a slot at `i * CLOUD_SPACING` is hashed for its own height,
 * depth, size and wind speed, so the sky holds a consistent bank of clouds as
 * you pass under it rather than a handful of sprites glued to the camera.
 */
export const CLOUD_CAP = 24;          // instances drawn from the window below
export const CLOUD_SPACING = 70;      // average world units between cloud slots
export const CLOUD_REACH = 650;       // how far ahead/behind the camera slots are drawn
export const CLOUD_JITTER = 0.65;     // fraction of spacing a slot may shift by
export const CLOUD_DRIFT = 3.4;       // units/s of wind -- a world-x drift, never the camera's
export const CLOUD_SPEED_VAR = 0.55;  // +/- fraction of CLOUD_DRIFT, so clouds don't move in lockstep
export const CLOUD_Y = Object.freeze({ min: 95, max: 180 });    // above the street
export const CLOUD_Z = Object.freeze({ min: -300, max: -470 }); // past every building
export const CLOUD_SIZE = Object.freeze({ min: 95, max: 220 });
export const CLOUD_TEX_PX = 160;
export const CLOUD_DAY_COLOR = 0xffffff;
export const CLOUD_NIGHT_COLOR = 0x525c72; // a lit cloud's own colour at night is grey, not white
export const CLOUD_OPACITY = Object.freeze({ day: 0.92, night: 0.75 });

/**
 * The sun and the moon.
 *
 * A deliberate and very old cheat lives here: the *visible* disc is not in the
 * same place as the light.
 *
 * The key light needs a positive z so it rakes across the building faces the
 * camera can see; a light from anywhere else leaves every facade in shadow and
 * the city flat. But +z is behind the camera, so a disc drawn there would never
 * once be in shot. The disc is therefore drawn on the visible side of the sky,
 * sharing the light's x and y -- so the sun is on the right when the light
 * comes from the right, and the mismatch is confined to the toward/away axis,
 * which is the one the eye cannot read without cast shadows.
 *
 * SWING sets how far off the view axis the arc travels: at 0.55 the sun rises
 * at the right edge, passes near the top of frame at noon, and sets at the
 * left, staying in view the whole way.
 */
export const SUN_VIS_SWING = 0.55;
export const SKY_BODY_DIST = 680;   // inside FAR, beyond every building
export const SUN_DISC = 150;
export const MOON_DISC = 115;
export const BODY_TEX_PX = 256;
export const BODY_FADE = 0.16;      // elevation band over which they cross over

/**
 * Shadows, from whichever light is the key -- sun by day, moon by night.
 *
 * The single biggest thing missing from the look: nothing shadowed anything, so
 * facades read as lit panels rather than solids. One directional shadow map
 * does it, and it pays off hardest at dawn and dusk when the key is low and the
 * shadows rake the length of an avenue.
 *
 * The map covers a box that travels with the player rather than the world
 * origin, which is the whole trick with a directional light in an endless
 * scene: a fixed shadow camera works perfectly for about ten seconds and then
 * the player swings out of it and every shadow vanishes at once.
 */
export const SHADOW_MAP = 2048;
export const SHADOW_EXTENT = 80;    // half-width of the covered box, in units
export const SHADOW_DIST = 210;     // how far back the light sits from the box
export const SHADOW_NEAR = 20;
export const SHADOW_FAR = 430;
export const SHADOW_BIAS = -0.0006;
export const SHADOW_NORMAL_BIAS = 0.06;

/**
 * Speed, made visible.
 *
 * The game is about momentum and looked identical at fifteen units per second
 * and eighty. Two things fix that, and they work at different scales: streaks
 * in the near air give the eye something to measure the motion against, and a
 * directional blur smears the city behind.
 *
 * The blur is masked by screen distance from the player rather than by depth.
 * That is not a shortcut -- it is what the shot actually calls for. The camera
 * tracks the player, so the player is the one thing that is *not* moving
 * relative to the lens and must stay sharp while everything around him does not.
 */
export const STREAK_COUNT = 90;
export const STREAK_BOX = Object.freeze({ w: 120, h: 76, d: 60 });
export const STREAK_Z = -14;        // centred a little beyond the player
export const STREAK_LEN = Object.freeze({ min: 1.1, max: 7.5 });
export const STREAK_THICK = 0.05;
export const STREAK_MIN_SPEED = 20; // below this, no streaks at all
export const STREAK_AT_SPEED = 48;  // ...and at this, full strength -- comfortably under MAX_SPEED
export const STREAK_OPACITY = 0.42;
export const STREAK_COLOR = 0xdfe8ff;

export const MOTION_MAX_PX = 24;    // longest smear, in device pixels
export const MOTION_MIN_SPEED = 22;
export const MOTION_INNER = 0.07;   // uv radius around the player left sharp
export const MOTION_OUTER = 0.58;   // ...and where the blur reaches full

export const BLOOM_STRENGTH = 0.34;   // restrained: the windows are already hot
export const BLOOM_RADIUS = 0.55;
export const BLOOM_THRESHOLD = 0.72;
export const BLOOM_SCALE = 0.5;       // render bloom at half res

/**
 * Colour grading: the last pass in the chain, running on the final,
 * tone-mapped, display-space image rather than the linear HDR buffer bloom
 * works on -- so contrast and saturation here mean exactly what they say,
 * with no tone-mapping curve still ahead of them to second-guess the numbers.
 *
 * Kept deliberately restrained. A LUT or a curve is the fastest way to make a
 * whole game look like a different game, and also the fastest way to make it
 * look like a phone-camera filter; small multipliers close to 1, not a strong
 * look, is what keeps this reading as "graded" rather than "processed".
 */
export const GRADE_CONTRAST = 1.06;
export const GRADE_SATURATION = 1.1;
// A cheap stand-in for a proper LUT: shadows nudged cool, highlights nudged
// warm, in small enough amounts that it reads as "shot on film" rather than
// as an obvious tint.
export const GRADE_SHADOW_TINT = Object.freeze({ r: -0.018, g: -0.01, b: 0.022 });
export const GRADE_HIGHLIGHT_TINT = Object.freeze({ r: 0.018, g: 0.01, b: -0.014 });
export const GRADE_VIGNETTE = 0.3;    // corner darkening; 0 turns it off entirely

/**
 * Street-level darkening, a stand-in for ambient occlusion.
 *
 * Real SSAO costs a depth prepass and a blur, for an effect that in a canyon is
 * almost entirely "it gets darker towards the bottom". This does that in two
 * lines of shader with no extra pass: facades are multiplied down below
 * AO_TOP, reaching AO_FLOOR at street level. It is the cheapest thing in this
 * file and does more for the sense of depth than the bloom does.
 */
export const AO_TOP = 34;
export const AO_FLOOR = 0.55;

// ---------------------------------------------------------------- impacts

/**
 * Three moments the player should feel rather than infer from the HUD: a web
 * catching, the street ending a run, and simply going fast. All three are
 * triggered by an event rather than simulated continuously, so each lives in
 * a fixed ring-buffer pool -- see `effects.js` -- that is written to only when
 * something actually happens, which is what keeps them free the rest of the
 * time.
 */

// The anchor flash: a bright ring that blooms and dies in well under a
// second, so an attach reads as an event even off to the side of where the
// eye happens to be looking.
export const FLASH_LIFE = 0.22;
export const FLASH_SIZE = Object.freeze({ start: 0.6, end: 3.2 });
export const FLASH_COLOR = 0xdfe9ff;
export const FLASH_POOL = 6;          // concurrent flashes; rapid re-attaches shouldn't drop one
export const FLASH_TEX_PX = 64;

/**
 * Landing dust: the street reads as a surface, not a wall the run simply
 * stops at.
 */
export const DUST_BURST_COUNT = 10;   // puffs kicked out per landing
export const DUST_BURST_POOL = 30;    // three landings' worth between respawns
export const DUST_BURST_LIFE = 0.6;
export const DUST_BURST_SPEED = Object.freeze({ min: 2, max: 6 });
export const DUST_BURST_RISE = 1.4;   // units/s upward drift as the puff climbs
export const DUST_BURST_SIZE = Object.freeze({ start: 0.35, end: 1.7 });
export const DUST_BURST_COLOR = 0xcfc6b0;
export const DUST_TEX_PX = 64;

/**
 * The player's own speed trail: one quad, its pivot pinned to him and its far
 * edge trailing behind along his velocity, present only once he is moving
 * fast enough for a trail to read as speed rather than as a smear stuck to
 * his back. It shares STREAK_MIN_SPEED/STREAK_AT_SPEED with the ambient
 * streaks -- both exist to answer the same question ("is this fast?") and
 * should agree on the answer.
 */
export const TRAIL_LEN = Object.freeze({ min: 0, max: 5.5 });
export const TRAIL_WIDTH = 0.65;
export const TRAIL_OPACITY = 0.5;
export const TRAIL_COLOR = STREAK_COLOR;      // the same "is this fast?" colour
export const TRAIL_TEX_PX = 64;

// ---------------------------------------------------------------- pickups

/**
 * Two collectibles, both living at PLAYER_Z -- the plane the player, the web
 * strand and the spent webs already occupy, so nothing needs new collision
 * logic against the buildings behind or ahead of him.
 *
 * Both sit on a world lattice, exactly like the scatter planting: a slot at
 * `i * spacing` is hashed once for whether anything is there at all, and for
 * its height if so. What cannot come from that hash is whether a slot has
 * already been collected *this run* -- collection is real, mutable state,
 * and `pickups.js` is one of the few places in this project that keeps any,
 * deliberately, in a `Set` of collected slot indices per collectible that is
 * cleared at the start of every run. A pizza that vanished forever after
 * being seen once would depopulate the whole city over a long enough game; a
 * field that repopulates on the next life is the ordinary rule for an arcade
 * collectible, and it costs nothing extra to implement, since a fresh run
 * already resets everything else about the state.
 */
export const PIZZA_SPACING = 26;      // average world units between slots
export const PIZZA_FILL = 0.6;        // fraction of slots that actually hold one
export const PIZZA_JITTER = 0.6;      // fraction of spacing a slot may shift by
export const PIZZA_Y = Object.freeze({ min: 8, max: 80 });
export const PIZZA_RADIUS = 2.2;      // collection distance
export const PIZZA_POOL = 24;         // instances live at once, from PICKUP_REACH
export const PIZZA_SCORE = 1;

/**
 * The web replenisher: rare on purpose. It is what turns a long run into a
 * resource-management problem rather than a pure aiming one -- see
 * WEB_FUEL_MAX below.
 */
export const FUEL_SPACING = 210;
export const FUEL_FILL = 0.55;
export const FUEL_JITTER = 0.5;
export const FUEL_Y = Object.freeze({ min: 14, max: 65 });
export const FUEL_RADIUS = 2.6;
export const FUEL_POOL = 6;

export const PICKUP_REACH = 120;      // how far ahead/behind the camera slots are drawn
export const PICKUP_BOB = 0.35;       // vertical bob amplitude
export const PICKUP_BOB_RATE = 2.2;   // radians/s
export const PICKUP_SPIN_RATE = 1.1;  // radians/s

/**
 * Both pickups also carry a soft additive halo -- a billboarded glow quad,
 * bigger than the object itself and always facing the camera, exactly the
 * technique the sun and moon use. A small solid object lost against a busy
 * city and a hundred metres of open air was the actual complaint; the object
 * itself only got a little bigger, the halo is what makes it findable.
 */
export const PICKUP_HALO_TEX_PX = 64;
export const PIZZA_HALO = Object.freeze({ size: 3.0, opacity: 0.6, rate: 2.6, amount: 0.15 });
export const FUEL_HALO = Object.freeze({ size: 3.6, opacity: 0.7, rate: 3.2, amount: 0.2 });

// A pizza slice: a pie-wedge cylinder is the shape already, for free -- a
// `CylinderGeometry` with a `thetaLength` short of a full turn is a wedge.
// Sized to actually read at swinging distance, not to look right in a
// close-up screenshot.
export const PIZZA = Object.freeze({ r: 0.95, h: 0.22, angle: Math.PI / 3.2 });
export const PIZZA_COLOR = 0xe8a13c;
export const PIZZA_GLOW = 0.55;       // a little self-illumination, day or night
export const PEPPERONI = Object.freeze({ r: 0.16, h: 0.08, d: 0.46, a1: -0.35, a2: 0.32 });
export const PEPPERONI_COLOR = 0xa22a1e;

// The replenisher: a small canister, dark-bodied so its own glow is what
// reads, the same lit-panel trick the street's signs and headlamps use.
export const REPLENISHER = Object.freeze({ r: 0.4, h: 0.85, neckH: 0.24 });
export const REPLENISHER_BODY = 0x141c28;
export const REPLENISHER_GLOW_COLOR = 0xa6e8ff;
export const REPLENISHER_GLOW = 2.6;
export const REPLENISHER_PULSE = Object.freeze({ rate: 3.4, amount: 0.7 });

/**
 * How much web a player carries, in whole charges rather than a continuous
 * fluid gauge -- a charge is spent by a *successful* attach, not by a miss,
 * so the resource pressure is about how far you can travel, not about how
 * good your aim is; the aim-assist fan and roofline fallback already answer
 * the aiming question. Run dry mid-air with nothing to grab and the run ends
 * exactly the way it does off the street: hitting the ground.
 */
export const WEB_FUEL_MAX = 8;
export const WEB_FUEL_LOW = 2;        // at or below this, the HUD warns

// ---------------------------------------------------------------- camera

export const FOV = 55;
export const CAM_DIST = 40;        // +z from the player plane
export const CAM_LEAD = 9;         // offset ahead, in the direction of travel
export const CAM_HEIGHT = 5;       // sits slightly above the player
export const CAM_LAG_X = 0.14;     // lerp per 60th of a second
export const CAM_LAG_Y = 0.06;     // heavier, so a fast fall does not whip
/**
 * The floor the camera never drops below.
 *
 * Lowered from 24 to 17 during the visual pass, and it is the only
 * camera-adjacent number that moved. The reason is arithmetic rather than
 * taste: the camera looks at its own height and the frame is about 42 units
 * tall, so a floor of 24 put the bottom edge at y = 3 and the road surface at
 * y = 0 was permanently three units below the screen. Every lamp, kerb and
 * traffic streak was being drawn and could not be seen by anyone, ever -- the
 * exact failure this project keeps a debug overlay to catch, arrived at from
 * the other direction.
 *
 * Nothing about how the camera *behaves* changes: same lag, same lead, same
 * follow. It only affects what is in shot when the player is already near the
 * street, and it is one number to put back.
 */
export const CAM_MIN_Y = 17;
/**
 * The narrowest the world is allowed to get, in units.
 *
 * A perspective camera at a fixed distance shows a width proportional to the
 * aspect ratio, so a phone held upright sees about 19 units across -- barely
 * half a rope's length, with every anchor worth having off the side of the
 * screen. The camera pulls back to keep at least this much world in shot.
 *
 * Capped, though, by CAM_PULLBACK_MAX: satisfying it exactly in portrait means
 * standing three times further back, and the figure shrinks to a speck. This is
 * a genuine trade with no free answer -- the cap picks a middle and the debug
 * overlay reports the actual visible size so it can be judged rather than
 * guessed at.
 */
export const MIN_VIEW_W = 56;
export const CAM_PULLBACK_MAX = 1.9;

export const NEAR = 0.5;
export const FAR = 800;            // the far lanes sit at z = -360; 400 clipped them

// ---------------------------------------------------------------- look

/**
 * Fog does the atmospheric perspective, and its density is set against the far
 * lane rather than picked by eye: at 0.0028 a building 440 units away keeps
 * about a fifth of its contrast -- a silhouette you can still read -- while the
 * near lane at 60 units is essentially untouched.
 *
 * Both the colour and the density now come from DAY_KEYS and change through the
 * cycle; this is only the clear colour the canvas is initialised with.
 */
export const FOG_COLOR = 0x0e1226;
export const SHIRT_BLUE = 0x3b6bb0;
export const JEANS_BLUE = 0x33465f;
export const SKIN_TONE = 0xd9a878;
export const HAIR_BROWN = 0x4a3220;
export const EYE_DARK = 0x241a12;
/**
 * The clothes carry their own light.
 *
 * Measured, not guessed: lit only by the hemisphere light -- which takes its
 * colour from a dark purple night sky -- the figure came out at luminance 27
 * against buildings at 24. Three parts in 255. He was a silhouette against a
 * silhouette, which is precisely the mistake this project keeps a probe around
 * to catch. Press P and it reports the gap.
 */
export const SUIT_EMISSIVE = 0.55;
/**
 * The web strand.
 *
 * A cylinder is the wrong shape for a filament. It is straight, it is uniform,
 * and it is dead -- three properties real silk does not have. The strand is now
 * a thin tapered tube along a sagging curve, with a highlight travelling down
 * it, which is what a lit thread actually looks like.
 *
 * It stays a mesh rather than a `Line`, though: WebGL ignores
 * `LineBasicMaterial.linewidth` on essentially every driver, so a line is one
 * device pixel and vanishes at speed against a lit city.
 */
export const WEB_COLOR = 0xdfe6ef;
export const WEB_RADIUS = 0.075;    // thinner than the old 0.14 -- string, not rope
export const WEB_TAPER = 0.55;      // how much narrower at the hand than the anchor
export const WEB_SEGMENTS = 16;     // along the strand
export const WEB_SIDES = 5;         // around it; more is invisible at this width
/**
 * Sag, as a fraction of the strand's length. A loaded strand is nearly
 * straight; a slack one is not, and `swing.js` already knows which it is.
 */
export const WEB_SAG_TAUT = 0.012;
export const WEB_SAG_SLACK = 0.075;
/** The travelling highlight: how fast it runs, how tight it is, how bright. */
export const WEB_SHIMMER = Object.freeze({ speed: 1.7, width: 0.16, gain: 1.5, base: 0.72 });

/**
 * Spent webs.
 *
 * A strand you let go of does not vanish -- it stays anchored where you left
 * it, hangs, and swings in the air for a few seconds before fading. It costs
 * almost nothing and it is the single clearest signal of where you have just
 * been, which a game about momentum badly wants.
 */
export const SPENT_WEBS = 7;
export const SPENT_LIFE = 4.2;      // seconds hanging before the fade begins
export const SPENT_FADE = 1.6;      // seconds fading out
export const SPENT_WIND = Object.freeze({
  gust: 0.9,        // radians/s^2 of forcing at full strength
  period: 2.3,      // seconds per gust cycle
  damping: 0.6,     // how quickly a swing dies
  gravity: 2.4,     // pendulum restoring rate
  droop: 0.82,      // fraction of the release length the free end hangs at
});

/**
 * Cinematic night lighting, in three parts.
 *
 * A key from high and behind the camera reads as the moon and picks out roof
 * edges and setbacks -- it is what stops a box from being a flat coloured
 * shape. A cool rim from the opposite side separates near buildings from the
 * ones behind them. The hemisphere fill is deep blue above and warmer below,
 * standing in for the sodium bounce a real street throws back up at the
 * facades. Windows light themselves and are not lit by any of these.
 */
export const RIM_DIR = Object.freeze({ x: 0.7, y: 0.35, z: -0.6 });
export const ENV_INTENSITY = 0.9;     // how much glass reflects the sky

export const SKY_TEX_H = 256;
export const MAX_DPR = 2;           // retina is enough; 3x costs half the fps

/**
 * Collider proxies: the gameplay contract, decoupled from the visuals.
 *
 * A web used to raycast against the visible building meshes, which meant the
 * city could not stop being one mesh per building without changing what a web
 * can hit. These invisible boxes carry that contract instead -- one per massing
 * part in the anchor lanes. They are never added to the scene, so they cost
 * nothing to render; their matrices are updated by hand.
 */
export const COLLIDER_POOL = 160;

/**
 * Instance budgets. Overflow is counted and shown in the overlay, never
 * silent -- a city that quietly thins out under load is very hard to notice
 * and very easy to misdiagnose as a generation bug.
 */
export const FACADE_CAP_PER_MESH = 96;   // per (type, variant) draw call
export const TRIM_CAP = 460;             // cornices, parapets and roof caps
export const PROP_CAP = 520;             // per prop kind

// ---------------------------------------------------------------- the figure

/**
 * The figure: a skeleton, not a stack of boxes.
 *
 * There is still no model file, no rig format and no animation clip. What there
 * is now is a joint hierarchy -- pelvis, spine, neck, and limbs with real
 * elbows and knees -- and every angle in it is computed from the physics each
 * frame by `pose.js`.
 *
 * The articulation is what does the work, not the surface detail. At the size
 * this character sits on screen a web pattern would be three aliased pixels,
 * while a knee that bends reads instantly. So the budget went on joints:
 * eleven of them, where there were five.
 *
 * Every dimension is measured from the root, which sits at the point the rope
 * actually holds -- roughly the sternum, where a body hanging from its own arms
 * really does pivot. `FEET_DROP` is the sum of hip, thigh, shin and ankle
 * below it, and is unchanged at 1.70 so the street test still lands on the
 * soles.
 */
export const BODY = {
  // --- torso ---------------------------------------------------------------
  waistY: -0.24,          // where the spine pivots, relative to the root
  hipY: -0.52,            // pelvis centre, and the top of the legs
  pelvis: { r: 0.25, len: 0.20 },
  belt: { r: 0.26, len: 0.07 },
  chest: { r: 0.29, len: 0.50 },
  chestY: 0.20,           // relative to the waist pivot

  // --- head ----------------------------------------------------------------
  neckY: 0.50,            // relative to the waist pivot
  neck: { r: 0.10, len: 0.13 },
  headR: 0.26,
  headY: 0.28,            // above the neck pivot
  hair: { rScale: 1.04, thetaLength: 1.95 }, // a cap over the crown, in radians of the sphere it is cut from
  eye: { w: 0.08, h: 0.058, d: 0.03 },
  eyeX: 0.115,
  eyeY: 0.035,
  eyeZ: 0.225,

  // --- arms ----------------------------------------------------------------
  shoulderX: 0.33,
  shoulderY: 0.38,        // relative to the waist pivot
  upperArm: { r: 0.095, len: 0.44 },
  foreArm: { r: 0.082, len: 0.40 },
  glove: { r: 0.098, len: 0.16 },   // the last stretch of the forearm
  hand: { r: 0.085 },

  // --- legs ----------------------------------------------------------------
  hipX: 0.17,
  thigh: { r: 0.118, len: 0.52 },
  shin: { r: 0.098, len: 0.50 },
  boot: { r: 0.108, len: 0.20 },    // the last stretch of the shin
  foot: { w: 0.17, h: 0.11, d: 0.30 },
  ankleDrop: 0.16,        // ankle to sole; the last term of FEET_DROP
  footZ: 0.07,            // toes forward of the ankle

  // --- how it moves --------------------------------------------------------
  leanPerSpeed: 0.012,    // radians of lean per unit/s, in free flight
  maxLean: 0.5,
  tuckAtSpeed: 40,        // speed at which the legs are fully tucked
  diveAtSpeed: 55,        // fall speed at which the body is fully streamlined
  armSpread: 0.16,        // shoulders rotated out of plane, so arms have depth
  legSpread: 0.07,
};

/**
 * How fast each joint chases its target, as an exponential rate in units of
 * 1/second. This is the whole of the secondary motion.
 *
 * Limbs lag the torso, and the further out the chain the more they lag: the
 * spine leads, the shoulders follow, the elbows and knees trail. That is what
 * makes the figure read as having mass rather than snapping between poses --
 * and it costs one `exp()` per joint per frame.
 *
 * A rate is frame-rate independent by construction: the step is
 * `1 - exp(-rate * dt)`, so halving the timestep and doubling the steps lands
 * in the same place. A plain `lerp(a, b, 0.2)` does not, and drifts with fps.
 */
export const POSE_EASE = Object.freeze({
  body: 22, spine: 11, head: 7,
  shoulder: 13, elbow: 9,
  hip: 13, knee: 8,
});

/** The darker accents: boots and belt. */
export const BOOT_BROWN = 0x4a2f1a;
export const BELT_BROWN = 0x2f2015;

// ---------------------------------------------------------------- feel// ---------------------------------------------------------------- feel

/**
 * Aim assist, in three escalating steps.
 *
 * Measured on the first playable build: **7 hits out of 19 webs**. The exact
 * ray is unforgiving in a way that is nobody's fault -- you cannot tell by
 * looking which lane a building is in, half the frame is scenery that a web is
 * not allowed to touch, and a click a few pixels above a roofline is sky. A
 * core verb that fails twice as often as it works is not difficulty.
 *
 * So: the exact ray first, then a small fan around it, then the roofline of
 * whichever reachable building best matches the direction pointed. The overlay
 * names which of the three actually produced the anchor, because an assist you
 * cannot see the workings of is impossible to tune.
 */
export const AIM_FAN = Object.freeze([
  [0, 0], [-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1],
]);
export const AIM_FAN_NDC = 0.045;   // spread of one fan step, in NDC
export const AIM_MIN_RISE = 3;      // an anchor must be at least this far above

export const THWIP_MS = 90;        // how long the web takes to reach the anchor
export const MISS_MS = 260;        // how long a failed web hangs before dropping
export const MISS_LEN = 12;        // how far a failed web travels
/**
 * How long the fade to nothing takes before the death screen shows. There is
 * no fade back in to time against any more -- the run does not resume until
 * the player clicks restart, so this is just how long the street gets to
 * read before the summary covers it.
 */
export const RESPAWN_MS = 700;
export const WIND_AT_SPEED = 60;   // speed at which wind noise is at full gain
export const MASTER_GAIN = 0.35;

/** What killed the run, in the death screen's own words. */
export const DEATH_LABELS = Object.freeze({
  drone: 'A drone got you.',
  fuel: 'You ran out of web.',
  fall: 'You hit the street.',
});

/**
 * A word of encouragement every MILESTONE_STEP of *this run's* own progress
 * -- distance from `run.startX`, not world x. Deliberately the opposite
 * choice from the drones' own difficulty tiers (see ENEMY_DIFFICULTY_STEP's
 * note): a milestone is cheering this attempt on, not describing a fixed
 * place in the city, so it has to reset with the run the way the score does.
 * They share the same step distance on purpose -- the message at 500m is
 * allowed to promise it gets harder from here, because it just did.
 *
 * Messages carry no distance of their own -- `game.js` prepends the real,
 * computed one. A run good enough to cycle back to message zero would
 * otherwise show "500m in" at 4,000m, which is a small thing to get wrong
 * and a free one to get right.
 */
export const MILESTONE_STEP = 500;
export const MILESTONE_HINT_MS = 4500;
export const MILESTONE_MESSAGES = Object.freeze([
  'in — the drones start taking notice from here.',
  'Strong swing. It only gets busier from here on.',
  "you're outpacing most runs, and the sky's filling up to match.",
  "Nice work. Hold on, it's about to get messier.",
  "the skyline's paying attention now. It won't go easy on you.",
  'That is about as hard as this city gets. Good luck.',
  "and still climbing. The drones ran out of new tricks — you haven't.",
  "Genuinely impressive. From here it's just you against consistency.",
]);

/**
 * The +Y axis, as plain numbers. three.js wants a Vector3 for this, but
 * world.js is imported by the physics and its tests, which run in Node with no
 * three.js resolvable -- so this file stays free of engine types.
 */
export const UP = Object.freeze({ x: 0, y: 1, z: 0 });

/** Normal of the plane the player is confined to. Same reason as UP. */
export const PLANE_NORMAL = Object.freeze({ x: 0, y: 0, z: 1 });

/**
 * The +Z axis, as a rotation axis -- what a ramp pitches about to tilt its own
 * length up or down. Numerically identical to PLANE_NORMAL and deliberately
 * not the same constant: that one is a plane's normal, this one is a hinge,
 * and a change to what the player's plane means should not silently retilt
 * every ramp in the city.
 */
export const AXIS_Z = Object.freeze({ x: 0, y: 0, z: 1 });

/** Identity scale, for composing instance matrices. Same reason as UP. */
export const UNIT = Object.freeze({ x: 1, y: 1, z: 1 });



// ---------------------------------------------------------------- helpers

/** Centre x of block `n`. The only place a building x is allowed to come from. */
export function blockX(n) {
  return n * BLOCK_PITCH;
}

/** Which block index a world x falls in. */
export function blockAt(x) {
  return Math.round(x / BLOCK_PITCH);
}

/** Roof height of a building, given its lane and a 0..1 roll. */
export function roofY(lane, roll) {
  return STREET_Y + lane.hMin + roll * (lane.hMax - lane.hMin);
}
