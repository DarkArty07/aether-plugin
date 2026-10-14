'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const order = require('../plugins/aether/lib/lane-order.js')
const { NOW, READINGS, GEMINI, CLAUDE_LOW, GROK, CASES } = require('./lane-order-cases.js')

const RESERVE = 0.05
const view = (reading, extra = {}) => order.groupView(reading, { reserve: RESERVE, now: NOW, ...extra })

test('every case of the order rule gives its order and its exclusions', () => {
  for (const c of CASES) {
    const { ordered, excluded } = order.orderCandidates(c.candidates, c.harnesses)
    assert.deepEqual(ordered.map((e) => `${e.harness}:${e.model}`), c.ordered, c.name)
    assert.deepEqual(excluded.map((e) => `${e.harness}:${e.model}:${e.why}`), c.excluded, c.name)
  }
})

test('an entry says its state and priority: a priority, no reading, or excluded', () => {
  const [today, , , none] = CASES
  const first = order.orderCandidates(today.candidates, today.harnesses)
  assert.deepEqual(first.ordered.map((e) => [e.state, e.priority, e.usedPercentAbsent]), [
    ['priority', 0.013331, true],
    ['priority', 0.006044, false],
  ])
  assert.equal(first.ordered[0].resetsAt, '2026-10-17T09:08:51.805Z')
  const second = order.orderCandidates(none.candidates, none.harnesses)
  assert.deepEqual(second.ordered.map((e) => [e.state, e.priority]), [['priority', 0.006044], ['unknown', null]])
  const left = order.orderCandidates(CASES[1].candidates, CASES[1].harnesses)
  assert.deepEqual(left.excluded.map((e) => [e.state, e.why, e.group]), [['excluded', 'reserve', 'claude']])
})

test('the readings of 2026-10-14 give the priorities of the spec, and Grok goes before Gemini', () => {
  const gemini = view(READINGS.gemini)
  const claude = view(READINGS.claude)
  const grok = view(READINGS.grok)
  assert.deepEqual([gemini.priority, gemini.resetsAt, gemini.windowName, gemini.usable], [0.006044, '2026-10-21T03:35:44.000Z', 'weekly', true])
  assert.deepEqual([claude.priority, claude.usable], [0.000038, false])
  assert.deepEqual([grok.priority, grok.resetsAt, grok.usable, grok.usedPercentAbsent, grok.hoursLeft], [0.013331, '2026-10-17T09:08:51.805Z', true, true, 75])
  assert.deepEqual([gemini, claude, grok].map((g) => [g.unknown, g.mark]), [[false, null], [false, null], [false, null]])
  assert.equal(GEMINI.priority, gemini.priority)
  assert.equal(CLAUDE_LOW.priority, claude.priority)
  assert.equal(GROK.priority, grok.priority)
  const harnesses = { agy: { installed: true, groups: { gemini, claude } }, grok: { installed: true, groups: { grok } } }
  const flash = { harness: 'agy', model: 'gemini-3.8-flash', group: 'gemini' }
  const grokLane = { harness: 'grok', model: 'grok-4.7', group: 'grok' }
  const sonnet = { harness: 'agy', model: 'claude-sonnet-5-5', group: 'claude' }
  assert.deepEqual(order.orderCandidates([flash, grokLane], harnesses).ordered.map((e) => e.model), ['grok-4.7', 'gemini-3.8-flash'])
  assert.deepEqual(order.orderCandidates([sonnet], harnesses).excluded.map((e) => e.why), ['reserve'])
})

test("a group's priority is its longest window's share left per hour to its reset, with at least one hour", () => {
  const long = view({ windows: { '5h': { remaining: 0.5, resetsAt: '2026-10-14T08:08:00Z' }, weekly: { remaining: 0.8, resetsAt: '2026-10-16T06:08:00Z' } } })
  assert.deepEqual([long.windowName, long.remaining, long.hoursLeft, long.priority], ['weekly', 0.8, 48, 0.016667])
  assert.deepEqual(long.windows['5h'], { remaining: 0.5, resetsAt: '2026-10-14T08:08:00.000Z', hoursLeft: 2, priority: 0.25 })
  // A reset in 10 minutes counts as one hour, and so does a reset already past.
  const soon = view({ windows: { weekly: { remaining: 0.6, resetsAt: '2026-10-14T06:18:00Z' } } })
  assert.deepEqual([soon.hoursLeft, soon.priority], [0.2, 0.6])
  const past = view({ windows: { weekly: { remaining: 0.6, resetsAt: '2026-10-14T05:08:00Z' } } })
  assert.deepEqual([past.hoursLeft, past.priority], [-1, 0.6])
})

