'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { useDataDir, age } = require('./helpers.js')
const { MIN, T0, PRICES, iso, usdOf, meter, writeParts, laneCall, journalLine, outcome, summaryOf, writeSummary, ageFile } = require('./spend-fixtures.js')
const spendLib = require('../plugins/aether/lib/spend.js')
const { spendReport, latestSession, isSessionId, mergeTallies, tallyOf, emptyTally, readUsageEvents, readLaneEvents, readSummary, GAP_MS } = spendLib

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)
const sum = (list) => list.reduce((total, value) => total + value, 0)
const bucketSum = (buckets) => sum(Object.values(buckets).map((bucket) => bucket.usd))
const report = (dataDir, session) => spendReport({ dataDir, session, prices: PRICES })

test('an id is [A-Za-z0-9_-]+ and is not unknown; a bad one throws and reads nothing', (t) => {
  for (const ok of ['010621c2', 'a_b-C', 'x']) assert.equal(isSessionId(ok), true, ok)
  for (const bad of ['unknown', '', 'a b', '../x', 'a/b', 'a.b', null, undefined, 7]) assert.equal(isSessionId(bad), false, String(bad))
  const dataDir = useDataDir(t)
  for (const bad of ['unknown', '', 'a b', '../x', 'a/b']) assert.throws(() => report(dataDir, bad), /bad session id/)
})

test('E1: the total, the Lead, the agents and every split come out of the same requests', (t) => {
  const dataDir = useDataDir(t)
  const agents = { i1: { type: 'aether:implementer' }, j1: { type: 'aether:judge' }, w1: { type: 'aether:writer' }, x1: { type: null } }
  const part0 = [meter(0, 'm-a', null, 'input', 'xhigh'), meter(1, 'm-b', null, 'output', 'xhigh'), meter(2, 'm-a', 'i1', 'cacheWrite', 'high'), meter(3, 'm-b', 'j1', 'input', 'xhigh')]
  const part1 = [meter(4, 'm-a', 'w1', 'output'), meter(5, 'm-a', null, 'cacheWrite', 'xhigh'), meter(6, 'm-b', 'x1', 'cacheRead', 'high')]
  writeParts(dataDir, 's1', [{ agents, entries: part0 }, { agents, entries: part1 }])
  const all = [...part0, ...part1]
  const lead = sum(all.filter((e) => !e.agent).map(usdOf))
  const helpers = sum(all.filter((e) => e.agent).map(usdOf))
  const r = report(dataDir, 's1')
  assert.deepEqual(Object.keys(r), ['session', 'recorded', 'complete', 'basis', 'currency', 'usd', 'leadUsd', 'agentsUsd', 'byModel', 'byEffort', 'byRole', 'harness', 'unpriced', 'firstRequest', 'lastRequest', 'resumptions', 'resumptionsApproximate'])
  assert.deepEqual([r.session, r.recorded, r.complete, r.currency, r.basis], ['s1', true, true, 'USD', 'test list prices, S1'])
  close(r.leadUsd, lead)
  close(r.agentsUsd, helpers)
  close(r.usd, lead + helpers)
  assert.deepEqual(Object.keys(r.byRole).sort(), ['aether:implementer', 'aether:judge', 'aether:writer', 'agent', 'main'])
  close(r.byRole.main.usd, lead)
  assert.equal(r.byRole.main.requests, 3)
  close(r.byRole['aether:writer'].usd, usdOf(part1[0]))
  close(r.byRole.agent.usd, usdOf(part1[2]))
  close(bucketSum(r.byRole), lead + helpers)
  for (const model of ['m-a', 'm-b']) {
    const mine = all.filter((e) => e.model === model)
    close(r.byModel[model].usd, sum(mine.map(usdOf)))
    assert.equal(r.byModel[model].requests, mine.length)
  }
  assert.deepEqual(Object.keys(r.byEffort).sort(), ['m-a high', 'm-a unknown', 'm-a xhigh', 'm-b high', 'm-b xhigh'])
  close(r.byEffort['m-a unknown'].usd, usdOf(part1[0]))
  close(bucketSum(r.byModel), r.usd)
  close(bucketSum(r.byEffort), r.usd)
  assert.deepEqual(r.harness, { calls: 0, usd: 0, byModel: {} })
  assert.deepEqual(r.unpriced, [])
  assert.deepEqual([r.firstRequest, r.lastRequest, r.resumptions, r.resumptionsApproximate], [iso(T0), iso(T0 + 6 * MIN), 0, true])
})

