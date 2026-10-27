'use strict'

// Speed, cost, quality, lanes and the RADAR figures of a swarm run (spec §10), from its run directory, the
// usage meter's files, the lane log and the saved result; and finalize, which records the run and removes what is left of it.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { repoPaths } = require('./git.js')
const run = require('./run.js')
const { loadPrices, priceEntry } = require('./prices.js')
const { readLog, quotaConsumed, laneTokens } = require('./lanes.js')
const { sweepRun } = require('./worktrees.js')
const { judge } = require('./baseline.js')
const { isSessionId } = require('./spend.js')
const { archiveSpend, noteFailure, clearFailure } = require('./spend-archive.js')

const TEST_TIMEOUT_MS = 15 * 60 * 1000
const DAY_MS = 24 * 3600 * 1000

const iso = (ms) => new Date(ms).toISOString()
const zeroTokens = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
const laneZeroTokens = () => ({ input: 0, output: 0, cacheRead: 0 })
const LANE_STATUSES = ['ok', 'failed', 'quota', 'violation', 'blocked']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

// A rung is `<model> <effort>`; a bare model, as results saved before efforts were recorded name it, has no effort.
const modelOf = (rung) => rung.split(' ')[0]
const rankOf = (rung) => EFFORTS.indexOf(rung.split(' ')[1])
// One rung climbs from another when both name the same model and the later one has a higher effort.
const climbsFrom = (before, after) => modelOf(before) === modelOf(after) && rankOf(before) >= 0 && rankOf(after) > rankOf(before)

function readIfThere(file) {
  return fs.existsSync(file) ? run.readJson(file) : null
}

// The newest modification time of a session's usage directory and its parts, or null.
function lastWritten(dir) {
  try {
    let newest = fs.statSync(dir).mtimeMs
    for (const name of fs.readdirSync(dir)) newest = Math.max(newest, fs.statSync(path.join(dir, name)).mtimeMs)
    return newest
  } catch {
    return null
  }
}

// Every usage session under <dataDir>/usage written to at or after `since`, as
// { session, claudeCode, agents, entries }, with its parts merged in order. A part that cannot be
// read is skipped, and so is a session with no entries.
function readUsage(dataDir, { since = 0 } = {}) {
  const root = path.join(dataDir, 'usage')
  const sessions = new Map()
  if (!fs.existsSync(root)) return sessions
  for (const session of fs.readdirSync(root)) {
    const written = lastWritten(path.join(root, session))
    if (written === null || written < since) continue
    let names
    try {
      names = fs.readdirSync(path.join(root, session))
    } catch {
      continue
    }
    const merged = { session, claudeCode: null, agents: {}, entries: [] }
    const parts = names.filter((name) => /^\d+\.json$/.test(name)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    for (const name of parts) {
      let part
      try {
        part = run.readJson(path.join(root, session, name))
      } catch {
        continue
      }
      if (part.claudeCode) merged.claudeCode = part.claudeCode
      Object.assign(merged.agents, part.agents || {})
      if (Array.isArray(part.entries)) merged.entries.push(...part.entries)
    }
    if (merged.entries.length > 0) sessions.set(session, merged)
  }
  return sessions
}

const typeOf = (usage, entry) => (entry.agent ? (usage.agents[entry.agent] || {}).type || 'agent' : 'main')
const isAether = (usage, entry) => /^aether:/.test(typeOf(usage, entry))
const within = (entry, start, end) => entry.t >= start && entry.t <= end

// The session that made the most aether agent requests in the window, then the most requests.
function pickSession(sessions, start, end) {
  let best = null
  let bestScore = [0, 0]
  for (const usage of sessions.values()) {
    const inside = usage.entries.filter((entry) => within(entry, start, end))
    const score = [inside.filter((entry) => isAether(usage, entry)).length, inside.length]
    if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
      best = usage
      bestScore = score
    }
  }
  return best
}

// From the start of the first request to the end of the last.
function span(entries) {
  if (entries.length === 0) return null
  let start = Infinity
  let end = -Infinity
  for (const entry of entries) {
    start = Math.min(start, entry.t - (entry.ms || 0))
    end = Math.max(end, entry.t)
  }
  return { start: iso(start), end: iso(end), ms: end - start }
}

