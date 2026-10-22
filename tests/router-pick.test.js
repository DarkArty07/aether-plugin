'use strict'

// The router asks the one choice function of superdelegation which pair takes a read-only delegate (lib/router-pick.js):
// the points of the Claude rung it would run on, the quota that renews first, then the cheapest per task. The pairs here
// are a small table of this file's own, so a refresh of config/pairs.json does not move these figures.

const test = require('node:test')
const assert = require('node:assert/strict')
const { tempDir } = require('./helpers.js')
const { pairStep, DELEGATE_HARNESSES } = require('../plugins/aether/lib/router-pick.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const { peekReadings, staleHarnesses } = require('../plugins/aether/lib/router-quota.js')

const config = lanes.loadConfig(lanes.CONFIG_FILE)
const NOW = Date.parse('2026-10-20T12:00:00-06:00')
const H = 3600 * 1000
const MIN = 60 * 1000
const win = (remaining, hours) => ({ remaining, resetsAt: new Date(NOW + hours * H).toISOString() })
const weekly = (remaining, hours) => ({ windows: { weekly: win(remaining, hours) } })
const gemini = (remaining, hours) => ({ windows: { '5h': win(1, 5), weekly: win(remaining, hours) } })
// agy's table has two keys that read the one «Gemini Models» group, so a reading has the same windows for both.
const geminiKeys = (remaining, hours) => ({ argon: gemini(remaining, hours), flash: gemini(remaining, hours) })
const agy = (groups, readAt = NOW - 2 * MIN) => ({ readAt, groups })
const GROK = { readAt: NOW - MIN, groups: { grok: weekly(0.95, 29.6) } }

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
]
const SONNET_HIGH = { model: 'sonnet', effort: 'high' }

// The router's dependencies (lib/route.js resolve) for one decision, with a clock that the wait moves.
function setup({ readings = { agy: agy({ ...geminiKeys(1, 60), claude: weekly(0.9, 40) }), grok: GROK }, marks = [], installed = () => true, pairs = PAIRS, settings = {}, lift = null, slow = undefined } = {}) {
  const clock = { t: NOW }
  const renewed = []
  const lifted = []
  const d = {
    now: () => clock.t,
    sleep: async (ms) => { clock.t += ms },
    lanesConfig: () => config,
    pairs: () => pairs,
    installed,
    marks: () => marks,
    readings: typeof readings === 'function' ? readings : () => readings,
    renew: (harness) => { renewed.push(harness); return { started: true, running: true } },
    lift: lift || ((mark) => lifted.push(mark)),
    ...(slow === undefined ? {} : { slow }),
  }
  const merged = { harnesses: ['agy', 'grok', 'muse'], deadlines: { haikuMs: 8000, jevMs: 3000, quotaMs: 3000 }, ...settings }
  return { d, merged, clock, renewed, lifted }
}
const idOf = (step) => (step.pick ? step.pick.id : null)

test('the harnesses a delegate may run on are agy, grok and muse, and codex and cursor are not', () => {
  assert.deepEqual(DELEGATE_HARNESSES, ['agy', 'grok', 'muse'])
})

test('the quota that renews first takes the call, at its cheapest pair that reaches the points', async () => {
  const s = setup({ readings: { agy: agy({ ...geminiKeys(1, 60), claude: weekly(0.9, 40) }), grok: GROK } })
  const step = await pairStep(s.d, s.merged, { reference: SONNET_HIGH })
  assert.equal(idOf(step), 'grok/grok-4.7@high', 'grok renews in 29.6 h, agy in 40 h and 60 h')
  assert.deepEqual(s.renewed, [], 'the readings are valid: nothing is renewed')
  assert.equal(step.waitedMs, 0)
  const next = step.quota.filter((c) => c.outcome === 'next').map((c) => c.id)
  assert.deepEqual(next, ['agy/claude-sonnet-5-5@high', 'agy/gemini-4-argon@high', 'muse/muse-wonder-full-1.0@high'], 'the rest in the order the function gives')
  assert.ok(step.reason.startsWith('grok/grok-4.7@high:'), step.reason)

  const gem = setup({ readings: { agy: agy({ ...geminiKeys(0.8, 10), claude: weekly(0.9, 40) }), grok: GROK } })
  assert.equal(idOf(await pairStep(gem.d, gem.merged, { reference: SONNET_HIGH })), 'agy/gemini-4-argon@high', 'the Gemini group renews first, in 10 h')
})