test('E2: calls and outcomes of other harnesses are counted once, apart, and inside the total', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  const call = laneCall(dataDir, 's1', 1, 'm-b', 'output')
  const out1 = outcome(dataDir, 's1', 2, 'm-a', 'input', { id: 'd-2', attempt: 1 })
  const out2 = outcome(dataDir, 's1', 2, 'm-a', 'output', { id: 'd-2', attempt: 2 })
  laneCall(dataDir, 's1', 3, 'x-free')
  outcome(dataDir, 's1', 4, 'x-free2')
  outcome(dataDir, 's2', 5, 'm-b')
  laneCall(dataDir, 's2', 6, 'm-b')
  laneCall(dataDir, null, 7, 'm-b')
  const r = report(dataDir, 's1')
  assert.equal(r.harness.calls, 5)
  close(r.harness.usd, call + out1 + out2)
  close(r.harness.byModel['m-b'].usd, call)
  assert.equal(r.harness.byModel['m-a'].calls, 2)
  assert.equal(r.harness.byModel['x-free'], undefined)
  assert.deepEqual(r.unpriced, ['x-free', 'x-free2'])
  close(r.leadUsd, 1)
  close(r.usd, 1 + call + out1 + out2)
  assert.deepEqual(Object.keys(r.byRole), ['main'])
  assert.equal(r.byModel['m-a'].requests, 3)
  close(bucketSum(r.byModel), r.usd)
  close(bucketSum(r.byEffort), r.usd)
  assert.ok(r.byEffort['m-b high'] && r.byEffort['m-a low'] && r.byEffort['m-a unknown'])
  assert.deepEqual([r.firstRequest, r.lastRequest], [iso(T0), iso(T0 + 4 * MIN)])
})

test('without a session the report is of the one written last among those with files of their own', (t) => {
  const dataDir = useDataDir(t)
  assert.equal(latestSession(dataDir), null)
  writeParts(dataDir, 'old', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  age(path.join(dataDir, 'usage', 'old'), 48)
  laneCall(dataDir, 'mid', 1, 'm-a')
  ageFile(path.join(dataDir, 'lanes', 'mid.jsonl'), 24)
  laneCall(dataDir, null, 2, 'm-b')
  fs.writeFileSync(path.join(dataDir, 'lanes', 'bad name.jsonl'), '')
  writeParts(dataDir, 'not an id', [{ entries: [meter(0, 'm-b', null, 'input')] }])
  writeSummary(dataDir, 'bad name', summaryOf('bad name', { writtenAt: Date.now() }))
  outcome(dataDir, 'journal-only', 3, 'm-b')
  assert.equal(latestSession(dataDir), 'mid')
  assert.equal(report(dataDir, null).session, 'mid')
  const when = new Date(Date.now() - 3600 * 1000)
  for (const id of ['a1', 'b1']) {
    laneCall(dataDir, id, 3, 'm-a')
    fs.utimesSync(path.join(dataDir, 'lanes', `${id}.jsonl`), when, when)
  }
  assert.equal(latestSession(dataDir), 'b1')
  writeSummary(dataDir, 's-sum', summaryOf('s-sum', { writtenAt: Date.now() - 1000 }))
  assert.equal(latestSession(dataDir), 's-sum')
  assert.equal(report(dataDir, 'journal-only').recorded, true)
})

test('when only unknown.jsonl was written there is no session, and the report says nothing was recorded', (t) => {
  const dataDir = useDataDir(t)
  laneCall(dataDir, null, 1, 'm-a')
  assert.equal(latestSession(dataDir), null)
  const r = report(dataDir, null)
  assert.deepEqual([r.session, r.recorded, r.complete, r.usd, r.leadUsd, r.agentsUsd, r.resumptions], [null, false, true, null, null, null, null])
})

test('a well-formed id with no records is "not recorded yet", never zero dollars', (t) => {
  const dataDir = useDataDir(t)
  const r = report(dataDir, 'nothing')
  assert.deepEqual(r, {
    session: 'nothing', recorded: false, complete: true, basis: 'test list prices, S1', currency: 'USD', usd: null, leadUsd: null, agentsUsd: null,
    byModel: {}, byEffort: {}, byRole: {}, harness: { calls: 0, usd: 0, byModel: {} }, unpriced: [], firstRequest: null, lastRequest: null, resumptions: null, resumptionsApproximate: true,
  })
})

test('E3: the same id adds up across gaps of more than an hour; another id takes none of its dollars', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [
    { entries: [meter(0, 'm-a', null, 'input'), meter(30, 'm-a', null, 'input')] },
    { entries: [meter(91, 'm-a', null, 'input'), meter(151, 'm-a', null, 'input')] },
  ])
  const call = laneCall(dataDir, 's1', 200, 'm-b', 'output')
  const out = outcome(dataDir, 's1', 400, 'm-a')
  writeParts(dataDir, 's2', [{ entries: [meter(5, 'm-b', null, 'input')] }])
  const r = report(dataDir, 's1')
  close(r.usd, 4 + call + out)
  assert.equal(r.resumptions, 2)
  assert.deepEqual([r.firstRequest, r.lastRequest, r.resumptionsApproximate], [iso(T0), iso(T0 + 400 * MIN), true])
  close(report(dataDir, 's2').usd, 10)
})

