'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, runBin } = require('./helpers.js')
const { LANE_BIN, laneEnv, agyTurns } = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const FEATURE = 'specs/001-demo'
const OPTIONS = ['--superdelegation', 'on', '--harnesses', 'agy']
const DAY = 86400000
// Gemini's weekly window resets before the Claude and GPT one. Argon (50.4) is below the Judge's floor
// (Opus high is 51.7, at least 50.7), and the shipped table gives judge and examiner only to Argon, so a
// plain agy round is the native agent. A round that must run grants those roles to claude-opus-5-5.
const geminiFirst = () => ({
  'Gemini Models': [0.9, 0.9, null, new Date(Date.now() + 2 * DAY).toISOString()],
  'Claude and GPT models': [0.9, 0.9, null, new Date(Date.now() + 3 * DAY).toISOString()],
})
const grantOpusSeats = (cfg) => {
  if (cfg?.harnesses?.agy?.models?.['claude-opus-5-5']?.roles) {
    cfg.harnesses.agy.models['claude-opus-5-5'].roles.push('judge', 'examiner')
  }
}
const JUDGE_ANSWER = { verdict: 'revise', findings: [{ severity: 'major', type: 'missing', title: 'Task 3 is too large', evidence: '`Owns: src/**`', fix: 'split it' }], openQuestions: [] }
const ID = 'judge-20261015-120000-ab12'

function seatRepo(t) {
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(repo.dir, FEATURE), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, FEATURE, 'spec.md'), '# Demo\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'spec')
  return repo
}

// What the mod does before seat-start: it saves the message where the bin looks for it. Returns the digest.
function writeMessage(repo, text, session = 's1') {
  const dir = path.join(repo.dir, '.aether-tmp', 'seats', session)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'message.md'), text)
  return lanes.digest(text)
}

// The environment of the mod's bins: it has none of the session's exports, so the flags must carry the option.
const modEnv = (t, mutate = null) => ({ ...laneEnv(t, { quota: geminiFirst(), mutate }), AETHER_SUPERDELEGATION: 'off', AETHER_LANE_HARNESSES: 'codex' })
const lane = (repo, args, env) => runBin(LANE_BIN, args, repo.dir, env)
const start = (repo, env, seat, message, extra = OPTIONS, more = []) =>
  lane(repo, ['seat-start', seat, '--session', 's1', ...more, '--feature', FEATURE, ...extra, '--digest', writeMessage(repo, message)], env)

function waitDone(repo, id, env, seconds = 60) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    const r = lane(repo, ['seat-wait', id, '--max', '5'], env)
    if (r.json && r.json.error) throw new Error(r.json.error)
    if (r.json && r.json.done) return r.json
  }
  throw new Error(`seat round ${id} did not finish in ${seconds} s`)
}
const until = async (check, seconds = 15) => {
  for (let i = 0; i < seconds * 10 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 100))
  return check()
}

test('an external Judge round starts in the background and its answer comes by seat-wait, with the option given by flags', (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t, grantOpusSeats)
  const started = start(repo, env, 'judge', `Review.\nFAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`, OPTIONS, ['--author', 'sonnet'])
  assert.equal(started.status, 0, started.stdout)
  assert.equal(started.json.started, true)
  assert.match(started.json.id, /^judge-\d{8}-\d{6}-[0-9a-f]{4}$/)
  const done = waitDone(repo, started.json.id, env)
  assert.equal(done.exitCode, 0, JSON.stringify(done))
  assert.equal(done.value.id, started.json.id)
  assert.equal(done.value.model, 'claude-opus-5-5')
  assert.deepEqual(done.value.result, JUDGE_ANSWER)
  assert.ok(done.value.answer.startsWith('## Verdict\nrevise\n'))
  assert.ok(done.value.answer.includes('- Lane: agy claude-opus-5-5-high'), done.value.answer)
  // The result carries the time the round took, from its start (issue 62).
  assert.ok(Number.isInteger(done.durationMs) && done.durationMs >= 0 && done.durationMs < 60000, String(done.durationMs))
})

test('the other exits of a seat are results of the round: 3 for nothing ran, 4 for a failed round', (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t, grantOpusSeats)
  const off = waitDone(repo, start(repo, env, 'judge', 'Review.\n', ['--superdelegation', 'off', '--harnesses', 'agy']).json.id, env)
  assert.equal(off.exitCode, 3)
  assert.equal(off.value.unavailable, 'superdelegation-off')
  assert.equal(off.value.native.agent, 'aether:judge')
  const examiner = waitDone(repo, start(repo, env, 'examiner', 'Exam.\n', ['--superdelegation', 'off', '--harnesses', 'agy'], ['--author', 'opus']).json.id, env)
  assert.deepEqual([examiner.exitCode, examiner.value.unavailable, examiner.value.native.agent], [3, 'superdelegation-off', 'aether:examiner'])
  assert.notEqual(examiner.value.native.model, 'opus', 'an Examiner handed back is not the author model')
  const failed = waitDone(repo, start(repo, env, 'judge', 'Review.\nFAKE-AGY: exit-error boom\n').json.id, env)
  assert.equal(failed.exitCode, 4)
  assert.equal(failed.value.failed, 'failed')
  assert.equal(agyTurns(env).length, 1, 'only the failed round ran agy')
})

