# Voxel World

A browser-based, first-person Minecraft-like built with Three.js — no
bundler, no build step. An **infinite** procedural world streams in
around you chunk by chunk: continents, oceans, mountain ranges, forests
and lakes, with a full day/night cycle, dynamic weather, shader clouds,
shader water and a Minecraft-style `/` command console. The focus is
**atmosphere**: sun and moon light, dusk glow, stars, rain, snow,
lightning, and water that catches the sunset.

![Day](docs/screenshots/day.png)

| | |
| --- | --- |
| ![Sunset](docs/screenshots/sunset.png) | ![Night](docs/screenshots/night.png) |
| ![Storm](docs/screenshots/storm.png) | ![Menu](docs/screenshots/menu.png) |

## Run locally

Everything is ES modules + an import map; Three.js and simplex-noise are
pulled from CDN.

```sh
python3 -m http.server 8765
# then open http://localhost:8765
```

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look (pointer lock — click the canvas to capture) |
| WASD | Move |
| Space | Jump / swim up (ascend while flying) |
| Space ×2 | Toggle flight — creative mode, fly as high as you like |
| Shift | Sprint (descend while flying) |
| F | Toggle fly mode (same as double-Space) |
| Left click | Dig block |
| Right click | Place block |
| 1–7 / wheel | Select hotbar block |
| `/` | Command console |
| R | Cycle weather |
| T (hold) | Fast-forward time |
| ESC | Menu |

## Commands

Press `/` in game (pointer lock releases while you type, Enter runs,
ESC cancels):

```
/time set <day|noon|sunset|night|midnight|sunrise|HH:MM|ticks>
/time add <ticks>            Minecraft-style ticks (24000 = one day)
/timescale <n>               day-cycle speed; 0 freezes time
/weather <clear|cloudy|rain|storm|snow>
/weather lock | unlock       pin the current weather / resume cycling
/tp <x> <z>                  teleport to the surface at (x, z)
/tp <x> <y> <z>              teleport exactly
/tp spawn
/fly
/renderdistance <2-12>       view radius in chunks (alias /rd)
/seed
/help
```

## The infinite world

The world is unbounded — there is no edge, only what hasn't streamed in
yet:

- **Terrain** (`src/terrain.js`) — a continent-scale height function:
  very-low-frequency *continentalness* noise separates oceans from
  landmasses (~600-block wavelength); ridged-noise mountain ranges
  (up to y≈90) gated to appear only well inland; rolling hills, detail
  jitter, and basin dips that carve inland lakes. A separate forest
  field clusters trees into woods. Same seed → same planet.
- **Chunk streaming** (`src/world.js`) — 16×16-column chunks generate on
  demand around the player: voxel data one ring beyond the meshes (so
  border exposure checks see real neighbors, including trees spilling
  across), a few chunks per frame, nearest first. Meshes outside the
  ring are dropped; voxel data is cached so edits survive leaving and
  returning. Render distance is adjustable at runtime.
- **Meshing** (`src/mesher.js`) — each chunk renders as ONE
  vertex-colored mesh of only its exposed faces (a single draw call per
  chunk), with per-face colors — grass and snow keep the classic
  bright-top/dirt-side look, and a per-block brightness hash fakes
  texture. Snow packs 3 blocks deep above the snow line so steep slopes
  read white.
- **Trees** (`src/trees.js`) — purely hash-based: any chunk can decide
  independently which neighboring trees reach into it, no ordering or
  state.
- **Fog hides the seam** — fog distance tracks the render distance, so
  the chunk edge always dissolves into haze (and the shader clouds keep
  drawing far beyond it).

## The sky system (`src/sky.js`)

One shader dome + one light rig, driven by `timeOfDay` (a full cycle
takes 4 minutes; `/timescale` changes that):

- **Gradient sky** — day/night vertical gradients blended by sun
  elevation.
- **Sun & moon** — shader discs (the moon has a crescent bite), with a
  warm dusk glow hugging the horizon around the sun's azimuth.