test('a model with no price is listed and never costs a made-up zero; a priced model with zero tokens is a measured zero', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'x-free', null, 'input'), { ...meter(1, 'm-a', null, 'input'), input: 0 }] }])
  const r = report(dataDir, 's1')
  assert.deepEqual([r.recorded, r.usd, r.unpriced], [true, 0, ['x-free']])
  assert.deepEqual(r.byModel, { 'm-a': { usd: 0, requests: 1 } })
  assert.deepEqual(Object.keys(r.byRole), ['main'])
  assert.deepEqual([r.firstRequest, r.lastRequest], [iso(T0), iso(T0 + MIN)])
  writeParts(dataDir, 's2', [{ entries: [meter(0, 'x-free', null, 'input')] }])
  const none = report(dataDir, 's2')
  assert.deepEqual([none.recorded, none.usd, none.leadUsd, none.byModel, none.byRole, none.unpriced], [true, 0, 0, {}, {}, ['x-free']])
})

test('a part or a summary that cannot be read makes the figure incomplete and keeps what was read', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }, { entries: [meter(1, 'm-b', null, 'output')] }])
  fs.writeFileSync(path.join(dataDir, 'usage', 's1', '1.json'), '{"session":"s1","entr')
  const r = report(dataDir, 's1')
  assert.deepEqual([r.recorded, r.complete], [true, false])
  close(r.usd, 1)
  writeParts(dataDir, 's2', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  fs.mkdirSync(path.join(dataDir, 'spend'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'spend', 's2.json'), 'not json')
  const b = report(dataDir, 's2')
  assert.deepEqual([b.recorded, b.complete], [true, false])
  close(b.usd, 1)
  fs.writeFileSync(path.join(dataDir, 'spend', 's3.json'), 'not json')
  assert.deepEqual([report(dataDir, 's3').recorded, report(dataDir, 's3').complete, report(dataDir, 's3').usd], [true, false, 0])
})

test('R9: an unreadable journal line makes incomplete only the sessions whose span holds it', (t) => {
  const dataDir = useDataDir(t)
  const one = outcome(dataDir, 's1', 0, 'm-a')
  journalLine(dataDir, `{"kind":"outcome","time":${T0 + 5 * MIN},"sess`)
  outcome(dataDir, 's1', 10, 'm-a')
  outcome(dataDir, 's2', 100, 'm-a')
  journalLine(dataDir, 'this is not json')
  outcome(dataDir, 's2', 110, 'm-a')
  outcome(dataDir, 's3', 200, 'm-a')
  journalLine(dataDir, '')
  const s1 = report(dataDir, 's1')
  assert.equal(s1.complete, false)
  close(s1.usd, 2 * one)
  assert.equal(report(dataDir, 's2').complete, false)
  const s3 = report(dataDir, 's3')
  assert.deepEqual([s3.recorded, s3.complete], [true, true])
  close(s3.usd, one)
  const s4 = report(dataDir, 's4')
  assert.deepEqual([s4.recorded, s4.complete], [false, true])
})

