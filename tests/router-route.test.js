'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const route = require('../plugins/aether/lib/route.js')
const { EXTERNAL_LIMIT_MS } = require('../plugins/aether/lib/delegate-limits.js')
const log = require('../plugins/aether/lib/router-log.js')
const session = require('../plugins/aether/lib/session.js')

const NOW = Date.parse('2026-10-15T21:32:00-06:00')
const H = 3600 * 1000
const MIN = 60 * 1000
const win = (remaining, hours) => ({ remaining, resetsAt: new Date(NOW + hours * H).toISOString() })
const weekly = (remaining, hours) => ({ windows: { weekly: win(remaining, hours) } })
const gemini = (remaining, hours) => ({ windows: { '5h': win(1, 5), weekly: win(remaining, hours) } })
const GROK = { readAt: NOW - MIN, groups: { grok: weekly(0.95, 29.6) } }
const READINGS = { agy: { readAt: NOW - 2 * MIN, groups: { flash: gemini(1, 60) } }, grok: GROK }
const DRY = { agy: { readAt: NOW - 2 * MIN, groups: { flash: gemini(0.02, 60), claude: weekly(0.02, 40) } }, grok: { readAt: NOW - MIN, groups: { grok: weekly(0.02, 29.6) } } }
const STALE = { agy: { readAt: NOW - 11 * MIN, groups: { flash: gemini(0.8, 10) } }, grok: GROK }
const FRESH_AGY = { agy: { readAt: NOW, groups: { flash: gemini(0.8, 10) } }, grok: GROK }

const answers = (over = {}) => ({
  shape: { choice: 'explore', confidence: 0.95 },
  stakes: { score: 1.1, confidence: 0.95 },
  reads_a_lot: { score: 0.5, confidence: 0.9 },
  pinned_by_checks: { noul: 0.2, confidence: 0.9 },
  needs_judgment: { noul: 0.3, confidence: 0.9 },
  edits_files: { noul: 0.03, confidence: 0.95 },
  many_steps: { noul: 0.1, confidence: 0.9 },
  ...over,
})
const text = (over) => JSON.stringify(answers(over))
const event = (over = {}) => ({ subagent_type: 'general-purpose', description: 'Audit the API usage in src/', prompt: 'Read src/ and report each call that skips the retry wrapper.', ...over })

function setup(t, { settings = {}, readings = READINGS, marks = [], installed = () => true, ...extra } = {}) {
  const dataDir = tempDir(t)
  const merged = {
    mode: 'command', decider: 'haiku', fallback: { alias: 'sonnet', effort: 'high' }, deadlines: { haikuMs: 8000, jevMs: 3000, quotaMs: 3000 },
    lanes: true, harnesses: ['agy', 'grok'], ...settings,
  }
  session.markSession(dataDir, 's1', NOW, { router: merged })
  let n = 0
  const clock = { t: NOW }
  const renewed = []
  return {
    dataDir, clock, renewed,
    now: () => clock.t,
    sleep: async (ms) => { clock.t += ms },
    newId: () => `r${++n}`,
    readings: typeof readings === 'function' ? readings : () => readings,
    marks: () => marks,
    renew: (harness) => { renewed.push(harness); return { started: true, running: true } },
    installed,
    ...extra,
  }
}
// begin, then the model's answer through finish (or the HTTP decider through decide), as the mod does
async function go(deps, ev, answer = text()) {
  const first = await route.begin({ session: 's1', event: ev }, deps)
  if (first.decide) return route.decide({ id: first.id }, deps)
  if (!first.ask) return first
  return typeof answer === 'object' && answer.failure ? route.finish({ id: first.id, failure: answer.failure }, deps) : route.finish({ id: first.id, answer }, deps)
}
const journal = (deps) => log.readJournal(deps.dataDir).filter((e) => e.kind === 'decision')

test('overrideOf reads a line that starts with the form and has a reason (A-7)', () => {
  assert.equal(route.overrideOf('Do it.\nROUTER-OVERRIDE: needs Opus for the legal contract\nThanks'), 'needs Opus for the legal contract')
  assert.equal(route.overrideOf('ROUTER-OVERRIDE:    spaced  '), 'spaced')
  assert.equal(route.overrideOf('ROUTER-OVERRIDE: '), null)
  assert.equal(route.overrideOf('see ROUTER-OVERRIDE: x in the middle'), null)
  assert.equal(route.overrideOf('router-override: lower case'), null)
  assert.equal(route.overrideOf('no override here'), null)
})

