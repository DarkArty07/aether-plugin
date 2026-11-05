'use strict'

// The 30-day prune of the delegate log (R12): a session idle past the window has its `outcome` lines archived in
// spend/<id>.outcomes.jsonl first, so that aether-report --spend keeps its cost, and then its lines leave
// delegates/log.jsonl; the launch files of the same age go too. It lives apart from delegate-log.js because it needs
// spend.js and spend-archive.js, which already require delegate-log.js.
// Family: delegate.

const fs = require('node:fs')
const path = require('node:path')
const { withLock, writeAtomic } = require('./common.js')
const { logFile } = require('./delegate-log.js')
const { isSessionId } = require('./spend.js')
const { archiveOutcomes, noteFailure, clearFailure } = require('./spend-archive.js')

const LOCK_OPTIONS = { waitMs: 10000, staleMs: 60000 }

// Archive idle sessions before removing their lines. Repeat the archive under the log lock to capture late outcomes.
function pruneDelegateLog(dataDir, { days = 30, now = Date.now() } = {}) {
  const dir = path.join(dataDir, 'delegates')
  if (!fs.existsSync(dir)) return { pruned: [] }
  const cutoff = now - days * 86400000
  const newest = new Map()
  let text = ''
  try { text = fs.readFileSync(logFile(dataDir), 'utf8') } catch (err) { if (err.code !== 'ENOENT') throw err }
  for (const line of text.split('\n')) {
    let entry
    try { entry = JSON.parse(line) } catch { continue }
    if (!entry || !isSessionId(entry.session) || typeof entry.time !== 'number' || !Number.isFinite(entry.time)) continue
    newest.set(entry.session, Math.max(newest.get(entry.session) ?? -Infinity, entry.time))
  }
  const archived = []
  for (const [session, time] of newest) {
    if (time >= cutoff) continue
    try {
      archiveOutcomes(dataDir, session)
      clearFailure(dataDir, `delegates/${session}`)
      archived.push(session)
    } catch (err) {
      noteFailure(dataDir, `delegates/${session}`, err, now)
    }
  }
  const pruned = []
  if (archived.length) {
    withLock(path.join(dir, '.log'), () => {
      for (const session of archived) {
        try {
          archiveOutcomes(dataDir, session)
          clearFailure(dataDir, `delegates/${session}`)
          pruned.push(session)
        } catch (err) {
          noteFailure(dataDir, `delegates/${session}`, err, now)
        }
      }
      if (!pruned.length) return
      const file = logFile(dataDir)
      const text = fs.readFileSync(file, 'utf8')
      const removed = new Set(pruned)
      const kept = text.split('\n').filter((line) => {
        try { return !removed.has(JSON.parse(line)?.session) } catch { return true }
      })
      writeAtomic(file, kept.join('\n'))
    }, LOCK_OPTIONS)
  }
  for (const sub of ['in', 'briefs', 'external', 'results', 'run', 'patches', 'answers']) {
    const folder = path.join(dir, sub)
    if (!fs.existsSync(folder)) continue
    for (const name of fs.readdirSync(folder)) {
      const file = path.join(folder, name)
      try {
        const stat = fs.statSync(file)
        if (stat.isFile() && stat.mtimeMs < cutoff) fs.unlinkSync(file)
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
    }
  }
  return { pruned: pruned.sort() }
}


module.exports = { pruneDelegateLog }