test('the points of the reference decide, not the name of a model: a lower reference lets a cheaper pair in', async () => {
  const s = setup({ readings: { agy: agy({ ...geminiKeys(0.8, 10), claude: weekly(0.9, 40) }), grok: GROK } })
  const step = await pairStep(s.d, s.merged, { reference: { model: 'haiku', effort: 'high' } })
  assert.equal(idOf(step), 'agy/gemini-3.8-flash@medium', '39.8 points reach 37.8 minus one')
})

test('a group under the reserve is out, and the next quota takes the call', async () => {
  const s = setup({ readings: { agy: agy({ ...geminiKeys(0.8, 10), claude: weekly(0, 1.1) }), grok: { ...GROK, groups: { grok: weekly(0.02, 29.6) } } } })
  const step = await pairStep(s.d, s.merged, { reference: SONNET_HIGH })
  assert.equal(idOf(step), 'agy/gemini-4-argon@high')
  const dry = step.quota.filter((c) => c.why === 'dry').map((c) => `${c.harness}/${c.group}`)
  assert.ok(dry.includes('agy/claude') && dry.includes('grok/grok'), dry.join(', '))
})

test('Muse takes a call when its quota is the one that renews first, or the only one left', async () => {
  const only = setup({ settings: { harnesses: ['muse'] }, readings: { agy: null, grok: null, muse: null } })
  const step = await pairStep(only.d, only.merged, { reference: { model: 'opus', effort: 'high' } })
  assert.equal(idOf(step), 'muse/muse-wonder-full-1.0@high', 'a pair with no cost enters on the owner\'s word, and a harness with no reading is unknown, not dry')
  assert.deepEqual(only.renewed, [], 'Muse has no reading to renew')

  const all = setup({ readings: { agy: agy({ ...geminiKeys(1, 60), claude: weekly(0.9, 40) }), grok: GROK, muse: null } })
  const after = await pairStep(all.d, all.merged, { reference: { model: 'opus', effort: 'high' } })
  assert.equal(idOf(after), 'agy/gemini-4-argon@high', 'a quota that renews at a known time goes before one that does not say')

  const heldMark = [{ harness: 'muse', group: 'muse', at: NOW - H, until: NOW + H, source: 'router', reason: 'quota refusal' }]
  const held = setup({ settings: { harnesses: ['muse'] }, readings: { muse: null }, marks: heldMark })
  assert.equal(idOf(await pairStep(held.d, held.merged, { reference: { model: 'opus', effort: 'high' } })), null, 'a refusal mark holds Muse as it holds agy')
})

test('a harness that is not enabled or not installed gives nothing, and codex is never a candidate', async () => {
  const noGrok = setup({ installed: (name) => name !== 'grok' })
  const step = await pairStep(noGrok.d, noGrok.merged, { reference: SONNET_HIGH })
  assert.equal(idOf(step), 'agy/claude-sonnet-5-5@high')
  assert.equal(step.quota.find((c) => c.harness === 'grok').why, 'not-installed')
  const onlyAgy = setup()
  const second = await pairStep(onlyAgy.d, { ...onlyAgy.merged, harnesses: ['agy', 'codex', 'cursor'] }, { reference: SONNET_HIGH })
  assert.equal(second.pick.harness, 'agy')
  assert.ok(second.quota.every((c) => ['agy', 'grok', 'muse'].includes(c.harness)))
  assert.equal(second.quota.find((c) => c.harness === 'grok').why, 'harness-off')
})

test('R23: a harness with no valid reading is renewed once, waited for up to the quota limit, and left out when it is still stale', async () => {
  const stale = setup({ settings: { harnesses: ['agy', 'grok'] }, readings: { agy: agy({ ...geminiKeys(1, 5) }, NOW - 11 * MIN), grok: null } })
  const step = await pairStep(stale.d, stale.merged, { reference: SONNET_HIGH })
  assert.equal(step.pick, null)
  assert.deepEqual(stale.renewed, ['agy', 'grok'])
  assert.equal(stale.clock.t - NOW, 3000, 'the wait stopped at the quota limit of 3 s')
  assert.equal(step.waitedMs, 3000)
  for (const c of step.quota.filter((e) => ['agy', 'grok'].includes(e.harness))) assert.equal(c.why, 'no-reading', c.id)
  assert.equal(step.quota.find((c) => c.harness === 'agy').renewal, 'started')
  assert.match(step.reason, /no external pair is a candidate|native/)

  // Muse, which keeps no reading, is never stale: it takes the call while agy and grok are being renewed.
  const withMuse = setup({ readings: { agy: agy({ ...geminiKeys(1, 5) }, NOW - 11 * MIN), grok: null } })
  assert.equal(idOf(await pairStep(withMuse.d, withMuse.merged, { reference: SONNET_HIGH })), 'muse/muse-wonder-full-1.0@high')

  const short = setup({ readings: { agy: null, grok: null } })
  await pairStep(short.d, { ...short.merged, deadlines: { haikuMs: 8000, jevMs: 3000, quotaMs: 1000 } }, { reference: SONNET_HIGH })
  assert.equal(short.clock.t - NOW, 1000)
})

