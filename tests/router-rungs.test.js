'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN } = require('./helpers.js')
const rungs = require('../plugins/aether/lib/router-rungs.js')

const read = (...parts) => JSON.parse(fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8'))
const index = read('config', 'models', 'models.json')
const lanesConfig = read('config', 'lanes.json')
const table = rungs.loadRungs()
const find = (harness, model, effort) => table.rungs.find((r) => r.harness === harness && r.model === model && r.effort === effort)

test('levelOf cuts each axis at its bands', () => {
  const cases = [
    ['general', 37.4, 'A'], ['general', 37.5, 'B'], ['general', 44.9, 'B'], ['general', 45, 'C'], ['general', 54.9, 'C'], ['general', 55, 'D'],
    ['code', 0.179, 'A'], ['code', 0.18, 'B'], ['code', 0.349, 'B'], ['code', 0.35, 'C'], ['code', 0.579, 'C'], ['code', 0.58, 'D'],
  ]
  for (const [axis, score, level] of cases) assert.equal(rungs.levelOf(axis, score), level, `${axis} ${score}`)
})

test('the committed table is what the index and the lane table derive (R13)', () => {
  const derived = JSON.parse(JSON.stringify(rungs.deriveRungs(index, lanesConfig)))
  assert.deepEqual(table, derived)
  assert.equal(table.generatedFrom, 'config/models/models.json')
})

test('the generator checks the committed file (R13)', () => {
  const script = path.join(__dirname, '..', 'scripts', 'build-router-rungs.js')
  const r = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

test('the levels of the evidence (C6): each rung is placed where it measures', () => {
  assert.equal(find('claude', 'claude-haiku-5-5', 'high').levels.general, 'B')
  assert.equal(find('claude', 'claude-sonnet-5-5', 'max').levels.general, 'D')
  assert.equal(find('claude', 'claude-opus-5-5', 'xhigh').levels.general, 'D')
  assert.equal(find('grok', 'grok-4.7', 'low').levels.general, 'B')
  assert.equal(find('grok', 'grok-4.7', 'low').levels.code, 'A')
  assert.equal(find('grok', 'grok-4.7', 'xhigh').levels.general, 'C')
  assert.equal(find('agy', 'gemini-3.8-flash', 'low').levels.general, 'A')
  assert.equal(find('agy', 'gemini-3.8-flash', 'medium').levels.general, 'B')
  assert.equal(find('agy', 'claude-opus-5-5', 'high').levels, null, 'what agy serves under a Claude name is not measured here (R15)')
})

test('the bands are cut-off points that never overlap, and a score equal to a cut goes to the upper level (R13)', () => {
  for (const axis of ['general', 'code']) {
    const cuts = rungs.BANDS[axis]
    assert.equal(cuts.length, 3, axis)
    assert.ok(cuts[0] < cuts[1] && cuts[1] < cuts[2], `${axis}: the cuts rise`)
    const top = axis === 'general' ? 100 : 1
    let last = 0
    for (let i = 0; i <= 10000; i++) {
      const rank = rungs.LEVELS.indexOf(rungs.levelOf(axis, (i * top) / 10000))
      assert.ok(rank >= last, `${axis}: a higher score never gives a lower level`)
      last = rank
    }
    cuts.forEach((cut, i) => assert.equal(rungs.levelOf(axis, cut), rungs.LEVELS[i + 1], `${axis} at the cut ${cut}`))
  }
  assert.deepEqual(table.bands, rungs.BANDS)
})

test('the members of each band of the evidence land in it on the intelligence axis (R13)', () => {
  const evidence = { A: [29, 36], B: [38, 43], C: [46, 54], D: [56, 58] }
  for (const [level, [low, high]] of Object.entries(evidence)) {
    for (const score of [low, high]) assert.equal(rungs.levelOf('general', score), level, `${score}`)
  }
})

test('the rungs the scenarios 8, 17 and 18 name sit in level B', () => {
  assert.equal(find('grok', 'grok-4.7', 'low').levels.general, 'B')
  assert.equal(find('agy', 'gemini-3.8-flash', 'medium').levels.general, 'B')
  assert.equal(rungs.pickRung(table, { harness: 'grok', level: 'B', axis: 'general' }).id, 'grok/grok-4.7/low')
  assert.equal(rungs.pickRung(table, { harness: 'agy', level: 'B', axis: 'general', group: 'gemini' }).id, 'agy/gemini-3.8-flash/medium')
})

test('a rung keeps the native effort name of its harness, the one the CLI takes (R16)', () => {
  for (const r of table.rungs) {
    const entry = index.models.find((m) => m.harness === r.harness && m.model === r.model)
    assert.ok(entry.efforts.includes(r.effort), r.id)
  }
  assert.equal(find('grok', 'grok-4.7', 'xhigh').effort, 'xhigh', 'lanes.json maps xhigh to high for the swarm; the router keeps the native name')
})

test('the same effort name is a different level in two models (C7, R16)', () => {
  const at = (model, effort) => rungs.levelOfRung(table, { harness: 'claude', model, effort }, 'general')
  assert.equal(at('haiku', 'high'), 'B')
  assert.equal(at('claude-haiku-5-5', 'high'), 'B')
  assert.equal(at('sonnet', 'high'), 'C')
  assert.equal(at('sonnet', 'low'), 'A')
  assert.equal(at('opus', 'low'), 'B')
  assert.equal(rungs.levelOfRung(table, { harness: 'claude', model: 'fable', effort: 'high' }, 'general'), null)
})

test('a rung is measured or unmeasured, and says why (R15, A-12)', () => {
  assert.equal(find('claude', 'claude-haiku-5-5', 'low').status, 'measured')
  assert.equal(find('agy', 'gemini-3.8-flash', 'high').status, 'measured')
  assert.equal(find('grok', 'grok-4.7', 'high').status, 'measured')
  assert.equal(find('claude', 'claude-sonnet-5-5', 'medium').status, 'measured', 'the same name on the native API is measured')
  for (const [model, effort] of [['claude-sonnet-5-5', 'medium'], ['claude-opus-5-5', 'high']]) {
    const rung = find('agy', model, effort)
    assert.equal(rung.status, 'unmeasured', `${model} ${effort}: the native API was measured, not agy`)
    assert.equal(rung.why, 'native-measure-only')
    assert.equal(rung.levels, null)
    assert.equal(rungs.levelOfRung(table, { harness: 'agy', model, effort }, 'general'), null)
  }
  const unmeasured = find('grok', 'grok-4.7', 'medium')
  assert.equal(unmeasured.status, 'unmeasured')
  assert.equal(unmeasured.why, 'no-score')
  assert.equal(unmeasured.scores, null)
  assert.equal(unmeasured.levels, null)
  assert.equal(rungs.levelOfRung(table, { harness: 'grok', model: 'grok-4.7', effort: 'medium' }, 'general'), null)
})

test('only the models that take an implementer are eligible, and there is no codex or cursor rung (R20)', () => {
  assert.ok(table.rungs.filter((r) => r.model === 'gemini-4-argon').every((r) => r.eligible === false))
  assert.ok(table.rungs.filter((r) => r.harness === 'grok').every((r) => r.eligible === true))
  assert.ok(table.rungs.filter((r) => r.harness === 'claude').every((r) => r.eligible === true && r.alias !== null))
  assert.ok(table.rungs.every((r) => ['claude', 'agy', 'grok'].includes(r.harness)))
})

test('pickRung gives the lowest level that reaches the one asked, then the cheapest, then the lowest effort', () => {
  const pick = (harness, level, axis, group) => rungs.pickRung(table, { harness, level, axis, group })
  const show = (r) => r && `${r.model}:${r.effort}`
  assert.equal(show(pick('claude', 'A', 'general')), 'claude-haiku-5-5:low')
  assert.equal(show(pick('claude', 'B', 'general')), 'claude-haiku-5-5:high')
  assert.equal(show(pick('claude', 'C', 'general')), 'claude-sonnet-5-5:high')
  assert.equal(show(pick('claude', 'D', 'general')), 'claude-sonnet-5-5:max')
  assert.equal(show(pick('grok', 'B', 'general')), 'grok-4.7:low')
  assert.equal(show(pick('grok', 'B', 'code')), 'grok-4.7:high')
  assert.equal(show(pick('grok', 'A', 'general')), 'grok-4.7:low', 'grok has no level A: the lowest above it')
  assert.equal(show(pick('agy', 'B', 'general', 'gemini')), 'gemini-3.8-flash:medium')
  assert.equal(pick('agy', 'B', 'general', 'claude'), null, 'agy serves the Claude names unmeasured: no level (A-12)')
  assert.equal(pick('agy', 'C', 'general'), null)
  assert.equal(pick('agy', 'D', 'general'), null)
  assert.equal(pick('grok', 'D', 'general'), null)
  assert.equal(pick('codex', 'B', 'general'), null)
})
