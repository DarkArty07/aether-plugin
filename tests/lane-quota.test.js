'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const marks = require('../plugins/aether/lib/lane-marks.js')
const order = require('../plugins/aether/lib/lane-order.js')
const quota = require('../plugins/aether/lib/lane-quota.js')
const { registerAdapter, unregisterAdapter } = require('../plugins/aether/lib/harness/index.js')
const { createAgy } = require('../plugins/aether/lib/harness/agy.js')
const { readGrokQuota } = require('../plugins/aether/lib/harness/grok-quota.js')
const fx = require('./lane-fixtures.js')

const NOW = Date.parse('2026-10-14T06:08:00Z')
const MIN = 60 * 1000
const RESERVE = 0.05
const FIXTURES = path.join(__dirname, 'fixtures')

// The environment of one test, in this process: a lane table whose agy and grok commands exist, and a data directory.
function useTable(t, mutate = null) {
  const env = fx.laneEnv(t, {
    mutate: (config) => {
      config.harnesses.grok.command = fx.FAKE_AGY
      config.harnesses.codex.command = '/nowhere/codex'
      config.harnesses.cursor.command = '/nowhere/cursor-agent'
      if (mutate) mutate(config)
    },
  })
  for (const name of ['AETHER_LANES_CONFIG', 'AETHER_DATA_DIR']) {
    const previous = process.env[name]
    t.after(() => (previous === undefined ? delete process.env[name] : (process.env[name] = previous)))
    process.env[name] = env[name]
  }
  return env.AETHER_DATA_DIR
}

// An adapter for this process only. quota() counts its readings, gives the groups of `groups`, and throws while `fail` is set.
function fakeHarness(t, name, groups, { cost = undefined } = {}) {
  const state = { reads: 0, fail: false, groups }
  registerAdapter(name, () => ({
    name,
    quotaCost: cost,
    installed: () => true,
    version: () => '9.9.9',
    quota() {
      state.reads += 1
      if (state.fail) throw new Error(`${name} /usage failed: exit 1`)
      return { groups: state.groups }
    },
  }))
  t.after(() => unregisterAdapter(name))
  return state
}

const weekly = (remaining, resetsAt, extra = {}) => ({ windows: { weekly: { remaining, resetsAt } }, ...extra })
const both = (w, f, resetsAt = '2026-10-21T03:35:44Z') => ({ windows: { weekly: { remaining: w, resetsAt }, '5h': { remaining: f, resetsAt: '2026-10-14T10:02:11Z' } } })
const report = (extra = {}) => quota.quotaReport({ names: ['agy'], now: () => NOW, ...extra })

test("a group's view has the numbers of the order rule, its label, its local reset, its source and its mark", () => {
  const view = quota.groupView('Gemini Models', both(1, 0.9), { reserve: RESERVE, now: NOW, command: 'agy', readAt: NOW - 4 * MIN })
  assert.deepEqual([view.label, view.unknown, view.usable, view.priority, view.remaining, view.resetsAt, view.mark], ['Gemini Models', false, true, 0.006044, 1, '2026-10-21T03:35:44.000Z', null])
  assert.deepEqual(view.windows.weekly, { remaining: 1, resetsAt: '2026-10-21T03:35:44.000Z', hoursLeft: 165.5, priority: 0.006044, resetsLocal: view.windows.weekly.resetsLocal })
  assert.match(view.windows.weekly.resetsLocal, /^2026-10-2[01] \d\d:\d\d UTC[+-]\d+/)
  assert.deepEqual(view.source, { command: 'agy', ts: new Date(NOW - 4 * MIN).toISOString(), ageMinutes: 4, stale: false })
  const mark = { harness: 'agy', group: 'gemini', until: NOW + MIN, confirmed: false }
  const marked = quota.groupView('Gemini Models', both(1, 0.9), { reserve: RESERVE, now: NOW, command: 'agy', mark })
  assert.deepEqual([marked.usable, marked.mark], [false, mark])
  const unknown = quota.groupView('Grok plan', { unknown: true, windows: {} }, { reserve: RESERVE, now: NOW, command: 'grok' })
  assert.deepEqual([unknown.unknown, unknown.usable, unknown.priority, unknown.windows, unknown.source], [true, true, null, {}, null])
})

test('a reading that carries its own source keeps it, stale after the harness life, and says a share was read as 0% used', () => {
  const reading = weekly(1, '2026-10-17T09:08:51.805Z', {
    source: { log: '/home/me/.grok/logs/unified.jsonl', ts: '2026-10-14T05:00:00.000Z', pid: 7, version: '1.0.41', ageMinutes: 68 },
    usedPercent: null,
    usedPercentAbsent: true,
  })
  const view = quota.groupView('Grok plan', reading, { reserve: RESERVE, now: NOW, command: 'grok', lifeMs: 30 * MIN })
  assert.deepEqual(view.source, { ...reading.source, stale: true, usedPercent: null, usedPercentAbsent: true })
  assert.equal(view.usedPercentAbsent, true)
  assert.equal(quota.groupView('Grok plan', reading, { reserve: RESERVE, now: NOW, command: 'grok', lifeMs: 90 * MIN }).source.stale, false)
})

