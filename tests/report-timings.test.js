'use strict'

// Spec 036 task 7 (R18, R19): run durations in the report. recordTiming appends one line per
// timing, timingsOf totals them by class, the report shows them with the quota wait among them,
// and a gate pass writes one gate line.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useDataDir, tempDir, makeRepo, compile, commitIn, runBin, WT_BIN } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { T0, MIN, finishedRun } = require('./report-fixtures.js')
const { CLASSES, recordTiming, timingsOf, quotaWaitOf } = require('../plugins/aether/lib/run-timings.js')
const { gateCommand } = require('../plugins/aether/lib/wt-gate.js')
const { report } = require('../plugins/aether/lib/report.js')

const iso = (ms) => new Date(ms).toISOString()

test('recordTiming appends one line with the class, ms and an ISO date', (t) => {
  useDataDir(t)
  const { args } = finishedRun(t)
  recordTiming(args.runDir, 'gate', 1500)
  const lines = fs.readFileSync(path.join(args.runDir, 'timings.jsonl'), 'utf8').trim().split('\n')
  assert.equal(lines.length, 1)
  const entry = JSON.parse(lines[0])
  assert.equal(entry.class, 'gate')
  assert.equal(entry.ms, 1500)
  assert.equal(entry.at, iso(Date.parse(entry.at)))
})

test('the recorded classes are gate, merge-tests, baseline and wait-stuck, without wait-quota', () => {
  assert.deepEqual(CLASSES, ['gate', 'merge-tests', 'baseline', 'wait-stuck'])
})

test('recordTiming throws on a class it does not record', () => {
  assert.throws(() => recordTiming('/no/such/dir', 'wait-quota', 10), /unknown timing class/)
  assert.throws(() => recordTiming('/no/such/dir', 'model', 10), /unknown timing class/)
})

test('recordTiming never throws on a failed write', (t) => {
  const blocked = path.join(tempDir(t), 'a-file')
  fs.writeFileSync(blocked, 'in the way\n')
  recordTiming(path.join(blocked, 'run'), 'gate', 10)
  assert.equal(fs.readFileSync(blocked, 'utf8'), 'in the way\n')
})

test('recordTiming writes nothing and does not throw on a duration that is not a number', (t) => {
  const runDir = tempDir(t)
  recordTiming(runDir, 'wait-stuck', NaN)
  recordTiming(runDir, 'wait-stuck', undefined)
  assert.equal(fs.existsSync(path.join(runDir, 'timings.jsonl')), false)
})

test('timingsOf totals by class', (t) => {
  useDataDir(t)
  const { args } = finishedRun(t)
  recordTiming(args.runDir, 'gate', 1000)
  recordTiming(args.runDir, 'gate', 2000)
  recordTiming(args.runDir, 'baseline', 500)
  assert.deepEqual(timingsOf(args.runDir), {
    byClass: { gate: { count: 2, ms: 3000 }, baseline: { count: 1, ms: 500 } },
    totalMs: 3500,
  })
})

test('timingsOf on a missing file or bad lines reports none', (t) => {
  useDataDir(t)
  const { args } = finishedRun(t)
  assert.deepEqual(timingsOf(args.runDir), { byClass: {}, totalMs: 0, none: true })
  fs.writeFileSync(path.join(args.runDir, 'timings.jsonl'), 'not json\n{"class":"gate"}\n')
  assert.deepEqual(timingsOf(args.runDir), { byClass: {}, totalMs: 0, none: true })
})

test('the report of a fixture run with a timings file shows each class and the total', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  recordTiming(args.runDir, 'gate', 1000)
  recordTiming(args.runDir, 'gate', 2000)
  recordTiming(args.runDir, 'baseline', 500)
  const r = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual(r.timings, {
    byClass: { gate: { count: 2, ms: 3000 }, baseline: { count: 1, ms: 500 } },
    totalMs: 3500,
  })
  assert.ok(r.notes.includes('not a model: 3500ms of 1800000ms'), r.notes.join('\n'))
})

