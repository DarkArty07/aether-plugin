'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { makeRepo, compile, age, ageRun, commitIn, useDataDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const run = require('../plugins/aether/lib/run.js')
const wt = require('../plugins/aether/lib/worktrees.js')
const { loadSwarmConfig } = require('../plugins/aether/lib/wt-config.js')
const { watchCommand } = require('../plugins/aether/lib/wt-watch.js')

function scenario(t) {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  return { repo, args }
}

function put(s, taskId, extra = {}) {
  run.writeJson(run.stuckFile(s.repo.dir, s.args.runId, taskId), {
    run: s.args.runId,
    task: taskId,
    reason: `the reason of ${taskId}`,
    branch: `aether/${s.args.runId}/${taskId}`,
    worktree: `/w/${taskId}`,
    head: 'abc1234',
    outside: ['docs/x.md'],
    left: [],
    at: '2026-11-12T00:00:00.000Z',
    state: 'waiting',
    ...extra,
  })
}

const BIG = { interval: 0.001, silence: 100000 }
const quick = { ...BIG, sleep: async () => {} }

test('a unit that is already stuck ends the watch at once, with the run, the unit and the reason, and a second watch ends with it again', async (t) => {
  const s = scenario(t)
  put(s, 'task-2')
  put(s, 'task-1')
  const first = await watchCommand(s.repo.dir, s.args.runId, quick)
  assert.deepEqual(first, { watch: 'stuck', run: s.args.runId, task: 'task-1', reason: 'the reason of task-1', branch: `aether/${s.args.runId}/task-1`, worktree: '/w/task-1', head: 'abc1234', outside: ['docs/x.md'], left: [] })
  assert.deepEqual(await watchCommand(s.repo.dir, s.args.runId, quick), first)
})

test('an attended unit (delivered, declined or ended) does not end the watch, and the next stuck unit does', async (t) => {
  const s = scenario(t)
  put(s, 'task-1', { state: 'declined', declined: { reason: 'no', at: 'x' } })
  put(s, 'task-2')
  assert.equal((await watchCommand(s.repo.dir, s.args.runId, quick)).task, 'task-2')
  put(s, 'task-2', { state: 'delivered', delivered: { commit: 'abc', reason: 'fixed', at: 'x' } })
  fs.writeFileSync(run.launchEndFile(s.repo.dir, s.args.runId), '{}\n')
  const ended = await watchCommand(s.repo.dir, s.args.runId, quick)
  assert.equal(ended.watch, 'ended')
})

test('the watch waits while the run lives and ends when a unit gets stuck', async (t) => {
  const s = scenario(t)
  let polls = 0
  const out = await watchCommand(s.repo.dir, s.args.runId, {
    ...BIG,
    sleep: async () => {
      polls++
      if (polls === 3) put(s, 'task-1')
    },
  })
  assert.equal(polls, 3)
  assert.deepEqual([out.watch, out.task], ['stuck', 'task-1'])
})

test('at the end of the run the watch ends by itself and says whether anything got stuck', async (t) => {
  const s = scenario(t)
  fs.writeFileSync(run.launchEndFile(s.repo.dir, s.args.runId), '{}\n')
  assert.deepEqual(await watchCommand(s.repo.dir, s.args.runId, quick), { watch: 'ended', run: s.args.runId, stuck: [], message: 'nada se trabó' })
  put(s, 'task-1', { state: 'ended', ended: { outcome: 'expired', at: 'x' } })
  const out = await watchCommand(s.repo.dir, s.args.runId, quick)
  assert.deepEqual(out.stuck, [{ task: 'task-1', outcome: 'expired' }])
  assert.equal(out.message, 'hubo 1 unidad trabada')
})

test('a run with no sign of life ends the watch as silent, from the last write and not from the launch of the watch', async (t) => {
  const s = scenario(t)
  age(s.args.runDir, 2)
  const out = await watchCommand(s.repo.dir, s.args.runId, { interval: 0.001, silence: 600, sleep: async () => {} })
  assert.deepEqual([out.watch, out.message], ['silent', 'sin señal de la corrida'])
  assert.ok(out.silentSeconds >= 7200)
  // A heartbeat is a sign of life: with it the watch goes on, and then the end mark ends it. The watch writes nothing
  // and polls before it sleeps, so the heartbeat is written before the second watch starts (it also renews the
  // directory time), as a pause of the wait would have written it.
  fs.writeFileSync(run.heartbeatFile(s.repo.dir, s.args.runId), '{}\n')
  let polls = 0
  const alive = await watchCommand(s.repo.dir, s.args.runId, {
    interval: 0.001,
    silence: 600,
    sleep: async () => {
      polls++
      if (polls === 3) fs.writeFileSync(run.launchEndFile(s.repo.dir, s.args.runId), '{}\n')
    },
  })
  assert.equal(alive.watch, 'ended')
  assert.ok(polls >= 3)
})