test('R23: a renewal that lands inside the wait makes the harness a candidate for this very decision', async () => {
  const s = setup({ readings: () => (s.clock.t > NOW ? { agy: agy({ ...geminiKeys(0.8, 10), claude: weekly(0.9, 40) }, NOW), grok: GROK } : { agy: agy({ ...geminiKeys(0.8, 10) }, NOW - 11 * MIN), grok: GROK }) })
  const step = await pairStep(s.d, s.merged, { reference: SONNET_HIGH })
  assert.deepEqual(s.renewed, ['agy'])
  assert.equal(idOf(step), 'agy/gemini-4-argon@high')
  assert.equal(step.waitedMs, 250)
})

test('issue 025: a stale harness that cannot serve the call is not waited for', async () => {
  // Nothing outside Claude reaches 56 points: no reading can change the pick, so the decision does not sit out the limit.
  const s = setup({ readings: { agy: agy({ ...geminiKeys(1, 5) }, NOW - 11 * MIN), grok: null } })
  const step = await pairStep(s.d, s.merged, { reference: { model: 'opus', effort: 'xhigh' } })
  assert.equal(step.pick, null)
  assert.equal(s.clock.t, NOW, 'no wait')
  assert.deepEqual(s.renewed, [], 'no renewal starts either: no reading of agy or grok can change the pick')
  assert.match(step.reason, /native/)
})

test('issue 025: a stale agy whose every group is marked dry is neither renewed nor waited for, and a fitting stale harness still is', async () => {
  const refusal = (group) => ({ harness: 'agy', group, at: NOW - H, until: NOW + 100 * H, source: 'router', reason: 'quota refusal' })
  const s = setup({ readings: { agy: agy({ ...geminiKeys(1, 5), claude: weekly(0.9, 80) }, NOW - 11 * MIN), grok: null }, marks: ['argon', 'flash', 'claude'].map(refusal) })
  const step = await pairStep(s.d, s.merged, { reference: SONNET_HIGH })
  assert.deepEqual(s.renewed, ['grok'], 'agy is left out of the renewal, grok is renewed')
  assert.equal(step.waitedMs, 3000, 'the wait is for grok alone, up to the quota limit')
  assert.equal(s.clock.t - NOW, 3000)
  assert.equal(step.quota.find((c) => c.harness === 'agy' && c.group === 'argon').why, 'no-reading')
  assert.equal(step.quota.find((c) => c.harness === 'agy').renewal, undefined)
  assert.equal(step.quota.find((c) => c.harness === 'grok').renewal, 'started')
})

test('issue 025: a stale agy with no rung at the level is neither renewed nor waited for, with a reference above every agy pair', async () => {
  const s = setup({ readings: { agy: agy({ ...geminiKeys(1, 5), claude: weekly(0.9, 80) }, NOW - 11 * MIN), grok: GROK } })
  const step = await pairStep(s.d, s.merged, { reference: { model: 'opus', effort: 'xhigh' } })
  assert.deepEqual(s.renewed, [], 'agy\'s best pair reaches 52.6 points and this call asks 55')
  assert.equal(s.clock.t, NOW)
  assert.equal(step.waitedMs, 0)
})