function addTokens(into, entry) {
  for (const key of Object.keys(into)) into[key] += entry[key] || 0
}

function summarize(usage, entries, prices) {
  const total = { usd: 0, requests: 0, tokens: zeroTokens(), byModel: {}, byRole: {}, byEffort: {}, unpriced: [] }
  for (const entry of entries) {
    const model = entry.model || 'unknown'
    const role = typeOf(usage, entry)
    const byModel = (total.byModel[model] ||= { usd: 0, requests: 0, tokens: zeroTokens() })
    const byRole = (total.byRole[role] ||= { usd: 0, requests: 0 })
    const byEffort = (total.byEffort[`${role} ${model} ${entry.effort || 'unknown'}`] ||= { usd: 0, requests: 0, outputTokens: 0, ms: 0 })
    total.requests++
    byModel.requests++
    byRole.requests++
    byEffort.requests++
    byEffort.outputTokens += entry.output || 0
    byEffort.ms += entry.ms || 0
    addTokens(total.tokens, entry)
    addTokens(byModel.tokens, entry)
    const usd = priceEntry(entry, prices)
    if (usd === null) {
      if (!total.unpriced.includes(model)) total.unpriced.push(model)
      continue
    }
    total.usd += usd
    byModel.usd += usd
    byRole.usd += usd
    byEffort.usd += usd
  }
  return total
}

// One item per agent that made requests in the window, the main session as agent null, in the order
// of each one's first request. Its model and effort list the distinct values its requests named.
function agentsOf(usage, entries, prices) {
  const byAgent = new Map()
  for (const entry of entries) {
    const agent = entry.agent || null
    if (!byAgent.has(agent)) {
      const info = agent ? usage.agents[agent] || {} : {}
      byAgent.set(agent, {
        agent,
        type: typeOf(usage, entry),
        label: info.description || null,
        models: new Set(),
        efforts: new Set(),
        requests: 0,
        usd: 0,
        outputTokens: 0,
        ms: 0,
      })
    }
    const item = byAgent.get(agent)
    if (entry.model) item.models.add(entry.model)
    if (entry.effort) item.efforts.add(entry.effort)
    item.requests++
    item.outputTokens += entry.output || 0
    item.ms += entry.ms || 0
    item.usd += priceEntry(entry, prices) || 0
  }
  const joined = (values) => (values.size > 0 ? [...values].join(', ') : null)
  return [...byAgent.values()].map(({ agent, type, label, models, efforts, requests, usd, outputTokens, ms }) => ({
    agent,
    type,
    label,
    model: joined(models),
    effort: joined(efforts),
    requests,
    usd,
    outputTokens,
    ms,
  }))
}

function countFindings(findings) {
  const counts = { critical: 0, important: 0, minor: 0 }
  for (const finding of findings || []) if (finding && finding.severity in counts) counts[finding.severity]++
  return counts
}

// The saved results of every launch, oldest first: result-1.json, result-2.json, ..., result.json.
function readResults(dir) {
  const archived = fs
    .readdirSync(dir)
    .map((name) => /^result-(\d+)\.json$/.exec(name))
    .filter(Boolean)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((m) => run.readJson(path.join(dir, m[0])))
  const latest = readIfThere(path.join(dir, 'result.json'))
  return latest ? [...archived, latest] : archived
}

// A question the owner must answer: a string that is not blank.
const isQuestion = (question) => typeof question === 'string' && question.trim() !== ''

