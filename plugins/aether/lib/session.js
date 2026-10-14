'use strict'

const fs = require('node:fs')
const path = require('node:path')

const LEAD_AGENT = 'aether:lead'
const SESSION_ID_RE = /^[A-Za-z0-9-]+$/
const DAY_MS = 24 * 60 * 60 * 1000

function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && SESSION_ID_RE.test(sessionId)
}

// <dataDir>/sessions/<sessionId>.json. Throws Error('invalid session id: <id>') unless sessionId is a string matching /^[A-Za-z0-9-]+$/.
function markerFile(dataDir, sessionId) {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`invalid session id: ${String(sessionId)}`)
  }
  return path.join(dataDir, 'sessions', `${sessionId}.json`)
}

// <dataDir>/sessions/<sessionId>.ops-off: present when the session's ops option is off, which the mod reads
// by its existence, as it reads the marker's. Same id rules as the marker.
function opsOffFile(dataDir, sessionId) {
  return markerFile(dataDir, sessionId).replace(/\.json$/, '.ops-off')
}

// Writes {"session": sessionId, "startedAt": now} to the marker file, creating its directory. Throws on a bad id (before writing anything) or a failed write.
// With opsInMod false it also writes the ops-off file, and with it true it removes a stale one, so a session
// resumed with the option changed follows the option it has now.
function markSession(dataDir, sessionId, now = Date.now(), { opsInMod = true } = {}) {
  const file = markerFile(dataDir, sessionId)
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ session: sessionId, startedAt: now }) + '\n')
  const off = opsOffFile(dataDir, sessionId)
  if (opsInMod) fs.rmSync(off, { force: true })
  else fs.writeFileSync(off, '')
}

// True when the marker file exists. False for an invalid or missing id; never throws.
function isAetherSession(dataDir, sessionId) {
  try {
    if (!isValidSessionId(sessionId)) return false
    return fs.existsSync(markerFile(dataDir, sessionId))
  } catch {
    return false
  }
}

// Deletes <dataDir>/sessions/*.json whose modification time is more than `days` days before `now`. Returns the deleted ids; [] when the directory does not exist. Other files stay.
function pruneSessions(dataDir, { days = 30, now = Date.now() } = {}) {
  const dir = path.join(dataDir, 'sessions')
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  const pruned = []
  for (const file of entries.sort()) {
    if (!file.endsWith('.json')) continue
    const id = file.slice(0, -'.json'.length)
    if (!isValidSessionId(id)) continue
    const full = path.join(dir, file)
    let stat
    try {
      stat = fs.statSync(full)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    if (now - stat.mtimeMs <= days * DAY_MS) continue
    fs.rmSync(full, { force: true })
    fs.rmSync(path.join(dir, `${id}.ops-off`), { force: true })
    pruned.push(id)
  }
  return pruned
}

module.exports = { LEAD_AGENT, markerFile, opsOffFile, markSession, isAetherSession, pruneSessions }
