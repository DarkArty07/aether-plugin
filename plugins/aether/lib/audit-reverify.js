'use strict'

// The re-verification of the earlier audit's open items that no reviewer reported again (issue 149, option 2).
// After the entry gate of the verification phase the Lead builds a bounded set from the earlier saved audit and
// extra verifiers check it; the cleanup then tells sigue, resuelto and not found again apart.
// Family: audit.

const fs = require('node:fs')
const path = require('node:path')
const { TOPICS, parseArgs, usageError } = require('./audit-common.js')
const { effectiveKey, missingLocations } = require('./audit-clean.js')
const { previousReport } = require('./audit-store.js')
const { dataDir } = require('./run.js')
const { isText, messageOf } = require('./common.js')

// The ceiling is data, not a number in code: it lives in this file and loadCeiling is the only reader.
const AUDIT_CONFIG_FILE = path.join(__dirname, '..', 'config', 'audit.json')
const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2 }
const REVERIFY_VERDICTS = ['sigue', 'resuelto', 'unverified']
const OWN_STEP = /^audit-changed-project-(.+)$/

// loadCeiling(file?) -> { maxVerifiers, itemsPerVerifier }. Throws an error that names the file when it
// cannot be read or either value is not a positive integer.
function loadCeiling(file = AUDIT_CONFIG_FILE) {
  let data
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`${file}: ${messageOf(err)}`)
  }
  for (const key of ['reverifyMaxVerifiers', 'reverifyItemsPerVerifier']) {
    if (!data || !Number.isInteger(data[key]) || data[key] <= 0) {
      throw new Error(`${file}: ${key} must be a positive integer`)
    }
  }
  return { maxVerifiers: data.reverifyMaxVerifiers, itemsPerVerifier: data.reverifyItemsPerVerifier }
}

// What a verifier gets: the claim and the location, never the earlier reasoning
// (no root cause, trigger, impact, evidence or reproduction). The locations are read the way the cleanup reads
// them, so both agree on where an earlier item points.
function briefOf(item) {
  return {
    id: item.id, causeKey: item.causeKey, topic: item.topic, title: item.title,
    claim: item.claim, locations: missingLocations(item), type: item.type, priority: item.priority,
  }
}

// reverifySet(previousList, currentItems, { topics, ceiling })
// -> { items, groups, counts: { eligible, selected, cut, groups }, ceiling }.
// The set holds the items of the earlier saved audit that are still open (every entry of its list is),
// whose topic was audited this time, whose priority is P0, P1 or P2, and that no current item matches by
// cause key (the key the cleanup already uses: causeKey, or the id when there is none). Sorted by priority,
// then by age: every item of one earlier audit shares its date, so within a priority the earlier list's order
// stands (a stable-sort assumption, not a sort key). At most maxVerifiers groups of itemsPerVerifier; the rest
// is the cut, which travels nested as counts.cut.
function reverifySet(previousList, currentItems, options) {
  const topics = (options && options.topics) || []
  const ceiling = (options && options.ceiling) || {}
  if (!Number.isInteger(ceiling.maxVerifiers) || ceiling.maxVerifiers <= 0 || !Number.isInteger(ceiling.itemsPerVerifier) || ceiling.itemsPerVerifier <= 0) {
    throw new Error('reverifySet: ceiling must hold positive integers maxVerifiers and itemsPerVerifier')
  }
  const list = Array.isArray(previousList) ? previousList : []
  const current = Array.isArray(currentItems) ? currentItems : []
  const keys = new Set(current.map((item) => item && effectiveKey(item)))
  const eligible = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    if (!isText(item.causeKey)) continue
    if (OWN_STEP.test(item.causeKey)) continue
    if (!topics.includes(item.topic)) continue
    if (!Object.hasOwn(PRIORITY_RANK, item.priority)) continue
    if (keys.has(item.causeKey)) continue
    eligible.push(item)
  }
  eligible.sort((first, second) => PRIORITY_RANK[first.priority] - PRIORITY_RANK[second.priority])
  const capacity = ceiling.maxVerifiers * ceiling.itemsPerVerifier
  const items = eligible.slice(0, capacity).map(briefOf)
  const groups = []
  for (let at = 0; at < items.length; at += ceiling.itemsPerVerifier) groups.push(items.slice(at, at + ceiling.itemsPerVerifier))
  return {
    items,
    groups,
    ceiling: { maxVerifiers: ceiling.maxVerifiers, itemsPerVerifier: ceiling.itemsPerVerifier },
    counts: { eligible: eligible.length, selected: items.length, cut: eligible.length - items.length, groups: groups.length },
  }
}

// The ceiling cut of a reverify set: nested as counts.cut, the shape the reverify command emits. A top-level
// cut only survives from older fixtures, which still read.
function cutOf(set) {
  const nested = set && set.counts && set.counts.cut
  if (Number.isInteger(nested) && nested >= 0) return nested
  const top = set && set.cut
  return Number.isInteger(top) && top >= 0 ? top : 0
}

