'use strict'

// The renewal of the Muse quota reading: one minimal `muse exec` call takes a new allowance, the way
// refreshGrokQuota asks grok. The fake muse (tests/fixtures/fake-muse.js) acts out each answer, so no test
// calls the real `muse` and spends no tokens. The data directory comes through AETHER_DATA_DIR, so nothing
// touches the owner's real data.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tempDir, useDataDir } = require('./helpers.js')
const { refreshMuseQuota, takeLock, TIMEOUT_MS, FAILED_BACKOFF_MS } = require('../plugins/aether/lib/harness/muse-quota.js')

const FAKE_MUSE = path.join(__dirname, 'fixtures', 'fake-muse.js')
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0)
const HOUR = 3600000
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)

let n = 0
const rec = (type, payload) =>
  JSON.stringify({ schema_version: 1, id: `id-${++n}`, stream: { kind: 'session', id: 's1' }, sequence: n, recorded_at: n, record_type: 'event', durability: 'durable', causation_id: 'c1', payload_type: type, payload_schema_version: 1, payload })
const completed = (text) => rec('run.terminal.completed', { kind: 'run_terminal', terminal: 'completed', reason: null, text })
const failed = (reason) => rec('run.terminal.failed', { kind: 'run_terminal', terminal: 'failed', reason, text: null })
const usage = (allowance = null) =>
  rec('run.usage', { kind: 'run_usage', allowance, calls: 1, completed_calls: 1, failed_calls: 0, cancelled_calls: 0, children_included: false, models: [{ model: 'muse-spark-1.3', calls: 1, input_tokens: 100, output_tokens: 10, cached_tokens: 0, reasoning_tokens: 5 }] })
const out = (...lines) => `${lines.join('\n')}\n`
const allowance = (used5, usedWeek) => ({ tier: 'power', window: { usedPercent: used5, resetsAtMs: NOW + 3 * HOUR, windowDurationMins: 300 }, weekly: { usedPercent: usedWeek, resetsAtMs: NOW + 5 * 24 * HOUR } })

const observedFile = (dataDir) => path.join(dataDir, 'lanes', 'quota', 'muse-observed.json')

// The fake muse's script and its log of calls, through the environment the spawned process inherits.
function useFake(t, script) {
  fs.chmodSync(FAKE_MUSE, 0o755)
  const log = path.join(tempDir(t, 'muse-quota-log-'), 'muse.log')
  const previous = { script: process.env.AETHER_FAKE_MUSE_SCRIPT, log: process.env.AETHER_FAKE_MUSE_LOG }
  process.env.AETHER_FAKE_MUSE_SCRIPT = JSON.stringify(script)
  process.env.AETHER_FAKE_MUSE_LOG = log
  t.after(() => {
    for (const [key, value] of [['AETHER_FAKE_MUSE_SCRIPT', previous.script], ['AETHER_FAKE_MUSE_LOG', previous.log]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  return log
}

const callsOf = (log) => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line).argv) : [])
const entriesOf = (log) => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [])
const refresh = (extra = {}) => refreshMuseQuota({ command: FAKE_MUSE, now: () => NOW, ...extra })
const failedFile = (dataDir) => path.join(dataDir, 'lanes', 'quota', 'muse-refresh-failed.json')
const lockFile = (dataDir) => path.join(dataDir, 'lanes', 'muse-quota.lock')

test('the renewal waits 90 seconds by default, and a failed one backs off for 10 minutes', () => {
  assert.equal(TIMEOUT_MS, 90000)
  assert.equal(FAILED_BACKOFF_MS, 10 * 60 * 1000)
})

test('an allowance in the output saves the observed file and returns the reading, from one minimal call', async (t) => {
  const dataDir = useDataDir(t)
  const log = useFake(t, { stdout: out(completed('ok'), usage(allowance(72, 40))) })
  const reading = await refresh()
  assert.deepEqual(Object.keys(reading.windows).sort(), ['5h', 'weekly'])
  near(reading.windows['5h'].remaining, 0.28)
  near(reading.windows.weekly.remaining, 0.6)
  assert.equal(reading.windows['5h'].resetsAt, new Date(NOW + 3 * HOUR).toISOString())
  assert.equal(reading.windows.weekly.resetsAt, new Date(NOW + 5 * 24 * HOUR).toISOString())
  assert.deepEqual(reading.source, { command: 'muse exec --json', method: 'exec', ts: new Date(NOW).toISOString(), ageMinutes: 0 })
  const kept = JSON.parse(fs.readFileSync(observedFile(dataDir), 'utf8'))
  assert.deepEqual([kept.observedAt, kept.window.usedPercent, kept.weekly.usedPercent], [NOW, 72, 40])
  const calls = callsOf(log)
  assert.equal(calls.length, 1, 'one muse exec call')
  const [argv] = calls
  assert.ok(argv.includes('exec') && argv.includes('--json'), 'headless JSON run')
  assert.equal(argv[argv.indexOf('--model') + 1], 'muse-spark-1.3')
  assert.equal(argv[argv.indexOf('--reasoning-effort') + 1], 'minimal')
  assert.equal(argv.at(-1), 'Reply with the single word ok.')
})

