'use strict'

// The router's table of rungs: one row per (model, native effort) of the harnesses the router can use,
// derived from the measures in config/models/models.json and the lane table. Nothing here is edited by
// hand: scripts/build-router-rungs.js writes config/router/rungs.json from deriveRungs.

const fs = require('node:fs')
const path = require('node:path')

// Cut-off points per axis: the lower edge of B, C and D. The levels never overlap and a score equal to a
// cut goes to the upper level.
const BANDS = { general: [37.5, 45, 55], code: [0.18, 0.35, 0.58] }
const LEVELS = ['A', 'B', 'C', 'D']
const EFFORT_RANK = { minimal: 0, low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }
const HARNESSES = ['claude', 'agy', 'grok']
const GENERATED_FROM = 'config/models/models.json'

function levelOf(axis, score, bands = BANDS) {
  const cuts = bands[axis]
  let level = 0
  for (const cut of cuts) if (score >= cut) level++
  return LEVELS[level]
}

function deriveRungs(index, lanesConfig, { bands = BANDS } = {}) {
  const models = index.models || []
  const claudeModels = new Set(models.filter((m) => m.harness === 'claude').map((m) => m.model))
  const rungs = []
  for (const harness of HARNESSES) {
    for (const entry of models.filter((m) => m.harness === harness)) {
      const lane = lanesConfig?.harnesses?.[harness]?.models?.[entry.model]
      for (const effort of entry.efforts || []) {
        const measure = (entry.scores || []).find((s) => s.effort === effort)
        let status = 'measured'
        let why = null
        if (!measure) {
          status = 'unmeasured'
          why = 'no-score'
        } else if (harness !== 'claude' && claudeModels.has(entry.model)) {
          status = 'unmeasured'
          why = 'native-measure-only'
        }
        const measured = status === 'measured'
        rungs.push({
          id: `${harness}/${entry.model}/${effort}`,
          harness,
          model: entry.model,
          alias: harness === 'claude' ? entry.alias || null : null,
          effort,
          group: harness === 'claude' ? null : lane?.group || null,
          eligible: harness === 'claude' ? Boolean(entry.alias) : Boolean(lane?.roles?.includes('implementer')),
          status,
          why,
          scores: measured ? { intelligence: measure.intelligence, terminalBench: measure.terminalBench } : null,
          levels: measured
            ? { general: levelOf('general', measure.intelligence, bands), code: levelOf('code', measure.terminalBench, bands) }
            : null,
          priceOutput: measured ? measure.priceOutput : null,
        })
      }
    }
  }
  return { generatedFrom: GENERATED_FROM, bands, rungs }
}

function rungsFile() {
  return path.join(__dirname, '..', 'config', 'router', 'rungs.json')
}

function loadRungs(file = rungsFile()) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function levelOfRung(table, { harness, model, effort }, axis) {
  const rung = table.rungs.find(
    (r) => r.harness === harness && r.effort === effort && (r.model === model || (harness === 'claude' && r.alias === model)),
  )
  if (!rung || rung.status === 'unmeasured' || !rung.levels) return null
  return rung.levels[axis] || null
}

function pickRung(table, { harness, level, axis, group = undefined }) {
  const floor = LEVELS.indexOf(level)
  const fits = table.rungs
    .map((rung, order) => ({ rung, order }))
    .filter(({ rung }) => rung.eligible && rung.status !== 'unmeasured' && rung.levels && rung.harness === harness)
    .filter(({ rung }) => group === undefined || rung.group === group)
    .filter(({ rung }) => LEVELS.indexOf(rung.levels[axis]) >= floor)
  if (!fits.length) return null
  const rank = ({ rung }) => LEVELS.indexOf(rung.levels[axis])
  fits.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.rung.priceOutput - b.rung.priceOutput ||
      EFFORT_RANK[a.rung.effort] - EFFORT_RANK[b.rung.effort] ||
      a.order - b.order,
  )
  return fits[0].rung
}

module.exports = { BANDS, LEVELS, EFFORT_RANK, levelOf, deriveRungs, rungsFile, loadRungs, levelOfRung, pickRung }
