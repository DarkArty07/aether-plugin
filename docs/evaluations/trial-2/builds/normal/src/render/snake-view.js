// The living things of "Abyssal Bloom": a jelly snake with a lamp for a head, the amber lure it hunts, and the
// effects of a meal and of a crash. Everything is built once in createSnakeView (the meshes in snake-parts.js,
// the particle and ring pools in effects.js); update() only moves things that already exist.
import * as THREE from 'three'
import { CELL, lerp, easeOutCubic, clamp01, bodyColor } from './theme.js'
import { createEffects } from './effects.js'
import { buildBody, buildHead, buildFood, createGlow } from './snake-parts.js'

export const HEADING = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 }

const TAU = Math.PI * 2
const HEAD_Y = 0.5
const HEAD_SCALE = 1.12
const R_NECK = 0.4
const R_TAIL = 0.24
const FLAT = 0.92 // jelly sits a little squat
const FOOD_Y = 0.66
const EAT_SLOTS = 6
const EAT_SECONDS = 1.5
const OVER_SECONDS = 1.7
const SWALLOW_SECONDS = 1.2
const DEAD_LIFE = 0.14 // how much of its glow a dead snake keeps

const _c = new THREE.Color() // scratch

const wrapAngle = (a) => a - TAU * Math.round(a / TAU)
const easeOutBack = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2

function directionOf(from, to) {
  if (to.x !== from.x) return to.x > from.x ? 'right' : 'left'
  return to.y > from.y ? 'down' : 'up'
}