test('the report shows a live dry mark on its group, and the text says until when and why', async (t) => {
  const dataDir = useTable(t)
  fakeHarness(t, 'agy', { gemini: both(1, 1), claude: both(0.5, 0.5, '2026-10-16T04:41:07Z') })
  marks.markDry(dataDir, { harness: 'agy', group: 'gemini', reserve: RESERVE, now: NOW - 10 * MIN })
  const r = await report()
  const { gemini, claude } = r.harnesses.agy.groups
  assert.deepEqual([gemini.usable, gemini.mark.until, gemini.mark.confirmed, claude.usable, claude.mark], [false, NOW + 50 * MIN, false, true, null])
  const text = quota.formatReport(r)
  assert.ok(text.includes('  gemini, "Gemini Models": not usable, dry mark until 2026-10-14 06:58 UTC, 60 minutes after a call ended for quota\n'), text)
  assert.ok(text.includes('  claude, "Claude and GPT models": usable, priority '), text)
})

test('quota reads a harness whose reading launches a process each time, and the kept reading serves a status for its life', async (t) => {
  const dataDir = useTable(t)
  const agy = fakeHarness(t, 'agy', { gemini: both(1, 1), claude: both(1, 1) }, { cost: 'process' })
  const settings = lanes.loadConfig(lanes.configPath()).harnesses.agy
  await report()
  await report({ now: () => NOW + MIN })
  assert.equal(agy.reads, 2, 'the quota command is a deliberate reading')
  const kept = quota.harnessView('agy', settings, { reserve: RESERVE, now: NOW + 5 * MIN, dataDir, fresh: false })
  assert.equal(agy.reads, 2)
  assert.deepEqual([kept.groups.gemini.source.ageMinutes, kept.groups.gemini.source.ts], [4, new Date(NOW + MIN).toISOString()])
  quota.harnessView('agy', settings, { reserve: RESERVE, now: NOW + 12 * MIN, dataDir, fresh: false })
  assert.equal(agy.reads, 3, 'after its life of 10 minutes it is read again')
})

test('a reading that fails leaves each group of the harness unknown, with the error, and the report still prints', async (t) => {
  useTable(t)
  const agy = fakeHarness(t, 'agy', {})
  agy.fail = true
  const r = await report()
  const h = r.harnesses.agy
  assert.equal(h.error, 'agy /usage failed: exit 1')
  assert.deepEqual(Object.keys(h.groups), ['gemini', 'claude'])
  for (const group of Object.values(h.groups)) assert.deepEqual([group.unknown, group.usable, group.priority, group.source, group.error], [true, true, null, null, 'agy /usage failed: exit 1'])
  const text = quota.formatReport(r)
  assert.ok(text.includes('  error: agy /usage failed: exit 1\n'), text)
  assert.ok(text.includes('  gemini, "Gemini Models": unknown, used until a call fails for quota (no reading)\n'), text)
})

// A reading of grok's log that is ageMinutes old, as readGrokQuota gives it.
const grokReading = (ageMinutes) => weekly(1, '2026-10-17T09:08:51.805Z', { source: { log: '/log', ts: new Date(NOW - ageMinutes * MIN).toISOString(), pid: 1, version: '1.0.52', ageMinutes }, usedPercent: null, usedPercentAbsent: true })

test('the wave step refreshes grok when its reading is missing, unknown or older than its life, and leaves a fresh one alone', async (t) => {
  useTable(t)
  const grok = fakeHarness(t, 'grok', { grok: grokReading(5) })
  const config = lanes.loadConfig(lanes.configPath())
  const asked = []
  const refreshers = { grok: async (settings) => (asked.push(settings.command), grokReading(0)) }
  assert.deepEqual(await quota.refreshStale({ config, enabled: ['agy', 'grok'], refreshers }), {})
  assert.deepEqual(asked, [])
  grok.groups = { grok: grokReading(31) }
  assert.deepEqual(await quota.refreshStale({ config, enabled: ['agy', 'grok'], refreshers }), { grok: { refreshed: true, method: 'ui' } })
  grok.groups = { grok: { unknown: true, windows: {} } }
  const viaAcp = { grok: async () => ({ ...grokReading(0), source: { method: 'acp', log: null, ts: new Date(NOW).toISOString(), pid: null, version: '1.0.52', ageMinutes: 0 } }) }
  assert.deepEqual(await quota.refreshStale({ config, enabled: ['grok'], refreshers: viaAcp }), { grok: { refreshed: true, method: 'acp' } })
  grok.groups = { grok: grokReading(45) }
  assert.deepEqual(await quota.refreshStale({ config, enabled: ['grok'], refreshers: { grok: async () => null } }), { grok: { refreshed: false, method: null } })
  grok.fail = true
  assert.deepEqual(await quota.refreshStale({ config, enabled: ['grok'], refreshers: { grok: async () => { throw new Error('boom') } } }), { grok: { refreshed: false, method: null } })
  assert.equal(asked.length, 1)
  // A harness that is not enabled, not in the table or not installed is left alone.
  assert.deepEqual(await quota.refreshStale({ config, enabled: ['codex', 'nope'], refreshers: { codex: async () => grokReading(0), nope: async () => grokReading(0) } }), {})
  assert.deepEqual(await quota.refreshStale({ config, enabled: ['agy'], refreshers }), {})
})

