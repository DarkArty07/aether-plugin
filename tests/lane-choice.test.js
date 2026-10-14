'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { tempDir } = require('./helpers.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const choice = require('../plugins/aether/lib/lane-choice.js')

const RUN = '20261014-060800-ab12'
const NOW = Date.parse('2026-10-14T06:08:00Z')
const TODAY_ORDER = 'grok:grok-4.7:0.013331:picked:absent/agy:gemini-3.8-flash:0.006044:untried/agy:claude-sonnet-5-5:excluded:reserve'
const flags = (extra = {}) => ({ role: 'implementer', tier: 'haiku', effort: 'xhigh', pick: 'grok:grok-4.7', order: TODAY_ORDER, ...extra })

test('a pick is native or a harness and a model', () => {
  assert.equal(choice.parsePick('native'), null)
  assert.deepEqual(choice.parsePick('grok:grok-4.7'), { harness: 'grok', model: 'grok-4.7' })
  assert.deepEqual(choice.parsePick('agy:claude-sonnet-5-5'), { harness: 'agy', model: 'claude-sonnet-5-5' })
  for (const bad of ['', 'grok', 'grok:', ':grok-4.7', 'grok:grok 4.7', 'grok:grok-4.7:extra', 'Grok:grok-4.7', 'grok:-x']) {
    assert.throws(() => choice.parsePick(bad), /--pick must be native or <harness>:<model>/, bad)
  }
})

test('an order is a list of candidates, each with its priority or state, its outcome and whether its share was read as 0% used', () => {
  assert.deepEqual(choice.parseOrder(TODAY_ORDER), [
    { harness: 'grok', model: 'grok-4.7', state: 'priority', priority: 0.013331, outcome: 'picked', usedPercentAbsent: true },
    { harness: 'agy', model: 'gemini-3.8-flash', state: 'priority', priority: 0.006044, outcome: 'untried', usedPercentAbsent: false },
    { harness: 'agy', model: 'claude-sonnet-5-5', state: 'excluded', priority: null, outcome: 'reserve', usedPercentAbsent: false },
  ])
  assert.deepEqual(choice.parseOrder('codex:gpt-codex:unknown:unavailable-not-installed'), [
    { harness: 'codex', model: 'gpt-codex', state: 'unknown', priority: null, outcome: 'unavailable-not-installed', usedPercentAbsent: false },
  ])
  assert.deepEqual(choice.parseOrder('grok:grok-4.7:1:pool-full').map((c) => [c.state, c.priority, c.outcome]), [['priority', 1, 'pool-full']])
  for (const outcome of ['picked', 'pool-full', 'untried', 'reserve', 'marked', 'not-installed', 'dry', 'unavailable-quota']) {
    assert.equal(choice.parseOrder(`agy:m:0.5:${outcome}`)[0].outcome, outcome)
  }
  for (const bad of ['', 'agy:m', 'agy:m:0.5', 'agy:m:high:picked', 'agy:m:0.5:won', 'agy:m:0.5:picked:yes', 'agy:m:0.5:picked/', 'agy:m:0.5:picked agy:n:0.4:untried', 'agy:m:-1:picked', 'agy:m:0.5:unavailable-']) {
    assert.throws(() => choice.parseOrder(bad), /--order has an item that is not/, JSON.stringify(bad))
  }
})

