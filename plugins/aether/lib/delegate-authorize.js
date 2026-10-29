'use strict'

// The owner's word that places a delegate task on a model above the first rung (spec 021). `authorize` checks the words
// the Lead gives (a quote of the owner's messages in the session, naming the model) and records them in the delegate log.
// `coverOf` finds the record that covers a task's first launch on a requested rung, and checks it again: the delegate log
// is not protected by aether-guard, so a line can be forged. `startStepOf` gives the rung a task starts on, read back from
// its first launch. None of them throws.
// Family: delegate.

const autonomy = require('./autonomy.js')
const log = require('./delegate-log.js')
const ladderLib = require('./ladder.js')
const run = require('./run.js')
const { isObject, isText, messageOf } = require('./common.js')

const ID_RE = /^[A-Za-z0-9_-]+$/
// The reason verifyQuote gives when the session's transcript cannot be read (the autonomy rule `transcript-gone`).
const NO_TRANSCRIPT = 'no transcript for session '

const fold = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const wordsOf = (text) => fold(text).replace(/[^a-z0-9]+/g, ' ').trim()

// Whether the text names the model as a word, accents and case folded: «Opus», «en opus», «Opus 5.5» and «claude-opus-5-5»
// name opus; «opuscular» does not.
function namesModel(text, model) {
  const name = wordsOf(model)
  return name !== '' && ` ${wordsOf(text)} `.includes(` ${name} `)
}

const indexOfStep = (ladder, step) => ladder.rungs.findIndex((rung) => rung.step === step)

// The rung a text names (a model string of a call, or a quote), first in ladder order, or null.
function namedRung(ladder, text) {
  if (!isText(text)) return null
  return ladder.rungs.find((rung) => namesModel(text, rung.model)) ?? null
}

// The rung a call's model asks for when it is above the first rung, or null: a request for the first rung, or one that
// names no rung, is not a placement.
function requestedRung(ladder, text) {
  const rung = namedRung(ladder, text)
  return rung && indexOfStep(ladder, rung.step) > 0 ? rung : null
}

function resolve(deps) {
  return {
    dataDir: deps.dataDir || run.dataDir(),
    now: deps.now || Date.now,
    configDir: deps.configDir,
    ladder: deps.ladder || ladderLib.loadLadder(),
  }
}

// The verb: records the owner's words that place a task (or the session) on a model above the first rung. Returns
// { ok: true, authorized: <the line> } or { ok: false, error }; a refusal writes nothing.
function authorize(input, deps = {}) {
  const refuse = (error) => ({ ok: false, error })
  try {
    const { model, quote, task, scope, session } = isObject(input) ? input : {}
    const r = resolve(deps)
    if (!isText(session)) return refuse('no session: pass --session <id> or set CLAUDE_CODE_SESSION_ID')
    const rung = namedRung(r.ladder, model)
    if (!rung) return refuse(`${String(model)} is not a rung of the ladder (${r.ladder.rungs.map((x) => x.step).join(', ')})`)
    if (indexOfStep(r.ladder, rung.step) === 0) return refuse(`${rung.model} is the first rung: it needs no authorization`)
    if (scope !== undefined && scope !== null && scope !== 'session') return refuse('--scope needs session')
    const hasTask = task !== undefined && task !== null
    if (hasTask && scope === 'session') return refuse('--task and --scope session cannot be given together')
    if (!hasTask && scope !== 'session') return refuse('name the grant: --task <id> or --scope session')
    if (hasTask && !(typeof task === 'string' && ID_RE.test(task))) return refuse('the task id is letters, digits, - and _')
    if (!isText(quote)) return refuse('the owner\'s words are needed: pass --quote <text>')
    const verified = autonomy.verifyQuote(session, quote, { configDir: r.configDir })
    if (!verified.ok) return refuse(verified.reason)
    if (!namesModel(quote, rung.model)) return refuse(`the quote does not name ${rung.model}: write the owner's words with the model's name`)
    const line = {
      kind: 'authorize', time: r.now(), session, scope: hasTask ? 'task' : 'session', task: hasTask ? task : null,
      model: rung.model, quote, quoteTime: verified.time,
    }
    if (!log.appendEntry(r.dataDir, line)) return refuse('could not write the delegate log')
    return { ok: true, authorized: line }
  } catch (err) {
    return refuse(messageOf(err))
  }
}

// Whether an authorize line still holds: its quote is in the owner's messages of its session and names its model. An
// unreadable transcript does not hold it (a line is only honored on a readable check).
function holds(line, ladder, configDir) {
  if (!isText(line.quote)) return false
  const rung = ladder.rungs.find((x) => x.model === line.model)
  if (!rung) return false
  const verified = autonomy.verifyQuote(line.session, line.quote, { configDir })
  return verified.ok && namesModel(line.quote, rung.model)
}

// The last authorize line of the session that covers a request for `rung` on the task: a line of the task (never for a
// generated id, which is passed as a null task) or a session line, on the same rung or above it, that holds now. Lines
// that do not hold are skipped. Null when none covers, and when the session is not known.
function coverOf(entries, { session, task, rung, ladder, configDir }) {
  if (!isText(session) || !rung) return null
  const wanted = indexOfStep(ladder, rung.step)
  for (let i = entries.length - 1; i >= 0; i--) {
    const line = entries[i]
    if (!isObject(line) || line.kind !== 'authorize' || line.session !== session) continue
    const scoped = line.scope === 'session' || (line.scope === 'task' && isText(task) && line.task === task)
    if (!scoped) continue
    if (ladder.rungs.findIndex((x) => x.model === line.model) < wanted) continue
    if (!holds(line, ladder, configDir)) continue
    return line
  }
  return null
}

// The authorization a task's first launch carries, or null.
function authorizedOf(entries) {
  const first = entries.find((entry) => log.isLaunch(entry))
  return first && isObject(first.authorized) ? first.authorized : null
}

// The step a task starts on, read back from its first launch: the step of that launch when it was placed above the first
// rung by an authorization that still holds for the model it names. A quote not in a readable transcript, or one that
// does not name the model, discards the step; an unreadable transcript does not (the launch was verified when it was made).
function startStepOf(entries, ladder, configDir) {
  const floor = ladder.rungs[0].step
  const first = entries.find((entry) => log.isLaunch(entry))
  if (!first || !isObject(first.authorized)) return floor
  const at = indexOfStep(ladder, first.step)
  const named = ladder.rungs.find((rung) => rung.model === first.authorized.model)
  if (at <= 0 || !named || at > indexOfStep(ladder, named.step)) return floor
  const quote = first.authorized.quote
  if (!isText(quote)) return floor
  const verified = autonomy.verifyQuote(first.session, quote, { configDir })
  if (!verified.ok && verified.reason.startsWith(NO_TRANSCRIPT)) return first.step
  if (!verified.ok) return floor
  return namesModel(quote, named.model) ? first.step : floor
}

module.exports = { authorize, coverOf, authorizedOf, startStepOf, namedRung, requestedRung, namesModel }
