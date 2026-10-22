'use strict'

// The design seats: who takes the Judge, the Writer and the Examiner (chooseSeat), and a round on the
// fake agy through `aether-lane seat`, judged from git and the answer's schema.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { makeRepo, tempDir } = require('./helpers.js')
const { LANE_BIN, laneEnv, agyTurns, argAfter, git } = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const seats = require('../plugins/aether/lib/seats.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

const { chooseSeat, NATIVE, seatCommand } = seats
const { pairs } = loadPairs()
const FEATURE = 'specs/001-demo'
const DAY = 86400000
const open = (days) => ({ usable: true, unknown: false, mark: null, resetsAt: new Date(Date.UTC(2026, 9, 20) + days * DAY).toISOString() })
const dry = { usable: false, unknown: false, mark: null, resetsAt: '2026-10-21T00:00:00.000Z' }
// Argon and Flash read the one «Gemini Models» window, so `g` is the view of both keys.
const world = (g = open(2), c = open(3)) => ({ agy: { installed: true, groups: { argon: g, flash: g, claude: c } } })
const config = { harnesses: { agy: { command: 'agy', waitSeconds: 540, timeouts: { implementer: 1, supervisor: 1, reviewer: 1, judge: 1200, writer: 2700, examiner: 1800 }, groups: {}, models: {} } } }
const choose = (seat, more = {}) => chooseSeat({ config, pairs, seat, harnesses: world(), ...more })
// What the fake agy's /usage reports so that Gemini's weekly window resets before the Claude and GPT one: Argon takes
// the Judge, as it does when the quota that renews first is Gemini's.
const geminiFirst = () => ({
  'Gemini Models': [0.9, 0.9, null, new Date(Date.now() + 2 * DAY).toISOString()],
  'Claude and GPT models': [0.9, 0.9, null, new Date(Date.now() + 3 * DAY).toISOString()],
})

test('the Judge asks the points of Opus high and the cheapest pair of the quota that renews first takes it', () => {
  const chosen = choose('judge')
  assert.equal(chosen.decision.requested, 53.6)
  assert.equal(chosen.external.pair.id, 'agy/gemini-4-argon@high')
  assert.deepEqual([chosen.external.harness, chosen.external.model, chosen.external.effort, chosen.external.level, chosen.external.timeoutSeconds], ['agy', 'gemini-4-argon', 'high', 'high', 1200])
  assert.equal(chosen.external.group, 'argon')
  assert.deepEqual(chosen.external.quotaBefore, open(2), 'the quota view of the pair group, for the lane line')
})

test('the Writer asks Sonnet high (46.8), and its external effort is the pair effort, never a translated one', () => {
  const chosen = choose('writer', { harnesses: world(dry, open(3)) })
  assert.equal(chosen.decision.requested, 46.8)
  assert.equal(chosen.external.effort, chosen.external.pair.effort)
  assert.equal(chosen.external.timeoutSeconds, 2700)
})

test('with every quota dry the native agent of the seat takes it; the Examiner has no off state', () => {
  for (const seat of ['judge', 'writer', 'examiner']) {
    const chosen = choose(seat, { harnesses: world(dry, dry) })
    assert.equal(chosen.external, undefined)
    assert.equal(chosen.native.agent, NATIVE[seat].agent)
    assert.equal('off' in chosen, false)
  }
})

const SAME_FAMILY = 'the same family that wrote the document judged it: no other external pair could'
const MUSE = 'muse/muse-wonder-full-1.0@high'

test('issue 64: the Judge takes Muse when it is the only external pair left, and the note names the author family', () => {
  const museConfig = { harnesses: { ...config.harnesses, muse: { timeouts: { judge: 1800, writer: 2700, examiner: 1800 } }, grok: { timeouts: { judge: 1, writer: 1, examiner: 1 } } } }
  const dryExceptMuse = {
    agy: { installed: true, groups: { argon: dry, flash: dry, claude: dry } },
    grok: { installed: true, groups: { grok: dry } },
    muse: { installed: true, groups: { muse: open(2) } },
  }
  for (const seat of ['judge', 'examiner']) {
    const chosen = choose(seat, { author: 'muse-wonder-full-1.0', harnesses: dryExceptMuse, config: museConfig })
    assert.equal(chosen.external && chosen.external.pair.id, MUSE, seat)
    assert.equal(chosen.note, SAME_FAMILY, seat)
    assert.match(chosen.decision.reason, /same family that wrote the document judged it/, seat)
    assert.equal(chosen.decision.requested, 53.6, 'the points asked stay Opus high')
  }
  // Argon reaches the points and renews later than Muse, and costs more. It is another family, so it is taken.
  const argonLater = {
    ...dryExceptMuse,
    agy: { installed: true, groups: { argon: open(5), flash: dry, claude: dry } },
  }
  const other = choose('judge', { author: 'muse-wonder-full-1.0', harnesses: argonLater, config: museConfig })
  assert.equal(other.external.pair.family, 'gemini-4-argon')
  assert.equal(other.note, null)
  assert.equal(other.tried.find((entry) => entry.id === MUSE).outcome, 'next')
})

test('issue 64: the Writer leaves the Judge its only pair when the Writer has another, and keeps it when it has none', () => {
  const pair = (id, intelligence, cost, family = id.split('/')[1].split('@')[0]) => {
    const [harness, rest] = id.split('/')
    const [model, effort] = rest.split('@')
    return { id, harness, model, effort, family, group: harness, intelligence, costPerTaskUsd: cost, outputTokensPerSecond: 1, timeToFirstTokenS: 1 }
  }
  const table = [
    pair('claude/haiku@high', 37.8, 0.08, 'claude-haiku-5-5'),
    pair('claude/sonnet@high', 46.8, 0.88, 'claude-sonnet-5-5'),
    pair('claude/opus@high', 53.6, 1.82, 'claude-opus-5-5'),
    pair(MUSE, 53.6, 0.5, 'muse-wonder-full-1.0'),
    pair('grok/grok-4.7@high', 46.3, 2, 'grok-4.7'),
  ]
  const seatConfig = { harnesses: { muse: { timeouts: { judge: 1, writer: 1, examiner: 1 } }, grok: { timeouts: { judge: 1, writer: 1, examiner: 1 } } } }
  const view = (museDay, grokDay) => ({
    muse: { installed: true, groups: { muse: open(museDay) } },
    grok: { installed: true, groups: { grok: open(grokDay) } },
  })
  const writer = (pairs, harnesses) => chooseSeat({ config: seatConfig, pairs, seat: 'writer', harnesses })
  // Muse is the only pair that reaches the Judge, and the one the Writer would take: the Writer takes Grok instead.
  const held = writer(table, view(1, 4))
  assert.equal(held.external.pair.id, 'grok/grok-4.7@high')
  assert.equal(held.tried.find((entry) => entry.id === MUSE).why, 'reserved')
  const judge = chooseSeat({ config: seatConfig, pairs: table, seat: 'judge', author: 'grok-4.7', harnesses: view(1, 4) })
  assert.equal(judge.external.pair.id, MUSE)
  // The Writer that would not take Muse keeps its own pair, and Muse stays a candidate.
  const untouched = writer(table, view(5, 1))
  assert.equal(untouched.external.pair.id, 'grok/grok-4.7@high')
  assert.equal(untouched.tried.find((entry) => entry.id === MUSE).why, null)
  // Grok no longer reaches the Writer: leaving Muse out would leave no external pair, so the Writer keeps it.
  const only = table.map((entry) => (entry.id === 'grok/grok-4.7@high' ? { ...entry, intelligence: 40 } : entry))
  const kept = writer(only, view(1, 1))
  assert.equal(kept.external.pair.id, MUSE)
  assert.notEqual(kept.tried.find((entry) => entry.id === MUSE).why, 'reserved')
})

test('C12: a Judge never takes the model that wrote the document, external or native', () => {
  const external = choose('judge', { author: 'gemini-4-argon' })
  assert.notEqual(external.external.pair.family, 'gemini-4-argon')
  const native = choose('judge', { author: 'opus', harnesses: world(dry, dry) })
  assert.notEqual(native.native.model, 'opus')
  assert.notEqual(choose('examiner', { author: 'opus', harnesses: world(dry, dry) }).native.model, 'opus')
  assert.equal(choose('writer', { author: 'sonnet', harnesses: world(dry, dry) }).native.model, 'sonnet')
})

test('the native agent of a seat comes from its decision, with the seat agent in front', () => {
  const chosen = choose('judge', { author: 'opus', harnesses: world(dry, dry) })
  assert.deepEqual(chosen.native, { agent: 'aether:judge', ...chosen.decision.native })
  assert.deepEqual(choose('writer', { harnesses: world(dry, dry) }).native.agent, 'aether:writer')
  assert.deepEqual(chosen.tried.find((entry) => entry.id === 'agy/gemini-4-argon@high'), { id: 'agy/gemini-4-argon@high', outcome: 'passed', why: 'dry' })
})

test('a pair of a group that has no reading competes after the readable ones, and a pair of a harness that is off does not', () => {
  const noGemini = { agy: { installed: true, groups: { claude: open(3) } } }
  assert.equal(choose('judge', { harnesses: noGemini }).external.pair.id, 'agy/claude-opus-5-5@high', 'the readable group comes first')
  const unread = choose('judge', { harnesses: { agy: { installed: true, groups: {} } } })
  assert.equal(unread.external.pair.id, 'agy/claude-opus-5-5@high', 'no group is read, so the cheapest pair that reaches the points takes it')
  assert.equal(unread.external.quotaBefore, null)
  const off = choose('judge', { harnesses: {} })
  assert.equal(off.external, undefined)
  assert.ok(off.tried.every((entry) => entry.why === 'harness-off'))
})

test('issue 016: a pair that the captured listing does not offer is not chosen, and the decision and tried say not-offered', () => {
  const argon = pairs.find((p) => p.id === 'agy/gemini-4-argon@high')
  const chosen = choose('judge', { offered: (harnessName, model, effort) => !(model === 'gemini-4-argon' && effort === 'high') })
  assert.notEqual(chosen.external && chosen.external.pair.id, argon.id)
  const entry = chosen.decision.candidates.find((c) => c.id === argon.id)
  assert.deepEqual([entry.outcome, entry.why, entry.rank], ['passed', 'not-offered', null])
  assert.deepEqual(chosen.tried.find((e) => e.id === argon.id), { id: argon.id, outcome: 'passed', why: 'not-offered' })
  const none = choose('judge', { offered: () => false })
  assert.equal(none.external, undefined)
  assert.equal(none.native.agent, NATIVE.judge.agent)
  assert.ok(none.decision.candidates.every((c) => c.why === 'not-offered'))
  assert.ok(none.tried.some((e) => e.id === argon.id && e.why === 'not-offered'))
  // The native pairs are the reference and the fallback: offered never takes them away.
  assert.equal(none.decision.native.model, 'opus')
  // The shipped listing: Argon at the level of its pair is offered, an unknown model is not,
  // and a harness with no listing captured cannot refuse a model.
  assert.equal(seats.offeredByListing('agy', 'gemini-4-argon', 'high'), true)
  assert.equal(seats.offeredByListing('agy', 'gemini-9-neon', 'high'), false)
  assert.equal(seats.offeredByListing('agy', 'gemini-4-argon', 'high', { harnesses: {} }), true)
  assert.equal(seats.offeredByListing('agy', 'gemini-4-argon', 'high', null), true)
})

test('the seat module no longer holds the retired names', () => {
  assert.equal('EXTERNAL_EFFORT' in seats, false)
  const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'seats.js'), 'utf8')
  for (const name of ['EXTERNAL_EFFORT', 'designSeats', 'seatsChoice', 'seatList', 'SEAT_CHOICES']) assert.equal(source.includes(name), false, name)
})