// Unit outcomes, escalations, climbs, questions, every supervisor finding and the final reviews, over every launch.
// A unit's latest launch gives its status and its question; attempts and findings add up across launches. A unit counts
// as escalated when a launch moved it to another model or a relaunch started it on another model, and
// as climbed when a launch raised its effort on one model.
// The latest launch's review is the run's. A `deferred` review did not run: it is not a failure, and its reason
// is kept. A later launch whose review ran replaces it. Only a review whose status is `done` counts as a review.
// `adopted` maps a task to the Lead's record of integrating it by hand (aether-wt adopt). A unit the swarm merged
// is not counted as adopted; any other counts as integrated, and as the swarm's status no longer.
function qualityOf(results, adopted = {}) {
  if (results.length === 0) {
    const unknown = ['launches', 'units', 'merged', 'adopted', 'integrated', 'adoptedUnits', 'blocked', 'questions', 'skipped', 'notRun', 'escalated', 'climbed', 'attempts', 'agents', 'findings', 'finalReview']
    return Object.fromEntries(unknown.map((key) => [key, null]))
  }
  const units = new Map()
  const reviewFindings = []
  let agents = null
  let review = null
  let reviews = 0
  for (const result of results) {
    for (const unit of result.units || []) {
      const before = units.get(unit.id)
      const tiers = unit.tiers || []
      const models = tiers.map(modelOf)
      units.set(unit.id, {
        status: unit.status,
        question: unit.question,
        firstModel: (before && before.firstModel) || models[0],
        escalated: Boolean(before && before.escalated) || new Set(models).size > 1 || Boolean(before && before.firstModel && models[0] && models[0] !== before.firstModel),
        climbed: Boolean(before && before.climbed) || tiers.some((rung, i) => i > 0 && climbsFrom(tiers[i - 1], rung)),
        attempts: (before ? before.attempts : 0) + (unit.attempts || 0),
        findings: [...(before ? before.findings : []), ...(unit.rounds || []).flatMap((round) => round.findings || [])],
      })
    }
    if (result.agents) agents = (agents || 0) + (result.agents.total || 0)
    if (result.finalReview) {
      review = result.finalReview
      if (result.finalReview.status === 'done') reviews++
      reviewFindings.push(...(result.finalReview.findings || []))
    }
  }
  const adoptedUnits = []
  for (const [id, record] of Object.entries(adopted || {})) {
    const unit = units.get(id) || { status: null, question: null, firstModel: undefined, escalated: false, climbed: false, attempts: 0, findings: [] }
    if (unit.status === 'merged' || !record || typeof record !== 'object') continue
    adoptedUnits.push({ id, commit: record.commit, reason: record.reason, was: unit.status || 'not-run' })
    units.set(id, { ...unit, status: 'adopted', question: null })
  }
  const all = [...units.values()]
  const count = (status) => all.filter((unit) => unit.status === status).length
  return {
    launches: results.length,
    units: all.length,
    merged: count('merged'),
    adopted: count('adopted'),
    integrated: count('merged') + count('adopted'),
    adoptedUnits,
    blocked: count('blocked'),
    questions: all.filter((unit) => unit.status === 'blocked' && isQuestion(unit.question)).length,
    skipped: count('skipped'),
    notRun: count('not-run'),
    escalated: all.filter((unit) => unit.escalated).length,
    climbed: all.filter((unit) => unit.climbed).length,
    attempts: all.reduce((sum, unit) => sum + unit.attempts, 0),
    agents,
    findings: countFindings(all.flatMap((unit) => unit.findings)),
    finalReview: review
      ? {
          status: review.status,
          verdict: review.verdict || null,
          findings: countFindings(reviewFindings),
          reviews,
          ...(review.status === 'deferred' ? { reason: review.reason || null } : {}),
        }
      : null,
  }
}

const splitLog = (entries) => ({
  calls: entries.filter((entry) => entry.kind === 'call'),
  readings: entries.filter((entry) => entry.kind === 'reading'),
  choices: entries.filter((entry) => entry.kind === 'choice'),
  tooks: entries.filter((entry) => entry.kind === 'took'),
})

