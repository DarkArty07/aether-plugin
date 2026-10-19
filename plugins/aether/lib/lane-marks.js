'use strict'

// On-disk quota exhaustion marks for lanes (`lanes/marks/<harness>__<group>.json`).
// An unconfirmed mark (rate limit, missing/unknown balance, or absent used percent) lasts
// DEFAULT_MARK_MINUTES. A mark is confirmed and holds until the reset only when reading
// has an explicit balance showing the group under reserve. A call agy refused with «Individual quota reached»
// (`refusal`) leaves an unconfirmed mark with `reason: "quota refusal"`: it holds the default length, not the reset the
// message states, which is kept in `statedResetMs` for people to read: agy's quota structure changes between days and
// the stated reset was once wrong, while a refused call costs a failed process and no tokens, so the group is tried
// again every hour. A live refusal mark is not replaced by a mark that is not confirmed, so a later reading with a
// balance does not lift it. Marks never shorten.

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_MARK_MINUTES = 60
const REFUSAL_REASON = 'quota refusal'
// The longest a mark can legitimately hold: a confirmed mark lasts until a window resets, and the longest window is
// the weekly one. A day is added for the clock of whoever reports the reset. A mark beyond this is damaged, or was
// written under a clock far ahead, and is no mark.
const MAX_MARK_MS = 8 * 24 * 60 * 60 * 1000
// A lock held longer than this belongs to a process that died inside it.
const LOCK_STALE_MS = 10 * 1000
const LOCK_WAIT_MS = 2 * 1000

function marksDir(dataDir) {
  return path.join(dataDir, 'lanes', 'marks')
}

function markFile(dataDir, harness, group) {
  return path.join(marksDir(dataDir), `${encodeURIComponent(String(harness))}__${encodeURIComponent(String(group))}.json`)
}

function parseDate(val) {
  if (typeof val === 'string') {
    const ms = Date.parse(val)
    return Number.isFinite(ms) ? ms : NaN
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val
  }
  return NaN
}

function writeAtomic(targetPath, content) {
  const dir = path.dirname(targetPath)
  fs.mkdirSync(dir, { recursive: true })
  const base = path.basename(targetPath)
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`)
  try {
    fs.writeFileSync(tmp, content)
    fs.renameSync(tmp, targetPath)
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    } catch {}
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// Runs fn while holding an exclusive lock file next to the mark, so that two calls ending together do not each read the
// mark, compare, and let the shorter write come last. The lock never fails a call: if it cannot be taken within
// LOCK_WAIT_MS, fn runs without it, as a mark that may be shortened is better than none.
function withLock(target, fn) {
  const lock = `${target}.lock`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const deadline = Date.now() + LOCK_WAIT_MS
  let held = false
  while (!held && Date.now() < deadline) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'))
      held = true
    } catch (err) {
      if (err.code !== 'EEXIST') break
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) fs.unlinkSync(lock)
        else sleep(5)
      } catch {}
    }
  }
  try {
    return fn()
  } finally {
    if (held) {
      try {
        fs.unlinkSync(lock)
      } catch {}
    }
  }
}

function liveMark(dataDir, harness, group, now = Date.now()) {
  const file = markFile(dataDir, harness, group)
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if (typeof data.until !== 'number' || !Number.isFinite(data.until)) return null
  if (data.until <= now || data.until > now + MAX_MARK_MS) return null
  return data
}

// The live marks, sorted. known(harness, group), when given, keeps only the marks of a group the lane table has: a file
// of a group the table dropped (agy's `gemini`, which is now `argon` and `flash`) is no mark for anyone.
function liveMarks(dataDir, now = Date.now(), known = null) {
  const dir = marksDir(dataDir)
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return []
  }
  const result = []
  for (const entry of entries) {
    if (!entry.endsWith('.json') || entry.startsWith('.')) continue
    const file = path.join(dir, entry)
    let raw
    try {
      raw = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      continue
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue
    if (typeof data.until !== 'number' || !Number.isFinite(data.until)) continue
    if (data.until <= now || data.until > now + MAX_MARK_MS) continue
    if (known !== null && !known(data.harness, data.group)) continue
    result.push(data)
  }
  result.sort((a, b) => {
    const keyA = `${a.harness}/${a.group}`
    const keyB = `${b.harness}/${b.group}`
    return keyA < keyB ? -1 : (keyA > keyB ? 1 : 0)
  })
  return result
}

// refusal is { resetMs } of a call agy refused for its individual quota (quota-refusal.js): the mark holds `minutes`
// from now, whatever reset the message states; that reset is kept in the mark as statedResetMs, for information.
function markDry(dataDir, { harness, group, reading = null, reserve, now = Date.now(), minutes = DEFAULT_MARK_MINUTES, refusal = null }) {
  const usedPercentAbsent = Boolean(reading && reading.usedPercentAbsent)

  let confirmed = false
  let until = null
  let resetsAt = null

  if (refusal) {
    // Not confirmed: no reading showed the group under the reserve, and no reset is trusted.
    until = now + minutes * 60 * 1000
  } else if (reading && typeof reading === 'object' && !reading.unknown && !reading.usedPercentAbsent && reading.windows && typeof reading.windows === 'object') {
    const windows = Object.values(reading.windows)
    const allNumeric = windows.length > 0 && windows.every((w) => w && typeof w.remaining === 'number' && Number.isFinite(w.remaining))
    if (allNumeric) {
      const underReserve = windows.filter((w) => w.remaining <= reserve)
      if (underReserve.length > 0) {
        const resets = underReserve.map((w) => parseDate(w.resetsAt))
        const allLegibleAndFuture = resets.every((ms) => Number.isFinite(ms) && ms > now && ms <= now + MAX_MARK_MS)
        if (allLegibleAndFuture) {
          confirmed = true
          until = Math.max(...resets)
          resetsAt = new Date(until).toISOString()
        }
      }
    }
  }

  if (!confirmed) {
    until = now + minutes * 60 * 1000
    resetsAt = null
  }

  const candidate = {
    harness,
    group,
    at: now,
    until,
    confirmed,
    resetsAt,
    usedPercentAbsent,
  }
  if (refusal) {
    candidate.reason = REFUSAL_REASON
    candidate.statedResetMs = Number.isFinite(refusal.resetMs) && refusal.resetMs > 0 ? refusal.resetMs : null
  }

  const file = markFile(dataDir, harness, group)
  return withLock(file, () => {
    const existing = liveMark(dataDir, harness, group, now)
    if (existing && typeof existing.until === 'number' && existing.until >= candidate.until) {
      return existing
    }
    // A reading with a balance does not lift a refusal's mark; only a reading that shows the group dry replaces it.
    if (existing && existing.reason === REFUSAL_REASON && !refusal && !candidate.confirmed) return existing
    writeAtomic(file, JSON.stringify(candidate, null, 2) + '\n')
    return candidate
  })
}

module.exports = {
  DEFAULT_MARK_MINUTES,
  REFUSAL_REASON,
  marksDir,
  MAX_MARK_MS,
  markFile,
  markDry,
  liveMark,
  liveMarks,
}
