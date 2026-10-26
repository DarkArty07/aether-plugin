'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, makeRepo } = require('./helpers.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const log = require('../plugins/aether/lib/delegate-log.js')

const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }
const EXTERNAL = { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } }
const GROK = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high', group: 'grok' }
const FINDING = 'src/a.js:3: the empty case is missing'
const F = (n) => `src/f${n}.js:${n}: missing case ${n}`

function world(t, { settings = NATIVE, pick = null, cwd = null, quota = [] } = {}) {
  const dataDir = tempDir(t, 'aether-data-')
  const asked = []
  let n = 0
  const deps = { dataDir, cwd: cwd ?? dataDir, now: () => 1000 + (n += 1), settings, newId: () => `gen-${n}`, pickPair: async (reference) => (asked.push(reference), { pick, quota }) }
  return { dataDir, deps, asked }
}
const call = (prompt, extra = {}) => ({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt, ...extra } })
const BRIEF = (id, more = '') => `AETHER-TASK: ${id}\n${more}Do the work.`
const entries = (dataDir, id) => log.readEntries(dataDir, { task: id })

test('parseBrief reads the task id, the owned paths and the tests; the first line of each wins', () => {
  assert.deepEqual(task.parseBrief('AETHER-TASK: t-1\nAETHER-OWNS: src/**, tests/a.test.js\nAETHER-TESTS: npm test\nAETHER-TASK: t-2\nbody'), { task: 't-1', owns: ['src/**', 'tests/a.test.js'], tests: 'npm test' })
  assert.deepEqual(task.parseBrief('just a brief'), { task: null, owns: [], tests: null })
})

test('every delegate of every task starts on Haiku, whatever the Lead asks (C1, E1, E2)', async (t) => {
  const { deps, dataDir } = world(t)
  const plans = []
  for (const id of ['a', 'b', 'c']) plans.push(await task.begin(call(BRIEF(id)), deps))
  for (const plan of plans) assert.deepEqual([plan.step, plan.kind, plan.args.model, plan.args.effort], ['haiku', 'first', 'haiku', 'high'])
  const asked = await task.begin(call(BRIEF('d'), { model: 'opus', effort: 'max' }), deps)
  assert.deepEqual([asked.args.model, asked.args.effort, asked.step], ['haiku', 'high', 'haiku'])
  const launch = entries(dataDir, 'd').find((e) => e.kind === 'launch')
  assert.deepEqual([launch.ignored, launch.requested], [true, { model: 'opus', effort: 'max' }])
})

test('a call with no AETHER-TASK gets a generated id and says so', async (t) => {
  const { deps } = world(t)
  const plan = await task.begin(call('Do the work.'), deps)
  assert.match(plan.id, /^gen-/)
  assert.ok(plan.notes.join(' ').includes(plan.id))
})

test('a correction goes to the same step with its findings and the xhigh effort; the step does not move (C2, E3)', async (t) => {
  const { deps } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  const answer = await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING] }, deps)
  assert.deepEqual([answer.ok, answer.next.kind, answer.next.step, answer.corrections], [true, 'fix', 'haiku', { used: 1, cap: 5 }])
  const again = await task.begin(call(BRIEF('t1')), deps)
  assert.deepEqual([again.step, again.kind, again.args.model, again.args.effort], ['haiku', 'fix', 'haiku', 'xhigh'])
  assert.ok(again.args.prompt.includes('## Findings to fix') && again.args.prompt.includes(FINDING))
})

test('the correction receives the earlier work: the patch path of its last result, or the earlier answer (C2, C4)', async (t) => {
  const { deps, dataDir } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  const patch = path.join(dataDir, 'delegates', 'patches', 't1-1.patch')
  log.appendEntry(dataDir, { kind: 'result', task: 't1', attempt: 1, session: 's1', time: 5000, ok: true, pair: null, patch, answer: null, checks: { ok: true } })
  await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING] }, deps)
  const again = await task.begin(call(BRIEF('t1')), deps)
  assert.ok(again.args.prompt.includes('## Your previous work') && again.args.prompt.includes(patch))
  assert.ok(again.args.prompt.includes(`git apply ${patch}`), 'the brief tells a delegate on Claude to apply the patch itself (issue 88)')
})