test('scenario 1 and 8: in command mode the Lead only describes, and the delegate leaves with the rung of the weekly window that renews first', async (t) => {
  const deps = setup(t)
  const first = await route.begin({ session: 's1', event: event() }, deps)
  assert.equal(first.skip, false)
  assert.equal(first.background, undefined, 'command waits for the decision')
  assert.equal(first.ask.model, 'haiku')
  assert.equal(first.ask.effort, 'low')
  assert.equal(first.ask.timeoutMs, 8000, 'the limit of the Haiku decider (A-6)')
  assert.ok(first.ask.prompt.includes('retry wrapper'))
  assert.ok(fs.existsSync(path.join(deps.dataDir, 'router', 'pending', `${first.id}.json`)))
  const plan = await route.finish({ id: first.id, answer: text() }, deps)
  assert.equal(plan.external.harness, 'grok', 'grok renews in 29.6 h, agy in 60 h')
  assert.equal(plan.external.model, 'grok-4.7')
  assert.equal(plan.external.effort, 'low')
  assert.equal(plan.external.timeoutMs, EXTERNAL_LIMIT_MS)
  assert.deepEqual(plan.args, { model: 'haiku', effort: 'high' }, 'the fallback: the Claude rung of the same level')
  assert.deepEqual(plan.external.fallback, { model: 'haiku', effort: 'high' })
  assert.ok(plan.notes[0].startsWith('Aether router:'))
  for (const word of ['grok', 'grok-4.7', 'low', 'shape explore']) assert.ok(plan.notes[0].includes(word), word)
  assert.equal(fs.existsSync(path.join(deps.dataDir, 'router', 'pending', `${first.id}.json`)), false)
  const stored = route.readExternal(deps.dataDir, first.id)
  assert.equal(stored.harness, 'grok')
  assert.deepEqual(stored.rung, { model: 'grok-4.7', effort: 'low', group: 'grok' })
  assert.equal(stored.task.prompt, event().prompt)
  assert.deepEqual(deps.renewed, [], 'the readings were valid: nothing was renewed')
  const [entry] = journal(deps)
  assert.equal(entry.id, first.id)
  assert.equal(entry.mode, 'command')
  assert.equal(entry.decider, 'haiku')
  assert.equal(entry.applied, 'external')
  assert.deepEqual(entry.rescue, { harness: 'claude', model: 'claude-haiku-5-5', effort: 'high' }, 'the rung the agent takes when the external delegate does not end ok')
  assert.equal(entry.decision.harness, 'grok')
  assert.equal(entry.decision.level, 'B')
  assert.equal(entry.requested, null)
  assert.equal(entry.fallback, null)
  assert.equal(entry.background, false)
  assert.equal(typeof entry.deciderMs, 'number')
  assert.equal(entry.quotaWaitMs, 0)
  const g = entry.quota.find((c) => c.harness === 'agy' && c.group === 'flash')
  const k = entry.quota.find((c) => c.harness === 'grok' && c.group === 'grok')
  assert.deepEqual([g.windowName, g.remaining, g.hoursLeft], ['weekly', 1, 60])
  assert.deepEqual([k.windowName, k.remaining, k.hoursLeft], ['weekly', 0.95, 29.6])
})

test('scenario 18: when the Gemini group of agy renews first, the delegate goes to agy on the level B rung of that group', async (t) => {
  const plan = await go(setup(t, { readings: { agy: { readAt: NOW - 2 * MIN, groups: { flash: gemini(0.8, 10) } }, grok: GROK } }), event())
  assert.equal(plan.external.harness, 'agy')
  assert.equal(plan.external.model, 'gemini-3.8-flash')
  assert.equal(plan.external.effort, 'medium')
  assert.equal(plan.external.group, 'flash')
})

