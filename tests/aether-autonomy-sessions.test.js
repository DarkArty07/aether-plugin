'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runBin, useDataDir, writePlan } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { A, B, C, QUOTE, OFF_QUOTE, human } = require('./run-session-fixture.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-autonomy')
const PLAN_BIN = path.join(PLUGIN, 'bin', 'aether-plan')
const WT_BIN = path.join(PLUGIN, 'bin', 'aether-wt')

// A project and a config directory with a transcript per session; cli(as, args) runs the bin as that session.
function setup(t) {
  useDataDir(t)
  const repo = makeRepo(t)
  const config = tempDir(t, 'aether-claude-')
  const folder = path.join(config, 'projects', '-repo')
  fs.mkdirSync(folder, { recursive: true })
  for (const id of [A, B, C]) {
    const lines = [human(QUOTE, '2026-11-16T09:50:00.000Z'), human(OFF_QUOTE, '2026-11-16T09:51:00.000Z')]
    fs.writeFileSync(path.join(folder, `${id}.jsonl`), lines.join('\n') + '\n')
  }
  const cli = (as, args, cwd = repo.dir) => runBin(BIN, args, cwd, { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: as })
  const start = (as) => {
    const r = cli(as, ['start', '--quote', QUOTE])
    assert.equal(r.status, 0, r.stdout + r.stderr)
    return r.json.started.id
  }
  return { repo, config, cli, start }
}

test('R1, R2: two sessions start a run each; a second start by the same session is refused with the text of today', (t) => {
  const { cli, start } = setup(t)
  const a = start(A)
  const b = start(B)
  assert.notEqual(a, b)
  const again = cli(A, ['start', '--quote', QUOTE])
  assert.equal(again.status, 1)
  assert.deepEqual(again.json, { error: `run ${a} is already open` })
})

test('R4: status, spend and end act on the run of the calling session, and status <id> and end <id> reach another', (t) => {
  const { cli, start } = setup(t)
  const a = start(A)
  const b = start(B)
  assert.equal(cli(B, ['status']).json.id, b)
  assert.equal(cli(B, ['spend', '3', '--source', 'seat/x']).json.usd.spent, 3)
  assert.equal(cli(A, ['status']).json.usd.spent, 0)
  assert.equal(cli(B, ['status', a]).json.id, a)
  const closed = cli(C, ['end', a, '--outcome', 'incomplete'])
  assert.equal(closed.status, 0, closed.stdout + closed.stderr)
  assert.equal(closed.json.ended.outcome, 'incomplete')
  assert.equal(cli(B, ['status']).json.id, b)
  assert.equal(cli(B, ['end', '--outcome', 'done']).json.ended.id, b)
})

test('R5b: a session with no run changes none and the message names the open run, its session and both ways out', (t) => {
  const { repo, cli, start } = setup(t)
  const a = start(A)
  const file = path.join(repo.dir, '.aether', 'autonomy', a, 'run.json')
  const before = fs.readFileSync(file, 'utf8')
  const wanted = [a, A, `aether-autonomy continue ${a}`, `aether-autonomy end ${a} --outcome incomplete`]
  for (const args of [['spend', '1', '--source', 's'], ['end', '--outcome', 'done'], ['extend', '--hours', '99', '--quote', QUOTE], ['brake-off', '--quote', OFF_QUOTE]]) {
    const r = cli(C, args)
    assert.equal(r.status, 1, args.join(' ') + r.stdout)
    assert.ok(wanted.every((piece) => r.json.error.includes(piece)), r.json.error)
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before)
})

test('R15: continue makes the run of a restarted session its own; it is refused with another run open and for a closed run', (t) => {
  const { cli, start } = setup(t)
  const a = start(A)
  const done = cli(C, ['continue', a])
  assert.equal(done.status, 0, done.stdout + done.stderr)
  assert.deepEqual([done.json.continued.id, done.json.continued.session, done.json.continued.from], [a, C, A])
  assert.equal(cli(C, ['status']).json.id, a)
  const b = start(B)
  const busy = cli(B, ['continue', a])
  assert.equal(busy.status, 1)
  assert.ok(busy.json.error.includes(b), busy.json.error)
  cli(C, ['end', '--outcome', 'done'])
  assert.equal(cli(B, ['continue', a]).status, 1)
  assert.equal(cli(B, ['continue']).status, 1)
})

