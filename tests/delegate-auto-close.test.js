'use strict'

// A read-only delegate whose checks pass is closed by the system (spec 044, R23-R26):
// no `aether-delegate verdict` call is needed for its approval.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, makeRepo } = require('./helpers.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const dr = require('../plugins/aether/lib/delegate-run.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const { unverdictedDelegates } = require('../plugins/aether/lib/delegate-report.js')
const { unverdictedStopMessage } = require('../plugins/aether/lib/continuity-hook.js')

const BIN = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-delegate')
const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }
const EXTERNAL = { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } }
const GROK = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high', group: 'grok' }
const SPEC = 'specs/017-public-ready-cleanup/spec.md'
const FINDING = 'src/a.js:3: the empty case is missing'
const AUTO_REASON = 'closed by the system: the read-only checks passed'

function world(t, { settings = NATIVE, pick = null, cwd = null } = {}) {
  const dataDir = tempDir(t, 'aether-data-')
  let n = 0
  const deps = { dataDir, cwd: cwd ?? dataDir, now: () => 1000 + (n += 1), settings, newId: () => `gen-${n}`, pickPair: async () => ({ pick, quota: [] }) }
  return { dataDir, deps }
}
const call = (prompt) => ({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt } })
const BRIEF = (id, more = '') => `AETHER-TASK: ${id}\n${more}Do the work.`
const verdictsOf = (dataDir, id) => log.readEntries(dataDir, { task: id }).filter((e) => e.kind === 'verdict')
const stopSaysNothingAbout = (dataDir, id) => !unverdictedStopMessage(unverdictedDelegates({ dataDir, session: 's1' }), false).includes(id)

function writeSpec(repo) {
  fs.mkdirSync(path.join(repo.dir, 'specs', '017-public-ready-cleanup'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, SPEC), 'written by the Writer of a design run\n')
}

test('1. an external read-only delegate with checks ok is closed without a verdict call', async (t) => {
  const repo = makeRepo(t)
  const { dataDir, deps } = world(t, { settings: EXTERNAL, pick: GROK, cwd: repo.dir })
  await task.begin(call(BRIEF('ro-ext')), deps)
  const chain = async () => ({ ok: true, status: 'ok', text: 'the answer', attribution: 'Aether: this answer is from grok-4.7 at high', attempts: [], journaled: true })
  const result = await dr.runTask({ id: 'ro-ext', session: 's1', cwd: repo.dir, dataDir }, { runChain: chain })
  assert.equal(result.ok, true)
  assert.equal(result.checks.ok, true)
  const verdicts = verdictsOf(dataDir, 'ro-ext')
  assert.equal(verdicts.length, 1, 'the system wrote the approval; no aether-delegate verdict ran')
  assert.deepEqual([verdicts[0].verdict, verdicts[0].auto, verdicts[0].reason], ['approved', true, AUTO_REASON])
  assert.deepEqual(verdicts[0].input, { kind: 'approve', findings: [], reason: null, fromScratch: false })
  assert.deepEqual(verdicts[0].ignore, [])
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's1' }), [])
  assert.ok(stopSaysNothingAbout(dataDir, 'ro-ext'))
})

test('2. a Claude read-only delegate with a non-empty answer and a clean checkout is closed on answer', async (t) => {
  const repo = makeRepo(t)
  const { dataDir, deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('ro-claude')), deps)
  const env = { ...process.env, AETHER_DATA_DIR: dataDir }
  const out = spawnSync(process.execPath, [BIN, 'answer', '--session', 's1', '--task', 'ro-claude', '--attempt', '1', '--text', 'found it'], { cwd: repo.dir, encoding: 'utf8', env })
  assert.deepEqual(JSON.parse(out.stdout.trim()), { recorded: true })
  const verdicts = verdictsOf(dataDir, 'ro-claude')
  assert.equal(verdicts.length, 1, 'the answer closed the task; no aether-delegate verdict ran')
  assert.deepEqual([verdicts[0].verdict, verdicts[0].auto, verdicts[0].reason], ['approved', true, AUTO_REASON])
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's1' }), [])
  assert.ok(stopSaysNothingAbout(dataDir, 'ro-claude'))
})