test('the reason says why the call went where it went', () => {
  const order = (token) => choice.parseOrder(token)
  assert.equal(
    choice.reasonOf({ harness: 'grok', model: 'grok-4.7' }, order(TODAY_ORDER)),
    'took grok grok-4.7, first in order (grok grok-4.7 0.013331, agy gemini-3.8-flash 0.006044)',
  )
  assert.equal(
    choice.reasonOf({ harness: 'agy', model: 'gemini-3.8-flash' }, order('grok:grok-4.7:0.013331:pool-full/agy:gemini-3.8-flash:0.006044:picked')),
    'took agy gemini-3.8-flash after grok grok-4.7 has its pool full',
  )
  assert.equal(
    choice.reasonOf({ harness: 'codex', model: 'gpt-codex' }, order('grok:grok-4.7:0.013331:unavailable-quota/agy:gemini-3.8-flash:0.006044:pool-full/codex:gpt-codex:unknown:picked')),
    'took codex gpt-codex after grok grok-4.7 did not start (quota), agy gemini-3.8-flash has its pool full',
  )
  assert.equal(
    choice.reasonOf({ harness: 'agy', model: 'gemini-3.8-flash' }, order('agy:gemini-3.8-flash:0.006044:picked/codex:gpt-codex:unknown:untried')),
    'took agy gemini-3.8-flash, first in order (agy gemini-3.8-flash 0.006044, codex gpt-codex no reading)',
  )
  assert.equal(
    choice.reasonOf(null, order('agy:claude-sonnet-5-5:excluded:reserve')),
    'native: no candidate is usable: agy claude-sonnet-5-5 is under the reserve',
  )
  assert.equal(
    choice.reasonOf(null, order('grok:grok-4.7:0.013331:pool-full/agy:gemini-3.8-flash:0.006044:unavailable-workspace/agy:claude-sonnet-5-5:excluded:marked')),
    'native: every usable candidate was passed over: grok grok-4.7 has its pool full; agy gemini-3.8-flash did not start (workspace); agy claude-sonnet-5-5 is marked dry',
  )
})

test('logChoice appends one choice entry to the lane log, with the order, the pick and the reason', (t) => {
  const dataDir = tempDir(t)
  assert.deepEqual(choice.logChoice(dataDir, RUN, 'task-1-1-implement', flags(), { now: NOW }), { logged: true })
  const [entry] = lanes.readLog(dataDir)
  assert.deepEqual(entry, {
    kind: 'choice',
    time: NOW,
    session: null,
    run: RUN,
    design: null,
    call: 'task-1-1-implement',
    role: 'implementer',
    tier: 'haiku',
    effort: 'xhigh',
    picked: { harness: 'grok', model: 'grok-4.7' },
    candidates: choice.parseOrder(TODAY_ORDER),
    reason: 'took grok grok-4.7, first in order (grok grok-4.7 0.013331, agy gemini-3.8-flash 0.006044)',
  })
  choice.logChoice(dataDir, RUN, 'final-review', flags({ role: 'reviewer', tier: 'opus', pick: 'native', order: 'agy:claude-opus-5-5:excluded:reserve' }), { now: NOW + 1000 })
  const entries = lanes.readLog(dataDir)
  assert.deepEqual(entries.map((e) => [e.call, e.picked, e.reason]), [
    ['task-1-1-implement', { harness: 'grok', model: 'grok-4.7' }, entry.reason],
    ['final-review', null, 'native: no candidate is usable: agy claude-opus-5-5 is under the reserve'],
  ])
})

test('a choice that names a bad run, call, role, tier or effort, or whose pick and order disagree, is refused and logs nothing', (t) => {
  const dataDir = tempDir(t)
  const refuse = (args, message) => assert.throws(() => choice.logChoice(dataDir, ...args, { now: NOW }), message)
  refuse(['nope', 'task-1-1-implement', flags()], /invalid run id: nope/)
  refuse([RUN, 'task-1', flags()], /invalid call id: task-1/)
  refuse([RUN, 'task-1-1-implement', flags({ role: 'designer' })], /--role must be one of implementer, supervisor, reviewer/)
  refuse([RUN, 'task-1-1-implement', flags({ tier: 'gpt' })], /--tier must be one of haiku, sonnet, opus/)
  refuse([RUN, 'task-1-1-implement', flags({ effort: 'huge' })], /--effort must be one of low, medium, high, xhigh, max/)
  refuse([RUN, 'task-1-1-implement', flags({ pick: 'agy:gemini-3.8-flash' })], /--pick and the picked item of --order do not agree/)
  refuse([RUN, 'task-1-1-implement', flags({ pick: 'native' })], /--pick and the picked item of --order do not agree/)
  refuse([RUN, 'task-1-1-implement', flags({ order: 'grok:grok-4.7:0.5:untried' })], /--pick and the picked item of --order do not agree/)
  refuse([RUN, 'task-1-1-implement', flags({ order: 'grok:grok-4.7:0.5:picked/agy:m:0.4:picked' })], /--pick and the picked item of --order do not agree/)
  assert.deepEqual(lanes.readLog(dataDir), [])
})