test('R22: a mark holds the group although the reading shows balance, a refusal\'s mark is never lifted, and one that came from a reading is', async () => {
  const refusal = { harness: 'agy', group: 'argon', at: NOW - H, until: NOW + 100 * H, source: 'router', reason: 'quota refusal' }
  const held = setup({ readings: { agy: agy({ ...geminiKeys(0.98, 5), claude: weekly(0.9, 40) }), grok: GROK }, marks: [refusal] })
  const step = await pairStep(held.d, held.merged, { reference: SONNET_HIGH })
  assert.equal(idOf(step), 'grok/grok-4.7@high')
  assert.equal(step.quota.find((c) => c.harness === 'agy' && c.group === 'argon').why, 'dry')
  assert.deepEqual(held.lifted, [])

  const fromReading = { harness: 'agy', group: 'argon', at: NOW - 30 * MIN, until: NOW + 30 * MIN, confirmed: false, source: 'swarm' }
  const lifting = setup({ readings: { agy: agy({ ...geminiKeys(0.98, 5), claude: weekly(0.9, 40) }), grok: GROK }, marks: [fromReading] })
  const after = await pairStep(lifting.d, lifting.merged, { reference: SONNET_HIGH })
  assert.equal(idOf(after), 'agy/gemini-4-argon@high', 'the fresh healthy reading lifted the mark and the Gemini group renews first')
  assert.deepEqual(lifting.lifted, [fromReading], 'whoever keeps the marks is told')

  const under = setup({ readings: { agy: agy({ ...geminiKeys(0.02, 5), claude: weekly(0.9, 40) }), grok: GROK }, marks: [fromReading] })
  assert.equal(under.lifted.length, 0)
  await pairStep(under.d, under.merged, { reference: SONNET_HIGH })
  assert.deepEqual(under.lifted, [], 'a reading under the reserve lifts nothing')
})

test('a reference the table lacks gives no pick and names the error, and never throws', async () => {
  const s = setup()
  const step = await pairStep(s.d, s.merged, { reference: { model: 'sonnet', effort: 'minimal' } })
  assert.equal(step.pick, null)
  assert.equal(step.quota, null)
  assert.equal(step.reason, null, 'a table that lacks the reference is a broken router, not a choice: the failure is the error')
  assert.match(step.error, /no reference pair for sonnet minimal/)
})

test('every harness of the staleness rule is one the router reads: muse has no reading to go stale', () => {
  assert.deepEqual(staleHarnesses({ readings: {}, config, harnesses: ['muse'], now: NOW }), [])
})

test('a fresh reading that lacks a group of the table is no whole reading: the harness is renewed, waited for and left out', async () => {
  for (const [name, reading] of [['a group missing', agy({ ...geminiKeys(0.8, 10) })], ['a saved reading in the shape before issue 038, with the one Gemini key', agy({ gemini: gemini(0.8, 10), claude: weekly(0.9, 40) })], ['no groups', agy({})], ['groups null', { readAt: NOW - 2 * MIN, groups: null }]]) {
    const s = setup({ settings: { harnesses: ['agy', 'grok'] }, readings: { agy: reading, grok: GROK } })
    const step = await pairStep(s.d, s.merged, { reference: SONNET_HIGH })
    assert.equal(idOf(step), 'grok/grok-4.7@high', name)
    assert.deepEqual(s.renewed, ['agy'], name)
    assert.equal(s.clock.t - NOW, 3000, `${name}: it waits at most the quota limit`)
    for (const c of step.quota.filter((e) => e.harness === 'agy')) assert.equal(c.why, 'no-reading', `${name} ${c.id}`)
  }
})

test('pairStep never throws, whatever fails under it: the table, the lane config, the marks or the question of what is installed', async () => {
  for (const [name, fail] of [['pairs', (d) => { d.pairs = () => { throw new Error('pairs config /x: missing') } }], ['installed', (d) => { d.installed = () => { throw new Error('boom') } }], ['marks', (d) => { d.marks = () => { throw new Error('marks') } }], ['readings', (d) => { d.readings = () => { throw new Error('readings') } }], ['lanesConfig', (d) => { d.lanesConfig = () => { throw new Error('lanes') } }]]) {
    const s = setup()
    fail(s.d)
    const step = await pairStep(s.d, s.merged, { reference: SONNET_HIGH })
    assert.equal(step.pick, null, name)
    assert.equal(step.waitedMs, 0, name)
    assert.equal(step.quota, null, name)
    assert.equal(step.reason, null, `${name}: an error is not a reason`)
    assert.ok(typeof step.error === 'string' && step.error !== '', name)
  }
  const s = setup()
  s.d.pairs = () => { throw 'a string, not an Error' }
  assert.equal((await pairStep(s.d, s.merged, { reference: SONNET_HIGH })).error, 'a string, not an Error')
})

test('issue 036: a decision with no pair for the task still says why in its reason, and has no error', async () => {
  const s = setup({ readings: { agy: null, grok: null, muse: null }, installed: () => false })
  const step = await pairStep(s.d, s.merged, { reference: SONNET_HIGH })
  assert.equal(step.pick, null)
  assert.ok(typeof step.reason === 'string' && step.reason !== '')
  assert.equal(Object.hasOwn(step, 'error'), false)
  assert.ok(Array.isArray(step.quota))
})