test('five corrections of Haiku, and the sixth failure rises to Sonnet with the work and the findings (C3, E5)', async (t) => {
  const { deps } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  for (let n = 1; n <= 5; n++) assert.equal((await task.verdict({ task: 't1', verdict: 'fix', findings: [F(n)] }, deps)).next.kind, 'fix')
  const sixth = await task.verdict({ task: 't1', verdict: 'fix', findings: [F(6)] }, deps)
  assert.deepEqual([sixth.next.kind, sixth.next.step, sixth.next.cause], ['rise', 'sonnet', 'exhausted'])
  const plan = await task.begin(call(BRIEF('t1')), deps)
  assert.deepEqual([plan.step, plan.kind, plan.args.model, plan.args.effort], ['sonnet', 'rise', 'sonnet', 'high'])
  assert.ok(plan.args.prompt.includes(F(6)))
})

test('the same findings twice rise to Sonnet though Haiku has corrections left (E4)', async (t) => {
  const { deps } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING] }, deps)
  const second = await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING] }, deps)
  assert.deepEqual([second.next.kind, second.next.cause], ['rise', 'repeated'])
})

test('an infeasible declaration without a reason is rejected and the step stays; with one it rises and the log keeps the reason (C3, E6)', async (t) => {
  const { deps, dataDir } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  const rejected = await task.verdict({ task: 't1', verdict: 'infeasible' }, deps)
  assert.equal(rejected.ok, false)
  assert.match(rejected.error, /reason/)
  assert.equal((await task.begin(call(BRIEF('t1')), deps)).step, 'haiku')
  const ok = await task.verdict({ task: 't1', verdict: 'infeasible', reason: 'wrong layer for this model' }, deps)
  assert.deepEqual([ok.ok, ok.next.step, ok.next.cause], [true, 'sonnet', 'infeasible'])
  assert.equal(entries(dataDir, 't1').find((e) => e.kind === 'verdict' && e.verdict === 'infeasible').reason, 'wrong layer for this model')
})

test('starting from scratch drops the earlier work and keeps the reason in the log (C4, E7)', async (t) => {
  const { deps, dataDir } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  const patch = path.join(dataDir, 'delegates', 'patches', 't1-1.patch')
  log.appendEntry(dataDir, { kind: 'result', task: 't1', attempt: 1, session: 's1', time: 5000, ok: true, pair: null, patch, checks: { ok: true } })
  await task.verdict({ task: 't1', verdict: 'infeasible', reason: 'the approach is wrong', fromScratch: true }, deps)
  const plan = await task.begin(call(BRIEF('t1')), deps)
  assert.equal(plan.args.prompt.includes(patch), false)
  assert.ok(plan.args.prompt.includes('the approach is wrong'))
  assert.equal(entries(dataDir, 't1').find((e) => e.kind === 'verdict').input.fromScratch, true)
})

test('after Opus nothing opens a fourth step: the task is exhausted (C5, E8)', async (t) => {
  const { deps } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  let last
  for (let n = 1; n <= 11; n++) last = await task.verdict({ task: 't1', verdict: 'fix', findings: [F(n)] }, deps)
  assert.deepEqual([last.next.kind, last.next.step], ['exhausted', null])
  const plan = await task.begin(call(BRIEF('t1')), deps)
  assert.deepEqual([plan.args.model, plan.args.effort, plan.external], ['haiku', 'low', null])
  assert.match(plan.args.prompt, /exhausted/)
  assert.equal((await task.verdict({ task: 't1', verdict: 'fix', findings: [F(12)] }, deps)).ok, false)
})

test('a finding with no file or no what is not accepted as a correction (R2)', async (t) => {
  const { deps } = world(t)
  await task.begin(call(BRIEF('t1')), deps)
  assert.equal((await task.verdict({ task: 't1', verdict: 'fix', findings: ['the code is bad'] }, deps)).ok, false)
  assert.equal((await task.verdict({ task: 't1', verdict: 'fix', findings: [] }, deps)).ok, false)
  assert.equal((await task.verdict({ task: 'nope', verdict: 'approve' }, deps)).error, 'unknown task')
})

