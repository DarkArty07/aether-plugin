'use strict'

// Grok's weekly quota, read from unified.jsonl or refreshed over ACP and interactive UI.
// lib/lane-quota.js asks for it.
// Family: harness.

// grok writes `billing: fetched credits config` lines to ~/.grok/logs/unified.jsonl when it
// fetches the plan's credits config, with the current weekly period and, when some of it is used,
// `creditUsagePercent`; grok 1.0.13 left it out in the first lines of a period, minutes after it began, and gave 8
// to 100 later, and 1.0.41's and 1.0.52's lines of 2026-10-14 leave it out. What a missing creditUsagePercent means
// is decided in one place, ABSENT_USED_PERCENT (spec 002, A3). readGrokQuota reads the newest of these lines.
// refreshGrokQuota gets a new reading: it asks grok for its billing over ACP (grok-acp.js), which answers with the
// same config and opens no terminal, and when that gives nothing it opens grok's interactive UI for a few seconds,
// with no prompt, so that grok writes a new line. `grok -p /usage` sends the text to the model, and headless mode
// prints no quota.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { isObject, pidAlive, sleep } = require('../common.js')
const { commandPath, killMarked, laneEnv } = require('../lane-process.js')
const run = require('../run.js')
const { ACP_TIMEOUT_MS, readBillingViaAcp, undoWhenKilled } = require('./grok-acp.js')

const BILLING_MESSAGE = 'billing: fetched credits config'
// What a billing config without creditUsagePercent says about the week: the share used, in percent. The only place
// that reads the absent field (A3): grok 1.0.41 and 1.0.52 leave it out at 0% used, so it reads as nothing used. If
// grok turns out to leave it out after real use too, null reads it as a balance unknown, with the reset still known.
const ABSENT_USED_PERCENT = 0
// The log grows by megabytes, and grok writes these lines when its UI starts: the newest is near the end.
const TAIL_BYTES = 1024 * 1024
// How far ahead of now a line's time may be and still count. grok writes its lines with the clock this process reads,
// so only a clock that ran ahead and was set back leaves a line further ahead; such a line would win over every real
// one until its time came.
const CLOCK_SKEW_MS = 5 * 60 * 1000
const TIMEOUT_MS = 20000
const POLL_MS = 250
// What killMarked waits between SIGTERM and SIGKILL. A refresh polls for no longer than its timeout less
// this, so that killing the UI still ends inside the timeout.
const KILL_WAIT_MS = 2000
// A lock whose holder outlived its own deadline by this much is left over from a refresh that died.
const LOCK_GRACE_MS = 5000
// How old a reading may be before `aether-lane quota` calls it stale and a wave's quota step refreshes it. A reading
// stays valid until its period ends, whatever its age.
const STALE_MS = 30 * 60 * 1000

// The log grok writes under HOME. A lane's environment drops GROK_HOME, so lanes and refreshes always use ~/.grok.
function defaultLogFile(env = process.env) {
  return path.join(env.HOME || os.homedir(), '.grok', 'logs', 'unified.jsonl')
}

function defaultLockFile(env = process.env) {
  return path.join(run.dataDir(env), 'lanes', 'grok-quota.lock')
}

