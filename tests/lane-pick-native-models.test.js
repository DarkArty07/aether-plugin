'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, runBin } = require('./helpers.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const { DELEGATE_USAGE } = require('../plugins/aether/lib/lane-delegate.js')
const fx = require('./lane-fixtures.js')

test('pick and delegate accept a new Claude model from the configured table and reject an absent model', (t) => {
  const { repo, args } = fx.laneRun(t)
  const pairs = loadPairs().pairs.filter((pair) => pair.harness === 'claude').map((pair) => ({
    ...pair, id: pair.id.replace('/opus@', '/opus-6@'),
    model: pair.model === 'opus' ? 'opus-6' : pair.model,
    family: pair.model === 'opus' ? 'claude-opus-6' : pair.family,
  }))
  const file = path.join(tempDir(t), 'pairs.json')
  fs.writeFileSync(file, JSON.stringify({ fetchedAt: '2026-10-19', pairs }))
  const env = { ...fx.laneEnv(t), AETHER_PAIRS_CONFIG: file, AETHER_LANE_HARNESSES: 'agy' }
  const brief = path.join(repo.dir, 'native-model-brief.md')
  fs.writeFileSync(brief, 'Implement the requested change.\n')

  const pick = (model) => fx.lane(args, 'pick', ['task-1-1-implement', '--role', 'implementer', '--model', model, '--effort', 'high'], env)
  const delegate = (model) => runBin(fx.LANE_BIN, ['delegate', '--brief', brief, '--model', model, '--effort', 'high', '--owns', 'src/**'], repo.dir, env)

  const picked = pick('opus-6')
  assert.equal(picked.status, 0, picked.stdout + picked.stderr)
  assert.equal(picked.json.reference.id, 'claude/opus-6@high')
  assert.equal(picked.json.picked, null)
  const delegated = delegate('opus-6')
  assert.equal(delegated.status, 0, delegated.stdout + delegated.stderr)
  assert.equal(delegated.json.status, 'no-candidate')

  const badPick = pick('opus')
  assert.equal(badPick.status, 1)
  assert.equal(badPick.json.error, '--model must be one of haiku, sonnet, opus-6, not opus')
  const badDelegate = delegate('opus')
  assert.equal(badDelegate.status, 1)
  assert.equal(badDelegate.json.error, `usage: aether-lane ${DELEGATE_USAGE}`)
  assert.equal(fx.agyTurns(env).length, 0)
})
