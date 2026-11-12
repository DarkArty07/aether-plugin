'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn, useDataDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const wt = require('../plugins/aether/lib/worktrees.js')
const run = require('../plugins/aether/lib/run.js')
const { digest } = require('../plugins/aether/lib/lanes.js')
const stuck = require('../plugins/aether/lib/wt-stuck.js')

function scenario(t) {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = wt.ensure(repo.dir, args.runId, 'task-1')
  return { repo, args, unit }
}

function begin(s, reason = 'the ladder is spent (exhausted)', { path: file, digest: sum } = {}) {
  const target = file || run.stuckPayloadFile(s.repo.dir, s.args.runId, 'task-1')
  const text = JSON.stringify({ reason })
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, text)
  return stuck.stuckBegin(s.repo.dir, s.args.runId, 'task-1', { payload: target, digest: sum || digest(text) })
}

const record = (s, id = 'task-1') => JSON.parse(fs.readFileSync(run.stuckFile(s.repo.dir, s.args.runId, id), 'utf8'))
const quick = { sleep: async () => {}, stopped: () => false }
const tip = (s) => s.repo.git('-C', s.unit.path, 'rev-parse', 'HEAD')

test('begin saves the unit work, names the files outside Owns, and records the wait', (t) => {
  const s = scenario(t)
  commitIn(s.repo, s.unit.path, 'docs/outside.md', 'outside\n', 'outside owns')
  fs.mkdirSync(path.join(s.unit.path, 'src', 't1'), { recursive: true })
  fs.writeFileSync(path.join(s.unit.path, 'src', 't1', 'b.js'), 'owned but not committed\n')
  const out = begin(s)
  assert.deepEqual([out.stuck, out.task, out.state], [true, 'task-1', 'waiting'])
  assert.equal(out.branch, `aether/${s.args.runId}/task-1`)
  assert.equal(out.worktree, s.unit.path)
  assert.deepEqual(out.outside, ['docs/outside.md'])
  assert.equal(s.repo.git('-C', s.unit.path, 'status', '--porcelain'), '', 'the owned work was committed')
  assert.equal(out.head, tip(s))
  const saved = record(s)
  assert.deepEqual([saved.run, saved.task, saved.reason, saved.state], [s.args.runId, 'task-1', 'the ladder is spent (exhausted)', 'waiting'])
  assert.deepEqual(saved.outside, ['docs/outside.md'])
  assert.match(saved.at, /^\d{4}-\d\d-\d\dT/)
  assert.ok(fs.existsSync(s.unit.path), 'the worktree is kept while the unit waits')
})

test('begin refuses a payload at another path, a wrong digest, an unknown unit and a unit that already waits', (t) => {
  const s = scenario(t)
  const other = path.join(s.args.runDir, 'ladder', 'task-2-stuck.json')
  assert.throws(() => begin(s, 'x', { path: other }), /payload path must be/)
  assert.throws(() => begin(s, 'x', { digest: '00000000:1' }), /digest does not match the payload file/)
  assert.throws(() => stuck.stuckBegin(s.repo.dir, s.args.runId, 'task-9', { payload: other, digest: '00000000:1' }), /task-9 is not in run/)
  begin(s)
  assert.throws(() => begin(s), /task-1 is already waiting for a fix/)
})

