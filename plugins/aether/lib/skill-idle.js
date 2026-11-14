'use strict'

// Finds idle skills created or installed by the Lead under spec 030 (R33).
// Family: skill.

const fs = require('node:fs')
const path = require('node:path')
const { readCreatedDeduplicated, readInstalls, readUses } = require('./skill-registry.js')

const IDLE_DAYS = 30
const DAY_MS = 86400000

function normalizeSkillName(name) {
  if (typeof name !== 'string') return ''
  return name.startsWith('aether:') ? name.slice('aether:'.length) : name
}

function idleSkills(dataDir, { repo, now = Date.now(), days = IDLE_DAYS } = {}) {
  try {
    if (!dataDir || typeof dataDir !== 'string') return []

    const createdEntries = readCreatedDeduplicated(dataDir)
    const installEntries = readInstalls(dataDir)

    const candidates = new Map()

    function recordCandidate(entry) {
      if (!entry || !entry.name || typeof entry.name !== 'string') return
      const entryRepo = entry.repo ?? null
      if (entryRepo !== null && entryRepo !== repo) return

      const time = typeof entry.time === 'number' ? entry.time : 0
      const skillPath = entry.path || null

      if (!candidates.has(entry.name)) {
        candidates.set(entry.name, {
          name: entry.name,
          path: skillPath,
          since: time,
        })
      } else {
        const current = candidates.get(entry.name)
        if (time >= current.since) {
          current.since = time
          if (skillPath) current.path = skillPath
        }
      }
    }

    for (const entry of createdEntries) recordCandidate(entry)
    for (const entry of installEntries) recordCandidate(entry)

    if (candidates.size === 0) return []

    const useEntries = readUses(dataDir)

    const windowMs = days * DAY_MS
    const recentlyUsed = new Set()

    for (const use of useEntries) {
      if (!use || typeof use.time !== 'number') continue
      if (now - use.time <= windowMs) {
        if (Array.isArray(use.skills)) {
          for (const rawName of use.skills) {
            if (typeof rawName === 'string') {
              recentlyUsed.add(rawName)
              const clean = normalizeSkillName(rawName)
              if (clean) recentlyUsed.add(clean)
            }
          }
        }
      }
    }

    const idle = []
    for (const candidate of candidates.values()) {
      if (now - candidate.since <= windowMs) continue
      if (!candidate.path || !fs.existsSync(candidate.path)) continue
      const cleanCandidate = normalizeSkillName(candidate.name)
      if (recentlyUsed.has(candidate.name) || (cleanCandidate && recentlyUsed.has(cleanCandidate))) continue
      idle.push(candidate)
    }

    idle.sort((a, b) => a.name.localeCompare(b.name))
    return idle
  } catch {
    return []
  }
}

function idleLine(names, { spanish = false } = {}) {
  if (!names || !Array.isArray(names) || names.length === 0) return ''
  const list = names.join(', ')
  if (spanish) {
    return `Skills que nadie usó en 30 días: ${list}. Considera quitarlas, con el sí del dueño (aether:skills).`
  }
  return `Skills nobody used in 30 days: ${list}. Consider removing them, with the owner's yes (aether:skills).`
}

module.exports = {
  IDLE_DAYS,
  idleSkills,
  idleLine,
}
