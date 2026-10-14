'use strict'

// Grok's weekly quota, read from the log its interactive UI writes. This is interim, until grok gives the quota some
// other way: `grok -p /usage` sends the text to the model, and headless mode prints no quota. When its UI starts,
// grok appends `billing: fetched credits config` lines to ~/.grok/logs/unified.jsonl, with the plan's current weekly
// period and, when some of it is used, `creditUsagePercent`. grok 1.0.13 left it out in the first lines of a period,
// minutes after it began, and gave 8 to 100 later; 1.0.41's and 1.0.52's lines of 2026-10-14 leave it out, which is
// read as nothing used yet. readGrokQuota reads the newest of these lines; refreshGrokQuota opens the UI for a few
// seconds, with no prompt, so that grok writes a new one.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const lanes = require('../lanes.js')
const run = require('../run.js')

const BILLING_MESSAGE = 'billing: fetched credits config'
// The log grows by megabytes, and grok writes these lines when its UI starts: the newest is near the end.
const TAIL_BYTES = 1024 * 1024
const TIMEOUT_MS = 20000
const POLL_MS = 250
// What lanes.killMarked waits between SIGTERM and SIGKILL. A refresh polls for no longer than its timeout less
// this, so that killing the UI still ends inside the timeout.
const KILL_WAIT_MS = 2000
// A lock whose holder outlived its own deadline by this much is left over from a refresh that died.
const LOCK_GRACE_MS = 5000
// How old a reading may be before `aether-lane quota` calls it stale and a wave's quota step refreshes it. A reading
// stays valid until its period ends, whatever its age.
const STALE_MS = 30 * 60 * 1000

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// The log grok writes under HOME. A lane's environment drops GROK_HOME, so lanes and refreshes always use ~/.grok.
function defaultLogFile(env = process.env) {
  return path.join(env.HOME || os.homedir(), '.grok', 'logs', 'unified.jsonl')
}

function defaultLockFile(env = process.env) {
  return path.join(run.dataDir(env), 'lanes', 'grok-quota.lock')
}

