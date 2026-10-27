'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { requireGraph, findCycles } = require('./guards-helpers.js')

test('lib/ has no cycle', () => {
  assert.deepEqual(findCycles(requireGraph({})), [])
})

test('the lane process helpers and the token counter are leaves the orchestrators ask for', () => {
  const graph = requireGraph({})
  const edges = (name) => (graph.get(`plugins/aether/lib/${name}`) || []).map((f) => f.replace('plugins/aether/lib/', ''))
  assert.ok(!edges('spend.js').includes('lanes.js'))
  assert.ok(edges('lanes.js').includes('lane-process.js'))
  assert.deepEqual(edges('lane-process.js').filter((f) => !['common.js', 'run.js'].includes(f)), [])
  assert.deepEqual(edges('spend-tokens.js'), [])
})

test('lanes.js still exposes the process helpers its callers use', () => {
  const lanes = require('../plugins/aether/lib/lanes.js')
  const proc = require('../plugins/aether/lib/lane-process.js')
  for (const name of ['commandPath', 'commandInstalled', 'laneEnv', 'killGroup', 'killMarked']) assert.equal(lanes[name], proc[name], name)
  assert.equal(lanes.laneTokens, require('../plugins/aether/lib/spend-tokens.js').laneTokens)
})