// The folder under which grok keeps a folder of session files for each directory it starts in.
function defaultSessionsDir(env = process.env) {
  return path.join(env.HOME || os.homedir(), '.grok', 'sessions')
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

// The newest billing entry of text by its time, the later line on a tie, or null. Entries after notAfter (ms) are left
// out.
function newestEntry(text, { notAfter = Infinity } = {}) {
  let newest = null
  for (const item of billingEntries(text)) {
    if (item.time > notAfter) continue
    if (newest === null || item.time >= newest.time) newest = item
  }
  return newest
}

// The reading of one billing entry at now, or null when its period has ended or its config cannot be read.
// remaining is the share of the week left. A missing creditUsagePercent counts as absentUsed percent used (see
// ABSENT_USED_PERCENT) and says so in usedPercentAbsent; with absentUsed null the balance is unknown: remaining is
// null and the reset is still known.
function readingOf({ entry, time }, now, logFile = null, { absentUsed = ABSENT_USED_PERCENT } = {}) {
  const config = isObject(entry.ctx) && isObject(entry.ctx.config) ? entry.ctx.config : null
  const end = Date.parse(config?.currentPeriod?.end)
  if (!Number.isFinite(end) || end <= now) return null
  const percent = config.creditUsagePercent
  const absent = percent === undefined || percent === null
  if (!absent && !Number.isFinite(percent)) return null
  const used = absent ? absentUsed : Math.min(100, Math.max(0, percent))
  return {
    windows: { weekly: { remaining: used === null ? null : (100 - used) / 100, resetsAt: new Date(end).toISOString() } },
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
// or the newest one is unreadable or from a period that has ended. A line from more than CLOCK_SKEW_MS in the future
// is not read, so the newest line that is not in the future decides.
function readGrokQuota({ logFile = defaultLogFile(), now = Date.now(), absentUsed = ABSENT_USED_PERCENT } = {}) {
  const text = tailText(logFile)
  if (text === null) return null
  const newest = newestEntry(text, { notAfter: now + CLOCK_SKEW_MS })
  return newest === null ? null : readingOf(newest, now, logFile, { absentUsed })
}

// The reading of grok's answer to _x.ai/billing ({ config, version, at } of readBillingViaAcp), read as a log line
// is read: the same config, the same rules. Its source says it came over ACP, with no log and no process. Null when
// the answer is no answer, has no config, or its period has ended.
function readingFromAcp(answer, now, { absentUsed } = {}) {
  if (!isObject(answer) || !isObject(answer.config)) return null
  const at = typeof answer.at === 'number' && Number.isFinite(new Date(answer.at).getTime()) ? answer.at : now
  const version = typeof answer.version === 'string' ? answer.version : null
  const reading = readingOf({ entry: { ctx: { config: answer.config } }, time: at }, now, null, { absentUsed })
  if (reading === null) return null
  return { ...reading, source: { method: 'acp', log: null, ts: new Date(at).toISOString(), pid: null, version, ageMinutes: 0 } }
}

function quote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`
}

// Opens grok's UI on a terminal of its own: grok's UI needs one, and script(1) gives it a pseudo-terminal. script
// runs detached, in a process group of its own; the pipe on its stdin is never written or closed, so grok never
// reads an end of input. Returns the child, or null when script or grok is not installed or cannot start.
function launchUi({ command, cwd, env }) {
  const script = commandPath('script', env)
  const grok = commandPath(command, env)
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
  killMarked(marker)
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
  return !pidAlive(holder.pid) || (Number.isFinite(holder.until) && now > holder.until + LOCK_GRACE_MS)
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

const DIR_PREFIX = 'aether-grok-quota-'

// Removes the folder grok's UI made for dir, the temporary directory it was started in: grok names the folder of a
// directory's sessions by the directory's path with every character encodeURIComponent encodes, under sessionsDir.
// Only that folder, and the one of dir's realpath when it differs: never another folder of ~/.grok, and nothing when
// dir is not one of this module's own temporary directories. Never throws.
function removeSessionFolder(sessionsDir, dir, realDir) {
  const root = path.resolve(sessionsDir)
  const own = (directory) => typeof directory === 'string' && path.basename(directory).startsWith(DIR_PREFIX)
  for (const directory of new Set([dir, realDir].filter(own))) {
    const folder = path.join(root, encodeURIComponent(directory))
    // encodeURIComponent leaves no separator, so the folder is a direct child of root; this keeps that true.
    if (path.dirname(folder) !== root) continue
    try {
      fs.rmSync(folder, { recursive: true, force: true })
    } catch {
      // A folder that stays is harmless: grok's own cleanup or the owner's takes it.
    }
  }
}

// Opens the UI in a new empty directory, polls the log until grok writes a new reading, then ends the UI and
// removes the directory and the session folder grok made for it. Gives up when the UI exits or the time runs out.
async function openAndRead({ command, logFile, env, sessionsDir, started, pollUntil, now, launch, stop, wait }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), DIR_PREFIX))
  let realDir = null
  try {
    realDir = fs.realpathSync(dir)
  } catch {
    // The directory's own name is the one grok is given.
  }
  const marker = `grok-quota/${process.pid}-${started}`
  const laneVariables = laneEnv(env, marker)
  // The UI needs a terminal type; the pseudo-terminal script gives it has no reader, so any capable one does.
  const term = laneVariables.TERM && laneVariables.TERM !== 'dumb' ? laneVariables.TERM : 'xterm-256color'
  const childEnv = { ...laneVariables, TERM: term, GROK_DISABLE_AUTOUPDATER: '1' }
  let child = null
  // Ends the UI and removes what it left. After the UI is ended, so that grok writes nothing more into the folder. It
  // runs on the way out of the refresh, or from a signal that ends the process; run twice it does no harm.
  const clear = () => {
    try {
      if (child) stop(child, marker)
    } finally {
      removeSessionFolder(sessionsDir, dir, realDir)
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
  const release = undoWhenKilled(clear)
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
    release()
    clear()
  }
}

// grok's billing over ACP as a reading, or null when acp gives no answer, throws, or its config has no usable
// period. Never throws.
async function readViaAcp({ command, env, acpTimeoutMs, now, acp }) {
  try {
    const answer = await acp({ command, env, timeoutMs: acpTimeoutMs, now })
    return readingFromAcp(answer, now())
  } catch {
    return null
  }
}

// A new reading of grok's quota, or null when none came: no grok, no script, no new line before the timeout. First
// grok is asked for its billing over ACP, which takes up to acpTimeoutMs and opens no UI; when that gives nothing, the
// UI is opened with no prompt, for up to timeoutMs from the moment it starts, and the line it writes is the reading.
// The lock, and so whoever waits on it, lasts the whole refresh: acpTimeoutMs + timeoutMs. A refresh started while
// another runs waits for it and takes its reading, so only one grok starts. Never run it inside a lane call: it takes
// up to acpTimeoutMs + timeoutMs. If the process is ended by SIGTERM, SIGINT or SIGHUP meanwhile, the agent or the UI,
// its directories and the lock are removed before it exits with 143. acp, launch, stop, now and wait are for tests; sessionsDir is where the UI's session
// folder for its temporary directory is removed.
async function refreshGrokQuota({
  command = 'grok',
  env = process.env,
  logFile = defaultLogFile(env),
  timeoutMs = TIMEOUT_MS,
  acpTimeoutMs = ACP_TIMEOUT_MS,
  lockFile = defaultLockFile(env),
  sessionsDir = defaultSessionsDir(env),
  now = Date.now,
  acp = readBillingViaAcp,
  launch = launchUi,
  stop = stopUi,
  wait = sleep,
} = {}) {
  const started = now()
  const deadline = started + acpTimeoutMs + timeoutMs
  let lock
  try {
    lock = takeLock(lockFile, { pid: process.pid, since: started, until: deadline }, started)
  } catch {
    return null
  }
  if (!lock.taken) return awaitHolder({ lockFile, logFile, holder: lock.holder, deadline, now, wait })
  // Registered before the agent or the UI, so that a signal takes the lock back last, when they are ended.
  const release = undoWhenKilled(() => fs.rmSync(lockFile, { force: true }))
  try {
    const viaAcp = await readViaAcp({ command, env, acpTimeoutMs, now, acp })
    if (viaAcp !== null) return viaAcp
    // The UI is judged from when it starts: a line grok wrote while ACP was tried is not its reading.
    const uiStarted = now()
    const pollUntil = uiStarted + Math.max(0, timeoutMs - KILL_WAIT_MS)
    return await openAndRead({ command, logFile, env, sessionsDir, started: uiStarted, pollUntil, now, launch, stop, wait })
  } finally {
    release()
    fs.rmSync(lockFile, { force: true })
  }
}

module.exports = {
  ABSENT_USED_PERCENT,
  BILLING_MESSAGE,
  STALE_MS,
  TIMEOUT_MS,
  defaultLogFile,
  defaultLockFile,
  defaultSessionsDir,
  tailText,
  newestEntry,
  readingOf,
  readingFromAcp,
  readGrokQuota,
  refreshGrokQuota,
  takeLock,
}