test('a group is usable when every window is above the reserve and no mark holds it', () => {
  const windows = (weekly, fiveHour) => ({ windows: { weekly: { remaining: weekly, resetsAt: '2026-10-20T00:00:00Z' }, '5h': { remaining: fiveHour, resetsAt: '2026-10-14T10:00:00Z' } } })
  assert.equal(view(windows(0.9, 0.9)).usable, true)
  assert.equal(view(windows(0.9, 0.05)).usable, false, 'exactly at the reserve is not above it')
  assert.equal(view(windows(0.9, 0.06)).usable, true)
  assert.equal(view(windows(0.04, 1)).usable, false)
  const mark = { harness: 'agy', group: 'gemini', until: NOW + 1000 }
  const marked = view(windows(0.9, 0.9), { mark })
  assert.deepEqual([marked.usable, marked.mark], [false, mark])
  // Only the longest window sets the priority; the 5 h window counts for usability alone.
  assert.equal(view(windows(0.9, 0.06)).priority, view(windows(0.9, 0.9)).priority)
})

test('a reading that is missing, unknown, empty or without a balance is a group with no reading, usable until a call fails', () => {
  for (const reading of [null, undefined, { unknown: true, windows: {} }, { windows: {} }]) {
    const g = view(reading)
    assert.deepEqual([g.unknown, g.usable, g.priority, g.remaining, g.resetsAt], [true, true, null, null, null], JSON.stringify(reading))
  }
  // The balance is unknown but the reset is known: the alternative the owner may choose for grok (spec A3).
  const resetOnly = view({ windows: { weekly: { remaining: null, resetsAt: '2026-10-17T09:08:51.805Z' } } })
  assert.deepEqual([resetOnly.unknown, resetOnly.usable, resetOnly.priority, resetOnly.remaining, resetOnly.resetsAt], [true, true, null, null, '2026-10-17T09:08:51.805Z'])
  // A mark holds a group even when it has no reading.
  assert.equal(view(null, { mark: { until: NOW + 1 } }).usable, false)
  // The flag that a share was read as 0% used follows the reading.
  assert.equal(view({ windows: { weekly: { remaining: 1, resetsAt: '2026-10-17T09:08:51Z' } }, usedPercentAbsent: true }).usedPercentAbsent, true)
  assert.equal(view({ windows: { weekly: { remaining: 1, resetsAt: '2026-10-17T09:08:51Z' } } }).usedPercentAbsent, false)
})

test('a window whose reset cannot be read keeps its balance for usability and gives no priority', () => {
  const g = view({ windows: { weekly: { remaining: 0.5, resetsAt: 'soon' } } })
  assert.deepEqual([g.unknown, g.usable, g.priority, g.resetsAt], [false, true, null, null])
  assert.equal(g.windows.weekly.resetsAt, 'soon')
})

test('readingUsable is the rule that start and the judge of a call use', () => {
  const w = (remaining) => ({ windows: { weekly: { remaining, resetsAt: '2026-10-20T00:00:00Z' } } })
  assert.equal(order.readingUsable(null, RESERVE), false)
  assert.equal(order.readingUsable({ windows: {} }, RESERVE), false)
  assert.equal(order.readingUsable({ unknown: true, windows: {} }, RESERVE), true)
  assert.equal(order.readingUsable(w(0.06), RESERVE), true)
  assert.equal(order.readingUsable(w(0.05), RESERVE), false)
  assert.equal(order.readingUsable(w(null), RESERVE), true, 'a balance that is unknown is used until a call fails')
})

test('candidatesOf reads a list of lanes, a single lane of an older plan, or nothing', () => {
  const flash = { model: 'gemini-3.8-flash', group: 'gemini', harness: 'agy' }
  const grok = { model: 'grok-4.7', group: 'grok', harness: 'grok' }
  const calls = { implementer: { haiku: [flash, grok], sonnet: { model: 'claude-sonnet-5-5', group: 'claude' } } }
  assert.deepEqual(order.candidatesOf(calls, 'implementer', 'haiku'), [flash, grok])
  assert.deepEqual(order.candidatesOf(calls, 'implementer', 'sonnet', 'agy'), [{ harness: 'agy', model: 'claude-sonnet-5-5', group: 'claude' }])
  for (const [role, tier] of [['implementer', 'opus'], ['reviewer', 'opus']]) assert.deepEqual(order.candidatesOf(calls, role, tier), [])
  assert.deepEqual(order.candidatesOf(null, 'implementer', 'haiku'), [])
})