test('3. an empty answer, or an external result with a failed check, stays pending', async (t) => {
  const repo = makeRepo(t)
  const { dataDir, deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('ro-empty')), deps)
  const recorded = dr.recordAnswer({ task: 'ro-empty', attempt: 1, text: '   ', session: 's1', dataDir, cwd: repo.dir, now: () => 5000 })
  assert.deepEqual(recorded, { recorded: true })
  assert.deepEqual(verdictsOf(dataDir, 'ro-empty'), [], 'an empty answer is not closed')
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's1' }), [{ task: 'ro-empty', session: 's1', attempt: 1, step: 'haiku-high' }])

  const { dataDir: dataDir2, deps: deps2 } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('ro-red')), deps2)
  log.appendEntry(dataDir2, {
    kind: 'result', task: 'ro-red', attempt: 1, session: 's1', time: 5000, ok: true, status: 'ok', pair: null,
    checks: { kind: 'read-only', ok: false, empty: true, outside: [], reasons: ['answer is empty'] },
  })
  const closed = task.closeReadOnly({ task: 'ro-red', session: 's1', cwd: repo.dir, dataDir: dataDir2, now: () => 6000 })
  assert.deepEqual(closed.closed, false)
  assert.deepEqual(verdictsOf(dataDir2, 'ro-red'), [], 'a red check is not closed')
  assert.deepEqual(unverdictedDelegates({ dataDir: dataDir2, session: 's1' }), [{ task: 'ro-red', session: 's1', attempt: 1, step: 'haiku-high' }])
})

test('4. files another writer changed block the closing, and verdict approve --ignore still approves', async (t) => {
  const repo = makeRepo(t)
  const { dataDir, deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('ro-ignore')), deps)
  writeSpec(repo)
  const closed = dr.recordAnswer({ task: 'ro-ignore', attempt: 1, text: 'found it', session: 's1', dataDir, cwd: repo.dir, now: () => 5000 })
  assert.deepEqual(closed, { recorded: true })
  assert.deepEqual(verdictsOf(dataDir, 'ro-ignore'), [], 'no automatic closing while another writer is charged')
  const env = { ...process.env, AETHER_DATA_DIR: dataDir }
  const run = (...args) => spawnSync(process.execPath, [BIN, 'verdict', '--session', 's1', '--task', 'ro-ignore', '--verdict', 'approve', ...args], { cwd: repo.dir, encoding: 'utf8', env })
  assert.equal(JSON.parse(run().stdout.trim()).ok, false, 'without --ignore the charged files still fail')
  const judged = JSON.parse(run('--ignore', SPEC).stdout.trim())
  assert.equal(judged.ok, true, JSON.stringify(judged))
  assert.equal(judged.verdict, 'approved')
})

test('5. an editing delegate is never closed by the system and still needs a verdict', async (t) => {
  const { dataDir, deps } = world(t)
  await task.begin(call(BRIEF('ed-1', 'AETHER-OWNS: src/**\n')), deps)
  const closed = task.closeReadOnly({ task: 'ed-1', session: 's1', cwd: deps.cwd, dataDir, now: () => 6000 })
  assert.deepEqual(closed.closed, false)
  assert.deepEqual(verdictsOf(dataDir, 'ed-1'), [])
  const judged = await task.verdict({ task: 'ed-1', verdict: 'fix', findings: [FINDING] }, deps)
  assert.equal(judged.ok, true, 'the task still needs aether-delegate verdict')
  assert.equal(judged.next.kind, 'rise')
})

test('6. fix and infeasible are accepted while open, through the real answer path', async (t) => {
  const { dataDir, deps } = world(t)
  await task.begin(call(BRIEF('ro-fix')), deps)
  assert.deepEqual(dr.recordAnswer({ task: 'ro-fix', attempt: 1, text: 'found it', session: 's1', dataDir, now: () => 5000 }), { recorded: true })
  assert.equal((await task.verdict({ task: 'ro-fix', verdict: 'fix', findings: [FINDING] }, deps)).ok, true)

  const { dataDir: dataDir2, deps: deps2 } = world(t)
  await task.begin(call(BRIEF('ro-infeas')), deps2)
  assert.deepEqual(dr.recordAnswer({ task: 'ro-infeas', attempt: 1, text: 'found it', session: 's1', dataDir: dataDir2, now: () => 5000 }), { recorded: true })
  assert.equal((await task.verdict({ task: 'ro-infeas', verdict: 'infeasible', reason: 'wrong layer' }, deps2)).ok, true)
})

