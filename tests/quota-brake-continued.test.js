'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { PLUGIN, makeRepo, tempDir, runBin } = require('./helpers.js')
const { fileKey } = require('../plugins/aether/lib/delegate-log.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-autonomy')
const SESSION_A = 'sess-continued-A'
const SESSION_B = 'sess-continued-B'
const SESSION_C = 'sess-C'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'

const human = (text, time) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, entrypoint: 'sdk-cli', timestamp: time, message: { role: 'user', content: text } })

function isAlive(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] !== 'Z'
  } catch {
    return false
  }
}

function waitForDeath(pid, ms) {
  const deadline = Date.now() + ms
  while (isAlive(pid) && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  return isAlive(pid)
}

test('quota-brake stops the delegate chains of a continued run previous session', (t) => {
  const repo = makeRepo(t)
  const config = tempDir(t, 'aether-claude-')
  const folder = path.join(config, 'projects', '-repo')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${SESSION_A}.jsonl`), human(HOURS, '2026-10-21T09:00:00.000Z') + '\n')
  const dataDir = tempDir(t, 'aether-data-')
  const env = { CLAUDE_CONFIG_DIR: config, AETHER_DATA_DIR: dataDir }

  // 1. Open an autonomous run in session A, with live delegate chains.
  const started = runBin(BIN, ['start', '--quote', HOURS, '--session', SESSION_A], repo.dir, env)
  assert.equal(started.status, 0, started.stdout + started.stderr)
  const autoId = started.json.started.id
  const runFile = path.join(repo.dir, '.aether', 'autonomy', autoId, 'run.json')
  const state = JSON.parse(fs.readFileSync(runFile, 'utf8'))
  state.started = new Date(Date.now() - 60_000).toISOString()
  fs.writeFileSync(runFile, JSON.stringify(state))

  const runDir = path.join(dataDir, 'delegates', 'run')
  fs.mkdirSync(runDir, { recursive: true })
  const spawnChain = (session, task, readyName) => {
    const ready = path.join(dataDir, readyName)
    const proc = spawn(process.execPath, ['-e', `require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ok'); setInterval(() => {}, 60000)`], {
      detached: true,
      stdio: 'ignore',
    })
    proc.unref()
    t.after(() => { try { process.kill(-proc.pid, 'SIGKILL') } catch {} })
    const deadline = Date.now() + 5000
    while (!fs.existsSync(ready)) {
      if (Date.now() > deadline) throw new Error('timed out waiting for sleeper')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
    fs.writeFileSync(path.join(runDir, `${fileKey(session, task)}.json`), JSON.stringify({ pid: proc.pid, startedAt: Date.now() }))
    assert.equal(isAlive(proc.pid), true)
    return proc.pid
  }
  const pidA = spawnChain(SESSION_A, 't1', 'sleeper-A.ready')
  const pidC = spawnChain(SESSION_C, 't2', 'sleeper-C.ready')

  // 2. Continue the run into session B, with its own live delegate chain.
  const continued = runBin(BIN, ['continue', autoId, '--session', SESSION_B], repo.dir, env)
  assert.equal(continued.status, 0, continued.stdout + continued.stderr)
  const pidB = spawnChain(SESSION_B, 't1', 'sleeper-B.ready')

  // 3. Record the quota pause, and run quota-brake from session B.
  const crossing = runBin(
    BIN,
    ['brake-crossing', '--kind', 'five_hour', '--percent', '96', '--resets-at', new Date(Date.now() + 3600_000).toISOString(), '--threshold', '95', '--notify', 'sent', '--session', SESSION_B],
    repo.dir,
    env,
  )
  assert.equal(crossing.status, 0, crossing.stdout + crossing.stderr)
  assert.equal(crossing.json.paused, true, JSON.stringify(crossing.json))
  const brake = runBin(BIN, ['quota-brake', '--session', SESSION_B], repo.dir, env)
  assert.equal(brake.status, 0, brake.stdout + brake.stderr)

  // 4. The chains of the run's sessions (A and B) are stopped; the crossing recorded the
  // pause, and quota-brake reports how many chains it stopped. A session outside the run stays alive.
  assert.equal(waitForDeath(pidA, 2000), false, 'sleeper of session A chain is still alive')
  assert.equal(waitForDeath(pidB, 2000), false, 'sleeper of session B chain is still alive')
  assert.equal(isAlive(pidC), true, 'sleeper of the unrelated session was stopped')
  assert.ok(brake.stdout.includes('chains stopped 2'), brake.stdout)
})