test('no allowance in the output gives null and writes nothing', async (t) => {
  const dataDir = useDataDir(t)
  useFake(t, { stdout: out(completed('ok'), usage(null)) })
  assert.equal(await refresh(), null)
  assert.equal(fs.existsSync(observedFile(dataDir)), false)
})

test('a missing muse gives null without running anything', async (t) => {
  const dataDir = useDataDir(t)
  const log = useFake(t, { stdout: out(completed('ok'), usage(allowance(10, 10))) })
  assert.equal(await refreshMuseQuota({ command: path.join(tempDir(t, 'muse-quota-bin-'), 'muse'), now: () => NOW }), null)
  assert.equal(fs.existsSync(log), false, 'no process was launched')
  assert.equal(fs.existsSync(observedFile(dataDir)), false)
})

test('a failing exit gives null and writes nothing', async (t) => {
  const dataDir = useDataDir(t)
  useFake(t, { exit: 2, stderr: 'error: bad flag\n' })
  assert.equal(await refresh(), null)
  assert.equal(fs.existsSync(observedFile(dataDir)), false)
})

test('a quota refusal gives null and writes nothing', async (t) => {
  const dataDir = useDataDir(t)
  const resetsAtMs = NOW + 4 * HOUR
  useFake(t, { stdout: out(failed({ kind: 'modelError', message: 'limit', retryable: false, quota: { limitKind: 'tierLimit', resetsAtMs } })), exit: 1 })
  assert.equal(await refresh(), null)
  assert.equal(fs.existsSync(observedFile(dataDir)), false)
})

test('a timeout gives null and writes nothing', async (t) => {
  const dataDir = useDataDir(t)
  useFake(t, { sleepMs: 10000, stdout: out(completed('ok'), usage(allowance(10, 10))) })
  assert.equal(await refresh({ timeoutMs: 300 }), null)
  assert.equal(fs.existsSync(observedFile(dataDir)), false)
})

test('the probe runs in a fresh temporary directory with the lane environment, and the directory is removed afterwards', async (t) => {
  const dataDir = useDataDir(t)
  const log = useFake(t, { stdout: out(completed('ok'), usage(allowance(72, 40))) })
  const previous = process.env.META_API_KEY
  process.env.META_API_KEY = 'muse-quota-secret'
  t.after(() => (previous === undefined ? delete process.env.META_API_KEY : (process.env.META_API_KEY = previous)))
  const reading = await refresh()
  assert.notEqual(reading, null)
  const [entry] = entriesOf(log)
  assert.notEqual(entry.cwd, process.cwd(), 'not the caller directory')
  assert.ok(entry.cwd.startsWith(os.tmpdir()), entry.cwd)
  assert.ok(path.basename(entry.cwd).startsWith('aether-muse-quota-'), entry.cwd)
  assert.equal(entry.metaApiKey, false, 'the lane environment drops META_API_KEY')
  assert.equal(entry.home, process.env.HOME, 'HOME stays, because the CLI keeps its login there')
  assert.equal(fs.existsSync(entry.cwd), false, 'the temporary directory is removed afterwards')
  assert.equal(fs.existsSync(lockFile(dataDir)), false, 'no lock is left')
})

test('the env option governs the call: the data directory comes from it and secrets in it are dropped', async (t) => {
  fs.chmodSync(FAKE_MUSE, 0o755)
  const dataDir = tempDir(t, 'aether-data-')
  const log = path.join(tempDir(t, 'muse-quota-log-'), 'muse.log')
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    AETHER_DATA_DIR: dataDir,
    AETHER_FAKE_MUSE_SCRIPT: JSON.stringify({ stdout: out(completed('ok'), usage(allowance(72, 40))) }),
    AETHER_FAKE_MUSE_LOG: log,
    META_API_KEY: 'muse-quota-secret',
  }
  const reading = await refreshMuseQuota({ command: FAKE_MUSE, now: () => NOW, env })
  assert.notEqual(reading, null)
  assert.ok(fs.existsSync(observedFile(dataDir)), 'the observation lands in the env data directory')
  assert.equal(entriesOf(log)[0].metaApiKey, false)
})

