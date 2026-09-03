# City Slinger

A side-scrolling web-swinging game in [three.js](https://threejs.org/). Click a
building, swing on the rope, let go and keep the arc. The city never ends.

```
npm install      # once
npm run vendor   # copy three.js into vendor/ (also once)
npm run dev      # http://localhost:5175
npm test         # the physics and the pose, headless
npm run check    # syntax + the coordinate-literal rule
npm run anchors  # is there anything to swing from? by altitude
```

## What this was for

Two side-scrollers preceded this one, both hand-drawn onto a 2D canvas. The
question here was narrow: **what does an engine actually buy you?**

Three answers, all of them things that cost real work last time and cost nothing
here:

- **Parallax is not computed.** There are no per-layer scroll factors in this
  codebase. Buildings sit at five different `z` values and a perspective camera
  does the arithmetic. Depth cueing is fog.
- **Occlusion is free.** Foreground buildings pass in front of the player
  because they are in front of the player.
- **The character is posed, not animated.** There is no model file, no rig and
  no animation clip. He is eight boxes, and every joint angle is computed from
  the physics each frame — so he leans correctly into arcs nobody keyframed.

The honest counterweight: three.js is 2MB of vendored library to draw about a
hundred boxes, and none of the above needed a scene graph. What it bought was
not capability but *not having to think about it*.

## Day and night

One number -- `phase`, 0 to 1 -- drives every visual system: light directions
and colours, the sky gradient, fog colour and density, whether the windows are
lit, whether the street lamps and headlights are on, exposure, bloom, and how
much the suit glows. A full cycle is four minutes; a run opens just before the
small hours, so the city starts on the look it was built for and dawn arrives
about ninety seconds in.

`src/daylight.js` is a pure function from phase to palette -- no three.js, no
canvas -- interpolating a table of seven keyframes that lives in `world.js`.
That structure is doing real work here, for two reasons.

**It is the system with the worst feedback loop in the project.** Everything
else is wrong in a way you see immediately; a day/night cycle is wrong in a way
you have to *wait* for, and a bug at phase 0.34 is minutes away from the last
time you looked. The tests drive the entire cycle in about a millisecond and
assert what eyes are bad at: that nothing jumps between adjacent frames, that
the seam at midnight is seamless, that the key light is never below the
horizon, and that landing exactly on a keyframe gives that keyframe.

**The failure mode is one subsystem left behind.** Lamps still burning at noon,
a sunlit street under a black sky. So the palette is applied in a single
function of straight assignments -- one list you can read down to see that
nothing is missing. Which is how the rooftop signs got caught still glowing at
midday: they are a separate material from the windows, and were not on it.

The sun's direction is derived from the phase rather than keyframed, so the
light can never drift out of step with the sky the way two hand-authored tables
would. The key light swaps to the moon on the opposite side of the sky when the
sun sets, rather than fading out, so there is always something raking across
the facades.

Two things that cannot be done per frame are done on drift instead. The
environment map -- what the glass towers reflect -- is several render passes, so
it is rebuilt only when the sky palette has moved past a threshold, about a
dozen times a cycle; the count is in the overlay. The sky gradient *is* redrawn
every frame, because it is one pixel wide by 256 tall and repainting a kilobyte
is cheaper than any scheme for avoiding it.

There is a sun by day and a moon by night, and a star field behind both.

The stars sit on a shell that travels with the camera, so they never parallax
-- and at a radius beyond every building, so the skyline occludes them. Both of
those are what separate a star field from white specks floating over the city,
which is precisely what the dust motes were doing before: their drift box
straddled the player plane, putting half of them between the camera and the
buildings, and they read as stars stuck to the foreground. They are now
smaller, dimmer, warmer, fewer, and pushed back behind the player.

The sun and moon carry a deliberate and very old cheat, which is worth being
explicit about. **The visible disc is not where the light is.** The key light
needs a positive z so it rakes across the building faces the camera can see;
anywhere else and every facade falls into shadow and the city goes flat. But
+z is behind the camera, so a disc drawn there would never once be in shot. The
disc is therefore drawn on the visible side of the sky sharing the light's x
and y -- so the sun is on the right when the light comes from the right, and
the mismatch is confined to the toward/away axis, which is the one the eye
cannot read without cast shadows.

They are depth-*tested* but do not write depth, so the skyline rises in front
of them and the sun genuinely sets behind a tower.

`T` cycles the clock through 1x, 12x, 60x and paused.

## Shadows, and speed you can see

**Shadows** were the biggest single gap in the look. Nothing shadowed anything,
so facades read as lit panels rather than solids. One directional shadow map on
the key light -- sun by day, moon by night -- fixes it, and it pays off hardest
at dawn and dusk, when the sun is low and a tower throws its shadow the whole
length of an avenue.

The one thing that has to be right is that **the shadow camera travels with the
player**. It is a fixed-size box, and left at the world origin it works
beautifully for about ten seconds before the player swings out of it and every
shadow in the scene disappears at once -- which looks like the feature breaking
rather than the volume running out. Casting is also deliberately selective: the
shadow pass is a second draw of everything it touches, and a car's shadow at
this distance is a few pixels nobody will ever see.

**Speed** was the other. The game is about momentum and looked identical at
fifteen units per second and eighty, because buildings a hundred units away
barely move across the frame however fast you go. Two things at two scales fix
it: streaks in the near air give the eye something to measure against, and a
directional blur smears the city behind.

The blur is masked by screen distance from the player rather than by depth, and
that is art direction rather than a shortcut -- the camera tracks him, so he is
the one thing in frame that is *not* moving relative to the lens and must stay
sharp while everything around him does not. It also sidesteps a real
awkwardness, since `EffectComposer` ping-pongs between two render targets and
"the buffer the depth ended up in" is not a fixed object.

Both are on toggles (`M` for the blur, `B` for bloom) and both report into the
overlay, because an effect whose cost you cannot measure is one you cannot tune.

## The rope

`src/swing.js` is the whole game and imports nothing but numbers — no three.js,
no canvas, no DOM. It runs under `node --test` in about a millisecond, which is
why it got the attention it did.

The first version integrated x and y and, when the rope went over-length,
snapped the position back onto the circle and deleted the outward velocity. It
measured **6.35% of the arc speed lost on a single swing** — swings visibly die
out. So while the rope is taut the mass is integrated as a pendulum instead:
angle and angular velocity, semi-implicit, which is symplectic. It now arrives
at the bottom of an arc within 0.001% of √(2gL), and after two minutes of
swinging the arc is unchanged to four decimal places.

Two behaviours fall out of that rather than being written:

- **Reeling in speeds you up.** The angular equation for a changing rope length
  carries a `−2L'ω/L` term, which is conservation of angular momentum. Pull in
  at the bottom of an arc and you gain speed, the way a child pumps a swing.
- **The rope goes slack.** It is only taut while `Lω² − g·cosθ ≥ 0`. Above that
  the constraint drops and you are in free flight until it snaps tight again —
  inelastically, because that is what a rope does.

## The city

Nine depth lanes reaching out to z = -360, four architectural types, and about
a hundred buildings in shot at any moment -- in **64 draw calls**, at 60fps.

Three things carry it:

**Per-instance UVs.** Every building needs its own window grid: a 78-unit tower
wants 24 floors and a walk-up wants 6. UV repeat is a property of a *texture*,
not of an instance, which is why the first version needed one mesh and one
cloned texture per building and could never have more than a hundred. Now each
instance carries its own UV scale and offset in an `InstancedBufferAttribute`,
and a small `onBeforeCompile` patch applies them to the map, emissive and
normal UVs in the vertex shader. One draw call serves a hundred buildings that
share a texture and share nothing else. The same patch carries a per-instance
tint, an emissive multiplier, and a height-based darkening that stands in for
ambient occlusion at street level -- two lines of shader that do more for the
sense of depth than the bloom does.

**Facades generated from a height field.** Each type gets colour, emissive and
normal maps that agree with each other, because everything is drawn twice --
once in colour, once in greyscale height -- and the normal map is Sobel'd out
of the second. Adding a detail means drawing it in two places, never computing
a normal by hand. It is what makes a window read as a recess rather than a
square painted on, and what makes a facade respond when the moonlight moves
across it.

**Cross avenues.** Every hundred units, one x-band is left empty in *every*
lane at once, so the eye looks straight down a side street into the haze. A
grid city seen side-on is mostly a wall; it is the gaps that tell you there is
a city behind it. The blocks either side of a gap are force-occupied in the
anchor lanes -- a gameplay guarantee, not a decorative one, or a cross street
could line up with random empty blocks and leave a span longer than `MAX_ROPE`
with nothing to grab.

Each gap then gets a road surface, two receding rows of street lamps, and
traffic: 470 units of avenue running back past the furthest lane and fading out
in the fog rather than ending. Ninety-odd vehicles, about 40% of them yellow
cabs.

The lights are doing more work than the cars. At three hundred units a vehicle
is nine pixels of dark metal that reads as nothing, while its lamps are two
pixels that bloom into a legible point -- so a line of white points coming
toward you and red points going away is what actually sells a busy avenue.
Orientation gets the colours right for free: a car driving away has its rear
toward the camera, so it shows red without anything deciding that it should.

One geometry and one draw call covers the whole fleet -- `InstancedMesh`
supports `setColorAt`, so the cabs and the dark cars are the same mesh with
different per-instance paint. Only the roof sign is separate, because it is the
one part of a cab that is a different *shape* rather than a different colour.
Nothing about a car is stored either: it is hashed from (avenue, slot), so the
cab three blocks ahead is the same cab when you get there.

**Planting.** Trees line both pavements of every avenue, and a kerbed, planted
median splits the traffic down the middle -- the Park Avenue detail, and the
thing that makes an avenue read as an avenue rather than as a gap between
buildings.

Two tree shapes rather than one scaled shape, because variety in a procedural
scene almost always wants to be variety *of kind*: a row of identical trees at
different scales still reads as a row of identical trees. Scale, rotation and
tint then vary on top. Trunk and leaves are different colours inside one merged
geometry via vertex colours, so a whole tree is one instance -- and `setColorAt`
still works on top, because three multiplies the instance colour into the
vertex colour rather than replacing it. That is what gives a row its spread of
greens without turning any trunk green.

Two things had to be got right to make that merge work at all: everything is
forced `toNonIndexed()` first, because cylinders are indexed and icosahedra are
not and `mergeGeometries` refuses the mix with an error that names neither; and
the canopies are detail-0 icosahedra, twenty faces each, so a whole tree costs
about sixty triangles and three hundred of them cost seventeen thousand.

**Street level.** The bottom of the frame is where the city is closest to the
camera and was, for a long time, where it had the least in it: two grey kerbs
and an asphalt slab. It now carries pavement, markings and ironwork, all
instanced and all placed by the same seeded hash as everything else -- so a
hydrant stays where it was when you swing back past it.

The pavement is a textured slab rather than a plain box: a canvas of slabs with
per-slab tonal drift and a few stains, with a normal map derived from the same
height field by Sobel, so a kerb catches the lamp above it. It runs both sides
of the avenue and both sides of every cross street, which is what makes a
junction look like a junction.

On the road: manholes, and zebra crossings at every junction -- one pair across
the avenue, one pair across the cross street, the second rotated a quarter turn
so the stripes run the right way. On the pavement: hydrants at the kerb, and
signals on the corners with their arms out over the roadway, their lenses on a
separate emissive material so they hold a little glow in daylight. Parked cars
fill the kerb lane nose to tail with gaps where the rest of the furniture is,
painted from the same palette as the moving traffic.

**Steam** is the one thing here that moves. Five plumes on a world lattice, each
twenty-six billboarded quads that climb, spread and fade -- one draw call. The
fade lives in `setColorAt` rather than in alpha, because an `InstancedMesh` has
a single opacity for the whole batch but a per-instance colour; under additive
blending, multiplying a puff toward black is exactly a fade to nothing. The
overall opacity was measured rather than picked: against night asphalt, 0.45
reads as a spotlight on the road and 0.13 barely separates from it.

### The ground, and the back of the city

**There was no floor.** The avenue and the cross streets were slabs of asphalt
over nothing at all -- invisible from swinging height, and glaring the moment
you look down a cross avenue, where the road ran back three hundred units and
then the world stopped being there.

`src/ground.js` is one textured plane and a lattice of planting. The texture is
not a grey sheet but the patchwork a city is from above: ragged green lots, bare
dirt, and hard-edged concrete. Every patch is painted nine times -- at the tile
and at its eight neighbours -- so a shape that runs off one edge arrives on the
other and the seams vanish. That costs nothing (it runs once, at startup) and it
is the difference between a floor and a visible grid of squares.

The planting is where the design is. A tree or a shrub is placed on a world
lattice and then **rejected** by three rules: nothing on the main avenue,
nothing on a cross avenue, and nothing inside any building lane's depth band.
What survives is only the strips *between* the rows of buildings -- which is
exactly where you can see the ground, and nowhere else. Shrubs are a different
*kind* of silhouette rather than small trees, for the same reason there are two
tree shapes: a row of scaled-down copies still reads as a row of copies.

**The far lanes got denser**, and a tenth was added at z = -500. A silhouette
with gaps in it reads as a small town. At that distance a building is a few
pixels wide, so density costs almost nothing per instance and is the only thing
separating "a city going back" from "some towers with sky between them". The
furthest lane sits past the end of every cross avenue, so an avenue now runs
into buildings rather than into fog with nothing behind it.

### Nothing stands in a junction

The medians started as one continuous box per avenue running its whole length,
which meant the main avenue's planted strip ran **straight through every
cross-street junction** -- grass across a road, which is the one thing a median
never does. The trees had the same fault and it was worse: a tree standing in
the middle of an intersection. Adding the back streets multiplied it, because
every cross avenue's median now crossed five more roads.

The rule that fixes all of it is one line of geometry: **a point lying on two
roadways at once is a junction, and nothing may stand there.** A point on a
single road's median or kerb is fine; the crossing is not. So `inJunction` is an
intersection of the three road families rather than a union of them, and it
covers every planted thing in `street.js` from one place -- the main avenue's
kerb trees and median are cut by the cross avenues, and a cross avenue's
pavement trees and median are cut by the main road and by every back street.

Trees only needed a guard at the top of `plantTree`, so no call site can forget
it. The medians needed segmenting: a `gaps()` helper takes a span and the
blocked ranges and emits what is left, and each surviving run becomes one
instance. Segments shorter than `MEDIAN.minSegment` are dropped -- a two-unit
stub between two close junctions reads as debris in the roadway, not as a
median.

The overlay was what confirmed it: `medians` went from an implicit 6 strips to
40 segments, which is exactly 10 on the main avenue plus 6 on each of the 5
cross avenues, and `trees` fell from 334 to 245 -- 89 of them had been standing
in crossings.

### Back streets, and why the city is blocks now

The city was a **comb**, not a grid: one road running along x and a row of
avenues going back, so you could look down any avenue and watch it run four
hundred units without ever meeting anything. Manhattan's whole character is that
it does not -- a cross street arrives every couple of hundred feet, and the
intersections are what make it read as blocks rather than as corridors.

`BACK_STREETS` are the cross members, and the reason they were cheap is that
their z values are not free: every one sits in a gap the building lanes already
leave between them. Nothing is standing where they run, by construction, so not
a line of `city.js` had to change to make room. They also get wider with
distance, for the same reason every lane behind the player does -- the whole
city is built at increasing scale with depth, and a back street the same width
as the near one would simply not be there at four hundred units.

Three things were needed to make them *read*, and only one of them was the road:

- **Lamps** across the nearer three. At night this is what does the work: a row
  of warm points crossing a gap you are looking down. The far two carry none --
  at three hundred units a lamp is one fogged pixel, and the pair of them would
  cost forty instances to say nothing.
- **Traffic** running along each one. Lights sliding across an avenue you are
  looking down is something no static geometry can do.
- **A kerb either side**, which was found by measuring rather than by eye.
  Against the ground's concrete (luminance 46 of 255) the road surface sits 21
  points *below* it and reads as a shadow, not a street -- fine at night when
  the lamps carry it, and nothing at all at noon. The kerb sits 16 points above.
  A back street is a dark band between two light lines, at either end of the
  day. That is PRINCIPLES §4 exactly: the first version was invisible for a
  colour reason, not an opacity one.

They run through precisely the strips the ground planting fills, so the scatter
grew a fourth rejection rule and lost about half its cells to it; `treeChance`
and the clearance went up to compensate, and the count in the overlay is what
said by how much.

### Overpasses

A cross avenue is four hundred units of empty perspective and every one of them
recedes identically. Something crossing it part-way down breaks that up and puts
a scale reference where there was none. Half the avenues carry a bridge -- deck,
parapets and piers welded into one instance, five boxes, one draw call for every
overpass in the city -- and about half carry a sign gantry.

Two decisions are worth recording. They sit on the **cross** avenues only, never
over the main one: anything that looks solid near the player and cannot be
webbed is a lie about the world, and the near lanes are the only place a player
reads as reachable. And the deck is exactly wide enough to land on both
pavements -- the blocks either side of an avenue start 8.5 units off its centre
line, so a longer deck buries its own ends and its piers inside a building.

The sign carries **no text**. At the distance these are seen a letter is a
fraction of a pixel and a texture that tries reads as noise; what makes a
highway sign recognisable at range is its shape and its colour, so it is a green
field, a white border, two white bars and an arrow. It is retroreflective rather
than lit -- it has no lamp of its own, it throws back whatever hits it -- so it
lifts at night and goes flat by day, the opposite of how the windows behave.

### Colliders

Webs raycast against none of that. `anchorTargets` is a pool of invisible boxes
mirroring the massing of the anchor lanes, never added to the scene, matrices
updated by hand. Splitting the gameplay contract from the visuals is what let
the city change this much without touching a line of the swing, the aim assist
or the camera -- and the hit rate measured **35/39 afterwards against 29/31
before**, which is the check that says so.

## The anchor problem, and how it was found

"There isn't enough to swing from" is exactly the kind of complaint that is
easy to answer by feel and get wrong, so it got a tool instead. `npm run
anchors` walks the real city and asks, at each altitude, how often a web has
anything to catch -- using the same reachability rule `fireWeb` does.

The answer was a curve nobody would have guessed:

```
  y=45   99.0%   longest gap  12u
  y=65   92.3%   longest gap  76u
  y=85   64.7%   longest gap 216u
```

At swinging altitude the city was fine. It fell apart *above* it -- and a good
swing gains height, so playing well carried you into the part of the city with
nothing to grab, and runs ended for reasons that had nothing to do with the
swing that had just been made. The worst possible shape for a difficulty curve,
and completely invisible in a screenshot.

The fix was in the anchor lanes' numbers, not in the code: a higher floor, a
higher ceiling, a height roll biased upward rather than down, and more of them.
It now reads 99.2% / 97.9% / 93.5% at those altitudes, with the longest gap down
from 216 units to 56.

## Aim assist, and why it exists

The first playable build landed **7 webs out of 19**. That is not difficulty:
you cannot tell by looking which depth lane a building is in, half the frame is
scenery a web is not allowed to touch, and a click a few pixels above a roofline
is sky.

So a web now tries three things in order — the exact ray, a small fan around it,
then the roofline of whichever reachable building best matches the direction
pointed. That measured **29 out of 31**. The debug overlay names which of the
three produced the anchor (`via exact` / `via fan` / `via roofline`), because an
assist you cannot see the workings of is impossible to tune.

## Inherited discipline

`../nightcity/PRINCIPLES.md` is the retrospective from the previous project.
Its day-one checklist is built into this one rather than admired:

| | |
|---|---|
| **No bare coordinates** | `src/world.js` owns every number. `npm run check` fails on a positional literal anywhere else. |
| **Every system reports output** | The overlay (`` ` ``) counts what each subsystem *produced* — buildings drawn, draw calls, webs hit, rope state — never whether it was enabled. |
| **Measure colour, never judge it** | `P` samples the canvas and prints luminance gaps. It caught the player at 27 against buildings at 24 — a silhouette against a silhouette — and the suit now carries its own emissive light. |
| **Hardest target first** | `PointerEvent` and `touch-action: none` from the first line, so a finger and a mouse are one code path. Resize is wired before any content existed. |
| **Logic testable headlessly** | `swing.js`, `pose.js` and `daylight.js` import no three.js. 24 tests, no browser. |
| **Measure the level, not just the code** | `npm run anchors` walks 12,000 units of the real city and reports, per altitude, how often there is something reachable and the longest gap without one. It found the flaw described below, which no amount of playing had made legible. |
| **Dev server day one** | `tools/serve.py`, copied from nightcity: no-cache plus real `Range` support. |

The one checklist item deliberately skipped: the generate → conform → measure
asset pipeline. Every piece of geometry and every texture here is made in-engine,
so there is nothing to conform.

## Choosing the light

The start screen offers three ways in: **Day** and **Night** pin `phase` to a
fixed keyframe and freeze the clock (`TIME_SCALE_PAUSED`, the zero entry in
`TIME_SCALES`), so the chosen look never drifts while you practise the swing.
**Cycle** leaves `phase` and `timeScale` exactly where a run always started
before this existed -- `DAY_START`, night, running forward -- so it is not a
fourth mode bolted on beside the original behaviour, it *is* the original
behaviour, now named and given siblings.

Night is not midnight; it is the 'night' keyframe (`phase` 0.87), the same look
`DAY_START` already opens every run on. One clock, so day, night and cycle can
never quietly disagree about what a given phase should look like -- picking a
mode just sets where on that clock play begins.

The palette applies every frame regardless of whether a run has started (see
`frame()` in `game.js`), so clicking a mode repaints the city behind the
overlay immediately. The button is a preview of the choice, not just a switch
thrown after the fact.

## Layout

```
src/world.js    every constant and anchor — the only place numbers live
src/swing.js    the rope. Pure. No engine types.
src/pose.js     joint angles from physics. Pure.
src/daylight.js the day/night palette. Pure.
src/city.js     instanced buildings, identity hashed from (lane, block)
src/buildings.js  massing per architectural type. Pure.
src/facade.js   procedural colour/emissive/normal facade sheets
src/props.js    merged rooftop geometry -- water towers, HVAC, fire escapes
src/street.js   the avenue: road, pavement, lamps, traffic, trees, furniture
src/steam.js    plumes through the road, one draw call
src/ground.js   the floor between the roads, and what grows on it
src/atmosphere.js  env map, haze layers, dust
src/speed.js    streaks in the near air, so speed is visible
src/postfx.js   composer, restrained bloom, and the motion blur
src/player.js   eight boxes
src/webline.js  the strand — a cylinder, because WebGL ignores line width
src/follow.js   camera rig
src/probe.js    the luminance probe
src/game.js     wiring, the fixed-timestep loop, and what a click hits
```

Nothing about a building is stored. Height, windows, tint and whether a block is
occupied at all are hashed from its lane and index, so block 400 is always the
same building as block 400 — the city is consistent in both directions forever
without remembering a byte. That idea is lifted wholesale from nightcity, where
it was the one that worked best.

## Controls

`click` fire a web · `hold` reel in · `release` let go ·
`R` restart · `` ` `` debug overlay · `P` contrast probe · `B` bloom · `M` motion blur · `T` time of day