test('approve is refused when an objective check fails: a file outside Owns, an empty task or failing tests (C6, E9)', async (t) => {
  const repo = makeRepo(t)
  const { deps } = world(t, { cwd: repo.dir })
  const owns = 'AETHER-OWNS: src/**\nAETHER-TESTS: node -e "process.exit(0)"\n'
  await task.begin(call(BRIEF('out', owns)), deps)
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.mkdirSync(path.join(repo.dir, 'docs'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'a\n')
  fs.writeFileSync(path.join(repo.dir, 'docs', 'x.md'), 'x\n')
  const outside = await task.verdict({ task: 'out', verdict: 'approve', worktree: repo.dir }, deps)
  assert.equal(outside.ok, false)
  assert.match(outside.error, /docs\/x\.md/)
  const body = await task.verdict({ task: 'out', verdict: 'fix', findings: ['docs/x.md: do not touch it'] }, deps)
  assert.equal(body.ok, true, 'a correction needs no passing check')

  const clean = makeRepo(t)
  const world2 = world(t, { cwd: clean.dir })
  await task.begin(call(BRIEF('empty', owns)), world2.deps)
  const empty = await task.verdict({ task: 'empty', verdict: 'approve', worktree: clean.dir }, world2.deps)
  assert.equal(empty.ok, false)
  assert.match(empty.error, /empty|no changes/)

  const failing = makeRepo(t)
  const world3 = world(t, { cwd: failing.dir })
  await task.begin(call(BRIEF('red', 'AETHER-OWNS: src/**\nAETHER-TESTS: node -e "process.exit(1)"\n')), world3.deps)
  fs.mkdirSync(path.join(failing.dir, 'src'))
  fs.writeFileSync(path.join(failing.dir, 'src', 'a.js'), 'a\n')
  assert.match((await task.verdict({ task: 'red', verdict: 'approve', worktree: failing.dir }, world3.deps)).error, /tests/)

  const good = makeRepo(t)
  const world4 = world(t, { cwd: good.dir })
  await task.begin(call(BRIEF('green', owns)), world4.deps)
  fs.mkdirSync(path.join(good.dir, 'src'))
  fs.writeFileSync(path.join(good.dir, 'src', 'a.js'), 'a\n')
  const approved = await task.verdict({ task: 'green', verdict: 'approve', worktree: good.dir }, world4.deps)
  assert.equal(approved.ok, true)
  assert.equal(entries(world4.dataDir, 'green').at(-1).verdict, 'approved')
})

test('a task that edits is launched with isolation worktree, whoever takes the attempt; a read-only one is not (R13, S9)', async (t) => {
  const more = 'AETHER-OWNS: src/**\n'
  const native = world(t)
  assert.equal((await task.begin(call(BRIEF('e1', more)), native.deps)).args.isolation, 'worktree')
  assert.equal((await task.begin(call(BRIEF('r1')), native.deps)).args.isolation, undefined)
  const external = world(t, { settings: EXTERNAL, pick: GROK })
  assert.equal((await task.begin(call(BRIEF('e2', more)), external.deps)).args.isolation, 'worktree')
})

test('the prompt of an editing task names the commit its worktree must start from, and the brief for another harness does not (issue 94)', async (t) => {
  const repo = makeRepo(t)
  const base = repo.git('rev-parse', 'HEAD')
  const more = 'AETHER-OWNS: src/**\n'
  const native = world(t, { cwd: repo.dir })
  const onClaude = await task.begin(call(BRIEF('e1', more)), native.deps)
  assert.ok(onClaude.args.prompt.includes(base), 'the prompt of the call carries the recorded base')
  assert.ok(onClaude.args.prompt.includes(`git checkout --detach ${base}`))
  assert.ok(onClaude.args.prompt.startsWith(BRIEF('e1', more)), 'the Lead\'s brief stays at the front')
  assert.equal((await task.begin(call(BRIEF('r1')), native.deps)).args.prompt, undefined, 'a read-only task works in the Lead\'s checkout and gets nothing added')
  const external = world(t, { settings: EXTERNAL, pick: GROK, cwd: repo.dir })
  const rescue = await task.begin(call(BRIEF('e2', more)), external.deps)
  assert.ok(rescue.args.prompt.includes(`git checkout --detach ${base}`), 'the rescue on Claude starts from the same base')
  const briefFile = fs.readFileSync(path.join(external.dataDir, 'delegates', 'briefs', 'e2-1.md'), 'utf8')
  assert.equal(briefFile.includes('git checkout --detach'), false, 'the brief of the other harness, which gets a branch made from the base, is not changed')
})

test('an approve of an attempt on Claude that edits is refused with no worktree and no checks of a result (S9)', async (t) => {
  const { deps, dataDir } = world(t)
  await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\n')), deps)
  const refused = await task.verdict({ task: 'e1', verdict: 'approve' }, deps)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /worktree/)
  assert.equal(entries(dataDir, 'e1').some((e) => e.kind === 'verdict'), false)
})

