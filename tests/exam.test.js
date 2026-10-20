'use strict'

// The Examiner's exams: kept outside the repository, run on a commit in a disposable worktree, and
// written by an external Examiner through `aether-lane seat examiner`.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, makeRepo, tempDir } = require('./helpers.js')
const { LANE_BIN, laneEnv, git } = require('./lane-fixtures.js')
const exam = require('../plugins/aether/lib/exam.js')

const FEATURE = 'specs/001-demo'
const EXAM_BIN = path.join(PLUGIN, 'bin', 'aether-exam')

function repoWithSpec(t) {
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(repo.dir, FEATURE), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, FEATURE, 'spec.md'), '# Demo\n\n- C1: src/feature.js exists.\n- C2: the README stays.\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'spec')
  return repo
}

// An exam folder: exam.json and the files it names.
function writeExam(dir, tests, files = {}, notes = 'none') {
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), text)
  }
  fs.writeFileSync(path.join(dir, 'exam.json'), JSON.stringify({ tests, notes }))
  return dir
}

const FEATURE_TEST = { id: 'c1-feature', criterion: 'C1', command: 'node .aether-exam/c1.js', files: ['c1.js'] }
const README_TEST = { id: 'c2-readme', criterion: 'C2', command: 'test -f README.md', files: [] }
const C1_SCRIPT = "process.exit(require('node:fs').existsSync('src/feature.js') ? 0 : 1)\n"

test('store keeps an exam outside the repository, in place of an earlier one, and list shows it', (t) => {
  const repo = repoWithSpec(t)
  const data = tempDir(t, 'aether-data-')
  const from = writeExam(path.join(tempDir(t), 'exam'), [FEATURE_TEST, README_TEST], { 'c1.js': C1_SCRIPT })
  const stored = exam.store(repo.dir, FEATURE, from, { dataDir: data })
  assert.equal(stored.tests, 2)
  assert.ok(stored.dir.startsWith(path.join(data, 'exams')), stored.dir)
  assert.ok(!stored.dir.startsWith(repo.dir))
  assert.equal(path.basename(stored.dir), '001-demo')
  assert.equal(fs.readFileSync(path.join(stored.dir, 'c1.js'), 'utf8'), C1_SCRIPT)
  assert.equal(fs.existsSync(from), true, 'without move the source stays')
  assert.deepEqual(exam.list(repo.dir, { dataDir: data }), [{ feature: FEATURE, dir: stored.dir, tests: 2 }])

  const again = writeExam(path.join(tempDir(t), 'exam2'), [README_TEST])
  exam.store(repo.dir, FEATURE, again, { dataDir: data, move: true })
  assert.equal(fs.existsSync(again), false, 'with move the source is removed')
  assert.equal(fs.existsSync(path.join(stored.dir, 'c1.js')), false, 'the earlier exam is replaced')
  assert.equal(exam.list(repo.dir, { dataDir: data })[0].tests, 1)
})

