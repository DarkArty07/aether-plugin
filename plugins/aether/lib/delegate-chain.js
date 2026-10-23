'use strict'

// The attempts of one external delegate. The router picks a pair and ranks the others (the `alternates` of the external
// file, lib/route.js); a pair that refuses at its start has used nothing, so the next candidate gets the task. Only a
// start refusal moves on: a call that used tokens, ran out of time, changed files or met a dirty checkout goes back to
// the mod, which runs the agent on Claude. Each attempt writes its own outcome entry in the delegate log
// (lib/delegate-log.js), with the task's id and an attempt that runs on across the task's chains, and, when it failed,
// the mark of its refusal; a candidate whose quota group has a live mark is not tried. A call that ran out of
// time writes the slow mark of its pair instead (lib/router-slow.js), and a candidate whose pair holds one is not tried
// either. This module makes no call of its own: lib/delegate-calls.js does.

const delegateCalls = require('./delegate-calls.js')
const lanes = require('./lanes.js')
const { retryCliSeconds } = require('./delegate-limits.js')
const { appendEntry, readEntries } = require('./delegate-log.js')
const { markRefusal, readAllMarks, refusalOf } = require('./router-marks.js')
const { markSlow, slowPairIds } = require('./router-slow.js')

// Three tries in all: a decision lists at most six candidates, and a run of refusals at ten seconds each stays around
// a minute.
const MAX_ATTEMPTS = 3

const NO_USAGE = { input: 0, output: 0, thinking: 0, cacheRead: 0 }

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value !== ''

// The alternates of an external file that name a harness and a whole rung; a file written before alternates existed
// has none.
function alternatesOf(external) {
  if (!Array.isArray(external.alternates)) return []
  return external.alternates.filter((entry) => isObject(entry) && isText(entry.harness) && isObject(entry.rung) && isText(entry.rung.model) && isText(entry.rung.effort) && isText(entry.rung.group))
}

const spent = (usage) => Object.values(usage ?? {}).some((count) => count > 0)

// A refusal at the start: the pair is unavailable (nothing launched), or it refused for quota and used nothing. A
// refusal the router recognizes by its text counts whatever status the call ended with. A call killed at its limit is
// never one: it had started, and what it says is about its time, not its quota.
function isStartRefusal(result) {
  if (result.timedOut === true) return false
  if (spent(result.usage)) return false
  if (result.status === 'unavailable' || result.status === 'quota') return true
  return result.status === 'failed' && refusalOf(result.detail) !== null
}

const REFUSED = { quota: 'refused for quota', unavailable: 'was unavailable' }

// What an exception of runDelegate (it throws for a bad id, and a failing disk can make anything throw) leaves: a failed
// attempt that used nothing, so that it still gets its outcome entry and the task goes to Claude as for any failure.
function thrownAttempt(err, rung, elapsedMs) {
  const message = err instanceof Error ? err.message : String(err)
  return { status: 'failed', text: '', detail: `delegate: ${message}`, modelArg: rung.model, durationMs: elapsedMs, usage: { ...NO_USAGE }, quotaSpent: [], timedOut: false }
}

// Where the answer came from, for the Lead: Claude Code lists no tool uses or tokens for an agent the mod answers, and a
// Lead that sees 0 tool uses doubts an answer that was read from files. Earlier pairs that refused are named first.
function attributionOf(answered, earlier) {
  const refusals = earlier.map((attempt) => `${attempt.rung.model} on ${attempt.harness} ${REFUSED[attempt.status] ?? 'refused'}`)
  const lead = refusals.length > 0 ? `${refusals.join(', ')} first, so this answer is from` : 'this answer is from'
  return `Aether delegate: ${lead} ${answered.rung.model} at ${answered.rung.effort} on ${answered.harness}, run in a disposable copy of the checkout. Claude Code lists no tool uses or tokens for it because Aether handed you the answer without a Claude request.`
}

