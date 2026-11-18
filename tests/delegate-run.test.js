'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { tempDir, makeRepo } = require('./helpers.js')
const dr = require('../plugins/aether/lib/delegate-run.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const session = require('../plugins/aether/lib/session.js')

const BIN = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-delegate')
const PAIR = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high' }
const OK_TESTS = { command: 'npm test', exitCode: 0, passed: true, timedOut: false, outputTail: '' }

// An external file as `begin` writes it, over a repository whose worktree already holds the delegate's work.
function world(t, extra = {}) {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const base = repo.git('rev-parse', 'HEAD')
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'new.js'), 'hello\n')
  const brief = path.join(dataDir, 'delegates', 'briefs', 't1-1.md')
  fs.mkdirSync(path.dirname(brief), { recursive: true })
  fs.writeFileSync(brief, 'Write src/new.js.')
  const file = path.join(dataDir, 'delegates', 'external', 't1.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ id: 't1', session: 's1', cwd: repo.dir, attempt: 1, step: 'haiku', effort: 'high', launchKind: 'first', edits: true, owns: ['src/**'], tests: 'npm test', brief, findings: null, carry: null, pin: null, base, harness: 'grok', rung: { model: 'grok-4.7', effort: 'high', group: 'grok' }, task: { description: 'd', prompt: 'P' }, alternates: [], timeoutMs: 570000, ...extra }))
  const done = { status: 'done', id: 'run1', run: 'run1', branch: 'aether/run1/task-1', worktree: repo.dir, head: 'abc', base, pair: PAIR, summary: 'wrote it', tests: OK_TESTS, review: { status: 'done', pair: PAIR, verdict: 'ready', findings: [], summary: 'fine' }, merge: 'aether-wt merge run1 task-1' }
  return { repo, dataDir, base, done }
}

test('an editing delegate runs aether-lane delegate with the step model and effort, and comes back as a branch with tests, review and checks (C10, E1)', async (t) => {
  const { repo, dataDir, base, done } = world(t)
  const seen = []
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async (cwd, flags) => (seen.push({ cwd, flags }), done) })
  assert.equal(seen.length, 1)
  assert.deepEqual([seen[0].flags.model, seen[0].flags.effort, seen[0].flags.owns, seen[0].flags.tests, seen[0].flags.session], ['haiku', 'high', 'src/**', 'npm test', 's1'])
  assert.equal(seen[0].flags.pair, undefined)
  assert.equal(result.ok, true)
  for (const part of ['aether/run1/task-1', 'ready', 'aether-wt merge run1 task-1', 'aether-delegate verdict --task t1', `from base ${base}, checked against`]) assert.ok(result.text.includes(part), part)
  assert.equal(result.checks.ok, true)
  const written = log.readEntries(dataDir, { task: 't1' }).find((e) => e.kind === 'result')
  assert.deepEqual([written.ok, written.pair.id, written.branch, written.base], [true, PAIR.id, 'aether/run1/task-1', done.base])
  assert.ok(fs.readFileSync(written.patch, 'utf8').includes('src/new.js'))
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'results', 't1.json'), 'utf8')).ok, true)
  assert.equal(log.readEntries(dataDir, { task: 't1' }).filter((e) => e.kind === 'outcome').length, 0, 'the lane log already counts its spend')
})

test('the run works in the cwd that begin recorded, not in the one of its own process, which can be a delegate\'s isolation worktree (issue 94)', async (t) => {
  const { repo, dataDir, done } = world(t)
  const elsewhere = tempDir(t, 'aether-isolation-')
  const seen = []
  await dr.runTask({ id: 't1', cwd: elsewhere, dataDir }, { delegateCommand: async (cwd) => (seen.push(cwd), done) })
  assert.deepEqual(seen, [repo.dir])
  fs.rmSync(path.join(dataDir, 'delegates', 'results'), { recursive: true, force: true })
  const gone = world(t, { cwd: path.join(elsewhere, 'removed-worktree') })
  const fallback = []
  await dr.runTask({ id: 't1', cwd: elsewhere, dataDir: gone.dataDir }, { delegateCommand: async (cwd) => (fallback.push(cwd), gone.done) })
  assert.deepEqual(fallback, [elsewhere], 'a recorded cwd that no longer exists falls back to the cwd of the process')
})

// The two variables the lane gate reads are removed from process.env for the test, and put back afterwards, on failure too.
function clearLaneEnv(t) {
  const names = ['AETHER_SUPERDELEGATION', 'AETHER_LANE_HARNESSES']
  const saved = names.map((name) => [name, process.env[name]])
  for (const name of names) delete process.env[name]
  t.after(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })
}

function writeDelegateSettings(dataDir, settings) {
  const file = session.delegateFile(dataDir, 's1')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(settings) + '\n')
}

test('an editing delegate of a session with delegate settings runs the lane command with the switch on, its harnesses and the whole environment (issue 82)', async (t) => {
  clearLaneEnv(t)
  const { repo, dataDir, done } = world(t)
  writeDelegateSettings(dataDir, { lanes: true, harnesses: ['agy', 'grok'], deadlines: { quotaMs: 3000 } })
  const seen = []
  await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async (cwd, flags, deps) => (seen.push({ cwd, flags, deps }), done) })
  assert.equal(seen.length, 1)
  const env = seen[0].deps.env
  assert.deepEqual([env.AETHER_SUPERDELEGATION, env.AETHER_LANE_HARNESSES], ['on', 'agy,grok'])
  assert.equal(env.PATH, process.env.PATH)
})

test('an editing delegate with no delegate settings, or with lanes off, runs the lane command with no environment of its own (issue 82)', async (t) => {
  clearLaneEnv(t)
  const { repo, dataDir, done } = world(t)
  const seen = []
  const stub = async (cwd, flags, deps) => (seen.push(deps), done)
  await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: stub })
  writeDelegateSettings(dataDir, { lanes: false, harnesses: ['agy'], deadlines: { quotaMs: 3000 } })
  await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: stub })
  assert.deepEqual(seen, [undefined, undefined])
})

test('a correction passes the pair, the earlier patch and the findings on to the lane command (R2, R4)', async (t) => {
  const patch = path.join(tempDir(t), 'old.patch')
  fs.writeFileSync(patch, 'diff')
  const findings = path.join(tempDir(t), 'findings.md')
  fs.writeFileSync(findings, 'src/a.js:3: empty case')
  const { repo, dataDir, done } = world(t, { launchKind: 'fix', pin: PAIR.id, carry: patch, findings })
  const seen = []
  await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async (cwd, flags) => (seen.push(flags), done) })
  assert.deepEqual([seen[0].pair, seen[0].carry, seen[0].findings, seen[0].effort], [PAIR.id, patch, findings, 'high'])
})

test('when the lane command refused the earlier patch, the text tells the Lead why in one line; an applied carry or none adds nothing', async (t) => {
  const { CARRY_UNAPPLICABLE } = require('../plugins/aether/lib/lane-work.js')
  const run = async (fields) => {
    const { repo, dataDir, done } = world(t, { launchKind: 'fix', carry: true })
    return (await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async () => ({ ...done, ...fields }) })).text
  }
  // The shape of a done result whose carry the guards refused (tests/lane-delegate-ladder.test.js): continued false, carry the reason.
  const refused = await run({ continued: false, carry: CARRY_UNAPPLICABLE })
  const lines = refused.split('\n').filter((line) => line.startsWith('Carry refused: '))
  assert.deepEqual(lines, [`Carry refused: ${CARRY_UNAPPLICABLE}; this attempt did not start from that work, so check that it rebuilt it.`])
  for (const fields of [{ continued: true }, { continued: false }, {}]) assert.equal((await run(fields)).includes('Carry refused'), false, JSON.stringify(fields))
})

test('a result that touches files outside Owns, or changes nothing, is marked and never approvable (E9)', async (t) => {
  const outside = world(t)
  fs.mkdirSync(path.join(outside.repo.dir, 'docs'))
  fs.writeFileSync(path.join(outside.repo.dir, 'docs', 'x.md'), 'x\n')
  const r1 = await dr.runTask({ id: 't1', cwd: outside.repo.dir, dataDir: outside.dataDir }, { delegateCommand: async () => outside.done })
  assert.deepEqual([r1.checks.ok, r1.checks.outside], [false, ['docs/x.md']])
  const empty = world(t)
  fs.rmSync(path.join(empty.repo.dir, 'src'), { recursive: true })
  const r2 = await dr.runTask({ id: 't1', cwd: empty.repo.dir, dataDir: empty.dataDir }, { delegateCommand: async () => empty.done })
  assert.deepEqual([r2.checks.ok, r2.checks.empty], [false, true])
})

test('no pair at all is an answer without text, so the mod leaves the attempt to Claude (R14)', async (t) => {
  const { repo, dataDir } = world(t)
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async () => ({ status: 'no-candidate', cause: 'dry', reason: 'all dry', tried: [] }) })
  assert.deepEqual([result.ok, result.status, result.text], [false, 'no-candidate', null])
  assert.equal(log.readEntries(dataDir, { task: 't1' }).find((e) => e.kind === 'result').ok, false)
})

test('a read-only delegate runs the chain; its answer is saved and an empty one fails the check (R6)', async (t) => {
  const { repo, dataDir } = world(t, { edits: false, owns: [], tests: null })
  const chain = async ({ external }) => ({ ok: true, status: 'ok', text: 'the answer', attribution: 'Aether: this answer is from grok-4.7 at high', attempts: [], journaled: true, external })
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { runChain: chain })
  assert.ok(result.text.includes('the answer') && result.text.includes('this answer is from'))
  assert.equal(result.checks.ok, true)
  const saved = log.readEntries(dataDir, { task: 't1' }).find((e) => e.kind === 'result')
  assert.equal(fs.readFileSync(saved.answer, 'utf8'), 'the answer')
  const blank = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { runChain: async () => ({ ok: true, status: 'ok', text: '  ', attribution: 'a', attempts: [], journaled: true }) })
  assert.deepEqual([blank.checks.ok, blank.checks.empty], [false, true])
})

test('the text of a read-only result says the system closed it when its checks pass, and how to judge it when they fail (spec 044, D11)', async (t) => {
  const { repo, dataDir } = world(t, { edits: false, owns: [], tests: null })
  const chain = async () => ({ ok: true, status: 'ok', text: 'the answer', attribution: 'Aether: the answer is from grok-4.7 at high', attempts: [], journaled: true })
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { runChain: chain })
  assert.equal(result.checks.ok, true)
  assert.ok(result.text.includes('Closed by the system as approved. To redo it, launch a new AETHER-TASK.'))
  assert.doesNotMatch(result.text, /reopen/i)
  assert.doesNotMatch(result.text, /Judge it:/)

  const other = world(t, { edits: false, owns: [], tests: null })
  const red = await dr.runTask({ id: 't1', cwd: other.repo.dir, dataDir: other.dataDir }, { runChain: async () => ({ ok: true, status: 'ok', text: 'the answer', attribution: 'a', changed: ['src/a.js'], attempts: [], journaled: true }) })
  assert.equal(red.checks.ok, false)
  assert.match(red.text, /Judge it: aether-delegate verdict --task t1 --verdict approve\|fix\|infeasible/)
  assert.doesNotMatch(red.text, /Closed by the system/)
})

test('a read-only delegate that touched the copy comes back marked with the files it touched, never with an answer (R6)', async (t) => {
  const { repo, dataDir } = world(t, { edits: false, owns: [], tests: null })
  const chain = async () => ({ ok: false, status: 'violation', text: null, changed: ['src/a.js'], attempts: [], journaled: true })
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { runChain: chain })
  assert.deepEqual([result.ok, result.text, result.checks.ok, result.checks.outside], [false, null, false, ['src/a.js']])
})

// A run state the quota brake paused, as setupPausedRepo in tests/delegate-chain.test.js builds it: the run of this
// session is paused until an hour from now, so launchRefusal stops the run with the pause message.
function pauseRun(t, repo, dataDir, session = 's1') {
  const now = Date.now()
  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'sessions', `${session}.json`), JSON.stringify({ agent: 'aether:lead' }) + '\n')
  const runDir = path.join(repo.dir, '.aether', 'autonomy', 'auto-20261021-120000-abcd')
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({
    id: 'auto-20261021-120000-abcd',
    session,
    started: new Date(now - 60000).toISOString(),
    ended: null,
    outcome: null,
    ceilings: { hours: 4, usd: 50 },
    spend: [],
    quotaPauses: [{ kind: 'five_hour', percentUsed: 96, started: new Date(now - 1000).toISOString(), resetsAt: new Date(now + 3600000).toISOString(), resumeAt: new Date(now + 3720000).toISOString(), brakeOff: false }],
    brakeOff: false,
  }) + '\n')
}

test('a read-only run stopped by the quota pause ends paused, launches no pair, and logs no failed result (spec 043 R17)', async (t) => {
  const { repo, dataDir } = world(t, { edits: false, owns: [], tests: null })
  pauseRun(t, repo, dataDir)
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'paused')
  assert.match(result.reason, /quota brake/i)
  assert.equal(result.text, null)
  assert.deepEqual(log.readEntries(dataDir, { task: 't1' }).filter((e) => e.kind === 'result'), [], 'the pause is not a failed attempt: nothing for a verdict to judge')
  assert.equal(log.readEntries(dataDir, { task: 't1' }).filter((e) => e.kind === 'outcome').length, 0)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'results', 't1.json'), 'utf8')).status, 'paused')
  assert.deepEqual(await dr.wait({ id: 't1', dataDir, seconds: 0 }), { done: true, ok: false, status: 'paused', text: null, reason: result.reason })
})

test('an editing run stopped by the quota pause ends paused and starts no lane pair (spec 043 R17)', async (t) => {
  const { repo, dataDir } = world(t)
  pauseRun(t, repo, dataDir)
  let calls = 0
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async () => (calls += 1, { status: 'done' }) })
  assert.equal(calls, 0)
  assert.equal(result.ok, false)
  assert.equal(result.status, 'paused')
  assert.match(result.reason, /quota brake/i)
  assert.deepEqual(log.readEntries(dataDir, { task: 't1' }).filter((e) => e.kind === 'result'), [], 'the pause is not a failed attempt: the ladder does not climb')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'results', 't1.json'), 'utf8')).status, 'paused')
})

test('wait: not done while the delegate lives; its result once written; died when the pid is gone without one (R12)', async (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const runFile = path.join(dataDir, 'delegates', 'run', 't1.json')
  fs.mkdirSync(path.dirname(runFile), { recursive: true })
  fs.writeFileSync(runFile, JSON.stringify({ pid: process.pid, startedAt: 1 }))
  assert.deepEqual(await dr.wait({ id: 't1', dataDir, seconds: 0.3 }), { done: false })
  fs.mkdirSync(path.join(dataDir, 'delegates', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'delegates', 'results', 't1.json'), JSON.stringify({ ok: true, status: 'ok', text: 'branch' }))
  assert.deepEqual(await dr.wait({ id: 't1', dataDir, seconds: 0.3 }), { done: true, ok: true, status: 'ok', text: 'branch', reason: null })
  fs.rmSync(path.join(dataDir, 'delegates', 'results', 't1.json'))
  const died = await dr.wait({ id: 't1', dataDir, seconds: 0.3, alive: () => false })
  assert.deepEqual(died, { done: true, ok: false, status: 'died', text: null })
  assert.equal((await dr.wait({ id: 'never-started', dataDir, seconds: 0.1 })).status, 'unknown')
})

test('start launches the run as a detached process of its own and returns at once', async (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const launched = []
  const fakeSpawn = (command, args, options) => (launched.push({ command, args, options }), { pid: 4242, unref() { this.unrefed = true } })
  const out = dr.start({ id: 't1', cwd: dataDir, dataDir }, { spawn: fakeSpawn, binPath: BIN })
  assert.deepEqual(out, { started: true, id: 't1', pid: 4242 })
  assert.deepEqual(launched[0].args.slice(-3), ['run', '--id', 't1'])
  assert.equal(launched[0].options.detached, true)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'run', 't1.json'), 'utf8')).pid, 4242)
})

test('answer records what a delegate on Claude ended with, even an empty text, through the bin (R6)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  assert.deepEqual(dr.recordAnswer({ task: 't1', attempt: 2, text: 'found it', session: 's1', dataDir, now: () => 7 }), { recorded: true })
  assert.deepEqual(log.readEntries(dataDir, { task: 't1' }).map((e) => [e.kind, e.attempt, e.text, e.session, e.time]), [['answer', 2, 'found it', 's1', 7]])
  const env = { ...process.env, AETHER_DATA_DIR: dataDir }
  const out = spawnSync(process.execPath, [BIN, 'answer', '--session', 's1', '--task', 't1', '--attempt', '3', '--text', ''], { encoding: 'utf8', env })
  assert.deepEqual(JSON.parse(out.stdout.trim()), { recorded: true })
  const last = log.readEntries(dataDir, { task: 't1' }).at(-1)
  assert.deepEqual([last.kind, last.attempt, last.text], ['answer', 3, ''])
  assert.equal(spawnSync(process.execPath, [BIN, 'answer', '--task', 't1'], { encoding: 'utf8', env }).status, 1)
})

test('the bin: an unknown verb is an error, wait on an id never started says unknown, verdict needs its flags', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const env = { ...process.env, AETHER_DATA_DIR: dataDir }
  const bad = spawnSync(process.execPath, [BIN, 'bogus'], { encoding: 'utf8', env })
  assert.equal(bad.status, 1)
  assert.ok(JSON.parse(bad.stdout.trim()).error)
  const waited = spawnSync(process.execPath, [BIN, 'wait', '--id', 'nope', '--seconds', '1'], { encoding: 'utf8', env })
  assert.equal(JSON.parse(waited.stdout.trim()).status, 'unknown')
  assert.equal(spawnSync(process.execPath, [BIN, 'verdict', '--task', 'x'], { encoding: 'utf8', env }).status, 1)
})

test('previous work keeps text and patch from the latest attempt, including missing patches (issue 144)', (t) => {
  const dir = tempDir(t)
  const patch = path.join(dir, 'old.patch')
  fs.writeFileSync(patch, 'old')
  const entries = [{ kind: 'result', patch }, { kind: 'answer', text: 'Claude work' }]
  assert.deepEqual(log.previousWork(entries), { text: 'Claude work', patch: null })
  const latest = path.join(dir, 'latest.patch')
  fs.writeFileSync(latest, 'latest')
  entries.push({ kind: 'result', patch: latest })
  assert.equal(log.previousWork(entries).patch, latest)
  assert.match(log.previousWork(entries).text, /latest\.patch/)
  entries.push({ kind: 'result', patch: path.join(dir, 'missing.patch') })
  assert.equal(log.previousWork(entries).patch, null)
  assert.match(log.previousWork(entries).text, /missing\.patch/)
})

test('wait isolates results for sessions with the same task id (issue 148)', async (t) => {
  const dataDir = tempDir(t)
  const dir = path.join(dataDir, 'delegates', 'results')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '2-s1--t1.json'), JSON.stringify({ ok: true, status: 'ok', text: 'one' }))
  fs.writeFileSync(path.join(dir, '2-s2--t1.json'), JSON.stringify({ ok: true, status: 'ok', text: 'two' }))
  assert.equal((await dr.wait({ id: 't1', session: 's1', dataDir, seconds: 0 })).text, 'one')
  assert.equal((await dr.wait({ id: 't1', session: 's2', dataDir, seconds: 0 })).text, 'two')
})

test('two sessions run and wait for their own external attempt (issue 148)', async (t) => {
  const dataDir = tempDir(t)
  const dir = path.join(dataDir, 'delegates', 'external')
  fs.mkdirSync(dir, { recursive: true })
  for (const session of ['s1', 's2']) {
    fs.writeFileSync(path.join(dir, `${session.length}-${session}--t1.json`), JSON.stringify({ session, attempt: 1, edits: false, task: {}, owns: [] }))
  }
  const runChain = async ({ session }) => ({ ok: true, status: 'ok', text: `answer ${session}`, attribution: '', attempts: [] })
  await Promise.all(['s1', 's2'].map((session) => dr.runTask({ id: 't1', session, cwd: dataDir, dataDir }, { runChain })))
  for (const session of ['s1', 's2']) {
    assert.match((await dr.wait({ id: 't1', session, dataDir, seconds: 0 })).text, new RegExp(`answer ${session}`))
  }
})

test('a correction never carries an older lane patch past Claude work or a missing latest patch (issue 144)', async (t) => {
  const dataDir = tempDir(t)
  const patch = path.join(dataDir, 'old.patch')
  fs.writeFileSync(patch, 'old')
  const external = path.join(dataDir, 'delegates', 'external', '2-s1--t1.json')
  fs.mkdirSync(path.dirname(external), { recursive: true })
  fs.writeFileSync(external, JSON.stringify({ session: 's1', attempt: 3, edits: true, carry: true, owns: [], step: 'haiku-high' }))
  fs.copyFileSync(external, path.join(path.dirname(external), 't1.json')) // An in-flight legacy launch has the same description.
  log.appendEntry(dataDir, { kind: 'result', session: 's1', task: 't1', attempt: 1, patch })
  log.appendEntry(dataDir, { kind: 'answer', session: 's1', task: 't1', attempt: 2, text: 'Claude work' })
  const seen = []
  const run = () => dr.runTask({ id: 't1', session: 's1', cwd: dataDir, dataDir }, {
    delegateCommand: async (_cwd, flags) => { seen.push(flags); return { status: 'no-candidate' } },
  })
  await run()
  assert.equal(seen[0].carry, undefined)
  log.appendEntry(dataDir, { kind: 'result', session: 's1', task: 't1', attempt: 3, patch: path.join(dataDir, 'missing.patch') })
  await run()
  assert.equal(seen[1].carry, undefined)
})

test('session file keys cannot collide and reject unsafe identifiers (issue 148)', () => {
  assert.notEqual(log.fileKey('a--b', 'c'), log.fileKey('a', 'b--c'))
  for (const value of ['../outside', '', 'bad/session']) assert.throws(() => log.fileKey(value, 't1'))
})

test('a session ignores an unscoped legacy result without crashing (issue 148)', async (t) => {
  const dataDir = tempDir(t)
  const dir = path.join(dataDir, 'delegates', 'results')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 't1.json'), JSON.stringify({ ok: true, text: 'another session' }))
  assert.equal((await dr.wait({ id: 't1', session: 's1', dataDir, seconds: 0 })).status, 'unknown')
})

// ---- the commit the branch was built on (issue 178) ----

// An external file as `begin` wrote it at launch, but the Lead committed before the lane command
// harvested: the unit branch was built on the harvest commit, and the lane reports that older base.
function staleWorld(t) {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const launch = repo.git('rev-parse', 'HEAD')
  fs.writeFileSync(path.join(repo.dir, 'lead.txt'), 'lead\n')
  repo.git('add', 'lead.txt')
  repo.git('commit', '-q', '-m', 'lead commits between launch and harvest')
  const harvest = repo.git('rev-parse', 'HEAD')
  repo.git('switch', '-q', '-c', 'aether/stale/task-1')
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'new.js'), 'hello\n')
  repo.git('add', 'src/new.js')
  repo.git('commit', '-q', '-m', 'delegate work')
  const head = repo.git('rev-parse', 'HEAD')
  const brief = path.join(dataDir, 'delegates', 'briefs', 't1-1.md')
  fs.mkdirSync(path.dirname(brief), { recursive: true })
  fs.writeFileSync(brief, 'Write src/new.js.')
  const file = path.join(dataDir, 'delegates', 'external', 't1.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ id: 't1', session: 's1', cwd: repo.dir, attempt: 1, step: 'haiku', effort: 'high', launchKind: 'first', edits: true, owns: ['src/**'], tests: null, brief, findings: null, carry: null, pin: null, base: launch, harness: 'grok', rung: { model: 'grok-4.7', effort: 'high', group: 'grok' }, task: { description: 'd', prompt: 'P' }, alternates: [], timeoutMs: 570000 }))
  const done = { status: 'done', id: 'run1', run: 'run1', branch: 'aether/stale/task-1', worktree: repo.dir, head, base: launch, pair: PAIR, summary: 'wrote it', tests: null, review: null, merge: 'aether-wt merge run1 task-1' }
  return { repo, dataDir, launch, harvest, head, done }
}

test('issue 178: the checks of an editing delegate use the commit its branch was built on, and the result records it', async (t) => {
  const { dataDir, launch, harvest, done } = staleWorld(t)
  const result = await dr.runTask({ id: 't1', cwd: dataDir, dataDir }, { delegateCommand: async () => done })
  assert.equal(result.ok, true)
  assert.equal(result.checks.ok, true, JSON.stringify(result.checks))
  const written = log.readEntries(dataDir, { task: 't1' }).find((e) => e.kind === 'result')
  assert.equal(written.checkBase, harvest, 'the result records the commit the branch was built on')
  assert.match(result.text, new RegExp(`from base ${launch}, checked against ${harvest}`), 'the text names both commits')
})

// The unit branch was created at the launch base and reset to the harvest commit after it was
// created: with no reflog entry at the fork, the checks still use the harvest commit.
function resetWorld(t) {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const launch = repo.git('rev-parse', 'HEAD')
  repo.git('switch', '-q', '-c', 'aether/reset/task-1')
  repo.git('switch', '-q', 'feature/x')
  fs.writeFileSync(path.join(repo.dir, 'lead.txt'), 'lead\n')
  repo.git('add', 'lead.txt')
  repo.git('commit', '-q', '-m', 'lead commits between launch and harvest')
  const harvest = repo.git('rev-parse', 'HEAD')
  repo.git('switch', '-q', 'aether/reset/task-1')
  repo.git('reset', '-q', '--hard', harvest)
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'new.js'), 'hello\n')
  repo.git('add', 'src/new.js')
  repo.git('commit', '-q', '-m', 'delegate work')
  const head = repo.git('rev-parse', 'HEAD')
  const brief = path.join(dataDir, 'delegates', 'briefs', 't1-1.md')
  fs.mkdirSync(path.dirname(brief), { recursive: true })
  fs.writeFileSync(brief, 'Write src/new.js.')
  const file = path.join(dataDir, 'delegates', 'external', 't1.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ id: 't1', session: 's1', cwd: repo.dir, attempt: 1, step: 'haiku', effort: 'high', launchKind: 'first', edits: true, owns: ['src/**'], tests: null, brief, findings: null, carry: null, pin: null, base: launch, harness: 'grok', rung: { model: 'grok-4.7', effort: 'high', group: 'grok' }, task: { description: 'd', prompt: 'P' }, alternates: [], timeoutMs: 570000 }))
  const done = { status: 'done', id: 'run1', run: 'run1', branch: 'aether/reset/task-1', worktree: repo.dir, head, base: launch, pair: PAIR, summary: 'wrote it', tests: null, review: null, merge: 'aether-wt merge run1 task-1' }
  return { repo, dataDir, launch, harvest, head, done }
}

test('issue 178: a unit branch reset to the harvest commit after creation is checked against it', async (t) => {
  const { dataDir, launch, harvest, done } = resetWorld(t)
  const result = await dr.runTask({ id: 't1', cwd: dataDir, dataDir }, { delegateCommand: async () => done })
  assert.equal(result.ok, true)
  assert.equal(result.checks.ok, true, JSON.stringify(result.checks))
  const written = log.readEntries(dataDir, { task: 't1' }).find((e) => e.kind === 'result')
  assert.equal(written.checkBase, harvest, 'the result records the commit the branch was built on')
  assert.match(result.text, new RegExp(`from base ${launch}, checked against ${harvest}`), 'the text names both commits')
})

test('issue 178: a file the delegate really changed outside Owns still fails, naming only that file', async (t) => {
  const { repo, dataDir, done } = staleWorld(t)
  fs.writeFileSync(path.join(repo.dir, 'notes.txt'), 'outside owns\n')
  const result = await dr.runTask({ id: 't1', cwd: dataDir, dataDir }, { delegateCommand: async () => done })
  assert.equal(result.checks.ok, false)
  assert.deepEqual(result.checks.outside, ['notes.txt'])
  assert.match(result.text, /notes\.txt/)
  assert.doesNotMatch(result.text, /lead\.txt/, 'the Lead commit between launch and harvest is not charged')
})

test('start clears only its session result and forwards the session to run (issue 148)', (t) => {
  const dataDir = tempDir(t)
  const results = path.join(dataDir, 'delegates', 'results')
  fs.mkdirSync(results, { recursive: true })
  for (const session of ['s1', 's2']) fs.writeFileSync(path.join(results, `${log.fileKey(session, 't1')}.json`), '{}')
  const calls = []
  dr.start({ id: 't1', session: 's1', cwd: dataDir, dataDir }, {
    spawn: (_command, args) => { calls.push(args); return { pid: 4242, unref() {} } },
  })
  assert.deepEqual(calls[0].slice(-5), ['run', '--id', 't1', '--session', 's1'])
  assert.equal(fs.existsSync(path.join(results, '2-s1--t1.json')), false)
  assert.equal(fs.existsSync(path.join(results, '2-s2--t1.json')), true)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'delegates', 'run', '2-s1--t1.json'), 'utf8')).pid, 4242)
})

test('answer writes an ended line, with no text, for an attempt that edits, and an answer line for a read-only one (spec 031, C1)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const launch = (task, attempt, edits) => ({ kind: 'launch', time: 1, session: 's1', task, step: 'haiku', attempt, launchKind: 'first', description: 'd', effort: 'high', edits })
  log.appendEntry(dataDir, launch('e1', 1, true))
  log.appendEntry(dataDir, launch('r1', 1, false))
  assert.deepEqual(dr.recordAnswer({ task: 'e1', attempt: 1, text: 'done, in the worktree', session: 's1', dataDir, now: () => 7 }), { recorded: true })
  assert.deepEqual(dr.recordAnswer({ task: 'r1', attempt: 1, text: 'found it', session: 's1', dataDir, now: () => 8 }), { recorded: true })
  assert.deepEqual(log.readEntries(dataDir, { task: 'e1' }).at(-1), { kind: 'ended', time: 7, session: 's1', task: 'e1', attempt: 1 })
  const r1 = log.readEntries(dataDir, { task: 'r1' })
  assert.deepEqual(r1.at(-2), { kind: 'answer', time: 8, session: 's1', task: 'r1', attempt: 1, text: 'found it' })
  assert.deepEqual([r1.at(-1).kind, r1.at(-1).verdict, r1.at(-1).auto, r1.at(-1).reason],
    ['verdict', 'approved', true, 'closed by the system: the read-only checks passed'],
    'a read-only answer with a clean checkout is closed by the system (spec 044, R23)')
})

test('the kind of line follows the latest launch of that attempt in that session; with no launch it is an answer (spec 031, C1)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const launch = (time, session, attempt, launchKind, edits) => ({ kind: 'launch', time, session, task: 't1', step: 'haiku', attempt, launchKind, description: 'd', effort: 'high', edits })
  log.appendEntry(dataDir, launch(1, 's1', 1, 'first', true))
  log.appendEntry(dataDir, launch(2, 's1', 2, 'fix', false))
  log.appendEntry(dataDir, launch(3, 's2', 1, 'first', false))
  for (const [session, attempt, time] of [['s1', 1, 10], ['s1', 2, 11], ['s2', 1, 12], ['s1', 9, 13]]) {
    dr.recordAnswer({ task: 't1', attempt, text: 'x', session, dataDir, now: () => time })
  }
  const written = log.readEntries(dataDir, { task: 't1' }).filter((e) => e.kind !== 'launch').map((e) => [e.session, e.attempt, e.kind])
  assert.deepEqual(written, [['s1', 1, 'ended'], ['s1', 2, 'answer'], ['s1', 2, 'verdict'], ['s2', 1, 'answer'], ['s2', 1, 'verdict'], ['s1', 9, 'answer']],
    'a read-only answer with a clean checkout is closed by the system; an answer with no launch stays pending (spec 044, R23)')
  for (const entry of log.readEntries(dataDir, { task: 't1' }).filter((e) => e.kind === 'verdict')) {
    assert.deepEqual([entry.verdict, entry.auto], ['approved', true])
  }
})

test('the bin: answer on an attempt that edits writes an ended line and says it recorded (spec 031, C1)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  log.appendEntry(dataDir, { kind: 'launch', time: 1, session: 's1', task: 'e1', step: 'haiku', attempt: 1, launchKind: 'first', description: 'd', effort: 'high', edits: true })
  const env = { ...process.env, AETHER_DATA_DIR: dataDir }
  const out = spawnSync(process.execPath, [BIN, 'answer', '--session', 's1', '--task', 'e1', '--attempt', '1', '--text', 'done'], { encoding: 'utf8', env })
  assert.deepEqual(JSON.parse(out.stdout.trim()), { recorded: true })
  const last = log.readEntries(dataDir, { task: 'e1' }).at(-1)
  assert.deepEqual([last.kind, last.attempt, Object.hasOwn(last, 'text')], ['ended', 1, false])
})


test('answer uses the last matching launch and a null session searches across sessions', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const launch = (session, edits) => ({ kind: 'launch', time: 1, session, task: 't1', attempt: 1, step: 'haiku', edits })
  log.appendEntry(dataDir, launch('s1', false))
  log.appendEntry(dataDir, launch('s1', true))
  dr.recordAnswer({ task: 't1', attempt: 1, text: 'private', session: 's1', dataDir, now: () => 2 })
  assert.equal(log.readEntries(dataDir).at(-1).kind, 'ended')
  log.appendEntry(dataDir, launch('s2', false))
  dr.recordAnswer({ task: 't1', attempt: 1, text: 'public', session: null, dataDir, now: () => 3 })
  assert.deepEqual(log.readEntries(dataDir).at(-1), { kind: 'answer', time: 3, session: null, task: 't1', attempt: 1, text: 'public' })
  log.appendEntry(dataDir, launch('s2', true))
  dr.recordAnswer({ task: 't1', attempt: 1, text: 'private', session: null, dataDir, now: () => 4 })
  assert.deepEqual(log.readEntries(dataDir).at(-1), { kind: 'ended', time: 4, session: null, task: 't1', attempt: 1 })
})

function waitForFileSync(file, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${file}`)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
  }
}

function isAlive(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    const state = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0]
    return state !== 'Z'
  } catch {
    return false
  }
}

function spawnSleeper(t, { ignoreTerm = false, grandchildPidFile = null, readyFile = null } = {}) {
  const script = `
    const fs = require('node:fs');
    const { spawn } = require('node:child_process');
    let child = null;
    if (${JSON.stringify(grandchildPidFile)}) {
      child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 60000)'], { detached: true, stdio: 'ignore' });
      child.unref();
      fs.writeFileSync(${JSON.stringify(grandchildPidFile)}, String(child.pid));
    }
    if (${JSON.stringify(ignoreTerm)}) {
      process.on('SIGTERM', () => {});
    } else {
      process.on('SIGTERM', () => {
        if (child) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
        process.exit(0);
      });
    }
    if (${JSON.stringify(readyFile)}) fs.writeFileSync(${JSON.stringify(readyFile)}, 'ready');
    setInterval(() => {}, 60000);
  `
  const proc = spawn(process.execPath, ['-e', script], { detached: true, stdio: 'ignore' })
  proc.unref()
  t.after(() => {
    try { process.kill(-proc.pid, 'SIGKILL') } catch {}
    if (grandchildPidFile && fs.existsSync(grandchildPidFile)) {
      const gpid = Number(fs.readFileSync(grandchildPidFile, 'utf8'))
      if (gpid > 0) { try { process.kill(-gpid, 'SIGKILL') } catch {} }
    }
  })
  if (readyFile) waitForFileSync(readyFile)
  return proc.pid
}

test('stopTask sends SIGTERM to a verified run process, its grandchild exits, and wait reports died', async (t) => {
  const dataDir = tempDir(t, 'aether-stop-data-')
  const grandFile = path.join(dataDir, 'grand.pid')
  const readyFile = path.join(dataDir, 'ready')
  const pid = spawnSleeper(t, { grandchildPidFile: grandFile, readyFile })
  const grandPid = Number(fs.readFileSync(grandFile, 'utf8'))
  const file = path.join(dataDir, 'delegates', 'run', `${log.fileKey('s1', 't1')}.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ pid, startedAt: Date.now() }))

  const res = dr.stopTask(dataDir, { id: 't1', session: 's1' }, { graceMs: 5000 })
  assert.equal(res.stopped, true)
  assert.equal(res.pid, pid)
  assert.equal(isAlive(pid), false)
  assert.equal(isAlive(grandPid), false)

  const waited = await dr.wait({ id: 't1', session: 's1', dataDir, seconds: 1, alive: isAlive })
  assert.deepEqual(waited, { done: true, ok: false, status: 'died', text: null })
})

test('stopTask sends SIGKILL to the process group after graceMs when SIGTERM is ignored', (t) => {
  const dataDir = tempDir(t, 'aether-stop-kill-')
  const readyFile = path.join(dataDir, 'ready')
  const pid = spawnSleeper(t, { ignoreTerm: true, readyFile })
  const file = path.join(dataDir, 'delegates', 'run', `${log.fileKey('s1', 't2')}.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ pid, startedAt: Date.now() }))

  const res = dr.stopTask(dataDir, { id: 't2', session: 's1' }, { graceMs: 150 })
  assert.equal(res.stopped, true)
  // Give the OS a moment to tear down after SIGKILL.
  const deadline = Date.now() + 1000
  while (isAlive(pid) && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
  assert.equal(isAlive(pid), false)
})

test('stopTask returns stopped:false for missing file, dead pid, or reused pid (unverified)', (t) => {
  const dataDir = tempDir(t, 'aether-stop-edge-')
  assert.deepEqual(dr.stopTask(dataDir, { id: 'missing', session: 's1' }), { stopped: false })

  // Dead pid
  const deadFile = path.join(dataDir, 'delegates', 'run', `${log.fileKey('s1', 'dead')}.json`)
  fs.mkdirSync(path.dirname(deadFile), { recursive: true })
  fs.writeFileSync(deadFile, JSON.stringify({ pid: 99999999, startedAt: Date.now() }))
  assert.equal(dr.stopTask(dataDir, { id: 'dead', session: 's1' }).stopped, false)

  // Reused pid: process started now, but run file claims startedAt was a day ago.
  const readyFile = path.join(dataDir, 'ready')
  const pid = spawnSleeper(t, { readyFile })
  const reusedFile = path.join(dataDir, 'delegates', 'run', `${log.fileKey('s1', 'reused')}.json`)
  fs.writeFileSync(reusedFile, JSON.stringify({ pid, startedAt: Date.now() - 24 * 3600 * 1000 }))
  const res = dr.stopTask(dataDir, { id: 'reused', session: 's1' })
  assert.equal(res.stopped, false)
  assert.equal(res.reason, 'unverified')
  assert.equal(isAlive(pid), true)
})

test('stopAll stops only runs belonging to the named sessions, and nothing when sessions is empty', (t) => {
  const dataDir = tempDir(t, 'aether-stop-all-')
  fs.mkdirSync(path.join(dataDir, 'delegates', 'run'), { recursive: true })
  const pidA1 = spawnSleeper(t, { readyFile: path.join(dataDir, 'rA1') })
  const pidA2 = spawnSleeper(t, { readyFile: path.join(dataDir, 'rA2') })
  const pidB1 = spawnSleeper(t, { readyFile: path.join(dataDir, 'rB1') })
  const now = Date.now()
  fs.writeFileSync(path.join(dataDir, 'delegates', 'run', `${log.fileKey('A', 't1')}.json`), JSON.stringify({ pid: pidA1, startedAt: now }))
  fs.writeFileSync(path.join(dataDir, 'delegates', 'run', `${log.fileKey('A', 't2')}.json`), JSON.stringify({ pid: pidA2, startedAt: now }))
  fs.writeFileSync(path.join(dataDir, 'delegates', 'run', `${log.fileKey('B', 't1')}.json`), JSON.stringify({ pid: pidB1, startedAt: now }))

  assert.deepEqual(dr.stopAll(dataDir, { sessions: [] }), { stopped: 0, skipped: [] })
  assert.equal(isAlive(pidA1), true)

  const res = dr.stopAll(dataDir, { sessions: ['A'] }, { graceMs: 1000 })
  assert.equal(res.stopped, 2)
  assert.deepEqual(res.skipped, [])
  assert.equal(isAlive(pidA1), false)
  assert.equal(isAlive(pidA2), false)
  assert.equal(isAlive(pidB1), true)
})