export function createSnakeView({ scene, theme, width, height }) {
  const colors = theme.colors
  const capacity = width * height
  const offsetX = (width - 1) / 2
  const offsetZ = (height - 1) / 2
  const worldX = (x) => (x - offsetX) * CELL
  const worldZ = (y) => (y - offsetZ) * CELL

  // Shared by every glowing material; mutated in place.
  const accent = new THREE.Color(colors.accent)
  const glow = createGlow(colors)

  const root = new THREE.Group()
  root.name = 'snake-view'
  root.userData.uniforms = glow // for tests and debugging
  const { segments, links, end } = buildBody(capacity - 1, glow)
  const { head, eyes, lamp, bead, beadColor } = buildHead(colors, glow)
  const lure = buildFood(colors)
  const fx = createEffects(colors, EAT_SLOTS)
  const headLight = new THREE.PointLight(colors.accent, 0, 7.5, 2)
  headLight.name = 'snake-light'
  root.add(segments, links, head, lure.food, lure.halo, lure.light, headLight, ...fx.objects)
  scene.add(root)

  // What the view last drew (world x, z per node, head first) and the cells before it. Fixed buffers.
  let cur = new Float64Array(capacity * 2)
  let prv = new Float64Array(capacity * 2)
  const pos = new Float64Array(capacity * 2) // interpolated
  const rad = new Float64Array(capacity)
  const ys = new Float64Array(capacity)
  let curN = 0
  let prvN = 0
  let curDir = 'right'
  let prvDir = 'right'
  let snapTicks = null
  let colorN = -1
  let foodX = -1
  let foodY = -1
  let foodPopAt = 0

  // Effects: a few meal slots and one crash. `state` is 0 free, 1 waiting for the next update to give its
  // start time, 2 running, 3 (crash only) finished but the snake stays dead until reset().
  const eats = Array.from({ length: EAT_SLOTS }, () => ({ state: 0, seq: 0, start: 0, x: 0, z: 0 }))
  const over = { state: 0, start: 0 }
  let seq = 0

  function onEat(cell) {
    let slot = eats.find((e) => e.state === 0)
    if (!slot) slot = eats.reduce((a, b) => (a.seq <= b.seq ? a : b)) // full: recycle the oldest
    slot.state = 1
    slot.seq = ++seq
    slot.x = worldX(cell.x)
    slot.z = worldZ(cell.y)
  }

  function onGameOver() {
    over.state = 1
  }

  function activeEffects() {
    let n = over.state === 1 || over.state === 2 ? 1 : 0
    for (const e of eats) if (e.state === 1 || e.state === 2) n++
    return n
  }

  function reset() {
    snapTicks = null
    curN = prvN = 0
    colorN = -1
    foodX = foodY = -1
    for (const e of eats) e.state = 0
    over.state = 0
    glow.uLife.value = 1
    glow.uFlash.value = 0
    fx.clear()
    segments.count = links.count = 0
  }

  // --- the snapshot of cells --------------------------------------------------------------------------

  function load(buffer, snake) {
    for (let i = 0; i < snake.length; i++) {
      buffer[2 * i] = worldX(snake[i].x)
      buffer[2 * i + 1] = worldZ(snake[i].y)
    }
  }

  function sync(game) {
    const snake = game.snake
    const n = Math.min(snake.length, capacity)
    const sameTick = snapTicks === game.ticks
    const moved = sameTick && n > 0 && (n !== curN || cur[0] !== worldX(snake[0].x) || cur[1] !== worldZ(snake[0].y))
    if (snapTicks === null || game.ticks < snapTicks || moved) {
      // First frame, a restart that skipped reset(), or a snake that changed under us: snap, no motion.
      load(cur, snake)
      curN = prvN = n
      prv.set(cur.subarray(0, 2 * n))
      prvDir = game.direction
    } else if (!sameTick) {
      const swap = prv
      prv = cur
      cur = swap
      prvN = curN
      prvDir = curDir
      load(cur, snake)
      curN = n
      if (game.ticks !== snapTicks + 1) {
        // Several ticks in one frame: still animate one cell, as if the last tick were the only one.
        for (let i = 0; i < n; i++) {
          const j = Math.min(i + 1, n - 1)
          prv[2 * i] = cur[2 * j]
          prv[2 * i + 1] = cur[2 * j + 1]
        }
        prvN = n
        prvDir = n > 2 ? directionOf(snake[2], snake[1]) : game.direction
      }
    }
    snapTicks = game.ticks
    curDir = game.direction
  }

  function interpolate(a) {
    for (let i = 0; i < curN; i++) {
      const j = i < prvN ? i : prvN - 1 // a new tail grows out of the old one
      pos[2 * i] = a >= 1 ? cur[2 * i] : lerp(prv[2 * j], cur[2 * i], a)
      pos[2 * i + 1] = a >= 1 ? cur[2 * i + 1] : lerp(prv[2 * j + 1], cur[2 * i + 1], a)
    }
  }

  // --- effects ----------------------------------------------------------------------------------------

  // Effects wait for the first update after their event, because onEat/onGameOver get no clock.
  function startPending(game, a, timeMs) {
    for (const e of eats) {
      if (e.state !== 1) continue
      e.state = 2
      // The view lags a tick behind the rules, so the meal bursts when the head actually arrives.
      e.start = timeMs + (1 - a) * (game.tickMs || 0)
      fx.meal(e.x, e.z, e.start)
    }
    if (over.state === 1) {
      over.state = 2
      over.start = timeMs
      fx.crash(pos, curN, HEAD_Y, timeMs)
    }
  }

  function retire(timeMs) {
    for (const e of eats) if (e.state === 2 && timeMs - e.start >= EAT_SECONDS * 1000) e.state = 0
    if (over.state === 2 && timeMs - over.start >= OVER_SECONDS * 1000) over.state = 3
  }

  // A swallowed meal runs down the body as a bulge, starting at the head.
  function bulge(node, timeMs) {
    let b = 0
    for (const e of eats) {
      if (e.state !== 2) continue
      const age = (timeMs - e.start) / 1000
      if (age < 0 || age > SWALLOW_SECONDS) continue
      const d = node - age * 22
      b += 0.4 * Math.exp(-d * d * 0.3) * (1 - age / SWALLOW_SECONDS)
    }
    return b
  }

  // --- drawing ----------------------------------------------------------------------------------------

  function radiusAt(i, n) {
    const along = n > 2 ? (i - 1) / (n - 2) : 0
    const tip = clamp01((i - (n - 11)) / 10) // the last ten segments taper faster
    const r = lerp(R_NECK, R_TAIL, 0.4 * along + 0.6 * tip)
    return i === n - 1 && n > 2 ? r * 0.82 : r
  }

  // Writes the matrix of a part scaled (sx, sy, sz) and turned `yaw` about y, straight into the instance array.
  function setInstance(mesh, index, x, y, z, yaw, sx, sy, sz) {
    const m = mesh.instanceMatrix.array
    const o = index * 16
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    m[o] = c * sx
    m[o + 1] = 0
    m[o + 2] = -s * sx
    m[o + 3] = 0
    m[o + 4] = 0
    m[o + 5] = sy
    m[o + 6] = 0
    m[o + 7] = 0
    m[o + 8] = s * sz
    m[o + 9] = 0
    m[o + 10] = c * sz
    m[o + 11] = 0
    m[o + 12] = x
    m[o + 13] = y
    m[o + 14] = z
    m[o + 15] = 1
  }

  // Color of node i of n into `_c`: the body gradient, dimming a little toward the tail.
  function nodeColor(i, n) {
    const along = clamp01((i - 1) / Math.max(1, n - 2))
    return _c.setHex(bodyColor(Math.max(1, i), n)).multiplyScalar(1 - 0.25 * along * along)
  }

  function paintColors() {
    for (let i = 1; i < curN; i++) {
      segments.setColorAt(i - 1, nodeColor(i, curN))
      links.setColorAt(i - 1, nodeColor(i - 1, curN))
      nodeColor(i, curN).toArray(end.array, (i - 1) * 4)
    }
    segments.instanceColor.needsUpdate = links.instanceColor.needsUpdate = end.needsUpdate = true
    colorN = curN
  }

  function drawBody(timeMs, life) {
    const n = curN
    if (n !== colorN) paintColors()
    const t = timeMs / 1000
    rad[0] = R_NECK * 1.04
    ys[0] = HEAD_Y
    for (let i = 1; i < n; i++) {
      // A slow swell runs down the body, in step with the glow; a swallowed meal is a bigger bulge.
      rad[i] = radiusAt(i, n) * (1 + 0.035 * life * Math.sin(t * 3.2 - i * 0.84) + bulge(i, timeMs))
      ys[i] = rad[i] * FLAT + 0.02
      setInstance(segments, i - 1, pos[2 * i], ys[i], pos[2 * i + 1], 0, rad[i], rad[i] * FLAT, rad[i])
    }
    for (let k = 0; k < n - 1; k++) {
      const dx = pos[2 * k + 2] - pos[2 * k]
      const dz = pos[2 * k + 3] - pos[2 * k + 1]
      end.array[4 * k + 3] = rad[k + 1] / rad[k]
      setInstance(links, k, pos[2 * k] + dx / 2, (ys[k] + ys[k + 1]) / 2, pos[2 * k + 1] + dz / 2, Math.atan2(dx, dz), rad[k], rad[k] * FLAT, Math.hypot(dx, dz))
    }
    segments.count = links.count = Math.max(0, n - 1)
    segments.instanceMatrix.needsUpdate = links.instanceMatrix.needsUpdate = end.needsUpdate = true
  }

  function drawHead(a, timeMs, life) {
    const t = timeMs / 1000
    const target = HEADING[curDir] ?? 0
    const from = HEADING[prvDir] ?? target
    head.rotation.y = a >= 1 ? target : from + wrapAngle(target - from) * easeOutCubic(clamp01(a / 0.7)) // the shortest way round
    head.position.set(pos[0], HEAD_Y + 0.02 * life * Math.sin(t * 3.4), pos[1])
    head.scale.setScalar(HEAD_SCALE * (1 + bulge(0, timeMs)))
    const blinkPhase = (timeMs % 3700) / 150 // a quick blink every few seconds
    const blink = blinkPhase < 1 ? 0.1 + 0.9 * Math.abs(Math.cos(blinkPhase * Math.PI)) : 1
    eyes.scale.y = blink * life + 0.12 * (1 - life) // a dead snake's eyes close
    lamp.rotation.x = 0.12 * life * Math.sin(t * 2.1) + 0.8 * (1 - life)
    lamp.rotation.z = 0.08 * life * Math.sin(t * 1.7)
    bead.material.color.copy(beadColor).multiplyScalar((0.12 + 0.88 * life) * (0.85 + 0.15 * Math.sin(t * 4.2)))
  }

  function drawFood(game, timeMs) {
    const cell = game.food
    lure.food.visible = lure.halo.visible = cell !== null
    if (cell === null) {
      lure.light.intensity = 0
      foodX = foodY = -1
      return
    }
    if (cell.x !== foodX || cell.y !== foodY) {
      foodX = cell.x
      foodY = cell.y
      foodPopAt = timeMs + 120 // a new lure grows in just after the old one was taken
    }
    const x = worldX(cell.x)
    const z = worldZ(cell.y)
    const t = timeMs / 1000
    const pop = easeOutBack(clamp01((timeMs - foodPopAt) / 420))
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.1)
    lure.food.position.set(x, FOOD_Y + 0.09 * Math.sin(t * 2.2), z)
    lure.food.scale.setScalar(Math.max(pop, 0.0001) * (1 + 0.08 * pulse))
    lure.food.rotation.y = t * 0.9
    lure.orbMaterial.emissiveIntensity = 1.8 + 0.8 * pulse
    lure.spin.rotation.y = t * 1.1
    lure.ring.rotation.x = 1.15 + 0.12 * Math.sin(t * 1.3)
    for (let i = 0; i < lure.motes.length; i++) {
      const angle = t * (1.6 + i * 0.35) + (i * TAU) / 3
      lure.motes[i].position.set(Math.cos(angle) * 0.68, Math.sin(t * 2.3 + i * 2.1) * 0.24, Math.sin(angle) * 0.68)
    }
    lure.halo.position.x = x
    lure.halo.position.z = z
    lure.halo.scale.setScalar(Math.max(pop, 0.0001) * (0.95 + 0.12 * pulse))
    lure.halo.material.opacity = 0.5 + 0.3 * pulse
    lure.light.position.set(x, FOOD_Y + 0.25, z)
    lure.light.intensity = Math.max(pop, 0) * (7 + 3 * pulse)
  }

  function update(game, alpha, timeMs) {
    sync(game)
    // When the game has ended the snake stays where it died, whatever fraction the loop reports.
    const a = game.status === 'over' ? 1 : Number.isFinite(alpha) ? clamp01(alpha) : 1
    interpolate(a)
    if (curN === 0) return
    startPending(game, a, timeMs)

    // The crash drains the glow and flashes the danger color; the snake then stays dim until reset().
    let life = 1
    let flash = 0
    if (over.state >= 2) {
      const age = Math.max(0, (timeMs - over.start) / 1000)
      life = lerp(1, DEAD_LIFE, easeOutCubic(clamp01(age / 1.1)))
      flash = age < 0.8 ? (1 - age / 0.8) ** 1.6 * (0.65 + 0.35 * Math.cos(age * 34)) : 0
    }
    glow.uTime.value = timeMs / 1000
    glow.uLife.value = life
    glow.uFlash.value = flash

    drawBody(timeMs, life)
    drawHead(a, timeMs, life)
    drawFood(game, timeMs)
    headLight.position.set(pos[0], 1.3, pos[1])
    headLight.intensity = 2 * (0.15 + 0.85 * life)
    headLight.color.copy(accent).lerp(glow.uDanger.value, flash)

    fx.step(timeMs)
    retire(timeMs)
  }

  function segmentPositions() {
    const list = []
    for (let i = 1; i < curN; i++) list.push({ x: pos[2 * i], z: pos[2 * i + 1] })
    return list
  }

  function dispose() {
    scene.remove(root)
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.isInstancedMesh) o.dispose()
      for (const m of [].concat(o.material ?? [])) {
        m.map?.dispose()
        m.dispose()
      }
    })
  }

  return { update, segmentPositions, onEat, onGameOver, activeEffects, reset, dispose }
}
