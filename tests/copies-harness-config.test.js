'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const json = (rel) => JSON.parse(read(rel))
const quoted = (text) => [...text.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
const SOURCE = () => require('../plugins/aether/lib/harness/index.js').HARNESS_NAMES
const check = (source, copy) => assert.deepEqual(copy, source)

const COPIES = [
  { datum: 'the harness names in the lane table', owner: 'Task 39', why: 'one entry per harness the table knows',
    copy: () => Object.keys(json('plugins/aether/config/lanes.json').harnesses) },
  { datum: 'the harness names in the description of the harnesses option', owner: 'Task 39', why: 'the option text lists what the owner may turn on',
    copy: () => json('plugins/aether/.claude-plugin/plugin.json').userConfig.harnesses.description.match(/comma-separated: ([a-z, ]+)\./)[1].split(', ') },
  { datum: 'the harness names in the models index script', owner: 'Task 39', why: 'the script runs outside the plugin and cannot import lib/; claude is the native harness, first',
    copy: () => quoted(read('scripts/build-models-index.js').match(/const HARNESSES = \[([^\]]*)\]/)[1]).slice(1), claudeFirst: () => quoted(read('scripts/build-models-index.js').match(/const HARNESSES = \[([^\]]*)\]/)[1])[0] },
]

for (const entry of COPIES) {
  test(`${entry.datum} equals the source`, () => {
    check(SOURCE(), entry.copy())
    if (entry.claudeFirst) assert.equal(entry.claudeFirst(), 'claude')
  })
  test(`${entry.datum}: a copy that drifts is caught`, () => assert.throws(() => check(SOURCE(), [...entry.copy(), 'drift'])))
  test(`${entry.datum}: it has an owner and a reason to be a copy`, () => {
    assert.match(entry.owner, /^Task \d+$/)
    assert.ok(entry.why.length > 10)
  })
}

// Declared as a subset: the harnesses the models index keeps, chosen by the owner (claude, the native one, and three lanes).
const CHOSEN = ['claude', 'agy', 'grok', 'muse']
test('the chosen harnesses of the models index are claude and some of the source, in the same three places', () => {
  for (const name of CHOSEN.slice(1)) assert.ok(SOURCE().includes(name), name)
  assert.deepEqual(json('plugins/aether/config/models/models.json').harnesses, CHOSEN)
  assert.deepEqual(quoted(read('scripts/build-models-index.js').match(/const DEFAULT_HARNESSES = \[([^\]]*)\]/)[1]), CHOSEN)
  assert.deepEqual(Object.keys(json('plugins/aether/config/models/harness-models.json').harnesses), CHOSEN)
})

test('a chosen list that drifts is caught', () => {
  assert.throws(() => assert.deepEqual([...CHOSEN, 'drift'], json('plugins/aether/config/models/models.json').harnesses))
})
