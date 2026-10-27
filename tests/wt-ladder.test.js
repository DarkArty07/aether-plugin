'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WT_BIN, makeRepo, compile, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const { loadLadder, effortFor } = require('../plugins/aether/lib/ladder.js')
const { ladderCommand } = require('../plugins/aether/lib/wt-ladder.js')

const L = loadLadder()
const [HAIKU, SONNET, OPUS] = L.rungs

function setup(t) {
  const repo = makeRepo(t)
  return { repo, args: compile(repo, plan([task(1), task(2)])) }
}

// Writes the verdict's payload where the verb expects it; returns the flags the verb takes.
function carry(args, id, body) {
  const dir = path.join(args.runDir, 'ladder')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${id}-verdict.json`)
  const text = JSON.stringify(body)
  fs.writeFileSync(file, text)
  return { payload: file, digest: lanes.digest(text) }
}
const fix = (what) => ({ findings: [{ file: 'src/t1/a.js', line: 3, what }] })
const judged = (s, verdict, body, opts = {}, id = 'task-1') => ladderCommand(s.repo.dir, s.args.runId, id, { verdict, ...carry(s.args, id, body), ...opts })
const view = (s, id = 'task-1', opts = {}) => ladderCommand(s.repo.dir, s.args.runId, id, opts)

test('a unit with no state starts on the first rung, and reading it creates its state file', (t) => {
  const s = setup(t)
  assert.deepEqual(view(s), {
    task: 'task-1', status: 'open', step: HAIKU.step, model: HAIKU.model, effort: HAIKU.effort.first,
    kind: 'first', cause: null, attempts: 0, correctionsUsed: 0, corrections: HAIKU.corrections,
  })
  assert.ok(fs.existsSync(path.join(s.args.runDir, 'ladder', 'task-1.json')))
})

test('a fix is a correction on the same rung, at the rung\'s retry effort', (t) => {
  const s = setup(t)
  const answer = judged(s, 'fix', fix('missing case'))
  assert.equal(answer.accepted, true)
  assert.deepEqual([answer.step, answer.kind, answer.effort, answer.correctionsUsed, answer.attempts], [HAIKU.step, 'fix', HAIKU.effort.retry, 1, 1])
})

test('the same findings as often as the ladder says rise to the next rung', (t) => {
  const s = setup(t)
  let answer
  for (let i = 0; i < L.repeatFindings; i++) answer = judged(s, 'fix', fix('missing case'))
  assert.deepEqual([answer.step, answer.kind, answer.cause, answer.effort], [SONNET.step, 'rise', 'repeated', effortFor(L, SONNET.step, 'rise')])
})

test('the corrections of a rung are spent, then the next fix rises', (t) => {
  const s = setup(t)
  for (let i = 1; i <= HAIKU.corrections; i++) assert.equal(judged(s, 'fix', fix(`gap ${i}`)).step, HAIKU.step)
  const answer = judged(s, 'fix', fix('one more gap'))
  assert.deepEqual([answer.step, answer.kind, answer.cause], [SONNET.step, 'rise', 'exhausted'])
})

test('infeasible needs a reason: with one it rises, without one the verdict is rejected and nothing changes', (t) => {
  const s = setup(t)
  const before = view(s)
  const rejected = judged(s, 'infeasible', {})
  assert.equal(rejected.accepted, false)
  assert.match(rejected.rejection, /reason/)
  assert.deepEqual(view(s), before)
  const answer = judged(s, 'infeasible', { reason: 'beyond this model' })
  assert.deepEqual([answer.accepted, answer.step, answer.cause], [true, SONNET.step, 'infeasible'])
})

test('approve closes the unit, and no later verdict is accepted', (t) => {
  const s = setup(t)
  const done = judged(s, 'approve', {})
  assert.deepEqual([done.accepted, done.status, done.kind, done.step, done.model, done.effort], [true, 'approved', 'done', null, null, null])
  const late = judged(s, 'fix', fix('too late'))
  assert.equal(late.accepted, false)
  assert.match(late.rejection, /approved/)
})

test('an infeasible declaration on the last rung exhausts the ladder', (t) => {
  const s = setup(t)
  let answer
  for (let i = 0; i < L.rungs.length; i++) answer = judged(s, 'infeasible', { reason: `too hard ${i}` })
  assert.deepEqual([answer.status, answer.kind, answer.step, answer.model], ['exhausted', 'exhausted', null, null])
  assert.equal(L.rungs[L.rungs.length - 1].step, OPUS.step)
})

test('the state is on disk: another process reads the rung the unit reached, and the units are independent', (t) => {
  const s = setup(t)
  judged(s, 'fix', fix('gap 1'))
  const bin = runBin(WT_BIN, ['ladder', s.args.runId, 'task-1'], s.repo.dir)
  assert.equal(bin.status, 0, bin.stdout)
  assert.deepEqual([bin.json.step, bin.json.kind, bin.json.effort, bin.json.correctionsUsed], [HAIKU.step, 'fix', HAIKU.effort.retry, 1])
  assert.deepEqual([view(s, 'task-2').kind, view(s, 'task-2').correctionsUsed], ['first', 0])
})

test('the bin applies a verdict from its payload file', (t) => {
  const s = setup(t)
  const { payload, digest } = carry(s.args, 'task-1', fix('gap'))
  const r = runBin(WT_BIN, ['ladder', s.args.runId, 'task-1', '--verdict', 'fix', '--payload', payload, '--digest', digest], s.repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual([r.json.accepted, r.json.kind, r.json.correctionsUsed], [true, 'fix', 1])
})

test('a wrong digest, another path, an unknown verdict or a missing file is an error, and nothing is read or changed', (t) => {
  const s = setup(t)
  const { payload, digest } = carry(s.args, 'task-1', fix('gap'))
  const run = (extra) => runBin(WT_BIN, ['ladder', s.args.runId, 'task-1', ...extra], s.repo.dir)
  let r = run(['--verdict', 'fix', '--payload', payload, '--digest', '00000000:1'])
  assert.equal(r.status, 1)
  assert.match(r.json.error, /digest/)
  const other = path.join(s.args.runDir, 'ladder', 'task-2-verdict.json')
  fs.writeFileSync(other, '{}')
  r = run(['--verdict', 'fix', '--payload', other, '--digest', lanes.digest('{}')])
  assert.equal(r.status, 1)
  assert.match(r.json.error, /payload path/)
  r = run(['--verdict', 'retry', '--payload', payload, '--digest', digest])
  assert.equal(r.status, 1)
  r = run(['--verdict', 'fix', '--digest', digest])
  assert.equal(r.status, 1)
  fs.rmSync(payload)
  r = run(['--verdict', 'fix', '--payload', payload, '--digest', digest])
  assert.equal(r.status, 1)
  assert.equal(view(s).correctionsUsed, 0)
})

test('a task that is not in the run is an error', (t) => {
  const s = setup(t)
  assert.throws(() => view(s, 'task-9'), /task-9/)
})

test('a number changed in the ladder the verb is given changes its answer, with no code changed', (t) => {
  const s = setup(t)
  const tolerant = { ...L, repeatFindings: L.repeatFindings + 1 }
  let answer
  for (let i = 0; i < L.repeatFindings; i++) answer = judged(s, 'fix', fix('same'), { ladder: tolerant })
  assert.equal(answer.step, HAIKU.step, 'the same findings do not rise yet')
  const tight = { ...L, rungs: L.rungs.map((rung, i) => (i === 0 ? { ...rung, corrections: 1 } : rung)) }
  const s2 = setup(t)
  judged(s2, 'fix', fix('a'), { ladder: tight })
  assert.equal(judged(s2, 'fix', fix('b'), { ladder: tight }).step, SONNET.step)
})
