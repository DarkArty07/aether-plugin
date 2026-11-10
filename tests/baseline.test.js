'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { failureSignatures, judge } = require('../plugins/aether/lib/baseline.js')

test('TAP and node:test failures are named, with the number dropped and file or suite lines included', () => {
  const output = [
    'TAP version 13',
    'ok 1 - passes',
    'not ok 2 - adds 1 + 2',
    '  ---',
    '  error: boom',
    '  ...',
    '# Subtest: suite',
    '    not ok 3 - inner case # time=1.2ms',
    'not ok 4 - tests/a.test.js',
  ].join('\n')
  assert.deepEqual(failureSignatures(output), ['adds 1 + 2', 'inner case', 'tests/a.test.js'])
})

test('the same failure with another number, duration, timing or spacing is one signature', () => {
  assert.deepEqual(failureSignatures('not ok 12 - adds  1 + 2 # time=5.2ms\nnot ok 3 - adds 1 + 2  \n'), ['adds 1 + 2'])
})

test('Jest and Vitest failures are named by test and by file, without their durations', () => {
  const output = [
    ' PASS  src/a.test.js',
    ' FAIL  src/b.test.js',
    '  ✓ adds (2 ms)',
    '  ✕ subtracts 2 - 1 (5 ms)',
    '  × multiplies (12ms)',
    '  ✗ divides [3ms]',
  ].join('\n')
  assert.deepEqual(failureSignatures(output), ['divides', 'multiplies', 'src/b.test.js', 'subtracts 2 - 1'])
})

test('a Jest suite, a pytest module and a Go package that fail to run are named by their file or package', () => {
  assert.deepEqual(failureSignatures(' FAIL  src/b.test.js\n  ● Test suite failed to run\n'), ['src/b.test.js'])
  assert.deepEqual(failureSignatures('ERROR tests/test_b.py - ImportError: No module named b\n'), ['tests/test_b.py'])
  assert.deepEqual(failureSignatures('FAIL\tgithub.com/x/pkg [build failed]\nFAIL\n'), ['github.com/x/pkg'])
})

test('Python unittest failures are named by their test and class', () => {
  const output = [
    'FAIL: test_one (tests.test_a.TestA.test_one)',
    'Traceback (most recent call last):',
    'ERROR: test_two (tests.test_a.TestA.test_two)',
  ].join('\n')
  assert.deepEqual(failureSignatures(output), ['test_one (tests.test_a.TestA.test_one)', 'test_two (tests.test_a.TestA.test_two)'])
})

test('colour codes on a FAIL line do not hide the file it names', () => {
  assert.deepEqual(failureSignatures('\x1b[1m\x1b[41m FAIL \x1b[49m\x1b[22m \x1b[2msrc/b.test.js\x1b[22m\n'), ['src/b.test.js'])
})

test('judge blocks a run that breaks a whole suite, module or package, when its other failure is known', () => {
  assert.deepEqual(judge({ signatures: ['adds 1 + 2'] }, { exitCode: 1, output: '  ✕ adds 1 + 2 (3 ms)\n FAIL  src/b.test.js\n  ● Test suite failed to run\n' }), {
    pass: false,
    reason: 'new failures',
    new: ['src/b.test.js'],
  })
  assert.deepEqual(judge({ signatures: ['tests/test_a.py::test_one'] }, { exitCode: 1, output: 'FAILED tests/test_a.py::test_one - AssertionError\nERROR tests/test_b.py - ImportError: boom\n' }), {
    pass: false,
    reason: 'new failures',
    new: ['tests/test_b.py'],
  })
  assert.deepEqual(judge({ signatures: ['TestAdd'] }, { exitCode: 1, output: '--- FAIL: TestAdd (0.01s)\nFAIL\tgithub.com/x/pkg [build failed]\nFAIL\n' }), {
    pass: false,
    reason: 'new failures',
    new: ['github.com/x/pkg'],
  })
})

test('judge passes a run whose suite, module or package fails as it did in the baseline', () => {
  assert.deepEqual(judge({ signatures: ['src/b.test.js'] }, { exitCode: 1, output: ' FAIL  src/b.test.js\n  ● Test suite failed to run\n' }), {
    pass: true,
    known: ['src/b.test.js'],
  })
  assert.deepEqual(judge({ signatures: ['tests/test_b.py'] }, { exitCode: 1, output: 'ERROR tests/test_b.py - ImportError: boom\n' }), {
    pass: true,
    known: ['tests/test_b.py'],
  })
  assert.deepEqual(judge({ signatures: ['github.com/x/pkg'] }, { exitCode: 1, output: 'FAIL\tgithub.com/x/pkg [build failed]\nFAIL\n' }), {
    pass: true,
    known: ['github.com/x/pkg'],
  })
})

