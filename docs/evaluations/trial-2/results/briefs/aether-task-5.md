# Brief: Task 5: The HUD and the page

- Plan: /home/darkarty/.cache/aether-trial2/aether/repo/.worktrees/trial/docs/plan.md
- Spec: docs/spec.md
- Tier: sonnet — UI layout and styling the tests cannot pin down
- Area: ui
- Owns: index.html, styles.css, src/hud.js, test/hud.test.js

Change only the files your task owns. Exact values in the task text are requirements: use them verbatim.

## Global Constraints

- **The browser side:** ES modules with no build step. three.js 0.186.1 comes from `node_modules` through the import map in `index.html`; there is no CDN and no other dependency.
- **The tests:** Node.js 22 with ES modules (`"type": "module"`). `npm test` runs `node --test`, and tests may import `three`. Run `npm ci` in a fresh checkout or worktree before testing.
- **Purity:** the rules, input mapping, storage, theme helpers, HUD model and loop are pure, or take their dependencies as arguments.
- **Performance:** nothing creates geometries or materials per tick or per frame.
- **Error messages** start with the spec's prefixes.

## Task

### Task 5: The HUD and the page

**Aether:**
- Tier: sonnet — UI layout and styling the tests cannot pin down
- Area: ui
- Owns: `index.html`, `styles.css`, `src/hud.js`, `test/hud.test.js`
- Depends on: Task 4 — styles the HUD in the theme's palette and mood

**Interfaces:**
- `src/hud.js` exports `hudModel({ status, score, highScore, level, isNewBest }) → { score, best, level, panel }` (pure) and `createHud(root) → { update(model), element }` (DOM).
- `index.html` holds `<canvas id="game">`, `<div id="hud">`, the spec's import map, `styles.css`, and `src/main.js` as a module (Task 8 writes `src/main.js`).

**Failing tests:** write `test/hud.test.js` exactly as follows, and watch it fail first.

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { hudModel } from '../src/hud.js'

test('hudModel shows the score, the best and the level as text, and no panel while running', () => {
  assert.deepEqual(hudModel({ status: 'running', score: 40, highScore: 90, level: 2 }), { score: '40', best: '90', level: '2', panel: null })
})

test('hudModel gives each screen its panel, with a title and a hint that names the keys', () => {
  const ready = hudModel({ status: 'ready', score: 0, highScore: 0, level: 1 }).panel
  assert.equal(ready.kind, 'ready')
  assert.match(ready.hint, /arrow/i)
  const paused = hudModel({ status: 'paused', score: 10, highScore: 10, level: 1 }).panel
  assert.equal(paused.kind, 'paused')
  assert.match(paused.hint, /space/i)
  const over = hudModel({ status: 'over', score: 120, highScore: 120, level: 3, isNewBest: true }).panel
  assert.deepEqual([over.kind, over.newBest], ['over', true])
  assert.match(over.title, /\S/)
  assert.match(over.hint, /enter/i)
  assert.equal(hudModel({ status: 'won', score: 999, highScore: 999, level: 9 }).panel.kind, 'won')
})
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "HUD and screens" section.

**Acceptance:** `npm test` passes. The HUD is readable over the scene, fits a 390 × 844 phone and a desktop, and the page has no scrollbars. The HUD's typography, colors and panels carry the theme in `src/render/theme.js` (Task 4).
