'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WT_BIN, makeRepo, compile, commitIn, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { gateCommand } = require('../plugins/aether/lib/wt-gate.js')
const { GATE_CUT } = require('../plugins/aether/lib/ladder.js')
const { runTests } = require('../plugins/aether/lib/delegate-checks.js')

// check.js is the plan's test command. It passes while src/t1/bad.js is absent, so the run's baseline is clean;
// with it present it fails the way `behavior` says.
const CHECKS = {
  newFailure: "if (require('fs').existsSync('src/t1/bad.js')) { console.log('not ok 1 - tests/new.test.js'); process.exit(1) }\nconsole.log('# pass 12')\n",
  unreadable: "if (require('fs').existsSync('src/t1/bad.js')) { console.error('boom'); process.exit(3) }\nconsole.log('# pass 12')\n",
  hang: "if (require('fs').existsSync('src/t1/bad.js')) setTimeout(() => {}, 20000)\n",
  known: "console.log('not ok 1 - tests/old.test.js')\nconsole.log('# pass 11')\nprocess.exit(1)\n",
  knownAndNew: "console.log('not ok 1 - tests/old.test.js')\nif (require('fs').existsSync('src/t1/bad.js')) console.log('not ok 2 - tests/new.test.js')\nprocess.exit(1)\n",
  // The known failure comes first and 400,000 characters of passing tests follow it (issue 134).
  knownBeforeALongOutput: "console.log('not ok 1 - tests/old.test.js')\nfor (let i = 0; i < 6000; i++) console.log('ok ' + i + ' - ' + 'x'.repeat(60))\nconsole.log('# pass 5999')\nprocess.exit(1)\n",
  marker: "require('fs').writeFileSync('ran.txt', '1')\n",
  namedSubtest: "if (require('fs').existsSync('src/t1/bad.js')) { console.log('not ok 1 - adds the numbers'); process.exit(1) }\nconsole.log('# pass 12')\n",
  loud: "for (let i = 0; i < 3000; i++) console.log('ok ' + i + ' - a passing test with a name that is not short')\nconsole.log('# pass 3000')\n",
  subtestAndFile: "if (require('fs').existsSync('src/t1/bad.js')) { console.log('not ok 1 - adds the numbers'); console.log('not ok 2 - tests/new.test.js'); process.exit(1) }\nconsole.log('# pass 12')\n",
}

function unit(t, check) {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'check.js', check, 'add the check')
  const args = compile(repo, plan([task(1), task(2)], { execution: ['- Test command: `node check.js`'] }))
  const created = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  return { repo, args, wt: created.path }
}
const gate = (u, opts) => gateCommand(u.repo.dir, u.args.runId, 'task-1', opts)