test('a read-only delegate on Claude is approved only with its answer, not empty, and a checkout that did not change since begin; a file dirty before counts when its content changed (R6)', async (t) => {
  const repo = makeRepo(t)
  fs.appendFileSync(path.join(repo.dir, 'README.md'), 'dirty before the delegate\n')
  const { deps, dataDir } = world(t, { cwd: repo.dir })
  const said = (id, text) => log.appendEntry(dataDir, { kind: 'answer', task: id, attempt: 1, session: 's1', time: 5000, text })
  const plan = await task.begin(call(BRIEF('r1')), deps)
  assert.deepEqual(plan.answerOf, { task: 'r1', attempt: 1 })
  assert.equal((await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\n')), deps)).answerOf, null, 'a task that edits has no answer to record')
  const none = await task.verdict({ task: 'r1', verdict: 'approve' }, deps)
  assert.deepEqual([none.ok, /answer/.test(none.error)], [false, true], 'no answer recorded: not approved')
  said('r1', '   ')
  assert.equal((await task.verdict({ task: 'r1', verdict: 'approve' }, deps)).ok, false, 'an empty answer is not approved')
  said('r1', 'found it')
  assert.equal((await task.verdict({ task: 'r1', verdict: 'approve' }, deps)).ok, true, 'what was dirty before and was not touched does not count')
  await task.begin(call(BRIEF('r2')), deps)
  said('r2', 'found it')
  fs.writeFileSync(path.join(repo.dir, 'touched.js'), 'x\n')
  const refused = await task.verdict({ task: 'r2', verdict: 'approve' }, deps)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /touched\.js/)
  assert.equal((await task.verdict({ task: 'r2', verdict: 'fix', findings: ['touched.js: do not create files'] }, deps)).ok, true)
  await task.begin(call(BRIEF('r3')), deps)
  said('r3', 'found it')
  fs.appendFileSync(path.join(repo.dir, 'README.md'), 'the delegate edited it again\n')
  const again = await task.verdict({ task: 'r3', verdict: 'approve' }, deps)
  assert.equal(again.ok, false)
  assert.match(again.error, /README\.md/, 'a file that was dirty at begin counts when its content changed')
})

test('a read-only attempt on an external pair records what was dirty at its launch; an editing one records no dirty set (R6, issue 84)', async (t) => {
  const repo = makeRepo(t)
  fs.appendFileSync(path.join(repo.dir, 'README.md'), 'dirty before the delegate\n')
  const { deps, dataDir } = world(t, { cwd: repo.dir, settings: EXTERNAL, pick: GROK })
  const plan = await task.begin(call(BRIEF('r1')), deps)
  assert.equal(plan.external.edits, false)
  assert.equal(plan.answerOf, null, 'a plan with an external pair names no answer of its own')
  const launch = entries(dataDir, 'r1').find((e) => e.kind === 'launch')
  assert.equal(typeof launch.dirty, 'object')
  assert.notEqual(launch.dirty, null)
  assert.ok(Object.hasOwn(launch.dirty, 'README.md'), 'the file dirty before the launch is in its set')
  await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\n')), deps)
  assert.equal(entries(dataDir, 'e1').find((e) => e.kind === 'launch').dirty, null, 'an editing launch records no dirty set')
})

test('an external read-only attempt that the rescue answered is approved over a dirty checkout it did not touch (R6, issue 84)', async (t) => {
  const repo = makeRepo(t)
  fs.appendFileSync(path.join(repo.dir, 'README.md'), 'dirty before the delegate\n')
  const { deps, dataDir } = world(t, { cwd: repo.dir, settings: EXTERNAL, pick: GROK })
  await task.begin(call(BRIEF('r1')), deps)
  log.appendEntry(dataDir, { kind: 'result', task: 'r1', attempt: 1, session: 's1', time: 5000, ok: false, status: 'quota', pair: GROK, checks: null })
  log.appendEntry(dataDir, { kind: 'answer', task: 'r1', attempt: 1, session: 's1', time: 5001, text: 'found it' })
  const approved = await task.verdict({ task: 'r1', verdict: 'approve' }, deps)
  assert.deepEqual([approved.ok, approved.error], [true, undefined])
})

test('an approve of an external result uses the checks its run recorded (C6)', async (t) => {
  const { deps, dataDir } = world(t)
  await task.begin(call(BRIEF('t1', 'AETHER-OWNS: src/**\n')), deps)
  log.appendEntry(dataDir, { kind: 'result', task: 't1', attempt: 1, session: 's1', time: 5000, ok: true, pair: null, checks: { ok: false, reasons: ['tests failed'] } })
  const refused = await task.verdict({ task: 't1', verdict: 'approve' }, deps)
  assert.deepEqual([refused.ok, /tests failed/.test(refused.error)], [false, true])
})

test('a new id with the same owns and tests as a task of the session that did not end approved is a relaunch (R1)', async (t) => {
  const { deps, dataDir } = world(t)
  const more = 'AETHER-OWNS: src/**\nAETHER-TESTS: npm test\n'
  await task.begin(call(BRIEF('t1', more)), deps)
  await task.begin(call(BRIEF('t2', more)), deps)
  assert.deepEqual(log.readEntries(dataDir).filter((e) => e.kind === 'relaunch').map((e) => [e.task, e.of]), [['t2', 't1']])
  await task.begin(call(BRIEF('t3', 'AETHER-OWNS: other/**\nAETHER-TESTS: npm test\n')), deps)
  assert.equal(log.readEntries(dataDir).filter((e) => e.kind === 'relaunch').length, 1)
})

test('each step asks the pair of the points of its own model, and a correction keeps the model and raises the effort a step (C8, R11, issue 87)', async (t) => {
  const quota = [{ id: GROK.id, outcome: 'picked' }, { id: 'grok/grok-4.7@xhigh', outcome: 'next', rank: 2 }]
  const { deps, asked, dataDir } = world(t, { settings: EXTERNAL, pick: GROK, quota })
  const more = 'AETHER-OWNS: src/**\nAETHER-TESTS: npm test\n'
  const first = await task.begin(call(BRIEF('t1', more)), deps)
  assert.deepEqual(asked[0], { model: 'haiku', effort: 'high' })
  assert.deepEqual([first.external.id, first.external.edits, first.external.pin], ['t1', true, null])
  assert.deepEqual(first.args, { model: 'haiku', effort: 'high', isolation: 'worktree' }, 'the rescue on Claude is the same step, isolated because the task edits')
  const file = JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'external', 't1.json'), 'utf8'))
  assert.deepEqual([file.edits, file.owns, file.tests, file.step, file.harness], [true, ['src/**'], 'npm test', 'haiku', 'grok'])
  log.appendEntry(dataDir, { kind: 'result', task: 't1', attempt: 1, session: 's1', time: 5000, ok: true, pair: GROK, checks: { ok: true } })
  await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING] }, deps)
  const fixed = await task.begin(call(BRIEF('t1', more)), deps)
  assert.deepEqual(asked[1], { model: 'haiku', effort: 'xhigh' })
  assert.equal(fixed.external.pin, 'grok/grok-4.7@xhigh', 'the same model, one effort up')
  const corrected = JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'external', 't1.json'), 'utf8'))
  assert.deepEqual([corrected.harness, corrected.rung.model, corrected.rung.effort, corrected.pin], ['grok', 'grok-4.7', 'xhigh', 'grok/grok-4.7@xhigh'])
  assert.deepEqual(corrected.alternates[0], { harness: 'grok', rung: { model: 'grok-4.7', effort: 'high', group: 'grok' } }, 'the pair the choice made stays the next candidate')
  await task.verdict({ task: 't1', verdict: 'infeasible', reason: 'too hard for Haiku' }, deps)
  const risen = await task.begin(call(BRIEF('t1', more)), deps)
  assert.deepEqual(asked[2], { model: 'sonnet', effort: 'high' })
  assert.equal(risen.external.pin, null)
})

