'use strict'

// The baseline of self-observation (R15): what the data directory of an earlier use already holds, read
// without changing it and written as numbers into observe/baseline.json of `to`. From each file it takes
// fields and counts only; it copies no command, text or message.
// Family: observe.

const fs = require('node:fs')
const path = require('node:path')

const { isNumber, numberOrZero, parseJson, isObject } = require('./common.js')
const { readEntries } = require('./delegate-log.js')
const { readLog } = require('./lanes.js')
const { loadLadder } = require('./ladder.js')
const { loadPrices, priceEntry } = require('./prices.js')
const { approvalByStep } = require('./observe-calibrate.js')

const SAVES_FAMILY = 'sonnet'

function readJsonLines(file) {
  if (!fs.existsSync(file)) return []
  const entries = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const entry = parseJson(line)
    if (isObject(entry)) entries.push(entry)
  }
  return entries
}

function listDirs(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

function noCandidateOf(laneEntries) {
  let count = 0
  let calls = 0
  for (const entry of laneEntries) {
    if (entry.status === 'no-candidate' || entry.cause === 'no-candidate') count += 1
    if (entry.kind === 'call') calls += 1
  }
  return { count, calls }
}

// The price of the tokens of an outcome as recorded, or of the same tokens under another model.
function priceOf(outcome, model, prices) {
  const usage = outcome.usage || {}
  return priceEntry({
    model,
    input: numberOrZero(usage.input),
    output: numberOrZero(usage.output) + numberOrZero(usage.thinking),
    cacheRead: numberOrZero(usage.cacheRead),
    cacheWrite: 0,
    agent: true,
  }, prices)
}

// Did the cheap first step cost more than it saved? It costs the attempts that a higher step had to redo
// and saves, on the tasks Haiku approved, the difference to the same tokens at Sonnet's rates.
function haikuCostOf(delegateEntries, prices) {
  const steps = loadLadder().rungs.map((rung) => rung.step)
  const rank = (step) => steps.indexOf(step)
  const approvedAt = new Map()
  const tasksWithOutcome = new Set()
  for (const entry of delegateEntries) {
    const task = typeof entry.task === 'string' ? entry.task : entry.id
    if (entry.kind === 'verdict' && entry.verdict === 'approved' && typeof task === 'string') {
      approvedAt.set(task, entry.step)
    }
    if (entry.kind === 'outcome' && typeof task === 'string') {
      tasksWithOutcome.add(task)
    }
  }
  let noOutcome = 0
  for (const [task, step] of approvedAt) {
    if (step === steps[0] && !tasksWithOutcome.has(task)) noOutcome += 1
  }

  const sonnet = prices.models[SAVES_FAMILY]
  let costUsd = 0
  let savesUsd = 0
  let unpriced = 0
  let unmatched = 0
  const lastLaunch = new Map()

  for (const entry of delegateEntries) {
    const task = typeof entry.task === 'string' ? entry.task : entry.id
    if (entry.kind === 'launch' && typeof task === 'string') {
      lastLaunch.set(task, entry)
      continue
    }
    if (entry.kind !== 'outcome') continue
    const launch = typeof task === 'string' ? lastLaunch.get(task) : undefined
    if (!launch) {
      unmatched += 1
      continue
    }
    if (!approvedAt.has(task)) continue
    const approving = approvedAt.get(task)
    const step = launch.step
    const real = () => priceOf(entry, entry.model, prices)
    if (approving === steps[0]) {
      const paid = real()
      const compared = sonnet ? priceOf(entry, sonnet.ids[0], prices) : null
      if (paid === null || compared === null) unpriced += 1
      else savesUsd += compared - paid
    } else if (rank(approving) > 0) {
      if (rank(step) < 0 || rank(step) >= rank(approving)) continue
      const paid = real()
      if (paid === null) unpriced += 1
      else costUsd += paid
    }
  }
  const answer = costUsd === 0 && savesUsd === 0 ? 'no-data' : savesUsd > costUsd ? 'saves-more' : savesUsd < costUsd ? 'costs-more' : 'equal'
  return { costUsd, savesUsd, unpriced, unmatched, noOutcome, answer }
}

function runsOf(runLines) {
  let finalized = 0
  let abandoned = 0
  const amounts = []
  for (const line of runLines) {
    if (line.status === 'abandoned') abandoned += 1
    if (line.status !== 'finalized') continue
    finalized += 1
    const usd = line.report && line.report.cost && line.report.cost.run && line.report.cost.run.usd
    if (isNumber(usd)) amounts.push(usd)
  }
  amounts.sort((a, b) => a - b)
  const count = amounts.length
  const middle = Math.floor(count / 2)
  const median = count === 0 ? null : count % 2 === 1 ? amounts[middle] : (amounts[middle - 1] + amounts[middle]) / 2
  return {
    finalized,
    abandoned,
    usd: { count, min: count === 0 ? null : amounts[0], median, max: count === 0 ? null : amounts[count - 1] },
  }
}

function usageOf(dir) {
  const sessions = listDirs(dir)
  let parts = 0
  for (const session of sessions) {
    parts += fs.readdirSync(path.join(dir, session), { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.json')).length
  }
  return { sessions: sessions.length, parts }
}

function examsOf(dir) {
  return { features: listDirs(dir).reduce((sum, repo) => sum + listDirs(path.join(dir, repo)).length, 0) }
}

function pendingOf(repoRoot) {
  const byClass = {}
  if (repoRoot === null) return { entries: 0, byClass }
  const lines = readJsonLines(path.join(repoRoot, '.aether', 'pending.jsonl'))
  for (const line of lines) {
    const name = typeof line.class === 'string' ? line.class : 'unclassified'
    byClass[name] = (byClass[name] || 0) + 1
  }
  return { entries: lines.length, byClass }
}

function baseline({ from, to = from, prices = loadPrices(), repoRoot = null } = {}) {
  const delegateEntries = readEntries(from)
  const result = {
    approvalsByStep: approvalByStep(delegateEntries),
    noCandidate: noCandidateOf(readLog(from)),
    haikuCost: haikuCostOf(delegateEntries, prices),
    runs: runsOf(readJsonLines(path.join(from, 'runs.jsonl'))),
    usage: usageOf(path.join(from, 'usage')),
    exams: examsOf(path.join(from, 'exams')),
    pending: pendingOf(repoRoot),
  }
  const dir = path.join(to, 'observe')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'baseline.json'), `${JSON.stringify(result, null, 2)}\n`)
  return result
}

module.exports = { baseline }
