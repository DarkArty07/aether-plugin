// Seeded random numbers (mulberry32). The state is a 32-bit unsigned integer,
// and every function returns the next state rather than changing one.

export function nextRandom(state) {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = Math.imul(next ^ (next >>> 15), 1 | next)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { value, state: next }
}

export function randomInt(state, n) {
  const r = nextRandom(state)
  return { value: Math.floor(r.value * n), state: r.state }
}
