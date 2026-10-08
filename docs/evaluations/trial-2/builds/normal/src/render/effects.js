// The fixed pools behind the snake view's effects: soft sparks and bubbles (one THREE.Points each) and
// flat pulse rings on the board. Everything is built once; a frame only rewrites typed arrays and a few
// numbers, so nothing is created while the game runs. A pool that is full recycles its oldest entry.
import * as THREE from 'three'
import { clamp01, easeOutCubic, lerp } from './theme.js'
import { nextRandom } from '../rng.js'

// A white RGBA texture whose alpha is alphaAt(u, v), with u and v in [-1, 1]. It is a DataTexture, not a
// canvas, so it also builds in Node (the tests have no DOM).
function radialTexture(size, alphaAt) {
  const data = new Uint8Array(size * size * 4).fill(255)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = ((i + 0.5) / size) * 2 - 1
      const v = ((j + 0.5) / size) * 2 - 1
      data[(j * size + i) * 4 + 3] = Math.round(255 * clamp01(alphaAt(u, v)))
    }
  }
  const texture = new THREE.DataTexture(data, size, size)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

const TEXTURES = {
  // A hot core, a soft glow and a faint four-point star, so a plankton spark twinkles.
  spark: (u, v) => {
    const r = Math.hypot(u, v)
    const arms = Math.exp(-Math.abs(v) * 20) * (1 - Math.abs(u)) ** 3 + Math.exp(-Math.abs(u) * 20) * (1 - Math.abs(v)) ** 3
    return Math.max(0, 1 - r) ** 2.4 + 0.55 * arms
  },
  // A thin bright rim, a faint body and a glint in the upper left.
  bubble: (u, v) => {
    const r = Math.hypot(u, v)
    const rim = Math.exp(-(((r - 0.82) / 0.07) ** 2)) * (0.6 + 0.4 * clamp01(-(u + v) * 0.8 + 0.4))
    const glint = Math.exp(-((u + 0.38) ** 2 + (v + 0.38) ** 2) / 0.012)
    return (r < 1 ? 0.1 * (1 - r * r) : 0) + 0.85 * rim + 0.9 * glint
  },
  // The pool of light under the lure.
  halo: (u, v) => Math.max(0, 1 - Math.hypot(u, v)) ** 1.9,
}

export const makeTexture = (kind, size = 64) => radialTexture(size, TEXTURES[kind])

// Per-particle simulation state, one stride per particle in a single Float32Array.
const O = 0 // origin x, y, z
const V = 3 // initial velocity x, y, z
const LIFE = 6
const DRAG = 7
const RISE = 8 // steady upward drift, in units per second
const SWAY = 9
const PHASE = 10
const SIZE = 11
const RGB = 12 // peak color, may exceed 1 so a spark blooms
const TWINKLE = 15
const STRIDE = 16

