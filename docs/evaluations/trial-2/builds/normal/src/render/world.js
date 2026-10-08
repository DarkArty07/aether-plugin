// The stage of "Abyssal Bloom": a checkered seafloor slab ringed by reef-rock walls under cold moonlight,
// with dunes, rocks, swaying kelp, glowing plankton and marine snow around it. The board's top surface
// is y = 0 (the snake and the food sit above it). Everything is built once in buildWorld;
// world.userData.update(timeMs) only mutates what already exists (a uniform, one attribute, a few matrices).
import * as THREE from 'three'
import { CELL, gridToWorld } from './theme.js'
import { nextRandom } from '../rng.js'

const DEPTH = 0.5 // slab thickness below the board surface
const WALL_TOP = 1.2 // the highest spire of the rim
const FLOOR_Y = -DEPTH
const SNOW = 260
const SNOW_H = 9
const ORBS = 16

const _o = new THREE.Object3D()
const _c = new THREE.Color()
const _c2 = new THREE.Color()

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    const r = nextRandom(state)
    state = r.state
    return r.value
  }
}

// An InstancedMesh whose i-th transform and color come from place(i, object3d, color).
function instanced(geometry, material, count, place) {
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  for (let i = 0; i < count; i++) {
    _o.position.set(0, 0, 0)
    _o.rotation.set(0, 0, 0)
    _o.scale.set(1, 1, 1)
    place(i, _o, _c)
    _o.updateMatrix()
    mesh.setMatrixAt(i, _o.matrix)
    mesh.setColorAt(i, _c)
  }
  return mesh
}

// Everything in the stage receives shadows; `cast` says whether it also throws them.
function shadowed(mesh, cast) {
  mesh.castShadow = cast
  mesh.receiveShadow = true
  return mesh
}

const rimDistance = (x, z, hx, hz) => Math.max(Math.abs(x) - hx - 3, Math.abs(z) - hz - 3, 0)

// Dunes: flat beside the walls, rolling further out.
function floorHeight(x, z, hx, hz) {
  const out = rimDistance(x, z, hx, hz)
  const swell = Math.sin(x * 0.15 + 1.3) * Math.cos(z * 0.11) + 0.6 * Math.sin(x * 0.06 - z * 0.08 + 2) + 0.15 * Math.sin(x * 0.5 + z * 0.4)
  return THREE.MathUtils.smoothstep(out, 0, 8) * (0.5 + swell) * (0.6 + out * 0.07)
}

// A random spot beside the rim, between `gap` and `gap + reach` cells away from it.
function aroundRim(rand, hx, hz, gap, reach) {
  for (;;) {
    const u = rand() * 2 - 1
    const v = rand() * 2 - 1
    const x = Math.sign(u) * Math.abs(u) ** 1.4 * (hx + gap + reach)
    const z = Math.sign(v) * Math.abs(v) ** 1.4 * (hz + gap + reach)
    if (Math.abs(x) > hx + gap || Math.abs(z) > hz + gap) return { x, z, y: FLOOR_Y + floorHeight(x, z, hx, hz) }
  }
}

function buildBoard(width, height, colors) {
  const group = new THREE.Group()
  const rand = seeded(11)
  const tile = new THREE.BoxGeometry(CELL * 0.965, DEPTH, CELL * 0.965).translate(0, -DEPTH / 2, 0)
  const board = shadowed(
    instanced(tile, new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.06 }), width * height, (i, o, c) => {
      const x = i % width
      const y = Math.floor(i / width)
      const p = gridToWorld(x, y, width, height)
      o.position.set(p.x, 0, p.z)
      c.setHex((x + y) % 2 ? colors.boardAlt : colors.board).multiplyScalar(0.94 + rand() * 0.12)
    }),
    false,
  )
  board.name = 'board'
  // Dark grout under the tiles, so the seams read as thin shadowed lines.
  const slab = new THREE.BoxGeometry(width * CELL, DEPTH - 0.06, height * CELL).translate(0, -(DEPTH + 0.06) / 2, 0)
  const grout = shadowed(new THREE.Mesh(slab, new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.board).multiplyScalar(0.35), roughness: 1 })), false)
  group.add(grout, board)
  return group
}