test('store refuses an exam it cannot run', (t) => {
  const repo = repoWithSpec(t)
  const data = tempDir(t, 'aether-data-')
  const dir = () => path.join(tempDir(t), 'exam')
  const bad = [
    [
      () => {
        const empty = dir()
        fs.mkdirSync(empty, { recursive: true })
        return empty
      },
      /has no exam\.json/,
    ],
    [() => writeExam(dir(), [{ ...README_TEST, command: 7 }]), /exam\.json: tests\[0\]\.command must be a string$/],
    [() => writeExam(dir(), []), /exam\.json has no tests$/],
    [() => writeExam(dir(), [FEATURE_TEST]), /test c1-feature names c1\.js, which is not in the exam$/],
    [() => writeExam(dir(), [{ ...README_TEST, files: ['../secret'] }]), /names \.\.\/secret, which is not under \.aether-exam\//],
    [() => writeExam(dir(), [README_TEST, README_TEST]), /test id c2-readme is used twice$/],
    [() => writeExam(dir(), [{ ...README_TEST, id: 'two words' }]), /must be a short name/],
  ]
  for (const [make, pattern] of bad) {
    const from = make()
    assert.throws(() => exam.store(repo.dir, FEATURE, from, { dataDir: data }), pattern, String(pattern))
  }
  assert.throws(() => exam.store(repo.dir, 'docs/x', writeExam(dir(), [README_TEST]), { dataDir: data }), /the feature must be specs\/NNN-<topic>/)
})

test('runExam runs every test on a commit in a disposable worktree, runs a failure again, and leaves the checkout as it was', (t) => {
  const repo = repoWithSpec(t)
  const data = tempDir(t, 'aether-data-')
  const flaky = { id: 'flaky', criterion: 'C2', command: 'node .aether-exam/flaky.js', files: ['flaky.js'] }
  const FLAKY = "const fs = require('node:fs'); const f = '.aether-exam/ran'; if (fs.existsSync(f)) process.exit(0); fs.writeFileSync(f, '1'); console.log('first run fails'); process.exit(1)\n"
  exam.store(repo.dir, FEATURE, writeExam(path.join(tempDir(t), 'exam'), [FEATURE_TEST, README_TEST, flaky], { 'c1.js': C1_SCRIPT, 'flaky.js': FLAKY }), { dataDir: data })
  const base = repo.git('rev-parse', 'HEAD')

  const before = exam.runExam(repo.dir, FEATURE, { dataDir: data })
  assert.equal(before.ok, false)
  assert.equal(before.commit, base)
  assert.deepEqual(
    before.tests.map((r) => [r.id, r.criterion, r.status]),
    [
      ['c1-feature', 'C1', 'fail'],
      ['c2-readme', 'C2', 'pass'],
      ['flaky', 'C2', 'flaky'],
    ],
  )
  assert.equal(before.tests[0].exitCode, 1)
  assert.match(before.tests[2].output, /first run fails/)
  assert.deepEqual([before.passed, before.failed, before.flaky], [1, 1, 1])

  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'feature.js'), 'module.exports = 1\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'feature')
  const after = exam.runExam(repo.dir, FEATURE, { dataDir: data, ref: 'HEAD' })
  assert.equal(after.tests[0].status, 'pass')
  assert.equal(after.ok, true)
  assert.equal(exam.runExam(repo.dir, FEATURE, { dataDir: data, ref: base }).tests[0].status, 'fail', 'an earlier commit still fails')

  assert.equal(git(repo.dir, 'worktree', 'list').split('\n').length, 1)
  assert.equal(repo.git('status', '--porcelain'), '')
  assert.throws(() => exam.runExam(repo.dir, 'specs/002-none', { dataDir: data }), /no exam is stored for specs\/002-none/)
  assert.throws(() => exam.runExam(repo.dir, FEATURE, { dataDir: data, ref: 'nope' }), /nope is not a commit/)
})

test('a test that outlives its timeout fails, without a second run', (t) => {
  const repo = repoWithSpec(t)
  const data = tempDir(t, 'aether-data-')
  const slow = { id: 'slow', criterion: 'C1', command: 'sleep 5', files: [] }
  exam.store(repo.dir, FEATURE, writeExam(path.join(tempDir(t), 'exam'), [slow]), { dataDir: data })
  const started = Date.now()
  const result = exam.runExam(repo.dir, FEATURE, { dataDir: data, timeoutSeconds: 1 })
  assert.ok(Date.now() - started < 4000, 'not run twice')
  assert.equal(result.tests[0].status, 'fail')
  assert.equal(result.tests[0].timedOut, true)
})

