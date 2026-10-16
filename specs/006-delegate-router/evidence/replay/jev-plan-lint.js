// Plan-time Tier lint: does Jev's reading of each task agree with the Tier the Writer chose and the Judge approved? Key from env.
const fs = require('fs'), path = require('path')
const REPO = require('path').join(__dirname, '..', '..', '..', '..')
const KEY = process.env.OPENROUTER_API_KEY
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-Title': 'aether-plan-lint-probe' }
const Q = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'q-v1.json'), 'utf8'))
const tasks = []
for (const dir of fs.readdirSync(path.join(REPO, 'specs'))) {
  const f = path.join(REPO, 'specs', dir, 'tasks.md'); if (!fs.existsSync(f)) continue
  const text = fs.readFileSync(f, 'utf8'), parts = text.split(/^(?=### Task \d+:)/m).filter((p) => /^### Task \d+:/.test(p))
  for (const p of parts) {
    const tier = (p.match(/^\s*-\s*Tier:\s*(\w+)(?:\s+(\w+))?\s*[—-]\s*(.+)$/m) || [])
    if (!tier[1]) continue
    tasks.push({ spec: dir, title: p.split('\n')[0].replace(/^### /, ''), model: tier[1].toLowerCase(), effort: tier[2] && /^(low|medium|high|xhigh|max)$/.test(tier[2]) ? tier[2] : null, reason: (tier[3] || '').slice(0, 90), brief: p.slice(0, 7000) })
  }
}
console.log('tasks with a Tier line:', tasks.length, JSON.stringify(tasks.reduce((a, t) => ((a[t.spec] = (a[t.spec] || 0) + 1), a), {})), '| Writer tiers:', JSON.stringify(tasks.reduce((a, t) => ((a[t.model] = (a[t.model] || 0) + 1), a), {})))
async function ask(t) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/systemone', { method: 'POST', headers: H, signal: AbortSignal.timeout(40000), body: JSON.stringify({ model: 'typesafe/jev-1.14', state: { task: t.title, brief: t.brief }, questions: Q }) })
      const txt = await r.text(); if (!txt.trim()) continue
      const j = JSON.parse(txt); if (!j.answers) continue
      const A = j.answers
      return { shape: A.shape.choice, sc: A.shape.confidence, stakes: A.stakes.score, stc: A.stakes.confidence, pinned: A.pinned_by_checks.noul, judgment: A.needs_judgment.noul, edits: A.edits_files.noul, reads: A.reads_a_lot.score }
    } catch {}
  }
  return null
}
const ORD = { haiku: 0, sonnet: 1, opus: 2 }
// the same base policy as the delegate replay, plus the plan-task rule: exact tests in the contract pin the work
function rec(j) {
  if (j.sc < 0.5 || j.stc < 0.4) return { m: null, why: 'low confidence' }
  if (j.stakes >= 2.6) return { m: 'sonnet', why: 'stakes floor' }
  if (j.shape === 'design') return { m: 'opus', why: 'design' }
  if ((j.shape === 'mechanical_edit' || j.shape === 'lookup' || j.shape === 'explore') && j.stakes < 2.2) return { m: 'haiku', why: j.shape }
  if (j.pinned >= 0.4 && j.judgment < 0.6 && j.stakes < 2.2) return { m: 'haiku', why: 'pinned, low judgment' }
  return { m: 'sonnet', why: 'default' }
}
;(async () => {
  const res = []
  for (let i = 0; i < tasks.length; i += 6) res.push(...await Promise.all(tasks.slice(i, i + 6).map(async (t) => ({ t, j: await ask(t) }))))
  const ok = res.filter((x) => x.j)
  let agree = 0, lower = 0, higher = 0, unk = 0; const rows = []
  for (const { t, j } of ok) {
    const r = rec(j); if (!r.m) { unk++; continue }
    const mv = ORD[r.m] === ORD[t.model] ? 'agree' : ORD[r.m] < ORD[t.model] ? 'router lower' : 'router higher'
    if (mv === 'agree') agree++; else if (mv === 'router lower') lower++; else higher++
    rows.push({ t, j, r, mv })
  }
  console.log('scored', ok.length, '| agree on model:', agree, '| router lower:', lower, '| router higher:', higher, '| gated (low conf):', unk, '| agreement among decided:', (agree / (agree + lower + higher) * 100).toFixed(0) + '%')
  const conf = {}; for (const x of rows) { const k = `Writer ${x.t.model} -> router ${x.r.m}`; conf[k] = (conf[k] || 0) + 1 }
  console.log(JSON.stringify(conf))
  console.log('\nDisagreements:')
  for (const x of rows.filter((x) => x.mv !== 'agree').sort((a, b) => a.mv.localeCompare(b.mv))) console.log(' ', x.mv.padEnd(13), `W:${x.t.model}${x.t.effort ? ' ' + x.t.effort : ''}`.padEnd(14), `R:${x.r.m}`.padEnd(9), x.j.shape.padEnd(15), 'st' + x.j.stakes.toFixed(1), 'pin' + x.j.pinned.toFixed(2), 'jd' + x.j.judgment.toFixed(2), x.t.spec.slice(0, 3), x.t.title.slice(0, 50), '|', x.t.reason.slice(0, 50))
})()