test('authorModel reads a lane model, a harness model or a Claude alias', () => {
  assert.equal(seats.authorModel('sonnet'), 'claude-sonnet-5-5')
  assert.equal(seats.authorModel('agy/claude-opus-5-5'), 'claude-opus-5-5')
  assert.equal(seats.authorModel('gemini-4-argon'), 'gemini-4-argon')
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
  for (const name of ['AETHER_SUPERDELEGATION', 'AETHER_LANE_HARNESSES', 'CLAUDE_ENV_FILE']) delete base[name]
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
  const env = laneEnv(t, { quota: geminiFirst() })
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
  assert.equal('choice' in entry, false, 'there is no seats choice any more')
  assert.deepEqual([entry.reference.id, entry.reference.model, entry.reference.effort], ['claude/opus@high', 'opus', 'high'])
  assert.match(entry.reason, /^agy\/gemini-4-argon@high: 52\.6 points for 53\.6 asked/)
  assert.equal(entry.effort, 'high')
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
    [{ AETHER_SUPERDELEGATION: 'off' }, 'superdelegation-off', (tried) => assert.deepEqual(tried, [])],
    [{ AETHER_LANE_HARNESSES: 'codex' }, 'no-external', (tried) => assert.ok(tried.length > 0 && tried.every((entry) => entry.why === 'harness-off'))],
  ]
  for (const [extra, reason, checkTried] of cases) {
    const env = { ...laneEnv(t), ...extra }
    const r = seat(repo.dir, ['judge', '--session', 's1'], env, input)
    assert.equal(r.status, 3, JSON.stringify(extra))
    assert.equal(r.json.unavailable, reason)
    checkTried(r.json.tried)
    assert.equal(r.json.native.agent, 'aether:judge')
    assert.equal(r.json.decision.reference.id, 'claude/opus@high')
    assert.deepEqual(agyTurns(env), [], 'no turn ran')
  }
  const quota = laneEnv(t, { quota: { 'Gemini Models': [0.02, 0.9], 'Claude and GPT models': [0.02, 0.9] } })
  const dried = seat(repo.dir, ['judge', '--session', 's1'], quota, input)
  assert.equal(dried.status, 3)
  assert.deepEqual(dried.json.tried.find((entry) => entry.id === 'agy/gemini-4-argon@high'), { id: 'agy/gemini-4-argon@high', outcome: 'passed', why: 'dry' })
  assert.deepEqual(agyTurns(quota), [])

  fs.appendFileSync(path.join(repo.dir, FEATURE, 'spec.md'), 'more\n')
  const dirty = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE], laneEnv(t), input)
  assert.equal(dirty.status, 3)
  assert.equal(dirty.json.unavailable, 'uncommitted')
  assert.equal(dirty.json.native.agent, 'aether:judge')
})