// The rim: one ring of reef-rock blocks a cell outside the playfield, with faceted boulders on top.
// The near (+z) side is lower, so it never hides the snake from the camera.
function buildWalls(width, height, colors) {
  const cells = []
  for (let y = -1; y <= height; y++) {
    for (let x = -1; x <= width; x++) {
      if (x >= 0 && x < width && y >= 0 && y < height) continue
      const p = gridToWorld(x, y, width, height)
      cells.push({ x: p.x, z: p.z, out: [x < 0 ? -1 : x >= width ? 1 : 0, y < 0 ? -1 : y >= height ? 1 : 0], tall: y >= height ? 0.55 : 1 })
    }
  }
  const rand = seeded(23)
  const rock = new THREE.Color(colors.wall)
  const blocks = instanced(
    new THREE.BoxGeometry(CELL * 1.04, 1, CELL * 1.04).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.94 }),
    cells.length,
    (i, o, c) => {
      o.position.set(cells[i].x, FLOOR_Y, cells[i].z)
      o.scale.y = DEPTH + (0.3 + rand() * 0.16) * cells[i].tall
      c.copy(rock).multiplyScalar(0.7 + rand() * 0.1)
    },
  )
  const boulders = instanced(
    new THREE.IcosahedronGeometry(0.5, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
    cells.length,
    (i, o, c) => {
      const { x, z, out, tall } = cells[i]
      const s = 0.85 + rand() * 0.2
      const spire = rand() < 0.16 ? 1.7 : 1
      o.position.set(x + out[0] * 0.08, (0.32 + rand() * 0.08) * tall, z + out[1] * 0.08)
      o.rotation.set(rand() * 0.5, rand() * Math.PI * 2, rand() * 0.5)
      o.scale.set(s, s * (0.7 + rand() * 0.3) * spire * tall, s)
      c.copy(rock).offsetHSL((rand() - 0.5) * 0.03, 0, 0).multiplyScalar(0.9 + rand() * 0.35)
    },
  )
  const walls = new THREE.Group()
  walls.name = 'walls'
  walls.add(shadowed(blocks, true), shadowed(boulders, true))
  return walls
}

// A thin cyan tide line just inside the walls: the one hard glow of the stage.
function buildTrim(width, height, accent) {
  const group = new THREE.Group()
  group.name = 'trim'
  const material = new THREE.MeshBasicMaterial({ color: accent })
  material.color.multiplyScalar(1.15)
  const strip = new THREE.BoxGeometry(1, 0.03, 1)
  const hx = (width * CELL) / 2
  const hz = (height * CELL) / 2
  const edge = 0.035
  for (const [x, z, sx, sz] of [[0, -hz + edge, width * CELL, 0.05], [0, hz - edge, width * CELL, 0.05], [-hx + edge, 0, 0.05, height * CELL], [hx - edge, 0, 0.05, height * CELL]]) {
    const mesh = new THREE.Mesh(strip, material)
    mesh.position.set(x, 0.016, z)
    mesh.scale.set(sx, 1, sz)
    group.add(mesh)
  }
  return group
}