export function createParticles({ name, count, texture }) {
  const position = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const color = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const size = new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', position)
  geometry.setAttribute('color', color)
  geometry.setAttribute('aSize', size)

  const material = new THREE.PointsMaterial({
    map: texture,
    size: 1,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  // PointsMaterial has one size; the per-particle size rides in an attribute.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSize;')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;')
  }
  material.customProgramCacheKey = () => 'snake-particles'

  const points = new THREE.Points(geometry, material)
  points.name = name
  points.frustumCulled = false // positions are rewritten every frame, so a fixed bounding sphere would lie
  points.renderOrder = 4

  const sim = new Float32Array(count * STRIDE)
  const born = new Float64Array(count) // ms
  const alive = new Uint8Array(count)
  let cursor = 0
  let live = 0
  let dirty = false

  return {
    points,
    // Starts a particle at `at` ms (a future time is fine: it waits, invisible). The oldest is recycled when full.
    emit(p) {
      const i = cursor
      cursor = (cursor + 1) % count
      const s = i * STRIDE
      sim[s + O] = p.x
      sim[s + O + 1] = p.y
      sim[s + O + 2] = p.z
      sim[s + V] = p.vx
      sim[s + V + 1] = p.vy
      sim[s + V + 2] = p.vz
      sim[s + LIFE] = p.life
      sim[s + DRAG] = p.drag
      sim[s + RISE] = p.rise
      sim[s + SWAY] = p.sway
      sim[s + PHASE] = p.phase
      sim[s + SIZE] = p.size
      sim[s + RGB] = p.r
      sim[s + RGB + 1] = p.g
      sim[s + RGB + 2] = p.b
      sim[s + TWINKLE] = p.twinkle
      born[i] = p.at
      alive[i] = 1
      dirty = true
    },
    step(timeMs) {
      if (live === 0 && !dirty) return
      live = 0
      for (let i = 0; i < count; i++) {
        if (!alive[i]) continue
        const s = i * STRIDE
        const age = (timeMs - born[i]) / 1000
        if (age < 0) {
          size.array[i] = 0 // not its moment yet
          live++
          continue
        }
        const life = sim[s + LIFE]
        if (age >= life) {
          alive[i] = 0
          size.array[i] = 0
          color.array[i * 3] = color.array[i * 3 + 1] = color.array[i * 3 + 2] = 0
          continue
        }
        live++
        const p = age / life
        // Velocity decays with drag, so a spark flies out and then hangs and drifts up like a bubble.
        const k = sim[s + DRAG]
        const travel = (1 - Math.exp(-k * age)) / k
        const sway = sim[s + SWAY] * Math.sqrt(age)
        const phase = sim[s + PHASE]
        position.array[i * 3] = sim[s + O] + sim[s + V] * travel + Math.sin(age * 5 + phase) * sway
        position.array[i * 3 + 1] = sim[s + O + 1] + sim[s + V + 1] * travel + sim[s + RISE] * age
        position.array[i * 3 + 2] = sim[s + O + 2] + sim[s + V + 2] * travel + Math.cos(age * 4.3 + phase) * sway
        const tw = sim[s + TWINKLE]
        const fade = clamp01(age * 18) * (1 - p) ** 1.4 * (1 - tw + tw * (0.55 + 0.45 * Math.sin(age * 30 + phase)))
        color.array[i * 3] = sim[s + RGB] * fade
        color.array[i * 3 + 1] = sim[s + RGB + 1] * fade
        color.array[i * 3 + 2] = sim[s + RGB + 2] * fade
        size.array[i] = sim[s + SIZE] * clamp01(age * 10) * (1 - 0.5 * p * p)
      }
      position.needsUpdate = color.needsUpdate = size.needsUpdate = true
      dirty = live > 0 // one more pass has just blanked the last of them
    },
    clear() {
      alive.fill(0)
      color.array.fill(0)
      size.array.fill(0)
      live = 0
      dirty = true
      position.needsUpdate = color.needsUpdate = size.needsUpdate = true
    },
  }
}

// Flat rings that swell out across the board and fade: the "pulse" under a meal or a crash.
export function createRings({ name, count }) {
  const geometry = new THREE.RingGeometry(0.9, 1, 72).rotateX(-Math.PI / 2)
  const group = new THREE.Group()
  group.name = name
  const rings = Array.from({ length: count }, () => {
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.visible = false
    mesh.renderOrder = 3
    group.add(mesh)
    return { mesh, alive: false, born: 0, life: 1, from: 0, to: 1 }
  })
  let cursor = 0

  return {
    group,
    // `at` is in ms and may be in the future. `color` is a THREE.Color, already scaled to bloom if wanted.
    start({ x, z, at, color, from, to, life }) {
      const ring = rings[cursor]
      cursor = (cursor + 1) % count
      ring.alive = true
      ring.born = at
      ring.life = life
      ring.from = from
      ring.to = to
      ring.mesh.material.color.copy(color)
      ring.mesh.position.set(x, 0.03, z)
      ring.mesh.visible = false
    },
    step(timeMs) {
      for (const ring of rings) {
        if (!ring.alive) continue
        const age = (timeMs - ring.born) / 1000
        if (age < 0) continue
        const p = age / ring.life
        if (p >= 1) {
          ring.alive = false
          ring.mesh.visible = false
          continue
        }
        const scale = lerp(ring.from, ring.to, easeOutCubic(p))
        ring.mesh.scale.set(scale, 1, scale)
        ring.mesh.material.opacity = 0.95 * clamp01(age * 30) * (1 - p) ** 1.5
        ring.mesh.visible = true
      }
    },
    clear() {
      for (const ring of rings) {
        ring.alive = false
        ring.mesh.visible = false
      }
    },
  }
}

const TAU = Math.PI * 2
const SPARKS = 40 // per meal
const CRASH_SPARKS = 20
const BUBBLES = 56
const _c = new THREE.Color()

// Everything the snake view throws off: plankton sparks and two pulse rings per meal, and a crash's bubbles,
// danger sparks and shockwave. `meals` is how many meals may be live at once; the oldest is recycled after that.
// Every time is in ms and may be in the future; emission is random but seeded, so a run always looks the same.
export function createEffects(colors, meals) {
  const sparks = createParticles({ name: 'eat-sparks', count: meals * SPARKS + CRASH_SPARKS, texture: makeTexture('spark') })
  const bubbles = createParticles({ name: 'game-over-bubbles', count: BUBBLES, texture: makeTexture('bubble') })
  const rings = createRings({ name: 'pulse-rings', count: meals * 2 + 1 })
  let random = 0x5eed
  const rand = () => {
    const r = nextRandom(random)
    random = r.state
    return r.value
  }

  return {
    objects: [sparks.points, bubbles.points, rings.group],
    // A burst of pale gold sparks that fly out, hang and drift up, with two rings swelling under them.
    meal(x, z, at) {
      _c.set(colors.particle)
      for (let k = 0; k < SPARKS; k++) {
        const angle = rand() * TAU
        const speed = 2 + rand() * 3
        const lift = 0.25 + rand()
        const gain = (0.9 + rand() * 0.9) * 1.6
        sparks.emit({
          x, y: 0.5, z,
          vx: Math.cos(angle) * Math.cos(lift) * speed,
          vy: Math.sin(lift) * speed + 0.5,
          vz: Math.sin(angle) * Math.cos(lift) * speed,
          at, life: 0.8 + rand() * 0.6, size: 0.4 + rand() * rand() * 0.8, r: _c.r * gain, g: _c.g * gain, b: _c.b * gain,
          drag: 1 + rand(), rise: 0.5 + rand() * 0.6, sway: 0.06 + rand() * 0.14, phase: rand() * TAU, twinkle: 0.6,
        })
      }
      rings.start({ x, z, at, color: _c.set(colors.particle).multiplyScalar(2.6), from: 0.3, to: 2, life: 0.7 })
      rings.start({ x, z, at: at + 90, color: _c.set(colors.particle).multiplyScalar(1.8), from: 0.2, to: 1.3, life: 0.6 })
    },
    // The snake bursts into bubbles along its length (`nodes` holds x, z pairs, head first), the head throws red
    // sparks and a red ring sweeps across the board.
    crash(nodes, count, headY, at) {
      for (let k = 0; k < BUBBLES; k++) {
        const node = Math.min(count - 1, Math.floor(rand() * count))
        _c.set(rand() < 0.3 ? colors.danger : colors.snakeHead).multiplyScalar(1.5)
        bubbles.emit({
          x: nodes[2 * node] + (rand() - 0.5) * 0.4, y: 0.25 + rand() * 0.4, z: nodes[2 * node + 1] + (rand() - 0.5) * 0.4,
          vx: (rand() - 0.5) * 0.6, vy: 0.2, vz: (rand() - 0.5) * 0.6,
          at: at + rand() * 300, life: 0.9 + rand() * 0.35, size: 0.36 + rand() * 0.34, r: _c.r, g: _c.g, b: _c.b,
          drag: 1.2, rise: 0.9 + rand() * 0.9, sway: 0.1 + rand() * 0.12, phase: rand() * TAU, twinkle: 0,
        })
      }
      _c.set(colors.danger).multiplyScalar(2)
      for (let k = 0; k < CRASH_SPARKS; k++) {
        const angle = rand() * TAU
        const speed = 1.5 + rand() * 2
        sparks.emit({
          x: nodes[0], y: headY, z: nodes[1], vx: Math.cos(angle) * speed, vy: 0.5 + rand() * 1.5, vz: Math.sin(angle) * speed,
          at, life: 0.5 + rand() * 0.4, size: 0.14 + rand() * 0.2, r: _c.r, g: _c.g, b: _c.b,
          drag: 3, rise: 0.3, sway: 0.05, phase: rand() * TAU, twinkle: 0.5,
        })
      }
      rings.start({ x: nodes[0], z: nodes[1], at, color: _c.set(colors.danger).multiplyScalar(1.7), from: 0.4, to: 3.4, life: 0.85 })
    },
    step(timeMs) {
      sparks.step(timeMs)
      bubbles.step(timeMs)
      rings.step(timeMs)
    },
    clear() {
      sparks.clear()
      bubbles.clear()
      rings.clear()
    },
  }
}
