'use strict'

// On-disk quota exhaustion marks for lanes (`lanes/marks/<harness>__<group>.json`).
// An unconfirmed mark (rate limit, missing/unknown balance, or absent used percent) lasts
// DEFAULT_MARK_MINUTES. A mark is confirmed and holds until the reset only when reading
// has an explicit balance showing the group under reserve. Marks never shorten.

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_MARK_MINUTES = 60

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
  if (data.until <= now) return null
  return data
}

function liveMarks(dataDir, now = Date.now()) {
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
    if (data.until <= now) continue
    result.push(data)
  }
  result.sort((a, b) => {
    const keyA = `${a.harness}/${a.group}`
    const keyB = `${b.harness}/${b.group}`
    return keyA < keyB ? -1 : (keyA > keyB ? 1 : 0)
  })
  return result
}

function markDry(dataDir, { harness, group, reading = null, reserve, now = Date.now(), minutes = DEFAULT_MARK_MINUTES }) {
  const usedPercentAbsent = Boolean(reading && reading.usedPercentAbsent)

  let confirmed = false
  let until = null
  let resetsAt = null

  if (reading && typeof reading === 'object' && !reading.unknown && !reading.usedPercentAbsent && reading.windows && typeof reading.windows === 'object') {
    const windows = Object.values(reading.windows)
    const allNumeric = windows.length > 0 && windows.every((w) => w && typeof w.remaining === 'number' && Number.isFinite(w.remaining))
    if (allNumeric) {
      const underReserve = windows.filter((w) => w.remaining <= reserve)
      if (underReserve.length > 0) {
        const resets = underReserve.map((w) => parseDate(w.resetsAt))
        const allLegibleAndFuture = resets.every((ms) => Number.isFinite(ms) && ms > now)
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

  const existing = liveMark(dataDir, harness, group, now)
  if (existing && typeof existing.until === 'number' && existing.until >= candidate.until) {
    return existing
  }

  writeAtomic(markFile(dataDir, harness, group), JSON.stringify(candidate, null, 2) + '\n')
  return candidate
}

module.exports = {
  DEFAULT_MARK_MINUTES,
  marksDir,
  markFile,
  markDry,
  liveMark,
  liveMarks,
}
