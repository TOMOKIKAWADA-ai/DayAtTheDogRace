# Agent Handoff Notes

This repo is a Three.js + Vite top-down racing game. The user usually writes in Japanese.

## Current Worktree State

- There are many intentional, uncommitted changes from this chat. Do not revert them unless the user explicitly asks.
- `texture-check.png` is an untracked QA artifact from earlier visual checks. Do not delete it without asking.
- Local dev URL: `http://127.0.0.1:5173/`.
- In this environment, `npm.cmd run build` may need elevated permission because child process spawning can be blocked.
- Build currently succeeds. Vite prints the known warning `Some chunks are larger than 500 kB`.

## Main Gameplay Changes

- Course:
  - `src/game/track.js` has a longer `CENTER_POINTS` route.
  - Start/finish area is straighter than before.
  - Start/finish line is a single textured quad to avoid flickering.
  - Start/finish texture: `/assets/ui/start-finish-line.png?v=2`.
  - The start/finish material uses PNG alpha (`transparent: true`) so the road shows through transparent areas.
- Race rules:
  - `RACE_LAPS = 3` in `src/game/RacingGame.js`.
  - Race start uses a 3-second countdown. `raceStarted` remains false until `GO`, and race/lap timers are reset at release.
  - Pause is available during countdown and active racing. Keyboard `P` or `Esc`, PS5 `OPTIONS`, and the on-screen pause button toggle it. Race/lap timers are offset by paused duration.
  - Player road max speed is `PLAYER_ROAD_MAX_SPEED = 54`.
  - Rival max speed is `OPPONENT_MAX_SPEED = 0.064`.
  - There are 3 rival cars (`OPPONENT_COUNT = 3`).
  - `OPPONENT_STARTS` places the front rival on the start/finish line and staggers the rest behind it. The player starts behind all rivals.
- Slipstream:
  - Implemented in `getSlipstreamStrength()` in `src/game/RacingGame.js`.
  - Only applies on road, at enough speed, behind a rival, and on straights or mild curves.
  - Does not apply while braking or reversing.
- Vehicle selection:
  - Vehicle list has 4 selectable cars.
  - `CAR 004` uses `public/assets/models/car-4.glb`.
  - Car selection cards show side-view thumbnails from `public/assets/ui/cars/`.
  - Player/opponent roots stay hidden until car selection finishes, so the blue dummy car is not visible on the selection screen.
  - Course map rival markers are generated from `OPPONENT_COUNT`.
- Controller input:
  - `src/game/RacingGame.js` reads browser Gamepad API every frame.
  - DualSense/PS5 mapping: left stick or D-pad steers, R2 or Cross accelerates, L2/Circle/Square brakes or reverses, R1 or Triangle uses nitro.
  - On menus, D-pad or left stick changes car selection, Cross selects, and Cross or Options restarts from the finish screen.

## Road Lines

- Road lines are no longer small box meshes. They are transparent PNG textures on continuous strip geometry.
- Relevant code is in `src/game/track.js`:
  - `createRoadLineMaterial()`
  - `createRoadLineStripGeometry()`
  - `addHighwayLines()`
- Current texture URLs:
  - Yellow center line: `/assets/ui/roadline-center-spaced.png?v=3`
  - White side line: `/assets/ui/roadline-white.png?v=4`
- White lines use `RepeatWrapping` so the pattern does not break around the course.
- Current line sizing:
  - `centerPatchWidth = 0.72`
  - `edgePatchWidth = 2.95`
  - Center pattern length is `4.2`
  - White pattern length is `2.9`

## Visual / Asset Changes

- Terrain:
  - Sand background is brighter.
  - Road/sand contrast and edge transition are softer.
- Scenery:
  - Old procedural rocks/cacti were removed.
  - GLB scenery assets were copied into `public/assets/models/scenery/`.
  - `ASSETS.models.scenery` in `src/game/config.js` references them.
  - `COURSE_SCENERY_COUNT = 84` places scenery densely around the course.
- Tumbleweed:
  - Tumbleweeds bounce, roll, and skitter sideways while moving.
- UI font:
  - English UI uses `Chunk Five Print`.
  - Font asset: `public/assets/fonts/chunk-five-print.otf`.
  - CSS setup: `@font-face` and `--ui-font` in `src/styles.css`.
- Gauges:
  - Speedometer background: `/assets/ui/speedometer-background.png?v=2`.
  - Nitro background: `/assets/ui/nitro-background.png?v=2`.
  - Gauge images were processed so the opaque circular part is centered in the canvas.
  - If regenerating these images, keep the opaque circle centered and bump the cache query string.

## Added Assets

- `public/assets/fonts/chunk-five-print.otf`
- `public/assets/models/scenery/cactus_01.glb`
- `public/assets/models/scenery/cactus_02.glb`
- `public/assets/models/scenery/plants_01.glb`
- `public/assets/models/scenery/plants_02.glb`
- `public/assets/models/scenery/stone_01.glb`
- `public/assets/models/scenery/stone_02.glb`
- `public/assets/models/scenery/stone_03.glb`
- `public/assets/models/car-4.glb`
- `public/assets/ui/speedometer-background.png`
- `public/assets/ui/nitro-background.png`
- `public/assets/ui/roadline-white.png`
- `public/assets/ui/roadline-center.png`
- `public/assets/ui/roadline-center-spaced.png`
- `public/assets/ui/start-finish-line.png`
- `public/assets/ui/cars/car-001-side.png`
- `public/assets/ui/cars/car-002-side.png`
- `public/assets/ui/cars/car-003-side.png`
- `public/assets/ui/cars/car-004-side.png`

## Useful Checks

```powershell
node --check src\game\RacingGame.js
node --check src\game\track.js
npm.cmd run build
(Invoke-WebRequest -Uri http://127.0.0.1:5173/ -UseBasicParsing -TimeoutSec 10).StatusCode
```

When replacing images, update the `?v=N` cache-busting query in CSS or JS so the in-app browser shows the new asset.
