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
  assert.deepEqual(task.parseBrief('AETHER-TASK: t-1\nAETHER-OWNS: src/**, tests/a.test.js\nAETHER-TESTS: npm test\nAETHER-TASK: t-2\nbody'), { task: 't-1', owns: ['src/**', 'tests/a.test.js'], tests: 'npm test', skills: [] })
  assert.deepEqual(task.parseBrief('just a brief'), { task: null, owns: [], tests: null, skills: [] })
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
  fs.mkdirSync(path.dirname(patch), { recursive: true })
  fs.writeFileSync(patch, 'patch')
  log.appendEntry(dataDir, { kind: 'result', task: 't1', attempt: 1, session: 's1', time: 5000, ok: true, pair: null, patch, answer: null, checks: { ok: true } })
  await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING] }, deps)
  const again = await task.begin(call(BRIEF('t1')), deps)
  assert.ok(again.args.prompt.includes('## Your previous work') && again.args.prompt.includes(patch))
  assert.ok(again.args.prompt.includes(`git apply ${patch}`), 'the brief tells a delegate on Claude to apply the patch itself (issue 88)')
})

test('the brief of an editing external pair leaves the patch and the findings to the lane command, which carries both; the rescue on Claude keeps them (issue 142)', async (t) => {
  const { deps, dataDir } = world(t, { settings: EXTERNAL, pick: GROK })
  const more = 'AETHER-OWNS: src/**\n'
  await task.begin(call(BRIEF('t1', more)), deps)
  const patch = path.join(dataDir, 'delegates', 'patches', 't1-1.patch')
  fs.mkdirSync(path.dirname(patch), { recursive: true })
  fs.writeFileSync(patch, 'patch')
  log.appendEntry(dataDir, { kind: 'result', task: 't1', attempt: 1, session: 's1', time: 5000, ok: true, pair: GROK, patch, answer: null, checks: { ok: true } })
  await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING], reason: 'keep the API' }, deps)
  const again = await task.begin(call(BRIEF('t1', more)), deps)
  const file = JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'external', '2-s1--t1.json'), 'utf8'))
  assert.deepEqual([file.carry, file.findings], [patch, [FINDING]], 'the lane command gets the patch (--carry) and the findings (--findings)')
  const brief = fs.readFileSync(file.brief, 'utf8')
  assert.equal(brief, file.task.prompt)
  assert.equal(brief.includes('git apply'), false, 'the lane applies the patch before the pair starts: the brief does not ask for it again')
  assert.equal(brief.includes(patch), false, 'the patch lives outside the worktree the pair is limited to')
  assert.equal(brief.includes('## Findings to fix'), false, 'the lane adds the findings: they appear once')
  assert.ok(brief.includes('## Reason\n\nkeep the API'), 'what the lane does not carry stays in the brief')
  assert.ok(again.args.prompt.includes(`git apply ${patch}`) && again.args.prompt.includes(FINDING), 'the rescue on Claude applies the patch itself and reads the findings (issue 88)')
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
  const briefFile = fs.readFileSync(path.join(external.dataDir, 'delegates', 'briefs', '2-s1--e2-1.md'), 'utf8')
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
  assert.deepEqual((await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\n')), deps)).answerOf, { task: 'e1', attempt: 1 }, 'a task that edits on Claude names its attempt too, so the mod records when it ends')
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
  const file = JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'external', '2-s1--t1.json'), 'utf8'))
  assert.deepEqual([file.edits, file.owns, file.tests, file.step, file.harness], [true, ['src/**'], 'npm test', 'haiku', 'grok'])
  log.appendEntry(dataDir, { kind: 'result', task: 't1', attempt: 1, session: 's1', time: 5000, ok: true, pair: GROK, checks: { ok: true } })
  await task.verdict({ task: 't1', verdict: 'fix', findings: [FINDING] }, deps)
  const fixed = await task.begin(call(BRIEF('t1', more)), deps)
  assert.deepEqual(asked[1], { model: 'haiku', effort: 'xhigh' })
  assert.equal(fixed.external.pin, 'grok/grok-4.7@xhigh', 'the same model, one effort up')
  const corrected = JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'external', '2-s1--t1.json'), 'utf8'))
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
  const file = JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'external', '2-s1--t1.json'), 'utf8'))
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

