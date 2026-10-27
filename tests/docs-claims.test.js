'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hits } = require('./retired-patterns.js')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const { CLASSES } = require('../plugins/aether/lib/autonomy.js')

test('CLAUDE.md lists exactly the irreversible classes the guard and the grants know', () => {
  const line = read('CLAUDE.md').split('\n').find((l) => l.includes('aether-guard') && l.includes('irreversible'))
  assert.ok(line)
  for (const cls of CLASSES) assert.ok(line.includes(`\`${cls}\``), cls)
})

test('every bin of plugins/aether/bin is named by docs/reference/components.md', () => {
  const text = read('docs/reference/components.md')
  for (const bin of fs.readdirSync(path.join(ROOT, 'plugins/aether/bin'))) assert.ok(text.includes(bin), bin)
})

test('CLAUDE.md no longer says the old options stay as legacy keys, and names the modules the layers added', () => {
  const text = read('CLAUDE.md')
  assert.doesNotMatch(text, /legacy keys/)
  for (const name of ['common.js', 'lane-process.js', 'plan-compile.js']) assert.ok(text.includes(name) || read('docs/reference/components.md').includes(name), name)
})

test('the lanes guide says codex and cursor are not tested with a real account, and that a model only takes the roles of its list', () => {
  const guide = read('docs/guide/lanes.md')
  assert.ok(guide.includes('Codex and Cursor are not tested with a real account.'))
  assert.match(guide, /roles/)
  assert.match(guide, /native/)
})

test('lanes.md does not say the session start or aether-report reports old option values', () => {
  const guide = read('docs/guide/lanes.md')
  const options = read('docs/guide/options.md')
  assert.doesNotMatch(guide, /tell you which old value was read or ignored/)
  assert.doesNotMatch(guide, /old option values were ignored or reinterpreted/)
  assert.match(guide, /Earlier releases read the old options: If `superdelegation` is not set and `lanes` is on/)
  assert.match(guide, /This release reads only `superdelegation`/)
  const present = [
    'turns it on only when the value is `true`',
    'a saved `lanes` or `seats` value is not read',
  ]
  for (const phrase of present) {
    assert.ok(options.includes(phrase), `options.md: ${phrase}`)
    assert.ok(guide.includes(phrase), `lanes.md: ${phrase}`)
  }
})

test('the README, CLAUDE.md, the guides and the reference name no retired option, journal or legacy variable', () => {
  const files = ['README.md', 'CLAUDE.md', 'docs/reference/components.md', ...fs.readdirSync(path.join(ROOT, 'docs/guide')).map((f) => `docs/guide/${f}`)]
  assert.deepEqual(hits(['options', 'journal'], { docs: true }).filter((hit) => files.includes(hit.file)), [])
})