// What each call chose, one item per call in the order of its first choice: the reference pair and the points it
// asked for, the pair that took it (null when none did) and why, who took it and how long after the first choice
// (null while no `took` is logged), and the candidates. A call whose pick was repeated keeps its last choice. A
// choice written in the old shape (a tier, candidates with a state) has no reference or points: they are null.
function choicesOf(choices, tooks) {
  const byCall = new Map()
  for (const entry of [...choices].sort((a, b) => a.time - b.time)) {
    const item = byCall.get(entry.call)
    byCall.set(entry.call, { first: item ? item.first : entry.time, last: entry })
  }
  const tookOf = new Map()
  for (const took of [...tooks].sort((a, b) => a.time - b.time)) tookOf.set(took.call, took)
  return [...byCall.entries()].map(([call, { first, last }]) => {
    const took = tookOf.get(call)
    return {
      call,
      role: last.role,
      reference: last.reference ?? null,
      requested: last.requested ?? null,
      picked: last.picked ?? null,
      by: took ? took.by : null,
      cause: took ? took.cause : null,
      reason: last.reason,
      ms: took ? took.time - first : null,
      candidates: last.candidates,
    }
  })
}

// How much of the run's work left Claude: one call per `took`, those not taken by the native agent being external.
function workOf(tooks) {
  const external = tooks.filter((took) => took.by !== 'native').length
  return { calls: tooks.length, external, native: tooks.length - external, externalShare: tooks.length === 0 ? null : external / tooks.length }
}

// What each harness's quota windows consumed in the run: the sum, per window, over the groups its calls used.
// A call that names no harness belongs to no harness.
function quotaByHarness(summary, calls) {
  const groupsOf = {}
  for (const call of calls) {
    if (!call.harness) continue
    ;(groupsOf[call.harness] ||= new Set()).add(call.group)
  }
  const out = {}
  for (const [harness, groups] of Object.entries(groupsOf)) {
    const windows = (out[harness] = {})
    for (const group of groups) {
      for (const [name, used] of Object.entries((summary.groups[group] || {}).quota || {})) {
        const total = (windows[name] ||= { consumed: 0, resets: 0 })
        total.consumed += used.consumed
        total.resets += used.resets
      }
    }
  }
  return out
}

// A lane call's dollars at list price. A model with no price counts $0, and is noted once.
function laneDollars(call, tokens, prices, notes) {
  const usd = priceEntry({ model: call.model, ...tokens, agent: 'lane' }, prices)
  if (usd !== null) return usd
  const note = `no price for lane model ${call.model}`
  if (!notes.includes(note)) notes.push(note)
  return 0
}

// A group's quota readings: each reading's own, and each call's before and after the call. quotaConsumed sorts them.
// A point keeps whether its reading read the share as 0% used.
function groupReadings(group, calls, readings) {
  const points = []
  const add = (time, quota) => {
    if (quota && quota.windows) points.push({ time, windows: quota.windows, usedPercentAbsent: Boolean(quota.usedPercentAbsent) })
  }
  for (const reading of readings) add(reading.time, reading.groups && reading.groups[group])
  for (const call of calls) {
    if (call.group !== group) continue
    add(call.startedAt, call.quotaBefore)
    add(call.time, call.quotaAfter)
  }
  return points
}

// A group's balance from its quota points, in time order: each window's first and last remaining, the latest
// reading's latest reset that reads as a date, and whether the latest reading read its share as 0% used. Null without a reading.
// A window that is not an object is skipped, as quotaConsumed does, and an unknown reading (no windows) is not the latest:
// the reset and the 0%-used flag come from the latest reading that still has a window, like the balance at the end.
function balanceOf(points) {
  if (points.length === 0) return null
  const sorted = [...points].sort((a, b) => a.time - b.time)
  const windowsOf = (point) => Object.entries(point.windows).filter(([, window]) => window)
  const start = {}
  const end = {}
  for (const point of sorted) {
    for (const [name, window] of windowsOf(point)) {
      if (!Object.hasOwn(start, name)) start[name] = window.remaining
      end[name] = { remaining: window.remaining, resetsAt: window.resetsAt }
    }
  }
  const latest = sorted.findLast((point) => windowsOf(point).length > 0) ?? sorted[sorted.length - 1]
  const resets = windowsOf(latest)
    .map(([, window]) => (typeof window.resetsAt === 'string' ? Date.parse(window.resetsAt) : NaN))
    .filter((ms) => !Number.isNaN(ms))
  return {
    start,
    end,
    nextReset: resets.length > 0 ? iso(Math.max(...resets)) : null,
    usedPercentAbsent: latest.usedPercentAbsent,
  }
}