test('issue 035: a pair with a slow mark is out of the choice, shows as excluded, and the next candidate takes the call', async () => {
  const s = setup({ slow: () => ['grok/grok-4.7@high'] })
  const step = await pairStep(s.d, s.merged, { reference: SONNET_HIGH })
  assert.equal(idOf(step), 'agy/claude-sonnet-5-5@high', 'grok renews first, and it is the pair that ran out of time')
  const grok = step.quota.find((c) => c.id === 'grok/grok-4.7@high')
  assert.equal(grok.outcome, 'passed')
  assert.equal(grok.why, 'excluded')
  assert.ok(!step.quota.some((c) => c.outcome === 'next' && c.id === 'grok/grok-4.7@high'), 'the alternates saved for the chain never hold it')
  assert.equal(step.waitedMs, 0)
})

test('issue 035: the slow mark is the pair\'s, not the group\'s: the same harness at another effort stays available', async () => {
  const pairs = [...PAIRS, external('grok', 'grok-4.7', 'low', 'grok', 46.3, 1.9)]
  const s = setup({ pairs, slow: () => ['grok/grok-4.7@high'] })
  const step = await pairStep(s.d, s.merged, { reference: SONNET_HIGH })
  assert.equal(idOf(step), 'grok/grok-4.7@low', 'the cheaper pair of the same quota takes the call')
  assert.equal(step.quota.find((c) => c.id === 'grok/grok-4.7@high').why, 'excluded')
})

test('issue 035: the harnesses that serve are found with the slow pairs excluded too, so a harness left with nothing is not waited for', async () => {
  // Grok has no reading and its only pair is slow: the wait would be for a reading that cannot change the pick.
  const s = setup({ readings: { agy: agy({ ...geminiKeys(1, 60), claude: weekly(0.9, 40) }), grok: null }, slow: () => ['grok/grok-4.7@high'] })
  const step = await pairStep(s.d, s.merged, { reference: SONNET_HIGH })
  assert.equal(s.clock.t, NOW, 'no wait')
  assert.deepEqual(s.renewed, [], 'no renewal starts: its only pair is slow, so no reading of grok can change the pick')
  assert.equal(step.waitedMs, 0)
  assert.equal(idOf(step), 'agy/claude-sonnet-5-5@high')
})

test('issue 035: dependencies that lack slow, or whose slow is empty, exclude nothing', async () => {
  assert.equal(idOf(await pairStep(setup().d, setup().merged, { reference: SONNET_HIGH })), 'grok/grok-4.7@high')
  const s = setup({ slow: () => [] })
  assert.equal(idOf(await pairStep(s.d, s.merged, { reference: SONNET_HIGH })), 'grok/grok-4.7@high')
})

test('the readings are the ones peekReadings finds, and no adapter is asked for a quota call that launches a process (constraint of the hook)', async (t) => {
  const dataDir = tempDir(t)
  const asked = []
  const createAdapter = (name) => ({
    quotaCost: name === 'agy' ? 'process' : 'log',
    quota() {
      asked.push(name)
      if (name === 'agy') throw new Error('must not run: it launches agy /usage')
      if (name === 'muse') return { groups: { muse: { unknown: true, windows: {} } } }
      return { groups: { grok: { ...weekly(0.95, 29.6), source: { ageMinutes: 2 } } } }
    },
  })
  const s = setup({ readings: (names) => peekReadings({ dataDir, config, harnesses: names, createAdapter, now: NOW }) })
  const step = await pairStep(s.d, s.merged, { reference: SONNET_HIGH })
  assert.equal(idOf(step), 'grok/grok-4.7@high', 'agy has no saved reading: it is stale, renewed in the background and left out')
  assert.deepEqual(s.renewed, ['agy'])
  assert.ok(!asked.includes('agy'), 'the quota of agy was never asked')
  assert.ok(!step.quota.some((c) => c.harness === 'agy' && c.why !== 'no-reading'))
})

test('every external pair of the table can run as a delegate: its model and its group are in the lane table of its harness', () => {
  for (const pair of loadPairs().pairs.filter((one) => one.harness !== 'claude')) {
    const harness = config.harnesses[pair.harness]
    assert.ok(harness && harness.models && Object.hasOwn(harness.models, pair.model), `${pair.id}: its model is not in the lane table`)
    assert.ok(Object.hasOwn(harness.groups, pair.group), `${pair.id}: its group ${pair.group} is not a group of ${pair.harness}`)
    assert.ok(DELEGATE_HARNESSES.includes(pair.harness), `${pair.id}: a delegate cannot run on ${pair.harness}`)
  }
})
