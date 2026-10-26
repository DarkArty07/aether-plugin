'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
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
  const { repo, dataDir, done } = world(t)
  const seen = []
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { delegateCommand: async (cwd, flags) => (seen.push({ cwd, flags }), done) })
  assert.equal(seen.length, 1)
  assert.deepEqual([seen[0].flags.model, seen[0].flags.effort, seen[0].flags.owns, seen[0].flags.tests, seen[0].flags.session], ['haiku', 'high', 'src/**', 'npm test', 's1'])
  assert.equal(seen[0].flags.pair, undefined)
  assert.equal(result.ok, true)
  for (const part of ['aether/run1/task-1', 'ready', 'aether-wt merge run1 task-1', 'aether-delegate verdict --task t1']) assert.ok(result.text.includes(part), part)
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

test('a read-only delegate that touched the copy comes back marked with the files it touched, never with an answer (R6)', async (t) => {
  const { repo, dataDir } = world(t, { edits: false, owns: [], tests: null })
  const chain = async () => ({ ok: false, status: 'violation', text: null, changed: ['src/a.js'], attempts: [], journaled: true })
  const result = await dr.runTask({ id: 't1', cwd: repo.dir, dataDir }, { runChain: chain })
  assert.deepEqual([result.ok, result.text, result.checks.ok, result.checks.outside], [false, null, false, ['src/a.js']])
})

test('wait: not done while the delegate lives; its result once written; died when the pid is gone without one (R12)', async (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const runFile = path.join(dataDir, 'delegates', 'run', 't1.json')
  fs.mkdirSync(path.dirname(runFile), { recursive: true })
  fs.writeFileSync(runFile, JSON.stringify({ pid: process.pid, startedAt: 1 }))
  assert.deepEqual(await dr.wait({ id: 't1', dataDir, seconds: 0.3 }), { done: false })
  fs.mkdirSync(path.join(dataDir, 'delegates', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'delegates', 'results', 't1.json'), JSON.stringify({ ok: true, status: 'ok', text: 'branch' }))
  assert.deepEqual(await dr.wait({ id: 't1', dataDir, seconds: 0.3 }), { done: true, ok: true, status: 'ok', text: 'branch' })
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