// Calls, tokens and dollars by group, model, role and harness, and each group's quota windows and balance.
// With a window (the run's), a group the run read but never called is listed with no calls, and the balance counts only
// the readings inside the window: one logged later, such as by a hand-run status, is not the run's saldo al terminar.
function summarizeLanes(calls, readings, prices, notes, window = null) {
  const summary = { calls: 0, usd: 0, tokens: laneZeroTokens(), groups: {}, byModel: {}, byRole: {}, byHarness: {} }
  for (const call of calls) {
    const tokens = laneTokens(call.usage ?? {})
    const usd = laneDollars(call, tokens, prices, notes)
    summary.calls++
    summary.usd += usd
    addTokens(summary.tokens, tokens)
    const group = (summary.groups[call.group] ||= { calls: 0, usd: 0, tokens: laneZeroTokens(), quota: {} })
    group.calls++
    group.usd += usd
    addTokens(group.tokens, tokens)
    const model = (summary.byModel[call.model] ||= { calls: 0, ok: 0, failed: 0, quota: 0, violation: 0, blocked: 0, usd: 0 })
    model.calls++
    model.usd += usd
    if (LANE_STATUSES.includes(call.status)) model[call.status]++
    const role = (summary.byRole[call.role] ||= { calls: 0, usd: 0 })
    role.calls++
    role.usd += usd
    if (call.harness) {
      const harness = (summary.byHarness[call.harness] ||= { calls: 0, ok: 0, failed: 0, quota: 0, violation: 0, blocked: 0, usd: 0, tokens: laneZeroTokens() })
      harness.calls++
      harness.usd += usd
      addTokens(harness.tokens, tokens)
      if (LANE_STATUSES.includes(call.status)) harness[call.status]++
    }
  }
  const balanceReadings = window ? readings.filter((reading) => reading.time >= window.start && reading.time <= window.end) : readings
  if (window) {
    for (const reading of balanceReadings) {
      for (const name of Object.keys(reading.groups ?? {})) summary.groups[name] ||= { calls: 0, usd: 0, tokens: laneZeroTokens(), quota: {} }
    }
  }
  for (const [name, group] of Object.entries(summary.groups)) {
    group.quota = quotaConsumed(groupReadings(name, calls, readings))
    group.balance = balanceOf(groupReadings(name, calls, balanceReadings))
  }
  return summary
}

// The version that the newest reading of each harness names, by harness. A reading with no harness names none.
function versionsOf(readings) {
  const newest = new Map()
  const named = readings.filter((reading) => reading.version && reading.harness).sort((a, b) => b.time - a.time)
  for (const reading of named) {
    if (!newest.has(reading.harness)) newest.set(reading.harness, reading.version)
  }
  return Object.fromEntries(newest)
}

// Every launch's lane rounds, counted by the model that served them. A lane round's
// provider is "<harness> <model>"; a native round's is "native", which counts nowhere.
function launchesOf(results) {
  const attempts = {}
  for (const result of results) {
    for (const unit of result.units || []) {
      for (const round of unit.rounds || []) {
        const lane = typeof round.provider === 'string' ? /^\S+ (.+)$/.exec(round.provider) : null
        if (!lane) continue
        const tally = (attempts[lane[1]] ||= { attempts: 0, approved: 0 })
        tally.attempts++
        if (round.verdict === 'approve') tally.approved++
      }
    }
  }
  return { attempts }
}

// What the plans covered: the lanes' dollars beside the native dollars, and the lanes' share of both.
function totalsOf(nativeUsd, lanesUsd) {
  const totalUsd = nativeUsd + lanesUsd
  return { nativeUsd, lanesUsd, totalUsd, coveredShare: totalUsd === 0 ? 0 : lanesUsd / totalUsd }
}

