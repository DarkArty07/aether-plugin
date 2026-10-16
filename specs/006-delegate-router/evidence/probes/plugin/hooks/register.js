// Probe module: records what the engine hands to agent.spawn / tool.call / turn.step and tries the rewrites the router would need.
const answered = new Set()
let counter = 0

async function mode($) { return (await $.env.get('PROBE_MODE')) || 'baseline' }
async function logTo($, name, value) {
  const dir = await $.env.get('PROBE_LOG')
  if (!dir) return
  try { await $.fs.write(`${dir}/${String(++counter).padStart(2, '0')}-${name}.json`, JSON.stringify(value, (k, v) => (typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '…' : v), 1)) } catch (err) { /* never break the probe */ }
}
const brief = (e) => ({ keys: Object.keys(e), subagentType: e.subagentType, model: e.model, effort: e.effort, parentModel: e.parentModel, background: e.background, fork: e.fork, description: e.description })

export function register(on) {
  on('agent.spawn', async ($, e, next) => {
    const m = await mode($)
    await logTo($, 'spawn-in', { mode: m, ...brief(e) })
    let out = e
    if (m === 'spawn-model' || m === 'spawn-model-omitted') out = { ...e, model: 'haiku' }
    else if (m === 'spawn-effort') out = { ...e, effort: 'low' }
    else if (m === 'typed') out = { ...e, subagentType: 'probe:w-low', model: 'haiku' }
    else if (m === 'typed-nomodel') out = { ...e, subagentType: 'probe:w-low' }
    else if (m === 'description') out = { ...e, description: `${e.description} · haiku (router)` }
    else if (m === 'services') {
      const res = {}
      try { const c = await $.model.complete({ model: 'haiku', effort: 'low', prompt: 'PROBE-COMPLETE classify: hello', maxTokens: 20, timeoutMs: 8000 }); res.complete = { isAnswered: c.isAnswered, text: c.text, reason: c.reason, usage: c.usage } } catch (err) { res.complete = { error: String(err && err.message) } }
      try { const url = await $.env.get('PROBE_URL'); const f = await $.http.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"ping":1}' }); res.fetch = { status: f.status, ok: f.ok, text: f.text.slice(0, 80) } } catch (err) { res.fetch = { error: String(err && err.message) } }
      try { const t = await $.fs.read(await $.env.get('PROBE_ENVFILE')); res.fsRead = { ok: true, text: t.slice(0, 40) } } catch (err) { res.fsRead = { error: String(err && err.message) } }
      try { const p = await $.process.run(['node', '-e', 'console.log("proc-ok")'], { timeoutMs: 5000 }); res.proc = { exitCode: p.exitCode, stdout: p.stdout.trim() } } catch (err) { res.proc = { error: String(err && err.message) } }
      await logTo($, 'services', res)
    }
    const r = await next(out)
    await logTo($, 'spawn-out', { requested: { model: out.model, effort: out.effort, subagentType: out.subagentType }, result: r })
    if (m === 'answer' && r && r.agentId) answered.add(r.agentId)
    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const m = await mode($)
    await logTo($, 'toolcall-in', { mode: m, keys: Object.keys(e), model: e.model, effort: e.effort, subagent_type: e.subagent_type })
    if (m === 'toolcall') return next({ ...e, model: 'haiku', effort: 'low' })
    if (m === 'background') {
      const dir = await $.env.get('PROBE_LOG')
      const t0 = await $.clock.now()
      ;(async () => {
        try { await $.clock.sleep(2500); await $.fs.write(`${dir}/bg-sleep-done.json`, JSON.stringify({ afterMs: (await $.clock.now()) - t0 })) } catch (err) { try { await $.fs.write(`${dir}/bg-sleep-error.json`, JSON.stringify({ error: String(err && err.message) })) } catch (e2) { /* nothing more to do */ } }
      })()
      ;(async () => {
        try { const c = await $.model.complete({ model: 'haiku', effort: 'low', prompt: 'PROBE-COMPLETE background decision', maxTokens: 20, timeoutMs: 8000 }); await $.fs.write(`${dir}/bg-complete-done.json`, JSON.stringify({ isAnswered: c.isAnswered, text: c.text, afterMs: (await $.clock.now()) - t0 })) } catch (err) { try { await $.fs.write(`${dir}/bg-complete-error.json`, JSON.stringify({ error: String(err && err.message) })) } catch (e2) { /* nothing more to do */ } }
      })()
      await logTo($, 'bg-hook-returned', { at: await $.clock.now() - t0 })
      return next(e)
    }
    if (m === 'deny') return { deny: 'ROUTER: this delegate is a lookup (stakes 1.2, conf 0.9); relaunch it with model haiku and effort medium, or add override: <reason> to the description' }
    if (m === 'context') {
      const r = await next(e)
      await logTo($, 'toolcall-result', { keys: Object.keys(r || {}) })
      return { ...r, context: ['PROBE-NOTE: the router chose haiku low (shape=survey, conf 0.9); the Lead asked sonnet xhigh'] }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const m = await mode($)
    if (e.agentId) await logTo($, `step-agent-${e.index}`, { agentId: e.agentId, index: e.index, model: e.model, effort: e.effort })
    if (m === 'background' && e.agentId && e.index === 0) { await $.clock.sleep(6000) }   // keep the session alive after the hook returned
    if (m === 'answer' && e.agentId && answered.has(e.agentId) && e.index === 0) {
      const text = 'LANE-ANSWER: the mod answered this delegate without a model call'
      yield { kind: 'text', index: 0, text }
      yield { kind: 'stop', stopReason: 'end_turn', usage: null }
      return { turnId: e.turnId, index: e.index, answer: text, toolUses: [], stopReason: 'end_turn', usage: null }
    }
    return yield* next(e)
  }).catch(async function* ($, e, next) { return yield* next(e) })
}
