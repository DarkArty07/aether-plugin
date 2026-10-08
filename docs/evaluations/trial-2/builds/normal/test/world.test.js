import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildWorld, frameCamera } from '../src/render/world.js'
import { THEME } from '../src/render/theme.js'

test('buildWorld holds a board that spans the cells, walls, and a shadow-casting light', () => {
  const world = buildWorld({ width: 20, height: 20, theme: THEME })
  assert.equal(world.name, 'world')
  const board = world.getObjectByName('board')
  const walls = world.getObjectByName('walls')
  assert.ok(board && (board.isMesh || board.isInstancedMesh), 'board mesh')
  assert.ok(walls, 'walls')
  assert.equal(board.receiveShadow, true)
  const size = new THREE.Box3().setFromObject(board).getSize(new THREE.Vector3())
  assert.ok(Math.abs(size.x - 20) <= 0.5 && Math.abs(size.z - 20) <= 0.5, `board size ${size.x} x ${size.z}`)
  const lights = []
  world.traverse((o) => o.isDirectionalLight && o.castShadow && lights.push(o))
  assert.ok(lights.length >= 1, 'a shadow-casting directional light')
})

test('frameCamera keeps the whole board in view from an angle, in landscape and portrait', () => {
  for (const aspect of [16 / 9, 9 / 16, 1]) {
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000)
    frameCamera(camera, { width: 20, height: 20, aspect })
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
      const p = new THREE.Vector3(x, 0, z).project(camera)
      assert.ok(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1, `aspect ${aspect.toFixed(2)}, corner ${x},${z}`)
    }
    assert.ok(camera.position.y > 0, 'above the board')
    assert.ok(Math.hypot(camera.position.x, camera.position.z) > 1, 'at an angle, not straight down')
  }
})

const boxOf = (object) => new THREE.Box3().setFromObject(object)

test('the board top surface is at y = 0, with real depth below it', () => {
  const world = buildWorld({ width: 14, height: 9, theme: THEME })
  const box = boxOf(world.getObjectByName('board'))
  assert.ok(Math.abs(box.max.y) < 1e-6, `board top ${box.max.y}`)
  assert.ok(box.min.y <= -0.3, `board bottom ${box.min.y}`)
  assert.ok(Math.abs(box.getSize(new THREE.Vector3()).x - 14) <= 0.5)
  assert.ok(Math.abs(box.getSize(new THREE.Vector3()).z - 9) <= 0.5)
})

test('the walls ring the board from outside and are tall enough to read as a boundary', () => {
  const world = buildWorld({ width: 20, height: 12, theme: THEME })
  const walls = boxOf(world.getObjectByName('walls'))
  assert.ok(Math.abs(walls.min.x + 11) <= 0.6 && Math.abs(walls.max.x - 11) <= 0.6, `walls x ${walls.min.x}..${walls.max.x}`)
  assert.ok(Math.abs(walls.min.z + 7) <= 0.6 && Math.abs(walls.max.z - 7) <= 0.6, `walls z ${walls.min.z}..${walls.max.z}`)
  assert.ok(walls.max.y >= 0.5 && walls.max.y <= 1.6, `walls top ${walls.max.y}`)
  world.getObjectByName('walls').traverse((o) => o.isMesh && assert.ok(o.castShadow && o.receiveShadow, 'rock shadows'))
})

test('the camera stays in the x = 0 plane on the +z side, 50 to 65 degrees above the board', () => {
  for (const aspect of [21 / 9, 16 / 9, 4 / 3, 1, 3 / 4, 9 / 16, 9 / 21]) {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    frameCamera(camera, { width: 20, height: 20, aspect })
    assert.equal(camera.aspect, aspect)
    assert.equal(camera.position.x, 0)
    assert.ok(camera.position.z > 0, 'on the +z side')
    const elevation = (Math.atan2(camera.position.y, camera.position.z) * 180) / Math.PI
    assert.ok(elevation >= 50 && elevation <= 65, `elevation ${elevation.toFixed(1)} at aspect ${aspect.toFixed(2)}`)
    const toCenter = new THREE.Vector3().sub(camera.position).normalize()
    assert.ok(camera.getWorldDirection(new THREE.Vector3()).dot(toCenter) > 0.9999, 'looks at the board center')
    assert.ok(camera.near > 0 && camera.far > camera.position.length() + 12, 'the planes bracket the board')
  }
})

test('the camera fits the board and its walls for wide and tall boards at any aspect', () => {
  for (const [width, height] of [[12, 30], [30, 12], [8, 8]]) {
    for (const aspect of [16 / 9, 1, 9 / 16]) {
      const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000)
      frameCamera(camera, { width, height, aspect })
      camera.updateMatrixWorld()
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const p = new THREE.Vector3((sx * (width + 2)) / 2, 0, (sz * (height + 2)) / 2).project(camera)
          assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1, `${width}x${height} at aspect ${aspect.toFixed(2)}, wall corner ${sx},${sz}: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}`)
        }
      }
    }
  }
})

test('frameCamera survives a collapsed window', () => {
  for (const aspect of [0, NaN, Infinity]) {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    frameCamera(camera, { width: 20, height: 20, aspect })
    assert.ok(Number.isFinite(camera.position.y) && Number.isFinite(camera.far) && camera.position.y > 0)
  }
})

test('the scene is identical on every load', () => {
  const signature = () => {
    const world = buildWorld({ width: 20, height: 20, theme: THEME })
    const parts = []
    world.traverse((o) => {
      if (o.isInstancedMesh) parts.push(Array.from(o.instanceMatrix.array), o.instanceColor ? Array.from(o.instanceColor.array) : [])
      else if (o.isPoints) parts.push(Array.from(o.geometry.attributes.position.array))
    })
    return JSON.stringify(parts)
  }
  assert.equal(signature(), signature())
})

test('userData.update animates the ambient scene in place, with no new geometry or materials', () => {
  const world = buildWorld({ width: 20, height: 20, theme: THEME })
  assert.equal(typeof world.userData.update, 'function')
  const snow = []
  const counts = () => {
    let objects = 0
    world.traverse(() => objects++)
    return objects
  }
  world.traverse((o) => o.isPoints && snow.push(o))
  assert.equal(snow.length, 1)
  const before = counts()
  const first = Array.from(snow[0].geometry.attributes.position.array)
  world.userData.update(1000)
  world.userData.update(5000)
  const after = Array.from(snow[0].geometry.attributes.position.array)
  assert.notDeepEqual(first, after, 'the marine snow drifts')
  assert.ok(after.every(Number.isFinite))
  assert.equal(counts(), before)
})