test('the figure is the summary plus what is still on disk, each event once', (t) => {
  const dataDir = useDataDir(t)
  writeSummary(dataDir, 's1', summaryOf('s1', { through: { usage: T0 + 10 * MIN, lanes: T0 + 10 * MIN } }))
  writeParts(dataDir, 's1', [{ entries: [meter(10, 'm-a', null, 'input'), meter(20, 'm-b', null, 'output')] }])
  laneCall(dataDir, 's1', 10, 'm-b', 'output')
  laneCall(dataDir, 's1', 30, 'm-a', 'input')
  const r = report(dataDir, 's1')
  assert.equal(r.recorded, true)
  close(r.usd, 25 + 20 + 1)
  close(r.leadUsd, 3 + 20)
  close(r.agentsUsd, 2)
  close(r.harness.usd, 21)
  assert.equal(r.harness.calls, 2)
  assert.deepEqual([r.byModel['m-a'].requests, r.byModel['m-b'].requests], [3, 2])
  close(r.byModel['m-a'].usd, 6)
  close(r.byModel['m-b'].usd, 40)
  assert.equal(r.byRole.main.requests, 2)
  assert.deepEqual(r.unpriced, ['x-old'])
  assert.equal(r.resumptions, 2)
  assert.deepEqual([r.firstRequest, r.lastRequest], [iso(T0 - 60 * MIN), iso(T0 + 30 * MIN)])
  close(bucketSum(r.byModel), r.usd)
  close(bucketSum(r.byEffort), r.usd)
})

test('a summary alone is a figure, and an incomplete summary says so', (t) => {
  const dataDir = useDataDir(t)
  writeSummary(dataDir, 's1', summaryOf('s1'))
  const r = report(dataDir, 's1')
  assert.deepEqual([r.recorded, r.complete, r.usd, r.resumptions], [true, true, 25, 2])
  const bad = summaryOf('s2')
  bad.tally.complete = false
  writeSummary(dataDir, 's2', bad)
  assert.equal(report(dataDir, 's2').complete, false)
})

test('C5: each id counts only its own files and entries', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  writeParts(dataDir, 's2', [{ entries: [meter(0, 'm-b', null, 'input')] }])
  laneCall(dataDir, 's1', 1, 'm-a', 'input', { session: 's2' })
  laneCall(dataDir, null, 2, 'm-b')
  outcome(dataDir, 's2', 3, 'm-b')
  fs.writeFileSync(path.join(dataDir, 'lanes', 'bad name.jsonl'), `${JSON.stringify({ kind: 'call', time: T0, model: 'm-b', usage: { input: 1e6 } })}\n`)
  const r1 = report(dataDir, 's1')
  close(r1.usd, 1)
  assert.equal(r1.harness.calls, 0)
  const r2 = report(dataDir, 's2')
  close(r2.usd, 20)
  assert.equal(r2.harness.calls, 1)
})

