'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const LADDER = () => JSON.parse(read('plugins/aether/config/ladder.json'))

test('no file of lib/ or hooks/ repeats a rung of the ladder', () => {
  const files = execFileSync('git', ['ls-files', 'plugins/aether/lib', 'plugins/aether/hooks'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
    .filter((f) => /\.(js|mjs|jsx)$/.test(f) && !/\.test\./.test(f) && f !== 'plugins/aether/lib/ladder.js')
  const rung = /\bcorrections\s*[:=]\s*\d|\brepeatFindings\s*[:=]\s*\d|\bretry\s*:\s*'[a-z]+'/
  assert.deepEqual(files.filter((f) => rung.test(read(f))), [])
})

test('the ladder has the three rungs and the repeat count it had', () => {
  const ladder = LADDER()
  assert.deepEqual(ladder.rungs.map((rung) => [rung.step, rung.corrections]), [['haiku', 5], ['sonnet', 2], ['opus', 1]])
  assert.equal(ladder.repeatFindings, 2)
  assert.deepEqual(Object.keys(ladder).sort(), ['repeatFindings', 'rungs'])
})
