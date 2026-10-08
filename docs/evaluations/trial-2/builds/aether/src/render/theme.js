// Theme "Midnight Neon": a dark, glassy arcade night. A near-black indigo
// board lit by a glowing mint-green snake and a hot coral-pink food orb,
// with cyan accents and a gentle bloom. Pure module: no three.js import.

export const CELL = 1

export const THEME = {
  name: 'Midnight Neon',
  colors: {
    background: 0x07071a,
    fog: 0x0a0a24,
    board: 0x14163a,
    boardAlt: 0x1a1d4a,
    wall: 0x3a2f8f,
    snakeHead: 0xb6ffe0,
    snakeBody: 0x2bf0a0,
    snakeTail: 0x0a8f7a,
    food: 0xff3d7f,
    particle: 0xffd166,
    accent: 0x4de1ff,
  },
  bloom: { strength: 0.85, radius: 0.5, threshold: 0.35 },
}

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
  const u = 1 - t
  return 1 - u * u * u
}

export function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

// Color for the body segment at `index` of a snake `length` long: snakeBody at
// index 1, fading to snakeTail at index length - 1 (RGB interpolation).
export function bodyColor(index, length) {
  const { snakeBody, snakeTail } = THEME.colors
  const span = length - 2
  const t = span <= 0 ? 0 : clamp01((index - 1) / span)
  let out = 0
  for (const shift of [16, 8, 0]) {
    const a = (snakeBody >> shift) & 0xff
    const b = (snakeTail >> shift) & 0xff
    out |= Math.round(lerp(a, b, t)) << shift
  }
  return out
}
