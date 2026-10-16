// Policy v1: asymmetric authority. The router never inherits; it may RAISE freely; it may LOWER only for shapes that are safe to lower; quality gates keep the Lead's choice.
const fs = require('fs')
process.chdir(process.env.REPLAY_DIR || require('path').join(__dirname, 'out'))
const corpus = Object.fromEntries(fs.readFileSync('corpus2.jsonl', 'utf8').trim().split('\n').map(JSON.parse).map((r) => [r.id, r]))
const R = JSON.parse(fs.readFileSync('replay-v0.json', 'utf8')).map((r) => ({ ...r, reqs: corpus[r.id].actual.reqs, prompt: corpus[r.id].prompt }))
const P = { haiku: [0.10, 0.50, 0.01, 0.125, 0.20], sonnet: [2, 10, 0.10, 2.5, 4], opus: [4, 20, 0.20, 5, 8] }, HL = [0.50, 2.50, 0.05, 0.625, 1.00]
function reprice(reqs, to) { let u = 0; for (const [i, o, cr, w5, w1] of reqs) { if (to === 'haiku') { const t = 1.3, p = (i + cr + w5 + w1) * t >= 1e5 ? HL : P.haiku; u += t * (i * p[0] + o * p[1] + cr * p[2] + w5 * p[3] + w1 * p[4]) / 1e6 } else { const p = P[to]; u += (i * p[0] + o * p[1] + cr * p[2] + w5 * p[3] + w1 * p[4]) / 1e6 } } return u }
const ORD = { haiku: 0, sonnet: 1, opus: 2 }
// What the policy would pick if there were no Lead choice (the "default" for inherited calls).
function base(j) {
  const sh = j.shape.choice, st = j.stakes.score
  if (j.shape.c < 0.5 || j.stakes.c < 0.4) return 'sonnet'
  if (st >= 2.6) return 'sonnet'
  if (sh === 'lookup' || sh === 'explore') return 'haiku'
  if (sh === 'mechanical_edit' && st < 2.2) return 'haiku'
  if (sh === 'design') return 'opus'
  return 'sonnet'
}
const SAFE_DOWN = new Set(['lookup', 'explore', 'mechanical_edit'])
function v1(r) {
  const b = base(r)
  if (!r.mp) return { target: b, why: 'never inherit -> ' + b }                   // no Lead choice: the router sets it
  const lead = r.actual
  if (ORD[b] > ORD[lead]) return { target: b, why: 'raise' }                      // raising is always allowed
  if (ORD[b] < ORD[lead] && SAFE_DOWN.has(r.shape.choice) && r.shape.c >= 0.5) return { target: b, why: 'safe lower' }
  return { target: lead, why: 'keep Lead' }
}
let T = { actual: 0, routed: 0 }, by = {}, seg = { inherited: { a: 0, b: 0, n: 0 }, explicit: { a: 0, b: 0, n: 0 } }
for (const r of R) {
  const d = v1(r), cost = d.target === r.actual ? r.cost : reprice(r.reqs, d.target)
  T.actual += r.cost; T.routed += cost
  const s = seg[r.mp ? 'explicit' : 'inherited']; s.a += r.cost; s.b += cost; s.n++
  const k = `${r.mp ? 'explicit' : 'inherited'} ${r.actual}->${d.target} (${d.why.split(' ->')[0]})`
  ;(by[k] ||= { n: 0, a: 0, b: 0 }); by[k].n++; by[k].a += r.cost; by[k].b += cost
}
console.log('POLICY v1: actual $' + T.actual.toFixed(2), '-> $' + T.routed.toFixed(2), '(' + ((1 - T.routed / T.actual) * 100).toFixed(0) + '% less)')
for (const [k, v] of Object.entries(seg)) console.log(' ', k.padEnd(10), 'n=' + v.n, '$' + v.a.toFixed(2), '->', '$' + v.b.toFixed(2))
for (const [k, v] of Object.entries(by).sort((a, b) => b[1].a - a[1].a)) console.log('  ', k.padEnd(48), String(v.n).padStart(3), '$' + v.a.toFixed(2).padStart(7), '->', '$' + v.b.toFixed(2).padStart(7))
// Structural-only baseline: just never inherit, default Sonnet (no classifier at all)
let S = 0; for (const r of R) S += r.mp || r.actual !== 'opus' ? r.cost : reprice(r.reqs, 'sonnet')
console.log('\nBASELINE "never inherit Opus, default to Sonnet" (no classifier): $' + S.toFixed(2), '(' + ((1 - S / T.actual) * 100).toFixed(0) + '% less)  -> the classifier adds', ((S - T.routed) / T.actual * 100).toFixed(1), 'points on top')
// Lane eligibility: read-only (edits<0.5) delegations; level of the policy target
const ro = R.filter((r) => r.edits < 0.5)
const lvl = {}; for (const r of ro) { const t = v1(r).target; (lvl[t] ||= { n: 0, usd: 0 }); lvl[t].n++; lvl[t].usd += r.cost }
console.log('\nREAD-ONLY delegations (edits<0.5):', ro.length, 'of', R.length, '| actual $' + ro.reduce((s, r) => s + r.cost, 0).toFixed(2), '| by target level:', JSON.stringify(Object.fromEntries(Object.entries(lvl).map(([k, v]) => [k, v.n + ' / $' + v.usd.toFixed(0)]))))
const roGraders = ro.filter((r) => r.shape.choice === 'evaluate'); console.log('  of which graders (evaluate):', roGraders.length, '$' + roGraders.reduce((s, r) => s + r.cost, 0).toFixed(2))