- **Stars** — hashed cells on a slowly rotating sky direction,
  twinkling, fading in at night.
- **Lighting** — one shadow-casting directional light plays the sun by
  day and the moon by night, and the whole shadow rig follows the
  player across the infinite world. Ambient/hemisphere intensities, fog
  color and fog distance track the same cycle and the weather.
- **Lightning** — storms spike a flash uniform that bleeds into the
  sky, the clouds and the ambient light.

## Weather (`src/weather.js`)

A five-state machine — `clear · cloudy · rain · storm · snow` — that
picks a new state every 45–90 s (unless `/weather lock`ed) and *lerps*
every parameter (cloud cover, gloom, fog density, precipitation) so
transitions roll in smoothly. Rain and snow are GPU point sprites
wrapped in a world-anchored box around the camera: rain as vertical
streaks, snow as soft drifting flakes, both dimmed at night.

## Clouds (`src/clouds.js`)

A single large plane at y = 85 that follows the camera. The fragment
shader draws 5-octave fbm value noise, drifting with time and slightly
stretched along the wind. The weather's `cover` parameter slides the
density threshold from scattered cirrus to a solid storm deck, and a
second noise sample toward the sun fakes lit tops / shaded undersides.

## Water (`src/water.js` + per-chunk geometry)

Each chunk's submerged columns become quads with a per-vertex **depth**
attribute, all sharing one shader material:

- **Waves** — vertex displacement from layered sines; the fragment
  shader re-derives the analytic normal and adds fbm ripples (amplified
  while it rains).
- **Color by depth** — turquoise shallows → deep ocean blue, dimming at
  night.
- **Fresnel reflection** — glancing angles reflect the horizon color
  including the dusk glow, so the sea turns orange at sunset.
- **Specular** — a tight sparkle plus a broad lobe that stretches into a
  glitter path when the sun or moon sits low.
- **Foam** — animated noise band over shallow columns (shorelines).

Being underwater switches to dense blue fog plus a screen tint, and
swimming kicks in (slower movement, Space to float up).

## Interaction

- **Targeting** (`src/interact.js`) — an Amanatides & Woo DDA raycast
  walks the voxel grid from the camera; the hit block gets an outline,
  left-click clears it, right-click places the hotbar block against the
  hit face (refused if it would intersect the player). Edits re-mesh
  only the touched chunk (~2-4 ms).
- **Player** (`src/player.js`) — AABB vs voxel collision resolved per
  axis, gravity + jumping, swimming in water columns, fly mode.

## Project layout

```
index.html           HUD/menu/console DOM + styles + import map
src/
├── main.js          entry: wiring, pointer lock, render loop, streaming
├── config.js        constants (chunk size, sea level, day length, player)
├── scene.js         renderer + camera
├── sky.js           sky dome shader, sun/moon/stars, light rig, fog
├── clouds.js        fbm cloud plane
├── water.js         wave/fresnel/foam water shader material
├── weather.js       weather state machine + rain/snow particles
├── terrain.js       unbounded continental height + forest fields
├── blocks.js        block ids, coordinate hash, surface→block rules
├── trees.js         deterministic per-column trees
├── world.js         chunk store: generate / stream / edit / re-mesh
├── mesher.js        chunk → single vertex-colored mesh + water quads
├── player.js        pointer lock, movement, collision, swim/fly
├── interact.js      DDA raycast, dig/place, block highlight
├── console.js       `/` command console
├── hud.js           hotbar, status line
├── menu.js          menu controller + splash text
├── storage.js       localStorage persistence (seed only)
├── random.js        seeded mulberry32 PRNG
└── shaders.js       shared GLSL noise chunk
```

> Block edits live in the in-memory chunk cache — they survive walking
> away and back, but only the seed is saved, so a reload regenerates
> the pristine world.

## Tech stack

- [Three.js](https://threejs.org/) `0.160`
- [simplex-noise](https://github.com/jwagner/simplex-noise.js) `4.0.3`
- Plain ES modules + import maps. No bundler, no `package.json`.