const FLASH_MEDIUM = { id: 'agy/gemini-3.8-flash@medium', harness: 'agy', model: 'gemini-3.8-flash', effort: 'medium', group: 'flash' }
const SONNET_PICK = { id: 'agy/claude-sonnet-5-5@medium', harness: 'agy', model: 'claude-sonnet-5-5', effort: 'medium', group: 'claude' }

// One correction of a task that edited on FLASH_MEDIUM, for a choice that made `pick` and found `quota` able to serve.
async function corrected(t, { pick, quota, edits = true }) {
  const { deps, dataDir } = world(t, { settings: EXTERNAL, pick, quota })
  const more = edits ? 'AETHER-OWNS: src/**\nAETHER-TESTS: npm test\n' : ''
  await task.begin(call(BRIEF('t1', more)), deps)
  log.appendEntry(dataDir, { kind: 'result', task: 't1', attempt: 1, session: 's1', time: 5000, ok: true, pair: FLASH_MEDIUM, checks: { ok: true } })
  await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING] }, deps)
  const plan = await task.begin(call(BRIEF('t1', more)), deps)
  const file = JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'external', 't1.json'), 'utf8'))
  return { plan, file }
}

test('a correction goes to the same model one effort up, whatever model the choice would pick, and the note says so (issue 87)', async (t) => {
  const quota = [{ id: SONNET_PICK.id, outcome: 'picked' }, { id: 'agy/gemini-3.8-flash@high', outcome: 'next', rank: 2 }, { id: 'agy/gemini-3.8-flash@medium', outcome: 'next', rank: 3 }]
  for (const edits of [true, false]) {
    const { plan, file } = await corrected(t, { pick: SONNET_PICK, quota, edits })
    assert.match(plan.notes.join(' '), /on agy gemini-3\.8-flash high \(pair agy\/gemini-3\.8-flash@high\)/, `edits ${edits}: the note names the pair that runs`)
    assert.deepEqual([file.harness, file.rung.model, file.rung.effort, file.pin], ['agy', 'gemini-3.8-flash', 'high', 'agy/gemini-3.8-flash@high'])
    assert.equal(file.alternates[0].rung.model, 'claude-sonnet-5-5', 'the pick of the choice is the first alternate')
    assert.ok(!file.alternates.some((a) => a.rung.model === 'gemini-3.8-flash' && a.rung.effort === 'high'), 'the pair that runs is not its own alternate')
  }
})