test('a read-only result of an external pair charged with files another writer changed is refused with the hint, partly ignored still refused, and approved when --ignore covers them all (issue 100, f)', async (t) => {
  const { deps, dataDir } = world(t)
  await task.begin(call(BRIEF('ro-f')), deps)
  const charged = { kind: 'read-only', ok: false, empty: false, outside: [SPEC, 'touched.js'], reasons: [`files modified in read-only task: ${SPEC}, touched.js`] }
  log.appendEntry(dataDir, { kind: 'result', task: 'ro-f', attempt: 1, session: 's1', time: 5000, ok: true, pair: null, patch: null, answer: null, checks: charged })
  const refused = await task.verdict({ task: 'ro-f', verdict: 'approve' }, deps)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /--ignore '<glob>'/, 'the refusal of a result tells the Lead how to judge again')
  const partial = await task.verdict({ task: 'ro-f', verdict: 'approve', ignore: [SPEC] }, deps)
  assert.equal(partial.ok, false, 'a file outside the globs still fails')
  const judged = await task.verdict({ task: 'ro-f', verdict: 'approve', ignore: [SPEC, 'touched.js'] }, deps)
  assert.equal(judged.ok, true, judged.error)
  assert.deepEqual(log.readEntries(dataDir, { task: 'ro-f' }).find((e) => e.kind === 'verdict').ignore, [SPEC, 'touched.js'])
})

test('an empty answer is not forgiven by --ignore, whatever the globs (issue 100, g)', async (t) => {
  const { deps, dataDir } = world(t)
  await task.begin(call(BRIEF('ro-g')), deps)
  const empty = { kind: 'read-only', ok: false, empty: true, outside: [SPEC], reasons: ['answer is empty', `files modified in read-only task: ${SPEC}`] }
  log.appendEntry(dataDir, { kind: 'result', task: 'ro-g', attempt: 1, session: 's1', time: 5000, ok: true, pair: null, patch: null, answer: null, checks: empty })
  const refused = await task.verdict({ task: 'ro-g', verdict: 'approve', ignore: ['**'] }, deps)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /answer is empty/)
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

// ---- the commit the work was built on (issues 143 and 178) ----

// An editing delegate on Claude works in a worktree of its own, made from the recorded base. A
// file the Lead commits in the Lead's checkout after the launch is not in that worktree's
// history, so it is not charged to the delegate (issue 178, a).
test('a commit the Lead made after the launch is not charged to an editing delegate on Claude', async (t) => {
  const repo = makeRepo(t)
  const { deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('after', 'AETHER-OWNS: src/**\n')), deps)
  const base = repo.git('rev-parse', 'HEAD')
  const wt = path.join(tempDir(t, 'aether-wt-'), 'wt')
  repo.git('worktree', 'add', '--detach', wt, base)
  fs.mkdirSync(path.join(repo.dir, 'ops'))
  fs.writeFileSync(path.join(repo.dir, 'ops', 'note.md'), 'lead work after the launch\n')
  repo.git('add', 'ops/note.md')
  repo.git('commit', '-q', '-m', 'lead commits after the launch')
  fs.mkdirSync(path.join(wt, 'src'))
  fs.writeFileSync(path.join(wt, 'src', 'a.js'), 'a\n')
  const approved = await task.verdict({ task: 'after', verdict: 'approve', worktree: wt }, deps)
  assert.equal(approved.ok, true, approved.error)
})

// A delegate worktree made from a branch with extra files keeps those files out of the check:
// only what the delegate changed counts (issue 143, b).
test('a worktree that started from a branch with extra files charges an editing delegate only with its own changes', async (t) => {
  const repo = makeRepo(t)
  repo.git('switch', '-q', '-c', 'feature/big')
  fs.mkdirSync(path.join(repo.dir, 'docs'))
  fs.writeFileSync(path.join(repo.dir, 'docs', 'big.md'), 'feature work\n')
  repo.git('add', 'docs/big.md')
  repo.git('commit', '-q', '-m', 'feature work the delegate started from')
  const fork = repo.git('rev-parse', 'HEAD')
  repo.git('switch', '-q', 'feature/x')
  const { deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('branched', 'AETHER-OWNS: src/**\n')), deps)
  const wt = path.join(tempDir(t, 'aether-wt-'), 'wt')
  repo.git('worktree', 'add', '--detach', wt, fork)
  fs.mkdirSync(path.join(wt, 'src'))
  fs.writeFileSync(path.join(wt, 'src', 'a.js'), 'a\n')
  const approved = await task.verdict({ task: 'branched', verdict: 'approve', worktree: wt }, deps)
  assert.equal(approved.ok, true, approved.error)
})

