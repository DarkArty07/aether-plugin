'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { TIERS } = require('../plugins/aether/lib/plan.js')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const LADDER = () => JSON.parse(read('plugins/aether/config/ladder.json'))
const check = (source, copy) => assert.equal(copy, source)

test('the steps of the ladder are the tiers of a plan', () => {
  assert.deepEqual(LADDER().rungs.map((rung) => rung.step), TIERS)
})

test('the retry of haiku in effortFor is the retry effort of the haiku rung', () => {
  const source = () => LADDER().rungs.find((rung) => rung.step === 'haiku').effort.retry
  const copy = () => read('plugins/aether/workflows/run.workflow.js').match(/return model === 'haiku' \? '([a-z]+)' : task\.effort/)[1]
  check(source(), copy())
  assert.throws(() => check(source(), copy() + 'x'))
})

test('the attempts of the swarm are another datum, declared as such', () => {
  const text = read('plugins/aether/lib/plan.js')
  assert.match(text, /\/\/ The swarm's attempts per tier: another datum than config\/ladder\.json[^\n]*\nconst DEFAULT_LADDER = \{ haiku: 2, sonnet: 2, opus: 1 \}/)
})

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
