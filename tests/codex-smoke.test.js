'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const lanes = require('../plugins/aether/lib/lanes.js')
const { tempDir } = require('./helpers.js')

const SMOKE = path.join(__dirname, '..', 'scripts', 'lane-smoke.js')
const FAKE = path.join(__dirname, 'fixtures', 'fake-codex.js')

// A lane table whose codex is the fake, and a fake that writes the file the smoke call asks for.
function setup(t) {
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
    AETHER_FAKE_CODEX_SCRIPT: JSON.stringify({ answer: '{"status":"done","file":"hello.txt"}', files: { 'hello.txt': 'lane ok\n' } }),
  }
  return { dir, env, log }
}

test('the smoke call takes the five levels, passes the level to codex as it is, and keeps the raw output when asked (R21)', (t) => {
  const { dir, env, log } = setup(t)
  const raw = path.join(dir, 'raw.txt')
  const r = spawnSync(process.execPath, [SMOKE, 'codex', 'gpt-6-luna', '--effort', 'max', '--raw', raw], { env, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const line = JSON.parse(r.stdout.trim().split('\n').at(-1))
  assert.deepEqual([line.ok, line.harness, line.model, line.effort, line.raw], [true, 'codex', 'gpt-6-luna', 'max', raw])
  const text = fs.readFileSync(raw, 'utf8')
  assert.ok(text.includes('"type":"turn.completed"'), 'the raw stdout is there')
  assert.ok(text.includes('--- stderr ---'))
  const [call] = fs.readFileSync(log, 'utf8').trim().split('\n').map((entry) => JSON.parse(entry))
  assert.ok(call.argv.includes('model_reasoning_effort=max'))
})

test('without --raw the printed line is the one of today, and an unknown level or a bare --raw is a usage error', (t) => {
  const { env } = setup(t)
  const plain = spawnSync(process.execPath, [SMOKE, 'codex', 'gpt-6-luna', '--effort', 'xhigh'], { env, encoding: 'utf8' })
  assert.equal(plain.status, 0, plain.stdout + plain.stderr)
  assert.equal('raw' in JSON.parse(plain.stdout.trim().split('\n').at(-1)), false)
  for (const args of [['--effort', 'ultra'], ['--raw']]) {
    const bad = spawnSync(process.execPath, [SMOKE, 'codex', 'gpt-6-luna', ...args], { env, encoding: 'utf8' })
    assert.equal(bad.status, 2, args.join(' '))
    assert.match(bad.stderr, /usage: node scripts\/lane-smoke\.js/)
  }
})