test('8. an automatic approval reopens: fix is accepted and the next launch rises with the findings (spec 044, D11)', async (t) => {
  const repo = makeRepo(t)
  const { dataDir, deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('ro-re')), deps)
  assert.deepEqual(dr.recordAnswer({ task: 'ro-re', attempt: 1, text: 'found it', session: 's1', dataDir, cwd: repo.dir, now: () => 5000 }), { recorded: true })
  assert.equal(verdictsOf(dataDir, 'ro-re').length, 1, 'the answer closed the task by itself')
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's1' }), [], 'the closed task is not pending')
  const judged = await task.verdict({ task: 'ro-re', verdict: 'fix', findings: [FINDING] }, deps)
  assert.equal(judged.ok, true, 'fix reopens the automatic approval')
  assert.deepEqual([judged.next.kind, judged.next.step], ['rise', 'haiku-xhigh'])
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's1' }), [], 'the reopened task waits for its next attempt, as after any fix')
  const next = await task.begin(call(BRIEF('ro-re')), deps)
  assert.deepEqual([next.step, next.kind], ['haiku-xhigh', 'rise'])
  assert.ok(next.args.prompt.includes(FINDING), 'the rise carries the findings')
})

test('9. an automatic approval reopens for infeasible with a reason, and stays shut for approve (spec 044, D11)', async (t) => {
  const repo = makeRepo(t)
  const { dataDir, deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('ro-inf')), deps)
  dr.recordAnswer({ task: 'ro-inf', attempt: 1, text: 'found it', session: 's1', dataDir, cwd: repo.dir, now: () => 5000 })
  const judged = await task.verdict({ task: 'ro-inf', verdict: 'infeasible', reason: 'wrong layer' }, deps)
  assert.equal(judged.ok, true, 'infeasible with a reason reopens the automatic approval')
  assert.deepEqual([judged.next.kind, judged.next.step], ['rise', 'haiku-xhigh'])

  const repo2 = makeRepo(t)
  const { dataDir: dataDir2, deps: deps2 } = world(t, { cwd: repo2.dir })
  await task.begin(call(BRIEF('ro-shut')), deps2)
  dr.recordAnswer({ task: 'ro-shut', attempt: 1, text: 'found it', session: 's1', dataDir: dataDir2, cwd: repo2.dir, now: () => 5000 })
  assert.equal(verdictsOf(dataDir2, 'ro-shut').length, 1, 'the answer closed the task by itself')
  const refused = await task.verdict({ task: 'ro-shut', verdict: 'approve' }, deps2)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /closed by the system/, 'approve on a closed task stays refused with the closed message')
  assert.equal(verdictsOf(dataDir2, 'ro-shut').length, 1, 'the refused approve writes nothing')
})

test('10. after a reopen and a later launch, a fix is judged for that launch as today (spec 044, D11)', async (t) => {
  const repo = makeRepo(t)
  const { dataDir, deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('ro-late')), deps)
  dr.recordAnswer({ task: 'ro-late', attempt: 1, text: 'found it', session: 's1', dataDir, cwd: repo.dir, now: () => 5000 })
  assert.equal((await task.verdict({ task: 'ro-late', verdict: 'fix', findings: [FINDING] }, deps)).ok, true)
  const next = await task.begin(call(BRIEF('ro-late')), deps)
  assert.equal(next.kind, 'rise')
  const again = await task.verdict({ task: 'ro-late', verdict: 'fix', findings: [FINDING] }, deps)
  assert.equal(again.ok, true, 'a fix on the later launch is judged as today')
  assert.deepEqual([again.next.kind, again.next.step], ['rise', 'sonnet-high'])
})

test('6(a). fix and infeasible after a later launch of an auto-closed task are refused and write nothing (spec 044, R26)', async (t) => {
  const repo = makeRepo(t)
  const { dataDir, deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('ro-after')), deps)
  assert.deepEqual(dr.recordAnswer({ task: 'ro-after', attempt: 1, text: 'found it', session: 's1', dataDir, cwd: repo.dir, now: () => 5000 }), { recorded: true })
  assert.equal(verdictsOf(dataDir, 'ro-after').length, 1, 'the answer closed the task by itself')
  // A later non-refused launch with no reopen in between, written directly: a relaunch of an
  // approved id through `begin` only logs a `launchKind: 'refused'` line, which does not count.
  log.appendEntry(dataDir, {
    kind: 'launch', time: 6000, session: 's1', task: 'ro-after', step: 'haiku-xhigh', attempt: 2,
    launchKind: 'rise', effort: 'xhigh', edits: false, owns: [], tests: null,
  })
  const before = log.readEntries(dataDir, { task: 'ro-after' }).length
  const fix = await task.verdict({ task: 'ro-after', verdict: 'fix', findings: [FINDING] }, deps)
  assert.equal(fix.ok, false, 'fix after a later launch is refused')
  assert.match(fix.error, /approved/, 'the task stays approved')
  const infeasible = await task.verdict({ task: 'ro-after', verdict: 'infeasible', reason: 'wrong layer' }, deps)
  assert.equal(infeasible.ok, false, 'infeasible after a later launch is refused')
  assert.match(infeasible.error, /approved/, 'the task stays approved')
  assert.equal(log.readEntries(dataDir, { task: 'ro-after' }).length, before, 'refused verdicts write nothing')
  assert.equal(verdictsOf(dataDir, 'ro-after').length, 1, 'the automatic approval stays in place')
})