test('without a harness to take it, a decided delegate runs in Claude with an explicit effort (R17)', async (t) => {
  for (const [name, change] of [['dry', { readings: DRY }], ['not installed', { installed: () => false }], ['lanes off', { settings: { lanes: false } }]]) {
    const plan = await go(setup(t, change), event())
    assert.equal(plan.external, null, name)
    assert.deepEqual(plan.args, { model: 'haiku', effort: 'high' }, name)
    assert.equal(plan.notes.length, 1, name)
  }
  const edits = await go(setup(t), event({ prompt: 'Rename fetchUser to loadUser everywhere.' }), text({ shape: { choice: 'mechanical_edit', confidence: 0.95 }, edits_files: { noul: 0.98, confidence: 0.95 } }))
  assert.equal(edits.external, null, 'a delegate that edits never runs outside (R19)')
  assert.equal(edits.args.effort, 'low')
  const isolated = await go(setup(t), event({ isolation: 'worktree' }))
  assert.equal(isolated.external, null)
  const off = setup(t, { settings: { lanes: false } })
  await go(off, event())
  assert.equal(journal(off)[0].quota, null)
  assert.equal(journal(off)[0].quotaWaitMs, 0)
})

test('a call goes to an external harness only when it names no agent, or names general-purpose or Explore (R19)', async (t) => {
  const absent = event()
  delete absent.subagent_type
  for (const [name, ev] of [['no subagent_type', absent], ['an empty subagent_type', event({ subagent_type: '' })], ['general-purpose', event({ subagent_type: 'general-purpose' })], ['Explore', event({ subagent_type: 'Explore' })]]) {
    const deps = setup(t)
    const plan = await go(deps, ev)
    assert.equal(plan.external?.harness, 'grok', name)
    assert.equal(journal(deps)[0].applied, 'external', name)
    assert.ok(!journal(deps)[0].decision.reason.includes('named agent'), name)
  }
  for (const type of ['code-reviewer', 'claude', 'plugin-x:auditor', 'explore']) {
    const deps = setup(t)
    const plan = await go(deps, event({ subagent_type: type }))
    assert.equal(plan.external, null, `${type} keeps its own system prompt and tools: it stays on Claude`)
    assert.deepEqual(plan.args, { model: 'haiku', effort: 'high' }, type)
    assert.equal(fs.existsSync(path.join(deps.dataDir, 'router', 'external', `${plan.id}.json`)), false, type)
    assert.deepEqual(deps.renewed, [], 'no quota is read for a task that cannot leave')
    assert.ok(plan.notes[0].includes(type), `the note tells the Lead why: ${plan.notes[0]}`)
    const [entry] = journal(deps)
    assert.equal(entry.applied, 'rewritten', type)
    assert.equal(entry.decision.harness, 'claude', type)
    assert.equal(entry.quota, null, type)
    assert.ok(entry.decision.reason.includes(`named agent ${type}`), `the log says why: ${entry.decision.reason}`)
    assert.ok(entry.decision.reason.includes('stays on Claude'), type)
    assert.equal(entry.fallback, null, 'not a failure')
  }
  const record = setup(t, { settings: { mode: 'record' } })
  await go(record, event({ subagent_type: 'code-reviewer' }))
  assert.equal(journal(record)[0].decision.harness, 'claude', 'record writes what the router would have done')
  assert.ok(journal(record)[0].decision.reason.includes('named agent code-reviewer'))
})

test('R23: a group with no valid reading is out, its renewal starts once, and the quota step waits at most the limit', async (t) => {
  const deps = setup(t, { readings: { agy: { readAt: NOW - 11 * MIN, groups: { flash: gemini(1, 5) } }, grok: null } })
  const plan = await go(deps, event())
  assert.equal(plan.external, null)
  assert.deepEqual(plan.args, { model: 'haiku', effort: 'high' })
  assert.deepEqual(deps.renewed, ['agy', 'grok'])
  assert.equal(deps.clock.t - NOW, 3000, 'the wait stopped at the quota limit of 3 s')
  const [entry] = journal(deps)
  assert.equal(entry.quotaWaitMs, 3000)
  assert.equal(entry.fallback, null, 'the decider did not fail')
  assert.ok(entry.quota.every((c) => c.state === 'excluded' && c.why === 'no-reading'))
  assert.equal(entry.quota.find((c) => c.harness === 'agy' && c.group === 'flash').note, 'sin lectura; la última tiene 11 min')
  assert.equal(entry.quota.find((c) => c.harness === 'agy' && c.group === 'flash').renewal, 'started')

  const short = setup(t, { settings: { deadlines: { haikuMs: 8000, jevMs: 3000, quotaMs: 1000 } }, readings: { agy: null, grok: null } })
  await go(short, event())
  assert.equal(short.clock.t - NOW, 1000)

  const noGrok = setup(t, { installed: (name) => name !== 'grok', readings: { agy: READINGS.agy, grok: null } })
  await go(noGrok, event())
  assert.deepEqual(noGrok.renewed, [], 'a harness that is not installed is not renewed')
})

