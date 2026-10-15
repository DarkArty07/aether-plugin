'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, runBin } = require('./helpers.js')
const { LANE_BIN, laneEnv, agyTurns } = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const FEATURE = 'specs/001-demo'
const OPTIONS = ['--seats', 'balanced', '--lanes', 'on', '--harnesses', 'agy']
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
const modEnv = (t) => ({ ...laneEnv(t), AETHER_LANES: 'off', AETHER_SEATS: 'native', AETHER_LANE_HARNESSES: 'codex' })
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
  const env = modEnv(t)
  const started = start(repo, env, 'judge', `Review.\nFAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`, OPTIONS, ['--author', 'sonnet'])
  assert.equal(started.status, 0, started.stdout)
  assert.equal(started.json.started, true)
  assert.match(started.json.id, /^judge-\d{8}-\d{6}-[0-9a-f]{4}$/)
  const done = waitDone(repo, started.json.id, env)
  assert.equal(done.exitCode, 0, JSON.stringify(done))
  assert.equal(done.value.id, started.json.id)
  assert.equal(done.value.model, 'gemini-4-argon')
  assert.deepEqual(done.value.result, JUDGE_ANSWER)
  assert.ok(done.value.answer.startsWith('## Verdict\nrevise\n'))
})

test('the other exits of a seat are results of the round: 3 for nothing ran, 4 for a failed round', (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t)
  const off = waitDone(repo, start(repo, env, 'judge', 'Review.\n', ['--seats', 'balanced', '--lanes', 'off', '--harnesses', 'agy']).json.id, env)
  assert.equal(off.exitCode, 3)
  assert.equal(off.value.unavailable, 'lanes-off')
  assert.equal(off.value.native.agent, 'aether:judge')
  const native = waitDone(repo, start(repo, env, 'examiner', 'Exam.\n', ['--seats', 'native', '--lanes', 'on', '--harnesses', 'agy']).json.id, env)
  assert.deepEqual([native.exitCode, native.value.unavailable, native.value.native], [3, 'off', null])
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
  const env = modEnv(t)
  const started = start(repo, env, 'judge', `Review.\nFAKE-AGY: sleep 30\nFAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`)
  const id = started.json.id
  const worktree = path.join(repo.dir, '.aether', 'seats', id, 'wt')
  assert.ok(await until(() => fs.existsSync(worktree)), 'the round started its worktree')
  assert.deepEqual(lane(repo, ['seat-wait', id, '--max', '0'], env).json, { done: false })
  assert.deepEqual(lane(repo, ['seat-stop', id], env).json, { stopped: true })
  assert.ok(await until(() => !fs.existsSync(worktree)), 'the worktree is gone')
  const after = lane(repo, ['seat-wait', id, '--max', '5'], env).json
  assert.equal(after.done, true)
  assert.equal(after.exitCode, 1)
  assert.match(after.value.error, /ended without a result/)
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
  assert.match(refused(['judge', '--session', 's1', '--feature', FEATURE, ...OPTIONS.slice(0, 2), '--lanes', 'maybe', '--harnesses', 'agy', '--digest', 'x']).json.error, /--lanes must be on or off/)
  assert.match(refused(['judge', '--session', 's1', '--feature', FEATURE, ...OPTIONS]).json.error, /--digest/)
  assert.match(lane(repo, [], env).json.error, /seat-start .*seat-wait .*seat-stop/)
})

test('the Writer of a spec round is forwarded its document', (t) => {
  const repo = seatRepo(t)
  const env = modEnv(t)
  const spec = path.join(repo.dir, '..', `spec-${path.basename(repo.dir)}.md`)
  fs.writeFileSync(spec, '# Demo\n\n## Requirements\n\n- R1. It works. Serves: C1.\n')
  t.after(() => fs.rmSync(spec, { force: true }))
  const answer = { spec: `${FEATURE}/spec.md`, commit: 'abc', clarify: [], assumptions: [], proposals: [], questions: [] }
  const message = `Write.\nFAKE-AGY: copy ${spec} ${FEATURE}/spec.md\nFAKE-AGY: commit spec\nFAKE-AGY: answer ${JSON.stringify(answer)}\n`
  const started = start(repo, env, 'writer', message, ['--doc', 'spec', '--seats', 'robust', '--lanes', 'on', '--harnesses', 'agy'])
  assert.equal(started.status, 0, started.stdout)
  const done = waitDone(repo, started.json.id, env)
  assert.equal(done.exitCode, 0, JSON.stringify(done))
  assert.equal(done.value.result.commit, repo.git('rev-parse', 'HEAD'))
})
