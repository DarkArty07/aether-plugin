# Snake 3D: what the shots must show

The plan is the art direction: theme "Neon Dusk" (Tasks 5, 8, 9, 10 and 12 give its colors, shapes, lights, effects and HUD). This page adds no requirement. It is the list to look at the game with: `npm run shots` takes the pictures, and you compare them with it. Where it and a task disagree, the task wins.

Before `src/main.js` exists, `npm run shots` shows a preview of the parts that do (`preview-*.png`): the world, the snake view and the HUD, in a fake game. Judge the parts your task owns.

## The pictures

1. **Title** (`desktop-1-title`, `phone-1-title`): a deep indigo night (`#07061a`) with a starfield of white, cyan and pink points; the board as a dark indigo checker with faint pink grid lines, on a plinth, inside wall rails whose top strips glow pink, with four glowing corner pylons; the mint head with white eyes and the cyan-to-violet body; the amber crystal food glowing and lighting the board around it; the title card: dark glass, a pink border, a mint-to-pink gradient title, a readable hint.
2. **Playing** (`desktop-2-play`, `preview-1-scene`): the body reads as one continuous chain of glossy spheres tapering from the neck to the tail, with glowing studs; the head is distinct; the whole board and its walls are in view, seen from above at an angle; the HUD bar shows the score on the left, the best and the level on the right, readable over the scene.
3. **Eating** (`desktop-3-eat`, `preview-2-eat`, `preview-3-after-eat`): amber and gold sparks rising from the cell, a shockwave ring on the board, the swallow bump moving down the body.
4. **Game over** (`desktop-4-over`, `preview-4-over`): the body and studs dimmed, sparks from the snake, and the card with the pink-to-amber title and the Enter hint.
5. **Phone** (`phone-*`): the whole board in view, the HUD in one row, the card at most 86 % of the width, nothing cut off.

## Never

- a black frame, or a flat gray or default background;
- a white blown-out blob where bloom swallows the shapes;
- HUD text that cannot be read over the scene;
- shapes without shading, flickering or overlapping faces on the board, or segments that jump between cells;
- something the plan describes that is missing from the picture (the studs, the ring, the pylons' caps, the tongue).
