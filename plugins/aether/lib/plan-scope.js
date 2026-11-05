'use strict'

// The final review's scope: the run's units across launches (issue 122). After a relaunch,
// the final review plans from the last launch's units only, although the earlier launches
// had merged units of their own asking for a higher review. The run keeps what the review
// needs in its run directory: units.json holds every launch's task definitions (with their
// review fields, areas and owns), and result.json with result-<k>.json hold the launches'
// results (with each unit's status, tiers, reason and rounds with their findings).
//
// `aether-plan compile --run` reads them (a workflow cannot read the disk) and hands the earlier launches' merged
// units to the workflow in its arguments (`earlierUnits`). A unit this launch runs again is left out: its own
// rounds govern it.
// Family: plan.

const fs = require('node:fs')
const path = require('node:path')
const { readJsonOrNull } = require('./common.js')

// The saved results of the earlier launches, oldest first: result-1.json, ..., result.json.
// A result without units, or one a hand left half-written, carries no unit.
function earlierResults(dir) {
  let names = []
  try {
    names = fs
      .readdirSync(dir)
      .map((name) => /^result-(\d+)\.json$/.exec(name))
      .filter(Boolean)
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map((m) => m[0])
  } catch {
    return []
  }
  try {
    if (fs.existsSync(path.join(dir, 'result.json'))) names.push('result.json')
  } catch {
    // Below, a directory that cannot be listed reads as having no earlier launch.
  }
  const out = []
  for (const name of names) {
    const result = readJsonOrNull(path.join(dir, name))
    if (result && typeof result === 'object') out.push(result)
  }
  return out
}

// The task definitions every launch of the run selected, by task id. A relaunch rewrites
// graph.json with the units it selected alone, so units.json keeps the others.
function readDefs(dir) {
  const defs = readJsonOrNull(path.join(dir, 'units.json'))
  return defs && typeof defs === 'object' ? defs : {}
}

// The earlier launches' merged units for the final review of a relaunch: each unit's review
// field, area and owns from units.json with its status and deferred minor findings from the
// saved results. `current` holds the ids this launch runs, which are left out. A merge is
// never undone by a later launch, so ever merged counts, even when a later launch left the
// unit blocked again.
function earlierMergedUnits(dir, current) {
  const defs = readDefs(dir)
  const seen = new Map()
  const merged = new Set()
  for (const result of earlierResults(dir)) {
    for (const unit of Array.isArray(result.units) ? result.units : []) {
      if (!unit || typeof unit.id !== 'string') continue
      // Only a merged occurrence refreshes what the review reports: a later launch that ran
      // the unit again and left it blocked did not undo the merge, so the merged code — and
      // the findings its rounds deferred — is what the review covers.
      if (unit.status !== 'merged') continue
      merged.add(unit.id)
      const rounds = Array.isArray(unit.rounds) ? unit.rounds : []
      const last = rounds.length ? rounds[rounds.length - 1] : null
      const findings = last && Array.isArray(last.findings) ? last.findings : []
      seen.set(unit.id, {
        title: typeof unit.title === 'string' ? unit.title : unit.id,
        area: typeof unit.area === 'string' ? unit.area : 'unknown',
        tiers: Array.isArray(unit.tiers) ? unit.tiers : [],
        reason: typeof unit.reason === 'string' && unit.reason ? unit.reason : null,
        minors: findings
          .filter((f) => f && f.severity === 'minor')
          .map((f) => ({ severity: 'minor', title: String(f.title || ''), file: String(f.file || '') })),
      })
    }
  }
  const out = []
  for (const [id, unit] of seen) {
    if (!merged.has(id) || (current && current[id])) continue
    const def = defs[id] || {}
    out.push({
      id,
      title: typeof def.title === 'string' ? def.title : unit.title,
      area: typeof def.area === 'string' ? def.area : unit.area,
      review: typeof def.review === 'string' ? def.review : null,
      owns: Array.isArray(def.owns) ? def.owns : [],
      status: 'merged',
      tiers: unit.tiers,
      reason: unit.reason,
      minors: unit.minors,
    })
  }
  out.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  return out
}

module.exports = { earlierResults, earlierMergedUnits }