// How many outcome entries the task already has: the first attempt of this chain is the next one.
function outcomesSoFar(dataDir, id) {
  return readEntries(dataDir, { task: id }).filter((entry) => entry.kind === 'outcome' && entry.id === id).length
}

// Runs the primary pair of `external` and then its alternates, as far as the rules above allow. Resolves to
// { ok, status, text, attribution, detail, marked, changed, attempts, journaled }: status, detail and marked are the
// last attempt's, changed the files a violation of the last attempt touched (else []), attribution is null unless an
// attempt ended ok, and journaled says whether the last outcome entry was written.
async function runChain({ cwd, id, session = null, external, config, dataDir }, { runDelegate = delegateCalls.runDelegate, now = Date.now } = {}) {
  const startedAt = now()
  const before = outcomesSoFar(dataDir, id)
  const queue = [{ harness: external.harness, rung: external.rung }, ...alternatesOf(external)]
  const known = lanes.groupKnown(config)
  const attempts = []
  // The groups that refused for quota in this chain: a refusal before the call leaves no mark, and the group is out.
  const refusedGroups = new Set()
  let last = null
  let journaled = false
  let marked = null
  for (const candidate of queue) {
    if (attempts.length >= MAX_ATTEMPTS) break
    const { harness, rung } = candidate
    let maxCliSeconds = null
    if (last !== null) {
      if (!isStartRefusal(last.result)) break
      const at = now()
      if (refusedGroups.has(`${harness}/${rung.group}`)) continue
      if (readAllMarks(dataDir, at, known).some((mark) => mark.harness === harness && mark.group === rung.group)) continue
      // A parallel delegate may have run its pair out of time since the decision.
      if (slowPairIds(dataDir, [{ id: 'candidate', harness, model: rung.model, effort: rung.effort }], at).length > 0) continue
      maxCliSeconds = retryCliSeconds(at - startedAt)
      if (maxCliSeconds === null) break
    }
    const attemptStart = now()
    let result
    try {
      result = await runDelegate({ cwd, id, harness, rung, task: external.task, config, dataDir, ...(maxCliSeconds === null ? {} : { maxCliSeconds }) })
    } catch (err) {
      result = thrownAttempt(err, rung, now() - attemptStart)
    }
    const ok = result.status === 'ok'
    marked = null
    let slowUntil = null
    if (!ok) {
      // A mark that cannot be written costs the next decision its memory, not this delegate its outcome.
      try {
        const mark = markRefusal(dataDir, { harness, group: rung.group, text: result.detail, now: now() })
        marked = mark ? mark.until : null
      } catch {}
      if (result.status === 'quota') refusedGroups.add(`${harness}/${rung.group}`)
      if (result.timedOut === true) {
        try {
          slowUntil = markSlow(dataDir, { harness, model: rung.model, effort: rung.effort }, { now: now() }).until
        } catch {}
      }
    }
    journaled = appendEntry(dataDir, {
      kind: 'outcome',
      id,
      time: now(),
      session,
      status: result.status,
      harness,
      model: result.modelArg,
      effort: rung.effort,
      durationMs: result.durationMs,
      usage: result.usage,
      quotaSpent: result.quotaSpent,
      detail: result.detail,
      markedUntil: marked,
      attempt: before + attempts.length + 1,
      ...(result.timedOut === true ? { timedOut: true, slowUntil } : {}),
    })
    attempts.push({ harness, model: rung.model, effort: rung.effort, status: result.status, detail: result.detail, rung })
    last = { candidate, result }
    if (ok) break
  }
  const ok = last.result.status === 'ok'
  return {
    ok,
    status: last.result.status,
    text: last.result.text,
    attribution: ok ? attributionOf(last.candidate, attempts.slice(0, -1)) : null,
    detail: last.result.detail,
    marked,
    changed: Array.isArray(last.result.changed) ? last.result.changed : [],
    attempts: attempts.map(({ harness, model, effort, status, detail }) => ({ harness, model, effort, status, detail })),
    journaled,
  }
}

module.exports = { MAX_ATTEMPTS, isStartRefusal, runChain }
