'use strict'

// The delegate router's policy: how one delegate task of the Lead runs. `begin` takes the Agent call the mod caught,
// `finish` closes it with the answer of a decider that needs the mod (Haiku) and `decide` with the HTTP decider (Jev)
// of a call made in record mode. Each one gives a plan in one JSON object, and none of them throws: an internal error
// is a plan with `error` and no change to the call, and a `decision` entry in the journal that says `internal: <why>`.
//
// The decision joins the criterion (the level and axis the answers give, never below the floor when the criterion
// says so), the table of rungs (the Claude rung of that level), the pair of the one choice function of superdelegation
// (lib/router-pick.js: for a read-only task, the external pair that reaches the points of that Claude rung, on the quota
// that renews first) and the mode: record only writes the journal, advise also tells the Lead, and command rewrites
// the call. A failure of the decider never asks again: the call keeps what the Lead asked or takes
// the standard rung of the `fallback` option.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const lanes = require('./lanes.js')
const criterionLib = require('./router-criterion.js')
const deciders = require('./router-deciders.js')
const { EXTERNAL_LIMIT_MS } = require('./delegate-limits.js')
const { appendEntry } = require('./router-log.js')
const { liftMark } = require('./lane-marks.js')
const { readAllMarks } = require('./router-marks.js')
const { loadPairs } = require('./pairs.js')
const { pairStep } = require('./router-pick.js')
const { EXTERNAL, peekReadings } = require('./router-quota.js')
const { startRenewal } = require('./router-renewal.js')
const { loadRungs } = require('./router-rungs.js')
const { aliasOf, askedOf, claudeLevel, claudeId, stanceOf, claudeRungAt } = require('./router-reference.js')
const { readRouterSettings } = require('./session.js')

const OVERRIDE_PREFIX = 'ROUTER-OVERRIDE: '
const ID_RE = /^[A-Za-z0-9_-]+$/
const EXCERPT_CHARS = 400
const DEADLINE_OF = { haiku: 'haikuMs', jev: 'jevMs' }
// The agents whose call an external harness may take: the ones with no system prompt or tool limits of their own (R19).
const PLAIN_AGENTS = ['general-purpose', 'Explore']
const INTERNAL_MESSAGE_CHARS = 200

// ---- the override and the files ----

function overrideOf(prompt) {
  if (typeof prompt !== 'string') return null
  for (const line of prompt.split(/\r?\n/)) {
    if (!line.startsWith(OVERRIDE_PREFIX)) continue
    const reason = line.slice(OVERRIDE_PREFIX.length).trim()
    if (reason) return reason
  }
  return null
}

function externalFile(dataDir, id) {
  return path.join(dataDir, 'router', 'external', `${id}.json`)
}

function pendingFile(dataDir, id) {
  return path.join(dataDir, 'router', 'pending', `${id}.json`)
}

function isId(id) {
  return typeof id === 'string' && ID_RE.test(id)
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function readExternal(dataDir, id) {
  if (!isId(id)) return null
  return readJson(externalFile(dataDir, id))
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value) + '\n')
}

// Reads the pending call and removes it; null when there is none, or when another step took it first.
function takePending(dataDir, id) {
  if (!isId(id)) return null
  const file = pendingFile(dataDir, id)
  const pending = readJson(file)
  if (!pending || typeof pending !== 'object') return null
  try {
    fs.unlinkSync(file)
  } catch {
    return null
  }
  return pending
}

// ---- the dependencies ----

function once(make) {
  let made = false
  let value
  return () => {
    if (!made) {
      value = make()
      made = true
    }
    return value
  }
}

function realSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// The dependencies with their defaults. The files are read only when a step needs them.
function resolve(deps) {
  const dataDir = deps.dataDir
  const now = deps.now || Date.now
  const criterion = once(() => deps.criterion || criterionLib.loadCriterion())
  const rungs = once(() => deps.rungs || loadRungs())
  const lanesConfig = once(() => (deps.lanesConfig !== undefined ? deps.lanesConfig : lanes.loadConfig()))
  const pairs = once(() => deps.pairs || loadPairs().pairs)
  return {
    dataDir,
    now,
    criterion,
    rungs,
    lanesConfig,
    pairs,
    sleep: deps.sleep || realSleep,
    newId: deps.newId || (() => `r-${now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`),
    readings: deps.readings || ((harnesses = EXTERNAL) => peekReadings({ dataDir, config: lanesConfig(), harnesses, now: now() })),
    lift: deps.lift || ((mark) => liftMark(dataDir, mark)),
    marks: deps.marks || (() => readAllMarks(dataDir, now(), lanes.groupKnown(lanesConfig()))),
    renew: deps.renew || ((harness) => startRenewal({ dataDir, harness, now: now() })),
    installed: deps.installed || ((harness) => {
      const command = lanesConfig()?.harnesses?.[harness]?.command
      return typeof command === 'string' && lanes.commandInstalled(command)
    }),
    fetch: deps.fetch || globalThis.fetch,
    env: deps.env || process.env,
    createDecider: deps.createDecider || deciders.createDecider,
  }
}

// ---- plans ----

function skipPlan(why) {
  return { id: null, skip: true, why, args: null, notes: [], external: null }
}

function errorPlan(id, error) {
  return { id: isId(id) ? id : null, skip: false, args: null, notes: [], external: null, error }
}

function messageOf(err) {
  return err && typeof err.message === 'string' && err.message ? err.message : String(err)
}

// An internal error leaves the call as the Lead made it (R25) and, so that the owner can see the router is broken, one
// `decision` entry in the journal: no decision, `fallback: 'internal: <message>'`, and `applied` as in any entry that
// rewrote nothing. `known` holds what the step had read when it failed. Best effort: it never throws.
function recordInternalError(deps, known, err) {
  try {
    const now = deps && typeof deps.now === 'function' ? deps.now() : Date.now()
    const event = known.event && typeof known.event === 'object' ? known.event : {}
    const settings = known.settings && typeof known.settings === 'object' ? known.settings : {}
    const task = taskOf(event)
    const requested = requestedOf(event)
    const message = messageOf(err).replace(/\s+/g, ' ').trim().slice(0, INTERNAL_MESSAGE_CHARS)
    const started = Number.isFinite(known.startedAt) ? known.startedAt : now
    appendEntry(deps.dataDir, {
      kind: 'decision',
      id: isId(known.id) ? known.id : null,
      time: started,
      session: typeof known.session === 'string' ? known.session : null,
      mode: typeof settings.mode === 'string' ? settings.mode : null,
      decider: typeof settings.decider === 'string' ? settings.decider : null,
      background: Boolean(known.background),
      description: task.description,
      task: { promptChars: task.prompt.length, excerpt: task.prompt.slice(0, EXCERPT_CHARS) },
      requested,
      asked: null,
      override: null,
      answers: null,
      decision: null,
      flags: null,
      quota: null,
      fallback: `internal: ${message}`,
      applied: appliedWithoutRewrite(requested),
      ranOn: null,
      latencyMs: now - started,
      deciderMs: null,
      quotaWaitMs: 0,
      deciderCost: null,
    })
  } catch {}
}

function isDeciderError(err) {
  return err instanceof deciders.DeciderError || (err && err.name === 'DeciderError' && typeof err.code === 'string')
}

// ---- what the Lead asked ----

function textOf(value) {
  return typeof value === 'string' ? value : ''
}

function taskOf(event) {
  return { description: textOf(event.description), prompt: textOf(event.prompt) }
}

function requestedOf(event) {
  const model = typeof event.model === 'string' && event.model ? event.model : null
  const effort = typeof event.effort === 'string' && event.effort ? event.effort : null
  return model || effort ? { model, effort } : null
}