// Caustics: slow bright net-lines of light on the board, as if the surface were rippling far above.
// A flat additive overlay a hair above the tiles; its brightness stays well under the bloom threshold.
function buildCaustics(width, height, colors, time) {
  const material = new THREE.MeshBasicMaterial({ color: colors.accent, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        varying vec2 vWp;
        float caustic(vec2 p, float t) {
          vec2 i = p;
          float c = 1.0;
          for (int n = 0; n < 5; n++) {
            float tt = t * (1.0 - 3.5 / float(n + 1));
            i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
            c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
          }
          return pow(abs(1.17 - pow(c / 5.0, 1.4)), 8.0);
        }`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.09 * min(caustic(vWp * 0.7 - 250.0, uTime * 0.4 + 23.0), 1.5);')
  }
  material.customProgramCacheKey = () => 'caustics'
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width * CELL, height * CELL).rotateX(-Math.PI / 2), material)
  plane.name = 'caustics'
  plane.position.y = 0.004
  plane.renderOrder = 1
  return plane
}

function buildLights(width, height, colors) {
  const group = new THREE.Group()
  const hx = (width * CELL) / 2 + 1
  const hz = (height * CELL) / 2 + 1
  const reach = Math.max(hx, hz) + 2
  // Moonlight from the upper left, a little toward the camera: shadows fall to the right and back.
  const key = new THREE.DirectionalLight(colors.keyLight, 4.8)
  key.position.set(-10, 16, 6).normalize().multiplyScalar(reach * 2 + 8)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.03
  key.shadow.radius = 3
  Object.assign(key.shadow.camera, { left: -reach * 1.42, right: reach * 1.42, top: reach * 1.42, bottom: -reach * 1.42, near: 1, far: reach * 5 + 20 })
  key.shadow.camera.updateProjectionMatrix()
  key.target.position.set(0, 0, 0)
  const glowA = new THREE.PointLight(colors.accent, 14, 14, 2)
  glowA.position.set(-hx + 2.5, 2.2, -hz + 2.5)
  const glowB = new THREE.PointLight(colors.snakeTail, 10, 14, 2)
  glowB.position.set(hx - 2.5, 2.2, -hz + 2.5)
  group.add(key, key.target, new THREE.HemisphereLight(colors.sky, colors.ground, 0.9), glowA, glowB)
  return group
}

// A ribbon of kelp one unit tall, narrowing toward its tip.
function kelpBlade() {
  const blade = new THREE.PlaneGeometry(0.34, 1, 1, 9).translate(0, 0.5, 0)
  const pos = blade.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * (1 - 0.85 * pos.getY(i)))
  return blade
}

function buildSeafloor(hx, hz, colors) {
  const geometry = new THREE.PlaneGeometry(240, 240, 120, 120).rotateX(-Math.PI / 2)
  const pos = geometry.attributes.position
  const tint = new Float32Array(pos.count * 3)
  const sand = new THREE.Color(colors.boardAlt).multiplyScalar(1.25)
  const deep = new THREE.Color(colors.board).multiplyScalar(0.6)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = floorHeight(x, z, hx, hz)
    pos.setY(i, FLOOR_Y + h)
    // Crests are paler, and the floor sinks into the dark away from the board's pool of light.
    const pool = 1 - 0.8 * THREE.MathUtils.smoothstep(rimDistance(x, z, hx, hz), 3, 26)
    _c.copy(deep).lerp(sand, THREE.MathUtils.clamp(0.3 + h * 0.4, 0, 1)).multiplyScalar(pool).toArray(tint, i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(tint, 3))
  geometry.computeVertexNormals()
  const floor = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))
  floor.name = 'seafloor'
  floor.receiveShadow = true
  return floor
}

// Boulders, kelp and glowing plankton outside the walls. Returns the group and its per-frame update.
function buildDecor(width, height, colors, time) {
  const hx = (width * CELL) / 2 + 1
  const hz = (height * CELL) / 2 + 1
  const rand = seeded(47)
  const group = new THREE.Group()
  group.name = 'decor'

  const rocks = shadowed(
    instanced(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), 70, (i, o, c) => {
      const p = aroundRim(rand, hx, hz, 1.2, 15)
      const s = 0.5 + rand() * rand() * 3
      o.position.set(p.x, p.y + s * 0.1, p.z)
      o.rotation.set(rand() * 0.6, rand() * 6.28, rand() * 0.6)
      o.scale.set(s, s * (0.5 + rand() * 0.3), s * (0.8 + rand() * 0.4))
      c.setHex(colors.wall).multiplyScalar(0.55 + rand() * 0.4)
    }),
    true,
  )

  // Kelp: a tapered blade bent in the vertex shader (the phase comes from the instance position).
  const kelpMaterial = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7, emissive: colors.snakeBody, emissiveIntensity: 0.1 })
  kelpMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float bend = position.y * position.y * 0.5;
        float phase = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
        transformed.x += sin(uTime * 1.1 + phase + position.y * 2.0) * bend;
        transformed.z += cos(uTime * 0.8 + phase * 1.3 + position.y * 1.5) * bend * 0.6;`,
      )
  }
  kelpMaterial.customProgramCacheKey = () => 'kelp-sway'
  const clusters = Array.from({ length: 18 }, () => aroundRim(rand, hx, hz, 1.5, 10))
  const kelp = instanced(kelpBlade(), kelpMaterial, clusters.length * 5, (i, o, c) => {
    const at = clusters[Math.floor(i / 5)]
    o.position.set(at.x + (rand() - 0.5) * 0.9, at.y, at.z + (rand() - 0.5) * 0.9)
    o.rotation.y = rand() * Math.PI
    o.scale.set(1, 1.6 + rand() * 2.6, 1)
    c.setHex(rand() < 0.3 ? colors.snakeTail : colors.snakeBody).lerp(_c2.setHex(colors.board), 0.35 + rand() * 0.2)
  })

  // Plankton lamps: the glowing orbs hover and bob over the dunes.
  const orbData = new Float32Array(ORBS * 5)
  const orbs = instanced(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial(), ORBS, (i, o, c) => {
    const p = aroundRim(rand, hx, hz, 0.8, 9)
    const r = 0.07 + rand() * 0.08
    orbData.set([p.x, p.y + 0.5 + rand() * 1.6, p.z, r, rand() * 6.28], i * 5)
    o.position.set(p.x, orbData[i * 5 + 1], p.z)
    o.scale.setScalar(r)
    c.setHex([colors.accent, colors.snakeBody, colors.snakeTail][i % 3]).multiplyScalar(1.7)
  })

  group.add(rocks, kelp, orbs)

  // Marine snow: soft dots rising slowly through the whole scene.
  const dot = new Uint8Array(32 * 32 * 4).fill(255)
  for (let i = 0; i < 32 * 32; i++) dot[i * 4 + 3] = 255 * Math.max(0, 1 - Math.hypot((i % 32) - 15.5, Math.floor(i / 32) - 15.5) / 15.5) ** 2
  const texture = new THREE.DataTexture(dot, 32, 32)
  texture.needsUpdate = true
  const snowBase = new Float32Array(SNOW * 3)
  const snowSpeed = new Float32Array(SNOW)
  for (let i = 0; i < SNOW; i++) {
    snowBase.set([(rand() * 2 - 1) * (hx + 12), rand() * SNOW_H, (rand() * 2 - 1) * (hz + 12)], i * 3)
    snowSpeed[i] = 0.4 + rand() * 0.8
  }
  const snow = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(snowBase.slice(), 3)),
    new THREE.PointsMaterial({ map: texture, size: 0.2, color: 0xbfeaff, transparent: true, opacity: 0.5, depthWrite: false }),
  )
  snow.frustumCulled = false
  group.add(snow)

  const snowPos = snow.geometry.attributes.position
  const update = (t) => {
    for (let i = 0; i < SNOW; i++) {
      snowPos.setXYZ(
        i,
        snowBase[i * 3] + Math.sin(t * snowSpeed[i] + i) * 0.5,
        (snowBase[i * 3 + 1] + t * snowSpeed[i] * 0.3) % SNOW_H,
        snowBase[i * 3 + 2] + Math.cos(t * snowSpeed[i] * 0.8 + i * 1.7) * 0.5,
      )
    }
    snowPos.needsUpdate = true
    for (let i = 0; i < ORBS; i++) {
      const k = i * 5
      _o.position.set(orbData[k], orbData[k + 1] + Math.sin(t * 0.7 + orbData[k + 4]) * 0.25, orbData[k + 2])
      _o.scale.setScalar(orbData[k + 3])
      _o.updateMatrix()
      orbs.setMatrixAt(i, _o.matrix)
    }
    orbs.instanceMatrix.needsUpdate = true
  }
  return { group, update }
}

