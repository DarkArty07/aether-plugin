'use strict'

// One preparation of the quota view that choose reads (R25). The delegate, the swarm and a design seat
// give the same pair they gave before this function existed, and none of the three keeps its own copy.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo } = require('./helpers.js')
const fx = require('./lane-fixtures.js')
const { pairStep } = require('../plugins/aether/lib/router-pick.js')
const { pickData } = require('../plugins/aether/lib/pick-data.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const { spawnSync } = require('node:child_process')

const LIB = path.join(PLUGIN, 'lib')
const readLib = (name) => fs.readFileSync(path.join(LIB, name), 'utf8')

const real = lanes.loadConfig(lanes.CONFIG_FILE)
const config = JSON.parse(JSON.stringify(real))
for (const harness of Object.values(config.harnesses)) {
  for (const model of Object.values(harness.models)) {
    if (!model.roles.includes('reviewer')) model.roles = [...model.roles, 'reviewer']
  }
}
const NOW = Date.parse('2026-10-20T12:00:00-06:00')
const H = 3600 * 1000
const MIN = 60 * 1000
const win = (remaining, hours) => ({ remaining, resetsAt: new Date(NOW + hours * H).toISOString() })
const weekly = (remaining, hours) => ({ windows: { weekly: win(remaining, hours) } })
const gemini = (remaining, hours) => ({ windows: { '5h': win(1, 5), weekly: win(remaining, hours) } })
const geminiKeys = (remaining, hours) => ({ argon: gemini(remaining, hours), flash: gemini(remaining, hours) })
const agy = (groups, readAt = NOW - 2 * MIN) => ({ readAt, groups })
const GROK = { readAt: NOW - MIN, groups: { grok: weekly(0.95, 29.6) } }
const MUSE = { readAt: NOW - MIN, groups: { muse: { windows: { '5h': win(1, 5), weekly: win(0.9, 50) } } } }
config.harnesses.codex.models = {
  'gpt-6.1-sol': { group: 'codex', roles: ['implementer', 'supervisor', 'reviewer'] },
  'gpt-6.1-terra': config.harnesses.codex.models['gpt-6.1-terra'],
  'gpt-6-luna': config.harnesses.codex.models['gpt-6-luna'],
}
const claude = (model, effort, intelligence, costPerTaskUsd) => ({ id: `claude/${model}@${effort}`, harness: 'claude', model, family: `claude-${model}-5-5`, effort, group: null, intelligence, costPerTaskUsd })
const external = (harness, model, effort, group, intelligence, costPerTaskUsd, extra = {}) => ({ id: `${harness}/${model}@${effort}`, harness, model, family: model, effort, group, intelligence, costPerTaskUsd, ...extra })
const PAIRS = [
  claude('haiku', 'high', 37.8, 0.08),
  claude('sonnet', 'high', 46.8, 0.88),
  claude('opus', 'high', 53.6, 1.82),
  claude('opus', 'xhigh', 56, 3.46),
  external('agy', 'gemini-3.8-flash', 'medium', 'flash', 39.8, 0.93),
  external('agy', 'gemini-4-argon', 'high', 'argon', 52.6, 1.99),
  external('agy', 'claude-sonnet-5-5', 'high', 'claude', 46.8, 0.88),
  external('grok', 'grok-4.7', 'high', 'grok', 46.3, 2.73),
  external('muse', 'muse-wonder-full-1.0', 'high', 'muse', 53.6, null, { ownerDecision: 'by the owner' }),
  external('codex', 'gpt-6.1-sol', 'medium', 'codex', 46.1, 0.115),
]

function delegateDeps(readings) {
  return {
    now: () => NOW,
    sleep: async () => {},
    lanesConfig: () => config,
    pairs: () => PAIRS,
    installed: () => true,
    marks: () => [],
    readings: () => readings,
    renew: () => ({ started: true, running: true }),
    lift: () => {},
  }
}

test('pickData is the one view preparation, and the three entry points call it', () => {
  assert.equal(typeof pickData, 'function')
  const pick = readLib('pick-data.js')
  assert.match(pick, /function pickData/)
  assert.match(pick, /liveMarks/)
  assert.match(pick, /readAllMarks/)
  assert.match(pick, /Family: none/)

  const router = readLib('router-pick.js')
  const quota = readLib('lane-quota.js')
  const seat = readLib('seats.js')
  for (const [name, text] of [['router-pick.js', router], ['lane-quota.js', quota], ['seats.js', seat]]) {
    assert.ok(text.includes('pickData'), `${name} calls pickData`)
  }
  assert.doesNotMatch(router, /liftable|groupView/)
  assert.doesNotMatch(seat, /liftable|groupView/)
  const harnessView = quota.slice(quota.indexOf('function harnessView'), quota.indexOf('async function refresh'))
  assert.match(harnessView, /pickData/)
  assert.doesNotMatch(harnessView, /liftable|groupView/)
  assert.equal((pick.match(/function groupView|liftable\(/g) || []).length > 0, true)
})

test('a delegate still takes the pair of the quota that renews first', async () => {
  const readings = { agy: agy({ ...geminiKeys(1, 60), claude: weekly(0.9, 40) }), grok: GROK, muse: MUSE }
  const step = await pairStep(delegateDeps(readings), { harnesses: ['agy', 'grok', 'muse'], deadlines: { haikuMs: 8000, jevMs: 3000, quotaMs: 3000 } }, { reference: { model: 'sonnet', effort: 'high' } })
  assert.equal(step.pick && step.pick.id, 'grok/grok-4.7@high')
  assert.deepEqual(step.quota.filter((row) => row.outcome === 'next').map((row) => row.id), ['agy/claude-sonnet-5-5@high', 'muse/muse-wonder-full-1.0@high', 'agy/gemini-4-argon@high'])
})

test('the swarm still takes the pair of the quota that renews first', (t) => {
  const { args } = fx.laneRun(t)
  const HOUR = 3600 * 1000
  const inHours = (h) => new Date(Date.now() + h * HOUR).toISOString()
  const claudeFirst = { 'Gemini Models': [0.9, 0.9, null, inHours(200)], 'Claude and GPT models': [0.9, 0.9, null, inHours(40)] }
  const env = { ...fx.laneEnv(t, { quota: claudeFirst }), AETHER_LANE_HARNESSES: 'agy' }
  const r = fx.lane(args, 'pick', ['task-1-1-implement', '--role', 'implementer', '--model', 'sonnet', '--effort', 'xhigh'], env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.requested, 49.6)
  assert.equal(r.json.picked.id, 'agy/claude-opus-5-5@high')
  assert.equal(r.json.reference.id, 'claude/sonnet@xhigh')
})

test('a design seat still takes Argon when Gemini renews first, at the Opus high floor', (t) => {
  const repo = makeRepo(t)
  const feature = 'specs/001-demo'
  fs.mkdirSync(path.join(repo.dir, feature), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, feature, 'spec.md'), '# Demo\n\n## Criteria\n\n- C1: it works.\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'spec')
  const table = loadPairs()
  const next = table.pairs.map((pair) => (pair.id === 'agy/gemini-4-argon@high' ? { ...pair, intelligence: 51.7 } : pair))
  const pairsFile = path.join(repo.dir, 'pairs.json')
  fs.writeFileSync(pairsFile, JSON.stringify({ fetchedAt: table.fetchedAt, pairs: next }))
  const DAY = 86400000
  const env = {
    ...fx.laneEnv(t, { quota: {
      'Gemini Models': [0.9, 0.9, null, new Date(Date.now() + 2 * DAY).toISOString()],
      'Claude and GPT models': [0.9, 0.9, null, new Date(Date.now() + 3 * DAY).toISOString()],
    } }),
    AETHER_PAIRS_CONFIG: pairsFile,
    AETHER_LANE_HARNESSES: 'agy',
  }
  const answer = { verdict: 'approve', findings: [], openQuestions: [] }
  const input = `Review ${feature}/spec.md.\nFAKE-AGY: answer ${JSON.stringify(answer)}\n`
  const r = spawnSync(process.execPath, [path.join(PLUGIN, 'bin', 'aether-lane'), 'seat', 'judge', '--session', 's1', '--author', 'sonnet', '--feature', feature], {
    cwd: repo.dir,
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  const json = JSON.parse(r.stdout.trim().split('\n').pop())
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(json.harness, 'agy')
  assert.equal(json.model, 'gemini-4-argon')
})