// The name of the agent the Lead sent the task to when that agent is not a plain one, or null. A user or plugin agent
// has instructions and tool limits that an external harness would not get, so its task stays on Claude.
function namedAgent(event) {
  const type = event.subagent_type
  return typeof type === 'string' && type !== '' && !PLAIN_AGENTS.includes(type) ? type : null
}

function standardOf(settings) {
  return { alias: settings.fallback.alias, effort: settings.fallback.effort }
}

function ranOnOf(table, { args, external, requested }) {
  if (external) return { harness: external.harness, model: external.model, effort: external.effort }
  if (args) return { harness: 'claude', model: claudeId(table, args.model), effort: args.effort }
  if (requested && requested.model && requested.effort) {
    const alias = aliasOf(table, requested.model)
    return { harness: 'claude', model: alias ? claudeId(table, alias) : requested.model, effort: requested.effort }
  }
  return null
}

function appliedWithoutRewrite(requested) {
  return requested ? 'kept' : 'inherited'
}

// ---- notes ----

function rungText(rung) {
  return `${rung.harness} ${rung.model} ${rung.effort}`
}

// What the Lead asked for, when it asked. In `command` a choice that differs from the decision was replaced: the note says
// so and how to keep one, because a Lead that reads only "You asked haiku medium" has told the owner that is what ran.
function askedText(mode, decision, asked) {
  if (!asked) return ''
  const kept = decision.harness === 'claude' && decision.alias === asked.alias && decision.effort === asked.effort
  if (mode === 'command' && !kept) {
    return ` You asked ${asked.alias} ${asked.effort}, and the router replaced it; this delegate runs as this note says. A choice of yours holds only with the line ROUTER-OVERRIDE: <reason> in the brief and model and effort passed.`
  }
  return ` You asked ${asked.alias} ${asked.effort}.`
}

function decisionNote(mode, { decision, fallback, asked }) {
  const where = rungText({ harness: decision.harness, model: decision.alias || decision.model, effort: decision.effort })
  const lead = mode === 'command' ? `this task runs on ${where}` : `I would run this task on ${where}`
  const rescue = fallback ? `; if it fails it runs on claude ${fallback.alias} ${fallback.effort}` : ''
  const sent = mode === 'command' ? '' : ' The call runs as you sent it.'
  return `Aether router: ${lead}${rescue}. Level ${decision.level} (${decision.axis}): ${decision.reason}.${askedText(mode, decision, asked)}${sent}`
}

function overrideNote(reason, args) {
  const rung = args ? ` It runs on claude ${args.model} ${args.effort}, the standard rung.` : ''
  return `Aether router: override, the router did not decide this task (${reason}).${rung}`
}

function failureNote(code, args) {
  return `Aether router: the decider failed (${code}); this task runs on claude ${args.model} ${args.effort}.`
}

// ---- the journal ----

function baseEntry(ctx, d) {
  const task = taskOf(ctx.event)
  return {
    kind: 'decision',
    id: ctx.id,
    time: ctx.startedAt,
    session: ctx.session,
    mode: ctx.settings.mode,
    decider: ctx.settings.decider,
    background: Boolean(ctx.background),
    description: task.description,
    task: { promptChars: task.prompt.length, excerpt: task.prompt.slice(0, EXCERPT_CHARS) },
    requested: requestedOf(ctx.event),
    asked: null,
    override: null,
    answers: null,
    decision: null,
    flags: null,
    quota: null,
    fallback: null,
    applied: 'inherited',
    ranOn: null,
    latencyMs: d.now() - ctx.startedAt,
    deciderMs: null,
    quotaWaitMs: 0,
    deciderCost: null,
  }
}

