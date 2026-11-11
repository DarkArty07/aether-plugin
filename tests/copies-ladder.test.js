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
    .filter((f) => /\.(js|mjs|jsx)$/.test(f) && !/\.test\./.test(f) && f !== 'plugins/aether/lib/ladder.js' && f !== 'plugins/aether/lib/pareto.js')
  const rung = /\bsupervisorFloor\s*[:=]\s*\d|\bminJumpPoints\s*[:=]\s*[\d.]|\brepeatBlocked\s*[:=]\s*\d|\bcorrections\s*[:=]\s*\d/
  assert.deepEqual(files.filter((f) => rung.test(read(f))), [])
})

test('the ladder has the four keys and five rungs of the task', () => {
  const ladder = LADDER()
  assert.deepEqual(ladder.rungs.map((rung) => [rung.step, rung.model, rung.effort]), [
    ['haiku-high', 'haiku', 'high'],
    ['haiku-xhigh', 'haiku', 'xhigh'],
    ['sonnet-high', 'sonnet', 'high'],
    ['opus-high', 'opus', 'high'],
    ['opus-xhigh', 'opus', 'xhigh'],
  ])
  assert.equal(ladder.repeatBlocked, 2)
  assert.equal(ladder.supervisorFloor, 3)
  assert.deepEqual(ladder.law, { candidateEfforts: ['high', 'xhigh'], minJumpPoints: 2 })
  assert.deepEqual(Object.keys(ladder).sort(), ['law', 'repeatBlocked', 'rungs', 'supervisorFloor'])
})