// settleReverify(set, verdicts) -> { previous, ceiling, cut, items, counts }.
// A verifier that still reproduces or read-confirms the defect marks the item sigue with its evidence; one that
// refutes it marks it resuelto on evidence; one that fails in any way leaves it not-found-again, never resolved.
function settleReverify(set, verdicts) {
  const byId = new Map((verdicts || []).map((verdict) => [verdict && verdict.id, verdict]))
  const items = []
  let sigue = 0
  let resuelto = 0
  for (const entry of (set && set.items) || []) {
    const verdict = byId.get(entry.id)
    let state = 'not-found-again'
    let reason = null
    let evidence
    if (!verdict) reason = 'no verdict from the verifier'
    else if (!REVERIFY_VERDICTS.includes(verdict.verdict)) reason = 'the verdict is not one of the three'
    else if (verdict.verdict === 'unverified') reason = isText(verdict.reason) ? verdict.reason : 'the verifier could not decide'
    else if (!isText(verdict.evidence)) reason = 'the verdict has no evidence'
    else {
      state = verdict.verdict
      evidence = verdict.evidence
    }
    if (state === 'sigue') sigue++
    else if (state === 'resuelto') resuelto++
    const settled = { id: entry.id, causeKey: entry.causeKey, title: entry.title, topic: entry.topic, reverify: state }
    if (evidence !== undefined) settled.evidence = evidence
    if (reason !== null) settled.reason = reason
    items.push(settled)
  }
  return {
    previous: (set && set.previous) || null,
    ceiling: (set && set.ceiling) || null,
    cut: cutOf(set),
    items,
    counts: { items: items.length, sigue, resuelto, notFoundAgain: items.length - sigue - resuelto },
  }
}

// command(args, ctx): ctx.subcommand is 'reverify' (args: <gated.json> --analysis <file> --topics <a,b,c>)
// or 'reverify-verdicts' (args: <reverify.json> <verdicts.json>).
async function command(args, ctx) {
  if (ctx.subcommand === 'reverify') {
    const parsed = parseArgs(args, { values: ['analysis', 'topics'], booleans: [], positionals: [1, 1] })
    if (!parsed.values.analysis) throw usageError('needs --analysis <file>')
    if (!parsed.values.topics) throw usageError('needs --topics <a,b,c>')
    const topics = parsed.values.topics.split(',').filter((name) => name !== '')
    for (const topic of topics) {
      if (!TOPICS.includes(topic)) throw usageError(`unknown topic: ${topic}`)
    }
    const currentFile = parsed.positionals[0]
    const analysisFile = parsed.values.analysis
    let current
    let analysis
    try {
      current = JSON.parse(fs.readFileSync(currentFile, 'utf8'))
      analysis = JSON.parse(fs.readFileSync(analysisFile, 'utf8'))
    } catch (err) {
      throw new Error(`${currentFile} or ${analysisFile}: ${messageOf(err)}`)
    }
    const counted = current && current.counts && Number.isInteger(current.counts.candidates)
    if (!current || !Array.isArray(current.accepted) || !Array.isArray(current.discarded) || !counted || !analysis || typeof analysis !== 'object') {
      throw new Error(`${currentFile} or ${analysisFile}: not a candidates output and an analysis`)
    }
    const key = analysis.project && analysis.project.key
    const previous = typeof key === 'string' && key !== '' ? previousReport(dataDir(ctx.env), key) : null
    const ceiling = loadCeiling()
    const self = (analysis && analysis.selfFindings) || []
    const set = reverifySet(previous ? previous.report.list : [], [...current.accepted, ...self], { topics, ceiling })
    const result = {
      previous: previous ? { date: previous.date } : null,
      topics,
      ceiling: set.ceiling,
      items: set.items,
      groups: set.groups,
      counts: set.counts,
    }
    return { code: 0, result, summary: { selected: set.counts.selected, groups: set.counts.groups, cut: set.counts.cut } }
  }
  if (ctx.subcommand === 'reverify-verdicts') {
    const parsed = parseArgs(args, { values: [], booleans: [], positionals: [2, 2] })
    const [setFile, verdictsFile] = parsed.positionals
    let set
    let verdicts
    try {
      set = JSON.parse(fs.readFileSync(setFile, 'utf8'))
      verdicts = JSON.parse(fs.readFileSync(verdictsFile, 'utf8'))
    } catch (err) {
      throw new Error(`${setFile} or ${verdictsFile}: ${messageOf(err)}`)
    }
    if (!set || !Array.isArray(set.items) || !Array.isArray(verdicts)) {
      throw new Error(`${setFile} or ${verdictsFile}: not a reverify output and a verdicts list`)
    }
    for (const entry of set.items) {
      if (!entry || !isText(entry.id) || !isText(entry.causeKey)) throw new Error(`${setFile}: not a reverify output`)
    }
    const result = settleReverify(set, verdicts)
    return {
      code: 0,
      result,
      summary: { items: result.counts.items, sigue: result.counts.sigue, resuelto: result.counts.resuelto, notFoundAgain: result.counts.notFoundAgain },
    }
  }
  throw new Error(`audit-reverify handles reverify and reverify-verdicts, not ${ctx.subcommand}`)
}

module.exports = {
  loadCeiling,
  reverifySet,
  settleReverify,
  command,
}