test('R9, R14: a crossing pauses every run and a brake-off resumes only the run of the session that gives it', (t) => {
  const { cli, start } = setup(t)
  const a = start(A)
  start(B)
  const resetsAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString()
  const crossing = cli(A, ['brake-crossing', '--kind', 'five_hour', '--percent', '96', '--resets-at', resetsAt, '--threshold', '95', '--notify', 'sent'])
  assert.equal(crossing.status, 0, crossing.stdout + crossing.stderr)
  assert.equal(crossing.json.run, a)
  assert.equal(crossing.json.runs.length, 2)
  assert.deepEqual([cli(A, ['status']).json.stop, cli(B, ['status']).json.stop], ['quota', 'quota'])
  assert.equal(cli(A, ['brake-off', '--quote', OFF_QUOTE]).status, 0)
  assert.deepEqual([cli(A, ['status']).json.stop, cli(B, ['status']).json.stop], [null, 'quota'])
  const saved = cli(B, ['quota-brake'])
  assert.equal(saved.status, 0, saved.stdout + saved.stderr)
  assert.deepEqual(saved.json, { saved: [], recorded: false, pushed: [] })
})

test('R12: with one session the outputs have the keys of today, and the usage names the new forms', (t) => {
  const { cli, start } = setup(t)
  const r = cli(A, ['start', '--quote', QUOTE])
  assert.deepEqual(Object.keys(r.json), ['started'])
  assert.deepEqual(Object.keys(r.json.started).sort(), ['ceilings', 'diary', 'id', 'runFile'])
  assert.deepEqual(Object.keys(cli(A, ['status']).json).sort(), ['diary', 'hours', 'id', 'idle', 'idleMinutes', 'open', 'quota', 'session', 'started', 'stop', 'swarms', 'usd'])
  const usage = cli(A, ['nope']).json.error
  for (const form of ['status [<id>]', 'end [<id>] --outcome done|ceiling|incomplete', 'continue <id>']) assert.ok(usage.includes(form), form)
  void start
})

test('bad run id is a usage error and continue handles unchanged and missing session', (t) => {
  const { repo, cli, start } = setup(t)
  const usage = cli(A, ['nope']).json.error
  for (const args of [['status', 'bad-id'], ['end', 'bad-id', '--outcome', 'done'], ['continue', 'bad-id']]) {
    const bad = cli(A, args)
    assert.equal(bad.status, 1, args.join(' '))
    assert.equal(bad.json.error, usage)
  }
  const a = start(A)
  const same = cli(A, ['continue', a])
  assert.equal(same.status, 0, same.stdout + same.stderr)
  assert.equal(same.json.continued.unchanged, true)
  const noSession = runBin(BIN, ['continue', a], repo.dir, { CLAUDE_CODE_SESSION_ID: '' })
  assert.equal(noSession.status, 1)
  assert.match(noSession.json.error, /session id/i)
})

test('a run id or positional argument after index 0 is a usage error and closes no run', (t) => {
  const { cli, start } = setup(t)
  const a = start(A)
  const b = start(B)
  const usage = cli(A, ['nope']).json.error
  for (const [who, args] of [
    [A, ['end', '--outcome', 'incomplete', b]],
    [A, ['status', '--session', A, b]],
    [A, ['status', b, 'extra']],
    [A, ['end', b, 'extra', '--outcome', 'incomplete']],
    [C, ['continue', '--session', C, a]],
    [C, ['continue', a, 'extra']],
  ]) {
    const r = cli(who, args)
    assert.equal(r.status, 1, args.join(' '))
    assert.equal(r.json.error, usage, args.join(' '))
  }
  assert.equal(cli(A, ['status']).json.open, true)
  assert.equal(cli(B, ['status']).json.open, true)
  const closed = cli(A, ['end', b, '--outcome', 'incomplete'])
  assert.equal(closed.status, 0, closed.stdout + closed.stderr)
  assert.equal(closed.json.ended.id, b)
  assert.equal(cli(A, ['status']).json.open, true)
})

