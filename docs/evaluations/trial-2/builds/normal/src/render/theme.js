// Art direction: "Abyssal Bloom", a bioluminescent night aquarium. Mood: calm, deep and a little
// magical. The board is a dark teal seafloor under cold moonlight; background and fog are nearly
// the same abyssal navy, so the far edges of the board dissolve into the deep. Only living things
// glow. Snake: glossy jelly skin with an emissive core; a pale white-aqua lamp for a head, then
// teal fading through azure to violet, the tail dimming into the dark. Food: a warm amber lure
// (anglerfish orb) that bobs and pulses over a soft halo, the only warm hue in the scene.
// Eat: a burst of pale gold plankton sparks that drift up like bubbles, plus a quick ring pulse.
// Game over: the glow drains, the snake flashes `danger` and bursts into bubbles, the scene dims.
// HUD: quiet glass panels, no hard borders; pale-ice text with aqua accents and tabular numerals,
// in a rounded sans stack such as "Trebuchet MS", "Segoe UI", system-ui, sans-serif.

export const CELL = 1

export const THEME = Object.freeze({
  name: 'Abyssal Bloom',
  colors: Object.freeze({
    background: 0x050e1b, // abyssal navy behind everything
    fog: 0x071626, // a hair lighter than the background, so the horizon haze reads
    board: 0x0c2a3e, // dark teal seafloor
    boardAlt: 0x103449, // checker twin, only just lighter so the snake stays the hero
    wall: 0x234f6b, // reef rock, lighter than the floor but never emissive
    snakeHead: 0xe6fffd, // white-aqua lamp
    snakeBody: 0x12c8c0, // bioluminescent teal
    snakeTail: 0x8a6dff, // violet, still above 3.5:1 against both floor tones
    food: 0xffa63d, // warm amber lure
    particle: 0xffe7a3, // pale gold plankton sparks
    accent: 0x46e4ff, // cyan for HUD highlights and trim lights
    keyLight: 0xcfeaff, // cold moonlight from above, casts the shadows
    sky: 0x2b7fae, // hemisphere light, upper color
    ground: 0x07182a, // hemisphere light, lower color
    hudText: 0xe3f6ff, // pale ice text
    hudPanel: 0x071a2c, // glass panel tint, use with partial opacity
    danger: 0xff4f5e, // game-over flash and warnings
  }),
  // Emissive accents (threshold 0.7) bloom; the lit board and walls stay below it.
  bloom: Object.freeze({ strength: 0.8, radius: 0.5, threshold: 0.7 }),
})

// Cell (x, y) of a width x height grid to the world; the grid's y is the world's z.
export function gridToWorld(x, y, width, height) {
  return {
    x: (x - (width - 1) / 2) * CELL,
    z: (y - (height - 1) / 2) * CELL,
  }
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}

export function easeOutCubic(t) {
  const rest = 1 - t
  return 1 - rest * rest * rest
}

export function clamp01(t) {
  return Math.min(1, Math.max(0, t))
}

// Color of segment `index` of a snake `length` long: snakeBody at index 1 (behind the head)
// down to snakeTail at the last segment. The head (index 0) uses snakeHead, not this.
export function bodyColor(index, length) {
  const { snakeBody, snakeTail } = THEME.colors
  if (length <= 2) return snakeBody
  const t = clamp01((index - 1) / (length - 2))
  let color = 0
  for (const shift of [16, 8, 0]) {
    const from = (snakeBody >> shift) & 0xff
    const to = (snakeTail >> shift) & 0xff
    color |= Math.round(lerp(from, to, t)) << shift
  }
  return color
}
