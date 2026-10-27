'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { CLASSES } = require('../plugins/aether/lib/autonomy.js')
const { irreversibleClass } = require('../plugins/aether/lib/guard.js')

const ROOT = path.join(__dirname, '..')
const SAMPLE = { 'merge-main': 'gh pr merge 12', push: 'git push origin main', publish: 'npm publish', deploy: 'terraform apply', delete: 'git branch -D old', credentials: 'gh auth login' }
const GRANT_ONLY = { 'paid-call': 'guard.js does not detect paid calls: the class is only granted and checked with aether-autonomy check' }
const skillTable = () => [...fs.readFileSync(path.join(ROOT, 'plugins/aether/skills/using-aether/SKILL.md'), 'utf8').matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1])
const check = (source, copy) => assert.deepEqual(copy, source)

test('every class is detected by the guard or declared as granted only, and nothing else is named', () => {
  assert.deepEqual([...Object.keys(SAMPLE), ...Object.keys(GRANT_ONLY)].sort(), [...CLASSES].sort())
  for (const reason of Object.values(GRANT_ONLY)) assert.ok(reason.length > 10)
})

for (const [cls, command] of Object.entries(SAMPLE)) {
  test(`the guard classifies "${command}" as ${cls}`, () => assert.equal(irreversibleClass(command), cls))
}

test('the table of the using-aether skill lists the classes of the source, in order', () => {
  check(CLASSES, skillTable())
})

test('a table that drifts is caught', () => {
  assert.throws(() => check(CLASSES, [...skillTable(), 'drift']))
  assert.throws(() => assert.equal(irreversibleClass('echo hello'), 'push'))
})
