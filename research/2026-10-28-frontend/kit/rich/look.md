# Snake 3D: what the shots must show

The plan is the art direction: theme "Neon Dusk" enriched by `art.md` (Tasks 5, 8, 9, 10, 12 and the horizon task give its colors, shapes, lights, effects and HUD). This page adds no requirement. It is the list to look at the game with: `npm run shots` takes the pictures, and you compare them with it. Where it and a task disagree, the task wins.

Before `src/main.js` exists, `npm run shots` shows a preview of the parts that do (`preview-*.png`): the world, the horizon, the snake view and the HUD, in a fake game. Judge the parts your task owns.

## The pictures

1. **Title** (`desktop-1-title`, `phone-1-title`): a synthwave dusk: the striped sun on the horizon, mountains with glowing violet edges, the grid floor running to the horizon, floating shapes and sparkles; in front, the board as a dark indigo checker on its plinth, inside rails whose top strips glow pink, with beams rising over the four pylons; the snake visible above the title card; the card in the lower third, its title on one line.
2. **Playing** (`desktop-2-play`, `preview-1-scene`): one continuous, glossy snake (no gaps between segments) with a glowing mint visor, its head lighting the board around it and leaving a cyan trail; the amber food crystal with its beacon and orbiting motes; the whole board in view, seen from a lower angle that shows depth and the horizon; the HUD bar readable; the frame bright enough to read (mean luminance about 35 to 70 of 255).
3. **Eating** (`desktop-3-eat`, `preview-2-eat`, `preview-3-after-eat`): amber and gold sparks, the shockwave ring, the bloom pulse, the sun flaring, the swallow bump moving down the body.
4. **Game over** (`desktop-4-over`, `preview-4-over`): the horizon dimmed and the scene tinted toward pink, the snake dark, sparks, and the card with the pink-to-amber title and the Enter hint.
5. **Phone** (`phone-*`): the whole board in view, the HUD in one row, the card at most 86 % of the width, nothing cut off.

## Never

- the gray floor dome of the earlier version;
- a black frame or a blown-out white blob; a sun drawn as a flat white or black disc (a broken shader);
- HUD text that cannot be read over the scene;
- a snake that reads as separate beads, segments that jump between cells, flickering faces;
- something the plan describes that is missing from the picture.