test('when the raised pair cannot serve the correction keeps the earlier pair, and when neither can the choice stands (issue 87)', async (t) => {
  const sameOnly = await corrected(t, { pick: SONNET_PICK, quota: [{ id: SONNET_PICK.id, outcome: 'picked' }, { id: FLASH_MEDIUM.id, outcome: 'next', rank: 2 }] })
  assert.deepEqual([sameOnly.file.rung.model, sameOnly.file.rung.effort, sameOnly.file.pin], ['gemini-3.8-flash', 'medium', FLASH_MEDIUM.id])
  const none = await corrected(t, { pick: SONNET_PICK, quota: [{ id: SONNET_PICK.id, outcome: 'picked' }, { id: 'agy/gemini-3.8-flash@high', outcome: 'passed', why: 'harness-off' }] })
  assert.deepEqual([none.file.rung.model, none.file.rung.effort, none.file.pin], ['claude-sonnet-5-5', 'medium', null])
})

test('a read-only task has no edits; with no pair it runs on Claude at the model of its step (E11, R14)', async (t) => {
  const readOnly = world(t, { settings: EXTERNAL, pick: GROK })
  assert.equal((await task.begin(call(BRIEF('r1')), readOnly.deps)).external.edits, false)
  const none = world(t, { settings: EXTERNAL, pick: null })
  const plan = await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\n')), none.deps)
  assert.deepEqual([plan.external, plan.args.model], [null, 'haiku'])
})

test('a named agent that is not a plain one stays on Claude', async (t) => {
  const { deps } = world(t, { settings: EXTERNAL, pick: GROK })
  const plan = await task.begin(call(BRIEF('t1'), { subagent_type: 'aether:judge' }), deps)
  assert.equal(plan.skip, true)
})

// ---- --ignore: files another writer of the checkout changed, which a read-only task is not charged with (issue 100) ----

const SPEC = 'specs/017-public-ready-cleanup/spec.md'
const BIN = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-delegate')

