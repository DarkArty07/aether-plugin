'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WT_BIN, makeRepo, compile, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const { loadLadder, GATE_CUT } = require('../plugins/aether/lib/ladder.js')
const { ladderCommand, resetSpent } = require('../plugins/aether/lib/wt-ladder.js')

const L = loadLadder()

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

test('a unit with no state starts on the first rung, and its view names the rung, its place and its supervisor', (t) => {
  const s = setup(t)
  assert.deepEqual(view(s), {
    task: 'task-1', status: 'open', step: 'haiku-high', model: 'haiku', effort: 'high', supervisor: { model: 'sonnet', effort: 'high' },
    position: 1, of: 5, kind: 'first', cause: null, attempts: 0,
  })
  assert.ok(fs.existsSync(path.join(s.args.runDir, 'ladder', 'task-1.json')))
})

test('every rejected attempt moves the unit one rung up with the supervisor of that rung, and the fifth leaves it exhausted', (t) => {
  const s = setup(t)
  const seen = []
  for (let n = 1; n <= 5; n++) {
    const a = judged(s, 'fix', fix(`missing case ${n}`))
    seen.push([a.step, a.effort, a.supervisor && `${a.supervisor.model} ${a.supervisor.effort}`, a.status])
  }
  assert.deepEqual(seen, [
    ['haiku-xhigh', 'xhigh', 'sonnet high', 'open'], ['sonnet-high', 'high', 'opus high', 'open'], ['opus-high', 'high', 'opus xhigh', 'open'],
    ['opus-xhigh', 'xhigh', 'opus xhigh', 'open'], [null, null, null, 'exhausted'],
  ])
})

test('infeasible needs a reason: with one it rises, without one the verdict is rejected and nothing changes', (t) => {
  const s = setup(t)
  const before = view(s)
  const rejected = judged(s, 'infeasible', {})
  assert.equal(rejected.accepted, false)
  assert.match(rejected.rejection, /reason/)
  assert.deepEqual(view(s), before)
  const answer = judged(s, 'infeasible', { reason: 'beyond this model' })
  assert.deepEqual([answer.accepted, answer.step, answer.cause], [true, 'haiku-xhigh', 'infeasible'])
})

test('approve closes the unit, and no later verdict is accepted', (t) => {
  const s = setup(t)
  const done = judged(s, 'approve', {})
  assert.deepEqual([done.accepted, done.status, done.kind, done.step, done.model, done.effort, done.supervisor, done.position], [true, 'approved', 'done', null, null, null, null, null])
  const late = judged(s, 'fix', fix('too late'))
  assert.equal(late.accepted, false)
  assert.match(late.rejection, /approved/)
})

test('an infeasible declaration on the last rung exhausts the ladder', (t) => {
  const s = setup(t)
  let answer
  for (let i = 0; i < L.rungs.length; i++) answer = judged(s, 'infeasible', { reason: `too hard ${i}` })
  assert.deepEqual([answer.status, answer.kind, answer.step, answer.model], ['exhausted', 'exhausted', null, null])
  assert.equal(L.rungs[L.rungs.length - 1].step, 'opus-xhigh')
})

test('the state is on disk: another process reads the rung the unit reached, and the units are independent', (t) => {
  const s = setup(t)
  judged(s, 'fix', fix('gap 1'))
  const bin = runBin(WT_BIN, ['ladder', s.args.runId, 'task-1'], s.repo.dir)
  assert.equal(bin.status, 0, bin.stdout)
  assert.deepEqual([bin.json.step, bin.json.kind, bin.json.effort, bin.json.attempts], ['haiku-xhigh', 'rise', 'xhigh', 1])
  assert.deepEqual([view(s, 'task-2').kind, view(s, 'task-2').attempts], ['first', 0])
})

