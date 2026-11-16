'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, useDataDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const wt = require('../plugins/aether/lib/worktrees.js')
const run = require('../plugins/aether/lib/run.js')
const { digest } = require('../plugins/aether/lib/lanes.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const stuck = require('../plugins/aether/lib/wt-stuck.js')
const { A, B, C, HOUR, setupRuns } = require('./run-session-fixture.js')

// Open runs: A's time ceiling (1 h, opened 3 h ago) is lapsed; optionally B's is open (not lapsed), or A is continued/patched.
function scenario(t, session, { openB = true, continueTo = null, patchA = null } = {}) {
  const dataDir = useDataDir(t)
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  wt.ensure(repo.dir, args.runId, 'task-1')
  const target = run.stuckPayloadFile(repo.dir, args.runId, 'task-1')
  const text = JSON.stringify({ reason: 'the ladder is spent (exhausted)' })
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, text)
  stuck.stuckBegin(repo.dir, args.runId, 'task-1', { payload: target, digest: digest(text) })
  const stateFile = path.join(args.runDir, 'state.json')
  fs.writeFileSync(stateFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(stateFile, 'utf8')), session }))
  const s = setupRuns(t, { ids: [A, B, C], repo, dataDir })
  const a = s.open(A, { hours: 1 }, Date.now() - 3 * HOUR)
  assert.equal(a.ok, true)
  if (continueTo) assert.equal(autonomy.continueRun(repo.dir, a.run.id, { session: continueTo }).ok, true)
  if (patchA) s.patch(a.run.id, patchA)
  if (openB) assert.equal(s.open(B, {}, Date.now()).ok, true)
  return { repo, args }
}
const tick = (s) => stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', 1, { sleep: async () => {} })

test('R3: a stuck wait stops at the lapsed ceiling of the run of the swarm\'s own session', async (t) => {
  assert.equal((await tick(scenario(t, A))).stop, true)
})

test('R3: it does not stop for the ceiling of another session\'s run, nor when its session has no run, nor when it cannot tell', async (t) => {
  assert.equal((await tick(scenario(t, B))).stop, false)
  assert.equal((await tick(scenario(t, C))).stop, false)
  assert.equal((await tick(scenario(t, null))).stop, false)
})

test('R13 and R15: a stuck wait stops at the lapsed ceiling after continue hands the run to another session', async (t) => {
  assert.equal((await tick(scenario(t, A, { openB: false, continueTo: B }))).stop, true)
})

test('R3: with only A\'s lapsed run open, a swarm stamped with B does not stop for A\'s ceiling', async (t) => {
  assert.equal((await tick(scenario(t, B, { openB: false }))).stop, false)
})

test('Assumption 6: with a single open old-format run (no session), a swarm with a session still stops at its lapsed ceiling', async (t) => {
  assert.equal((await tick(scenario(t, B, { openB: false, patchA: (r) => { delete r.session } }))).stop, true)
})
