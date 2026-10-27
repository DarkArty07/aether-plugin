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
            title: `Baja tasa de aprobación en el escalón ${step}`,
            evidence: [`Escalón "${step}": ${stats.approved} aprobaciones en ${stats.launches} lanzamientos (tasa: ${rate})`],
            numbers: { step, launches: stats.launches, approved: stats.approved, rate },
            firstTime,
            lastTime,
            sessions,
            proposal: `Propuesta: revisar o ajustar el escalón "${step}" en config/ladder.json por baja tasa de aprobación (${stats.approved}/${stats.launches}). No se aplica automáticamente.`,
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
              title: `Velocidad observada de ${key} por debajo de su ficha`,
              evidence: [`Par "${key}": velocidad observada de ${observed} tokens/s en ${calls} llamadas (ficha: ${ficha} tokens/s)`],
              numbers: { observed, ficha, calls },
              firstTime: null,
              lastTime: null,
              sessions: [],
              proposal: `Propuesta: la velocidad observada de "${key}" (${observed} tokens/s) está por debajo de su ficha (${ficha} tokens/s). Considerar calibrar outputTokensPerSecond en config/pairs.json. No se aplica automáticamente.`,
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
            title: `Tasa de fallos elevada en el par ${key}`,
            evidence: [`Par "${key}": ${calls - ok} fallos en ${calls} llamadas (tasa: ${rate})`],
            numbers: { calls, ok, rate },
            firstTime: null,
            lastTime: null,
            sessions: [],
            proposal: `Propuesta: la tasa de fallos de "${key}" (${rate}) supera el umbral máximo de ${cfg.pairFailureRate.maxRate}. Considerar revisar la estabilidad del modelo o harness. No se aplica automáticamente.`,
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
              title: `Desfase de costo en el par ${key}`,
              evidence: [`Par "${key}": costo observado de $${actual} por tarea en ${pricedCalls} llamadas (ficha: $${ficha})`],
              numbers: { actual, ficha, calls: pricedCalls },
              firstTime: null,
              lastTime: null,
              sessions: [],
              proposal: `Propuesta: el costo observado de "${key}" ($${actual} por tarea) difiere de la ficha ($${ficha} por tarea). Considerar calibrar costPerTaskUsd en config/pairs.json. No se aplica automáticamente.`,
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
          title: `Exceso de rondas en el rol ${seat} del diseño ${design}`,
          evidence: [`Diseño "${design}", rol "${seat}": ${rounds} rondas realizadas (máximo: ${cfg.designRounds.maxRounds})`],
          numbers: { rounds, design, seat },
          firstTime: null,
          lastTime: null,
          sessions: [],
          proposal: `Propuesta: el rol "${seat}" en el diseño "${design}" requirió ${rounds} rondas, superando el límite de ${cfg.designRounds.maxRounds}. Considerar calibrar las rondas del diseño. No se aplica automáticamente.`,
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
