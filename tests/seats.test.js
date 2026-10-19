'use strict'

// The design seats: who takes the Judge, the Writer and the Examiner (chooseSeat), and a round on the
// fake agy through `aether-lane seat`, judged from git and the answer's schema.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { makeRepo } = require('./helpers.js')
const { LANE_BIN, laneEnv, agyTurns, argAfter, git } = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const seats = require('../plugins/aether/lib/seats.js')

const FEATURE = 'specs/001-demo'
const shipped = () => lanes.loadConfig(lanes.CONFIG_FILE)
const fine = { windows: { '5h': { remaining: 0.9, resetsAt: 'a' }, weekly: { remaining: 0.9, resetsAt: 'b' } } }
const choose = (options) =>
  seats.chooseSeat(shipped(), { enabled: ['agy'], installed: () => true, quota: () => fine, ...options })

test('chooseSeat takes the first external model of the choice, and gives the seat to the native agent otherwise', () => {
  const judge = choose({ choice: 'balanced', seat: 'judge' })
  assert.deepEqual(judge.external, {
    harness: 'agy',
    model: 'gemini-4-argon',
    group: 'argon',
    effort: 'high',
    level: 'high',
    timeoutSeconds: 1200,
    quotaBefore: fine,
  })
  assert.equal(choose({ choice: 'robust', seat: 'writer' }).external.level, 'high', 'the Writer runs at xhigh, which agy names high')
  assert.equal(choose({ choice: 'robust', seat: 'writer' }).external.timeoutSeconds, 2700)
  assert.deepEqual(choose({ choice: 'balanced', seat: 'writer' }), { native: seats.NATIVE.writer, tried: [] })
  assert.deepEqual(choose({ choice: 'native', seat: 'judge' }), { native: seats.NATIVE.judge, tried: [] })
  assert.deepEqual(choose({ choice: 'native', seat: 'examiner' }), { off: true, tried: [] })
  assert.deepEqual(choose({ choice: 'robust', seat: 'examiner' }), { native: seats.NATIVE.examiner, tried: [] })
})

test('chooseSeat passes over a model whose harness is off, not installed or out of quota, and the author', () => {
  const passed = (options) => choose({ choice: 'balanced', seat: 'judge', ...options }).tried
  assert.deepEqual(passed({ enabled: ['codex'] }), [{ model: 'agy/gemini-4-argon', reason: 'harness-off' }])
  assert.deepEqual(passed({ installed: () => false }), [{ model: 'agy/gemini-4-argon', reason: 'not-installed' }])
  assert.deepEqual(passed({ quota: () => ({ windows: { '5h': { remaining: 0.01, resetsAt: 'a' } } }) }), [{ model: 'agy/gemini-4-argon', reason: 'quota' }])
  const unreadable = () => {
    throw new Error('agy /usage failed')
  }
  assert.deepEqual(passed({ quota: unreadable }), [{ model: 'agy/gemini-4-argon', reason: 'quota-unreadable' }])
  for (const author of ['gemini-4-argon', 'agy/gemini-4-argon']) {
    const chosen = choose({ choice: 'balanced', seat: 'judge', author })
    assert.deepEqual(chosen.tried, [{ model: 'agy/gemini-4-argon', reason: 'author' }], author)
    assert.equal(chosen.native.agent, 'aether:judge')
  }
})

test("chooseSeat marks a native agent of the author's own model, the only seat left", () => {
  const chosen = choose({ choice: 'balanced', seat: 'judge', author: 'opus', enabled: [] })
  assert.equal(chosen.native.sameModelAsAuthor, true)
  assert.equal(choose({ choice: 'balanced', seat: 'judge', author: 'claude-sonnet-5-5', enabled: [] }).native.sameModelAsAuthor, undefined)
  assert.equal(seats.authorModel('sonnet'), 'claude-sonnet-5-5')
  assert.equal(seats.authorModel('agy/claude-opus-5-5'), 'claude-opus-5-5')
  assert.equal(seats.authorModel(''), null)
})

// A repository with a committed spec in specs/001-demo.
function seatRepo(t) {
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(repo.dir, FEATURE), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, FEATURE, 'spec.md'), '# Demo\n\n## Criteria\n\n- C1: it works.\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'spec')
  return repo
}