// But a file the delegate really changed outside Owns still fails the check, and the refusal names
// only that file: the committed files of the branch it started from stay out (issue 143, c).
test('a file an editing delegate really changed outside Owns still fails, naming only that file', async (t) => {
  const repo = makeRepo(t)
  repo.git('switch', '-q', '-c', 'feature/big')
  fs.mkdirSync(path.join(repo.dir, 'docs'))
  fs.writeFileSync(path.join(repo.dir, 'docs', 'big.md'), 'feature work\n')
  repo.git('add', 'docs/big.md')
  repo.git('commit', '-q', '-m', 'feature work the delegate started from')
  const fork = repo.git('rev-parse', 'HEAD')
  repo.git('switch', '-q', 'feature/x')
  const { deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('outside', 'AETHER-OWNS: src/**\n')), deps)
  const wt = path.join(tempDir(t, 'aether-wt-'), 'wt')
  repo.git('worktree', 'add', '--detach', wt, fork)
  fs.mkdirSync(path.join(wt, 'src'))
  fs.writeFileSync(path.join(wt, 'src', 'a.js'), 'a\n')
  fs.writeFileSync(path.join(wt, 'notes.txt'), 'outside owns\n')
  const refused = await task.verdict({ task: 'outside', verdict: 'approve', worktree: wt }, deps)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /notes\.txt/)
  assert.doesNotMatch(refused.error, /big\.md/, 'the committed files of the starting branch are not charged')
})

// Work the delegate itself committed counts: the check starts before its own commits, so
// committed inside-Owns-only work with a clean tree passes.
test('work an editing delegate committed itself counts: inside Owns only passes', async (t) => {
  const repo = makeRepo(t)
  const { deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('committed', 'AETHER-OWNS: src/**\n')), deps)
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'a\n')
  repo.git('add', 'src/a.js')
  repo.git('commit', '-q', '-m', 'delegate work')
  const approved = await task.verdict({ task: 'committed', verdict: 'approve', worktree: repo.dir }, deps)
  assert.equal(approved.ok, true, approved.error)
})

// And a file it committed outside Owns fails the check, naming only that file.
test('work an editing delegate committed itself counts: outside Owns fails naming only that file', async (t) => {
  const repo = makeRepo(t)
  const { deps } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('committed-out', 'AETHER-OWNS: src/**\n')), deps)
  fs.writeFileSync(path.join(repo.dir, 'notes.txt'), 'outside owns\n')
  repo.git('add', 'notes.txt')
  repo.git('commit', '-q', '-m', 'delegate work outside owns')
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'a\n')
  const refused = await task.verdict({ task: 'committed-out', verdict: 'approve', worktree: repo.dir }, deps)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /notes\.txt/)
  assert.doesNotMatch(refused.error, /a\.js/, 'the inside-Owns file is not named')
})

// An authorization the log carries with an effort floors the task's effort: a correction keeps it (owner effort, issue 141).
test('a task whose recorded authorization carries an effort keeps it on a correction and drops it on a rise (owner effort)', async (t) => {
  const { deps, dataDir } = world(t)
  const firstLaunch = (task_, step, effort, authorized) => ({
    kind: 'launch', time: 1000, session: 's1', task: task_, step, attempt: 1, launchKind: 'first',
    effort, edits: false, owns: [], tests: null, description: 'd', requested: null, ignored: false,
    pin: null, base: null, dirty: null, authorized,
  })
  const ownerSays = (task_, model) => ({ model, scope: 'task', task: task_, quote: `the owner said ${model} at max here`, quoteTime: 'x' })
  log.appendEntry(dataDir, firstLaunch('m1', 'sonnet', 'max', { ...ownerSays('m1', 'sonnet'), effort: 'max' }))
  await task.verdict({ task: 'm1', verdict: 'fix', findings: [FINDING] }, deps)
  const fixed = await task.begin(call(BRIEF('m1')), deps)
  assert.deepEqual([fixed.kind, fixed.args.model, fixed.args.effort], ['fix', 'sonnet', 'max'])
  await task.verdict({ task: 'm1', verdict: 'fix', findings: [F(2)] }, deps)
  await task.verdict({ task: 'm1', verdict: 'fix', findings: [F(3)] }, deps)
  const risen = await task.begin(call(BRIEF('m1')), deps)
  assert.deepEqual([risen.kind, risen.args.model, risen.args.effort], ['rise', 'opus', 'high'])
})