test('R23: a renewal that lands inside the wait makes the group a candidate for this very decision', async (t) => {
  const deps = setup(t, { readings: () => (deps.clock.t > NOW ? FRESH_AGY : STALE) })
  const plan = await go(deps, event())
  assert.deepEqual(deps.renewed, ['agy'])
  assert.equal(plan.external.harness, 'agy')
  assert.equal(journal(deps)[0].quotaWaitMs, 250)
})

test('scenarios 16 and 20: a mark holds the group although the reading shows balance, and the record says so (R22)', async (t) => {
  const readings = { agy: { readAt: NOW - 2 * MIN, groups: { flash: gemini(0.98, 5) } }, grok: GROK }
  const marks = [{ harness: 'agy', group: 'flash', at: NOW - H, until: NOW + 100 * H, source: 'router' }]
  const deps = setup(t, { readings, marks })
  const plan = await go(deps, event())
  assert.equal(plan.external.harness, 'grok')
  const g = journal(deps)[0].quota.find((c) => c.harness === 'agy' && c.group === 'flash')
  assert.equal(g.why, 'mark')
  assert.equal(g.note, 'marca vigente; la lectura con saldo no la desmiente')
})

test('scenario 5: a model without a reason does not override; the router decides and the record says what the Lead asked', async (t) => {
  const deps = setup(t)
  const plan = await go(deps, event({ model: 'opus' }))
  assert.equal(plan.external.harness, 'grok')
  const [entry] = journal(deps)
  assert.deepEqual(entry.requested, { model: 'opus', effort: null })
  assert.equal(entry.asked.alias, 'opus')
  assert.equal(entry.asked.effort, 'xhigh')
  assert.equal(entry.asked.level, 'D')
  assert.equal(entry.override, null)
})

test('scenario 4: an override with a reason keeps what the Lead asked and records why, in every mode', async (t) => {
  const deps = setup(t)
  const plan = await route.begin({ session: 's1', event: event({ model: 'opus', effort: 'high', prompt: 'Review the contract.\nROUTER-OVERRIDE: requires Opus for the legal contract' }) }, deps)
  assert.equal(plan.ask, undefined, 'the decider is not called')
  assert.equal(plan.args, null)
  assert.equal(plan.external, null)
  assert.ok(plan.notes[0].includes('override'))
  const [entry] = journal(deps)
  assert.equal(entry.override, 'requires Opus for the legal contract')
  assert.equal(entry.decision, null)
  assert.equal(entry.applied, 'kept')
  const bare = await route.begin({ session: 's1', event: event({ prompt: 'Do it.\nROUTER-OVERRIDE: keep it as is' }) }, deps)
  assert.deepEqual(bare.args, { model: 'sonnet', effort: 'high' }, 'an override with nothing asked still leaves with an explicit rung: the fallback option')
  const custom = await route.begin({ session: 's1', event: event({ prompt: 'Do it.\nROUTER-OVERRIDE: keep it as is' }) }, setup(t, { settings: { fallback: { alias: 'opus', effort: 'high' } } }))
  assert.deepEqual(custom.args, { model: 'opus', effort: 'high' })
  const record = setup(t, { settings: { mode: 'record' } })
  const quiet = await route.begin({ session: 's1', event: event({ prompt: 'Do it.\nROUTER-OVERRIDE: keep it as is' }) }, record)
  assert.equal(quiet.ask, undefined)
  assert.equal(quiet.background, undefined)
  assert.equal(journal(record)[0].override, 'keep it as is')
})

