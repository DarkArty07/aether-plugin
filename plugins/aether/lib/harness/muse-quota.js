'use strict'

// Muse's subscription quota, renewed by one minimal real call. `muse usage` only repeats the last observation a
// model call made in the same process, so there is no free live reading: refreshMuseQuota runs one `muse exec` at
// the lowest effort through the adapter's own argv and result parsing (lib/harness/muse.js), and keeps the
// allowance it reports with the same observe(). lib/lane-quota.js asks for it.
//
// A renewal spends a real call of about 54,000 input tokens, so it is contained: the probe runs in a fresh
// temporary directory that is removed afterwards, with the lane's environment (laneEnv of lib/lane-process.js,
// which drops variables named like tokens, keys and secrets); one probe at a time runs under a lock, and a
// refresh that starts while another runs waits for it and returns the reading the holder saved; after a failed
// refresh no probe runs for 10 minutes.
// Family: harness.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { isObject, sleep } = require('../common.js')
const { commandInstalled, laneEnv } = require('../lane-process.js')
const run = require('../run.js')
const { takeLock } = require('./grok-quota.js')
const { createMuse, readingOf, windowsOf, QUOTA_SOURCE } = require('./muse.js')

// The cheapest way to ask Muse for a reading: its smallest model at the lowest effort, with a prompt that answers
// in one word.
const REFRESH_MODEL = 'muse-spark-1.3'
const REFRESH_EFFORT = 'minimal'
const REFRESH_PROMPT = 'Reply with the single word ok.'
// One call answers in seconds; past this the call is left to end on its own and brings no reading.
const TIMEOUT_MS = 90000
// After a refresh that brought no reading, no probe runs for this long.
const FAILED_BACKOFF_MS = 10 * 60 * 1000
const DIR_PREFIX = 'aether-muse-quota-'
const POLL_MS = 250

function defaultLockFile(dataDir) {
  return path.join(dataDir, 'lanes', 'muse-quota.lock')
}

function defaultFailedFile(dataDir) {
  return path.join(dataDir, 'lanes', 'quota', 'muse-refresh-failed.json')
}

function observedFile(dataDir) {
  return path.join(dataDir, 'lanes', 'quota', 'muse-observed.json')
}

// Runs argv without a shell, in cwd and with env. A spawn that fails or times out throws; otherwise the exit status
// and output come back. defaultExec of lib/harness/structured.js runs without either, so the probe has its own.
function probeExec(argv, { timeoutMs, cwd, env } = {}) {
  const result = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: timeoutMs, cwd, env, maxBuffer: 64 * 1024 * 1024 })
  if (result.error) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

// The reading of windows at `at`, in the shape the other refreshers give, or null when neither window reads.
function readingFromWindows(windows, at) {
  const reading = { windows: {}, source: { command: QUOTA_SOURCE, method: 'exec', ts: new Date(at).toISOString(), ageMinutes: 0 } }
  const fiveHours = readingOf(windows.window, at)
  const week = readingOf(windows.weekly, at)
  if (fiveHours !== null) reading.windows['5h'] = fiveHours
  if (week !== null) reading.windows.weekly = week
  return Object.keys(reading.windows).length === 0 ? null : reading
}

// The observation the holder saved, as a reading, when it was observed at or after since; otherwise null. at is the
// clock the windows are read against. Never throws.
function observedSince(dataDir, since, at) {
  try {
    const stored = JSON.parse(fs.readFileSync(observedFile(dataDir), 'utf8'))
    if (!isObject(stored) || !Number.isFinite(stored.observedAt) || stored.observedAt < since) return null
    const allowance = { window: stored.window ?? null, weekly: stored.weekly ?? null }
    const windows = windowsOf(allowance)
    if (windows === null) return null
    const reading = readingFromWindows(windows, at)
    if (reading === null) return null
    return { ...reading, source: { ...reading.source, ts: new Date(stored.observedAt).toISOString(), ageMinutes: Math.max(0, Math.floor((at - stored.observedAt) / 60000)) } }
  } catch {
    return null
  }
}

// Waits for the refresh that holds the lock (grok-quota.js takeLock, shared: one probe at a time, a left-over lock
// taken over), and takes the reading it brought: the observation it saved after that refresh started. Gives up at
// the deadline. Never throws.
async function awaitHolder({ lockFile, holder, deadline, dataDir, now, wait }) {
  const since = Number.isFinite(holder.since) ? holder.since : now()
  while (now() < deadline && fs.existsSync(lockFile)) {
    try {
      await wait(POLL_MS)
    } catch {
      return null
    }
  }
  return observedSince(dataDir, since, now())
}