test('begin refuses to launch a delegate in a Lead session when an open autonomous run hit time, cost, or quota stop, also from a linked worktree, and leaves non-Lead sessions unchanged', async (t) => {
  const autonomy = require('../plugins/aether/lib/autonomy.js')
  const { markSession } = require('../plugins/aether/lib/session.js')
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-del-autonomy-')
  const configDir = tempDir(t, 'aether-cfg-autonomy-')
  const projDir = path.join(configDir, 'projects', 'proj-del')
  fs.mkdirSync(projDir, { recursive: true })
  fs.writeFileSync(
    path.join(projDir, 'sess-1.jsonl'),
    JSON.stringify({
      type: 'user',
      isSidechain: false,
      origin: { kind: 'human' },
      entrypoint: 'sdk-cli',
      timestamp: '2026-04-12T10:00:00.000Z',
      message: { role: 'user', content: 'run unattended for 1 hour' },
    }) + '\n'
  )
  markSession(dataDir, 'sess-1', 1000, { repo: repo.dir, claude: null })
  // The run is opened in the main checkout; a Lead that works in a linked worktree must be refused as well.
  const linked = path.join(tempDir(t, 'aether-linked-'), 'wt')
  repo.git('worktree', 'add', '-q', '-b', 'linked/x', linked)

  const t0 = Date.parse('2026-04-12T10:00:00.000Z')
  // The deps are shaped like world(): the native settings, a pickPair and a newId, with the repository as cwd.
  const ask = (session, id, nowMs, cwd = repo.dir) =>
    task.begin(
      { session, event: { subagent_type: 'general-purpose', description: 'build feature', prompt: BRIEF(id) } },
      { dataDir, cwd, settings: NATIVE, now: () => nowMs, newId: () => `gen-${id}`, pickPair: async () => ({ pick: null, quota: [] }) }
    )

  // A marked Lead without an autonomous run still launches normally.
  const withoutRun = await ask('sess-1', 't-no-run', t0)
  assert.equal(withoutRun.kind, 'first')

  const started = autonomy.start(
    repo.dir,
    { quote: 'run unattended for 1 hour', session: 'sess-1', hours: 1, usd: 5 },
    { configDir, dataDir, now: t0 }
  )
  assert.equal(started.ok, true)

  // An open run with no stop also allows new work.
  assert.equal(autonomy.status(repo.dir, { now: t0 + 1000 }).stop, null)
  const withinCeilings = await ask('sess-1', 't-active', t0 + 1000)
  assert.equal(withinCeilings.kind, 'first')

  // Time stop in Lead session
  const byTime = await ask('sess-1', 't-time', t0 + 3605 * 1000)
  assert.equal(byTime.kind, 'refused')
  assert.equal(byTime.stop, 'time')
  assert.equal(byTime.run, started.run.id)
  assert.match(byTime.notes.join('\n'), /aether-autonomy end --outcome ceiling/)

  // The same refusal from a linked worktree
  const fromLinked = await ask('sess-1', 't-linked', t0 + 3605 * 1000, linked)
  assert.equal(fromLinked.kind, 'refused')
  assert.equal(fromLinked.stop, 'time')
  assert.equal(fromLinked.run, started.run.id)

  // Non-Lead session proceeds normally even when ceiling is reached (C7)
  const nonLead = await ask('plain-session', 't-plain', t0 + 3605 * 1000)
  assert.equal(nonLead.kind, 'first')

  // Quota stop in Lead session (within time ceiling)
  const resetsAt = new Date(t0 + 4 * 3600 * 1000).toISOString()
  autonomy.recordCrossing(
    repo.dir,
    { kind: 'five_hour', percentUsed: 80, resetsAt, threshold: 80 },
    { now: t0 + 1000, dataDir }
  )
  const byQuota = await ask('sess-1', 't-quota', t0 + 2000)
  assert.equal(byQuota.kind, 'refused')
  assert.equal(byQuota.stop, 'quota')
  assert.equal(byQuota.run, started.run.id)
  assert.match(byQuota.notes.join('\n'), /aether-autonomy end --outcome incomplete/)

  // Cost stop in Lead session (in a fresh run with 10h ceiling)
  autonomy.end(repo.dir, 'incomplete', { now: t0 + 3000 })
  const startedCost = autonomy.start(
    repo.dir,
    { quote: 'run unattended for 1 hour', session: 'sess-1', hours: 10, usd: 5 },
    { configDir, dataDir, now: t0 + 4000 }
  )
  assert.equal(startedCost.ok, true)
  autonomy.spend(repo.dir, 5, 'u1', { now: t0 + 5000 })
  const byCost = await ask('sess-1', 't-cost', t0 + 6000)
  assert.equal(byCost.kind, 'refused')
  assert.equal(byCost.stop, 'cost')
  assert.equal(byCost.run, startedCost.run.id)
  assert.match(byCost.notes.join('\n'), /aether-autonomy end --outcome ceiling/)
})