// A read-only delegate on Claude that answered in a checkout; the files it is charged with are written by the test after.
async function answeredReadOnly(t, id) {
  const repo = makeRepo(t)
  const { deps, dataDir } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF(id)), deps)
  log.appendEntry(dataDir, { kind: 'answer', task: id, attempt: 1, session: 's1', time: 5000, text: 'found it' })
  return { repo, deps, dataDir }
}

function writeSpec(repo) {
  fs.mkdirSync(path.join(repo.dir, 'specs', '017-public-ready-cleanup'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, SPEC), 'written by the Writer of a design run\n')
}

test('a read-only task whose checkout another writer changed is refused, and the refusal says how to judge again with --ignore (issue 100, a)', async (t) => {
  const { repo, deps } = await answeredReadOnly(t, 'ro-a')
  writeSpec(repo)
  const refused = await task.verdict({ task: 'ro-a', verdict: 'approve' }, deps)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /specs\/017-public-ready-cleanup\/spec\.md/)
  assert.match(refused.error, /--ignore '<glob>'/, 'the message names the flag and how to use it')
})

test('the same read-only task is approved when --ignore matches the file another writer changed, and the globs are recorded in the verdict (issue 100, b)', async (t) => {
  const { repo, deps, dataDir } = await answeredReadOnly(t, 'ro-b')
  writeSpec(repo)
  const judged = await task.verdict({ task: 'ro-b', verdict: 'approve', ignore: [SPEC] }, deps)
  assert.equal(judged.ok, true, judged.error)
  assert.equal(judged.verdict, 'approved')
  const recorded = log.readEntries(dataDir, { task: 'ro-b' }).find((e) => e.kind === 'verdict')
  assert.deepEqual(recorded.ignore, [SPEC])
})

test('a file changed outside the --ignore globs still fails the read-only check, and the refusal names only that file (issue 100, c)', async (t) => {
  const { repo, deps } = await answeredReadOnly(t, 'ro-c')
  writeSpec(repo)
  fs.writeFileSync(path.join(repo.dir, 'touched.js'), 'x\n')
  const refused = await task.verdict({ task: 'ro-c', verdict: 'approve', ignore: ['specs/017-public-ready-cleanup/**'] }, deps)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /touched\.js/)
  assert.doesNotMatch(refused.error, /specs\/017/, 'the ignored file is left out of the list')
})

test('--ignore on an editing task is refused with a clear error, before any check runs (issue 100, d)', async (t) => {
  const { deps, dataDir } = world(t)
  await task.begin(call(BRIEF('ed-d', 'AETHER-OWNS: src/**\n')), deps)
  const refused = await task.verdict({ task: 'ed-d', verdict: 'approve', ignore: ['src/**'] }, deps)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /--ignore is for a read-only task/)
  assert.equal(log.readEntries(dataDir, { task: 'ed-d' }).some((e) => e.kind === 'verdict'), false, 'nothing is recorded')
})

test('the bin parses a repeated --ignore and judges through the same check; a bare --ignore is refused (issue 100, e)', async (t) => {
  const { repo, dataDir } = await answeredReadOnly(t, 'ro-e')
  writeSpec(repo)
  fs.writeFileSync(path.join(repo.dir, 'touched.js'), 'x\n')
  const env = { ...process.env, AETHER_DATA_DIR: dataDir }
  const run = (...args) => spawnSync(process.execPath, [BIN, 'verdict', '--task', 'ro-e', '--verdict', 'approve', ...args], { cwd: repo.dir, encoding: 'utf8', env })
  const bare = run('--ignore')
  assert.equal(bare.status, 1)
  assert.match(JSON.parse(bare.stdout.trim()).error, /--ignore needs a value/)
  const flagged = run('--ignore', '--verdict')
  assert.equal(flagged.status, 1)
  assert.match(JSON.parse(flagged.stdout.trim()).error, /is a flag/)
  const partial = run('--ignore', SPEC)
  assert.equal(partial.status, 0)
  assert.equal(JSON.parse(partial.stdout.trim()).ok, false, 'touched.js is still charged')
  const both = run('--ignore', SPEC, '--ignore', 'touched.js')
  assert.equal(both.status, 0)
  assert.equal(JSON.parse(both.stdout.trim()).ok, true, both.stdout)
})
