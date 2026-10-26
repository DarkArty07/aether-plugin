'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const g = require('./guards-helpers.js')

function tree(t, files) {
  const root = tempDir(t)
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), text)
  }
  return root
}
const LIB = 'plugins/aether/lib/'
const FAMILIES = ['## Library families', '', '| Family | Prefix | Members | Orchestrator or table |', '| --- | --- | --- | --- |',
  '| lane | `lane-` | `lane-calls.js` | `lanes.js` |', '| spend | `spend-` | `spend-archive.js` | `spend.js` |', '', 'Loose modules (no family): `common.js`, `git.js`, `first-setup.js`.', ''].join('\n')

test('declaredFamilies reads the table and the loose list', () => {
  const d = g.declaredFamilies(FAMILIES)
  assert.equal(d.families.get('lane').orchestrator, 'lanes.js')
  assert.equal(d.families.get('spend').orchestrator, 'spend.js')
  assert.deepEqual([...d.loose].sort(), ['common.js', 'first-setup.js', 'git.js'])
})

test('expectedFamily follows the tree: prefix, harness, declared orchestrator, loose', () => {
  const d = g.declaredFamilies(FAMILIES)
  assert.equal(g.expectedFamily(`${LIB}lane-calls.js`, d), 'lane')
  assert.equal(g.expectedFamily(`${LIB}harness/muse.js`, d), 'harness')
  assert.equal(g.expectedFamily(`${LIB}lanes.js`, d), 'lane')
  assert.equal(g.expectedFamily(`${LIB}git.js`, d), 'none')
  assert.equal(g.expectedFamily(`${LIB}first-setup.js`, d), 'none')
  assert.ok(g.expectedFamily(`${LIB}mystery.js`, d).problem)
  assert.equal(g.expectedFamily('plugins/aether/bin/aether-plan', d), null)
})

test('headerProblems asks for what it is, and in lib/ for the family', (t) => {
  const root = tree(t, {
    'docs/reference/components.md': FAMILIES,
    [`${LIB}lane-calls.js`]: "'use strict'\n\n// The calls of a lane: start, wait, result and stop of one external harness call.\n// Family: lane.\n\nconst x = 1\n",
    [`${LIB}lane-bad.js`]: "'use strict'\n\n// Short.\n\nconst x = 1\n",
    [`${LIB}lane-wrong.js`]: "'use strict'\n\n// The calls of a lane, written down here in full words.\n// Family: spend.\n",
    'plugins/aether/bin/aether-x': "#!/usr/bin/env node\n'use strict'\n\n// aether-x does one thing and calls lib/x.js to do it, nothing else here.\n",
  })
  const declared = g.declaredFamilies(fs.readFileSync(path.join(root, 'docs/reference/components.md'), 'utf8'))
  assert.deepEqual(g.headerProblems(`${LIB}lane-calls.js`, { root, declared }), [])
  assert.ok(g.headerProblems(`${LIB}lane-bad.js`, { root, declared }).length >= 1)
  assert.ok(g.headerProblems(`${LIB}lane-wrong.js`, { root, declared }).some((p) => /Family/.test(p)))
  assert.deepEqual(g.headerProblems('plugins/aether/bin/aether-x', { root, declared }), [])
})

test('citations name numbers that exist', (t) => {
  const root = tree(t, {
    'docs/decisions.md': '## D3. x\n\n| A12 | text | Decided |\n',
    'specs/013-delegate-ladder/spec.md': 'x',
    [`${LIB}a.js`]: '// See A12, D3 and spec 013 (specs/013-delegate-ladder).\nconst x = 1\n',
    [`${LIB}b.js`]: '// See A99, D77, spec 777 and specs/888-none.\nconst A99 = 1\n',
  })
  assert.deepEqual(g.citationsOf('// A12 and spec 013\ncode A5\n').decisions, ['A12'])
  assert.deepEqual(g.citationProblems(`${LIB}a.js`, { root }), [])
  assert.equal(g.citationProblems(`${LIB}b.js`, { root }).length, 4)
})

test('duplicate groups are found by normalized body, name or not, and a different body is not a duplicate', (t) => {
  const root = tree(t, {
    [`${LIB}one.js`]: 'function isObject(value) {\n  // a comment\n  return value !== null && typeof value === "object"\n}\nmodule.exports = { isObject }\n',
    [`${LIB}two.js`]: 'const isPlain = (value) => {\n  return value !== null &&   typeof value === "object"\n}\nmodule.exports = { isPlain }\n',
    [`${LIB}three.js`]: 'function other(value) {\n  return Array.isArray(value) && value.length > 3\n}\nmodule.exports = { other }\n',
  })
  const groups = g.duplicateGroups([`${LIB}one.js`], { root })
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].names.sort(), ['isObject', 'isPlain'])
  assert.deepEqual(g.duplicateGroups([`${LIB}three.js`], { root }), [])
})

test('deadNames finds an unused constant and an unused require, and spares exported and used names', (t) => {
  const root = tree(t, {
    [`${LIB}d.js`]: "const fs = require('node:fs')\nconst { join, sep } = require('node:path')\nconst UNUSED = 1\nconst USED = 2\nfunction exported() { return USED + join('a') }\nmodule.exports = { exported }\n",
  })
  assert.deepEqual(g.deadNames(`${LIB}d.js`, { root }).sort(), ['UNUSED', 'fs', 'sep'])
})

test('the require graph finds a cycle, even one asked for inside a function', (t) => {
  const root = tree(t, {
    [`${LIB}a.js`]: "const b = require('./b.js')\n",
    [`${LIB}b.js`]: "function late() { return require('./a.js') }\n",
    [`${LIB}c.js`]: "const a = require('./a.js')\n",
  })
  const cycles = g.findCycles(g.requireGraph({ root }))
  assert.equal(cycles.length, 1)
  assert.deepEqual([...cycles[0]].sort(), [`${LIB}a.js`, `${LIB}b.js`])
})

test('adapterProblems refuses an adapter that asks for the module that runs it', (t) => {
  const root = tree(t, {
    [`${LIB}harness/ok.js`]: "const s = require('./structured.js')\nconst c = require('../common.js')\n",
    [`${LIB}harness/bad.js`]: "const lanes = require('../lanes.js')\n",
  })
  assert.deepEqual(g.adapterProblems(`${LIB}harness/ok.js`, { root }), [])
  assert.equal(g.adapterProblems(`${LIB}harness/bad.js`, { root }).length, 1)
})

test('moduleFiles lists lib, bin and hooks, and not tests', (t) => {
  const root = tree(t, { [`${LIB}a.js`]: '', [`${LIB}harness/b.js`]: '', 'plugins/aether/bin/aether-x': '', 'plugins/aether/hooks/h.mjs': '', 'plugins/aether/hooks/h.test.ts': '', 'plugins/aether/hooks/hooks.json': '' })
  assert.deepEqual(g.moduleFiles({ root }), [`${LIB}a.js`, `${LIB}harness/b.js`, 'plugins/aether/bin/aether-x', 'plugins/aether/hooks/h.mjs'])
  assert.equal(typeof g.checkGroup, 'function')
})