test('an attempt that edits and runs on Claude names its end like a read-only one; one on an external pair does not (spec 031, C1)', async (t) => {
  const more = 'AETHER-OWNS: src/**\n'
  const native = world(t)
  const onClaude = await task.begin(call(BRIEF('e1', more)), native.deps)
  assert.equal(onClaude.external, null)
  assert.deepEqual(onClaude.answerOf, { task: 'e1', attempt: 1 })
  const repo = makeRepo(t)
  const external = world(t, { settings: EXTERNAL, pick: GROK, cwd: repo.dir })
  const delegated = await task.begin(call(BRIEF('e2', more)), external.deps)
  assert.equal(delegated.external.edits, true)
  assert.equal(delegated.answerOf, null, 'the external pair writes its own result')
})

test('the correction of an attempt that edits on Claude is the same with or without its ended line (spec 031, C1)', async (t) => {
  const more = 'AETHER-OWNS: src/**\n'
  const cycle = async (withEnded) => {
    const { deps, dataDir } = world(t)
    await task.begin(call(BRIEF('e1', more)), deps)
    if (withEnded) log.appendEntry(dataDir, { kind: 'ended', task: 'e1', attempt: 1, session: 's1', time: 5000 })
    const judged = await task.verdict({ task: 'e1', verdict: 'fix', findings: [FINDING] }, deps)
    const again = await task.begin(call(BRIEF('e1', more)), deps)
    return { judged, again }
  }
  const plain = await cycle(false)
  const ended = await cycle(true)
  assert.equal(ended.judged.ok, true)
  assert.deepEqual([ended.judged.next, ended.judged.corrections], [plain.judged.next, plain.judged.corrections])
  assert.deepEqual([ended.again.step, ended.again.kind, ended.again.args], [plain.again.step, plain.again.kind, plain.again.args])
  assert.deepEqual([ended.again.kind, ended.again.args.effort], ['fix', 'xhigh'])
  assert.ok(ended.again.args.prompt.includes(FINDING))
  assert.deepEqual(ended.again.answerOf, { task: 'e1', attempt: 2 })
})

test('an approve of an attempt that edits on Claude checks its worktree with its ended line in the log (spec 031, C1)', async (t) => {
  const repo = makeRepo(t)
  const { deps, dataDir } = world(t, { cwd: repo.dir })
  await task.begin(call(BRIEF('e1', 'AETHER-OWNS: src/**\nAETHER-TESTS: node -e "process.exit(0)"\n')), deps)
  log.appendEntry(dataDir, { kind: 'ended', task: 'e1', attempt: 1, session: 's1', time: 5000 })
  const none = await task.verdict({ task: 'e1', verdict: 'approve' }, deps)
  assert.equal(none.ok, false)
  assert.match(none.error, /worktree/, 'the ended line is not an answer to check: the edits are')
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.mkdirSync(path.join(repo.dir, 'docs'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'a\n')
  fs.writeFileSync(path.join(repo.dir, 'docs', 'x.md'), 'x\n')
  const outside = await task.verdict({ task: 'e1', verdict: 'approve', worktree: repo.dir }, deps)
  assert.equal(outside.ok, false)
  assert.match(outside.error, /docs\/x\.md/)
  fs.rmSync(path.join(repo.dir, 'docs'), { recursive: true })
  const approved = await task.verdict({ task: 'e1', verdict: 'approve', worktree: repo.dir }, deps)
  assert.equal(approved.ok, true, approved.error)
})