test('a refresh that starts while another holds the lock waits and returns the reading the holder saved, without calling muse', async (t) => {
  const dataDir = useDataDir(t)
  const log = useFake(t, { stdout: out(completed('ok'), usage(allowance(72, 40))) })
  const taken = takeLock(lockFile(dataDir), { pid: process.pid, since: NOW, until: NOW + 60000 }, NOW)
  assert.deepEqual(taken, { taken: true, holder: null })
  const pending = refresh()
  await new Promise((resolve) => setTimeout(resolve, 300))
  fs.mkdirSync(path.dirname(observedFile(dataDir)), { recursive: true })
  fs.writeFileSync(observedFile(dataDir), JSON.stringify({ observedAt: NOW, window: { usedPercent: 72, resetsAtMs: NOW + 3 * HOUR }, weekly: { usedPercent: 40, resetsAtMs: NOW + 5 * 24 * HOUR } }))
  fs.rmSync(lockFile(dataDir), { force: true })
  const reading = await pending
  assert.deepEqual(Object.keys(reading.windows).sort(), ['5h', 'weekly'])
  near(reading.windows['5h'].remaining, 0.28)
  near(reading.windows.weekly.remaining, 0.6)
  assert.equal(fs.existsSync(log), false, 'no muse call was made')
})

test('two refreshes at once make one muse call and both return the reading the holder saved', async (t) => {
  useDataDir(t)
  // The children run on the real clock, so the resets are ahead of it, not of the fixed NOW of this file.
  const at = Date.now()
  const live = { tier: 'power', window: { usedPercent: 72, resetsAtMs: at + 3 * HOUR, windowDurationMins: 300 }, weekly: { usedPercent: 40, resetsAtMs: at + 5 * 24 * HOUR } }
  const log = useFake(t, { sleepMs: 1200, stdout: out(completed('ok'), usage(live)) })
  const lib = path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'harness', 'muse-quota.js')
  const script = `const m = require(${JSON.stringify(lib)}); m.refreshMuseQuota({ command: ${JSON.stringify(FAKE_MUSE)} }).then((r) => process.stdout.write(JSON.stringify(r)))`
  const runChild = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script], { env: process.env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
  const [first, second] = await Promise.all([runChild(), runChild()])
  assert.equal(first.code, 0, first.stderr)
  assert.equal(second.code, 0, second.stderr)
  const a = JSON.parse(first.stdout)
  const b = JSON.parse(second.stdout)
  assert.deepEqual(a, b)
  assert.deepEqual(Object.keys(a.windows).sort(), ['5h', 'weekly'])
  assert.equal(callsOf(log).length, 1, 'one muse exec call for both refreshes')
})

test('a failed refresh is not retried for 10 minutes, and a success removes the record', async (t) => {
  const dataDir = useDataDir(t)
  const log = useFake(t, { exit: 2, stderr: 'error: bad flag\n' })
  assert.equal(await refresh(), null)
  assert.equal(callsOf(log).length, 1)
  assert.deepEqual(JSON.parse(fs.readFileSync(failedFile(dataDir), 'utf8')), { at: NOW })
  assert.equal(await refresh(), null, 'the next pick makes no call')
  assert.equal(await refresh({ now: () => NOW + 10 * 60 * 1000 - 1 }), null, '9:59 later still nothing')
  assert.equal(callsOf(log).length, 1)
  process.env.AETHER_FAKE_MUSE_SCRIPT = JSON.stringify({ stdout: out(completed('ok'), usage(allowance(72, 40))) })
  const reading = await refresh({ now: () => NOW + 10 * 60 * 1000 })
  assert.notEqual(reading, null, 'at 10 minutes the refresh tries again')
  assert.equal(callsOf(log).length, 2)
  assert.equal(fs.existsSync(failedFile(dataDir)), false, 'a success removes the record')
})

test('it never throws: an exec that fails, unreadable output and an unwritable data directory give null or a reading', async (t) => {
  useDataDir(t)
  useFake(t, {})
  assert.equal(await refresh({ exec: () => { throw new Error('spawn ENOENT') } }), null)
  assert.equal(await refresh({ exec: async () => ({ status: 0, stdout: 'hello, not records\n', stderr: '' }) }), null)
  const file = path.join(tempDir(t, 'muse-quota-data-'), 'a-file')
  fs.writeFileSync(file, 'not a directory')
  const reading = await refresh({ exec: async () => ({ status: 0, stdout: out(completed('ok'), usage(allowance(10, 10))), stderr: '' }), dataDir: file })
  assert.notEqual(reading, null, 'a reading that cannot be kept is still a reading')
  near(reading.windows['5h'].remaining, 0.9)
})
