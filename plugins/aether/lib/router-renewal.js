'use strict'

// Background renewal of a harness's quota reading for delegate tasks under <dataDir>/router/ with source 'router'.
// Launches detached renewal processes and manages locks under <dataDir>/router/renewing/ and readings under <dataDir>/router/readings/.
// Family: router.

const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { pidAlive, sleep } = require('./common.js')
const { createAdapter: defaultCreateAdapter } = require('./harness/index.js')
const { readGroups: defaultReadGroups } = require('./lane-readings.js')
const { readingFile } = require('./router-quota.js')

// A renewal lasts at most grok's 10 s over ACP and 20 s through its UI, agy's 60 s, or muse's 90 s over one exec
// call: past this a lock belongs to a process that died.
const RENEWAL_LIFE_MS = 120000
const RENEWABLE = ['agy', 'codex', 'grok', 'muse']
// How many times a decision tries to take the lock, when it finds a left-over lock or loses a race for it.
const TAKE_ATTEMPTS = 3

function lockFile(dataDir, harness) {
  return path.join(dataDir, 'router', 'renewing', `${harness}.json`)
}

function renewalArgv(harness, { node = process.execPath, pluginRoot = path.join(__dirname, '..') } = {}) {
  return [node, path.join(pluginRoot, 'bin', 'aether-delegate'), 'renew', '--harness', harness]
}

// What renews a harness whose adapter cannot take a new reading itself: grok's adapter only reads its log, and its
// refresh asks grok over ACP, then through its UI (lane-quota.js does the same); muse's reading is only what its
// last call reported, and its refresh takes a new one over one minimal exec call. Loaded only when a renewal runs.
const REFRESHERS = {
  grok: (settings) => require('./harness/grok-quota.js').refreshGrokQuota({ command: settings.command }),
  muse: (settings) => require('./harness/muse-quota.js').refreshMuseQuota({ command: settings.command }),
}

let writeCounter = 0

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.${++writeCounter}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(value) + '\n')
    fs.renameSync(tmp, file)
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

// Takes a new reading of one harness and saves it where the router reads it, as { readAt, groups }, the shape of
// peekReadings. settings is the harness's entry in the lane table. A harness with a refresher gets its reading from it,
// shared by every group of its entry, as the lanes show a refresh; any other is read fresh through its adapter
// (readGroups with fresh: true, which also renews the reading the lanes keep). Resolves to what it saved; rejects,
// writing nothing, when no reading came. now is a clock; createAdapter, readGroups and refreshers are for tests.
async function renewReading({
  harness,
  settings,
  dataDir,
  now = Date.now,
  createAdapter = defaultCreateAdapter,
  readGroups = defaultReadGroups,
  refreshers = REFRESHERS,
}) {
  if (!RENEWABLE.includes(harness)) throw new Error('the router renews only agy, codex, grok or muse')
  if (settings === null || typeof settings !== 'object') throw new Error(`the lane table has no ${harness} harness`)
  let saved
  if (Object.hasOwn(refreshers, harness)) {
    const reading = await refreshers[harness](settings)
    if (reading === null || typeof reading !== 'object') throw new Error(`${harness} gave no new reading`)
    const groups = Object.fromEntries(Object.keys(settings.groups ?? {}).map((key) => [key, { ...reading }]))
    saved = { readAt: now(), groups }
  } else {
    const read = readGroups(createAdapter(harness, settings), { harness, settings, dataDir, now: now(), fresh: true })
    saved = { readAt: read.readAt, groups: read.groups }
  }
  writeAtomic(readingFile(dataDir, harness), saved)
  return saved
}

// Launches the renewal in a process that outlives its caller, and returns its pid. A process that cannot start has no
// pid, and throws.
function spawnRenewal(harness, { argv = renewalArgv(harness) } = {}) {
  const child = childProcess.spawn(argv[0], argv.slice(1), { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
  if (!Number.isInteger(child.pid)) throw new Error(`the renewal of ${harness} did not start`)
  return child.pid
}

// The lock as `{ pid, since }`, or null when there is none. A lock that cannot be read, because its holder is still
// writing it, or that is damaged, has no pid and dates from its file.
function readLock(file) {
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return null
  }
  try {
    const lock = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (lock && (lock.pid === null || Number.isInteger(lock.pid)) && Number.isFinite(lock.since)) {
      return { pid: lock.pid, since: lock.since }
    }
  } catch (err) {
    if (err.code === 'ENOENT') return null
  }
  return { pid: null, since: stat.mtimeMs }
}

function lockLive(lock, now, alive) {
  if (lock.since + RENEWAL_LIFE_MS <= now) return false
  if (lock.pid === null) return true
  try {
    return Boolean(alive(lock.pid))
  } catch {
    return false
  }
}

// Removes a left-over lock, unless another decision replaced it since it was read.
function removeLeftOver(file, seen) {
  const current = readLock(file)
  if (!current || current.pid !== seen.pid || current.since !== seen.since) return
  try {
    fs.unlinkSync(file)
  } catch {}
}

function startRenewal({ dataDir, harness, now = Date.now(), alive = pidAlive, spawn = spawnRenewal }) {
  const idle = { started: false, running: false }
  if (!RENEWABLE.includes(harness)) return idle
  try {
    const file = lockFile(dataDir, harness)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    for (let attempt = 0; attempt < TAKE_ATTEMPTS; attempt++) {
      const lock = readLock(file)
      if (lock) {
        if (lockLive(lock, now, alive)) return { started: false, running: true }
        removeLeftOver(file, lock)
      }
      try {
        fs.writeFileSync(file, JSON.stringify({ pid: null, since: now }), { flag: 'wx' })
      } catch (err) {
        if (err.code === 'EEXIST') continue
        return idle
      }
      let pid
      try {
        pid = spawn(harness)
      } catch {
        try {
          fs.unlinkSync(file)
        } catch {}
        return idle
      }
      try {
        fs.writeFileSync(file, JSON.stringify({ pid, since: now }))
      } catch {}
      return { started: true, running: true }
    }
    return { started: false, running: true }
  } catch {
    return idle
  }
}

// Waits for a valid reading, checking it every pollMs, for no longer than waitMs.
async function waitForReading({ isValid, waitMs, now = Date.now, sleep: sleepFn = sleep, pollMs = 250 }) {
  const limit = Number.isFinite(waitMs) && waitMs > 0 ? waitMs : 0
  const start = now()
  for (;;) {
    let valid = false
    try {
      valid = Boolean(isValid())
    } catch {}
    const waitedMs = now() - start
    if (valid) return { valid: true, waitedMs }
    if (waitedMs >= limit) return { valid: false, waitedMs }
    await sleepFn(Math.min(pollMs, limit - waitedMs))
  }
}

module.exports = {
  RENEWAL_LIFE_MS,
  RENEWABLE,
  lockFile,
  renewalArgv,
  renewReading,
  spawnRenewal,
  startRenewal,
  waitForReading,
}
