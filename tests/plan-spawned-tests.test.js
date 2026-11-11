'use strict'

// The tests that run a lib through its bin (issue 188): a bin that loads a lib directly, and a test that runs the
// bin as a process and never requires the lib, exercise that lib too, so the warning of a changed lib sees them. So does
// a test that reaches the bin through a helper file's constant, or through a helper function it imports (one hop only).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, makeRepo, runBin, writePlan } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

// The bin-run warnings of a check, from a repository with the given files and a plan of the given tasks.
function binWarningsOf(t, files, tasks) {
  const repo = makeRepo(t)
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo.dir, file)), { recursive: true })
    fs.writeFileSync(path.join(repo.dir, file), text)
  }
  const r = runBin(PLAN_BIN, ['check', writePlan(repo.dir, plan(tasks))], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  return r.json.warnings.filter((w) => w.includes(' but not the tests that exercise them'))
}

const NOT_OWNED = 'but not the tests that exercise them, which it and the tasks it depends on do not own'
const LIB = 'plugins/aether/lib/thing.js'
const BIN = 'plugins/aether/bin/aether-thing'
const LIB_TEXT = 'module.exports = 1\n'
const REQUIRE_BIN = "#!/usr/bin/env node\n'use strict'\nconst { x } = require('../lib/thing.js')\n"
// A test that runs the bin as a process and never requires the lib.
const RUNS_BIN = [
  "const path = require('node:path')",
  "const { spawnSync } = require('node:child_process')",
  "const bin = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-thing')",
  'assert.equal(spawnSync(process.execPath, [bin]).status, 0)',
  '',
].join('\n')
const THING_CLI = 'tests/thing-cli.test.js'
const BY_BIN = `Task 1 changes ${LIB} ${NOT_OWNED}: ${THING_CLI} (no task owns it; runs the lib through its bin aether-thing)`

test('a test that runs the bin of a changed lib warns, and names the bin (issue 188)', (t) => {
  assert.deepEqual(binWarningsOf(t, { [LIB]: LIB_TEXT, [BIN]: REQUIRE_BIN, [THING_CLI]: RUNS_BIN }, [task(1, { owns: `\`${LIB}\`` })]), [
    BY_BIN,
  ])
})

test('the same test in Owns, or owned by a task the changing task depends on, does not warn (issue 188)', (t) => {
  const files = { [LIB]: LIB_TEXT, [BIN]: REQUIRE_BIN, [THING_CLI]: RUNS_BIN }
  assert.deepEqual(binWarningsOf(t, files, [task(1, { owns: `\`${LIB}\`, \`${THING_CLI}\`` })]), [])
  assert.deepEqual(
    binWarningsOf(t, files, [task(1, { owns: `\`${THING_CLI}\`` }), task(2, { owns: `\`${LIB}\``, depends: 'Task 1 — its test' })]),
    [],
  )
})

test('a test that names another bin, or a bin whose name only starts like the changed one, does not warn (issue 188)', (t) => {
  const files = {
    [LIB]: LIB_TEXT,
    [BIN]: REQUIRE_BIN,
    'plugins/aether/lib/other.js': LIB_TEXT,
    'plugins/aether/bin/aether-other': "require('../lib/other.js')\n",
    'tests/other-cli.test.js': "spawnSync(process.execPath, ['plugins/aether/bin/aether-other'])\n",
    'tests/extra-cli.test.js': "spawnSync(process.execPath, ['plugins/aether/bin/aether-thing-extra'])\n",
  }
  assert.deepEqual(binWarningsOf(t, files, [task(1, { owns: `\`${LIB}\`` })]), [])
})

test('a lib loaded only by another lib, not by the bin, is not exercised through that bin (issue 188)', (t) => {
  const files = {
    [LIB]: LIB_TEXT,
    'plugins/aether/lib/wrapper.js': "const thing = require('./thing.js')\nmodule.exports = thing\n",
    'plugins/aether/bin/aether-wrapper': "require('../lib/wrapper.js')\n",
    'tests/wrapper-cli.test.js': "spawnSync(process.execPath, ['plugins/aether/bin/aether-wrapper'])\n",
  }
  assert.deepEqual(binWarningsOf(t, files, [task(1, { owns: `\`${LIB}\`` })]), [])
})

test('a bin that loads its lib through path.join(__dirname, ...) counts too (issue 188)', (t) => {
  const pathJoinBin = "const { x } = require(path.join(__dirname, '..', 'lib', 'thing.js'))\n"
  assert.deepEqual(binWarningsOf(t, { [LIB]: LIB_TEXT, [BIN]: pathJoinBin, [THING_CLI]: RUNS_BIN }, [task(1, { owns: `\`${LIB}\`` })]), [
    BY_BIN,
  ])
})

test('a test that requires the lib and also runs its bin is named as a direct test, without the bin note (issue 188)', (t) => {
  const direct = "const { x } = require('../plugins/aether/lib/thing.js')\n" + RUNS_BIN
  assert.deepEqual(binWarningsOf(t, { [LIB]: LIB_TEXT, [BIN]: REQUIRE_BIN, [THING_CLI]: direct }, [task(1, { owns: `\`${LIB}\`` })]), [
    `Task 1 changes ${LIB} ${NOT_OWNED}: ${THING_CLI} (no task owns it)`,
  ])
})

// A helper file of the test folder, as tests/helpers.js is: it names the bin through a constant, and a function of it
// runs the bin through that constant. The helper is owned by the changing task, so only the tests warn (issue 188).
const HELPERS = 'tests/thing-helpers.js'
const HELPER_TEXT = [
  "'use strict'",
  "const path = require('node:path')",
  "const { spawnSync } = require('node:child_process')",
  "const ROOT = path.join(__dirname, '..', 'plugins', 'aether')",
  "const THING_BIN = path.join(ROOT, 'bin', 'aether-thing')",
  'function runThing(args) {',
  '  return spawnSync(process.execPath, [THING_BIN, ...args])',
  '}',
  'module.exports = { THING_BIN, runThing }',
  '',
].join('\n')
const HELPER_FILES = { [LIB]: LIB_TEXT, [BIN]: REQUIRE_BIN, [HELPERS]: HELPER_TEXT }
const HELPER_OWNS = `\`${LIB}\`, \`${HELPERS}\``

test('a test that runs the bin only through a helper constant warns, and names the bin (issue 188)', (t) => {
  const constantTest = [
    "const { spawnSync } = require('node:child_process')",
    "const { THING_BIN } = require('./thing-helpers.js')",
    "spawnSync(process.execPath, [THING_BIN, '--help'])",
    '',
  ].join('\n')
  const files = { ...HELPER_FILES, 'tests/thing-constant.test.js': constantTest }
  assert.deepEqual(binWarningsOf(t, files, [task(1, { owns: HELPER_OWNS })]), [
    `Task 1 changes ${LIB} ${NOT_OWNED}: tests/thing-constant.test.js (no task owns it; runs the lib through its bin aether-thing)`,
  ])
})

test('a test that runs the bin only through a helper function it imports warns, and names the bin (issue 188)', (t) => {
  const functionTest = ["const { runThing } = require('./thing-helpers.js')", "runThing(['--help'])", ''].join('\n')
  const files = { ...HELPER_FILES, 'tests/thing-function.test.js': functionTest }
  assert.deepEqual(binWarningsOf(t, files, [task(1, { owns: HELPER_OWNS })]), [
    `Task 1 changes ${LIB} ${NOT_OWNED}: tests/thing-function.test.js (no task owns it; runs the lib through its bin aether-thing)`,
  ])
})