test('an attempt that changed only what the task owns and passes the tests passes the gate', (t) => {
  const u = unit(t, CHECKS.newFailure)
  commitIn(u.repo, u.wt, 'src/t1/a.js', 'one\n', 'add a')
  const g = gate(u)
  assert.deepEqual([g.pass, g.checks, g.findings, g.timedOut, g.files], [true, 'pass', [], false, ['src/t1/a.js']])
  assert.match(g.tests, /# pass 12/)
})

test('the tests summary is the last lines of the run, never the whole output the baseline match reads', (t) => {
  const u = unit(t, CHECKS.loud)
  commitIn(u.repo, u.wt, 'src/t1/a.js', 'one\n', 'add a')
  const g = gate(u)
  assert.equal(g.pass, true)
  assert.ok(g.tests.length <= 2000, `the summary has ${g.tests.length} characters`)
  assert.ok(g.tests.split('\n').length <= 25)
  assert.match(g.tests, /# pass 3000/)
})

test('a file outside Owns fails the gate with the file named, and the tests do not run', (t) => {
  const u = unit(t, CHECKS.marker)
  commitIn(u.repo, u.wt, 'src/other/x.js', 'x\n', 'add x')
  const g = gate(u)
  assert.deepEqual([g.pass, g.checks], [false, 'fail'])
  assert.deepEqual(g.findings, [{ file: 'src/other/x.js', what: 'fuera de Owns' }])
  assert.equal(fs.existsSync(path.join(u.wt, 'ran.txt')), false)
})

test('an uncommitted file outside Owns counts too', (t) => {
  const u = unit(t, CHECKS.newFailure)
  commitIn(u.repo, u.wt, 'src/t1/a.js', 'one\n', 'add a')
  fs.mkdirSync(path.join(u.wt, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(u.wt, 'docs/notes.md'), 'x\n')
  assert.deepEqual(gate(u).findings, [{ file: 'docs/notes.md', what: 'fuera de Owns' }])
})

test('an attempt that changed nothing fails with the first Owns entry', (t) => {
  const u = unit(t, CHECKS.newFailure)
  const g = gate(u)
  assert.equal(g.pass, false)
  assert.deepEqual(g.findings, [{ file: 'src/t1/**', what: 'el intento no cambió ningún archivo' }])
})

test('a test that fails and was not failing before the run names its file', (t) => {
  const u = unit(t, CHECKS.newFailure)
  commitIn(u.repo, u.wt, 'src/t1/bad.js', 'x\n', 'break it')
  const g = gate(u)
  assert.equal(g.pass, false)
  assert.deepEqual(g.findings, [{ file: 'tests/new.test.js', what: 'la prueba falló', own: null }])
})

test('a failing subtest whose name is not a path is a finding that names it, with npm test as the file when the output names no file', (t) => {
  const u = unit(t, CHECKS.namedSubtest)
  commitIn(u.repo, u.wt, 'src/t1/bad.js', 'x\n', 'break it')
  const g = gate(u)
  assert.equal(g.pass, false)
  assert.deepEqual(g.findings, [{ file: 'npm test', what: 'falló: adds the numbers', own: null }])
})

test('a subtest name takes its file from a path-like failure of the same output', (t) => {
  const u = unit(t, CHECKS.subtestAndFile)
  commitIn(u.repo, u.wt, 'src/t1/bad.js', 'x\n', 'break it')
  assert.deepEqual(gate(u).findings, [
    { file: 'tests/new.test.js', what: 'falló: adds the numbers', own: null },
    { file: 'tests/new.test.js', what: 'la prueba falló', own: null },
  ])
})

test('a failure the output does not name falls back to npm test with the exit code, and the tail goes in detail', (t) => {
  const u = unit(t, CHECKS.unreadable)
  commitIn(u.repo, u.wt, 'src/t1/bad.js', 'x\n', 'break it')
  const g = gate(u)
  assert.deepEqual(g.findings, [{ file: 'npm test', what: 'salió con 3' }])
  assert.match(g.detail, /boom/)
})

test('a failure that the baseline already had does not fail the gate', (t) => {
  const u = unit(t, CHECKS.known)
  commitIn(u.repo, u.wt, 'src/t1/a.js', 'one\n', 'add a')
  const g = gate(u)
  assert.deepEqual([g.pass, g.findings, g.knownFailures], [true, [], ['tests/old.test.js']])
  assert.match(g.tests, /known failures only: tests\/old\.test\.js/)
})

test('a failure that the baseline already had does not fail the gate, however long the output that follows it (issue 134)', (t) => {
  const u = unit(t, CHECKS.knownBeforeALongOutput)
  commitIn(u.repo, u.wt, 'src/t1/a.js', 'one\n', 'add a')
  const g = gate(u)
  assert.deepEqual([g.pass, g.findings, g.knownFailures], [true, [], ['tests/old.test.js']])
  assert.ok(g.tests.length <= 2000, 'the summary stays short')
})

test('a known failure does not excuse a new one: only the new one is a finding', (t) => {
  const u = unit(t, CHECKS.knownAndNew)
  commitIn(u.repo, u.wt, 'src/t1/bad.js', 'x\n', 'break it')
  assert.deepEqual(gate(u).findings, [{ file: 'tests/new.test.js', what: 'la prueba falló', own: null }])
})

test('tests cut at the limit are a gate failure that says so', (t) => {
  const u = unit(t, CHECKS.hang)
  commitIn(u.repo, u.wt, 'src/t1/bad.js', 'x\n', 'hang')
  const g = gate(u, { timeoutMs: 3000 })
  assert.deepEqual([g.pass, g.timedOut], [false, true])
  assert.deepEqual(g.findings, [{ file: 'npm test', what: 'superó el tiempo límite' }])
  assert.deepEqual(g.findings, [GATE_CUT], 'the finding is the one the ladder recognizes (#112)')
})

test('the bin prints the gate as one JSON line, and a run with no unit worktree is an error', (t) => {
  const u = unit(t, CHECKS.newFailure)
  commitIn(u.repo, u.wt, 'src/t1/a.js', 'one\n', 'add a')
  const r = runBin(WT_BIN, ['gate', u.args.runId, 'task-1'], u.repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.pass, true)
  const none = runBin(WT_BIN, ['gate', u.args.runId, 'task-2'], u.repo.dir)
  assert.equal(none.status, 1)
  assert.match(none.json.error, /worktree/)
})

test('runTests keeps a longer tail when asked, and 4000 characters otherwise', () => {
  const command = "node -e \"console.log('x'.repeat(9000))\""
  assert.equal(runTests(process.cwd(), command).outputTail.length, 4000)
  assert.ok(runTests(process.cwd(), command, { tailChars: 20000 }).outputTail.length > 9000)
})

test('a red test with a location outside Owns carries own: false, and one inside Owns carries own: true', (t) => {
  const tapForeign = [
    "if (require('fs').existsSync('src/t1/bad.js')) {",
    "  console.log('not ok 1 - foreign assertion');",
    "  console.log('  ---');",
    "  console.log(\"  location: '\" + process.cwd() + \"/tests/other.test.js:12:3'\");",
    "  console.log('  ...');",
    "  process.exit(1);",
    "}",
  ].join('\n')
  const u1 = unit(t, tapForeign)
  commitIn(u1.repo, u1.wt, 'src/t1/bad.js', 'x\n', 'break it')
  const g1 = gate(u1)
  assert.equal(g1.pass, false)
  assert.equal(g1.findings[0].own, false)

  const tapOwned = [
    "if (require('fs').existsSync('src/t1/bad.js')) {",
    "  console.log('not ok 1 - owned assertion');",
    "  console.log('  ---');",
    "  console.log(\"  location: '\" + process.cwd() + \"/src/t1/a.test.js:4:5'\");",
    "  console.log('  ...');",
    "  process.exit(1);",
    "}",
  ].join('\n')
  const u2 = unit(t, tapOwned)
  commitIn(u2.repo, u2.wt, 'src/t1/bad.js', 'x\n', 'break it')
  const g2 = gate(u2)
  assert.equal(g2.pass, false)
  assert.equal(g2.findings[0].own, true)
})

test('a red test without a location carries own: null explicitly, unless its name appears in an owned test file', (t) => {
  const u1 = unit(t, CHECKS.namedSubtest)
  commitIn(u1.repo, u1.wt, 'src/t1/bad.js', 'x\n', 'break it')
  const g1 = gate(u1)
  assert.equal(g1.pass, false)
  assert.equal('own' in g1.findings[0], true)
  assert.equal(g1.findings[0].own, null)

  const u2 = unit(t, CHECKS.namedSubtest)
  commitIn(u2.repo, u2.wt, 'src/t1/bad.js', 'x\n', 'break it')
  commitIn(u2.repo, u2.wt, 'src/t1/a.test.js', "test('adds the numbers', () => {})\n", 'add owned test')
  const g2 = gate(u2)
  assert.equal(g2.pass, false)
  assert.equal(g2.findings[0].own, true)
})

test('a red test without a location whose name appears only in an owned source file does not carry own: true', (t) => {
  const u = unit(t, CHECKS.namedSubtest)
  commitIn(u.repo, u.wt, 'src/t1/bad.js', "const label = 'adds the numbers'\n", 'mention test name in owned source')
  const g = gate(u)
  assert.equal(g.pass, false)
  assert.notEqual(g.findings[0].own, true)
  assert.equal(g.findings[0].own, null)
})

test('a red test whose location is outside the worktree carries own: null explicitly', (t) => {
  const tapOutside = [
    "if (require('fs').existsSync('src/t1/bad.js')) {",
    "  console.log('not ok 1 - outside wt');",
    "  console.log('  ---');",
    "  console.log(\"  location: '/tmp/outside-worktree/foo.test.js:1:1'\");",
    "  console.log('  ...');",
    "  process.exit(1);",
    "}",
  ].join('\n')
  const u = unit(t, tapOutside)
  commitIn(u.repo, u.wt, 'src/t1/bad.js', 'x\n', 'break it')
  const g = gate(u)
  assert.equal(g.pass, false)
  assert.equal('own' in g.findings[0], true)
  assert.equal(g.findings[0].own, null)
})

test('a red test without a location whose name appears only in an owned test file over MAX_TEST_BYTES does not carry own: true', (t) => {
  const u = unit(t, CHECKS.namedSubtest)
  commitIn(u.repo, u.wt, 'src/t1/bad.js', 'x\n', 'break it')
  commitIn(u.repo, u.wt, 'src/t1/big.test.js', `${'x'.repeat(512 * 1024 + 100)}\ntest('adds the numbers', () => {})\n`, 'add oversized owned test')
  const g = gate(u)
  assert.equal(g.pass, false)
  assert.notEqual(g.findings[0].own, true)
  assert.equal(g.findings[0].own, null)
})

test('a red test without a location whose name appears in an owned foo.test.mjs at the worktree root carries own: true', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'check.js', CHECKS.namedSubtest, 'add the check')
  const args = compile(repo, plan([task(1, { owns: '`src/t1/**`, `foo.test.mjs`' }), task(2)], { execution: ['- Test command: `node check.js`'] }))
  const created = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  const u = { repo, args, wt: created.path }
  commitIn(repo, u.wt, 'src/t1/bad.js', 'x\n', 'break it')
  commitIn(repo, u.wt, 'foo.test.mjs', "test('adds the numbers', () => {})\n", 'add root mjs test')
  const g = gate(u)
  assert.equal(g.pass, false)
  assert.equal(g.findings[0].own, true)
})
