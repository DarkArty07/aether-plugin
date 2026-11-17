'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, PLUGIN } = require('./helpers.js')
const { countRequirements, loadThreshold, requirementsResult } = require('../plugins/aether/lib/plan-requirements.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-plan')
const spec = (n) => ['# Spec', '', '## Requirements', '', ...Array.from({ length: n }, (_, i) => `- R${i + 1}: requirement ${i + 1}. Serves: C1`), '', '## Assumptions', '  - R99: not a requirement line, it is indented'].join('\n')

test('R3: the threshold is data in config/design.json', () => {
  assert.equal(loadThreshold(), 15)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(PLUGIN, 'config', 'design.json'), 'utf8')), { mapMinRequirements: 15 })
})

test('R3: countRequirements counts the lines "- Rn:" and nothing else', () => {
  assert.equal(countRequirements(spec(14)), 14)
  assert.equal(countRequirements('- R1: a\n  - R2: nested\n- C1. a criterion\nR3: no dash\n'), 1)
})

test('R3: requirementsResult is map at the threshold and not below it', () => {
  assert.deepEqual(requirementsResult(spec(14), 15), { requirements: 14, threshold: 15, map: false })
  assert.deepEqual(requirementsResult(spec(15), 15), { requirements: 15, threshold: 15, map: true })
})

test('R3: the verb prints the result of the spec it is given, and writes nothing', (t) => {
  const dir = tempDir(t, 'aether-req-')
  const file = path.join(dir, 'spec.md')
  for (const [n, map] of [[14, false], [15, true]]) {
    fs.writeFileSync(file, spec(n))
    const r = spawnSync(process.execPath, [BIN, 'requirements', file], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(JSON.parse(r.stdout.trim()), { requirements: n, threshold: 15, map })
  }
  assert.deepEqual(fs.readdirSync(dir), ['spec.md'])
})

test('R3: the verb fails with a JSON error on a missing file', (t) => {
  const r = spawnSync(process.execPath, [BIN, 'requirements', path.join(tempDir(t, 'aether-req-'), 'nope.md')], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.equal(JSON.parse(r.stdout.trim()).ok, false)
})

test('R3: the number of the threshold is written nowhere else in the code', () => {
  const files = []
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name) || path.basename(p) === 'aether-plan') files.push(p) } }
  for (const sub of ['lib', 'bin', 'workflows', 'hooks']) walk(path.join(PLUGIN, sub))
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    assert.ok(!/mapMinRequirements/.test(text) || file.endsWith('plan-requirements.js'), `${file} names mapMinRequirements`)
    assert.ok(!/(>=|>|===|<)\s*15\b.*requirement|requirement.*(>=|>|===|<)\s*15\b/i.test(text), `${file} compares requirements with 15`)
  }
})