test('scenario 7: a review never goes below the level the Lead asked', async (t) => {
  const deps = setup(t)
  const plan = await go(deps, event({ model: 'opus', effort: 'xhigh' }), text({ shape: { choice: 'audit', confidence: 0.95 } }))
  assert.deepEqual(plan.args, { model: 'opus', effort: 'xhigh' })
  assert.equal(plan.external, null)
  const [entry] = journal(deps)
  assert.equal(entry.decision.level, 'D')
  assert.equal(entry.flags.gate, true)
  const lower = await go(setup(t), event({ model: 'sonnet', effort: 'high' }), text({ shape: { choice: 'evaluate', confidence: 0.95 } }))
  assert.deepEqual(lower.args, { model: 'sonnet', effort: 'high' })
})

test('scenario 15 and R4: low confidence or incoherent answers do not go below the fallback rung', async (t) => {
  const vague = await go(setup(t), event({ prompt: 'Thoughts?' }), text({ shape: { choice: 'other', confidence: 0.3 }, stakes: { score: 1, confidence: 0.2 } }))
  assert.deepEqual(vague.args, { model: 'sonnet', effort: 'high' })
  assert.equal(vague.external, null)
  const deps = setup(t)
  const odd = await go(deps, event(), text({ shape: { choice: 'banana', confidence: 0.95 } }))
  assert.deepEqual(odd.args, { model: 'sonnet', effort: 'high' })
  const [entry] = journal(deps)
  assert.equal(entry.flags.incoherent, true)
  assert.equal(entry.fallback, null)
  const deps2 = setup(t)
  await go(deps2, event(), text({ shape: { choice: 'other', confidence: 0.3 } }))
  assert.equal(journal(deps2)[0].flags.lowConfidence, true)
  const opusFloor = await go(setup(t, { settings: { fallback: { alias: 'opus', effort: 'high' } } }), event(), text({ shape: { choice: 'other', confidence: 0.3 } }))
  assert.deepEqual(opusFloor.args, { model: 'opus', effort: 'high' }, 'the floor is the fallback option')
})

test('R24: every failure of the decider ends in Claude with what the Lead asked, or the fallback rung, with no question', async (t) => {
  for (const code of ['timeout', 'unreadable', 'empty', 'http', 'no-key']) {
    const deps = setup(t)
    const plan = await go(deps, event(), { failure: code })
    assert.deepEqual(plan.args, { model: 'sonnet', effort: 'high' }, code)
    assert.equal(plan.external, null)
    assert.ok(plan.notes[0].includes('failed'), code)
    assert.equal(journal(deps)[0].fallback, `decider: ${code}`)
    assert.equal(journal(deps)[0].decision, null)
  }
  const asked = await go(setup(t), event({ model: 'haiku', effort: 'low' }), { failure: 'timeout' })
  assert.deepEqual(asked.args, { model: 'haiku', effort: 'low' })
  const modelOnly = await go(setup(t), event({ model: 'sonnet' }), { failure: 'timeout' })
  assert.deepEqual(modelOnly.args, { model: 'sonnet', effort: 'xhigh' })
  const garbage = await go(setup(t), event(), 'this is not json')
  assert.deepEqual(garbage.args, { model: 'sonnet', effort: 'high' })
  const option = await go(setup(t, { settings: { fallback: { alias: 'haiku', effort: 'medium' } } }), event(), { failure: 'timeout' })
  assert.deepEqual(option.args, { model: 'haiku', effort: 'medium' }, 'the standard rung is the fallback option')
})