test('a fixture run without the file reports as before, with no timings key', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  const before = report(repo.dir, args.runId, { tests: false })
  assert.equal('timings' in before, false)
  assert.equal(before.notes.some((note) => note.startsWith('not a model:')), false)
  recordTiming(args.runDir, 'gate', 1000)
  assert.equal('timings' in report(repo.dir, args.runId, { tests: false }), true)
  fs.rmSync(path.join(args.runDir, 'timings.jsonl'))
  assert.deepEqual(report(repo.dir, args.runId, { tests: false }), before)
})

function gateUnit(t) {
  const repo = makeRepo(t)
  const check = "if (require('fs').existsSync('src/t1/bad.js')) { console.log('not ok 1 - tests/new.test.js'); process.exit(1) }\nconsole.log('# pass 12')\n"
  commitIn(repo, repo.dir, 'check.js', check, 'add the check')
  const args = compile(repo, plan([task(1), task(2)], { execution: ['- Test command: `node check.js`'] }), ['--no-baseline'])
  const created = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  return { repo, args, wt: created.path }
}

test('a gate pass writes one gate line', (t) => {
  const u = gateUnit(t)
  commitIn(u.repo, u.wt, 'src/t1/a.js', 'one\n', 'add a')
  const g = gateCommand(u.repo.dir, u.args.runId, 'task-1')
  assert.equal(g.pass, true)
  const lines = fs.readFileSync(path.join(u.args.runDir, 'timings.jsonl'), 'utf8').trim().split('\n')
  assert.equal(lines.length, 1)
  const entry = JSON.parse(lines[0])
  assert.equal(entry.class, 'gate')
  assert.ok(Number.isInteger(entry.ms) && entry.ms >= 0, `ms is ${entry.ms}`)
})

function autonomyRun(mainRoot, pauses) {
  const dir = path.join(mainRoot, '.aether', 'autonomy', 'owner-run')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ id: 'owner-run', quotaPauses: pauses }) + '\n')
}

const pause = (runId, started, resumeAt) => ({ started: iso(started), resumeAt: iso(resumeAt), savedUnits: [{ swarmRun: runId, task: 'task-1' }] })

test('quotaWaitOf counts the pauses that name the run, from started to resumeAt', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  autonomyRun(repo.dir, [pause(args.runId, T0, T0 + 5 * MIN)])
  assert.deepEqual(quotaWaitOf(repo.dir, args.runId, T0 + 30 * MIN), { count: 1, ms: 5 * MIN })
})

test('quotaWaitOf skips a pause that names another swarm run or cannot be read', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  autonomyRun(repo.dir, [pause('20260101-000000-abcd', T0, T0 + 5 * MIN)])
  assert.deepEqual(quotaWaitOf(repo.dir, args.runId, T0 + 30 * MIN), { count: 0, ms: 0 })
  fs.writeFileSync(path.join(repo.dir, '.aether', 'autonomy', 'owner-run', 'run.json'), 'not json\n')
  assert.deepEqual(quotaWaitOf(repo.dir, args.runId, T0 + 30 * MIN), { count: 0, ms: 0 })
})

test('quotaWaitOf counts a pause with a later resumeAt only up to now', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  autonomyRun(repo.dir, [pause(args.runId, T0, T0 + 60 * MIN)])
  assert.deepEqual(quotaWaitOf(repo.dir, args.runId, T0 + 10 * MIN), { count: 1, ms: 10 * MIN })
})

test('the report of a quota-waited run shows a wait-quota entry', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  autonomyRun(repo.dir, [pause(args.runId, T0, T0 + 5 * MIN)])
  const r = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual(r.timings.byClass['wait-quota'], { count: 1, ms: 5 * MIN })
  assert.equal(r.timings.totalMs, 5 * MIN)
  assert.ok(r.notes.includes('not a model: 300000ms of 1800000ms'), r.notes.join('\n'))
})
