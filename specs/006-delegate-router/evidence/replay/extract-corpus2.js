// Extracts every Agent/Task delegation of the owner's work projects, with the actual model/cost of its subagent when the logs have it.
// Flags briefs that look like they hold a secret; those are never sent anywhere.
const fs = require('fs'), path = require('path'), readline = require('readline')
const ROOT = path.join(process.env.HOME, '.claude', 'projects')
const OUT = process.argv[2]
const KEEP = ['Asclepio-ECGIA', 'aether-plugin', 'aether-router', 'arcane-agent', 'lentes-ia-experimental']
const SECRET = [/sk-[A-Za-z0-9_-]{20,}/, /AKIA[0-9A-Z]{16}/, /gh[pousr]_[A-Za-z0-9]{30,}/, /xox[baprs]-[A-Za-z0-9-]{10,}/, /AIza[0-9A-Za-z_-]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, /(api[_-]?key|secret|passw(or)?d|token|bearer)\s*[:=]\s*['"]?[A-Za-z0-9_\-\/+=]{16,}/i, /postgres(ql)?:\/\/[^\s:]+:[^\s@]+@/i]
const P = { 'claude-haiku-5-5': [0.10, 0.50, 0.01, 0.125, 0.20], 'claude-sonnet-5-5': [2, 10, 0.10, 2.5, 4], 'claude-opus-5-5': [4, 20, 0.20, 5, 8] }
function costOf(file) {
  let cost = 0, turns = 0, out = 0, model = null, maxPrompt = 0; const reqs = []
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!l.includes('"usage"')) continue
    let j; try { j = JSON.parse(l) } catch { continue }
    if (j.type !== 'assistant' || !j.message || !j.message.usage) continue
    const u = j.message.usage, p = P[j.message.model]; if (!p) continue
    model = j.message.model
    const w5 = (u.cache_creation && u.cache_creation.ephemeral_5m_input_tokens) || 0, w1 = (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0
    const i = u.input_tokens || 0, cr = u.cache_read_input_tokens || 0
    maxPrompt = Math.max(maxPrompt, i + cr + w5 + w1)
    cost += (i * p[0] + (u.output_tokens || 0) * p[1] + cr * p[2] + w5 * p[3] + w1 * p[4]) / 1e6
    turns++; out += u.output_tokens || 0; reqs.push([i, u.output_tokens || 0, cr, w5, w1])
  }
  return { model, cost: +cost.toFixed(4), turns, out, maxPrompt, reqs }
}
;(async () => {
  const seen = new Set(), rows = []
  for (const proj of fs.readdirSync(ROOT)) {
    if (!KEEP.some((k) => proj.includes(k)) || proj.startsWith('-tmp-')) continue
    const dir = path.join(ROOT, proj)
    // tool_use id -> subagent files, from the meta.json of each session's subagents folder
    const subs = {}
    for (const s of fs.readdirSync(dir)) {
      const sd = path.join(dir, s, 'subagents'); if (!fs.existsSync(sd)) continue
      for (const f of fs.readdirSync(sd).filter((x) => x.endsWith('.meta.json'))) {
        try { const m = JSON.parse(fs.readFileSync(path.join(sd, f), 'utf8')); if (m.toolUseId) subs[m.toolUseId] = { jsonl: path.join(sd, f.replace('.meta.json', '.jsonl')), meta: m } } catch {}
      }
    }
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
      const rl = readline.createInterface({ input: fs.createReadStream(path.join(dir, f)), crlfDelay: Infinity })
      for await (const line of rl) {
        if (!line.includes('"name":"Agent"') && !line.includes('"name":"Task"')) continue
        let j; try { j = JSON.parse(line) } catch { continue }
        if (j.type !== 'assistant') continue
        for (const b of (j.message && j.message.content) || []) {
          if (b.type !== 'tool_use' || (b.name !== 'Agent' && b.name !== 'Task') || seen.has(b.id)) continue
          seen.add(b.id)
          const inp = b.input || {}, prompt = String(inp.prompt || '')
          const secret = SECRET.some((re) => re.test(prompt))
          const sub = subs[b.id]
          let actual = null
          if (sub && fs.existsSync(sub.jsonl)) { try { actual = costOf(sub.jsonl); actual.agentType = sub.meta.agentType } catch {} }
          rows.push({ id: b.id, project: proj.replace(/^-home-darkarty-Desktop-/, '').replace('03-PROYECTOS-01-ACTIVOS-', '').slice(0, 40), session: f.replace('.jsonl', ''), ts: j.timestamp,
            description: inp.description || '', subagentType: inp.subagent_type || 'general-purpose', modelParam: inp.model || null, effortParam: inp.effort || null, bg: !!inp.run_in_background,
            promptChars: prompt.length, secret, prompt: secret ? null : prompt, actual })
        }
      }
    }
  }
  fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  const by = (k) => rows.reduce((a, r) => ((a[r[k]] = (a[r[k]] || 0) + 1), a), {})
  console.log('delegations:', rows.length, '| flagged as possible secret (excluded):', rows.filter((r) => r.secret).length, '| with actual model/cost:', rows.filter((r) => r.actual).length)
  console.log('by project:', JSON.stringify(by('project')))
  console.log('by explicit model param:', JSON.stringify(by('modelParam')))
  console.log('by subagent type:', JSON.stringify(by('subagentType')))
  const ok = rows.filter((r) => !r.secret)
  const ch = ok.map((r) => r.promptChars).sort((a, b) => a - b)
  console.log('prompt chars: min', ch[0], 'median', ch[Math.floor(ch.length / 2)], 'p90', ch[Math.floor(ch.length * 0.9)], 'max', ch[ch.length - 1])
  console.log('actual cost of delegations that have it: $' + rows.filter((r) => r.actual).reduce((s, r) => s + r.actual.cost, 0).toFixed(2))
})()
