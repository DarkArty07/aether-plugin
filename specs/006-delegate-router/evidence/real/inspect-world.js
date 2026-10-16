'use strict'

// Prints what the router did in a throwaway world made by real-session.js: its decisions, the outcomes of external
// delegates, the spawns, the guard's pending entries and the usage meter by agent. Never prints a key.
//   node inspect-world.js <world root>
const fs = require('node:fs')
const path = require('node:path')

const root = process.argv[2]
const data = path.join(root, 'data')
const work = path.join(root, 'work')

const lines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return { unreadable: l.slice(0, 120) } } }) : [])
const rung = (r) => (r ? `${r.harness || 'claude'}/${r.alias || r.model || '?'} ${r.effort}` : 'null')

const journal = lines(path.join(data, 'router', 'decisions.jsonl'))
let n = 0
for (const e of journal) {
  if (e.kind === 'decision') {
    n += 1
    const d = e.decision
    console.log(`DECISION ${n}: "${e.description}" | mode ${e.mode} | decider ${e.decider} | applied ${e.applied}`)
    console.log(`   requested ${JSON.stringify(e.requested)} | override ${JSON.stringify(e.override)} | asked ${JSON.stringify(e.asked)}`)
    console.log(`   decided ${d ? `${rung(d)} level ${d.level} (${d.axis}) conf ${d.confidence} readOnly ${d.readOnly}` : 'none'} | ranOn ${rung(e.ranOn)} | fallback ${JSON.stringify(e.fallback)}`)
    console.log(`   timing: launch ${e.latencyMs} ms, decider ${e.deciderMs} ms, quota wait ${e.quotaWaitMs} ms | decider cost ${e.deciderCost}`)
    if (d && d.reason) console.log(`   reason: ${d.reason}`)
    if (e.flags && (e.flags.lowConfidence || e.flags.incoherent || e.flags.gate)) console.log(`   flags: ${JSON.stringify(e.flags)}`)
    for (const q of e.quota || []) {
      console.log(`   quota ${q.harness}/${q.group}: ${q.state}${q.why ? ' (' + q.why + ')' : ''} rank=${q.rank} remaining=${q.remaining} hoursLeft=${q.hoursLeft} model=${q.model} ${q.effort || ''}${q.note ? ' | ' + q.note : ''}${q.renewal ? ' | renewal ' + q.renewal : ''}`)
    }
    if (e.notes) console.log(`   notes: ${JSON.stringify(e.notes).slice(0, 300)}`)
  } else if (e.kind === 'outcome') {
    console.log(`OUTCOME ${e.id}: status ${e.status} on ${e.harness}/${e.model} ${e.effort} | ${e.durationMs} ms | usage ${JSON.stringify(e.usage)} | quotaSpent ${JSON.stringify(e.quotaSpent)} | markedUntil ${e.markedUntil} | detail ${JSON.stringify(String(e.detail || '').slice(0, 200))}`)
  } else if (e.kind === 'spawn') {
    console.log(`SPAWN ${e.id} -> agent ${e.agentId}`)
  } else {
    console.log(`${String(e.kind).toUpperCase()} ${JSON.stringify(e).slice(0, 200)}`)
  }
}
if (journal.length === 0) console.log('(no router journal entries)')

const pending = lines(path.join(work, '.aether', 'pending.jsonl'))
for (const p of pending) console.log(`GUARD pending: ${JSON.stringify(p).slice(0, 400)}`)

const usageDir = path.join(data, 'usage')
if (fs.existsSync(usageDir)) {
  for (const sid of fs.readdirSync(usageDir)) {
    const agg = {}
    const agents = {}
    for (const f of fs.readdirSync(path.join(usageDir, sid)).filter((x) => x.endsWith('.json'))) {
      const part = JSON.parse(fs.readFileSync(path.join(usageDir, sid, f), 'utf8'))
      Object.assign(agents, part.agents || {})
      for (const en of part.entries || []) {
        const k = `${en.agent || 'LEAD'}|${en.model}|${en.effort}`
        agg[k] = agg[k] || { reqs: 0, out: 0 }
        agg[k].reqs += 1
        agg[k].out += en.output || 0
      }
    }
    console.log(`USAGE session ${sid.slice(0, 8)}:`)
    for (const [k, v] of Object.entries(agg)) {
      const [agent, model, effort] = k.split('|')
      const a = agents[agent]
      console.log(`   ${(agent === 'LEAD' ? 'LEAD' : agent.slice(0, 8)).padEnd(9)} ${model} ${effort} | reqs ${v.reqs} | out ${v.out}${a ? ` | ${a.type}: ${a.description}` : ''}`)
    }
  }
}
