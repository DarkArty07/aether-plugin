// The static 3D world: a checkered glassy board, glowing walls, lights with a
// shadow, and a little night-sky decoration. Built once; nothing here runs per frame.
import * as THREE from 'three'
import { CELL, gridToWorld } from './theme.js'

const WALL_THICKNESS = 0.5
const WALL_HEIGHT = 0.6
const TILT = THREE.MathUtils.degToRad(58) // camera elevation above the board

function buildBoard(width, height, colors) {
  const geometry = new THREE.BoxGeometry(CELL * 0.96, 0.2, CELL * 0.96)
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.25 })
  const board = new THREE.InstancedMesh(geometry, material, width * height)
  board.name = 'board'
  board.receiveShadow = true
  const m = new THREE.Matrix4()
  const c = new THREE.Color()
  let i = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = gridToWorld(x, y, width, height)
      m.makeTranslation(p.x, -0.1, p.z)
      board.setMatrixAt(i, m)
      board.setColorAt(i, c.set((x + y) % 2 === 0 ? colors.board : colors.boardAlt))
      i++
    }
  }
  board.instanceMatrix.needsUpdate = true
  board.instanceColor.needsUpdate = true
  return board
}

function buildWalls(width, height, colors) {
  const walls = new THREE.Group()
  walls.name = 'walls'
  const wallMat = new THREE.MeshStandardMaterial({ color: colors.wall, roughness: 0.4, metalness: 0.3 })
  const trimMat = new THREE.MeshStandardMaterial({
    color: colors.accent, emissive: colors.accent, emissiveIntensity: 1.6, roughness: 0.3,
  })
  const w = width * CELL
  const h = height * CELL
  const t = WALL_THICKNESS
  const sides = [
    [w + 2 * t, t, 0, -(h + t) / 2],
    [w + 2 * t, t, 0, (h + t) / 2],
    [t, h, -(w + t) / 2, 0],
    [t, h, (w + t) / 2, 0],
  ]
  for (const [sx, sz, px, pz] of sides) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, WALL_HEIGHT, sz), wallMat)
    wall.position.set(px, WALL_HEIGHT / 2 - 0.2, pz)
    wall.castShadow = true
    wall.receiveShadow = true
    walls.add(wall)
    // Thin neon strip along the top of each wall.
    const trim = new THREE.Mesh(new THREE.BoxGeometry(sx * (sx > sz ? 1 : 0.3), 0.06, sz * (sz > sx ? 1 : 0.3)), trimMat)
    trim.position.set(px, WALL_HEIGHT - 0.2 + 0.03, pz)
    walls.add(trim)
  }
  return walls
}

function buildStars(width, height, colors) {
  const count = 160
  const positions = new Float32Array(count * 3)
  // Deterministic scatter (no Math.random) in a ring around and above the board.
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963
    const r = Math.max(width, height) * (0.9 + 1.6 * ((i * 0.618034) % 1))
    positions[i * 3] = Math.cos(a) * r
    positions[i * 3 + 1] = 1 + 9 * ((i * 0.381966) % 1)
    positions[i * 3 + 2] = Math.sin(a) * r - Math.max(width, height) * 0.5
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({ color: colors.accent, size: 0.18, transparent: true, opacity: 0.8, fog: false })
  const stars = new THREE.Points(geometry, material)
  stars.name = 'stars'
  return stars
}

export function buildWorld({ width, height, theme }) {
  const colors = theme.colors
  const world = new THREE.Group()
  world.name = 'world'

  world.add(buildBoard(width, height, colors))
  world.add(buildWalls(width, height, colors))
  world.add(buildStars(width, height, colors))

  // Dark slab under and around the board, catching the walls' shadows and giving depth.
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(width * CELL + 4, 0.3, height * CELL + 4),
    new THREE.MeshStandardMaterial({ color: colors.background, roughness: 0.9 }),
  )
  base.name = 'base'
  base.position.y = -0.36
  base.receiveShadow = true
  world.add(base)

  world.add(new THREE.HemisphereLight(colors.accent, colors.fog, 0.55))

  const span = Math.max(width, height) * CELL
  const sun = new THREE.DirectionalLight(0xdfe6ff, 1.6)
  sun.name = 'sun'
  sun.position.set(span * 0.4, span * 0.9, span * 0.3)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const half = span * 0.75
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: span * 3 })
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.03
  world.add(sun)

  // A cool rim light from the opposite side for a neon edge.
  const rim = new THREE.PointLight(colors.accent, 40, span * 2, 2)
  rim.position.set(-span * 0.5, 3, -span * 0.6)
  world.add(rim)

  return world
}

// Place the camera on the +z side, tilted down at TILT, backed off just far
// enough that the board (walls included) fits the view at this aspect.
export function frameCamera(camera, { width, height, aspect }) {
  const halfW = (width * CELL) / 2 + WALL_THICKNESS
  const halfH = (height * CELL) / 2 + WALL_THICKNESS
  const corners = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const y of [-0.2, WALL_HEIGHT]) corners.push(new THREE.Vector3(sx * halfW, y, sz * halfH))
    }
  }
  camera.aspect = aspect
  const dir = new THREE.Vector3(0, Math.sin(TILT), Math.cos(TILT))
  const limit = 0.92
  const probe = new THREE.Vector3()
  let distance = Math.max(width, height) * CELL * 0.5
  for (let i = 0; i < 200; i++) {
    camera.position.copy(dir).multiplyScalar(distance)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const fits = corners.every((c) => {
      probe.copy(c).project(camera)
      return Math.abs(probe.x) <= limit && Math.abs(probe.y) <= limit && probe.z < 1
    })
    if (fits) break
    distance *= 1.04
  }
  return camera
}

// Fog distances scaled to the framed camera's distance from the board's center,
// so the atmosphere looks the same at every aspect: portrait backs the camera off.
export function fogRange(camera) {
  const distance = camera.position.length()
  return { near: distance * 0.85, far: distance * 2.3 }
}