test('judge blocks a run with an unnamed TAP failure as unparsed, even when its named failures are known', () => {
  assert.deepEqual(judge({ signatures: ['a'] }, { exitCode: 1, output: 'not ok 1 - a\nnot ok 3\n' }), { pass: false, reason: 'unparsed' })
  assert.deepEqual(judge({ signatures: ['a'] }, { exitCode: 1, output: '\x1b[31mnot ok 3\x1b[39m\n' }), { pass: false, reason: 'unparsed' })
})

test('colour codes that a runner prints when forced do not hide a failure name', () => {
  const output = '\x1b[31m  ✕\x1b[39m subtracts (5 ms)\n\x1b[31mnot ok 2 - adds\x1b[39m\n'
  assert.deepEqual(failureSignatures(output), ['adds', 'subtracts'])
})

test('pytest failures are named by their node id', () => {
  const output = [
    '=========== short test summary info ===========',
    'FAILED tests/test_a.py::test_one - AssertionError: assert 1 == 2',
    'FAILED tests/test_b.py::test_two[1-2]',
    '1 failed, 3 passed in 0.12s',
  ].join('\n')
  assert.deepEqual(failureSignatures(output), ['tests/test_a.py::test_one', 'tests/test_b.py::test_two[1-2]'])
})

test('Go failures are named by their test, subtests included', () => {
  const output = [
    '=== RUN   TestAdd',
    '--- FAIL: TestAdd (0.01s)',
    '    --- FAIL: TestAdd/negative (0.00s)',
    '--- PASS: TestSub (0.00s)',
    'FAIL',
  ].join('\n')
  assert.deepEqual(failureSignatures(output), ['TestAdd', 'TestAdd/negative'])
})

test('output with no failing test gives no signatures, with CRLF line ends too', () => {
  assert.deepEqual(failureSignatures('ok 1 - a\n1..1\n# pass 1\n'), [])
  assert.deepEqual(failureSignatures(''), [])
  assert.deepEqual(failureSignatures(undefined), [])
  assert.deepEqual(failureSignatures('not ok 2 - b\r\nnot ok 1 - a\r\n'), ['a', 'b'])
})

test('judge passes a command that exits 0, with or without a baseline', () => {
  assert.deepEqual(judge(null, { exitCode: 0, output: '' }), { pass: true })
  assert.deepEqual(judge({ signatures: ['a'] }, { exitCode: 0, output: 'not ok 1 - a' }), { pass: true })
})

test('judge blocks a failing run when there is no baseline', () => {
  assert.deepEqual(judge(null, { exitCode: 1, output: 'not ok 1 - a' }), { pass: false, reason: 'no baseline' })
})

test('judge blocks a failing run whose output names no test', () => {
  assert.deepEqual(judge({ signatures: [] }, { exitCode: 1, output: 'boom' }), { pass: false, reason: 'unparsed' })
})

test('judge passes a failing run whose every failure is in the baseline, and names them', () => {
  const baseline = { signatures: ['a', 'b'] }
  assert.deepEqual(judge(baseline, { exitCode: 1, output: 'not ok 1 - b\nnot ok 2 - a' }), { pass: true, known: ['a', 'b'] })
  assert.deepEqual(judge({ signatures: ['adds 1 + 2'] }, { exitCode: 1, output: 'not ok 9 - adds 1 + 2 # time=3ms' }), {
    pass: true,
    known: ['adds 1 + 2'],
  })
})

test('judge blocks a failing run with a failure the baseline does not list, and names only the new ones', () => {
  const baseline = { signatures: ['a'] }
  assert.deepEqual(judge(baseline, { exitCode: 1, output: 'not ok 1 - a\nnot ok 2 - c\nnot ok 3 - d' }), {
    pass: false,
    reason: 'new failures',
    new: ['c', 'd'],
  })
})

test('judge treats a baseline with no signatures as one with no known failures', () => {
  assert.deepEqual(judge({ signatures: [] }, { exitCode: 1, output: 'not ok 1 - a' }), {
    pass: false,
    reason: 'new failures',
    new: ['a'],
  })
})

test('recordBaseline stops the whole process group of a test run that outlives its timeout (R9)', (t) => {
  const dir = tempDir(t)
  const pidFile = path.join(dir, 'base.pid')
  const { recordBaseline } = require('../plugins/aether/lib/plan-compile.js')
  const result = recordBaseline(dir, `sleep 60 & echo $! > '${pidFile}'; wait`, { timeoutMs: 400 })
  assert.equal(result.timedOut, true)
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  let alive = true
  for (let i = 0; i < 100 && alive; i++) {
    try {
      process.kill(pid, 0)
      require('../plugins/aether/lib/common.js').sleepSync(20)
    } catch {
      alive = false
    }
  }
  assert.equal(alive, false)
})