test('a message that is missing or whose digest differs starts nothing', (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t)
  const args = ['seat-start', 'judge', '--session', 's1', '--author', 'sonnet', '--feature', FEATURE, ...OPTIONS]
  assert.deepEqual(lane(repo, [...args, '--digest', '0a1b2c3d:9'], env).json, { unavailable: 'message' })
  writeMessage(repo, 'Review.\n')
  assert.deepEqual(lane(repo, [...args, '--digest', '0a1b2c3d:9'], env).json, { unavailable: 'digest' })
})

test('seat-wait answers { done: false } while a round runs, and seat-stop ends it and removes its worktree', async (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t, grantOpusSeats)
  const started = start(repo, env, 'judge', `Review.\nFAKE-AGY: sleep 30\nFAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`)
  const id = started.json.id
  const worktree = path.join(repo.dir, '.aether', 'seats', id, 'wt')
  assert.ok(await until(() => fs.existsSync(worktree)), 'the round started its worktree')
  // The runner is told the options by the flags, whatever the environment of the mod holds.
  const pid = fs.readFileSync(path.join(repo.dir, '.aether', 'seats', id, 'pid'), 'utf8').trim()
  const runnerEnv = fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0')
  assert.ok(runnerEnv.includes('AETHER_SUPERDELEGATION=on'), 'AETHER_SUPERDELEGATION')
  assert.ok(runnerEnv.includes('AETHER_LANE_HARNESSES=agy'), 'AETHER_LANE_HARNESSES')
  // A round that still runs says how long it has (the workflow has no clock: its time caps read this, issue 62).
  const running = lane(repo, ['seat-wait', id, '--max', '0'], env).json
  assert.deepEqual(Object.keys(running).sort(), ['done', 'elapsedMs'])
  assert.equal(running.done, false)
  assert.ok(Number.isInteger(running.elapsedMs) && running.elapsedMs >= 0 && running.elapsedMs < 60000, String(running.elapsedMs))
  // seat-stop names the pair the round ran on, for the next try to leave it out.
  assert.deepEqual(lane(repo, ['seat-stop', id], env).json, { stopped: true, pair: 'agy/claude-opus-5-5@high' })
  assert.ok(await until(() => !fs.existsSync(worktree)), 'the worktree is gone')
  const after = lane(repo, ['seat-wait', id, '--max', '5'], env).json
  assert.equal(after.done, true)
  assert.equal(after.exitCode, 1)
  assert.match(after.value.error, /ended without a result/)
  assert.ok(Number.isInteger(after.durationMs))
})

test('a Judge round on the shipped agy table finds no external pair at Opus high', (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t)
  const started = start(repo, env, 'judge', `Review.\nFAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`, OPTIONS, ['--author', 'sonnet'])
  assert.equal(started.status, 0, started.stdout)
  const done = waitDone(repo, started.json.id, env)
  assert.equal(done.exitCode, 3, JSON.stringify(done))
  assert.equal(done.value.unavailable, 'no-external')
  assert.equal(done.value.native.agent, 'aether:judge')
  assert.equal(done.value.native.model, 'opus')
  assert.equal(done.value.native.intelligence, 51.7)
  assert.equal(agyTurns(env).length, 0, 'Argon is below the floor and Opus has no judge role, so agy never runs')
})

test('a round whose runner is dead is reported, and bad arguments are refused', (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t)
  const dir = path.join(repo.dir, '.aether', 'seats', ID)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'call.json'), '{}')
  fs.writeFileSync(path.join(dir, 'pid'), '999999\n')
  const dead = lane(repo, ['seat-wait', ID, '--max', '5'], env).json
  assert.deepEqual([dead.done, dead.exitCode], [true, 1])
  assert.equal(lane(repo, ['seat-wait', 'judge-x'], env).json.error, 'invalid seat round id: judge-x')
  assert.equal(lane(repo, ['seat-wait', 'judge-20261015-120000-ffff'], env).json.error, 'no such seat round: judge-20261015-120000-ffff')
  const refused = (args) => lane(repo, ['seat-start', ...args], env)
  assert.match(refused(['designer', '--session', 's1']).json.error, /usage: aether-lane/)
  assert.match(refused(['judge', '--session', 's1', '--feature', FEATURE, '--superdelegation', 'maybe', '--harnesses', 'agy', '--digest', 'x']).json.error, /--superdelegation must be on or off/)
  assert.match(refused(['judge', '--session', 's1', '--feature', FEATURE, '--harnesses', 'agy', '--digest', 'x']).json.error, /seat-start needs --superdelegation/)
  // The seats and lanes options are gone: a round started with one is refused, not run under a switch nobody gave it.
  assert.match(refused(['judge', '--session', 's1', '--feature', FEATURE, '--seats', 'native', ...OPTIONS, '--digest', 'x']).json.error, /seat-start takes no --seats/)
  assert.match(refused(['judge', '--session', 's1', '--feature', FEATURE, '--lanes', 'on', ...OPTIONS, '--digest', 'x']).json.error, /seat-start takes no --lanes/)
  assert.match(refused(['judge', '--session', 's1', '--feature', FEATURE, ...OPTIONS]).json.error, /--digest/)
  assert.match(lane(repo, [], env).json.error, /seat-start .*seat-wait .*seat-stop/)
})

