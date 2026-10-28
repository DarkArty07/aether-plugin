// Aether delegate ladder, the mod's side (spec 013). register.js calls it from three hooks of an Aether session:
// tool.call of Agent, agent.spawn and turn.step. It never imports lib/: it talks to bin/aether-delegate through
// $.process.run, one JSON line per verb, and the wait loop of a delegate outside Claude Code is delegate-wait.mjs.
//
// tool.call: an Agent call whose subagent_type is not aether:* is written to <data dir>/delegates/in/ and given to
// `aether-delegate begin`. The plan that comes back fixes the model and the effort of the call (the step of the ladder
// is the system's, never the Lead's) and may rewrite its prompt (a correction on Claude carries the findings) and put an
// isolation on it. Its notes are added to the call's result, for the Lead. A plan with `external` names a delegate that
// runs on another harness; a plan with `answerOf` names a read-only delegate that runs on Claude. The call is
// remembered by its final prompt with either.
//
// agent.spawn and turn.step: the spawn binds the agent to the call by its prompt. The first step of an `external`
// delegate is the whole delegate: `aether-delegate start` launches it, waitSteps waits for it, and a text event, a
// heartbeat, goes out after every wait that did not end, because the engine kills an agent whose step emits nothing for
// 600 s (Task 17 measured it). The delegate's text is the agent's answer, with no model request. A delegate that fails
// is left to the model, at the model of the plan, which is already the one of the step. Every later step of an
// `external` agent and every step of an `answerOf` agent goes through the model unchanged, and the last one records
// its answer with `aether-delegate answer`: it is the answer that `verdict` checks (R6).
//
// Any failure of the mod (an exception, a non-zero exit, a line that is not JSON, a skipped plan) leaves the call as the
// Lead made it, and leaves a trace through ctx.fault (fault-trace.mjs), which the caller may not give.
//
// The `$` the methods take is the three calls the mod makes ($.clock.now, $.fs.write, $.process.run): the engine loads a
// hooks module only when $ goes to functions declared at the top of its files, so register.js hands a method an object
// of those calls, spelled there, and never $ itself. No model is asked here.

import { waitSteps, heartbeatText } from './delegate-wait.mjs'

const DELEGATE_BIN = 'aether-delegate'
// begin may ask for the quota of a pair before it answers.
const BEGIN_TIMEOUT_MS = 25000
// start launches the run in a process of its own and returns at once.
const START_TIMEOUT_MS = 15000
// answer appends one line to the log.
const ANSWER_TIMEOUT_MS = 15000
// The longest answer text the log takes.
const ANSWER_MAX_CHARS = 4000
// The Agent call's fields the plan reads; only the defined ones are written.
const EVENT_FIELDS = ['subagent_type', 'description', 'prompt', 'model', 'effort', 'run_in_background', 'isolation']

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value !== ''

// The last line of a bin's output, parsed: an object, or an error.
function lastJsonLine(stdout) {
  const lines = typeof stdout === 'string' ? stdout.split('\n').map((l) => l.trim()).filter((l) => l !== '') : []
  if (lines.length === 0) throw new Error(`${DELEGATE_BIN} printed nothing`)
  const value = JSON.parse(lines[lines.length - 1])
  if (!isObject(value)) throw new Error(`${DELEGATE_BIN} printed no JSON object`)
  return value
}

async function delegate($, ctx, args, timeoutMs) {
  const out = await $.process.run(['node', `${ctx.root}/bin/${DELEGATE_BIN}`, ...args], { timeoutMs })
  if (!out || out.exitCode !== 0) throw new Error(`${DELEGATE_BIN} ${args[0]} exited ${out ? out.exitCode : 'without a result'}`)
  return lastJsonLine(out.stdout)
}

// What a plan puts on the call, or null when it puts nothing: the model and effort of the step, and the prompt and
// isolation when the plan carries them.
function rewriteOf(plan) {
  const args = plan.args
  if (!isObject(args) || !isText(args.model) || !isText(args.effort)) return null
  const rewrite = { model: args.model, effort: args.effort }
  if (isText(args.prompt)) rewrite.prompt = args.prompt
  if (isText(args.isolation)) rewrite.isolation = args.isolation
  return rewrite
}

const notesOf = (plan) => (Array.isArray(plan.notes) ? plan.notes.filter(isText) : [])

// The delegate of an external harness: the whole first step of its agent. Yields a heartbeat after every wait that did
// not end, before it waits again, and the delegate's text as the answer when it delivers; any other end is the model's,
// which records the answer of the attempt like any read-only step on Claude (answerOf: { task, attempt }).
async function* runExternal($, e, next, ctx, external, answerOf) {
  let delivered = null
  try {
    const started = await delegate($, ctx, ['start', '--id', external.id], START_TIMEOUT_MS)
    if (started.started === true) {
      const steps = waitSteps($, { root: ctx.root, id: external.id, session: ctx.session })
      for (;;) {
        const step = await steps.next()
        if (step.done) {
          const end = step.value
          if (end && end.ok === true && typeof end.text === 'string' && end.text.trim() !== '') delivered = end.text
          break
        }
        yield { kind: 'text', index: 0, text: heartbeatText(step.value.waitedMs) }
      }
    }
  } catch (err) {
    ctx.fault?.('delegate.step', 'handler-threw', err)
    delivered = null
  }
  if (delivered === null) return yield* runAnswering($, e, next, ctx, answerOf)
  yield { kind: 'text', index: 0, text: delivered }
  yield { kind: 'stop', stopReason: 'end_turn', usage: null }
  return { turnId: e.turnId, index: e.index, answer: delivered, toolUses: [], stopReason: 'end_turn', usage: null }
}

