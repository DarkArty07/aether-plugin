'use strict'

// Issue 184: a finished external Examiner round must not leave the exam's text under its seat directory.
// The exam is stored in the data directory; result.json, stdout and stderr under the round's folder keep no test.
// A Judge round's result.json is unchanged. A stderr or stdout that cannot be replaced once the exam is stored does
// not fail the round.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, tempDir, runBin } = require('./helpers.js')
const { LANE_BIN, FAKE_AGY, laneEnv: rawLaneEnv, agyTurns } = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const FEATURE = 'specs/001-demo'
const DAY = 86400000
const OPTIONS = ['--superdelegation', 'on', '--harnesses', 'agy']
// Codex keeps stderr out of its answer when it exits 0 with the structured object, so its stderr can hold the transcript.
const FAKE_CODEX = path.join(__dirname, 'fixtures', 'fake-codex.js')
const RATE_LIMITS = path.join(__dirname, 'fixtures', 'codex', 'rate-limits.json')
const CODEX_OPTIONS = ['--superdelegation', 'on', '--harnesses', 'codex']
const CODEX_MODEL = 'gpt-6.1-sol'
const JUDGE_ANSWER = { verdict: 'approve', findings: [], openQuestions: [] }
const TEST_FILE = '.aether/exam/c1.test.js'
const SECRET = 'LEAK-SECRET-184'
const COMMAND = `node --test ${TEST_FILE}`
const EXAM_ANSWER = { tests: [{ id: 'c1', criterion: 'C1', command: COMMAND, files: ['c1.test.js'] }], notes: 'none' }
const NEEDLES = [SECRET, COMMAND]

const geminiFirst = () => ({
  'Gemini Models': [0.9, 0.9, null, new Date(Date.now() + 2 * DAY).toISOString()],
  'Claude and GPT models': [0.9, 0.9, null, new Date(Date.now() + 3 * DAY).toISOString()],
})
// Opus high meets the floor, so an external round picks it once it holds the judge and examiner roles.
const grantOpusSeats = (cfg) => {
  if (cfg?.harnesses?.agy?.models?.['claude-opus-5-5']?.roles) {
    cfg.harnesses.agy.models['claude-opus-5-5'].roles.push('judge', 'examiner')
  }
}
// The shipped table gives codex no Examiner role; Sol (54.5) is the codex model above the floor Opus high sets (51.7).
const grantCodexSeats = (cfg) => {
  const model = cfg?.harnesses?.codex?.models?.[CODEX_MODEL]
  if (model?.roles && !model.roles.includes('examiner')) model.roles.push('examiner')
}

// A fake agy that takes its script from a file instead of the prompt, so the prompt file the round keeps holds only
// the message and never the answer lines the fake reads.
function scriptedAgy(t, script) {
  const dir = tempDir(t, 'seat-exam-leak-agy-')
  const scriptFile = path.join(dir, 'script.txt')
  fs.writeFileSync(scriptFile, script)
  const file = path.join(dir, 'agy')
  fs.writeFileSync(file, [
    '#!/usr/bin/env node',
    "'use strict'",
    "const fs = require('node:fs')",
    "const { spawnSync } = require('node:child_process')",
    'const argv = process.argv.slice(2)',
    "const i = argv.indexOf('-p')",
    `if (i !== -1 && argv[i + 1] !== '/usage') argv[i + 1] = fs.readFileSync(${JSON.stringify(scriptFile)}, 'utf8')`,
    `const r = spawnSync(process.execPath, [${JSON.stringify(FAKE_AGY)}, ...argv], { stdio: 'inherit' })`,
    'process.exit(r.status === null ? 1 : r.status)',
    '',
  ].join('\n'))
  fs.chmodSync(file, 0o755)
  return file
}

function laneEnv(t, script) {
  return rawLaneEnv(t, { command: scriptedAgy(t, script), quota: geminiFirst(), mutate: grantOpusSeats })
}

function seatRepo(t) {
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(repo.dir, FEATURE), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, FEATURE, 'spec.md'), '# Demo\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'spec')
  return repo
}

function writeMessage(repo, text, session = 's1') {
  const dir = path.join(repo.dir, '.aether', 'tmp', 'seats', session)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'message.md'), text)
  return lanes.digest(text)
}

const lane = (repo, args, env) => runBin(LANE_BIN, args, repo.dir, env)

function start(repo, env, seat, message, options = OPTIONS) {
  const digest = writeMessage(repo, message)
  return lane(repo, ['seat-start', seat, '--session', 's1', '--author', 'sonnet', '--feature', FEATURE, ...options, '--digest', digest], env)
}

