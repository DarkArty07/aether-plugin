'use strict'

// The tests must not inherit the AETHER_* variables of an Aether session (issue #69). The helper scrubs
// the variables the libs read; this file checks that it does, and that the list cannot go stale: a lib,
// bin or hook that starts reading a new AETHER_* variable fails here until the helper scrubs it.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { spawnSync } = require('node:child_process')
const { PLUGIN, AETHER_VARIABLES } = require('./helpers.js')

const HELPERS = path.join(__dirname, 'helpers.js')
const ROOT = path.join(__dirname, '..')
// The code the variables are read from. Tests are not code of the plugin, so they are not scanned.
const CODE_DIRS = ['lib', 'bin', 'hooks', 'workflows', 'launcher'].map((dir) => path.join(PLUGIN, dir))
  .concat(path.join(ROOT, 'scripts'))
// Names that match the pattern but are constants of the code, not variables: each must be declared as one.
const CONSTANTS = ['AETHER_AGENT_PREFIX', 'AETHER_TASK_PREFIX']

function codeFiles() {
  const files = []
  for (const dir of CODE_DIRS) {
    for (const entry of fs.readdirSync(dir, { recursive: true })) {
      const file = path.join(dir, entry)
      if (/\.test\./.test(entry) || entry.includes('node_modules')) continue
      if (fs.statSync(file).isFile()) files.push(file)
    }
  }
  return files
}

const FILES = codeFiles()
const TEXT = new Map(FILES.map((file) => [file, fs.readFileSync(file, 'utf8')]))

function namesIn(text) {
  return [...text.matchAll(/\bAETHER_[A-Z][A-Z0-9_]*/g)].map((m) => m[0])
}

test('the helper scrubs the AETHER_* variables of the libs from the environment a test hands on', () => {
  // A child process that loads the helper, started with every variable an Aether session exports set.
  const session = Object.fromEntries(AETHER_VARIABLES.map((name) => [name, 'set-by-session']))
  const r = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(HELPERS)}); process.stdout.write(JSON.stringify(Object.keys(process.env).filter((k) => k.startsWith('AETHER_'))))`], {
    encoding: 'utf8',
    env: { ...process.env, ...session },
  })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(JSON.parse(r.stdout), [])
})

test('every AETHER_* name the code reads is one the helper scrubs', () => {
  const read = new Set(FILES.flatMap((file) => namesIn(TEXT.get(file))))
  // The scan must find the variables the libs read; an empty scan would pass for the wrong reason.
  for (const name of ['AETHER_DATA_DIR', 'AETHER_SUPERDELEGATION', 'AETHER_LANE_HARNESSES']) assert.ok(read.has(name), `the scan does not see ${name}`)
  const unknown = [...read].filter((name) => !AETHER_VARIABLES.includes(name) && !CONSTANTS.includes(name)).sort()
  assert.deepEqual(unknown, [], `the code reads AETHER_* variables that tests/helpers.js does not scrub: add them to AETHER_VARIABLES`)
})

test('the names the code builds at run time are none, so the scan sees every variable', () => {
  const dynamic = FILES.filter((file) => /AETHER_(\$\{|['"`]\s*\+)/.test(TEXT.get(file))).map((file) => path.relative(ROOT, file))
  assert.deepEqual(dynamic, [])
})

test('the names that are not variables are constants of the code', () => {
  for (const name of CONSTANTS) {
    const declared = FILES.some((file) => TEXT.get(file).includes(`const ${name} =`))
    assert.ok(declared, `${name} is not declared as a constant`)
  }
})