test('Jev decides inside begin in command mode, with the key from the environment, and each failure is a fallback (C5, C10)', async (t) => {
  const body = JSON.stringify({
    model: 'typesafe/jev-1.14-20261014', usage: { cost: 0.00008 },
    answers: { shape: { choice: 'explore', confidence: 0.95 }, stakes: { score: 1.1, confidence: 0.95 }, reads_a_lot: { score: 0.5, confidence: 0.9 }, pinned_by_checks: { noul: 0.2, confidence: 0.9 }, needs_judgment: { noul: 0.3, confidence: 0.9 }, edits_files: { noul: 0.03, confidence: 0.95 }, many_steps: { noul: 0.1, confidence: 0.9 } },
  })
  const urls = []
  const deps = setup(t, { settings: { decider: 'jev' }, env: { OPENROUTER_API_KEY: 'sk-secret-key' }, fetch: async (url) => { urls.push(url); return { ok: true, status: 200, text: async () => body } } })
  const plan = await route.begin({ session: 's1', event: event() }, deps)
  assert.equal(plan.ask, undefined)
  assert.equal(plan.external.harness, 'grok')
  assert.deepEqual(urls, ['https://openrouter.ai/api/v1/systemone'])
  const [entry] = journal(deps)
  assert.equal(entry.decider, 'jev')
  assert.equal(entry.deciderCost, 0.00008)
  assert.ok(!fs.readFileSync(log.journalFile(deps.dataDir), 'utf8').includes('sk-secret-key'))

  const hangs = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))))
  const failures = [
    ['no-key', {}, { env: {}, fetch: async () => { throw new Error('not called') } }],
    ['timeout', {}, { env: { OPENROUTER_API_KEY: 'k' }, fetch: async () => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }) } }],
    ['timeout', { deadlines: { haikuMs: 8000, jevMs: 30, quotaMs: 3000 } }, { env: { OPENROUTER_API_KEY: 'k' }, fetch: hangs }],
    ['http', {}, { env: { OPENROUTER_API_KEY: 'k' }, fetch: async () => ({ ok: false, status: 500, text: async () => 'boom' }) }],
    ['empty', {}, { env: { OPENROUTER_API_KEY: 'k' }, fetch: async () => ({ ok: true, status: 200, text: async () => '' }) }],
    ['unreadable', {}, { env: { OPENROUTER_API_KEY: 'k' }, fetch: async () => ({ ok: true, status: 200, text: async () => 'not json' }) }],
  ]
  for (const [code, change, extra] of failures) {
    const d = setup(t, { settings: { decider: 'jev', ...change }, ...extra })
    const p = await route.begin({ session: 's1', event: event() }, d)
    assert.deepEqual(p.args, { model: 'sonnet', effort: 'high' }, code)
    assert.equal(journal(d)[0].fallback, `decider: ${code}`, code)
  }
})

test('record never rewrites the call and never waits: begin returns at once and the decision is made later, in the background (R7, A-10)', async (t) => {
  const record = setup(t, { settings: { mode: 'record' } })
  const first = await route.begin({ session: 's1', event: event() }, record)
  assert.equal(first.background, true)
  assert.equal(first.ask.model, 'haiku')
  assert.equal(first.ask.timeoutMs, 8000)
  assert.equal(first.args, null)
  assert.deepEqual(first.notes, [])
  assert.equal(first.external, null)
  assert.deepEqual(log.readJournal(record.dataDir), [], 'nothing is decided before the model answers')
  assert.equal(record.clock.t, NOW, 'begin waited for nothing')
  const done = await route.finish({ id: first.id, answer: text() }, record)
  assert.equal(done.args, null)
  assert.deepEqual(done.notes, [])
  assert.equal(done.external, null)
  const [entry] = journal(record)
  assert.equal(entry.applied, 'inherited')
  assert.equal(entry.mode, 'record')
  assert.equal(entry.background, true)
  assert.equal(entry.decision.harness, 'grok', 'it records what the decider would have chosen')
  const kept = setup(t, { settings: { mode: 'record' } })
  await go(kept, event({ model: 'opus', effort: 'high' }))
  assert.equal(journal(kept)[0].applied, 'kept')

  const urls = []
  const jev = setup(t, { settings: { mode: 'record', decider: 'jev' }, env: { OPENROUTER_API_KEY: 'k' }, fetch: async (url) => { urls.push(url); return { ok: true, status: 200, text: async () => JSON.stringify({ answers: answers() }) } } })
  const start = await route.begin({ session: 's1', event: event() }, jev)
  assert.equal(start.background, true)
  assert.equal(start.decide, true)
  assert.equal(start.ask, undefined)
  assert.deepEqual(urls, [], 'Jev is not called before the launch')
  const decided = await route.decide({ id: start.id }, jev)
  assert.deepEqual(urls, ['https://openrouter.ai/api/v1/systemone'])
  assert.equal(decided.args, null)
  assert.equal(journal(jev)[0].decision.harness, 'grok')
})

test('advise tells the Lead and does not rewrite the call (A-10)', async (t) => {
  const advise = setup(t, { settings: { mode: 'advise' } })
  const first = await route.begin({ session: 's1', event: event({ model: 'opus', effort: 'xhigh' }) }, advise)
  assert.equal(first.background, undefined, 'advise waits for the decision')
  const told = await route.finish({ id: first.id, answer: text() }, advise)
  assert.equal(told.args, null)
  assert.equal(told.external, null)
  assert.equal(told.notes.length, 1)
  assert.ok(told.notes[0].includes('opus'))
  assert.ok(told.notes[0].includes('grok-4.7'))
})