function waitDone(repo, id, env, seconds = 60) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    const r = lane(repo, ['seat-wait', id, '--max', '5'], env)
    if (r.json && r.json.error) throw new Error(r.json.error)
    if (r.json && r.json.done) return r.json
  }
  throw new Error(`seat round ${id} did not finish in ${seconds} s`)
}

// Every file under dir, as text, for the files that are not links.
function filesUnder(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.lstatSync(full)
    if (st.isSymbolicLink()) continue
    if (st.isDirectory()) out.push(...filesUnder(full))
    else if (st.isFile()) out.push(full)
  }
  return out
}

// The round's folder, where it is now (.aether/work/seats) and where the legacy layout kept it (.aether/seats).
function roundFolders(repo, id) {
  return [path.join(repo.dir, '.aether', 'work', 'seats', id), path.join(repo.dir, '.aether', 'seats', id)]
}

// One test's environment with the fake codex as the codex harness, its rate-limit reading and the script it acts out.
function codexEnv(t, script, command = FAKE_CODEX) {
  fs.chmodSync(FAKE_CODEX, 0o755)
  const env = rawLaneEnv(t, { mutate: (config) => { config.harnesses.codex.command = command; grantCodexSeats(config) } })
  const dir = path.dirname(env.AETHER_DATA_DIR)
  const rateLimits = path.join(dir, 'rate-limits.json')
  fs.copyFileSync(RATE_LIMITS, rateLimits)
  return {
    ...env,
    AETHER_LANE_HARNESSES: 'codex',
    AETHER_FAKE_CODEX_LOG: path.join(dir, 'codex.log'),
    AETHER_FAKE_CODEX_RATE_LIMITS: rateLimits,
    AETHER_FAKE_CODEX_SCRIPT: JSON.stringify(script),
    OPENAI_API_KEY: 'secret-key',
  }
}

// The fake codex run through a wrapper. When the script says stderrIsDirectory, the wrapper turns the round's stderr file
// into a directory while the round runs, so the round's own write of stderr fails once the exam is stored (issue 184).
// The round's folder is the parent of the worktree the harness runs in.
function codexWrapper(t) {
  const dir = tempDir(t, 'seat-exam-leak-wrapper-')
  const file = path.join(dir, 'codex')
  fs.writeFileSync(file, [
    '#!/usr/bin/env node',
    "'use strict'",
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    "const { spawnSync } = require('node:child_process')",
    'const script = JSON.parse(process.env.AETHER_FAKE_CODEX_SCRIPT || "{}")',
    "if (process.argv[2] === 'exec' && script.stderrIsDirectory === true) {",
    "  const stderr = path.join(path.dirname(process.cwd()), 'stderr')",
    '  fs.rmSync(stderr, { force: true })',
    '  fs.mkdirSync(stderr)',
    '}',
    `const r = spawnSync(process.execPath, [${JSON.stringify(FAKE_CODEX)}, ...process.argv.slice(2)], { stdio: 'inherit' })`,
    'process.exit(r.status === null ? 1 : r.status)',
    '',
  ].join('\n'))
  fs.chmodSync(file, 0o755)
  return file
}