// The candidates of the decision that come after the pick, in rank order, each as the rung a delegate runs on. The
// decision's entries name a pair by id; the model and effort come from the pairs table. A delegate refused at its start
// tries them in turn (lib/delegate-chain.js).
function alternatesOf(quota, pairs) {
  const alternates = []
  for (const entry of [...(quota ?? [])].filter((candidate) => candidate.outcome === 'next').sort((a, b) => a.rank - b.rank)) {
    const pair = pairs.find((row) => row.id === entry.id)
    if (pair) alternates.push({ harness: pair.harness, rung: { model: pair.model, effort: pair.effort, group: pair.group } })
  }
  return alternates
}

function askedEntry(asked, table, axis) {
  return asked ? { alias: asked.alias, effort: asked.effort, level: claudeLevel(table, asked, axis) } : null
}

function plan(ctx, { args = null, notes = [], external = null }) {
  return { id: ctx.id, skip: false, args, notes, external }
}

// ---- the decision ----

// Closes a call: result is { answers, cost, deciderMs } or { failure, deciderMs }.
async function conclude(ctx, d, result) {
  const { settings, event } = ctx
  const mode = settings.mode
  const table = d.rungs()
  const criterion = d.criterion()
  const requested = requestedOf(event)
  const asked = askedOf(event, table, criterion)
  const entry = baseEntry(ctx, d)
  entry.deciderMs = result.deciderMs

  if (result.failure !== undefined) {
    const args = mode === 'command' ? (asked ? { model: asked.alias, effort: asked.effort } : { model: settings.fallback.alias, effort: settings.fallback.effort }) : null
    Object.assign(entry, {
      asked: askedEntry(asked, table, 'general'),
      fallback: `decider: ${result.failure}`,
      applied: args ? 'rewritten' : appliedWithoutRewrite(requested),
      ranOn: ranOnOf(table, { args, requested }),
      latencyMs: d.now() - ctx.startedAt,
    })
    appendEntry(d.dataDir, entry)
    return plan(ctx, { args, notes: args ? [failureNote(result.failure, args)] : [] })
  }

  const answers = result.answers
  const floorAxis = criterionLib.axisOf(criterion, answers)
  const { reference, floor } = stanceOf(table, { asked, standard: standardOf(settings), axis: floorAxis })
  const verdict = criterionLib.decide(criterion, answers, { floor })
  const { level, axis } = verdict

  // The Claude rung the call would run on: the reference of the one choice function of superdelegation, and the
  // rung an external delegate falls back to.
  const { claudeRung } = claudeRungAt(table, { reference, floor, level, axis })

  let quota = null
  let quotaWaitMs = 0
  let pick = null
  let reason = verdict.reason
  let choice = null
  if (verdict.readOnly && settings.lanes && !event.isolation && d.lanesConfig()) {
    const agent = namedAgent(event)
    if (agent !== null) {
      reason = `${reason}; named agent ${agent} stays on Claude`
    } else {
      const step = await pairStep(d, settings, { reference: { model: claudeRung.alias, effort: claudeRung.effort } })
      pick = step.pick
      quota = step.quota
      quotaWaitMs = step.waitedMs
      choice = step.reason
    }
  }

  const chosen = pick || claudeRung
  const decision = {
    harness: pick ? pick.harness : 'claude',
    model: chosen.model,
    alias: pick ? null : chosen.alias,
    effort: chosen.effort,
    level,
    axis,
    reason,
    confidence: verdict.confidence,
    status: chosen.status ?? null,
    readOnly: verdict.readOnly,
    choice,
  }
  const rescue = pick ? { alias: claudeRung.alias, effort: claudeRung.effort } : null

  let args = null
  let external = null
  let notes = []
  let applied = appliedWithoutRewrite(requested)
  if (mode === 'command') {
    if (pick) {
      args = { model: rescue.alias, effort: rescue.effort }
      external = {
        id: ctx.id,
        harness: pick.harness,
        model: pick.model,
        effort: pick.effort,
        group: pick.group,
        timeoutMs: EXTERNAL_LIMIT_MS,
        fallback: { model: rescue.alias, effort: rescue.effort },
      }
      writeJson(externalFile(d.dataDir, ctx.id), {
        id: ctx.id,
        session: ctx.session,
        harness: external.harness,
        rung: { model: external.model, effort: external.effort, group: external.group },
        task: taskOf(event),
        fallback: external.fallback,
        timeoutMs: external.timeoutMs,
        alternates: alternatesOf(quota, d.pairs()),
      })
      applied = 'external'
    } else {
      args = { model: claudeRung.alias, effort: claudeRung.effort }
      applied = 'rewritten'
    }
    notes = [decisionNote(mode, { decision, fallback: rescue, asked })]
  } else if (mode === 'advise') {
    const differs = !asked || pick !== null || claudeRung.alias !== asked.alias || claudeRung.effort !== asked.effort
    if (differs) notes = [decisionNote(mode, { decision, fallback: rescue, asked })]
  }

  Object.assign(entry, {
    asked: askedEntry(asked, table, floorAxis),
    answers,
    decision,
    flags: verdict.flags,
    quota,
    applied,
    ranOn: ranOnOf(table, { args, external, requested }),
    latencyMs: d.now() - ctx.startedAt,
    quotaWaitMs,
    deciderCost: result.cost ?? null,
  })
  // An external delegate that does not end ok runs again on Claude, on the rescue rung: the report reads it from here.
  if (applied === 'external') entry.rescue = { harness: 'claude', model: claudeId(table, rescue.alias), effort: rescue.effort }
  appendEntry(d.dataDir, entry)
  return plan(ctx, { args, notes, external })
}