test("unittest's closing FAILED line and log lines that start with ERROR name no failure", () => {
  assert.deepEqual(failureSignatures('FAILED (failures=2)\nFAILED (errors=1, failures=3)'), [])
  assert.deepEqual(failureSignatures('ERROR connecting to the database\nERROR 2026-10-10T10:00:00Z retrying'), [])
  assert.deepEqual(failureSignatures('ERROR tests/test_b.py - ImportError: no module\nERROR tests/test_a.py::test_x[a b] - fixture missing'), [
    'tests/test_a.py::test_x[a b]',
    'tests/test_b.py',
  ])
  // A known unittest failure passes again when the closing count changes with it.
  const baseline = { signatures: failureSignatures('FAIL: test_a (pkg.T)\nFAIL: test_b (pkg.T)\nFAILED (failures=2)') }
  assert.deepEqual(judge(baseline, { exitCode: 1, output: 'FAIL: test_a (pkg.T)\nFAILED (failures=1)' }), { pass: true, known: ['test_a (pkg.T)'] })
})

test('aether-plan compile refuses in a Lead session when an open autonomous run hit time, cost, or quota stop, and leaves non-Lead sessions unchanged', (t) => {
  const { makeRepo, writePlan, runBin, PLAN_BIN } = require('./helpers.js')
  const { plan, task } = require('./plan-fixtures.js')
  const repo = makeRepo(t)
  const autonomy = require('../plugins/aether/lib/autonomy.js')
  const { markSession } = require('../plugins/aether/lib/session.js')
  const dataDir = tempDir(t, 'aether-plan-data-')
  const configDir = tempDir(t, 'aether-plan-cfg-')
  const projDir = path.join(configDir, 'projects', 'proj-plan')
  fs.mkdirSync(projDir, { recursive: true })
  const t0 = Date.now() - 2 * 3600 * 1000
  fs.writeFileSync(
    path.join(projDir, 'sess-p.jsonl'),
    JSON.stringify({
      type: 'user',
      isSidechain: false,
      origin: { kind: 'human' },
      entrypoint: 'sdk-cli',
      timestamp: new Date(t0).toISOString(),
      message: { role: 'user', content: 'work unattended for 1 hour' },
    }) + '\n'
  )
  markSession(dataDir, 'sess-p', 1000, { repo: repo.dir, claude: null })

  const started = autonomy.start(
    repo.dir,
    { quote: 'work unattended for 1 hour', session: 'sess-p', hours: 1, usd: 5 },
    { configDir, dataDir, now: t0 }
  )
  assert.equal(started.ok, true)

  const tasksFile = writePlan(repo.dir, plan([task(1), task(2)]))

  // Time stop in Lead session
  const resTime = runBin(PLAN_BIN, ['compile', tasksFile, '--no-lanes'], repo.dir, {
    AETHER_DATA_DIR: dataDir,
    CLAUDE_CODE_SESSION_ID: 'sess-p',
  })
  assert.notEqual(resTime.status, 0)
  assert.match(resTime.json.errors[0], new RegExp(started.run.id))
  assert.match(resTime.json.errors[0], /aether-autonomy end --outcome ceiling/)

  // Non-Lead session compiles normally (C7)
  const resPlain = runBin(PLAN_BIN, ['compile', tasksFile, '--no-lanes'], repo.dir, {
    AETHER_DATA_DIR: dataDir,
    CLAUDE_CODE_SESSION_ID: 'plain-session',
  })
  assert.equal(resPlain.status, 0)

  // Quota and cost stops in Lead session
  autonomy.end(repo.dir, 'ceiling', { now: Date.now() - 1000 })
  const started2 = autonomy.start(
    repo.dir,
    { quote: 'work unattended for 1 hour', session: 'sess-p', hours: 10, usd: 5 },
    { configDir, dataDir, now: Date.now() }
  )
  assert.equal(started2.ok, true)
  const resetsAt = new Date(Date.now() + 3600 * 1000).toISOString()
  autonomy.recordCrossing(
    repo.dir,
    { kind: 'five_hour', percentUsed: 80, resetsAt, threshold: 80 },
    { now: Date.now(), dataDir }
  )
  const resQuota = runBin(PLAN_BIN, ['compile', tasksFile, '--no-lanes'], repo.dir, {
    AETHER_DATA_DIR: dataDir,
    CLAUDE_CODE_SESSION_ID: 'sess-p',
  })
  assert.notEqual(resQuota.status, 0)
  assert.match(resQuota.json.errors[0], /aether-autonomy end --outcome incomplete/)

  autonomy.end(repo.dir, 'incomplete', { now: Date.now() })
  const started3 = autonomy.start(
    repo.dir,
    { quote: 'work unattended for 1 hour', session: 'sess-p', hours: 10, usd: 5 },
    { configDir, dataDir, now: Date.now() }
  )
  assert.equal(started3.ok, true)
  autonomy.spend(repo.dir, 5, 'u1', { now: Date.now() })
  const resCost = runBin(PLAN_BIN, ['compile', tasksFile, '--no-lanes'], repo.dir, {
    AETHER_DATA_DIR: dataDir,
    CLAUDE_CODE_SESSION_ID: 'sess-p',
  })
  assert.notEqual(resCost.status, 0)
  assert.match(resCost.json.errors[0], new RegExp(started3.run.id))
  assert.match(resCost.json.errors[0], /aether-autonomy end --outcome ceiling/)
})