test('scenario 6 and R9: the aether agents and a session with no router file are left alone', async (t) => {
  const deps = setup(t)
  for (const type of ['aether:judge', 'aether:implementer', 'aether:ops']) {
    const plan = await route.begin({ session: 's1', event: event({ subagent_type: type }) }, deps)
    assert.deepEqual(plan, { id: null, skip: true, why: 'aether-agent', args: null, notes: [], external: null })
  }
  const bare = await route.begin({ session: 'nobody', event: event() }, deps)
  assert.equal(bare.skip, true)
  assert.equal(bare.why, 'no-settings')
  assert.deepEqual(log.readJournal(deps.dataDir), [])
})

test('R25: an internal error leaves the call intact and does not throw, and an unknown id is not a crash', async (t) => {
  const deps = setup(t, { settings: { decider: 'jev' }, env: { OPENROUTER_API_KEY: 'k' }, rungs: { rungs: 'broken' }, fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ answers: answers() }) }) })
  const plan = await route.begin({ session: 's1', event: event() }, deps)
  assert.equal(plan.args, null)
  assert.equal(typeof plan.error, 'string')
  const unknown = await route.finish({ id: 'nope', answer: '{}' }, setup(t))
  assert.equal(unknown.error, 'unknown id')
  assert.equal(unknown.args, null)
  assert.equal((await route.decide({ id: 'nope' }, setup(t))).error, 'unknown id')
})

test('R25: an internal error leaves a trace in the journal, and the delegates report counts it as a fallback', async (t) => {
  const broken = { rungs: 'broken' }
  const jev = { decider: 'jev' }
  const key = { env: { OPENROUTER_API_KEY: 'k' }, fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ answers: answers() }) }) }

  // begin: Jev decides inside it
  const deps = setup(t, { settings: jev, rungs: broken, ...key })
  const plan = await route.begin({ session: 's1', event: event({ prompt: `Read src/.\n${'x'.repeat(900)}` }) }, deps)
  assert.equal(plan.args, null, 'the call stays as the Lead made it')
  assert.equal(typeof plan.error, 'string')
  assert.equal(plan.id, 'r1')
  const [entry] = journal(deps)
  assert.equal(entry.id, 'r1')
  assert.equal(entry.session, 's1')
  assert.equal(entry.mode, 'command')
  assert.equal(entry.decider, 'jev')
  assert.equal(entry.kind, 'decision')
  assert.equal(entry.decision, null)
  assert.equal(entry.applied, 'inherited')
  assert.equal(entry.fallback, `internal: ${plan.error}`)
  assert.equal(entry.description, 'Audit the API usage in src/')
  assert.equal(entry.task.promptChars, event({ prompt: `Read src/.\n${'x'.repeat(900)}` }).prompt.length)
  assert.equal(entry.task.excerpt.length, 400, 'an excerpt, not the whole prompt')
  assert.equal(entry.requested, null)
  assert.equal(entry.ranOn, null)

  // the report counts it
  const { delegatesReport } = require('../plugins/aether/lib/router-report.js')
  const { delegations, totals } = delegatesReport({ dataDir: deps.dataDir, prices: require('../plugins/aether/lib/prices.js').loadPrices() })
  assert.equal(delegations.length, 1)
  assert.equal(delegations[0].fallback, entry.fallback)
  assert.equal(totals.fallback, 1)
  assert.equal(totals.decided, 0)

  // what the Lead asked is 'kept'
  const asked = setup(t, { settings: jev, rungs: broken, ...key })
  await route.begin({ session: 's1', event: event({ model: 'opus', effort: 'high' }) }, asked)
  assert.equal(journal(asked)[0].applied, 'kept')
  assert.deepEqual(journal(asked)[0].requested, { model: 'opus', effort: 'high' })

  // finish: the model's answer arrives and the policy fails
  const viaHaiku = setup(t, { rungs: broken })
  const began = await route.begin({ session: 's1', event: event() }, viaHaiku)
  assert.equal(journal(viaHaiku).length, 0, 'begin of a Haiku decision decides nothing yet')
  const finished = await route.finish({ id: began.id, answer: text() }, viaHaiku)
  assert.equal(finished.args, null)
  assert.equal(typeof finished.error, 'string')
  const [late] = journal(viaHaiku)
  assert.equal(late.id, began.id)
  assert.equal(late.session, 's1')
  assert.equal(late.decider, 'haiku')
  assert.equal(late.fallback, `internal: ${finished.error}`)
  assert.equal(late.decision, null)
  assert.equal(late.applied, 'inherited')

  // decide: record mode with Jev
  const record = setup(t, { settings: { mode: 'record', ...jev }, rungs: broken, ...key })
  const started = await route.begin({ session: 's1', event: event() }, record)
  const decided = await route.decide({ id: started.id }, record)
  assert.equal(decided.args, null)
  assert.equal(typeof decided.error, 'string')
  const [background] = journal(record)
  assert.equal(background.mode, 'record')
  assert.equal(background.background, true)
  assert.equal(background.fallback, `internal: ${decided.error}`)
  assert.equal(background.applied, 'inherited')

  // a long, many-lined message is cut to one line of at most 200 characters
  const noisy = setup(t, { settings: jev, ...key, installed: () => { throw new Error(`first line\n${'y'.repeat(500)}`) } })
  const result = await route.begin({ session: 's1', event: event() }, noisy)
  assert.equal(typeof result.error, 'string')
  const [cut] = journal(noisy)
  assert.ok(cut.fallback.startsWith('internal: first line y'), cut.fallback)
  assert.ok(!cut.fallback.includes('\n'))
  assert.equal(cut.fallback.length, 'internal: '.length + 200)

  // a journal that cannot be written does not turn the error into an exception
  const blocked = setup(t, { settings: jev, rungs: broken, ...key })
  fs.writeFileSync(path.join(blocked.dataDir, 'router'), 'a file where the log directory should be')
  const quiet = await route.begin({ session: 's1', event: event() }, blocked)
  assert.equal(quiet.args, null)
  assert.equal(typeof quiet.error, 'string')
})

