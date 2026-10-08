'use strict'

// Speed, cost and quality of a swarm run (spec §10), from its run directory, the usage meter's
// files and the saved result; and finalize, which records the run and removes what is left of it.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { repoPaths } = require('./git.js')
const run = require('./run.js')
const { loadPrices, priceEntry } = require('./prices.js')
const { sweepRun } = require('./worktrees.js')

const TEST_TIMEOUT_MS = 15 * 60 * 1000

const iso = (ms) => new Date(ms).toISOString()
const zeroTokens = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

function readIfThere(file) {
  return fs.existsSync(file) ? run.readJson(file) : null
}

// Every usage session under <dataDir>/usage, as { session, claudeCode, agents, entries }, with its
// parts merged in order. A part that cannot be read is skipped, and so is a session with no entries.
function readUsage(dataDir) {
  const root = path.join(dataDir, 'usage')
  const sessions = new Map()
  if (!fs.existsSync(root)) return sessions
  for (const session of fs.readdirSync(root)) {
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
  const total = { usd: 0, requests: 0, tokens: zeroTokens(), byModel: {}, byRole: {}, unpriced: [] }
  for (const entry of entries) {
    const model = entry.model || 'unknown'
    const role = typeOf(usage, entry)
    const byModel = (total.byModel[model] ||= { usd: 0, requests: 0, tokens: zeroTokens() })
    const byRole = (total.byRole[role] ||= { usd: 0, requests: 0 })
    total.requests++
    byModel.requests++
    byRole.requests++
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
  }
  return total
}

function countFindings(findings) {
  const counts = { critical: 0, important: 0, minor: 0 }
  for (const finding of findings || []) if (finding && finding.severity in counts) counts[finding.severity]++
  return counts
}

// Unit outcomes, escalations, every supervisor finding and the final review, from the saved result.
function qualityOf(result) {
  if (!result) {
    const unknown = ['units', 'merged', 'blocked', 'skipped', 'notRun', 'escalated', 'attempts', 'agents', 'findings', 'finalReview']
    return Object.fromEntries(unknown.map((key) => [key, null]))
  }
  const units = result.units || []
  const count = (status) => units.filter((unit) => unit.status === status).length
  const review = result.finalReview || null
  return {
    units: units.length,
    merged: count('merged'),
    blocked: count('blocked'),
    skipped: count('skipped'),
    notRun: count('not-run'),
    escalated: units.filter((unit) => (unit.tiers || []).length > 1).length,
    attempts: units.reduce((sum, unit) => sum + (unit.attempts || 0), 0),
    agents: result.agents ? result.agents.total : null,
    findings: countFindings(units.flatMap((unit) => (unit.rounds || []).flatMap((round) => round.findings || []))),
    finalReview: review ? { status: review.status, verdict: review.verdict || null, findings: countFindings(review.findings) } : null,
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
  const result = readIfThere(resultFile)
  const notes = []
  if (!result) notes.push('no result.json in the run directory: save the workflow result there for quality counts and the end of the window')

  const start = state && state.compiledAt ? Date.parse(state.compiledAt) : fs.statSync(graphFile).mtimeMs
  const end = result ? fs.statSync(resultFile).mtimeMs : now
  const sessions = readUsage(dataDir)
  let usage = null
  if (session) {
    usage = sessions.get(session) || null
    if (!usage) throw new Error(`usage session ${session} not found in ${path.join(dataDir, 'usage')}`)
  } else {
    usage = pickSession(sessions, start, end)
  }
  if (!usage) notes.push('no usage recorded during the run: is the usage meter loaded (aether-mode)?')
  const inRun = usage ? usage.entries.filter((entry) => within(entry, start, end)) : []

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
    cost: usage
      ? { basis: `${prices.basis}, ${prices.snapshot}`, run: summarize(usage, inRun, prices), session: summarize(usage, usage.entries, prices) }
      : null,
    quality: { ...qualityOf(result), tests: tests ? runTests(graph) : null },
    notes,
  }
}

function aetherVersion() {
  return run.readJson(path.join(__dirname, '..', '.claude-plugin', 'plugin.json')).version
}

function superpowersVersion() {
  const config = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  try {
    const installed = run.readJson(path.join(config, 'plugins', 'installed_plugins.json'))
    for (const [id, installs] of Object.entries(installed.plugins || {})) {
      if (id.startsWith('superpowers@') && Array.isArray(installs) && installs[0]) return installs[0].version || null
    }
  } catch {
    // superpowers is not installed here, or its record cannot be read
  }
  return null
}

// Records the run in runs.jsonl, then removes its worktrees, branches and run directory.
function finalize(cwd, runId, options = {}) {
  const { now = Date.now(), dataDir = run.dataDir() } = options
  const r = report(cwd, runId, { ...options, dataDir })
  const record = {
    runId,
    status: 'finalized',
    finalizedAt: iso(now),
    repo: repoPaths(cwd).mainRoot,
    plan: r.plan,
    versions: { aether: aetherVersion(), superpowers: superpowersVersion(), claudeCode: r.usage.claudeCode },
    report: r,
  }
  run.appendRecord(record, dataDir)
  return { record, cleanup: sweepRun(cwd, runId, { finish: true }) }
}

module.exports = { readUsage, pickSession, report, finalize }
