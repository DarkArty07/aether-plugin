const fs = require('fs')
const D = (process.env.REPLAY_DIR || require('path').join(__dirname, 'out') + '/')
const corpus = Object.fromEntries(fs.readFileSync(D + 'corpus2.jsonl', 'utf8').trim().split('\n').map(JSON.parse).map((r) => [r.id, r]))
const jev = fs.readFileSync(D + 'jev-results.jsonl', 'utf8').trim().split('\n').map(JSON.parse).filter((r) => !r.failed)
const rows = jev.map((j) => ({ ...corpus[j.id], j })).filter((r) => r.actual)
const P = { haiku: [0.10, 0.50, 0.01, 0.125, 0.20], sonnet: [2, 10, 0.10, 2.5, 4], opus: [4, 20, 0.20, 5, 8] }
const HL = [0.50, 2.50, 0.05, 0.625, 1.00]
const fam = (m) => (m || '').includes('haiku') ? 'haiku' : (m || '').includes('sonnet') ? 'sonnet' : 'opus'
function reprice(reqs, to) {
  let usd = 0
  for (const [i, o, cr, w5, w1] of reqs) {
    if (to === 'haiku') { const tok = 1.3, long = (i + cr + w5 + w1) * tok >= 100000, p = long ? HL : P.haiku; usd += tok * (i * p[0] + o * p[1] + cr * p[2] + w5 * p[3] + w1 * p[4]) / 1e6 }
    else { const p = P[to]; usd += (i * p[0] + o * p[1] + cr * p[2] + w5 * p[3] + w1 * p[4]) / 1e6 }
  }
  return usd
}
const ORDER = { haiku: 0, sonnet: 1, opus: 2 }
// ---- policy v0 (written from the synthetic probes, before seeing this corpus)
const GATE = { shape: 0.5, stakes: 0.4 }
function policy(j, v = 0) {
  const top = j.shape.choice, sc = j.shape.c, st = j.stakes.score, stc = j.stakes.c
  if (sc < GATE.shape || stc < GATE.stakes) return { keep: true, why: 'low-confidence' }
  if (st >= 2.6) return { rung: 'sonnet high', why: 'stakes>=2.6 floor' }
  if ((top === 'lookup' || top === 'explore') && st < 2.2) return { rung: 'haiku medium', why: top }
  if (top === 'mechanical_edit' && j.pinned >= 0.6 && st < 2.2) return { rung: 'haiku high', why: 'mechanical+pinned' }
  if (top === 'survey' && j.judgment < 0.35 && st < 2.2) return { rung: 'haiku high', why: 'survey of stated facts' }
  if (top === 'evaluate' && j.judgment < 0.5 && st < 2.2) return { rung: 'haiku high', why: 'rubric grading, low judgment' }
  if ((top === 'implement' || top === 'debug') && j.pinned >= 0.6) return { rung: 'sonnet high', why: top + '+pinned' }
  if (top === 'implement' || top === 'debug') return { rung: 'sonnet xhigh', why: top }
  if (top === 'audit' || top === 'survey' || top === 'evaluate') return { rung: 'sonnet high', why: top }
  if (top === 'design') return { rung: 'opus high', why: 'design' }
  return { keep: true, why: 'other' }
}
const H = (a) => { const s = [...a].sort((x, y) => x - y); return { min: s[0], med: s[Math.floor(s.length / 2)], p90: s[Math.floor(s.length * 0.9)], max: s[s.length - 1] } }
console.log('JEV CALLS:', jev.length, '| latency ms', JSON.stringify(H(jev.map((x) => x.ms))), '| attempts>1:', jev.filter((x) => x.attempts > 1).length, '| total cost $' + jev.reduce((s, x) => s + (x.cost || 0), 0).toFixed(4), '| model', [...new Set(jev.map((x) => x.model))].join(','))
const cnt = (f) => rows.reduce((a, r) => { const k = f(r); a[k] = (a[k] || 0) + 1; return a }, {})
console.log('\nSHAPE:', JSON.stringify(cnt((r) => r.j.shape.choice)))
const bin = (x) => (x < 1 ? '<1' : x < 1.5 ? '1-1.5' : x < 2 ? '1.5-2' : x < 2.2 ? '2-2.2' : x < 2.6 ? '2.2-2.6' : '>=2.6')
console.log('STAKES score bins:', JSON.stringify(cnt((r) => bin(r.j.stakes.score))))
console.log('shape confidence <0.5:', rows.filter((r) => r.j.shape.c < 0.5).length, '| stakes confidence <0.4:', rows.filter((r) => r.j.stakes.c < 0.4).length, '| either (gate fires):', rows.filter((r) => r.j.shape.c < GATE.shape || r.j.stakes.c < GATE.stakes).length)
console.log('pinned>=.6:', rows.filter((r) => r.j.pinned >= 0.6).length, '| judgment>=.5:', rows.filter((r) => r.j.judgment >= 0.5).length, '| edits>=.5:', rows.filter((r) => r.j.edits >= 0.5).length, '| many_steps>=.5:', rows.filter((r) => r.j.steps >= 0.5).length)
// ---- replay
let tot = { actual: 0, routed: 0 }, moves = { down: 0, same: 0, up: 0, keep: 0 }, byRung = {}, lines = []
for (const r of rows) {
  const d = policy(r.j), a = fam(r.actual.model)
  let target = a, cost = r.actual.cost
  if (!d.keep) { target = d.rung.split(' ')[0]; cost = target === a ? r.actual.cost : reprice(r.actual.reqs, target) }
  tot.actual += r.actual.cost; tot.routed += cost
  const mv = d.keep ? 'keep' : ORDER[target] < ORDER[a] ? 'down' : ORDER[target] > ORDER[a] ? 'up' : 'same'
  moves[mv]++
  const k = `${a} -> ${d.keep ? 'keep(' + d.why + ')' : d.rung}`
  ;(byRung[k] ||= { n: 0, actual: 0, routed: 0 }); byRung[k].n++; byRung[k].actual += r.actual.cost; byRung[k].routed += cost
  r._d = d; r._target = target; r._cost = cost; r._a = a
}
console.log('\nREPLAY (policy v0): actual $' + tot.actual.toFixed(2), '-> routed $' + tot.routed.toFixed(2), '(' + ((1 - tot.routed / tot.actual) * 100).toFixed(0) + '% less)', JSON.stringify(moves))
for (const [k, v] of Object.entries(byRung).sort((a, b) => b[1].actual - a[1].actual)) console.log(' ', k.padEnd(40), String(v.n).padStart(3), '$' + v.actual.toFixed(2).padStart(7), '->', '$' + v.routed.toFixed(2).padStart(7))
const exp = rows.filter((r) => r.modelParam), inh = rows.filter((r) => !r.modelParam)
const agree = (a) => a.filter((r) => !r._d.keep && r._target === r._a).length
console.log('\nLead explicit choice (n=' + exp.length + '): policy agrees on model for', agree(exp), '| keeps for', exp.filter((r) => r._d.keep).length, '| inherited (n=' + inh.length + '): policy would change', inh.filter((r) => !r._d.keep && r._target !== r._a).length)
fs.writeFileSync(D + 'replay-v0.json', JSON.stringify(rows.map((r) => ({ id: r.id, project: r.project, desc: r.description, mp: r.modelParam, actual: r._a, cost: r.actual.cost, turns: r.actual.turns, shape: r.j.shape, stakes: r.j.stakes, pinned: r.j.pinned, judgment: r.j.judgment, edits: r.j.edits, steps: r.j.steps, reads: r.j.reads, decision: r._d, target: r._target, routedCost: r._cost })), null, 0))