test('the same run of the same task gives the same decision with either decider (C5)', async (t) => {
  const viaHaiku = await go(setup(t), event())
  const body = JSON.stringify({ answers: answers() })
  const jev = setup(t, { settings: { decider: 'jev' }, env: { OPENROUTER_API_KEY: 'k' }, fetch: async () => ({ ok: true, status: 200, text: async () => body }) })
  const viaJev = await route.begin({ session: 's1', event: event() }, jev)
  assert.deepEqual(viaJev.args, viaHaiku.args)
  assert.equal(viaJev.external.model, viaHaiku.external.model)
  assert.equal(viaJev.external.effort, viaHaiku.external.effort)
})

test('in command the note says when the Lead\'s own choice was replaced and how to keep one, and in advise it does not (real session T2)', async (t) => {
  // the decision for this brief is haiku high (level B): the Lead asked haiku medium
  const replaced = await go(setup(t, { settings: { lanes: false, harnesses: [] } }), event({ model: 'haiku', effort: 'medium' }))
  assert.deepEqual(replaced.args, { model: 'haiku', effort: 'high' })
  assert.match(replaced.notes[0], /You asked haiku medium, and the router replaced it/)
  assert.match(replaced.notes[0], /ROUTER-OVERRIDE: <reason>/)

  // the Lead asked what the router decided: nothing was replaced
  const same = await go(setup(t, { settings: { lanes: false, harnesses: [] } }), event({ model: 'haiku', effort: 'high' }))
  assert.match(same.notes[0], /You asked haiku high\./)
  assert.doesNotMatch(same.notes[0], /replaced/)

  // nothing asked: nothing to say about it
  const none = await go(setup(t, { settings: { lanes: false, harnesses: [] } }), event())
  assert.doesNotMatch(none.notes[0], /You asked/)

  // advise runs the call as sent: the note only reports the ask
  const advise = await go(setup(t, { settings: { mode: 'advise', lanes: false, harnesses: [] } }), event({ model: 'haiku', effort: 'medium' }))
  assert.match(advise.notes[0], /You asked haiku medium\. The call runs as you sent it\./)
  assert.doesNotMatch(advise.notes[0], /replaced/)
})