test('the bin applies a verdict from its payload file', (t) => {
  const s = setup(t)
  const { payload, digest } = carry(s.args, 'task-1', fix('gap'))
  const r = runBin(WT_BIN, ['ladder', s.args.runId, 'task-1', '--verdict', 'fix', '--payload', payload, '--digest', digest], s.repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual([r.json.accepted, r.json.kind, r.json.attempts], [true, 'rise', 1])
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
  assert.equal(view(s).attempts, 0)
})

test('a task that is not in the run is an error', (t) => {
  const s = setup(t)
  assert.throws(() => view(s, 'task-9'), /task-9/)
})

test('a state whose step is absent from the rungs throws ladder: unknown step, not a TypeError', (t) => {
  const s = setup(t)
  view(s)
  const file = path.join(s.args.runDir, 'ladder', 'task-1.json')
  const record = JSON.parse(fs.readFileSync(file, 'utf8'))
  record.state.step = 'no-such-step'
  fs.writeFileSync(file, JSON.stringify(record))
  assert.throws(() => view(s), /ladder: unknown step no-such-step/)
})

test('a shorter ladder given in options changes the rungs of the unit', (t) => {
  const short = { ...L, rungs: L.rungs.slice(3) }
  const s = setup(t)
  const a = judged(s, 'fix', fix('a'), { ladder: short })
  assert.equal(a.step, 'opus-xhigh')
  const b = judged(s, 'fix', fix('b'), { ladder: short })
  assert.equal(b.status, 'exhausted')
})

test('a relaunch also gives a new ladder to a unit that was blocked twice for the same cause, and keeps the old state (issue 135)', (t) => {
  const { repo, args } = setup(t)
  const viewTask = (task) => ladderCommand(repo.dir, args.runId, task)
  viewTask('task-1')
  const dir = path.join(args.runDir, 'ladder')
  const blocked = JSON.parse(fs.readFileSync(path.join(dir, 'task-1.json'), 'utf8'))
  blocked.state.status = 'blocked'
  blocked.next = { step: null, kind: 'blocked', cause: 'blocked-same-cause', reason: 'cannot go green inside Owns', effort: null, carry: true }
  fs.writeFileSync(path.join(dir, 'task-1.json'), JSON.stringify(blocked))
  assert.deepEqual(resetSpent(args.runDir, ['task-1']), ['task-1'])
  assert.deepEqual(fs.readdirSync(dir).sort(), ['task-1.spent-1.json'])
  assert.equal(viewTask('task-1').model, 'haiku', 'the unit starts again on the first rung')
})

test('a relaunch gives a unit with a spent ladder a new one and keeps the old state; an open ladder is never touched', (t) => {
  const { repo, args } = setup(t)
  const viewTask = (task) => ladderCommand(repo.dir, args.runId, task)
  viewTask('task-1')
  viewTask('task-2')
  const dir = path.join(args.runDir, 'ladder')
  const spent = JSON.parse(fs.readFileSync(path.join(dir, 'task-1.json'), 'utf8'))
  spent.state.status = 'exhausted'
  fs.writeFileSync(path.join(dir, 'task-1.json'), JSON.stringify(spent))
  assert.deepEqual(resetSpent(args.runDir, ['task-1', 'task-2', 'task-9']), ['task-1'])
  assert.deepEqual(fs.readdirSync(dir).sort(), ['task-1.spent-1.json', 'task-2.json'])
  assert.equal(viewTask('task-1').model, 'haiku', 'the unit starts again on the first rung')
  assert.equal(viewTask('task-1').attempts, 0)
  // A second spent ladder keeps its own copy.
  const again = JSON.parse(fs.readFileSync(path.join(dir, 'task-1.json'), 'utf8'))
  again.state.status = 'exhausted'
  fs.writeFileSync(path.join(dir, 'task-1.json'), JSON.stringify(again))
  assert.deepEqual(resetSpent(args.runDir, ['task-1']), ['task-1'])
  assert.ok(fs.existsSync(path.join(dir, 'task-1.spent-2.json')))
})