// The fake codex's `exec` calls, one entry each (the quota read is `app-server` and is not a call).
function codexExecs(env) {
  if (!fs.existsSync(env.AETHER_FAKE_CODEX_LOG)) return []
  return fs.readFileSync(env.AETHER_FAKE_CODEX_LOG, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((entry) => entry.kind === 'exec')
}

// The script of an Examiner that writes one test, and whose stderr is the given text.
const examScript = (extra = {}) => ({
  files: { [TEST_FILE]: `${SECRET}\n` },
  answer: JSON.stringify(EXAM_ANSWER),
  ...extra,
})

test('a finished external Examiner round keeps no test text under its seat folder, and the exam is stored', (t) => {
  const repo = seatRepo(t)
  const script = `FAKE-AGY: write ${TEST_FILE} ${SECRET}\nFAKE-AGY: answer ${JSON.stringify(EXAM_ANSWER)}\n`
  const env = laneEnv(t, script)
  const started = start(repo, env, 'examiner', 'Write the exam.\n')
  assert.equal(started.status, 0, started.stdout)
  const done = waitDone(repo, started.json.id, env)
  assert.equal(done.exitCode, 0, JSON.stringify(done))
  assert.equal(agyTurns(env).length, 1, 'the external Examiner ran')

  // The exam is stored in the data directory, and the reply still names it and counts its tests.
  assert.equal(typeof done.value.stored, 'string', JSON.stringify(done.value))
  assert.ok(done.value.stored.startsWith(env.AETHER_DATA_DIR), done.value.stored)
  assert.equal(fs.existsSync(path.join(done.value.stored, 'c1.test.js')), true)
  assert.match(done.value.answer, /- Tests: 1 \(C1 1\)/)
  // The reply a workflow reads still carries the exam's tests, read from the stored exam.
  assert.equal(done.value.result.tests.length, 1)
  assert.equal(done.value.result.tests[0].command, COMMAND)

  // No file under the round's folders holds the text of a test.
  for (const folder of roundFolders(repo, started.json.id)) {
    for (const file of filesUnder(folder)) {
      const text = fs.readFileSync(file, 'utf8')
      for (const needle of NEEDLES) assert.equal(text.includes(needle), false, `${path.relative(repo.dir, file)} holds ${needle}`)
    }
  }
  // The round's result is still there, with the exam's digest and test count in place of the tests.
  const result = JSON.parse(fs.readFileSync(path.join(roundFolders(repo, started.json.id)[0], 'result.json'), 'utf8'))
  assert.equal(result.value.result.tests, undefined)
  assert.equal(result.value.result.testCount, 1)
  assert.match(result.value.result.digest, /^[0-9a-f]{64}$/)
})

test('a finished Judge round keeps its answer in result.json, as before', (t) => {
  const repo = seatRepo(t)
  const env = laneEnv(t, `FAKE-AGY: answer ${JSON.stringify(JUDGE_ANSWER)}\n`)
  const started = start(repo, env, 'judge', 'Review.\n')
  const done = waitDone(repo, started.json.id, env)
  assert.equal(done.exitCode, 0, JSON.stringify(done))
  const result = JSON.parse(fs.readFileSync(path.join(roundFolders(repo, started.json.id)[0], 'result.json'), 'utf8'))
  assert.deepEqual(result.value.result, JUDGE_ANSWER)
})

test('a finished external Examiner round whose harness also writes the exam to stderr keeps no test text in any file of its folders', (t) => {
  const repo = seatRepo(t)
  const env = codexEnv(t, examScript({ stderr: `${COMMAND}\n${SECRET}\n` }))
  const started = start(repo, env, 'examiner', 'Write the exam.\n', CODEX_OPTIONS)
  assert.equal(started.status, 0, started.stdout)
  const done = waitDone(repo, started.json.id, env)
  assert.equal(done.exitCode, 0, JSON.stringify(done))
  assert.equal(codexExecs(env).length, 1, 'the codex Examiner ran')
  assert.equal(typeof done.value.stored, 'string', JSON.stringify(done.value))
  assert.equal(done.value.result.tests[0].command, COMMAND)

  // Every file under the round's folders, stderr included, is free of the exam's command and body.
  for (const folder of roundFolders(repo, started.json.id)) {
    for (const file of filesUnder(folder)) {
      const text = fs.readFileSync(file, 'utf8')
      for (const needle of NEEDLES) assert.equal(text.includes(needle), false, `${path.relative(repo.dir, file)} holds ${needle}`)
    }
  }
})

test('an Examiner round whose stderr cannot be replaced once the exam is stored is still finished, and the exam stays stored (issue 184)', (t) => {
  const repo = seatRepo(t)
  const env = codexEnv(t, examScript({ stderrIsDirectory: true }), codexWrapper(t))
  const started = start(repo, env, 'examiner', 'Write the exam.\n', CODEX_OPTIONS)
  assert.equal(started.status, 0, started.stdout)
  const done = waitDone(repo, started.json.id, env)
  assert.equal(done.exitCode, 0, JSON.stringify(done))
  assert.equal(codexExecs(env).length, 1, 'the codex Examiner ran')
  assert.equal(typeof done.value.stored, 'string', JSON.stringify(done.value))
  assert.equal(fs.existsSync(path.join(done.value.stored, 'c1.test.js')), true)
  assert.equal(done.value.result.tests[0].command, COMMAND)
  // The stdout was still replaced, and the stderr that could not be replaced is the directory the wrapper made.
  const folder = roundFolders(repo, started.json.id)[0]
  assert.equal(fs.statSync(path.join(folder, 'stderr')).isDirectory(), true)
  assert.match(fs.readFileSync(path.join(folder, 'stdout'), 'utf8'), /^The exam was stored at /)
})
