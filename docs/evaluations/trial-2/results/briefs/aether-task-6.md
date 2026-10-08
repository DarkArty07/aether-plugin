# Brief: Task 6: The 3D world and the camera

- Plan: /home/darkarty/.cache/aether-trial2/aether/repo/.worktrees/trial/docs/plan.md
- Spec: docs/spec.md
- Tier: sonnet — 3D scene composition and lighting the tests cannot fully pin down
- Area: render
- Owns: src/render/world.js, test/world.test.js

Change only the files your task owns. Exact values in the task text are requirements: use them verbatim.

## Global Constraints

- **The browser side:** ES modules with no build step. three.js 0.186.1 comes from `node_modules` through the import map in `index.html`; there is no CDN and no other dependency.
- **The tests:** Node.js 22 with ES modules (`"type": "module"`). `npm test` runs `node --test`, and tests may import `three`. Run `npm ci` in a fresh checkout or worktree before testing.
- **Purity:** the rules, input mapping, storage, theme helpers, HUD model and loop are pure, or take their dependencies as arguments.
- **Performance:** nothing creates geometries or materials per tick or per frame.
- **Error messages** start with the spec's prefixes.

## Task

### Task 6: The 3D world and the camera

**Aether:**
- Tier: sonnet — 3D scene composition and lighting the tests cannot fully pin down
- Area: render
- Owns: `src/render/world.js`, `test/world.test.js`
- Depends on: Task 4 — builds the world from THEME, CELL and gridToWorld

**Interfaces:**
- `src/render/world.js` exports `buildWorld({ width, height, theme }) → THREE.Group` and `frameCamera(camera, { width, height, aspect })`.
- Consumes `CELL`, `THEME` and `gridToWorld` from `src/render/theme.js` (Task 4).

**Failing tests:** write `test/world.test.js` exactly as follows, and watch it fail first.

```js
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
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "Look and 3D" section.

**Acceptance:** `npm test` passes. The board, walls, lights and any decoration make a scene worth looking at: real depth, shadows, and an atmosphere that fits the theme. Nothing creates geometries or materials per frame.
