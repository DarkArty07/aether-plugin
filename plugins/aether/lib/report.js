'use strict'

// Speed, cost, quality and lanes of a swarm run (spec §10), from its run directory, the usage meter's
// files, the lane log and the saved result; and finalize, which records the run and removes what is left of it.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { repoPaths } = require('./git.js')
const run = require('./run.js')
const { loadPrices, priceEntry } = require('./prices.js')
const { readLog, quotaConsumed, laneTokens } = require('./lanes.js')
const { sweepRun } = require('./worktrees.js')

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

// Unit outcomes, escalations, climbs, every supervisor finding and the final reviews, over every launch.
// A unit's latest launch gives its status; attempts and findings add up across launches. A unit counts
// as escalated when a launch moved it to another model or a relaunch started it on another model, and
// as climbed when a launch raised its effort on one model.
function qualityOf(results) {
  if (results.length === 0) {
    const unknown = ['launches', 'units', 'merged', 'blocked', 'skipped', 'notRun', 'escalated', 'climbed', 'attempts', 'agents', 'findings', 'finalReview']
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
  const all = [...units.values()]
  const count = (status) => all.filter((unit) => unit.status === status).length
  return {
    launches: results.length,
    units: all.length,
    merged: count('merged'),
    blocked: count('blocked'),
    skipped: count('skipped'),
    notRun: count('not-run'),
    escalated: all.filter((unit) => unit.escalated).length,
    climbed: all.filter((unit) => unit.climbed).length,
    attempts: all.reduce((sum, unit) => sum + unit.attempts, 0),
    agents,
    findings: countFindings(all.flatMap((unit) => unit.findings)),
    finalReview: review ? { status: review.status, verdict: review.verdict || null, findings: countFindings(reviewFindings), reviews } : null,
  }
}

const splitLog = (entries) => ({
  calls: entries.filter((entry) => entry.kind === 'call'),
  readings: entries.filter((entry) => entry.kind === 'reading'),
})

// A lane call's dollars at list price. A model with no price counts $0, and is noted once.
function laneDollars(call, tokens, prices, notes) {
  const usd = priceEntry({ model: call.model, ...tokens, agent: 'lane' }, prices)
  if (usd !== null) return usd
  const note = `no price for lane model ${call.model}`
  if (!notes.includes(note)) notes.push(note)
  return 0
}

// A group's quota readings: each reading's own, and each call's before and after the call. quotaConsumed sorts them.
function groupReadings(group, calls, readings) {
  const points = []
  const add = (time, quota) => {
    if (quota && quota.windows) points.push({ time, windows: quota.windows })
  }
  for (const reading of readings) add(reading.time, reading.groups && reading.groups[group])
  for (const call of calls) {
    if (call.group !== group) continue
    add(call.startedAt, call.quotaBefore)
    add(call.time, call.quotaAfter)
  }
  return points
}

// Calls, tokens and dollars by group, model and role, and each group's quota windows.
function summarizeLanes(calls, readings, prices, notes) {
  const summary = { calls: 0, usd: 0, tokens: laneZeroTokens(), groups: {}, byModel: {}, byRole: {} }
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
  }
  for (const [name, group] of Object.entries(summary.groups)) {
    group.quota = quotaConsumed(groupReadings(name, calls, readings))
  }
  return summary
}

// The agy version of the latest reading that names one, or null.
function versionOf(readings) {
  const named = readings.filter((reading) => reading.version).sort((a, b) => b.time - a.time)
  return named.length > 0 ? named[0].version : null
}

// Every launch's agy rounds, counted by the agy model that served them, and the lanes' overflow.
function launchesOf(results) {
  const attempts = {}
  let overflow = 0
  for (const result of results) {
    overflow += (result.lanes && result.lanes.overflow) || 0
    for (const unit of result.units || []) {
      for (const round of unit.rounds || []) {
        if (typeof round.provider !== 'string' || !round.provider.startsWith('agy ')) continue
        const tally = (attempts[round.provider.slice('agy '.length)] ||= { attempts: 0, approved: 0 })
        tally.attempts++
        if (round.verdict === 'approve') tally.approved++
      }
    }
  }
  return { attempts, overflow }
}

