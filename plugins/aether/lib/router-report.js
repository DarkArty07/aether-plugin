'use strict'

// The delegates report (R30): one row per delegation the router decided, joining the decision log's
// `decision`, `spawn` and `outcome` entries with the usage meter's requests and their prices. A delegation has one
// outcome per attempt of its external delegate (lib/delegate-chain.js): the last decides where it ran, and the report
// lists them all.

const run = require('./run.js')
const { readJournal } = require('./router-log.js')
const { readUsage } = require('./report.js')
const { loadPrices, priceEntry } = require('./prices.js')
const { readLog: readLaneLog } = require('./lanes.js')

const OUTSIDE_MEASURE =
  'Calls the router never records are outside this measure: aether:* agents leave no journal entry, calls whose brief carries ROUTER-OVERRIDE: are recorded without a class, and a session without router settings records nothing. A delegate that edits by one of those routes is not listed, and that is a limit of the measure, not a no-candidate.'

// The summed price of the requests the delegation's agent made, or null with no agent or no priced request.
function costOf(agentId, session, usage, prices) {
  if (!agentId) return null
  let total = null
  for (const sessionUsage of usage.values()) {
    if (sessionUsage.session !== session) continue
    for (const entry of sessionUsage.entries) {
      if (entry.agent !== agentId) continue
      const usd = priceEntry(entry, prices)
      if (usd !== null) total = (total || 0) + usd
    }
  }
  return total
}

function delegatesReport({ dataDir = run.dataDir(), session = null, since = 0, prices = loadPrices() } = {}) {
  const entries = readJournal(dataDir, { since, session })
  const usage = readUsage(dataDir, { since })
  const spawns = new Map()
  const outcomes = new Map()
  for (const entry of entries) {
    if (entry.kind === 'spawn') spawns.set(entry.id, entry)
    else if (entry.kind === 'outcome') outcomes.set(entry.id, [...(outcomes.get(entry.id) ?? []), entry])
  }
  const delegations = entries
    .filter((entry) => entry.kind === 'decision')
    .map((entry) => {
      const spawn = spawns.get(entry.id)
      const attempted = outcomes.get(entry.id) ?? []
      const outcome = attempted.length > 0 ? attempted[attempted.length - 1] : undefined
      const agentId = spawn ? spawn.agentId || null : null
      const decision = entry.decision || null
      const failed = Boolean(outcome) && outcome.status !== 'ok'
      let fallback = entry.fallback || null
      if (!fallback && failed) fallback = `external ${outcome.status}`
      // An external delegate that ended ok ran on its outcome's rung. One that did not was rerun by its agent on Claude,
      // on the rescue rung the decision recorded, and that rerun spent tokens. So was one with no outcome at all: the
      // delegate bin died before it wrote one, and the mod ran the agent.
      let ranOn = entry.ranOn || null
      if (outcome) ranOn = failed ? entry.rescue || null : { harness: outcome.harness, model: outcome.model, effort: outcome.effort }
      else if (entry.applied === 'external') ranOn = entry.rescue || null
      return {
        id: entry.id,
        time: entry.time,
        session: entry.session,
        description: entry.description,
        taskClass: entry.taskClass ?? null,
        aetherTask: entry.aetherTask ?? null,
        mode: entry.mode,
        decider: entry.decider,
        requested: entry.requested || null,
        override: entry.override || null,
        decision,
        reason: decision ? decision.reason : null,
        confidence: decision ? decision.confidence : null,
        applied: entry.applied,
        fallback,
        ranOn,
        agentId,
        costUsd: outcome && !failed ? null : costOf(agentId, entry.session, usage, prices),
        quotaSpent: outcome ? outcome.quotaSpent || null : null,
        durationMs: outcome ? attempted.reduce((sum, attempt) => sum + (Number.isFinite(attempt.durationMs) ? attempt.durationMs : 0), 0) : null,
        attempts: attempted.map((attempt) => ({ harness: attempt.harness, model: attempt.model, effort: attempt.effort, status: attempt.status, detail: attempt.detail })),
      }
    })
  const totals = {
    delegations: delegations.length,
    decided: delegations.filter((d) => (d.applied === 'rewritten' || d.applied === 'external') && !d.fallback).length,
    overridden: delegations.filter((d) => d.override).length,
    fallback: delegations.filter((d) => d.fallback).length,
    inherited: delegations.filter((d) => d.applied === 'inherited').length,
    recorded: delegations.filter((d) => d.decision && d.mode === 'record').length,
    costUsd: delegations.reduce((sum, d) => sum + (d.costUsd === null ? 0 : d.costUsd), 0),
  }
  const laneEntries = readLaneLog(dataDir, { since })
  const noCandidateIds = new Set(
    laneEntries
      .filter((e) => e && e.kind === 'delegate' && e.status === 'no-candidate' && e.id)
      .map((e) => e.id),
  )
  const editsOnClaudeWithoutNoCandidate = editsWithoutNoCandidate(delegations, noCandidateIds)
  return {
    delegations,
    totals,
    editsOnClaudeWithoutNoCandidate,
    outsideMeasure: OUTSIDE_MEASURE,
  }
}

// Whether a delegation's call ran on Claude. A record or advise with no model and effort asked keeps `ranOn` null,
// because the journal cannot name the inherited pair (plan D7): that call ran native on Claude unless it was external
// or one of its attempts went out to another harness.
function ranOnClaude(delegation) {
  if (delegation.ranOn) return delegation.ranOn.harness === 'claude'
  const attempted = Array.isArray(delegation.attempts) && delegation.attempts.length > 0
  return delegation.applied !== 'external' && !attempted
}

function editsWithoutNoCandidate(delegations, noCandidateIds) {
  const ids = noCandidateIds instanceof Set ? noCandidateIds : new Set(noCandidateIds || [])
  const result = []
  for (const d of delegations || []) {
    if (d.taskClass !== 'edits') continue
    if (!ranOnClaude(d)) continue
    if (d.aetherTask && ids.has(d.aetherTask)) continue
    result.push({
      id: d.id,
      time: d.time,
      session: d.session,
      description: d.description,
      aetherTask: d.aetherTask ?? null,
      ranOn: d.ranOn,
    })
  }
  return result
}

module.exports = { delegatesReport, editsWithoutNoCandidate }