test('R14: quota-brake saves a swarm launched by session B after A started and records its saved units only in B', (t) => {
  const { repo, config, cli, start } = setup(t)
  const a = start(A)
  const b = start(B)
  const runFile = (id) => path.join(repo.dir, '.aether', 'autonomy', id, 'run.json')
  const setStarted = (id, msAgo) => {
    const state = JSON.parse(fs.readFileSync(runFile(id), 'utf8'))
    state.started = new Date(Date.now() - msAgo).toISOString()
    fs.writeFileSync(runFile(id), JSON.stringify(state))
  }
  setStarted(a, 120_000)
  setStarted(b, 60_000)

  const compiled = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, plan([task(1)]))], repo.dir, {
    CLAUDE_CONFIG_DIR: config,
    CLAUDE_CODE_SESSION_ID: B,
  })
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr)
  const swarmId = compiled.json.runId
  const ensured = runBin(WT_BIN, ['ensure', swarmId, 'task-1'], repo.dir)
  assert.equal(ensured.status, 0, ensured.stdout + ensured.stderr)
  const wip = path.join(ensured.json.path, 'src', 't1', 'wip.js')
  fs.mkdirSync(path.dirname(wip), { recursive: true })
  fs.writeFileSync(wip, 'wip\n')

  const resetsAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString()
  const crossing = cli(A, ['brake-crossing', '--kind', 'five_hour', '--percent', '96', '--resets-at', resetsAt, '--threshold', '95', '--notify', 'sent'])
  assert.equal(crossing.status, 0, crossing.stdout + crossing.stderr)

  const braked = cli(A, ['quota-brake'])
  assert.equal(braked.status, 0, braked.stdout + braked.stderr)
  assert.deepEqual(braked.json.saved, [swarmId])
  assert.equal(braked.json.recorded, true)

  const runA = JSON.parse(fs.readFileSync(runFile(a), 'utf8'))
  const runB = JSON.parse(fs.readFileSync(runFile(b), 'utf8'))
  const pauseA = runA.quotaPauses.at(-1)
  const pauseB = runB.quotaPauses.at(-1)
  assert.deepEqual(pauseA.savedUnits, [])
  assert.ok(Array.isArray(pauseB.savedUnits) && pauseB.savedUnits.some((u) => u.swarmRun === swarmId && u.task === 'task-1'))
})

test('quota-brake saves only swarms of runs paused by the brake, never a run whose brake is off', (t) => {
  const { repo, config, cli, start } = setup(t)
  const a = start(A)
  const b = start(B)
  const resetsAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString()
  assert.equal(cli(A, ['brake-crossing', '--kind', 'five_hour', '--percent', '96', '--resets-at', resetsAt, '--threshold', '95', '--notify', 'sent']).status, 0)
  assert.equal(cli(A, ['brake-off', '--quote', OFF_QUOTE]).status, 0)

  const compiledA = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, plan([task(1)]))], repo.dir, {
    CLAUDE_CONFIG_DIR: config,
    CLAUDE_CODE_SESSION_ID: A,
  })
  assert.equal(compiledA.status, 0, compiledA.stdout + compiledA.stderr)
  const swarmA = compiledA.json.runId
  const wtA = runBin(WT_BIN, ['ensure', swarmA, 'task-1'], repo.dir)
  assert.equal(wtA.status, 0, wtA.stdout + wtA.stderr)
  fs.mkdirSync(path.join(wtA.json.path, 'src', 't1'), { recursive: true })
  fs.writeFileSync(path.join(wtA.json.path, 'src', 't1', 'wip.js'), 'wip\n')

  const braked = cli(B, ['quota-brake'])
  assert.equal(braked.status, 0, braked.stdout + braked.stderr)
  assert.deepEqual(braked.json, { saved: [], recorded: false, pushed: [] })
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'runs', swarmA, 'saved.json')), false)
  void a
  void b
})
