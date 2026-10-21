'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { tempDir } = require('./helpers.js')
const route = require('../plugins/aether/lib/route.js')
const log = require('../plugins/aether/lib/router-log.js')
const session = require('../plugins/aether/lib/session.js')

const { aetherTaskOf } = route

const NOW = Date.parse('2026-10-15T21:32:00-06:00')
const H = 3600 * 1000
const MIN = 60 * 1000
const win = (remaining, hours) => ({ remaining, resetsAt: new Date(NOW + hours * H).toISOString() })
const weekly = (remaining, hours) => ({ windows: { weekly: win(remaining, hours) } })
const gemini = (remaining, hours) => ({ windows: { '5h': win(1, 5), weekly: win(remaining, hours) } })
const geminiKeys = (remaining, hours) => ({ argon: gemini(remaining, hours), flash: gemini(remaining, hours) })
const GROK = { readAt: NOW - MIN, groups: { grok: weekly(0.95, 29.6) } }
const READINGS = { agy: { readAt: NOW - 2 * MIN, groups: { ...geminiKeys(1, 60), claude: weekly(0.9, 80) } }, grok: GROK }

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

async function go(deps, ev, answer = text()) {
  const first = await route.begin({ session: 's1', event: ev }, deps)
  if (first.decide) return route.decide({ id: first.id }, deps)
  if (!first.ask) return first
  return typeof answer === 'object' && answer.failure ? route.finish({ id: first.id, failure: answer.failure }, deps) : route.finish({ id: first.id, answer }, deps)
}
const journal = (deps) => log.readJournal(deps.dataDir).filter((e) => e.kind === 'decision')

test('aetherTaskOf reads the id from its own line, anywhere in the brief, and nothing else', () => {
  assert.equal(aetherTaskOf('Do the work.\nAETHER-TASK: 20261021-021202-4a26\nMind the tests.'), '20261021-021202-4a26')
  assert.equal(aetherTaskOf('AETHER-TASK: 20261021-021202-4a26'), '20261021-021202-4a26')
  assert.equal(aetherTaskOf('the line AETHER-TASK: 20261021-021202-4a26 quoted mid-sentence'), null)
  assert.equal(aetherTaskOf('AETHER-TASK: not an id!\nAETHER-TASK: 20261021-021202-4a26'), '20261021-021202-4a26')
  assert.equal(aetherTaskOf('AETHER-TASK:'), null)
  assert.equal(aetherTaskOf('no marker at all'), null)
  assert.equal(aetherTaskOf(null), null)
  assert.equal(aetherTaskOf(undefined), null)
  const beyond = `${'x'.repeat(500)}\nAETHER-TASK: 20261021-021202-4a26`
  assert.equal(aetherTaskOf(beyond), '20261021-021202-4a26', 'found past the 400 characters of the excerpt')
})

test('edits, with id beyond 400 characters: captures aetherTask and sets taskClass to edits', async (t) => {
  const deps = setup(t)
  const prompt = `${'x'.repeat(500)}\nAETHER-TASK: 20261021-021202-4a26\nFix the issue in src/index.js`
  await go(deps, event({ prompt }), text({ edits_files: { noul: 0.95, confidence: 0.95 } }))
  const entries = journal(deps)
  assert.equal(entries.length, 1)
  const [entry] = entries
  assert.equal(entry.taskClass, 'edits')
  assert.equal(entry.aetherTask, '20261021-021202-4a26')
  assert.equal(entry.task.excerpt.includes('20261021-021202-4a26'), false)
})

test('read-only, without id: taskClass is read-only and aetherTask is null', async (t) => {
  const deps = setup(t)
  await go(deps, event({ prompt: 'Read src/ and report issues.' }), text({ edits_files: { noul: 0.03, confidence: 0.95 } }))
  const entries = journal(deps)
  assert.equal(entries.length, 1)
  const [entry] = entries
  assert.equal(entry.taskClass, 'read-only')
  assert.equal(entry.aetherTask, null)
})

test('override with id: taskClass is null, aetherTask has id, and override holds', async (t) => {
  const deps = setup(t)
  const prompt = 'ROUTER-OVERRIDE: the Lead keeps this choice\nAETHER-TASK: 20261021-021202-4a26\nRun on opus'
  await go(deps, event({ prompt, model: 'opus', effort: 'high' }))
  const entries = journal(deps)
  assert.equal(entries.length, 1)
  const [entry] = entries
  assert.equal(entry.taskClass, null)
  assert.equal(entry.aetherTask, '20261021-021202-4a26')
  assert.equal(entry.override, 'the Lead keeps this choice')
})

test('an incoherent answer classified nothing: taskClass is null, not edits', async (t) => {
  const deps = setup(t)
  await go(deps, event({ prompt: 'AETHER-TASK: 20261021-021202-4a26\nAudit src/.' }), text({ shape: { choice: 'banana', confidence: 0.95 } }))
  const [entry] = journal(deps)
  assert.equal(entry.flags.incoherent, true)
  assert.equal(entry.taskClass, null)
  assert.equal(entry.aetherTask, '20261021-021202-4a26')
})

test('decider failure leaves taskClass null, and aether:* agent call skips with journal empty', async (t) => {
  const deps = setup(t)
  await go(deps, event({ prompt: 'Fix the bug.' }), { failure: 'rate_limit' })
  const entries = journal(deps)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].taskClass, null)

  const depsAgent = setup(t)
  const skipped = await route.begin({ session: 's1', event: event({ subagent_type: 'aether:implementer', prompt: 'AETHER-TASK: 20261021-021202-4a26' }) }, depsAgent)
  assert.equal(skipped.skip, true)
  assert.equal(skipped.why, 'aether-agent')
  assert.deepEqual(log.readJournal(depsAgent.dataDir), [])
})
