'use strict'

// Compares the two paid replays of the same real delegations: Haiku (claude -p) and Jev (OpenRouter).
//   node compare.js haiku-full.json jev-full.json
const fs = require('node:fs')

const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
const haiku = read(process.argv[2])
const jev = read(process.argv[3])

const LEVELS = ['A', 'B', 'C', 'D']
const pct = (a, b) => (b === 0 ? 'n/a' : `${((100 * a) / b).toFixed(1)} %`)
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2) : null
}
const pctile = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.ceil(p * s.length) - 1] : null
}
const count = (rows, f) => rows.reduce((m, r) => ((m[f(r)] = (m[f(r)] || 0) + 1), m), {})

function describe(name, rep) {
  const rows = rep.rows
  const decided = rows.filter((r) => r.decision)
  console.log(`\n== ${name}`)
  console.log('totals:', JSON.stringify(rep.totals))
  console.log('decided:', decided.length, 'of', rows.length, '| fallbacks by reason:', JSON.stringify(count(rows.filter((r) => r.fallback), (r) => r.fallback)))
  console.log('levels:', JSON.stringify(count(decided, (r) => r.decision.level)))
  console.log('rungs:', JSON.stringify(count(decided, (r) => `${r.decision.alias} ${r.decision.effort}`)))
  console.log('flags: gate', decided.filter((r) => r.decision.flags.gate).length, '| lowConfidence', decided.filter((r) => r.decision.flags.lowConfidence).length)
  const calls = rows.map((r) => r.call).filter(Boolean)
  const ms = calls.map((c) => c.durationMs).filter(Number.isFinite)
  const usd = calls.map((c) => c.costUsd).filter(Number.isFinite)
  if (ms.length) console.log(`call latency (CLI-reported): n ${ms.length}, median ${median(ms)} ms, p90 ${pctile(ms, 0.9)} ms, max ${Math.max(...ms)} ms | cost ${usd.reduce((a, b) => a + b, 0).toFixed(4)} USD (${(usd.reduce((a, b) => a + b, 0) / usd.length).toFixed(5)} each)`)
  const withLead = decided.filter((r) => r.lead.usd !== null && r.estimatedUsd !== null)
  const leadUsd = withLead.reduce((a, r) => a + r.lead.usd, 0)
  const estUsd = withLead.reduce((a, r) => a + r.estimatedUsd, 0)
  console.log(`priced rows ${withLead.length}: the Lead's runs cost ${leadUsd.toFixed(2)} USD; at the decided rungs ${estUsd.toFixed(2)} USD (${pct(leadUsd - estUsd, leadUsd)} less)`)
  console.log('changed vs the Lead:', decided.filter((r) => r.changed).length, 'of', decided.length, `(${pct(decided.filter((r) => r.changed).length, decided.length)})`)
}

describe('Haiku low (claude -p)', haiku)
describe('Jev (typesafe/jev-1.14 on OpenRouter)', jev)

// ---- agreement ----
const jevById = new Map(jev.rows.map((r) => [r.id, r]))
const both = haiku.rows.filter((r) => r.decision && jevById.get(r.id) && jevById.get(r.id).decision)
console.log(`\n== Agreement on the ${both.length} delegations both decided`)
let sameLevel = 0
let sameRung = 0
let withinOne = 0
let haikuLower = 0
let haikuHigher = 0
let sameAxis = 0
const matrix = {}
for (const h of both) {
  const j = jevById.get(h.id)
  const hl = LEVELS.indexOf(h.decision.level)
  const jl = LEVELS.indexOf(j.decision.level)
  if (hl === jl) sameLevel += 1
  if (Math.abs(hl - jl) <= 1) withinOne += 1
  if (hl < jl) haikuLower += 1
  if (hl > jl) haikuHigher += 1
  if (h.decision.alias === j.decision.alias && h.decision.effort === j.decision.effort) sameRung += 1
  if (h.decision.axis === j.decision.axis) sameAxis += 1
  const key = `${h.decision.level}|${j.decision.level}`
  matrix[key] = (matrix[key] || 0) + 1
}
console.log('same level:', sameLevel, pct(sameLevel, both.length), '| within one level:', withinOne, pct(withinOne, both.length))
console.log('same rung (model+effort):', sameRung, pct(sameRung, both.length), '| same axis:', sameAxis, pct(sameAxis, both.length))
console.log('Haiku lower than Jev:', haikuLower, '| Haiku higher:', haikuHigher)
console.log('confusion (Haiku level | Jev level):')
for (const hl of LEVELS) console.log('  Haiku ' + hl + ': ' + LEVELS.map((jl) => `${jl}=${matrix[`${hl}|${jl}`] || 0}`).join('  '))

// Agreement with what the Lead chose, per decider (the Lead is not the truth, only the reference).
for (const [name, rep] of [['Haiku', haiku], ['Jev', jev]]) {
  const decided = rep.rows.filter((r) => r.decision)
  const same = decided.filter((r) => !r.changed).length
  console.log(`${name}: the Lead's own rung kept in ${same} of ${decided.length} (${pct(same, decided.length)})`)
}

// Where the two disagree most: a sample of the descriptions (no prompts).
console.log('\nLargest disagreements (|level gap| >= 2):')
for (const h of both) {
  const j = jevById.get(h.id)
  const gap = Math.abs(LEVELS.indexOf(h.decision.level) - LEVELS.indexOf(j.decision.level))
  if (gap >= 2) console.log(`  ${h.id.slice(-8)} "${h.description.slice(0, 60)}" | lead ${h.lead.model} ${h.lead.effort} | Haiku ${h.decision.level} (${h.decision.reason.slice(0, 70)}) | Jev ${j.decision.level} (${j.decision.reason.slice(0, 70)})`)
}

// Savings by decider, when the decision is followed.
const out = {
  haiku: { n: haiku.rows.filter((r) => r.decision).length, fallback: haiku.totals.fallback },
  jev: { n: jev.rows.filter((r) => r.decision).length, fallback: jev.totals.fallback },
  agreement: { n: both.length, sameLevel, withinOne, sameRung, sameAxis, haikuLower, haikuHigher },
}
fs.writeFileSync(process.argv[4] || 'compare.json', JSON.stringify(out, null, 1))