test('a Judge whose author is the one external model that reaches the points goes to another pair, and to the native agent when none is left', (t) => {
  const repo = seatRepo(t)
  const input = `FAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`
  const env = laneEnv(t, { quota: geminiFirst() })
  const other = seat(repo.dir, ['judge', '--session', 's1', '--author', 'gemini-4-argon'], env, input)
  assert.equal(other.status, 0, other.stdout)
  assert.equal(other.json.model, 'claude-opus-5-5', 'Argon wrote it, so the next pair that reaches the points reviews it')
  const both = laneEnv(t, { quota: geminiFirst() })
  const native = seat(repo.dir, ['judge', '--session', 's1', '--author', 'opus'], { ...both, AETHER_LANE_HARNESSES: 'codex' }, input)
  assert.equal(native.status, 3)
  assert.notEqual(native.json.native.model, 'opus')
  assert.deepEqual(agyTurns(both), [])
})

test('with superdelegation off the Examiner is handed to the native agent like any seat, and the log says so', (t) => {
  const repo = seatRepo(t)
  const env = { ...laneEnv(t), AETHER_SUPERDELEGATION: 'off' }
  const r = seat(repo.dir, ['examiner', '--session', 's1', '--feature', FEATURE], env, 'exam\n')
  assert.equal(r.status, 3)
  assert.equal(r.json.unavailable, 'superdelegation-off')
  assert.deepEqual([r.json.native.agent, r.json.native.model, r.json.native.effort], ['aether:examiner', 'opus', 'high'])
  assert.deepEqual(
    seatLog(env).map((e) => [e.kind, e.seat, e.status, e.reason, e.reference.id]),
    [['seat', 'examiner', 'native', 'superdelegation-off', 'claude/opus@high']],
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
  const env = laneEnv(t, { quota: geminiFirst() })
  const off = { ...env, AETHER_SUPERDELEGATION: 'off' }
  const ok = `FAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`
  assert.equal(seat(repo.dir, ['judge', '--session', 's1'], env, ok).status, 0)
  assert.equal(seat(repo.dir, ['judge', '--session', 's1'], env, 'FAKE-AGY: exit-error\n').status, 4)
  assert.equal(seat(repo.dir, ['judge', '--session', 's1'], off, ok).status, 3)
  assert.equal(seat(repo.dir, ['examiner', '--session', 's1', '--feature', FEATURE], off, ok).status, 3)
  assert.equal(seat(repo.dir, ['judge', '--session', 's2'], env, ok).status, 0)

  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-report'), '--seats', '--session', 's1'], {
    cwd: repo.dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const report = JSON.parse(r.stdout)
  assert.equal(report.rounds, 4)
  assert.equal(report.external, 1)
  assert.equal(report.externalShare, 1 / 4)
  const { decisions, ...judge } = report.bySeat.judge
  assert.deepEqual(judge, {
    rounds: 3,
    external: 1,
    native: 2,
    off: 0,
    reasons: { 'external failed': 1, 'superdelegation-off': 1 },
    models: { 'agy gemini-4-argon-high': { rounds: 2, ok: 1 } },
  })
  assert.deepEqual(decisions.map((d) => [d.status, d.reference.id]), [['ok', 'claude/opus@high'], ['failed', 'claude/opus@high'], ['native', 'claude/opus@high']])
  assert.equal(decisions[2].reason, 'superdelegation-off')
  assert.match(decisions[0].reason, /^agy\/gemini-4-argon@high: /)
  assert.deepEqual([report.bySeat.examiner.rounds, report.bySeat.examiner.native, report.bySeat.examiner.off], [1, 1, 0])
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
  const env = laneEnv(t, { quota: geminiFirst() })
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
  const env = laneEnv(t, { quota: geminiFirst() })
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

test('issue 67: a finding\'s place is the line it names, else the heading, else the heading above its quote, else names no line', () => {
  const doc = ['# Spec', '', '## Requirements', '', 'The card is the source.', '', '## Out of scope', '', 'No UI.', ''].join('\n')
  const line = { severity: 'major', type: 'wrong', title: 'the limit', evidence: '`plan.md:12-14`', fix: 'raise it' }
  const heading = { severity: 'minor', type: 'extra', title: 'the table', evidence: 'see `## Complexity`', fix: 'drop the row' }
  const quoted = { severity: 'major', type: 'wrong', title: 'scope', evidence: '`No UI.`', fix: 'drop it' }
  const neither = { severity: 'blocking', type: 'missing', title: 'a gap', evidence: '`not in the file`', fix: 'name it' }
  assert.equal(seats.findingTouch(line), 'lines 12-14')
  assert.equal(seats.findingTouch({ ...line, evidence: 'src/api.js:40' }), 'line 40')
  assert.equal(seats.findingTouch({ ...line, title: 'Task 1:2 is too large', evidence: '`R1`' }), 'names no line')
  assert.equal(seats.findingTouch({ ...line, evidence: 'lines 4-9 of the spec' }), 'lines 4-9')
  assert.equal(seats.findingTouch({ ...line, evidence: '`plan.md:12` under `## Gate`' }), 'line 12')
  assert.equal(seats.findingTouch(heading), '## Complexity')
  assert.equal(seats.findingTouch(quoted), 'names no line')
  assert.equal(seats.findingTouch(quoted, doc), '## Out of scope')
  assert.equal(seats.findingTouch(neither, doc), 'names no line')
  assert.equal(seats.findingTouch({ severity: 'minor', type: 'missing', title: 'x', evidence: '', fix: 'y' }), 'names no line')

  const brief = seats.revisionBrief({ paths: [`${FEATURE}/spec.md`], findings: [line, heading, neither], openQuestions: ['Which limit?'] })
  assert.ok(brief.includes('Edit the document in place. Change only what the findings need. Do not rewrite, reorder or reformat the rest. Keep everything the Judge did not flag.'))
  assert.ok(brief.includes(`- ${FEATURE}/spec.md`))
  assert.ok(brief.includes('[major] [wrong] the limit — lines 12-14 — `plan.md:12-14` — raise it'))
  assert.ok(brief.includes('[minor] [extra] the table — ## Complexity'))
  assert.ok(brief.includes('[blocking] [missing] a gap — names no line'))
  assert.ok(brief.includes('- Which limit?'))
  assert.equal(brief.includes('Write the spec'), false)
})

test('issue 67: an external Writer is told the correction is an edit, and a draft round is not', (t) => {
  const repo = seatRepo(t)
  const env = laneEnv(t, { quota: geminiFirst() })
  const files = writerFiles(t)
  const findings = [
    { severity: 'major', type: 'wrong', title: 'the limit', evidence: '`plan.md:12-14`', fix: 'raise it' },
    { severity: 'blocking', type: 'missing', title: 'a gap', evidence: '`R1`', fix: 'name it' },
  ]
  const message = [
    `Revise ${FEATURE}/plan.md and ${FEATURE}/tasks.md after the Judge's review 1.`,
    '',
    seats.revisionBrief({ paths: [`${FEATURE}/plan.md`, `${FEATURE}/tasks.md`], findings }),
    `FAKE-AGY: copy ${files.plan} ${FEATURE}/plan.md`,
    `FAKE-AGY: copy ${files.tasks} ${FEATURE}/tasks.md`,
    'FAKE-AGY: commit plan and tasks',
    `FAKE-AGY: answer ${JSON.stringify(WRITER_ANSWER)}`,
    '',
  ].join('\n')
  const revised = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE], env, message)
  assert.equal(revised.status, 0, revised.stdout + revised.stderr)
  const prompt = argAfter(agyTurns(env)[0].argv, '-p')
  assert.ok(prompt.includes(message.trim()))
  assert.ok(prompt.includes('names no line'))
  assert.ok(prompt.includes('not a brief to write the document again'))

  const draftEnv = laneEnv(t, { quota: geminiFirst() })
  const draft = seat(repo.dir, ['writer', '--session', 's2', '--feature', FEATURE], draftEnv, writerInput(files))
  assert.equal(draft.status, 0, draft.stdout + draft.stderr)
  const draftPrompt = argAfter(agyTurns(draftEnv)[0].argv, '-p')
  assert.equal(draftPrompt.includes('not a brief to write the document again'), false)
  assert.equal(draftPrompt.includes('Findings:'), false)
})

test('with superdelegation off the Writer is the native Writer, handed back from its decision', (t) => {
  const repo = seatRepo(t)
  const r = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE], { ...laneEnv(t), AETHER_SUPERDELEGATION: 'off' }, writerInput(writerFiles(t)))
  assert.equal(r.status, 3)
  assert.equal(r.json.unavailable, 'superdelegation-off')
  assert.deepEqual([r.json.native.agent, r.json.native.model, r.json.native.effort], [NATIVE.writer.agent, 'sonnet', 'high'])
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

// ---- The switch ----

test('C2: with superdelegation off the seat command hands the round to the native agent and runs no harness', async (t) => {
  const repo = makeRepo(t)
  const env = { ...process.env, AETHER_SUPERDELEGATION: 'off', AETHER_DATA_DIR: tempDir(t, 'aether-data-') }
  for (const [seat, model] of [['judge', 'opus'], ['writer', 'sonnet'], ['examiner', 'opus']]) {
    const feature = seat === 'judge' ? [] : ['--feature', 'specs/007-demo']
    const { exitCode, value } = await seatCommand([seat, '--session', 's1', ...feature], { input: 'x', env, cwd: repo.dir })
    assert.equal(exitCode, 3, seat)
    assert.equal(value.unavailable, 'superdelegation-off')
    assert.deepEqual([value.native.model, value.native.effort], [model, 'high'])
  }
  for (const seat of ['judge', 'examiner']) {
    const feature = seat === 'judge' ? [] : ['--feature', 'specs/007-demo']
    const { value } = await seatCommand([seat, '--session', 's1', '--author', 'opus', ...feature], { input: 'x', env, cwd: repo.dir })
    assert.notEqual(value.native.model, 'opus', `${seat}, off, does not fall on the author model`)
  }
})

test('E7: when the external round of a Judge fails, the native Judge handed back is not the author model', (t) => {
  const repo = seatRepo(t)
  const r = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE, '--author', 'opus'], laneEnv(t), 'FAKE-AGY: exit-error\n')
  assert.equal(r.status, 4, r.stdout + r.stderr)
  assert.equal(r.json.native.agent, 'aether:judge')
  assert.notEqual(r.json.native.model, 'opus')
  assert.equal(r.json.decision.reference.id, 'claude/opus@high')
})