// 6(b) needs no new test: test 8 already asserts that a fix on the automatic approval rises
// exactly one rung (from haiku-high to haiku-xhigh), and test 10 that the next fix rises one more.

test('6(c). a refused relaunch does not count as a later launch: fix still reopens (spec 044, R26)', async (t) => {
  const repo = makeRepo(t)
  const { dataDir, deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('ro-refused')), deps)
  assert.deepEqual(dr.recordAnswer({ task: 'ro-refused', attempt: 1, text: 'found it', session: 's1', dataDir, cwd: repo.dir, now: () => 5000 }), { recorded: true })
  assert.equal(verdictsOf(dataDir, 'ro-refused').length, 1, 'the answer closed the task by itself')
  const relaunched = await task.begin(call(BRIEF('ro-refused')), deps)
  assert.equal(relaunched.kind, 'refused', 'a relaunch of an approved id is refused')
  const judged = await task.verdict({ task: 'ro-refused', verdict: 'fix', findings: [FINDING] }, deps)
  assert.equal(judged.ok, true, 'fix still reopens after a refused relaunch')
  assert.deepEqual([judged.next.kind, judged.next.step], ['rise', 'haiku-xhigh'])

  const repo2 = makeRepo(t)
  const { dataDir: dataDir2, deps: deps2 } = world(t, { cwd: repo2.dir })
  await task.begin(call(BRIEF('ro-refused-inf')), deps2)
  assert.deepEqual(dr.recordAnswer({ task: 'ro-refused-inf', attempt: 1, text: 'found it', session: 's1', dataDir: dataDir2, cwd: repo2.dir, now: () => 5000 }), { recorded: true })
  assert.equal((await task.begin(call(BRIEF('ro-refused-inf')), deps2)).kind, 'refused')
  const judged2 = await task.verdict({ task: 'ro-refused-inf', verdict: 'infeasible', reason: 'wrong layer' }, deps2)
  assert.equal(judged2.ok, true, 'infeasible still reopens after a refused relaunch')
  assert.deepEqual([judged2.next.kind, judged2.next.step], ['rise', 'haiku-xhigh'])
})

test('6(d). infeasible without a reason on an auto-closed task is refused and writes nothing (spec 044, R26)', async (t) => {
  const repo = makeRepo(t)
  const { dataDir, deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('ro-noreason')), deps)
  assert.deepEqual(dr.recordAnswer({ task: 'ro-noreason', attempt: 1, text: 'found it', session: 's1', dataDir, cwd: repo.dir, now: () => 5000 }), { recorded: true })
  assert.equal(verdictsOf(dataDir, 'ro-noreason').length, 1, 'the answer closed the task by itself')
  const before = log.readEntries(dataDir, { task: 'ro-noreason' }).length
  const missing = await task.verdict({ task: 'ro-noreason', verdict: 'infeasible' }, deps)
  assert.equal(missing.ok, false, 'infeasible without a reason is refused')
  assert.match(missing.error, /reason/)
  const blank = await task.verdict({ task: 'ro-noreason', verdict: 'infeasible', reason: '   ' }, deps)
  assert.equal(blank.ok, false, 'infeasible with a blank reason is refused')
  assert.match(blank.error, /reason/)
  assert.equal(log.readEntries(dataDir, { task: 'ro-noreason' }).length, before, 'refused verdicts write nothing')
  assert.equal(verdictsOf(dataDir, 'ro-noreason').length, 1, 'the automatic approval stays in place')
})

test('7. a second closeReadOnly on a closed task writes nothing', async (t) => {
  const { dataDir, deps } = world(t)
  await task.begin(call(BRIEF('ro-twice')), deps)
  log.appendEntry(dataDir, { kind: 'answer', task: 'ro-twice', attempt: 1, session: 's1', time: 5000, text: 'found it' })
  assert.deepEqual(task.closeReadOnly({ task: 'ro-twice', session: 's1', cwd: deps.cwd, dataDir, now: () => 6000 }), { closed: true })
  const again = task.closeReadOnly({ task: 'ro-twice', session: 's1', cwd: deps.cwd, dataDir, now: () => 7000 })
  assert.deepEqual(again.closed, false)
  assert.equal(verdictsOf(dataDir, 'ro-twice').length, 1, 'one verdict line only')
})
