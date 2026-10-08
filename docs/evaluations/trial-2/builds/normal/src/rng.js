// mulberry32: a small seeded generator. `state` is a 32-bit unsigned integer.

export function nextRandom(state) {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next }
}

export function randomInt(state, n) {
  const r = nextRandom(state)
  return { value: Math.floor(r.value * n), state: r.state }
}