// The lane log's share of the run, the run's calls being those inside its window, and of the usage session.
// The versions are each harness's, and version is agy's.
function laneReport({ dataDir, runId, start, end, usage, results, prices, notes, cost }) {
  const entries = readLog(dataDir)
  const isRunEntry = (entry) => entry.run === runId && (entry.kind === 'reading' || (entry.time >= start && entry.time <= end))
  const runLog = splitLog(entries.filter(isRunEntry))
  const sessionLog = usage ? splitLog(entries.filter((entry) => entry.session === usage.session)) : null
  const run = summarizeLanes(runLog.calls, runLog.readings, prices, notes, { start, end })
  const session = sessionLog ? summarizeLanes(sessionLog.calls, sessionLog.readings, prices, notes) : null
  const versions = versionsOf([...runLog.readings, ...(sessionLog ? sessionLog.readings : [])])
  return {
    version: versions.agy ?? null,
    versions,
    run: { ...run, ...launchesOf(results), choices: choicesOf(runLog.choices, runLog.tooks), work: workOf(runLog.tooks), quotaByHarness: quotaByHarness(run, runLog.calls) },
    session,
    totals: {
      run: totalsOf(cost ? cost.run.usd : 0, run.usd),
      session: cost && session ? totalsOf(cost.session.usd, session.usd) : null,
    },
  }
}

// The run's test baseline, or null when it is missing or unreadable.
function baselineOf(dir) {
  try {
    return readIfThere(path.join(dir, 'baseline.json'))
  } catch {
    return null
  }
}

// Runs the plan's test command in the integration worktree. It counts as known failures only when it failed
// and the run's baseline judges its output: every failure it names was failing before the run.
function runTests(graph, dir) {
  const r = spawnSync(graph.testCommand, {
    cwd: graph.integration.worktree,
    shell: true,
    encoding: 'utf8',
    timeout: TEST_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  })
  const timedOut = Boolean(r.error && r.error.code === 'ETIMEDOUT')
  // A run that timed out or was killed did not finish, so its output cannot show that only known tests fail.
  const finished = !timedOut && r.status !== null
  const output = `${r.stdout || ''}\n${r.stderr || ''}`
  const knownFailuresOnly = finished && r.status !== 0 && judge(baselineOf(dir), { exitCode: r.status, output }).pass
  return { command: graph.testCommand, exitCode: r.status, passed: r.status === 0, timedOut, knownFailuresOnly }
}

// The RADAR figures for the owner's five goals, each read from the report's own figures. A figure whose
// source was not measured is null: without usage there are no native dollars or share, and without a saved
// result there are no quality counts.
function radarOf({ speed, cost, lanes, quality }) {
  const nativeUsd = cost ? cost.run.usd : null
  const byHarness = Object.fromEntries(Object.entries(lanes.run.byHarness).map(([name, harness]) => [name, harness.calls]))
  return {
    rapid: { runMs: speed.run.ms, attempts: quality.attempts, climbed: quality.climbed, escalated: quality.escalated },
    autonomous: { questions: quality.questions },
    delegation: {
      laneCalls: lanes.run.calls,
      nativeUsd,
      lanesUsd: lanes.totals.run.lanesUsd,
      laneShare: cost ? lanes.totals.run.coveredShare : null,
      byHarness,
      byGroup: Object.fromEntries(Object.entries(lanes.run.groups).map(([name, group]) => [name, { calls: group.calls, balance: group.balance }])),
      work: lanes.run.work,
      quotaByHarness: lanes.run.quotaByHarness,
    },
    affordable: { totalUsd: cost ? lanes.totals.run.totalUsd : null, nativeUsd, lanesUsd: lanes.totals.run.lanesUsd },
    robust: {
      merged: quality.merged,
      adopted: quality.adopted,
      blocked: quality.blocked,
      testsPassed: quality.tests ? quality.tests.passed : null,
      testsKnownFailuresOnly: quality.tests ? quality.tests.knownFailuresOnly : null,
      findings: quality.findings,
      finalVerdict: quality.finalReview ? quality.finalReview.verdict : null,
    },
  }
}

// What the session exported of the superdelegation switch: on, off, or null when it was not exported.
function superdelegationOf(env) {
  const on = env.AETHER_SUPERDELEGATION
  return { on: on === 'on' ? true : on === 'off' ? false : null }
}

