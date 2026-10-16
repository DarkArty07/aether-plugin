// Aether delegate router, the mod's side (spec 006). register.js calls it from three hooks of an Aether session:
// tool.call of Agent, agent.spawn and turn.step. It never imports lib/: it talks to bin/aether-route through
// $.process.run, one JSON line per verb.
//
// tool.call: an Agent call whose subagent_type is not aether:* is written to <data dir>/router/in/ and given to
// `aether-route begin`. When the plan carries `ask`, the mod asks the model itself ($.model.complete) and hands
// the answer, or the failure, to `aether-route finish`. The final plan may rewrite the call's model and effort
// and adds its notes to the call's result, for the Lead. In record mode (`background: true`) the call goes on as
// the Lead made it and the decision is made in the background; drain() waits for that work.
//
// agent.spawn and turn.step: a plan with `external` names a delegate that runs on another harness. Its call is
// remembered by its prompt, bound to the agent id at spawn, and at the agent's first step `aether-route delegate`
// runs it: its text is the agent's answer, with no model request. A failed delegate is left to the model, at
// the rung `finish` already put on the call.
//
// Any failure of the router (an exception, a non-zero exit, a line that is not JSON, a skipped plan) leaves the
// call as the Lead made it (R25).
//
// The `$` the methods take is the four calls the router makes ($.clock.now, $.fs.write, $.process.run,
// $.model.complete): the engine loads a hooks module only when $ goes to functions declared at the top of its
// files, so register.js hands a method an object of those calls, spelled there, and never $ itself.

const ROUTE_BIN = 'aether-route'
// begin of Jev in advise or command holds the decision and the quota wait, up to 10 s each (D11), plus 5 s.
const BEGIN_TIMEOUT_MS = 25000
// finish holds the quota wait, 10 s, plus 5 s.
const FINISH_TIMEOUT_MS = 15000
// decide of Jev, in the background, holds the decision and the quota wait, like begin.
const DECIDE_TIMEOUT_MS = 25000
// The Agent call's fields the router reads; only the defined ones are written.
const EVENT_FIELDS = ['subagent_type', 'description', 'prompt', 'model', 'effort', 'run_in_background', 'isolation']
const ASK_FIELDS = ['model', 'effort', 'prompt', 'maxTokens', 'timeoutMs']

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value !== ''

// The last line of a bin's output, parsed: an object, or an error.
function lastJsonLine(stdout) {
  const lines = typeof stdout === 'string' ? stdout.split('\n').map((l) => l.trim()).filter((l) => l !== '') : []
  if (lines.length === 0) throw new Error(`${ROUTE_BIN} printed nothing`)
  const value = JSON.parse(lines[lines.length - 1])
  if (!isObject(value)) throw new Error(`${ROUTE_BIN} printed no JSON object`)
  return value
}

async function route($, ctx, args, timeoutMs) {
  const out = await $.process.run(['node', `${ctx.root}/bin/${ROUTE_BIN}`, ...args], { timeoutMs })
  if (!out || out.exitCode !== 0) throw new Error(`${ROUTE_BIN} ${args[0]} exited ${out ? out.exitCode : 'without a result'}`)
  return lastJsonLine(out.stdout)
}

// The failure code finish takes for a model that did not answer.
const failureCode = (text) => (/time/i.test(String(text ?? '')) ? 'timeout' : 'empty')

// Asks the model what the plan's descriptor says and closes the call with finish; returns finish's plan.
async function answerAsk($, ctx, plan, inputFile) {
  if (!isText(plan.id) || !isObject(plan.ask)) throw new Error('a plan with ask needs an id and a descriptor')
  const request = {}
  for (const key of ASK_FIELDS) if (plan.ask[key] !== undefined) request[key] = plan.ask[key]
  let reply = null
  let failure = null
  try {
    reply = await $.model.complete(request)
    if (!reply || reply.isAnswered !== true || typeof reply.text !== 'string') failure = failureCode(reply && reply.reason)
  } catch (err) {
    failure = failureCode(err && err.message)
  }
  if (failure !== null) return route($, ctx, ['finish', '--id', plan.id, '--failure', failure], FINISH_TIMEOUT_MS)
  const answerFile = `${inputFile.replace(/\.json$/, '')}.answer.txt`
  await $.fs.write(answerFile, reply.text)
  return route($, ctx, ['finish', '--id', plan.id, '--answer-file', answerFile], FINISH_TIMEOUT_MS)
}