test('a tick sleeps its seconds, writes the heartbeat and reports the state', async (t) => {
  useDataDir(t) // the default `stopped` reads the autonomy registry: it must not read the real data directory
  const s = scenario(t)
  begin(s)
  const slept = []
  const out = await stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', 30, { sleep: async (ms) => slept.push(ms), stopped: () => false })
  assert.deepEqual(out, { paused: 30, state: 'waiting', stop: false })
  assert.deepEqual(slept, [30000])
  const beat = JSON.parse(fs.readFileSync(run.heartbeatFile(s.repo.dir, s.args.runId), 'utf8'))
  assert.equal(beat.task, 'task-1')
  assert.match(beat.at, /^\d{4}-\d\d-\d\dT/)
  for (const bad of [0, 121, '1.5', 'x', undefined]) {
    await assert.rejects(() => stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', bad, quick), /--seconds must be a whole number from 1 to 120/)
  }
  assert.equal((await stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', 5, { sleep: async () => {}, stopped: () => true })).stop, true)
  // With no open autonomous run (the data directory of the test is empty), the default says the ceiling was not reached.
  assert.equal((await stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', 1, { sleep: async () => {} })).stop, false)
  await assert.rejects(() => stuck.stuckTick(s.repo.dir, s.args.runId, 'task-2', 5, quick), /task-2 has no stuck record/)
})

test('deliver takes the tip of the unit branch, and the next tick reports it with the Lead reason', async (t) => {
  const s = scenario(t)
  commitIn(s.repo, s.unit.path, 'src/t1/a.js', 'one\n', 'first')
  const first = tip(s)
  commitIn(s.repo, s.unit.path, 'src/t1/a.js', 'two\n', 'the fix')
  const second = tip(s)
  begin(s)
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: first, reason: 'x' }), /the commit must be the tip of aether\/.+\/task-1/)
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: 'deadbeef', reason: 'x' }), /is not a commit of this repository/)
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { reason: 'x' }), /deliver needs --commit/)
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: second }), /deliver needs --reason/)
  assert.equal(record(s).state, 'waiting', 'a refused delivery changes nothing')
  const out = stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: second.slice(0, 10), reason: 'moved the test into Owns' })
  assert.deepEqual(out, { delivered: true, task: 'task-1', commit: second, reason: 'moved the test into Owns' })
  assert.equal(record(s).state, 'delivered')
  assert.equal(s.repo.git('rev-parse', s.args.integration.branch), s.args.integration.base, 'the integration branch is untouched')
  assert.deepEqual(await stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', 1, quick), { paused: 1, state: 'delivered', stop: false, commit: second, reason: 'moved the test into Owns' })
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: second, reason: 'again' }), /task-1 is not waiting for a fix/)
  assert.throws(() => stuck.declineUnit(s.repo.dir, s.args.runId, 'task-1', { reason: 'late' }), /task-1 is not waiting for a fix/)
})

test('decline records the Lead reason, the tick reports it, and a delivery is refused after it', async (t) => {
  const s = scenario(t)
  begin(s)
  assert.throws(() => stuck.declineUnit(s.repo.dir, s.args.runId, 'task-1', {}), /decline needs --reason/)
  assert.deepEqual(stuck.declineUnit(s.repo.dir, s.args.runId, 'task-1', { reason: 'the plan puts the test outside Owns' }), { declined: true, task: 'task-1', reason: 'the plan puts the test outside Owns' })
  assert.deepEqual(await stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', 1, quick), { paused: 1, state: 'declined', stop: false, reason: 'the plan puts the test outside Owns' })
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: tip(s), reason: 'x' }), /task-1 is not waiting for a fix/)
  assert.throws(() => stuck.declineUnit(s.repo.dir, s.args.runId, 'task-2', { reason: 'x' }), /task-2 is not waiting for a fix/)
})

test('end closes the record with its outcome, once, and refuses an unknown outcome', (t) => {
  const s = scenario(t)
  begin(s)
  assert.throws(() => stuck.stuckEnd(s.repo.dir, s.args.runId, 'task-1', 'whenever'), /unknown outcome: whenever/)
  assert.deepEqual(stuck.stuckEnd(s.repo.dir, s.args.runId, 'task-1', 'expired'), { ended: true, task: 'task-1', outcome: 'expired' })
  const saved = record(s)
  assert.equal(saved.state, 'ended')
  assert.equal(saved.ended.outcome, 'expired')
  assert.deepEqual(stuck.stuckEnd(s.repo.dir, s.args.runId, 'task-1', 'ceiling'), { ended: true, task: 'task-1', outcome: 'expired', already: true })
  assert.throws(() => stuck.stuckEnd(s.repo.dir, s.args.runId, 'task-2', 'expired'), /task-2 has no stuck record/)
  for (const outcome of stuck.OUTCOMES) assert.ok(['expired', 'ceiling', 'declined', 'merged', 'rejected'].includes(outcome))
})

test('a delivery and a declination are refused once the run left its end mark', (t) => {
  const s = scenario(t)
  commitIn(s.repo, s.unit.path, 'src/t1/a.js', 'one\n', 'the fix')
  begin(s)
  fs.writeFileSync(run.launchEndFile(s.repo.dir, s.args.runId), '{}\n')
  assert.throws(() => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: tip(s), reason: 'x' }), new RegExp(`run ${s.args.runId} has ended`))
  assert.throws(() => stuck.declineUnit(s.repo.dir, s.args.runId, 'task-1', { reason: 'x' }), new RegExp(`run ${s.args.runId} has ended`))
  assert.equal(record(s).state, 'waiting')
})