// The run's window starts when the plan was compiled and ends when the result was saved, or now.
function report(cwd, runId, { session = null, tests = true, dataDir = run.dataDir(), prices = loadPrices(), now = Date.now(), env = process.env } = {}) {
  run.assertRunId(runId)
  const { mainRoot } = repoPaths(cwd)
  const dir = run.runDir(mainRoot, runId)
  const graphFile = path.join(dir, 'graph.json')
  if (!fs.existsSync(graphFile)) throw new Error(`run ${runId} not found in ${mainRoot}`)
  const graph = run.readJson(graphFile)
  const state = readIfThere(path.join(dir, 'state.json'))
  const resultFile = path.join(dir, 'result.json')
  const results = readResults(dir)
  const saved = fs.existsSync(resultFile)
  const notes = []
  if (!saved) notes.push('no result.json in the run directory: save the workflow result there for quality counts and the end of the window')

  const start = state && state.compiledAt ? Date.parse(state.compiledAt) : fs.statSync(graphFile).mtimeMs
  const end = saved ? fs.statSync(resultFile).mtimeMs : now
  const sessions = readUsage(dataDir, { since: start })
  let usage = null
  if (session) {
    usage = sessions.get(session) || null
    if (!usage) throw new Error(`usage session ${session} not found in ${path.join(dataDir, 'usage')}`)
  } else {
    usage = pickSession(sessions, start, end)
  }
  if (!usage) notes.push('no usage recorded during the run: was the session started with claude --agent aether:lead?')
  const inRun = usage ? usage.entries.filter((entry) => within(entry, start, end)) : []
  const cost = usage
    ? {
        basis: `${prices.basis}, ${prices.snapshot}`,
        run: { ...summarize(usage, inRun, prices), agents: agentsOf(usage, inRun, prices) },
        session: summarize(usage, usage.entries, prices),
      }
    : null
  const lanes = laneReport({ dataDir, runId, start, end, usage, results, prices, notes, cost })

  const speed = {
    run: { start: iso(start), end: iso(end), ms: end - start },
    swarm: usage ? span(inRun.filter((entry) => isAether(usage, entry))) : null,
    session: usage ? span(usage.entries) : null,
  }
  const adopted = readIfThere(path.join(dir, 'adopted.json')) || {}
  const quality = { ...qualityOf(results, adopted), tests: tests ? runTests(graph, dir) : null }
  for (const unit of quality.adoptedUnits || []) {
    notes.push(`${unit.id} was integrated by hand at ${String(unit.commit).slice(0, 10)}: ${unit.reason}`)
  }
  // A retry that ran as one sub-attempt per owned file (issue 14). The quality counts are unchanged:
  // the pass is still one attempt of the unit.
  for (const result of results) {
    for (const unit of result.units || []) {
      for (const round of unit.rounds || []) {
        if (!round || round.split !== true) continue
        const note = `${unit.id} attempt ${round.attempt} was a split pass of ${round.subAttempts} sub-attempts`
        if (!notes.includes(note)) notes.push(note)
      }
    }
  }

  return {
    runId,
    plan: graph.plan,
    usage: {
      session: usage ? usage.session : null,
      claudeCode: usage ? usage.claudeCode : null,
      runRequests: inRun.length,
      sessionRequests: usage ? usage.entries.length : 0,
    },
    speed,
    cost,
    lanes,
    quality,
    radar: radarOf({ speed, cost, lanes, quality }),
    superdelegation: superdelegationOf(env),
    notes,
  }
}