test('quota --refresh says how grok answered: over ACP, through its UI, or not at all, and names the source of the reading', async (t) => {
  useTable(t)
  fakeHarness(t, 'grok', { grok: grokReading(300) })
  const acpReading = { ...grokReading(0), source: { method: 'acp', log: null, ts: new Date(NOW).toISOString(), pid: null, version: '1.0.52', ageMinutes: 0 } }
  const ask = (refresher) => quota.quotaReport({ names: ['grok'], refresh: true, now: () => NOW, refreshers: { grok: refresher } })
  const acp = await ask(async () => acpReading)
  assert.deepEqual([acp.harnesses.grok.refreshed, acp.harnesses.grok.refreshMethod, acp.harnesses.grok.groups.grok.source.method], [true, 'acp', 'acp'])
  const text = quota.formatReport(acp)
  assert.ok(text.includes('  refresh: grok answered _x.ai/billing\n'), text)
  assert.ok(text.includes("    source: grok's answer to _x.ai/billing at 2026-10-14 06:08 UTC, grok 1.0.52, 0 min old; the answer has no creditUsagePercent, read as 0% used\n"), text)
  const ui = await ask(async () => grokReading(0))
  assert.deepEqual([ui.harnesses.grok.refreshed, ui.harnesses.grok.refreshMethod], [true, 'ui'])
  assert.ok(quota.formatReport(ui).includes("  refresh: grok's UI wrote a new reading\n"))
  const none = await ask(async () => null)
  assert.deepEqual([none.harnesses.grok.refreshed, none.harnesses.grok.refreshMethod], [false, null])
  assert.ok(quota.formatReport(none).includes('  refresh: no new reading (grok gave none over ACP, and its UI none within 20 s)\n'))
  // Without --refresh nothing is asked of grok and the report says nothing of a refresh.
  const plain = await quota.quotaReport({ names: ['grok'], now: () => NOW, refreshers: { grok: async () => assert.fail('asked') } })
  assert.equal(plain.harnesses.grok.refreshed, undefined)
})

test('the saved readings of 2026-10-14 give the order of the spec: Grok 4.7, then Gemini 3.8 Flash, and Claude in agy not usable', (t) => {
  const exec = () => ({ status: 0, stdout: fs.readFileSync(path.join(FIXTURES, 'agy-usage-2026-10-14.json'), 'utf8'), stderr: '' })
  const agy = createAgy({ command: 'agy', groups: { gemini: 'Gemini Models', claude: 'Claude and GPT models' }, exec }).quota()
  // The second line of the grok fixture is grok 1.0.41's, written at 05:45:16 UTC with no creditUsagePercent.
  const logFile = path.join(tempDir(t), 'unified.jsonl')
  fs.copyFileSync(path.join(FIXTURES, 'grok-billing.jsonl'), logFile)
  const grok = readGrokQuota({ logFile, now: NOW })
  const view = (label, reading, command) => quota.groupView(label, reading, { reserve: RESERVE, now: NOW, command })
  const gemini = view('Gemini Models', agy.groups.gemini, 'agy')
  const claude = view('Claude and GPT models', agy.groups.claude, 'agy')
  const grokView = view('Grok plan', grok, 'grok')
  assert.deepEqual([gemini.priority, claude.priority, grokView.priority], [0.006044, 0.000038, 0.013331])
  assert.deepEqual([gemini.usable, claude.usable, grokView.usable, grokView.usedPercentAbsent, grokView.source.ageMinutes], [true, false, true, true, 22])
  const harnesses = { agy: { installed: true, groups: { gemini, claude } }, grok: { installed: true, groups: { grok: grokView } } }
  const haiku = [
    { harness: 'agy', model: 'gemini-3.8-flash', group: 'gemini' },
    { harness: 'grok', model: 'grok-4.7', group: 'grok' },
  ]
  assert.deepEqual(order.orderCandidates(haiku, harnesses).ordered.map((e) => e.model), ['grok-4.7', 'gemini-3.8-flash'])
  const sonnet = order.orderCandidates([{ harness: 'agy', model: 'claude-sonnet-5-5', group: 'claude' }], harnesses)
  assert.deepEqual([sonnet.ordered.length, sonnet.excluded.map((e) => e.why)], [0, ['reserve']])
})