// One step of a read-only delegate on Claude: the model's, unchanged. When the step ends the agent's turn, its answer
// is recorded for the verdict. A failed record never changes the step.
async function* runAnswering($, e, next, ctx, answerOf) {
  const result = yield* next(e)
  if (answerOf !== null && isObject(result) && typeof result.stopReason === 'string' && result.stopReason !== 'tool_use' && typeof result.answer === 'string') {
    try {
      await delegate(
        $,
        ctx,
        ['answer', '--session', ctx.session, '--task', answerOf.task, '--attempt', String(answerOf.attempt), '--text', result.answer.slice(0, ANSWER_MAX_CHARS)],
        ANSWER_TIMEOUT_MS,
      )
    } catch {
      ctx.fault?.('delegate.answer', 'write-failed')
      // The verdict finds no answer for this attempt and says so; the delegate already answered.
    }
  }
  return result
}

export function createDelegates() {
  let written = 0
  // prompt → the { id, external, answerOf } of the calls that carry it, oldest first, until their spawn binds them.
  const byPrompt = new Map()
  // agent id → its { id, attempt, external, answerOf }; only the agents that have a first step to run or a last answer to record.
  const byAgent = new Map()

  // Only a call with something to do at its agent is remembered. A task has one attempt at a time: a record of the same
  // task under the same prompt that no spawn took is an earlier call, and the new one replaces it.
  function remember(prompt, plan) {
    const external = isObject(plan.external) && isText(plan.external.id) ? plan.external : null
    const answerOf = isObject(plan.answerOf) && isText(plan.answerOf.task) ? plan.answerOf : null
    if (typeof prompt !== 'string' || !isText(plan.id) || (external === null && answerOf === null)) return null
    const routed = { id: plan.id, attempt: plan.attempt, external, answerOf }
    const waiting = (byPrompt.get(prompt) ?? []).filter((other) => other.id !== routed.id)
    waiting.push(routed)
    byPrompt.set(prompt, waiting)
    return routed
  }

  function forget(prompt, routed) {
    if (routed === null) return
    const waiting = byPrompt.get(prompt)
    if (!waiting) return
    const at = waiting.indexOf(routed)
    if (at !== -1) waiting.splice(at, 1)
    if (waiting.length === 0) byPrompt.delete(prompt)
  }

  return {
    async toolCall($, e, next, ctx) {
      if (!isObject(e) || (typeof e.subagent_type === 'string' && e.subagent_type.startsWith('aether:'))) return next(e)
      let plan = null
      try {
        const input = {}
        for (const key of EVENT_FIELDS) if (e[key] !== undefined) input[key] = e[key]
        written += 1
        const inputFile = `${ctx.dataDir}/delegates/in/${await $.clock.now()}-${written}.json`
        await $.fs.write(inputFile, JSON.stringify(input))
        const begun = await delegate($, ctx, ['begin', '--session', ctx.session, '--input', inputFile], BEGIN_TIMEOUT_MS)
        plan = begun.skip === true ? null : begun
      } catch (err) {
        ctx.fault?.('delegate.begin', 'handler-threw', err)
        plan = null
      }
      if (plan === null) return next(e)
      const rewrite = rewriteOf(plan)
      const call = rewrite ? { ...e, ...rewrite } : e
      const routed = remember(call.prompt, plan)
      let result
      try {
        result = await next(call)
      } catch (err) {
        forget(call.prompt, routed)
        throw err
      }
      // A refused call spawns nothing and carries no context.
      if (!isObject(result) || result.deny !== undefined) {
        forget(call.prompt, routed)
        return result
      }
      const notes = notesOf(plan)
      if (notes.length === 0) return result
      return { ...result, context: [...(Array.isArray(result.context) ? result.context : []), ...notes] }
    },

    // The agent that spawned for a call the mod remembered: the call is found by its prompt.
    bind($, e, agentId, ctx) {
      try {
        if (!isObject(e) || typeof e.prompt !== 'string' || !isText(agentId)) return
        const waiting = byPrompt.get(e.prompt)
        if (!waiting) return
        const routed = waiting.shift()
        if (waiting.length === 0) byPrompt.delete(e.prompt)
        if (routed) byAgent.set(agentId, routed)
      } catch (err) {
        ctx.fault?.('delegate.bind', 'handler-threw', err)
        // The agent runs as it was going to.
      }
    },

    has(agentId) {
      return isText(agentId) && byAgent.has(agentId)
    },

    async *step($, e, next, ctx) {
      const routed = isObject(e) && isText(e.agentId) ? byAgent.get(e.agentId) : undefined
      if (!routed) return yield* next(e)
      // A read-only external route answers as an answerOf one does: the model's last step records the attempt's answer. An
      // editing one has none: `verdict` judges it by the checks of its worktree, and a text would replace its earlier patch
      // as the work a rise carries.
      const answerOf = routed.external === null ? routed.answerOf : routed.external.edits === true ? null : { task: routed.id, attempt: routed.attempt }
      // The delegate runs once, and only as the first step of its agent; the route stays for the later steps.
      if (routed.external !== null && e.index === 0) return yield* runExternal($, e, next, ctx, routed.external, answerOf)
      return yield* runAnswering($, e, next, ctx, answerOf)
    },

    // Nothing runs in the background any more; the method stays so that its callers do not change.
    async drain() {},
  }
}