// The last bytes of file as text, without the first line when the cut fell inside it, or null when it cannot be read.
function tailText(file, bytes = TAIL_BYTES) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const size = fs.fstatSync(fd).size
    const start = Math.max(0, size - bytes)
    const buffer = Buffer.alloc(size - start)
    const read = fs.readSync(fd, buffer, 0, buffer.length, start)
    const text = buffer.toString('utf8', 0, read)
    return start === 0 ? text : text.slice(text.indexOf('\n') + 1)
  } catch {
    return null
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

// The billing lines of text, each with its time. A line that is not JSON, such as one grok is still writing, and a
// billing line without a time are skipped.
function billingEntries(text) {
  const entries = []
  for (const line of text.split('\n')) {
    if (!line.includes(BILLING_MESSAGE)) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (!isObject(entry) || entry.msg !== BILLING_MESSAGE) continue
    const time = Date.parse(entry.ts)
    if (Number.isFinite(time)) entries.push({ entry, time })
  }
  return entries
}

// The newest billing entry of text by its time, the later line on a tie, or null.
function newestEntry(text) {
  let newest = null
  for (const item of billingEntries(text)) {
    if (newest === null || item.time >= newest.time) newest = item
  }
  return newest
}

// The reading of one billing entry at now, or null when its period has ended or its config cannot be read.
// remaining is the share of the week left; a missing creditUsagePercent reads as none used, and says so.
function readingOf({ entry, time }, now, logFile = null) {
  const config = isObject(entry.ctx) && isObject(entry.ctx.config) ? entry.ctx.config : null
  const end = Date.parse(config?.currentPeriod?.end)
  if (!Number.isFinite(end) || end <= now) return null
  const percent = config.creditUsagePercent
  const absent = percent === undefined || percent === null
  if (!absent && !Number.isFinite(percent)) return null
  const used = absent ? 0 : Math.min(100, Math.max(0, percent))
  return {
    windows: { weekly: { remaining: (100 - used) / 100, resetsAt: new Date(end).toISOString() } },
    source: {
      log: logFile,
      ts: new Date(time).toISOString(),
      pid: Number.isInteger(entry.pid) ? entry.pid : null,
      version: typeof entry.ver === 'string' ? entry.ver : null,
      ageMinutes: Math.max(0, Math.floor((now - time) / 60000)),
    },
    usedPercent: absent ? null : percent,
    usedPercentAbsent: absent,
  }
}

// The newest reading in the last megabyte of grok's log at now (ms), or null when there is no log, no billing line,
// or the newest one is unreadable or from a period that has ended.
function readGrokQuota({ logFile = defaultLogFile(), now = Date.now() } = {}) {
  const text = tailText(logFile)
  if (text === null) return null
  const newest = newestEntry(text)
  return newest === null ? null : readingOf(newest, now, logFile)
}

function quote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`
}

// Opens grok's UI on a terminal of its own: grok's UI needs one, and script(1) gives it a pseudo-terminal. script
// runs detached, in a process group of its own; the pipe on its stdin is never written or closed, so grok never
// reads an end of input. Returns the child, or null when script or grok is not installed or cannot start.
function launchUi({ command, cwd, env }) {
  const script = lanes.commandPath('script', env)
  const grok = lanes.commandPath(command, env)
  if (script === null || grok === null) return null
  let exited = false
  let child
  try {
    child = spawn(script, ['-qec', `${quote(grok)} --cwd ${quote(cwd)} --no-alt-screen`, '/dev/null'], {
      cwd,
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
      env,
    })
  } catch {
    return null
  }
  child.once('error', () => {
    exited = true
  })
  child.once('exit', () => {
    exited = true
  })
  child.stdin.on('error', () => {})
  if (child.pid === undefined) return null
  return { pid: child.pid, exited: () => exited, process: child }
}

// Ends the UI: script's group, then grok and whatever it started, which script runs in a session of their own and
// which the marker in their environment finds. SIGTERM, then SIGKILL to what is left after 2 s.
function stopUi(child, marker) {
  child.process?.stdin?.destroy()
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    // Gone already.
  }
  lanes.killMarked(marker)
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    // Gone already.
  }
}

// The lock's record, {} while it is still being written or when it cannot be read, or null when there is no lock.
function readLock(lockFile) {
  try {
    const holder = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
    return isObject(holder) ? holder : {}
  } catch (err) {
    return err.code === 'ENOENT' ? null : {}
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

// Whether a lock is left over: its holder is gone or outlived its deadline, or its record, which takes a moment to
// write, is still unreadable after LOCK_GRACE_MS.
function leftOver(lockFile, holder, now) {
  if (!Number.isInteger(holder.pid)) {
    try {
      return Date.now() - fs.statSync(lockFile).mtimeMs > LOCK_GRACE_MS
    } catch {
      return false
    }
  }
  return !alive(holder.pid) || (Number.isFinite(holder.until) && now > holder.until + LOCK_GRACE_MS)
}

// Takes the lock for a refresh, or gives the holder's record when another refresh holds it. A left-over lock is
// taken over.
function takeLock(lockFile, record, now) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lockFile, JSON.stringify(record), { flag: 'wx' })
      return { taken: true, holder: null }
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    }
    const holder = readLock(lockFile)
    if (holder === null) continue
    if (!leftOver(lockFile, holder, now)) return { taken: false, holder }
    fs.rmSync(lockFile, { force: true })
  }
  return { taken: false, holder: readLock(lockFile) ?? {} }
}

// A reading grok wrote at or after since. Its time is the proof: grok writes it with the clock this process reads.
// The line's pid is grok's own, which script starts, and an old line's pid may since have been reused, so it is
// not checked.
function newSince(reading, since) {
  return reading !== null && Date.parse(reading.source.ts) >= since ? reading : null
}

// Waits for the refresh that holds the lock, and takes the reading it brought: the newest, if grok wrote it after
// that refresh started. Gives up at the deadline.
async function awaitHolder({ lockFile, logFile, holder, deadline, now, wait }) {
  const since = Number.isFinite(holder.since) ? holder.since : now()
  while (now() < deadline && readLock(lockFile) !== null) await wait(POLL_MS)
  return newSince(readGrokQuota({ logFile, now: now() }), since)
}

// Opens the UI in a new empty directory, polls the log until grok writes a new reading, then ends the UI and
// removes the directory. Gives up when the UI exits or the time runs out.
async function openAndRead({ command, logFile, env, started, pollUntil, now, launch, stop, wait }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-grok-quota-'))
  const marker = `grok-quota/${process.pid}-${started}`
  const laneVariables = lanes.laneEnv(env, marker)
  // The UI needs a terminal type; the pseudo-terminal script gives it has no reader, so any capable one does.
  const term = laneVariables.TERM && laneVariables.TERM !== 'dumb' ? laneVariables.TERM : 'xterm-256color'
  const childEnv = { ...laneVariables, TERM: term, GROK_DISABLE_AUTOUPDATER: '1' }
  let child = null
  try {
    child = launch({ command, cwd: dir, env: childEnv })
    if (!child) return null
    for (;;) {
      // Exit is checked before the log, so a line grok wrote just before it exited is still read.
      const exited = child.exited()
      const reading = newSince(readGrokQuota({ logFile, now: now() }), started)
      if (reading !== null || exited || now() >= pollUntil) return reading
      await wait(POLL_MS)
    }
  } catch {
    return null
  } finally {
    if (child) stop(child, marker)
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// A new reading of grok's quota, taken by opening its UI with no prompt, or null when none came: no grok, no
// script, no new line before the timeout. A refresh started while another one runs waits for it and takes its
// reading, so only one UI opens. Never run it inside a lane call: it takes up to timeoutMs. launch, stop, now and
// wait are for tests.
async function refreshGrokQuota({
  command = 'grok',
  env = process.env,
  logFile = defaultLogFile(env),
  timeoutMs = TIMEOUT_MS,
  lockFile = defaultLockFile(env),
  now = Date.now,
  launch = launchUi,
  stop = stopUi,
  wait = sleep,
} = {}) {
  const started = now()
  const deadline = started + timeoutMs
  let lock
  try {
    lock = takeLock(lockFile, { pid: process.pid, since: started, until: deadline }, started)
  } catch {
    return null
  }
  if (!lock.taken) return awaitHolder({ lockFile, logFile, holder: lock.holder, deadline, now, wait })
  try {
    const pollUntil = started + Math.max(0, timeoutMs - KILL_WAIT_MS)
    return await openAndRead({ command, logFile, env, started, pollUntil, now, launch, stop, wait })
  } finally {
    fs.rmSync(lockFile, { force: true })
  }
}

module.exports = {
  BILLING_MESSAGE,
  STALE_MS,
  TIMEOUT_MS,
  defaultLogFile,
  defaultLockFile,
  tailText,
  newestEntry,
  readingOf,
  readGrokQuota,
  refreshGrokQuota,
  takeLock,
}