test('C5: reading one id while another keeps writing gives the same figure every time', async (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 'quiet', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  const script = `
    const fs = require('node:fs'); const path = require('node:path')
    const dir = process.argv[1]
    fs.mkdirSync(path.join(dir, 'lanes'), { recursive: true }); fs.mkdirSync(path.join(dir, 'router'), { recursive: true })
    for (let i = 0; i < 400; i++) {
      fs.appendFileSync(path.join(dir, 'lanes', 'busy.jsonl'), JSON.stringify({ kind: 'call', time: i, model: 'm-a', usage: { input: 1 } }) + '\\n')
      fs.appendFileSync(path.join(dir, 'router', 'decisions.jsonl'), JSON.stringify({ kind: 'outcome', id: 'x' + i, time: i, session: 'busy', model: 'm-a', usage: { input: 1 } }) + '\\n')
      fs.mkdirSync(path.join(dir, 'usage', 'busy'), { recursive: true }); fs.writeFileSync(path.join(dir, 'usage', 'busy', '0.json'), JSON.stringify({ session: 'busy', entries: [] }))
    }`
  const writer = spawn(process.execPath, ['-e', script, dataDir], { stdio: 'ignore' })
  const done = once(writer, 'exit')
  const first = report(dataDir, 'quiet')
  for (let i = 0; i < 300 && writer.exitCode === null; i++) {
    assert.deepEqual(report(dataDir, 'quiet'), first)
    await new Promise((resolve) => setImmediate(resolve))
  }
  await done
  assert.deepEqual(report(dataDir, 'quiet'), first)
  assert.equal(report(dataDir, 'busy').harness.calls, 800)
})

test('E8: a session of 3,005 requests in 4 parts adds up to the independent sum', (t) => {
  const dataDir = useDataDir(t)
  const kinds = ['input', 'output', 'cacheRead', 'cacheWrite']
  const agents = { g0: { type: 'aether:judge' }, g1: { type: 'aether:implementer' }, g2: { type: 'aether:writer' }, g3: { type: 'aether:reviewer' }, g4: { type: 'aether:supervisor' } }
  const entries = Array.from({ length: 3005 }, (_, i) => meter(i % 50, i % 3 === 0 ? 'm-a' : 'm-b', i % 7 === 0 ? `g${i % 5}` : null, kinds[i % 4], i % 2 ? 'high' : 'xhigh'))
  writeParts(dataDir, 's1', [0, 1, 2, 3].map((p) => ({ agents, entries: entries.slice(p * 1000, (p + 1) * 1000) })))
  assert.equal(fs.readdirSync(path.join(dataDir, 'usage', 's1')).length, 4)
  const r = report(dataDir, 's1')
  close(r.usd, sum(entries.map(usdOf)))
  close(r.leadUsd, sum(entries.filter((e) => !e.agent).map(usdOf)))
  close(r.agentsUsd, sum(entries.filter((e) => e.agent).map(usdOf)))
  assert.equal(sum(Object.values(r.byModel).map((b) => b.requests)), 3005)
  close(bucketSum(r.byRole), r.usd)
  assert.equal(r.complete, true)
})

test('mergeTallies adds the parts, keeps the cut out of the resumptions, and is incomplete when either part is', () => {
  const a = tallyOf([
    { source: 'meter', time: T0, model: 'm-a', effort: 'high', usd: 1, lead: true, role: 'main' },
    { source: 'meter', time: T0 + GAP_MS + 1, model: 'x-a', effort: null, usd: null, lead: true, role: 'main' },
  ])
  const b = tallyOf([
    { source: 'call', time: T0 + 10 * GAP_MS, model: 'm-a', effort: 'high', usd: 2 },
    { source: 'outcome', time: null, model: 'x-b', effort: null, usd: null },
  ])
  b.complete = false
  const merged = mergeTallies(a, b)
  assert.deepEqual([merged.usd, merged.leadUsd, merged.agentsUsd, merged.harness.usd, merged.harness.calls], [3, 1, 0, 2, 2])
  assert.deepEqual(merged.byModel, { 'm-a': { usd: 3, requests: 2 } })
  assert.deepEqual(merged.byEffort, { 'm-a high': { usd: 3, requests: 2 } })
  assert.deepEqual(merged.unpriced, ['x-a', 'x-b'])
  assert.deepEqual([merged.first, merged.last], [T0, T0 + 10 * GAP_MS])
  assert.deepEqual([a.resumptions, b.resumptions, merged.resumptions], [1, 0, 1])
  assert.equal(merged.complete, false)
  assert.deepEqual(mergeTallies(emptyTally(), emptyTally()), emptyTally())
  assert.equal(tallyOf([{ source: 'meter', time: T0, model: 'm-a', effort: null, usd: 0, lead: true }, { source: 'meter', time: T0 + GAP_MS, model: 'm-a', effort: null, usd: 0, lead: true }]).resumptions, 0)
})

