# Snake 3D: art direction, Neon Dusk enriched

The owner approved this art direction for the next version of the plan. It keeps the theme "Neon Dusk", its palette and every rule of the spec, and raises the scene from a clean board to a small finished indie game. A blind review of the current build said what holds it back: "a tiny snake made of plain spheres", "a distant fixed camera", "a big empty board", "a flat 3D scene", "a generic theme", and dark frames (mean luminance 10 to 17 of 255). Each section below answers one of those.

Colors come only from `THEME.colors` (the palette of Task 5 stays as it is). "×1.6" means the color multiplied so it passes the bloom threshold. Every number is a starting value the shots may tune.

## 1. Light and exposure (Task 12, Task 8)

- `toneMappingExposure` 1.25 (was 1.1).
- `HemisphereLight` intensity 0.9 (was 0.7); key light 2.6 (was 2.4). The rim light stays.
- Target: the play frame's mean luminance between 35 and 70 of 255, with the board's checker readable.

## 2. Camera and presence (Task 8, Task 9)

- `frameCamera` elevation: `lerp(40, 54, clamp01((1 - aspect) / 0.5))` (was 50 to 62), so the horizon and the depth of the scene show. The whole board stays in view with the same NDC rule.
- The snake reads from across the board:
  - body spheres radius 0.46 (was 0.42), studs radius 0.2;
  - **joints:** a second `InstancedMesh` named `'snake-joints'` (same sphere geometry, scale 0.88 of its neighbours' mean, same color rule) at the midpoint between each pair of neighbouring segments, so the body is one continuous tube, not a row of beads;
  - the head ellipsoid scaled ×1.15, with a **visor**: a thin curved band across the front (a `TorusGeometry` arc or a flattened box), `MeshBasicMaterial` in mint ×1.6, so the face glows;
  - a **head light**: a `PointLight` in mint, intensity 3, distance 4, that rides with the head and lights the board around it;
  - a **trail**: a pool of 48 `Points` (additive, no depth write, size 0.22 shrinking to 0) dropped behind the head every 40 ms, cyan, each fading over 0.6 s.
- The food crystal scaled ×1.3, with a **beacon**: a vertical additive cylinder (radius 0.18, height 5, amber, opacity 0.22, open-ended) rising from its cell, and 6 small motes orbiting it at radius 0.55.

## 3. The world beyond the board: `src/render/horizon.js` (a new task)

`createHorizon({ theme, width, height })` returns `{ group, update(timeMs), pulse(kind), dim(k) }`. `group` is a `THREE.Group` named `'horizon'`, created once with everything below; `update` animates; `pulse('eat' | 'level')` starts the effects of section 4; `dim(k)` fades it all to `k` (0 to 1) for game over. It creates no geometry or material after it returns, and builds without a WebGL context. It replaces the plain floor disc of Task 8.

- **The sun:** a disc (`CircleGeometry`, radius 18, 64 segments) at `(0, 7, -70)` facing the board, with a `ShaderMaterial` (no fog, no depth write): a vertical gradient from amber at the bottom to the accent at the top, cut by horizontal gaps in its lower half whose width grows toward the bottom and which scroll down slowly (one gap per 2.5 s). Its colors are ×1.6 so the bloom takes it.
- **The grid floor:** a plane 400 × 400 at y = −0.9 (just under the plinth) with a `ShaderMaterial`: accent lines every 2 units on a background-colored floor, the lines' brightness fading with distance (they reach the horizon), and the lines scrolling toward the camera at 1 unit per second. It replaces the gray disc that showed as a dome.
- **Mountains:** two rings of low-poly ridges (instanced `ConeGeometry` with 4 to 6 sides, heights 6 to 16) at radius 55 to 80, behind and to the sides, dark violet (background ×1.8) with their edges traced in violet ×1.4 (`EdgesGeometry` and `LineSegments`).
- **Floating shapes:** 24 instanced shapes (octahedrons and torus rings) at radius 16 to 30 from the center and y 2 to 10, each turning slowly and bobbing ±0.3, emissive in cyan, violet and accent at intensity 1.4.
- **Sparkles:** 300 `Points` (size 2 pixels, `sizeAttenuation: false`, additive, mint and cyan) drifting up slowly through the volume around the board and wrapping.
- **Beams:** above each corner pylon of Task 8, a tall additive cone (height 12, radius 0.6 to 0.05, accent, opacity 0.16) pulsing between 0.1 and 0.22 over 2 s.

## 4. Effects (Task 9, the horizon, Task 12)

- **Eating:** what Task 9 already does, plus a bloom pulse (strength +0.4 decaying over 250 ms, in `main.js`), the sun's glow +20 % for 300 ms (`pulse('eat')`), and a flash of the food beacon.
- **Levelling up:** a ripple across the grid floor (a ring of brighter lines expanding from the center to radius 60 over 1.2 s, `pulse('level')`) and the sun's glow +40 % for 600 ms.
- **Game over:** what Task 9 already does, plus `dim(0.4)` of the horizon over 0.8 s and the fog color easing toward the accent at 25 %; a new game restores both.

## 5. The HUD (Task 10)

- The title card sits in the lower third of the screen (centered horizontally, its top at about 58 % of the height on desktop), so the snake on its start cell stays visible on the title screen.
- On screens 700 px wide or more, the title fits on one line: `white-space: nowrap`, font size `clamp(30px, 6vw, 52px)`, letter spacing 0.08em.

## 6. Budget

While playing: at most 90 draw calls and 150,000 triangles; pixel ratio at most 2; no allocation per frame.

## 7. What the shots must show

1. **Title:** a synthwave dusk: the striped sun on the horizon, mountains with glowing edges, the grid floor running to the horizon, floating shapes and sparkles; the board in front with glowing rails and beams over the pylons; the dragon-like snake visible above the card; the card in the lower third with the title on one line.
2. **Playing:** a continuous, glossy snake with a glowing visor, its head lighting the board and leaving a cyan trail; the food crystal with its amber beacon; the whole board in view; the frame bright enough to read (mean luminance 35 to 70).
3. **Eating:** sparks, the ring, a bloom pulse and the sun flaring.
4. **Game over:** the scene dimmed and tinted toward pink, the snake dark, the card readable.
5. **Never:** the gray floor dome, a black or blown-out frame, unreadable HUD text, a broken sun shader (a white or black disc), segments that look like separate beads.