function examCli(cwd, args, env) {
  const r = spawnSync(process.execPath, [EXAM_BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
  return { status: r.status, json: JSON.parse(r.stdout.trim().split('\n').pop()) }
}

test("aether-exam stores the checkout's .aether-exam/ and removes it, runs it, and lists it", (t) => {
  const repo = repoWithSpec(t)
  const env = { AETHER_DATA_DIR: tempDir(t, 'aether-data-') }
  // The Lead asks for the seat first; with superdelegation off the native Examiner takes it, in this checkout.
  const asked = seat(repo.dir, ['examiner', '--session', 's1', '--feature', FEATURE], { ...laneEnv(t), AETHER_SUPERDELEGATION: 'off' }, '')
  assert.equal(asked.status, 3)
  assert.equal(asked.json.unavailable, 'superdelegation-off')
  assert.equal(asked.json.native.agent, 'aether:examiner')
  writeExam(path.join(repo.dir, '.aether-exam'), [README_TEST])
  assert.equal(repo.git('status', '--porcelain'), '', '.aether-exam/ is out of git')
  const stored = examCli(repo.dir, ['store', `${FEATURE}/`], env)
  assert.equal(stored.status, 0, JSON.stringify(stored.json))
  assert.equal(stored.json.tests, 1)
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether-exam')), false)
  const ran = examCli(repo.dir, ['run', FEATURE], env)
  assert.equal(ran.status, 0)
  assert.equal(ran.json.ok, true)
  assert.deepEqual(examCli(repo.dir, ['list'], env).json.exams.map((e) => e.feature), [FEATURE])
  const bad = examCli(repo.dir, ['run'], env)
  assert.equal(bad.status, 1)
  assert.match(bad.json.error, /^usage: aether-exam/)
})

// ---- The Examiner seat ----

// What the fake agy's /usage reports so that Gemini's weekly window resets before the Claude and GPT one: Argon takes
// the Examiner, as it does when the quota that renews first is Gemini's.
const geminiFirst = () => ({
  'Gemini Models': [0.9, 0.9, null, new Date(Date.now() + 2 * 86400000).toISOString()],
  'Claude and GPT models': [0.9, 0.9, null, new Date(Date.now() + 3 * 86400000).toISOString()],
})

function seat(cwd, args, env, input) {
  const base = { ...process.env }
  for (const name of ['AETHER_SUPERDELEGATION', 'AETHER_LANE_HARNESSES']) delete base[name]
  const r = spawnSync(process.execPath, [LANE_BIN, 'seat', ...args], { cwd, input, encoding: 'utf8', env: { ...base, ...env } })
  return { status: r.status, json: JSON.parse(r.stdout.trim().split('\n').pop()), stderr: r.stderr }
}

test('an external Examiner writes the exam under .aether-exam/, and Aether stores it outside the repository', (t) => {
  const repo = repoWithSpec(t)
  const env = laneEnv(t, { quota: geminiFirst() })
  const answer = { tests: [README_TEST, { ...README_TEST, id: 'c1-file', criterion: 'C1', command: 'node .aether-exam/c1.js', files: ['c1.js'] }], notes: 'C3 needs a GPU.' }
  const input = `Write the exam of ${FEATURE}.\nFAKE-AGY: write .aether-exam/c1.js process.exit(1)\nFAKE-AGY: answer ${JSON.stringify(answer)}\n`
  const r = seat(repo.dir, ['examiner', '--session', 's1', '--author', 'sonnet', '--feature', FEATURE], env, input)
  assert.equal(r.status, 0, JSON.stringify(r.json) + r.stderr)
  assert.ok(r.json.stored.startsWith(path.join(env.AETHER_DATA_DIR, 'exams')), r.json.stored)
  assert.ok(r.json.answer.startsWith('## Exam\n- Stored: '), r.json.answer)
  assert.ok(r.json.answer.includes('- Tests: 2 (C2 1, C1 1)\n## Notes\nC3 needs a GPU.\n- Lane: agy gemini-4-argon-high'))
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(r.json.stored, 'exam.json'), 'utf8')), answer)
  assert.equal(fs.readFileSync(path.join(r.json.stored, 'c1.js'), 'utf8'), 'process.exit(1)\n')
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether-exam')), false)
  assert.equal(repo.git('status', '--porcelain'), '')

  const ran = exam.runExam(repo.dir, FEATURE, { dataDir: env.AETHER_DATA_DIR })
  assert.deepEqual(ran.tests.map((x) => [x.id, x.status]), [['c2-readme', 'pass'], ['c1-file', 'fail']])
})

test('an Examiner that writes outside .aether-exam/, or names a file it did not write, gives the round back', (t) => {
  const repo = repoWithSpec(t)
  const answer = { tests: [{ ...README_TEST, files: ['missing.js'] }], notes: '' }
  const outside = seat(repo.dir, ['examiner', '--session', 's1', '--feature', FEATURE], laneEnv(t, { quota: geminiFirst() }), `FAKE-AGY: write tests/x.test.js x\nFAKE-AGY: answer ${JSON.stringify({ tests: [README_TEST], notes: '' })}\n`)
  assert.equal(outside.status, 4)
  assert.equal(outside.json.failed, 'violation')
  assert.deepEqual(outside.json.files, ['tests/x.test.js'])
  const missing = seat(repo.dir, ['examiner', '--session', 's1', '--feature', FEATURE], laneEnv(t, { quota: geminiFirst() }), `FAKE-AGY: answer ${JSON.stringify(answer)}\n`)
  assert.equal(missing.status, 4)
  assert.equal(missing.json.detail, 'the exam cannot be stored: test c2-readme names missing.js, which is not in the exam')
  assert.equal(missing.json.native.agent, 'aether:examiner')
  assert.equal(repo.git('status', '--porcelain'), '')
})