test('the mark of a summary drops what it already holds and keeps an entry with no time', (t) => {
  const dataDir = useDataDir(t)
  const noTime = { ...meter(0, 'm-a', null, 'input'), t: undefined }
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input'), meter(5, 'm-a', null, 'input'), meter(6, 'm-a', null, 'input'), noTime] }])
  const read = readUsageEvents(dataDir, 's1', { after: T0 + 5 * MIN, prices: PRICES })
  assert.deepEqual(read.events.map((event) => event.time), [T0 + 6 * MIN, null])
  assert.deepEqual([read.exists, read.complete, read.vanished], [true, true, false])
  assert.ok(read.writtenAt > 0)
  laneCall(dataDir, 's1', 1, 'm-a')
  laneCall(dataDir, 's1', 2, 'm-a', 'input', { session: null })
  laneCall(dataDir, 's1', 3, 'm-a', 'input', { session: 's9' })
  assert.deepEqual(readLaneEvents(dataDir, 's1', { prices: PRICES }).events.map((event) => event.time), [T0 + MIN, T0 + 2 * MIN])
  assert.deepEqual(readLaneEvents(dataDir, 's1', { after: T0 + MIN, prices: PRICES }).events.map((event) => event.time), [T0 + 2 * MIN])
  assert.deepEqual(readLaneEvents(dataDir, 'nothing', { prices: PRICES }), { exists: false, events: [], complete: true, writtenAt: null, vanished: false })
  assert.equal(readUsageEvents(dataDir, 'unknown', { prices: PRICES }).exists, false)
})

test('a summary of another id, or one that is not a summary, is not read and the figure says so', (t) => {
  const dataDir = useDataDir(t)
  writeSummary(dataDir, 's1', summaryOf('s2'))
  assert.deepEqual(readSummary(dataDir, 's1'), { exists: true, readable: false, summary: null })
  assert.deepEqual(readSummary(dataDir, 'none'), { exists: false, readable: false, summary: null })
  assert.equal(readSummary(dataDir, 's2').exists, false)
  const r = report(dataDir, 's1')
  assert.deepEqual([r.recorded, r.complete, r.usd], [true, false, 0])
  writeSummary(dataDir, 's3', summaryOf('s3', { version: 2 }))
  assert.equal(readSummary(dataDir, 's3').readable, false)
  writeSummary(dataDir, 's4', summaryOf('s4'))
  assert.equal(readSummary(dataDir, 's4').readable, true)
})

test('a model named like an object property is only a name', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, '__proto__', null, 'input'), meter(1, 'constructor', null, 'input')] }])
  const r = report(dataDir, 's1')
  assert.deepEqual(r.unpriced, ['__proto__', 'constructor'])
  assert.deepEqual(Object.keys(r.byModel), [])
  assert.equal(r.usd, 0)
  const priced = tallyOf([{ source: 'meter', time: T0, model: '__proto__', effort: null, usd: 2, lead: true, role: 'main' }])
  assert.deepEqual(Object.keys(priced.byModel), ['__proto__'])
  assert.equal(mergeTallies(priced, priced).byModel['__proto__'].usd, 4)
  assert.equal(Object.getPrototypeOf(priced.byModel), Object.prototype)
})

test('isTime and later are defined once, in spend.js, and the archive uses those', () => {
  const { isTime, later } = spendLib
  assert.deepEqual([1, 0, -3.5].map(isTime), [true, true, true])
  assert.deepEqual([NaN, Infinity, '1', null, undefined, {}].map(isTime), [false, false, false, false, false, false])
  assert.deepEqual([later(null, 3), later(2, null), later(2, 5), later(5, 2), later(null, null)], [3, 2, 5, 5, null])
  const archive = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'spend-archive.js'), 'utf8')
  assert.doesNotMatch(archive, /^(const|function) (isTime|later)\b/m)
  assert.match(archive, /\bisTime\b[^\n]*\blater\b[^\n]*= require\('\.\/spend\.js'\)|\blater\b[^\n]*\bisTime\b[^\n]*= require\('\.\/spend\.js'\)/)
})