const ARGON = 'agy/gemini-4-argon@high'
const OPUS_PAIR = 'agy/claude-opus-5-5@high'

test('seat-start --exclude leaves that pair out and the next pair of the rule runs the round', (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t)
  const started = start(repo, env, 'judge', `Review.\nFAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`, [...OPTIONS, '--exclude', ARGON])
  assert.equal(started.status, 0, started.stdout)
  const done = waitDone(repo, started.json.id, env)
  assert.equal(done.exitCode, 3, JSON.stringify(done))
  assert.equal(done.value.unavailable, 'no-external')
  assert.equal(done.value.native.agent, 'aether:judge')
  assert.equal(done.value.native.model, 'opus')
})

test('seat-start with every candidate excluded answers with the native agent, as when no pair can take the round', (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t)
  const started = start(repo, env, 'judge', 'Review.\n', [...OPTIONS, '--exclude', `${ARGON},${OPUS_PAIR}`])
  assert.equal(started.status, 0, started.stdout)
  const done = waitDone(repo, started.json.id, env)
  assert.equal(done.exitCode, 3, JSON.stringify(done))
  assert.equal(done.value.unavailable, 'no-external')
  assert.equal(done.value.native.agent, 'aether:judge')
  assert.equal(done.value.native.model, 'opus')
  assert.equal(done.value.tried.find((entry) => entry.id === ARGON).why, 'excluded')
  assert.equal(done.value.tried.find((entry) => entry.id === OPUS_PAIR).why, 'excluded')
  assert.equal(agyTurns(env).length, 0)
})

test('seat-start refuses a malformed --exclude as a usage error and starts nothing', (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t)
  const refused = (value) => lane(repo, ['seat-start', 'judge', '--session', 's1', '--feature', FEATURE, ...OPTIONS, '--exclude', value, '--digest', '0a1b2c3d:1'], env)
  for (const value of ['agy/x', 'agy/gemini-4-argon', `${ARGON},nope`]) {
    const r = refused(value)
    assert.equal(r.status, 1, value)
    assert.match(r.json.error, /--exclude must be pair ids like agy\/model@effort/, value)
  }
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'seats')), false)
})

test('seat-start keeps the author rule when a pair is excluded', (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t)
  const started = start(repo, env, 'judge', `Review.\nFAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`, [...OPTIONS, '--exclude', ARGON], ['--author', 'opus'])
  assert.equal(started.status, 0, started.stdout)
  const done = waitDone(repo, started.json.id, env)
  assert.equal(done.exitCode, 3, JSON.stringify(done))
  assert.equal(done.value.unavailable, 'no-external')
  assert.equal(done.value.native.agent, 'aether:judge')
  assert.equal(done.value.native.model, 'sonnet')
  const exam = { tests: [{ id: 'c1', criterion: 'C1', command: 'node --test .aether-exam/c1.test.js', files: [] }], notes: 'none' }
  const examiner = start(repo, env, 'examiner', `Exam.\nFAKE-AGY: answer ${JSON.stringify(exam)}\n`, [...OPTIONS, '--exclude', ARGON], ['--author', 'opus'])
  const examined = waitDone(repo, examiner.json.id, env)
  assert.equal(examined.exitCode, 3, JSON.stringify(examined))
  assert.equal(examined.value.unavailable, 'no-external')
  assert.equal(examined.value.native.agent, 'aether:examiner')
  assert.equal(examined.value.native.model, 'sonnet')
  assert.equal(agyTurns(env).length, 0)
})

test('the Writer of a spec round is forwarded its document', (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t)
  const spec = path.join(repo.dir, '..', `spec-${path.basename(repo.dir)}.md`)
  fs.writeFileSync(spec, '# Demo\n\n## Requirements\n\n- R1. It works. Serves: C1.\n')
  t.after(() => fs.rmSync(spec, { force: true }))
  const answer = { spec: `${FEATURE}/spec.md`, commit: 'abc', clarify: [], assumptions: [], proposals: [], questions: [] }
  const message = `Write.\nFAKE-AGY: copy ${spec} ${FEATURE}/spec.md\nFAKE-AGY: commit spec\nFAKE-AGY: answer ${JSON.stringify(answer)}\n`
  const started = start(repo, env, 'writer', message, ['--doc', 'spec', '--superdelegation', 'on', '--harnesses', 'agy'])
  assert.equal(started.status, 0, started.stdout)
  const done = waitDone(repo, started.json.id, env)
  assert.equal(done.exitCode, 0, JSON.stringify(done))
  assert.equal(done.value.result.commit, repo.git('rev-parse', 'HEAD'))
})