test('a unit left waiting by a run that died is reported as silent, not as stuck, once the run is silent past the cap', async (t) => {
  const s = scenario(t)
  put(s, 'task-1')
  age(s.args.runDir, 2)
  const out = await watchCommand(s.repo.dir, s.args.runId, { interval: 0.001, silence: 600, sleep: async () => {} })
  assert.deepEqual([out.watch, out.message], ['silent', 'sin señal de la corrida'])
  // A run that still beats (the record is fresh) alerts the Lead as stuck, as before.
  put(s, 'task-1')
  assert.equal((await watchCommand(s.repo.dir, s.args.runId, { interval: 0.001, silence: 600, sleep: async () => {} })).watch, 'stuck')
})

test('the silence cap comes from swarm.json when the watch is not given one', async (t) => {
  const { watchSilenceSeconds } = loadSwarmConfig()
  const s = scenario(t)
  age(s.args.runDir, (watchSilenceSeconds + 600) / 3600)
  assert.equal((await watchCommand(s.repo.dir, s.args.runId, { interval: 0.001, sleep: async () => {} })).watch, 'silent')
  const fresh = scenario(t)
  age(fresh.args.runDir, (watchSilenceSeconds - 600) / 3600)
  let polls = 0
  const out = await watchCommand(fresh.repo.dir, fresh.args.runId, {
    interval: 0.001,
    sleep: async () => {
      if (++polls === 2) fs.writeFileSync(run.launchEndFile(fresh.repo.dir, fresh.args.runId), '{}\n')
    },
  })
  assert.equal(out.watch, 'ended')
})

test('a bad option and an unknown run are refused', async (t) => {
  const s = scenario(t)
  await assert.rejects(() => watchCommand(s.repo.dir, s.args.runId, { interval: 0 }), /--interval must be a number of seconds above 0/)
  await assert.rejects(() => watchCommand(s.repo.dir, s.args.runId, { silence: 0 }), /--silence must be a whole number of seconds from 1/)
  await assert.rejects(() => watchCommand(s.repo.dir, '20261112-000000-ffff', quick), /run 20261112-000000-ffff not found/)
})

test('sweepRun leaves the end mark only when it is asked for it, and a sweep that finishes the run leaves none', (t) => {
  const s = scenario(t)
  wt.sweepRun(s.repo.dir, s.args.runId)
  assert.equal(fs.existsSync(run.launchEndFile(s.repo.dir, s.args.runId)), false, 'without the option it writes nothing')
  wt.sweepRun(s.repo.dir, s.args.runId, { endMark: true })
  const mark = JSON.parse(fs.readFileSync(run.launchEndFile(s.repo.dir, s.args.runId), 'utf8'))
  assert.equal(mark.run, s.args.runId)
  assert.match(mark.at, /^\d{4}-\d\d-\d\dT/)
  const done = wt.sweepRun(s.repo.dir, s.args.runId, { finish: true, endMark: true })
  assert.equal(done.finished, true)
  assert.equal(fs.existsSync(s.args.runDir), false)
})

test('a stale sweep that keeps the directory of a run writes no end mark into it, so the run does not look active again', (t) => {
  useDataDir(t)
  const s = scenario(t)
  const unit = wt.ensure(s.repo.dir, s.args.runId, 'task-1')
  commitIn(s.repo, unit.path, 'src/t1/a.js', 'one\n', 'work that is not merged')
  ageRun(s.args, 48)
  assert.deepEqual(wt.sweepStale(s.repo.dir, { hours: 24 }), { swept: [] })
  assert.equal(fs.existsSync(s.args.runDir), true, 'the unmerged work keeps the run directory')
  assert.equal(fs.existsSync(run.launchEndFile(s.repo.dir, s.args.runId)), false)
})
