# Aether visual identity (decided with the owner on 2026-10-22)

**One sentence:** a classical pantheon seen on a 90s computer: marble statues and violet nebulae, drawn in soft pixels, in Catppuccin Mocha, with Clawd as the protagonist.

This file is local (`assets/brand/` is git-excluded). The owner approved each theme below in his own words; do not add themes and do not bring back the ones that are out.

## What is in

1. **Classical statues and marble.** Busts, statues, Doric columns, pedestals, temple fragments, steps, the Greek key (meander) as a border or a floor. It is the owner's mark as a developer. Marble is the light end of the violet ramp (lavender to white), its shadows are violet.
2. **Cosmos and nebulae, in violet.** Stars, nebulae made with Bayer dither, planets with rings, comets, constellation lines. It is Aether's identity: the world is a cosmic temple.
3. **90s computers and old technology** (the retrofuturism he likes). Beige tower and CRT monitors (flamingo/rosewater plastic, dark screen, lavender text), 3.5-inch floppy disks, CDs, windows with a title bar and three boxes, dialogs with OK and Cancel, the mouse arrow, the hourglass, progress bars, keyboards, a dithered look. A synthwave grid is allowed, never required.
4. **Pixel art**, any pixel art; it does **not** need to be arcade (no scores, lives, game-over, hostile invaders).
5. **Catppuccin Mocha**, with purple as the development seal. `kit.px.js` already maps the old letters to it (Clawd's orange `o` is the one warm hue; amber `O` warns, red `u` fails, green `j`/`t` is OK).
6. **Clawd** (orange, Claude Code's mascot) and the subagent crabs (green `t`, blue `b`, pink `h`: light, medium and strong tier) as his family.

## What is out

City skylines and anything urban or industrial: conveyor belts, pipes, factories, shelves, wooden desks and floors, typewriters, vault wheels. Arcade trappings. Glossy gradients and photographic detail inside pixel scenes. Any hue that is not Mocha or a violet from the ramp.

## Palette

Mocha: crust `#11111b`, mantle `#181825`, base `#1e1e2e`, surface0 `#313244`, surface1 `#45475a`, surface2 `#585b70`, overlay0 `#6c7086`, overlay1 `#7f849c`, overlay2 `#9399b2`, subtext0 `#a6adc8`, subtext1 `#bac2de`, text `#cdd6f4`, lavender `#b4befe`, blue `#89b4fa`, sapphire `#74c7ec`, sky `#89dceb`, teal `#94e2d5`, green `#a6e3a1`, yellow `#f9e2af`, peach `#fab387`, maroon `#eba0ac`, red `#f38ba8`, mauve `#cba6f7`, pink `#f5c2e7`, flamingo `#f2cdcd`, rosewater `#f5e0dc`. The landing's violets: ink `#0d0b1c`, `#1e1b3a`, `#4a3a8a`, `#8466d6`, paper `#e6dcff`. Violet ramp for nebulae and marble shadows: `#0b0a16 #1e1b3a #4a3a8a #8466d6 #cba6f7 #f3eaff`.

## Plates (the generated images)

They keep being generated with `aether-router img gen` and `img edit`, then softened so they share the pixel scale of the GIFs: cell 4 px, Bayer 4x4, a 0.7 px blur, no sharpening, the six violet stops (`/tmp` copy of the script: `plate-variants.js`; the original builder is `source/landing_images.js` in the main checkout). Sharper than that reads as a photo, blurrier (3 tones) loses the face.

## Animations: re-theme, do not reinvent

Keep each animation's **idea, story beats, timings, frame count, fps, canvas, HUD text and loop**. Replace the **scenery, props and sprites** with the vocabulary above. Start from the existing source (the pre-change copy is in `assets/brand/gifs-v1/`) and edit it; do not start from a blank file.

| Old | New |
|---|---|
| city skyline, buildings | nebula sky, distant temple ruins, floating columns, a planet with rings |
| conveyor belt, road, rail | marble stylobate or steps, Greek key frieze, a constellation line |
| pipes, chute, hopper | a marble channel between columns, cables of a 90s computer |
| cards, crates, packets | floppy disks, sealed scrolls, small windows |
| laptop, typewriter | beige 90s tower and CRT, keyboard |
| wooden desk, shelf | marble pedestal, ledge or plinth |
| vault with wheel | sealed stone niche with a wax seal, or a sarcophagus |
| piggy bank | amphora filling with coins |
| shield, badge | laurel wreath seal |
| buttons YES / LATER | a 90s dialog with OK style buttons and the mouse arrow |

Per animation:

- **control**: the gate is a marble portico (two Doric columns and a lintel) with the lamp as keystone; floppy disks marked PUSH, MERGE, DEPLOY wait; the YES is a 90s dialog; a bust on a pedestal watches. Sky: nebula, no city.
- **lanes**: the four lanes are four 90s computers (AGY, GROK, CODEX, CLAUDE; Muse is not drawn yet) on a colonnade with quota bars on their screens; the cards are floppy disks; the hopper is a marble channel.
- **equipo**: Clawd as the Lead; the Writer at a 90s computer; the Judge with a blindfolded bust and the stamp on a marble block; the Examiner with a sealed scroll in a stone niche; the crabs on a cornice; temple floor, stars behind.
- **goal_fast, goal_auto, goal_deleg, goal_cheap, goal_robust, radar, install, flujo, path_*, lost**: same rules, applied per the table.
