// The snake, the food and the effects. Positions interpolate between the
// previous tick's cells and the current ones; the body is one InstancedMesh and
// the particles another, so nothing allocates geometry or materials per frame.
import * as THREE from 'three'
import { CELL, bodyColor, clamp01, easeOutCubic, gridToWorld, lerp } from './theme.js'

export const HEADING = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 }

const MAX_PARTICLES = 256
const EAT = { count: 18, duration: 1000 }
const OVER = { count: 40, duration: 1800 }
const GRAVITY = 6
const TWO_PI = Math.PI * 2

// Shortest signed angle from a to b.
function angleDelta(a, b) {
  let d = (b - a) % TWO_PI
  if (d > Math.PI) d -= TWO_PI
  if (d < -Math.PI) d += TWO_PI
  return d
}

export function createSnakeView({ scene, theme, width, height }) {
  const colors = theme.colors
  const group = new THREE.Group()
  group.name = 'snake-view'
  scene.add(group)

  const geometries = []
  const materials = []
  const track = (list, item) => (list.push(item), item)

  // Head: a rounded body with two eyes, modeled facing +Z.
  const head = new THREE.Group()
  head.name = 'snake-head'
  const headMaterial = track(materials, new THREE.MeshStandardMaterial({
    color: colors.snakeHead, emissive: colors.snakeHead, emissiveIntensity: 0.35, roughness: 0.3,
  }))
  const eyeMaterial = track(materials, new THREE.MeshBasicMaterial({ color: colors.background }))
  const headMesh = new THREE.Mesh(track(geometries, new THREE.BoxGeometry(0.86 * CELL, 0.7 * CELL, 0.9 * CELL)), headMaterial)
  headMesh.position.y = 0.4 * CELL
  headMesh.castShadow = true
  head.add(headMesh)
  const eyeGeometry = track(geometries, new THREE.SphereGeometry(0.1 * CELL, 10, 8))
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial)
    eye.position.set(side * 0.24 * CELL, 0.55 * CELL, 0.36 * CELL)
    head.add(eye)
  }
  group.add(head)

  // Body: instanced rounded cubes, colored from neck to tail.
  const bodyMaterial = track(materials, new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: colors.snakeBody, emissiveIntensity: 0.15 }))
  const bodyMesh = new THREE.InstancedMesh(
    track(geometries, new THREE.BoxGeometry(0.78 * CELL, 0.6 * CELL, 0.78 * CELL)),
    bodyMaterial,
    width * height,
  )
  bodyMesh.name = 'snake-body'
  bodyMesh.count = 0
  bodyMesh.castShadow = true
  bodyMesh.frustumCulled = false
  group.add(bodyMesh)

  // Food: a glowing orb with a ring, bobbing, spinning and pulsing.
  const food = new THREE.Group()
  food.name = 'food'
  const foodMaterial = track(materials, new THREE.MeshStandardMaterial({
    color: colors.food, emissive: colors.food, emissiveIntensity: 0.8, roughness: 0.2,
  }))
  const orb = new THREE.Mesh(track(geometries, new THREE.IcosahedronGeometry(0.32 * CELL, 1)), foodMaterial)
  orb.castShadow = true
  const ringMaterial = track(materials, new THREE.MeshBasicMaterial({ color: colors.accent }))
  const ring = new THREE.Mesh(track(geometries, new THREE.TorusGeometry(0.45 * CELL, 0.03 * CELL, 6, 24)), ringMaterial)
  ring.rotation.x = Math.PI / 2
  food.add(orb, ring)
  group.add(food)

  // Particles: one pool shared by every effect.
  const particleMaterial = track(materials, new THREE.MeshBasicMaterial({ color: 0xffffff }))
  const particles = new THREE.InstancedMesh(
    track(geometries, new THREE.SphereGeometry(0.07 * CELL, 6, 4)),
    particleMaterial,
    MAX_PARTICLES,
  )
  particles.name = 'particles'
  particles.count = 0
  particles.frustumCulled = false
  group.add(particles)

  const tmpMatrix = new THREE.Matrix4()
  const tmpColor = new THREE.Color()
  const tmpObject = new THREE.Object3D()
  const positions = []

  let prevSnake = null
  let prevDirection = null
  let currentSnake = null
  let currentDirection = null
  let lastTicks = null
  let lastTime = 0
  let effects = []
  let overFlashStart = null

  function worldOf(cell) {
    return gridToWorld(cell.x, cell.y, width, height)
  }

  function makeEffect(kind, cell, spec, palette, speed) {
    const { x, z } = worldOf(cell)
    const list = []
    for (let i = 0; i < spec.count; i++) {
      const a = (i / spec.count) * TWO_PI + (i % 3) * 0.3
      const s = speed * (0.5 + ((i * 7) % 5) / 5)
      list.push({ vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 2 + ((i * 3) % 4), color: palette[i % palette.length] })
    }
    effects.push({ kind, start: lastTime, duration: spec.duration, x, z, particles: list })
  }

  function previousCell(i) {
    if (!prevSnake) return currentSnake[i]
    return prevSnake[Math.min(i, prevSnake.length - 1)]
  }

  function update(game, alpha, timeMs) {
    lastTime = timeMs
    if (lastTicks === null) {
      prevSnake = game.snake
      prevDirection = game.direction
    } else if (game.ticks !== lastTicks) {
      prevSnake = currentSnake
      prevDirection = currentDirection
    }
    lastTicks = game.ticks
    currentSnake = game.snake
    currentDirection = game.direction
    const t = clamp01(alpha)

    // Head
    const h0 = worldOf(previousCell(0))
    const h1 = worldOf(game.snake[0])
    const target = HEADING[game.direction]
    const from = HEADING[prevDirection] ?? target
    head.position.set(lerp(h0.x, h1.x, t), 0, lerp(h0.z, h1.z, t))
    head.rotation.y = t >= 1 ? target : from + angleDelta(from, target) * easeOutCubic(t)

    // Body
    positions.length = 0
    const count = game.snake.length - 1
    bodyMesh.count = count
    for (let i = 1; i <= count; i++) {
      const a = worldOf(previousCell(i))
      const b = worldOf(game.snake[i])
      const x = lerp(a.x, b.x, t)
      const z = lerp(a.z, b.z, t)
      positions.push({ x, z })
      tmpMatrix.makeTranslation(x, 0.3 * CELL, z)
      bodyMesh.setMatrixAt(i - 1, tmpMatrix)
      bodyMesh.setColorAt(i - 1, tmpColor.setHex(bodyColor(i, game.snake.length)))
    }
    bodyMesh.instanceMatrix.needsUpdate = true
    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true

    // Food: none is left once the snake fills the board.
    food.visible = game.food !== null
    if (food.visible) {
      const f = worldOf(game.food)
      const sec = timeMs / 1000
      food.position.set(f.x, 0.5 * CELL + Math.sin(sec * 3) * 0.1 * CELL, f.z)
      food.rotation.y = sec * 2
      food.scale.setScalar(1 + Math.sin(sec * 5) * 0.08)
    }

    // Effects
    effects = effects.filter((e) => timeMs - e.start < e.duration)
    let n = 0
    for (const e of effects) {
      const age = (timeMs - e.start) / 1000
      const life = clamp01((timeMs - e.start) / e.duration)
      for (const p of e.particles) {
        if (n >= MAX_PARTICLES) break
        tmpObject.position.set(
          e.x + p.vx * age,
          0.4 * CELL + Math.max(0, p.vy * age - 0.5 * GRAVITY * age * age),
          e.z + p.vz * age,
        )
        tmpObject.scale.setScalar(Math.max(0.001, 1 - life))
        tmpObject.updateMatrix()
        particles.setMatrixAt(n, tmpObject.matrix)
        particles.setColorAt(n, tmpColor.setHex(p.color))
        n++
      }
    }
    particles.count = n
    particles.instanceMatrix.needsUpdate = true
    if (particles.instanceColor) particles.instanceColor.needsUpdate = true

    // Game over: the head flashes between its color and the food's red.
    if (overFlashStart !== null) {
      const flash = Math.sin((timeMs - overFlashStart) / 80) > 0
      headMaterial.emissive.setHex(flash ? colors.food : colors.snakeHead)
      headMaterial.emissiveIntensity = flash ? 1 : 0.35
    }
  }

  return {
    update,
    segmentPositions: () => positions.map((p) => ({ x: p.x, z: p.z })),
    onEat(cell) {
      makeEffect('eat', cell, EAT, [colors.particle, colors.food, colors.accent], 1.8)
    },
    onGameOver() {
      const cell = currentSnake ? currentSnake[0] : { x: 0, y: 0 }
      makeEffect('over', cell, OVER, [colors.food, colors.particle, 0xffffff], 3)
      overFlashStart = lastTime
    },
    activeEffects: () => effects.length,
    reset() {
      prevSnake = null
      prevDirection = null
      currentSnake = null
      currentDirection = null
      lastTicks = null
      effects = []
      overFlashStart = null
      positions.length = 0
      bodyMesh.count = 0
      particles.count = 0
      headMaterial.emissive.setHex(colors.snakeHead)
      headMaterial.emissiveIntensity = 0.35
    },
    dispose() {
      scene.remove(group)
      bodyMesh.dispose()
      particles.dispose()
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
    },
  }
}
