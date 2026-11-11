'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const lanes = require('../plugins/aether/lib/lanes.js')
const { tempDir } = require('./helpers.js')

// The --edits smoke call (issue 189): the fake codex writes probe.test.js and answers with a tests verdict, and the
// script runs that test outside the sandbox itself.
const SMOKE = path.join(__dirname, '..', 'scripts', 'lane-smoke.js')
const FAKE = path.join(__dirname, 'fixtures', 'fake-codex.js')

const PROBE = [
  "const test = require('node:test')",
  "const assert = require('node:assert/strict')",
  "const { spawnSync } = require('node:child_process')",
  "test('a child process with pipes runs', () => {",
  "  const r = spawnSync('git', ['--version'])",
  '  assert.equal(r.error, undefined)',
  '  assert.equal(r.status, 0)',
  '  assert.match(String(r.stdout), /git version/)',
  '})',
  '',
].join('\n')

// A lane table whose codex is the fake, with a script the fake plays: the files it writes and the answer it gives.
function setup(t, script) {
  fs.chmodSync(FAKE, 0o755)
  const dir = tempDir(t)
  const config = JSON.parse(fs.readFileSync(lanes.CONFIG_FILE, 'utf8'))
  config.harnesses.codex.command = FAKE
  const file = path.join(dir, 'lanes.json')
  fs.writeFileSync(file, JSON.stringify(config))
  const log = path.join(dir, 'log')
  const env = {
    ...process.env,
    AETHER_LANES_CONFIG: file,
    AETHER_FAKE_CODEX_LOG: log,
    AETHER_FAKE_CODEX_SCRIPT: JSON.stringify(script),
  }
  return { dir, env, log }
}

function callsOf(log) {
  return fs.readFileSync(log, 'utf8').trim().split('\n').map((entry) => JSON.parse(entry))
}

function printed(r) {
  return JSON.parse(r.stdout.trim().split('\n').at(-1))
}

test('--edits: a probe that runs its child process passes, the report says so, and the call is ok (issue 189)', (t) => {
  const { env, log } = setup(t, {
    answer: '{"status":"done","file":"probe.test.js","tests":"pass","detail":""}',
    files: { 'probe.test.js': PROBE },
  })
  const r = spawnSync(process.execPath, [SMOKE, 'codex', 'gpt-6-luna', '--edits'], { env, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const line = printed(r)
  assert.equal(line.ok, true)
  assert.equal(line.edits, true)
  assert.equal(line.tests, 'pass')
  assert.equal(line.testsOutside, 'pass')
  assert.equal(line.networkOpen, true)
  assert.equal('detail' in line, false)
  const [call] = callsOf(log)
  assert.ok(call.argv.includes('sandbox_workspace_write.network_access=true'))
})

test('--edits: a probe the answer marks as failed exits 1 and the report carries the detail', (t) => {
  const detail = 'spawnSync git EPERM'
  const { env } = setup(t, {
    answer: JSON.stringify({ status: 'done', file: 'probe.test.js', tests: 'fail', detail }),
    files: { 'probe.test.js': PROBE },
  })
  const r = spawnSync(process.execPath, [SMOKE, 'codex', 'gpt-6-luna', '--edits'], { env, encoding: 'utf8' })
  assert.equal(r.status, 1, r.stdout + r.stderr)
  const line = printed(r)
  assert.equal(line.ok, false)
  assert.equal(line.tests, 'fail')
  assert.equal(line.detail, detail)
  assert.equal(line.networkOpen, true)
})

test('--edits: an answer of pass without the probe file is not ok', (t) => {
  const { env } = setup(t, {
    answer: '{"status":"done","file":"probe.test.js","tests":"pass","detail":""}',
  })
  const r = spawnSync(process.execPath, [SMOKE, 'codex', 'gpt-6-luna', '--edits'], { env, encoding: 'utf8' })
  assert.equal(r.status, 1, r.stdout + r.stderr)
  const line = printed(r)
  assert.equal(line.ok, false)
  assert.equal(line.tests, 'pass')
})

test('without --edits the call has no network_access and the report has none of the new fields', (t) => {
  const { env, log } = setup(t, {
    answer: '{"status":"done","file":"hello.txt"}',
    files: { 'hello.txt': 'lane ok\n' },
  })
  const r = spawnSync(process.execPath, [SMOKE, 'codex', 'gpt-6-luna'], { env, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const line = printed(r)
  for (const key of ['edits', 'tests', 'detail', 'testsOutside', 'networkOpen']) {
    assert.equal(key in line, false, key)
  }
  const [call] = callsOf(log)
  assert.equal(call.argv.some((arg) => arg.includes('network_access')), false)
})