// The override (A-7): the decider is not called and the call keeps what the Lead asked.
function overridePlan(ctx, d, reason) {
  const table = d.rungs()
  const requested = requestedOf(ctx.event)
  const asked = askedOf(ctx.event, table, d.criterion())
  const args = ctx.settings.mode === 'command' && !requested ? { model: ctx.settings.fallback.alias, effort: ctx.settings.fallback.effort } : null
  const entry = baseEntry(ctx, d)
  Object.assign(entry, {
    asked: askedEntry(asked, table, 'general'),
    override: reason,
    applied: 'kept',
    ranOn: ranOnOf(table, { args, requested }),
  })
  appendEntry(d.dataDir, entry)
  return plan(ctx, { args, notes: ctx.settings.mode === 'record' ? [] : [overrideNote(reason, args)] })
}

function deadlineOf(settings) {
  return settings.deadlines[DEADLINE_OF[settings.decider]] ?? settings.deadlines.haikuMs
}

// The HTTP decider, from the request to the parsed answers; a failure of the decider is { failure: <code> }.
async function askHttp(ctx, d, decider) {
  try {
    const descriptor = decider.request(taskOf(ctx.event), d.criterion(), { timeoutMs: deadlineOf(ctx.settings) })
    const text = await deciders.runHttp(descriptor, { fetch: d.fetch })
    const parsed = decider.parse(text, d.criterion())
    return { answers: parsed.answers, cost: parsed.cost, deciderMs: d.now() - ctx.startedAt }
  } catch (err) {
    if (!isDeciderError(err)) throw err
    return { failure: err.code, deciderMs: d.now() - ctx.startedAt }
  }
}

function makeDecider(ctx, d) {
  return d.createDecider(ctx.settings.decider, { env: d.env, dataDir: d.dataDir })
}

// ---- the three steps ----