// When the last failed refresh was, or null when none is recorded or the record cannot be read.
function failedAt(failedFile) {
  try {
    const at = JSON.parse(fs.readFileSync(failedFile, 'utf8'))?.at
    return Number.isFinite(at) ? at : null
  } catch {
    return null
  }
}

// Records a failed refresh; a success removes the record. Neither ever throws.
function writeFailed(failedFile, at) {
  try {
    fs.mkdirSync(path.dirname(failedFile), { recursive: true })
    fs.writeFileSync(failedFile, JSON.stringify({ at }) + '\n')
  } catch {
    // Without the record the next refresh tries again.
  }
}

function clearFailed(failedFile) {
  try {
    fs.rmSync(failedFile, { force: true })
  } catch {
    // A record that stays holds the next refresh for its backoff.
  }
}

// A new reading of Muse's quota: the 5 h and weekly windows as { remaining, resetsAt }, with the source, the shape
// the other refreshers give. Only a clean turn keeps one, so a renewal that brings no reading writes nothing: muse
// not installed, the call failed, a quota refusal, a timeout, or no allowance in the output. The probe runs in a
// fresh temporary directory, removed afterwards, with the lane's environment; env governs the call: it is filtered
// for the spawn and dataDir defaults to run.dataDir(env). One probe at a time: a refresh that starts while another
// runs waits for it and returns the reading the holder saved. After a failed refresh no probe runs for 10 minutes.
// Never throws. exec runs argv and is for tests.
async function refreshMuseQuota({
  command = 'muse',
  env = process.env,
  now = Date.now,
  exec = probeExec,
  dataDir = null,
  timeoutMs = TIMEOUT_MS,
  lockFile = null,
  failedFile = null,
  wait = sleep,
} = {}) {
  const started = now()
  const resolved = dataDir ?? run.dataDir(env)
  const lock = lockFile ?? defaultLockFile(resolved)
  const failed = failedFile ?? defaultFailedFile(resolved)
  try {
    const failedSince = failedAt(failed)
    if (failedSince !== null && started - failedSince < FAILED_BACKOFF_MS) return null
    let held = false
    let locked = false
    let holder = null
    try {
      const taken = takeLock(lock, { pid: process.pid, since: started, until: started + timeoutMs }, started)
      held = taken.taken
      locked = taken.taken
      holder = taken.holder
    } catch {
      // Without a lock the probe still runs: a reading for this decision is better than none.
      held = true
    }
    if (!held) return awaitHolder({ lockFile: lock, holder, deadline: started + timeoutMs, dataDir: resolved, now, wait })
    let reading = null
    let dir = null
    try {
      if (!commandInstalled(command, env)) return null
      const muse = createMuse({ command, env, dataDir: resolved, now: () => started })
      const argv = muse.argv({ model: REFRESH_MODEL, level: REFRESH_EFFORT, prompt: REFRESH_PROMPT })
      dir = fs.mkdtempSync(path.join(os.tmpdir(), DIR_PREFIX))
      const raw = await exec(argv, { timeoutMs, cwd: dir, env: laneEnv(env, `muse-quota/${process.pid}-${started}`) })
      const result = muse.parse({ stdout: raw?.stdout, stderr: raw?.stderr, exitCode: raw?.status ?? raw?.exitCode }, { observe: false, needsAnswer: false })
      if (!result || result.clean !== true) return null
      const windows = windowsOf(result.usage?.allowance)
      if (windows === null) return null
      reading = readingFromWindows(windows, started)
      if (reading === null) return null
      muse.observe(windows.window, windows.weekly)
      return reading
    } catch {
      return null
    } finally {
      if (reading !== null) clearFailed(failed)
      else writeFailed(failed, started)
      if (locked) {
        try {
          fs.rmSync(lock, { force: true })
        } catch {
          // A lock that stays is taken over once it is left over.
        }
      }
      if (dir !== null) fs.rmSync(dir, { recursive: true, force: true })
    }
  } catch {
    return null
  }
}

module.exports = { refreshMuseQuota, takeLock, TIMEOUT_MS, FAILED_BACKOFF_MS, REFRESH_MODEL, REFRESH_EFFORT, REFRESH_PROMPT }
