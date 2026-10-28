'use strict'

// Calibration signals for Aether self-observation.
// Pure functions evaluating thresholds over usage metrics without mutating inputs or configuration.
// Family: observe.

function approvalByStep(delegateEntries = []) {
  const result = {}
  if (!Array.isArray(delegateEntries)) return result
  for (const entry of delegateEntries) {
    if (!entry || typeof entry.step !== 'string' || !entry.step) continue
    const step = entry.step
    if (!result[step]) {
      result[step] = { launches: 0, approved: 0, fixes: 0, rises: 0 }
    }
    if (entry.kind === 'launch') {
      if (entry.launchKind !== 'refused') {
        result[step].launches += 1
      }
      if (entry.launchKind === 'fix') {
        result[step].fixes += 1
      } else if (entry.launchKind === 'rise') {
        result[step].rises += 1
      }
    } else if (entry.kind === 'verdict') {
      if (entry.verdict === 'approved') {
        result[step].approved += 1
      }
    }
  }
  return result
}

function findPair(pairs, key) {
  if (!Array.isArray(pairs)) return null
  return pairs.find((p) => p && (`${p.harness}/${p.group}@${p.effort}` === key || p.id === key)) || null
}

function calibrationSignals({ delegateEntries = [], lanes = {}, seats = {}, pairs = [] } = {}, cfg = {}) {
  const findings = []

  // 1. approval-low
  if (cfg?.approval && Array.isArray(delegateEntries)) {
    const byStep = approvalByStep(delegateEntries)
    for (const [step, stats] of Object.entries(byStep)) {
      if (stats.launches >= cfg.approval.minAttempts) {
        const rate = stats.launches === 0 ? 0 : stats.approved / stats.launches
        if (rate < cfg.approval.lowRate) {
          const stepEntries = delegateEntries.filter((e) => e && e.step === step)
          const sessions = [...new Set(stepEntries.map((e) => e.session).filter((s) => typeof s === 'string' && s.length > 0))]
          const times = stepEntries
            .map((e) => (typeof e.time === 'number' ? e.time : typeof e.time === 'string' ? Date.parse(e.time) : null))
            .filter((t) => typeof t === 'number' && !Number.isNaN(t))
          const firstTime = times.length > 0 ? Math.min(...times) : null
          const lastTime = times.length > 0 ? Math.max(...times) : null

          findings.push({
            id: `approval-low:${step}`,
            kind: 'calibration',
            type: 'approval-low',
            title: `Low approval rate at step ${step}`,
            evidence: [`Step "${step}": ${stats.approved} approvals in ${stats.launches} launches (rate: ${rate})`],
            numbers: { step, launches: stats.launches, approved: stats.approved, rate },
            firstTime,
            lastTime,
            sessions,
            proposal: `Proposal: review or adjust step "${step}" in config/ladder.json for its low approval rate (${stats.approved}/${stats.launches}). Not applied automatically.`,
          })
        }
      }
    }
  }

  // 2, 3, 5: lanes-based signals (pair-slow, pair-failing-rate, cost-mismatch)
  if (lanes && typeof lanes === 'object') {
    for (const [key, lane] of Object.entries(lanes)) {
      if (!lane || typeof lane !== 'object') continue
      const calls = typeof lane.calls === 'number' ? lane.calls : 0
      const ok = typeof lane.ok === 'number' ? lane.ok : 0
      const pair = findPair(pairs, key)

      // pair-slow
      if (cfg?.pairSpeed && calls >= cfg.pairSpeed.minCalls && pair) {
        const ficha = pair.outputTokensPerSecond
        if (ficha !== null && ficha !== undefined && typeof lane.durationMs === 'number' && lane.durationMs > 0) {
          const durationSeconds = lane.durationMs / 1000
          const observed = (lane.outputTokens ?? 0) / durationSeconds
          if (observed < ficha * cfg.pairSpeed.ratio) {
            findings.push({
              id: `pair-slow:${key}`,
              kind: 'calibration',
              type: 'pair-slow',
              title: `Observed speed of ${key} below its sheet`,
              evidence: [`Pair "${key}": observed speed of ${observed} tokens/s in ${calls} calls (sheet: ${ficha} tokens/s)`],
              numbers: { observed, ficha, calls },
              firstTime: null,
              lastTime: null,
              sessions: [],
              proposal: `Proposal: the observed speed of "${key}" (${observed} tokens/s) is below its sheet (${ficha} tokens/s). Consider calibrating outputTokensPerSecond in config/pairs.json. Not applied automatically.`,
            })
          }
        }
      }

      // pair-failing-rate
      if (cfg?.pairFailureRate && calls >= cfg.pairFailureRate.minCalls) {
        const rate = (calls - ok) / calls
        if (rate > cfg.pairFailureRate.maxRate) {
          findings.push({
            id: `pair-failing-rate:${key}`,
            kind: 'calibration',
            type: 'pair-failing-rate',
            title: `High failure rate in pair ${key}`,
            evidence: [`Pair "${key}": ${calls - ok} failures in ${calls} calls (rate: ${rate})`],
            numbers: { calls, ok, rate },
            firstTime: null,
            lastTime: null,
            sessions: [],
            proposal: `Proposal: the failure rate of "${key}" (${rate}) is above the maximum of ${cfg.pairFailureRate.maxRate}. Consider checking the stability of the model or harness. Not applied automatically.`,
          })
        }
      }

      // cost-mismatch
      const pricedCalls = typeof lane.pricedCalls === 'number' ? lane.pricedCalls : calls
      if (cfg?.cost && pricedCalls >= cfg.cost.minCalls && pricedCalls > 0 && pair) {
        const ficha = pair.costPerTaskUsd
        if (ficha !== null && ficha !== undefined && typeof lane.usd === 'number') {
          const actual = lane.usd / pricedCalls
          const minRatio = ficha / cfg.cost.ratio
          const maxRatio = ficha * cfg.cost.ratio
          if (actual < minRatio || actual > maxRatio) {
            findings.push({
              id: `cost-mismatch:${key}`,
              kind: 'calibration',
              type: 'cost-mismatch',
              title: `Cost mismatch in pair ${key}`,
              evidence: [`Pair "${key}": observed cost of $${actual} per task in ${pricedCalls} calls (sheet: $${ficha})`],
              numbers: { actual, ficha, calls: pricedCalls },
              firstTime: null,
              lastTime: null,
              sessions: [],
              proposal: `Proposal: the observed cost of "${key}" ($${actual} per task) differs from its sheet ($${ficha} per task). Consider calibrating costPerTaskUsd in config/pairs.json. Not applied automatically.`,
            })
          }
        }
      }
    }
  }

  // 4. design-rounds
  if (cfg?.designRounds && seats && typeof seats === 'object') {
    for (const [key, rounds] of Object.entries(seats)) {
      if (typeof rounds === 'number' && rounds > cfg.designRounds.maxRounds) {
        const slash = key.indexOf('/')
        const design = slash === -1 ? key : key.slice(0, slash)
        const seat = slash === -1 ? '' : key.slice(slash + 1)
        findings.push({
          id: `design-rounds:${key}`,
          kind: 'calibration',
          type: 'design-rounds',
          title: `Too many rounds in the ${seat} role of design ${design}`,
          evidence: [`Design "${design}", role "${seat}": ${rounds} rounds run (maximum: ${cfg.designRounds.maxRounds})`],
          numbers: { rounds, design, seat },
          firstTime: null,
          lastTime: null,
          sessions: [],
          proposal: `Proposal: the role "${seat}" in design "${design}" needed ${rounds} rounds, above the limit of ${cfg.designRounds.maxRounds}. Consider calibrating the rounds of the design. Not applied automatically.`,
        })
      }
    }
  }

  return findings
}

module.exports = {
  approvalByStep,
  calibrationSignals,
}
