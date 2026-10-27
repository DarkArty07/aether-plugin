'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const quoted = (text) => [...text.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
const SOURCE = () => require('../plugins/aether/lib/harness/index.js').HARNESS_NAMES
const check = (source, copy) => assert.deepEqual(copy, source)

const COPIES = [
  { datum: 'the harness names in the panel view of the mod', owner: 'Task 38', why: 'the mod never imports lib/, so it keeps its own list',
    copy: () => quoted(read('plugins/aether/hooks/panel-view.mjs').match(/export const HARNESS_NAMES = \[([^\]]*)\]/)[1]) },
  { datum: 'the harness names in the mod tests', owner: 'Task 6', why: 'a TypeScript test of the mod, which cannot import lib/',
    copy: () => quoted(read('plugins/aether/hooks/panel.test.tsx').match(/const NAMES = \[([^\]]*)\]/)[1]) },
  { datum: 'the harness names in the panel layout test', owner: 'Task 5', why: 'one fixed list for the layout cases',
    copy: () => quoted(read('tests/panel-layout.test.js').match(/const NAMES = \[([^\]]*)\]/)[1]) },
]

for (const entry of COPIES) {
  test(`${entry.datum} equals the source`, () => check(SOURCE(), entry.copy()))
  test(`${entry.datum}: a copy that drifts is caught`, () => assert.throws(() => check(SOURCE(), [...entry.copy(), 'drift'])))
  test(`${entry.datum}: it has an owner and a reason to be a copy`, () => {
    assert.match(entry.owner, /^Task \d+$/)
    assert.ok(entry.why.length > 10)
  })
}