// The decision of record mode, made after the call has gone on. It never throws.
async function decideInBackground($, ctx, plan, inputFile) {
  try {
    if (plan.ask !== undefined) await answerAsk($, ctx, plan, inputFile)
    else if (plan.decide === true && isText(plan.id)) await route($, ctx, ['decide', '--id', plan.id], DECIDE_TIMEOUT_MS)
  } catch {
    // The decision is lost; the call already went on as the Lead made it.
  }
}

// The model and effort a plan puts on the call, or null when it leaves them.
function rewriteOf(plan) {
  const args = plan.args
  if (!isObject(args) || !isText(args.model) || !isText(args.effort)) return null
  return { model: args.model, effort: args.effort }
}

const notesOf = (plan) => (Array.isArray(plan.notes) ? plan.notes.filter(isText) : [])

export function createRouter() {
  let written = 0
  // Work started in the background, until it settles.
  const background = new Set()
  // prompt → the externals of the calls that carry it, oldest first, until their spawn binds them.
  const byPrompt = new Map()
  // agent id → its external, until its first step.
  const byAgent = new Map()

  function track(work) {
    background.add(work)
    work.finally(() => background.delete(work))
  }

  function remember(prompt, external) {
    if (typeof prompt !== 'string' || !isObject(external) || !isText(external.id)) return
    const waiting = byPrompt.get(prompt) ?? []
    waiting.push(external)
    byPrompt.set(prompt, waiting)
  }

  return {
    async toolCall($, e, next, ctx) {
      if (!isObject(e) || (typeof e.subagent_type === 'string' && e.subagent_type.startsWith('aether:'))) return next(e)
      let plan = null
      try {
        const input = {}
        for (const key of EVENT_FIELDS) if (e[key] !== undefined) input[key] = e[key]
        written += 1
        const inputFile = `${ctx.dataDir}/router/in/${await $.clock.now()}-${written}.json`
        await $.fs.write(inputFile, JSON.stringify(input))
        const begun = await route($, ctx, ['begin', '--session', ctx.session, '--input', inputFile], BEGIN_TIMEOUT_MS)
        if (begun.skip === true) {
          plan = null
        } else if (begun.background === true) {
          track(decideInBackground($, ctx, begun, inputFile))
          plan = null
        } else if (begun.ask !== undefined) {
          plan = await answerAsk($, ctx, begun, inputFile)
        } else {
          plan = begun
        }
        if (plan && plan.skip === true) plan = null
      } catch {
        plan = null
      }
      if (plan === null) return next(e)
      const rewrite = rewriteOf(plan)
      const notes = notesOf(plan)
      if (isObject(plan.external)) remember(e.prompt, plan.external)
      const result = await next(rewrite ? { ...e, ...rewrite } : e)
      // A refused call carries no context.
      if (notes.length === 0 || !isObject(result) || result.deny !== undefined) return result
      return { ...result, context: [...(Array.isArray(result.context) ? result.context : []), ...notes] }
    },

    bind(e, agentId) {
      if (!isObject(e) || typeof e.prompt !== 'string' || !isText(agentId)) return
      const waiting = byPrompt.get(e.prompt)
      if (!waiting) return
      byAgent.set(agentId, waiting.shift())
      if (waiting.length === 0) byPrompt.delete(e.prompt)
    },

    has(agentId) {
      return isText(agentId) && byAgent.has(agentId)
    },

    async *step($, e, next, ctx) {
      const external = isObject(e) && e.index === 0 && isText(e.agentId) ? byAgent.get(e.agentId) : undefined
      if (!external) return yield* next(e)
      byAgent.delete(e.agentId)
      let text = null
      try {
        const out = await route($, ctx, ['delegate', '--session', ctx.session, '--id', external.id], external.timeoutMs)
        if (out.ok === true && typeof out.text === 'string' && out.text.trim() !== '') text = out.text
      } catch {
        text = null
      }
      if (text === null) return yield* next(e)
      yield { kind: 'text', index: 0, text }
      yield { kind: 'stop', stopReason: 'end_turn', usage: null }
      return { turnId: e.turnId, index: e.index, answer: text, toolUses: [], stopReason: 'end_turn', usage: null }
    },

    async drain() {
      while (background.size > 0) await Promise.allSettled([...background])
    },
  }
}