// What the plans covered: the lanes' dollars beside the native dollars, and the lanes' share of both.
function totalsOf(nativeUsd, lanesUsd) {
  const totalUsd = nativeUsd + lanesUsd
  return { nativeUsd, lanesUsd, totalUsd, coveredShare: totalUsd === 0 ? 0 : lanesUsd / totalUsd }
}

// The lane log's share of the run, the run's calls being those inside its window, and of the usage session.
function laneReport({ dataDir, runId, start, end, usage, results, prices, notes, cost }) {
  const entries = readLog(dataDir)
  const isRunEntry = (entry) => entry.run === runId && (entry.kind === 'reading' || (entry.time >= start && entry.time <= end))
  const runLog = splitLog(entries.filter(isRunEntry))
  const sessionLog = usage ? splitLog(entries.filter((entry) => entry.session === usage.session)) : null
  const run = summarizeLanes(runLog.calls, runLog.readings, prices, notes)
  const session = sessionLog ? summarizeLanes(sessionLog.calls, sessionLog.readings, prices, notes) : null
  return {
    version: versionOf([...runLog.readings, ...(sessionLog ? sessionLog.readings : [])]),
    run: { ...run, ...launchesOf(results) },
    session,
    totals: {
      run: totalsOf(cost ? cost.run.usd : 0, run.usd),
      session: cost && session ? totalsOf(cost.session.usd, session.usd) : null,
    },
  }
}

// Runs the plan's test command in the integration worktree.
function runTests(graph) {
  const r = spawnSync(graph.testCommand, {
    cwd: graph.integration.worktree,
    shell: true,
    encoding: 'utf8',
    timeout: TEST_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  })
  return { command: graph.testCommand, exitCode: r.status, passed: r.status === 0, timedOut: Boolean(r.error && r.error.code === 'ETIMEDOUT') }
}

// The run's window starts when the plan was compiled and ends when the result was saved, or now.
function report(cwd, runId, { session = null, tests = true, dataDir = run.dataDir(), prices = loadPrices(), now = Date.now() } = {}) {
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

  return {
    runId,
    plan: graph.plan,
    usage: {
      session: usage ? usage.session : null,
      claudeCode: usage ? usage.claudeCode : null,
      runRequests: inRun.length,
      sessionRequests: usage ? usage.entries.length : 0,
    },
    speed: {
      run: { start: iso(start), end: iso(end), ms: end - start },
      swarm: usage ? span(inRun.filter((entry) => isAether(usage, entry))) : null,
      session: usage ? span(usage.entries) : null,
    },
    cost,
    lanes,
    quality: { ...qualityOf(results), tests: tests ? runTests(graph) : null },
    notes,
  }
}

// Deletes the usage sessions not written to for `days` (the usage meter's files never shrink).
function pruneUsage(dataDir, { days = 30, now = Date.now() } = {}) {
  const root = path.join(dataDir, 'usage')
  const pruned = []
  if (!fs.existsSync(root)) return { pruned }
  for (const session of fs.readdirSync(root).sort()) {
    const dir = path.join(root, session)
    const written = lastWritten(dir)
    if (written === null || now - written < days * DAY_MS) continue
    fs.rmSync(dir, { recursive: true, force: true })
    pruned.push(session)
  }
  return { pruned }
}

function aetherVersion() {
  return run.readJson(path.join(__dirname, '..', '.claude-plugin', 'plugin.json')).version
}

// Records the run in runs.jsonl, then removes its worktrees, branches and run directory.
function finalize(cwd, runId, options = {}) {
  const { now = Date.now(), dataDir = run.dataDir() } = options
  const r = report(cwd, runId, { ...options, dataDir })
  const versions = { aether: aetherVersion(), claudeCode: r.usage.claudeCode }
  if (r.lanes.version) versions.agy = r.lanes.version
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

module.exports = { readUsage, pickSession, report, finalize, pruneUsage }