async function begin(input, deps) {
  let id = null
  const known = { session: input && input.session, event: input && input.event }
  try {
    const event = input && input.event && typeof input.event === 'object' ? input.event : {}
    if (typeof event.subagent_type === 'string' && event.subagent_type.startsWith('aether:')) return skipPlan('aether-agent')
    const settings = deps.settings || readRouterSettings(deps.dataDir, input && input.session)
    if (!settings) return skipPlan('no-settings')
    known.settings = settings
    const d = resolve(deps)
    id = d.newId()
    const ctx = { id, session: input.session, event, settings, startedAt: d.now(), background: false }
    Object.assign(known, { id, startedAt: ctx.startedAt })

    const reason = overrideOf(event.prompt)
    if (reason !== null) return overridePlan(ctx, d, reason)

    let decider
    try {
      decider = makeDecider(ctx, d)
    } catch (err) {
      if (!isDeciderError(err)) throw err
      return await conclude(ctx, d, { failure: err.code, deciderMs: 0 })
    }
    const pending = () => writeJson(pendingFile(d.dataDir, id), { id, session: ctx.session, event, settings, startedAt: ctx.startedAt })

    if (settings.mode === 'record') {
      if (decider.transport === 'http') {
        pending()
        return { id, skip: false, background: true, decide: true, args: null, notes: [], external: null }
      }
      const ask = decider.request(taskOf(event), d.criterion(), { timeoutMs: deadlineOf(settings) })
      pending()
      return { id, skip: false, background: true, ask, args: null, notes: [], external: null }
    }

    if (decider.transport === 'http') return await conclude(ctx, d, await askHttp(ctx, d, decider))
    const ask = decider.request(taskOf(event), d.criterion(), { timeoutMs: deadlineOf(settings) })
    pending()
    return { id, skip: false, ask, args: null, notes: [], external: null }
  } catch (err) {
    recordInternalError(deps, known, err)
    return errorPlan(id, messageOf(err))
  }
}

function contextOf(pending) {
  return {
    id: pending.id,
    session: pending.session,
    event: pending.event && typeof pending.event === 'object' ? pending.event : {},
    settings: pending.settings,
    startedAt: pending.startedAt,
    background: pending.settings && pending.settings.mode === 'record',
  }
}

async function finish(input, deps) {
  const id = input && input.id
  const known = { id }
  try {
    const pending = takePending(deps.dataDir, id)
    if (!pending) return errorPlan(id, 'unknown id')
    const d = resolve(deps)
    const ctx = contextOf(pending)
    Object.assign(known, ctx)
    if (typeof input.failure === 'string' && input.failure) {
      return await conclude(ctx, d, { failure: input.failure, deciderMs: d.now() - ctx.startedAt })
    }
    let result
    try {
      const parsed = makeDecider(ctx, d).parse(input.answer, d.criterion())
      result = { answers: parsed.answers, cost: parsed.cost, deciderMs: d.now() - ctx.startedAt }
    } catch (err) {
      if (!isDeciderError(err)) throw err
      result = { failure: err.code, deciderMs: d.now() - ctx.startedAt }
    }
    return await conclude(ctx, d, result)
  } catch (err) {
    recordInternalError(deps, known, err)
    return errorPlan(id, messageOf(err))
  }
}

async function decide(input, deps) {
  const id = input && input.id
  const known = { id }
  try {
    const waiting = isId(id) ? readJson(pendingFile(deps.dataDir, id)) : null
    if (!waiting || typeof waiting !== 'object') return errorPlan(id, 'unknown id')
    Object.assign(known, contextOf(waiting))
    const d = resolve(deps)
    let decider = null
    let failure = null
    try {
      decider = makeDecider(contextOf(waiting), d)
    } catch (err) {
      if (!isDeciderError(err)) throw err
      failure = err.code
    }
    // A call whose decider answers through the mod stays pending for finish.
    if (decider && decider.transport !== 'http') return errorPlan(id, `the decider ${waiting.settings.decider} answers through the mod, not through decide`)
    const pending = takePending(deps.dataDir, id)
    if (!pending) return errorPlan(id, 'unknown id')
    const ctx = contextOf(pending)
    if (failure !== null) return await conclude(ctx, d, { failure, deciderMs: d.now() - ctx.startedAt })
    return await conclude(ctx, d, await askHttp(ctx, d, decider))
  } catch (err) {
    recordInternalError(deps, known, err)
    return errorPlan(id, messageOf(err))
  }
}

module.exports = { overrideOf, externalFile, readExternal, begin, finish, decide }
