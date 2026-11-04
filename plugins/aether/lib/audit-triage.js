'use strict'

// The triage of cleaned audit findings: judgments are validated, proposals are forced to P3, and each band is ordered and numbered.
// Family: audit.

const fs = require('node:fs')
const { PRIORITIES, SEVERITIES, SIZES, WAIT_COSTS, parseArgs } = require('./audit-common.js')
const { isText, messageOf } = require('./common.js')

const BANDS = ['P0', 'P1', 'P2', 'P3']
const WAIT_RANK = { high: 0, medium: 1, low: 2 }
const SIZE_RANK = { S: 0, M: 1, L: 2 }

// order(items) -> items sorted by: regression first, then waitCost (high, medium, low), then size (S, M, L), then the position they had. Stable.
function order(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((first, second) => {
      const regression = Number(second.item.regression === true) - Number(first.item.regression === true)
      if (regression !== 0) return regression
      const wait = (WAIT_RANK[first.item.waitCost] ?? 3) - (WAIT_RANK[second.item.waitCost] ?? 3)
      if (wait !== 0) return wait
      const size = (SIZE_RANK[first.item.size] ?? 3) - (SIZE_RANK[second.item.size] ?? 3)
      if (size !== 0) return size
      return first.index - second.index
    })
    .map((entry) => entry.item)
}

function missingOf(id, judgments) {
  const judgment = judgments[id]
  if (!judgment || typeof judgment !== 'object') return ['judgment']
  const missing = []
  if (!SEVERITIES.includes(judgment.severity)) missing.push('severity')
  if (!PRIORITIES.includes(judgment.priority)) missing.push('priority')
  if (!SIZES.includes(judgment.size)) missing.push('size')
  if (!WAIT_COSTS.includes(judgment.waitCost)) missing.push('waitCost')
  if (!isText(judgment.reason)) missing.push('reason')
  if (!isText(judgment.how)) missing.push('how')
  if (typeof judgment.regression !== 'boolean') missing.push('regression')
  return missing
}

// triage(cleaned, judgments: { [id]: Judgment }) -> { ok: true, list, unverified, ... } | { ok: false, incomplete }
function triage(cleaned, judgments) {
  const given = judgments || {}
  const incomplete = []
  for (const finding of cleaned.findings) {
    const missing = missingOf(finding.id, given)
    if (missing.length > 0) incomplete.push({ id: finding.id, missing })
  }
  if (incomplete.length > 0) return { ok: false, incomplete }
  const bands = new Map(BANDS.map((band) => [band, []]))
  for (const finding of cleaned.findings) {
    const judgment = given[finding.id]
    const priority = finding.verification === 'proposal' ? 'P3' : judgment.priority
    bands.get(priority).push({
      ...finding,
      number: 0,
      priority,
      severity: judgment.severity,
      reason: judgment.reason,
      size: judgment.size,
      how: judgment.how,
      regression: judgment.regression,
      waitCost: judgment.waitCost,
    })
  }
  const list = []
  for (const band of BANDS) {
    for (const item of order(bands.get(band))) {
      item.number = list.length + 1
      list.push(item)
    }
  }
  return {
    ok: true,
    list,
    unverified: (cleaned.unverified || []).map((finding) => ({
      id: finding.id,
      topic: finding.topic,
      title: finding.title,
      claim: finding.claim,
      locations: finding.locations,
      reason: finding.reason,
    })),
    counts: cleaned.counts,
    discarded: cleaned.discarded,
    sinceLast: cleaned.sinceLast,
    issueComparison: cleaned.issueComparison,
  }
}

// command(args, ctx): <cleaned.json> <judgments.json> -> { code: 0 | 1, result, summary: { listed, unverified } }; code 1 when incomplete.
async function command(args, ctx) {
  const parsed = parseArgs(args, { values: [], booleans: [], positionals: [2, 2] })
  const [cleanedFile, judgmentsFile] = parsed.positionals
  let cleaned
  let judgments
  try {
    cleaned = JSON.parse(fs.readFileSync(cleanedFile, 'utf8'))
    judgments = JSON.parse(fs.readFileSync(judgmentsFile, 'utf8'))
  } catch (err) {
    throw new Error(`${cleanedFile} or ${judgmentsFile}: ${messageOf(err)}`)
  }
  if (!cleaned || !Array.isArray(cleaned.findings)) throw new Error(`${cleanedFile}: not a cleaned output`)
  if (!judgments || typeof judgments !== 'object' || Array.isArray(judgments)) {
    throw new Error(`${judgmentsFile}: not a judgments object`)
  }
  const result = triage(cleaned, judgments)
  if (!result.ok) return { code: 1, result, summary: { listed: 0, unverified: 0 } }
  return { code: 0, result, summary: { listed: result.list.length, unverified: result.unverified.length } }
}

module.exports = {
  order,
  triage,
  command,
}