// Deletes the usage sessions not written to for `days` (the usage meter's files never shrink). Before it deletes the
// parts of a session id, it adds what they spent to the session's summary (lib/spend-archive.js): a session whose
// summary cannot be written stays, for the next prune to try again, and leaves a trace of the failure under the data
// directory (prune-failures.json). A name that is not a session id goes with no summary.
function pruneUsage(dataDir, { days = 30, now = Date.now(), prices } = {}) {
  const root = path.join(dataDir, 'usage')
  const pruned = []
  if (!fs.existsSync(root)) return { pruned }
  for (const session of fs.readdirSync(root).sort()) {
    const dir = path.join(root, session)
    const written = lastWritten(dir)
    if (written === null || now - written < days * DAY_MS) continue
    if (isSessionId(session)) {
      try {
        archiveSpend(dataDir, session, 'usage', { prices })
      } catch (err) {
        noteFailure(dataDir, `usage/${session}`, err, now)
        continue
      }
      clearFailure(dataDir, `usage/${session}`)
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (err) {
      // Another prune deleted it first.
      if (err.code !== 'ENOENT') throw err
    }
    pruned.push(session)
  }
  return { pruned }
}

// The design seats' rounds (lib/seats.js), from the lane log: per seat, how many rounds an external model
// answered, how many went to the native agent and why, and per model the calls and dollars; for the lanes,
// the same summary as a run's. A round is one `aether-lane seat`: an external call, or a native answer.
function seatsReport({ dataDir = run.dataDir(), session = null, since = 0, prices = loadPrices() } = {}) {
  const ofSession = (entry) => session === null || entry.session === session
  const entries = readLog(dataDir, { since }).filter(ofSession)
  const calls = entries.filter((entry) => entry.kind === 'call' && typeof entry.seat === 'string')
  const answers = entries.filter((entry) => entry.kind === 'seat')
  const notes = []
  const bySeat = {}
  const seatOf = (name) => (bySeat[name] ||= { rounds: 0, external: 0, native: 0, off: 0, reasons: {}, models: {} })
  // A round whose entry names the reference pair of its decision lists it with the reason, in the order of the log.
  const decide = (seat, entry) => {
    if (entry.reference) (seat.decisions ||= []).push({ status: entry.status, reason: entry.reason ?? null, reference: entry.reference ?? null })
  }
  for (const call of calls) {
    const seat = seatOf(call.seat)
    seat.rounds++
    decide(seat, call)
    const model = (seat.models[`${call.harness} ${call.model}`] ||= { rounds: 0, ok: 0 })
    model.rounds++
    if (call.status === 'ok') {
      seat.external++
      model.ok++
    } else {
      seat.native++
      seat.reasons[`external ${call.status}`] = (seat.reasons[`external ${call.status}`] || 0) + 1
    }
  }
  for (const answer of answers) {
    const seat = seatOf(answer.seat)
    if (answer.status === 'off') {
      seat.off++
      continue
    }
    seat.rounds++
    seat.native++
    decide(seat, answer)
    const reason = answer.reason || 'unknown'
    seat.reasons[reason] = (seat.reasons[reason] || 0) + 1
  }
  const rounds = Object.values(bySeat).reduce((sum, seat) => sum + seat.rounds, 0)
  const external = Object.values(bySeat).reduce((sum, seat) => sum + seat.external, 0)
  const lanes = summarizeLanes(calls, [], prices, notes)
  return { session, since, rounds, external, externalShare: rounds === 0 ? null : external / rounds, bySeat, lanes, notes }
}

function aetherVersion() {
  return run.readJson(path.join(__dirname, '..', '.claude-plugin', 'plugin.json')).version
}

// Records the run in runs.jsonl, then removes its worktrees, branches and run directory.
function finalize(cwd, runId, options = {}) {
  const { now = Date.now(), dataDir = run.dataDir() } = options
  const r = report(cwd, runId, { ...options, dataDir })
  const versions = { aether: aetherVersion(), claudeCode: r.usage.claudeCode }
  // One version per lane harness that the lane log saw: agy's among them, as versions.agy.
  Object.assign(versions, r.lanes.versions)
  const record = {
    runId,
    status: 'finalized',
    finalizedAt: iso(now),
    repo: repoPaths(cwd).mainRoot,
    plan: r.plan,
    versions,
    report: r,
  }
  run.appendRecord(record, dataDir)
  return { record, cleanup: sweepRun(cwd, runId, { finish: true }) }
}

module.exports = { readUsage, pickSession, report, finalize, pruneUsage, seatsReport }
