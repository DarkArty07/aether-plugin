'use strict'

// Calculate and compare ladders from quality and cost figures.
// Family: none.

function ladderFrom(rows, law) {
  const pool = rows.filter((row) => row.harness === 'claude' &&
    [row.intelligence, row.costPerTaskUsd, row.code, row.codeCostPerTaskUsd].every(Number.isFinite))
  const candidates = pool.filter((candidate) => law.candidateEfforts.includes(candidate.effort) &&
    !pool.some((other) => other !== candidate &&
      ((other.intelligence >= candidate.intelligence && other.costPerTaskUsd < candidate.costPerTaskUsd) ||
       (other.code >= candidate.code && other.codeCostPerTaskUsd < candidate.codeCostPerTaskUsd))))
  candidates.sort((a, b) => a.intelligence - b.intelligence || a.costPerTaskUsd - b.costPerTaskUsd)

  const kept = []
  const hundredths = (value) => Math.round(value * 100)
  const jump = hundredths(law.minJumpPoints)
  for (const next of candidates) {
    let keep = true
    while (kept.length) {
      const last = kept[kept.length - 1]
      if (hundredths(next.intelligence) - hundredths(last.intelligence) >= jump &&
          hundredths(next.code) - hundredths(last.code) >= jump) break
      if (next.costPerTaskUsd < last.costPerTaskUsd ||
          (next.costPerTaskUsd === last.costPerTaskUsd && next.intelligence > last.intelligence)) {
        kept.pop()
      } else {
        keep = false
        break
      }
    }
    if (keep) kept.push(next)
  }
  return kept.map(({ model, effort, intelligence, code }) => ({ model, effort, intelligence, code }))
}

function diffLadder(stored, computed) {
  const differences = []
  for (let i = 0; i < Math.max(stored.length, computed.length); i++) {
    const a = stored[i]
    const b = computed[i]
    if (!a) differences.push(`missing rung ${i + 1}: ${b.model} ${b.effort}`)
    else if (!b) differences.push(`extra rung ${i + 1}: ${a.model} ${a.effort}`)
    else if (a.model !== b.model || a.effort !== b.effort) {
      differences.push(`changed rung ${i + 1}: stored ${a.model} ${a.effort}, the law gives ${b.model} ${b.effort}`)
    }
  }
  return differences
}

module.exports = { ladderFrom, diffLadder }
