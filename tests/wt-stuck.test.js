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

function widenScenario(t, files) {
  const s = scenario(t)
  for (const [file, content] of files) commitIn(s.repo, s.unit.path, file, content ?? 'changed\n', `change ${file}`)
  begin(s)
  return s
}

function widenError(t, files, widen) {
  const s = widenScenario(t, files)
  let message = null
  try {
    stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: tip(s), reason: 'fix', widen })
  } catch (err) {
    message = err.message
  }
  assert.ok(message, `expected deliver with widen ${widen} to fail`)
  assert.equal(record(s).state, 'waiting', 'a refused widen delivery changes nothing')
  return message
}

test('deliver with --widen stores the sorted widened paths, and the tick reports them', async (t) => {
  const s = widenScenario(t, [['docs/extra.md'], ['docs/another.md']])
  const out = stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: tip(s), reason: 'the test lives outside Owns', widen: 'docs/extra.md,docs/another.md,docs/extra.md' })
  assert.deepEqual(out.widen, ['docs/another.md', 'docs/extra.md'])
  assert.deepEqual(record(s).delivered.widen, ['docs/another.md', 'docs/extra.md'])
  assert.deepEqual(await stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', 1, quick), {
    paused: 1,
    state: 'delivered',
    stop: false,
    commit: tip(s),
    reason: 'the test lives outside Owns',
    widen: ['docs/another.md', 'docs/extra.md'],
  })
})

test('deliver without --widen stores no widen list', (t) => {
  const s = widenScenario(t, [['src/t1/a.js', 'one\n']])
  stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: tip(s), reason: 'fixed' })
  assert.equal('widen' in record(s).delivered, false)
  assert.equal('widen' in record(s), false)
})

test('deliver with --widen rejects a malformed path and names it', (t) => {
  for (const bad of ['docs/*.md', 'docs/a?.md', 'docs/[ab].md', 'docs/../README.md', '/etc/passwd', 'C:docs/a.md', './docs/a.md', 'docs\\a.md', 'docs/', '']) {
    const message = widenError(t, [['docs/a.md']], bad === '' ? '' : `docs/a.md,${bad}`)
    assert.ok(message.includes('widen'), bad || '(empty)')
    if (bad !== '') assert.ok(message.includes(bad), `${bad} is named: ${message}`)
  }
})

test('deliver with --widen rejects a path already in the unit Owns', (t) => {
  const message = widenError(t, [['src/t1/a.js', 'one\n']], 'src/t1/a.js')
  assert.ok(message.includes('src/t1/a.js'))
  assert.match(message, /Owns/)
})

test('deliver with --widen rejects a path the branch does not change', (t) => {
  const message = widenError(t, [['docs/a.md']], 'docs/missing.md')
  assert.ok(message.includes('docs/missing.md'))
})

test('deliver with --widen rejects a path another unmerged unit owns, and names that unit', (t) => {
  const message = widenError(t, [['src/t2/b.js']], 'src/t2/b.js')
  assert.ok(message.includes('src/t2/b.js'))
  assert.ok(message.includes('task-2'), message)
})

test('deliver with --widen accepts the path once the owning unit merged and its branch is gone', (t) => {
  const s = scenario(t)
  const other = wt.ensure(s.repo.dir, s.args.runId, 'task-2')
  commitIn(s.repo, other.path, 'src/t2/a.js', 'two\n', 'task two')
  assert.equal(wt.merge(s.repo.dir, s.args.runId, 'task-2').merged, true)
  wt.removeUnit(s.repo.dir, s.args.runId, 'task-2')
  assert.equal(wt.unitStatus(s.repo.dir, s.args.runId, 'task-2').merged, false, 'a merged unit without its branch reads as not merged from its status')
  commitIn(s.repo, s.unit.path, 'src/t2/b.js', 'fix\n', 'the fix')
  begin(s)
  const out = stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: tip(s), reason: 'the test lives outside Owns', widen: 'src/t2/b.js' })
  assert.deepEqual(out.widen, ['src/t2/b.js'])
  assert.equal(record(s).state, 'delivered')
})

test('deliver with --widen rejects a path of a unit outside the last launch graph while it is unmerged', (t) => {
  const s = widenScenario(t, [['src/t2/b.js']])
  const graphFile = path.join(s.args.runDir, 'graph.json')
  const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'))
  assert.ok(graph.tasks['task-2'], 'the fixture compiles both units')
  delete graph.tasks['task-2']
  fs.writeFileSync(graphFile, JSON.stringify(graph))
  let message = null
  try {
    stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: tip(s), reason: 'fix', widen: 'src/t2/b.js' })
  } catch (err) {
    message = err.message
  }
  assert.ok(message, 'expected the delivery to fail')
  assert.ok(message.includes('src/t2/b.js'), message)
  assert.ok(message.includes('task-2'), message)
  assert.equal(record(s).state, 'waiting')
})

test('stuckEnd on a delivered record leaves it delivered', (t) => {
  const s = scenario(t)
  commitIn(s.repo, s.unit.path, 'src/t1/a.js', 'one\n', 'the fix')
  begin(s)
  const commit = tip(s)
  stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit, reason: 'moved the test into Owns' })
  const before = record(s)
  const out = stuck.stuckEnd(s.repo.dir, s.args.runId, 'task-1', 'expired')
  assert.equal(out.state, 'delivered')
  const after = record(s)
  assert.equal(after.state, 'delivered')
  assert.equal(after.ended, undefined)
  assert.equal(after.delivered.commit, before.delivered.commit)
  assert.equal(after.delivered.at, before.delivered.at)
})

test('deliver rejects a commit that fails the adopt shape check, and a real commit still lands', (t) => {
  const s = scenario(t)
  commitIn(s.repo, s.unit.path, 'src/t1/a.js', 'one\n', 'the fix')
  begin(s)
  assert.throws(
    () => stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit: '-q', reason: 'x' }),
    /hex id or a branch-like name/,
  )
  assert.equal(record(s).state, 'waiting')
  const commit = tip(s)
  const out = stuck.deliverFix(s.repo.dir, s.args.runId, 'task-1', { commit, reason: 'moved the test into Owns' })
  assert.equal(out.commit, commit)
  assert.equal(record(s).state, 'delivered')
  const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'wt-stuck.js'), 'utf8')
  assert.match(source, /rev-parse',\s*'--verify',\s*'--quiet',\s*'--end-of-options'/)
})

test('salvageUnit and stuckBegin read tasks through the one exported loader', (t) => {
  assert.equal(typeof wt.loadRunGraph, 'function')
  const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'wt-stuck.js'), 'utf8')
  assert.equal(/\bfunction loadTasks\b/.test(source), false)
  assert.match(source, /loadRunGraph/)
  const s = scenario(t)
  const salvaged = wt.salvageUnit(s.repo.dir, s.args.runId, 'task-1')
  const begun = begin(s)
  assert.equal(typeof salvaged.salvaged, 'boolean')
  assert.equal(begun.state, 'waiting')
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
