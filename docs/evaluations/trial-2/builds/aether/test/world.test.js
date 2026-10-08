import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildWorld, frameCamera, fogRange } from '../src/render/world.js'
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

test('fogRange follows the framed camera, so the board stays clear of the fog at any aspect', () => {
  for (const aspect of [16 / 9, 1, 390 / 844, 9 / 16]) {
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000)
    frameCamera(camera, { width: 20, height: 20, aspect })
    camera.updateMatrixWorld()
    const { near, far } = fogRange(camera)
    assert.ok(near > 0 && far > near, `near ${near}, far ${far}`)
    for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
      const depth = -new THREE.Vector3(x, 0, z).applyMatrix4(camera.matrixWorldInverse).z
      const amount = (depth - near) / (far - near)
      assert.ok(amount <= 0.35, `aspect ${aspect.toFixed(2)}, corner ${x},${z}: fog ${amount.toFixed(2)}`)
    }
  }
})