// Runs `aether-lane seat` with the message on stdin.
function seat(cwd, args, env, input = '') {
  const base = { ...process.env }
  for (const name of ['AETHER_SEATS', 'AETHER_LANE_HARNESSES', 'AETHER_LANES', 'CLAUDE_ENV_FILE']) delete base[name]
  const r = spawnSync(process.execPath, [LANE_BIN, 'seat', ...args], { cwd, input, encoding: 'utf8', env: { ...base, ...env } })
  let json = null
  try {
    json = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {
    json = null
  }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}

const JUDGE_ANSWER = {
  verdict: 'revise',
  findings: [{ severity: 'major', type: 'missing', title: 'Task 3 is too large', evidence: '`Owns: src/**`', fix: 'split it by module' }],
  openQuestions: ['Is the API public?'],
}

function seatLog(env) {
  return lanes.readLog(env.AETHER_DATA_DIR)
}

test('an external Judge reviews the commit in a disposable worktree, and its answer comes back in the native format', (t) => {
  const repo = seatRepo(t)
  const env = laneEnv(t)
  const before = repo.git('rev-parse', 'HEAD')
  const r = seat(repo.dir, ['judge', '--session', 's1', '--author', 'sonnet', '--feature', FEATURE], env, `Review ${FEATURE}/spec.md.\nFAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.seat, 'judge')
  assert.equal(r.json.harness, 'agy')
  assert.equal(r.json.model, 'gemini-4-argon')
  assert.deepEqual(r.json.result, JUDGE_ANSWER)
  assert.ok(
    r.json.answer.startsWith('## Verdict\nrevise\n## Findings\n1. [major] [missing] Task 3 is too large — `Owns: src/**` — split it by module\n## Open questions\n- Is the API public?\n- Lane: agy gemini-4-argon-high, seat '),
    r.json.answer,
  )
  assert.match(r.json.lane, /\$\d+\.\d{2} at list price; Gemini Models used 0\.0 % of the 5 h window and 0\.0 % of the weekly one$/)

  const [turn] = agyTurns(env)
  assert.equal(argAfter(turn.argv, '--model'), 'gemini-4-argon-high')
  assert.ok(turn.cwd.startsWith(path.join(repo.dir, '.aether', 'seats', 'judge-')), turn.cwd)
  assert.equal(turn.head, before)
  assert.equal(turn.marker, `seat/${r.json.id}`)
  const prompt = argAfter(turn.argv, '-p')
  assert.ok(prompt.includes('You are the Aether Judge, run by the agy CLI rather than Claude Code.'))
  assert.ok(prompt.includes(`Review ${FEATURE}/spec.md.`))

  assert.equal(fs.existsSync(turn.cwd), false, 'the worktree is removed')
  assert.equal(git(repo.dir, 'worktree', 'list').split('\n').length, 1)
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
  assert.equal(repo.git('status', '--porcelain'), '')
  const [entry] = seatLog(env).filter((e) => e.kind === 'call')
  assert.equal(entry.seat, 'judge')
  assert.equal(entry.run, null)
  assert.equal(entry.status, 'ok')
  assert.equal(entry.choice, 'balanced')
  assert.equal(entry.model, 'gemini-4-argon-high')
  assert.equal(entry.session, 's1')
})

test('a Judge that changes a file is undone and kept in a ref, and the native Judge takes the round', (t) => {
  const repo = seatRepo(t)
  const env = laneEnv(t)
  const input = `FAKE-AGY: write ${FEATURE}/spec.md rewritten\nFAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`
  const r = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE], env, input)
  assert.equal(r.status, 4, r.stdout + r.stderr)
  assert.equal(r.json.failed, 'violation')
  assert.deepEqual(r.json.files, [`${FEATURE}/spec.md`])
  assert.equal(r.json.native.agent, 'aether:judge')
  assert.equal(r.json.undone, true)
  assert.equal(r.json.backup, `refs/aether/seat/${r.json.id}/round-1`)
  assert.equal(repo.git('show', `${r.json.backup}:${FEATURE}/spec.md`), 'rewritten')
  assert.equal(fs.readFileSync(path.join(repo.dir, FEATURE, 'spec.md'), 'utf8'), '# Demo\n\n## Criteria\n\n- C1: it works.\n')
  assert.equal(repo.git('status', '--porcelain'), '')
  assert.equal(seatLog(env).find((e) => e.kind === 'call').status, 'violation')
})

test('a Judge whose answer breaks its schema, or that fails, gives the round to the native Judge', (t) => {
  const repo = seatRepo(t)
  const cases = [
    [`FAKE-AGY: answer ${JSON.stringify({ ...JUDGE_ANSWER, verdict: 'maybe' })}`, /^invalid answer: verdict must be one of approve, revise, reject$/],
    [`FAKE-AGY: answer ${JSON.stringify({ ...JUDGE_ANSWER, findings: Array(11).fill(JUDGE_ANSWER.findings[0]) })}`, /^invalid answer: more than 10 findings$/],
    ['FAKE-AGY: exit-error', /^exit 1: model not found/],
    ['FAKE-AGY: timeout', /^stderr: \[agy\] print timeout/],
  ]
  for (const [directive, detail] of cases) {
    const env = laneEnv(t)
    const r = seat(repo.dir, ['judge', '--session', 's1'], env, `${directive}\n`)
    assert.equal(r.status, 4, directive)
    assert.equal(r.json.failed, 'failed', directive)
    assert.match(r.json.detail, detail)
    assert.equal(r.json.native.agent, 'aether:judge')
  }
  assert.equal(repo.git('status', '--porcelain'), '')
})

test('nothing runs, and the native agent takes the seat, when the external one cannot', (t) => {
  const repo = seatRepo(t)
  const input = `FAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`
  const cases = [
    [{ AETHER_LANES: 'off' }, [], 'lanes-off'],
    [{ AETHER_SEATS: 'native' }, [], 'no-external'],
    [{ AETHER_LANE_HARNESSES: 'codex' }, [{ model: 'agy/gemini-4-argon', reason: 'harness-off' }], 'no-external'],
  ]
  for (const [extra, tried, reason] of cases) {
    const env = { ...laneEnv(t), ...extra }
    const r = seat(repo.dir, ['judge', '--session', 's1'], env, input)
    assert.equal(r.status, 3, JSON.stringify(extra))
    assert.equal(r.json.unavailable, reason)
    assert.deepEqual(r.json.tried, tried)
    assert.equal(r.json.native.agent, 'aether:judge')
    assert.deepEqual(agyTurns(env), [], 'no turn ran')
  }
  const author = seat(repo.dir, ['judge', '--session', 's1', '--author', 'gemini-4-argon'], laneEnv(t), input)
  assert.deepEqual(author.json.tried, [{ model: 'agy/gemini-4-argon', reason: 'author' }])
  const quota = laneEnv(t, { quota: { 'Gemini Models': [0.02, 0.9], 'Claude and GPT models': [0.9, 0.9] } })
  assert.deepEqual(seat(repo.dir, ['judge', '--session', 's1'], quota, input).json.tried, [{ model: 'agy/gemini-4-argon', reason: 'quota' }])

  fs.appendFileSync(path.join(repo.dir, FEATURE, 'spec.md'), 'more\n')
  const dirty = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE], laneEnv(t), input)
  assert.equal(dirty.status, 3)
  assert.equal(dirty.json.unavailable, 'uncommitted')
})

test('the examiner of the native choice is off, and no agent takes it', (t) => {
  const repo = seatRepo(t)
  const env = { ...laneEnv(t), AETHER_SEATS: 'native' }
  const r = seat(repo.dir, ['examiner', '--session', 's1', '--feature', FEATURE], env, 'exam\n')
  assert.equal(r.status, 3)
  assert.deepEqual(r.json, { unavailable: 'off', seat: 'examiner', choice: 'native', native: null, tried: [] })
  assert.deepEqual(
    seatLog(env).map((e) => [e.kind, e.seat, e.status]),
    [['seat', 'examiner', 'off']],
  )
})

test('the seat command refuses what it cannot run', (t) => {
  const repo = seatRepo(t)
  const env = laneEnv(t)
  const bad = [
    [['designer', '--session', 's1'], /^usage: aether-lane seat/],
    [['judge'], /--session is required/],
    [['writer', '--session', 's1'], /the writer needs --feature specs\/NNN-<topic>/],
    [['judge', '--session', 's1', '--feature', 'docs/x'], /--feature must be specs\/NNN-<topic>/],
    [['judge', '--session', 's1', 'extra'], /unexpected argument: extra/],
  ]
  for (const [args, pattern] of bad) {
    const r = seat(repo.dir, args, env)
    assert.equal(r.status, 1, args.join(' '))
    assert.match(r.json.error, pattern)
  }
  const empty = seat(repo.dir, ['judge', '--session', 's1'], env, '  \n')
  assert.equal(empty.status, 1)
  assert.match(empty.json.error, /the message is empty/)
})

test("aether-report --seats counts each seat's rounds, who answered, and why the native agent took the others", (t) => {
  const repo = seatRepo(t)
  const env = laneEnv(t)
  const ok = `FAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`
  assert.equal(seat(repo.dir, ['judge', '--session', 's1'], env, ok).status, 0)
  assert.equal(seat(repo.dir, ['judge', '--session', 's1'], env, 'FAKE-AGY: exit-error\n').status, 4)
  assert.equal(seat(repo.dir, ['judge', '--session', 's1'], { ...env, AETHER_SEATS: 'native' }, ok).status, 3)
  assert.equal(seat(repo.dir, ['examiner', '--session', 's1', '--feature', FEATURE], { ...env, AETHER_SEATS: 'native' }, ok).status, 3)
  assert.equal(seat(repo.dir, ['judge', '--session', 's2'], env, ok).status, 0)

  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-report'), '--seats', '--session', 's1'], {
    cwd: repo.dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const report = JSON.parse(r.stdout)
  assert.equal(report.rounds, 3)
  assert.equal(report.external, 1)
  assert.equal(report.externalShare, 1 / 3)
  assert.deepEqual(report.bySeat.judge, {
    rounds: 3,
    external: 1,
    native: 2,
    off: 0,
    reasons: { 'external failed': 1, 'no-external': 1 },
    models: { 'agy gemini-4-argon-high': { rounds: 2, ok: 1 } },
  })
  assert.equal(report.bySeat.examiner.off, 1)
  assert.equal(report.bySeat.examiner.rounds, 0)
  assert.equal(report.lanes.calls, 2)
  assert.equal(report.lanes.byRole.judge.calls, 2)
  assert.deepEqual(report.notes, [])
})

// ---- The Writer ----

const { task, specKitTasks } = require('./plan-fixtures.js')

const WRITER_ANSWER = {
  plan: `${FEATURE}/plan.md`,
  tasks: `${FEATURE}/tasks.md`,
  commit: 'abc123',
  check: '{"ok":true}',
  assumptions: ['Node 22'],
  questions: [],
}

// Files the fake Writer copies into its worktree: a plan, and a tasks.md that passes or fails aether-plan check.
function writerFiles(t, { valid = true } = {}) {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'aether-writer-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const plan = path.join(dir, 'plan.md')
  const tasks = path.join(dir, 'tasks.md')
  fs.writeFileSync(plan, '# Plan\n\n## Design\n\nOne task.\n')
  const body = valid ? specKitTasks([task(1)]) : specKitTasks([task(1), task(2, { owns: '`src/t1/**`' })])
  fs.writeFileSync(tasks, body)
  return { plan, tasks }
}

function writerInput(files, { extra = '' } = {}) {
  return [
    `Write the plan and the tasks of ${FEATURE}.`,
    `FAKE-AGY: copy ${files.plan} ${FEATURE}/plan.md`,
    `FAKE-AGY: copy ${files.tasks} ${FEATURE}/tasks.md`,
    extra,
    'FAKE-AGY: commit plan and tasks',
    `FAKE-AGY: answer ${JSON.stringify(WRITER_ANSWER)}`,
    '',
  ].join('\n')
}

test("an external Writer writes the plan and the tasks, and Aether checks and commits them in the Lead's checkout", (t) => {
  const repo = seatRepo(t)
  const env = { ...laneEnv(t), AETHER_SEATS: 'robust' }
  const files = writerFiles(t)
  const before = repo.git('rev-parse', 'HEAD')
  const r = seat(repo.dir, ['writer', '--session', 's1', '--author', 'sonnet', '--feature', FEATURE], env, writerInput(files))
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const head = repo.git('rev-parse', 'HEAD')
  assert.notEqual(head, before)
  assert.equal(repo.git('log', '-1', '--format=%s'), 'docs(specs): plan and tasks of 001-demo, by agy/gemini-4-argon')
  assert.equal(repo.git('show', '--name-only', '--format=', 'HEAD'), `${FEATURE}/plan.md\n${FEATURE}/tasks.md`)
  assert.equal(fs.readFileSync(path.join(repo.dir, FEATURE, 'tasks.md'), 'utf8'), fs.readFileSync(files.tasks, 'utf8'))
  assert.equal(repo.git('status', '--porcelain'), '')
  assert.equal(r.json.result.commit, head, 'the commit is the one in the Lead checkout, not the worktree')
  assert.ok(r.json.answer.startsWith(`## Plan and tasks\n- Plan: ${FEATURE}/plan.md\n- Tasks: ${FEATURE}/tasks.md\n- Commit: ${head}\n- aether-plan check: {"ok":true`), r.json.answer)
  assert.ok(r.json.answer.includes('## Assumptions\n- Node 22\n## Open questions\n- none\n- Lane: agy gemini-4-argon-high'))

  const prompt = argAfter(agyTurns(env)[0].argv, '-p')
  assert.ok(prompt.includes('You are the Aether Writer, run by the agy CLI rather than Claude Code.'))
  assert.ok(prompt.includes('## The skill aether:plan'))
  assert.ok(prompt.includes('## The skill aether:tasks'))
  assert.ok(prompt.includes(path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-plan')))
})

test('a Writer whose tasks fail aether-plan check, or that leaves none, gives the round back, and the checkout is as it was', (t) => {
  const repo = seatRepo(t)
  const env = { ...laneEnv(t), AETHER_SEATS: 'robust' }
  const before = repo.git('rev-parse', 'HEAD')
  const failing = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE], env, writerInput(writerFiles(t, { valid: false })))
  assert.equal(failing.status, 4, failing.stdout)
  assert.equal(failing.json.failed, 'failed')
  assert.match(failing.json.detail, /^aether-plan check failed: /)
  assert.equal(failing.json.native.agent, 'aether:writer')

  const none = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE], env, `FAKE-AGY: answer ${JSON.stringify(WRITER_ANSWER)}\n`)
  assert.equal(none.status, 4)
  assert.equal(none.json.detail, `the round left no ${FEATURE}/tasks.md`)

  const code = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE], env, writerInput(writerFiles(t), { extra: 'FAKE-AGY: write src/app.js code' }))
  assert.equal(code.status, 4)
  assert.equal(code.json.failed, 'violation')
  assert.deepEqual(code.json.files, ['src/app.js'])

  assert.equal(repo.git('rev-parse', 'HEAD'), before)
  assert.equal(repo.git('status', '--porcelain'), '')
  assert.equal(fs.existsSync(path.join(repo.dir, FEATURE, 'tasks.md')), false)
})

test('the balanced choice keeps the Writer native', (t) => {
  const repo = seatRepo(t)
  const r = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE], laneEnv(t), writerInput(writerFiles(t)))
  assert.equal(r.status, 3)
  assert.equal(r.json.unavailable, 'no-external')
  assert.deepEqual(r.json.native, seats.NATIVE.writer)
})

// ---- The quota a round used ----

test('windowUsed reads what a round used from a window agy held no reset time for while nothing was used', () => {
  const at = (remaining, resetsAt) => ({ windows: { '5h': { remaining, resetsAt } } })
  assert.equal(seats.windowUsed(at(0.9, '2026-10-16T04:00:00Z'), at(0.85, '2026-10-16T04:00:00Z'), '5h'), '5.0')
  // A full window: agy's reset time is the time of the read plus the window's length, so it moves forward.
  assert.equal(seats.windowUsed(at(1, '2026-10-16T04:38:00Z'), at(0.99, '2026-10-16T04:41:00Z'), '5h'), '1.0')
  assert.equal(seats.windowUsed(at(1, '2026-10-16T04:38:00Z'), at(1, '2026-10-16T04:50:00Z'), '5h'), '0.0')
  // A window that had been used, with another reset time, is another window.
  assert.equal(seats.windowUsed(at(0.97, '2026-10-21T03:35:00Z'), at(1, '2026-10-22T23:50:00Z'), '5h'), '?')
  // A full window whose reset time moved back, a time that is not one, and a missing window.
  assert.equal(seats.windowUsed(at(1, '2026-10-16T04:50:00Z'), at(0.99, '2026-10-16T04:38:00Z'), '5h'), '?')
  assert.equal(seats.windowUsed(at(1, null), at(0.99, '2026-10-16T04:38:00Z'), '5h'), '?')
  assert.equal(seats.windowUsed(null, at(0.9, 'x'), '5h'), '?')
})
