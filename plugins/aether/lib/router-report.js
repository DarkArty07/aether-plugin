'use strict'

// The delegates report (R30): one row per delegation the router decided, joining the decision log's
// `decision`, `spawn` and `outcome` entries with the usage meter's requests and their prices.

const run = require('./run.js')
const { readJournal } = require('./router-log.js')
const { readUsage } = require('./report.js')
const { loadPrices, priceEntry } = require('./prices.js')

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
    else if (entry.kind === 'outcome') outcomes.set(entry.id, entry)
  }
  const delegations = entries
    .filter((entry) => entry.kind === 'decision')
    .map((entry) => {
      const spawn = spawns.get(entry.id)
      const outcome = outcomes.get(entry.id)
      const agentId = spawn ? spawn.agentId || null : null
      const decision = entry.decision || null
      const failed = Boolean(outcome) && outcome.status !== 'ok'
      let fallback = entry.fallback || null
      if (!fallback && failed) fallback = `external ${outcome.status}`
      // An external delegate that ended ok ran on its outcome's rung. One that did not was rerun by its agent on Claude,
      // on the rescue rung the decision recorded, and that rerun spent tokens.
      let ranOn = entry.ranOn || null
      if (outcome) ranOn = failed ? entry.rescue || null : { harness: outcome.harness, model: outcome.model, effort: outcome.effort }
      return {
        id: entry.id,
        time: entry.time,
        session: entry.session,
        description: entry.description,
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
        durationMs: outcome ? outcome.durationMs : null,
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
  return { delegations, totals }
}

module.exports = { delegatesReport }
