'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { ensureExcluded } = require('../plugins/aether/lib/run.js')
const { hits } = require('./retired-patterns.js')

test('an unanchored line an earlier version wrote is kept as it is, and the anchored ones are added after it', (t) => {
  const dir = tempDir(t)
  fs.mkdirSync(path.join(dir, 'info'))
  fs.writeFileSync(path.join(dir, 'info', 'exclude'), 'node_modules\n.aether/\n.aether-tmp/\n')
  ensureExcluded(dir)
  ensureExcluded(dir)
  assert.equal(fs.readFileSync(path.join(dir, 'info', 'exclude'), 'utf8'), 'node_modules\n.aether/\n.aether-tmp/\n/.aether/\n/.aether-tmp/\n/.aether-exam/\n')
})

test('the compatibility branch for the old exclude lines is not in lib/run.js', () => {
  assert.deepEqual(hits(['formats']).filter((hit) => hit.file === 'plugins/aether/lib/run.js'), [])
})