export function buildWorld({ width, height, theme }) {
  const colors = theme.colors
  const hx = (width * CELL) / 2 + 1
  const hz = (height * CELL) / 2 + 1
  const world = new THREE.Group()
  world.name = 'world'
  const time = { value: 0 } // seconds, shared by the shader animations
  const decor = buildDecor(width, height, colors, time)
  world.add(
    buildBoard(width, height, colors),
    buildWalls(width, height, colors),
    buildTrim(width, height, colors.accent),
    buildCaustics(width, height, colors, time),
    buildSeafloor(hx, hz, colors),
    decor.group,
    buildLights(width, height, colors),
  )
  world.userData.update = (timeMs) => {
    time.value = timeMs * 0.001
    decor.update(time.value)
  }
  world.userData.update(0)
  return world
}

// Camera on the +z side in the x = 0 plane (no yaw: screen-up is grid-up), looking at the board center.
// The distance is solved so the walls' 8 corners fit the view: for a corner q (relative to the target),
// forward = (0, sin e, cos e) and up = (0, cos e, -sin e), the camera at distance d sees it at depth
// d - q.forward, so x fits when d >= q.forward + |q.x| * margin / tan(hfov / 2), and y likewise.
const MARGIN_X = 1.05
const MARGIN_Y = 1.12 // a little more room above and below for the HUD bar
export function frameCamera(camera, { width, height, aspect }) {
  if (!(aspect > 0 && aspect < Infinity)) aspect = 1 // a collapsed window must not poison the camera
  const portrait = THREE.MathUtils.clamp((1.5 - aspect) / 0.8, 0, 1)
  const e = THREE.MathUtils.degToRad(54 + 10 * portrait) // steeper on tall screens, to use their height
  const sinE = Math.sin(e)
  const cosE = Math.cos(e)
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
  const tanH = tanV * aspect
  const hx = (width * CELL) / 2 + CELL
  const hz = (height * CELL) / 2 + CELL
  let d = 0
  for (let corner = 0; corner < 8; corner++) {
    const x = corner & 1 ? hx : -hx
    const z = corner & 2 ? hz : -hz
    const y = corner & 4 ? WALL_TOP : 0
    const along = y * sinE + z * cosE
    d = Math.max(d, along + (Math.abs(x) * MARGIN_X) / tanH, along + (Math.abs(y * cosE - z * sinE) * MARGIN_Y) / tanV)
  }
  camera.aspect = aspect
  camera.position.set(0, d * sinE, d * cosE)
  camera.near = d * 0.3
  camera.far = d + 220
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
}
