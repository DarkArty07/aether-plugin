'use strict'

// Spec 034 (R10): a unit the Lead fixed in flight counts as integrated, with its commit and reason, and the launch
// that ended normally is in the spend of an open autonomous run (issue 191).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, useDataDir } = require('./helpers.js')
const { T0, MIN, sampleUsage, finishedRun, sampleLaneLog } = require('./report-fixtures.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { report } = require('../plugins/aether/lib/report.js')

const HOUR = 60 * MIN
const SESSION = 'sess-owner-034'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const cents = (x) => Math.round(x * 100) / 100

// The sample result has task-3 blocked; here the Lead fixed it in flight and the swarm merged it.
function fixed(args, extra = {}) {
  const file = path.join(args.runDir, 'result.json')
  const result = JSON.parse(fs.readFileSync(file, 'utf8'))
  const unit = result.units.find((u) => u.id === 'task-3')
  Object.assign(unit, { status: 'merged', reason: null, question: null, commit: 'merge-task-3', fixedByLead: { commit: 'abcdef0123456789', reason: 'moved the test into Owns' }, ...extra })
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n')
  fs.utimesSync(file, new Date(T0 + 30 * MIN), new Date(T0 + 30 * MIN))
}

test('a unit fixed in flight counts as integrated, with its commit and reason', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  fixed(args)
  const r = report(repo.dir, args.runId, { tests: false })
  const { quality } = r
  assert.deepEqual(
    { units: quality.units, merged: quality.merged, adopted: quality.adopted, integrated: quality.integrated, blocked: quality.blocked },
    { units: 3, merged: 3, adopted: 0, integrated: 3, blocked: 0 },
  )
  assert.deepEqual(quality.fixedUnits, [{ id: 'task-3', commit: 'abcdef0123456789', reason: 'moved the test into Owns' }])
  assert.ok(r.notes.includes('task-3 was fixed in flight by the Lead at abcdef0123: moved the test into Owns'), r.notes.join('\n'))
})

test('a fixed unit with widened files names them in its entry and its note (issue #258)', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  fixed(args, { fixedByLead: { commit: 'abcdef0123456789', reason: 'the test lives outside Owns', widened: ['docs/a.md', 'tests/b.test.js'] } })
  const r = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual(r.quality.fixedUnits, [{ id: 'task-3', commit: 'abcdef0123456789', reason: 'the test lives outside Owns', widened: ['docs/a.md', 'tests/b.test.js'] }])
  assert.ok(r.notes.includes('task-3 was fixed in flight by the Lead at abcdef0123: the test lives outside Owns (widened: docs/a.md, tests/b.test.js)'), r.notes.join('\n'))
})

test('a run with no unit fixed in flight has no fixedUnits key', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  const { quality } = report(repo.dir, args.runId, { tests: false })
  assert.equal('fixedUnits' in quality, false)
})

test('a launch that ended with a unit fixed in flight is in the spend of an open autonomous run (issue 191)', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  fixed(args)
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  const line = { type: 'user', isSidechain: false, origin: { kind: 'human' }, entrypoint: 'sdk-cli', timestamp: '2026-10-08T00:00:00.000Z', message: { role: 'user', content: HOURS } }
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), JSON.stringify(line) + '\n')
  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 30 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)
  const figure = report(repo.dir, args.runId, { dataDir, tests: false }).lanes.totals.run.totalUsd
  const st = autonomy.status(repo.dir, { now: T0 + 10 * MIN, dataDir })
  assert.deepEqual(st.swarms, { runs: [{ run: args.runId, usd: cents(figure) }], unreadable: [] })
  assert.equal(st.usd.spent, cents(figure))
})

test('a unit fixed on launch 1 and blocked without a fix on launch 2 has no fixedUnits entry (#256 3)', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t, { result: false })
  const r1 = path.join(args.runDir, 'result-1.json')
  fs.writeFileSync(
    r1,
    JSON.stringify({
      units: [{ id: 'task-1', status: 'merged', attempts: 1, fixedByLead: { commit: '111111111111', reason: 'fixed task-1 first' } }],
    }) + '\n',
  )
  const r2 = path.join(args.runDir, 'result.json')
  fs.writeFileSync(
    r2,
    JSON.stringify({
      units: [{ id: 'task-1', status: 'blocked', question: 'Which?', attempts: 1 }],
    }) + '\n',
  )
  const { quality } = report(repo.dir, args.runId, { tests: false })
  assert.equal('fixedUnits' in quality, false)
  assert.deepEqual([quality.merged, quality.blocked], [0, 1])
})

test('the quality comment names fixedUnits, and neither comment says correction (#256 2, #236 5)', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'report.js'), 'utf8')
  const delegateLog = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'delegate-log.js'), 'utf8')
  const comment = source.slice(0, source.indexOf('function qualityOf'))
  assert.match(comment, /fixedUnits/)
  assert.doesNotMatch(source, /correction/i)
  assert.doesNotMatch(delegateLog, /correction/i)
})

test('a later launch replaces the fixedByLead entry of the same unit in order of appearance', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t, { result: false })
  const r1 = path.join(args.runDir, 'result-1.json')
  fs.writeFileSync(
    r1,
    JSON.stringify({
      units: [
        { id: 'task-1', status: 'merged', fixedByLead: { commit: '111111111111', reason: 'fixed task-1 first' } },
        { id: 'task-2', status: 'merged', fixedByLead: { commit: '222222222222', reason: 'fixed task-2 first' } },
      ],
    }) + '\n',
  )
  const r2 = path.join(args.runDir, 'result.json')
  fs.writeFileSync(
    r2,
    JSON.stringify({
      units: [
        { id: 'task-1', status: 'merged', fixedByLead: { commit: '333333333333', reason: 'fixed task-1 second' } },
      ],
    }) + '\n',
  )
  const r = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual(r.quality.fixedUnits, [
    { id: 'task-1', commit: '333333333333', reason: 'fixed task-1 second' },
    { id: 'task-2', commit: '222222222222', reason: 'fixed task-2 first' },
  ])
  assert.ok(r.notes.includes('task-1 was fixed in flight by the Lead at 3333333333: fixed task-1 second'))
  assert.ok(r.notes.includes('task-2 was fixed in flight by the Lead at 2222222222: fixed task-2 first'))
})
