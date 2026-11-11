'use strict'

// The delegate ladder: which model a task's delegate runs on, how one rejected attempt rises one step,
// and what the Lead's verdict on a result makes of the next launch. A pure function over the data in
// config/ladder.json: no number of the ladder is written here.
// Family: delegate.

const fs = require('node:fs')
const path = require('node:path')
const { isText } = require('./common.js')

const LADDER_FILE = path.join(__dirname, '..', 'config', 'ladder.json')
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

// The finding wt-gate.js gives a test run that was cut at its time limit. It says nothing of the code, so it is no
// repeated finding (#112): see judgeFix.
const GATE_CUT = Object.freeze({ file: 'npm test', what: 'superó el tiempo límite' })

function checkRung(rung, index) {
  const where = `rungs[${index}]`
  if (!rung || typeof rung !== 'object') throw new Error(`ladder: ${where} is not an object`)
  if (!isText(rung.step)) throw new Error(`ladder: ${where} has no step`)
  if (!isText(rung.model)) throw new Error(`ladder: ${where} (${rung.step}) has no model`)
  if (!isText(rung.effort)) throw new Error(`ladder: ${where} (${rung.step}) has no effort`)
  if (!EFFORTS.includes(rung.effort)) {
    throw new Error(`ladder: ${where} (${rung.step}) effort is not one of ${EFFORTS.join('|')}`)
  }
}

function loadLadder(file = LADDER_FILE) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!data || !Array.isArray(data.rungs) || data.rungs.length === 0) throw new Error('ladder: rungs is missing or empty')
  data.rungs.forEach(checkRung)
  const steps = data.rungs.map((rung) => rung.step)
  if (new Set(steps).size !== steps.length) throw new Error('ladder: two rungs have the same step')
  const repeatBlocked = data.repeatBlocked ?? 2
  if (!Number.isInteger(repeatBlocked) || repeatBlocked < 1) throw new Error('ladder: repeatBlocked is not an integer >= 1')
  const supervisorFloor = data.supervisorFloor ?? 1
  if (!Number.isInteger(supervisorFloor) || supervisorFloor < 1) throw new Error('ladder: supervisorFloor is not an integer >= 1')
  return {
    law: data.law ?? {},
    repeatBlocked,
    rungs: data.rungs,
    supervisorFloor,
  }
}

function rungIndex(ladder, step) {
  const index = ladder.rungs.findIndex((rung) => rung.step === step)
  if (index < 0) throw new Error(`ladder: unknown step ${step}`)
  return index
}

// The state of a task that has not been judged yet. `step` is the rung the task starts on; without one, or with
// one the ladder does not have, it is the first rung.
function newState(ladder, step = null) {
  const start = ladder.rungs.some((rung) => rung.step === step) ? step : ladder.rungs[0].step
  return { step: start, attempts: 0, repeats: 0, lastKeys: null, blockedKey: null, blockedCount: 0, blockedReason: null, status: 'open' }
}

function effortFor(ladder, step) {
  const idx = rungIndex(ladder, step)
  return ladder.rungs[idx].effort
}

function supervisorOf(ladder, step) {
  const i = rungIndex(ladder, step)
  const n = ladder.rungs.length
  const floor = ladder.supervisorFloor ?? 1
  const supervisorIndex = Math.max(Math.min(i + 1, n - 1), Math.min(floor, n) - 1)
  const rung = ladder.rungs[supervisorIndex]
  return { step: rung.step, model: rung.model, effort: rung.effort }
}

// 'src/a.js:12: what is missing' -> { file, line: 12, what }; the line is optional; no file or no what -> null.
function parseFinding(text) {
  const input = String(text).trim()
  const match = /^([^:\s][^:]*):(\d+):(.*)$/.exec(input) || /^([^:\s][^:]*):()(.*)$/.exec(input)
  if (!match) return null
  const file = match[1].trim()
  const what = match[3].trim()
  if (!file || !what) return null
  return { file, line: match[2] === '' ? null : Number(match[2]), what }
}

function findingKey(finding) {
  return `${finding.file}|${finding.what}`.replace(/\s+/g, ' ').trim().toLowerCase()
}

const GATE_CUT_KEY = findingKey(GATE_CUT)

function rejected(error) {
  return { accepted: false, error }
}

function checkVerdict(verdict) {
  if (!verdict || !['approve', 'fix', 'infeasible'].includes(verdict.kind)) {
    return 'the verdict kind must be approve, fix or infeasible'
  }
  if (verdict.kind === 'fix') {
    const findings = Array.isArray(verdict.findings) ? verdict.findings : []
    if (findings.length === 0 || !findings.every((f) => f && isText(f.file) && isText(f.what))) {
      return 'a fix needs at least one finding, each with a file and what is missing'
    }
  }
  if (verdict.kind === 'infeasible' && !isText(verdict.reason)) {
    return 'an infeasible declaration needs a reason, written'
  }
  if (verdict.kind !== 'approve' && verdict.fromScratch && !isText(verdict.reason)) {
    return 'starting from scratch needs a reason, written'
  }
  return null
}

// The next step up from the state's step: a rise, or exhausted when it was the last one.
function rise(state, ladder, cause, carry, repeats = state.repeats, lastKeys = state.lastKeys) {
  const index = rungIndex(ladder, state.step)
  const attempts = state.attempts + 1
  if (index + 1 >= ladder.rungs.length) {
    const closed = { ...state, attempts, repeats, lastKeys, status: 'exhausted' }
    return { accepted: true, state: closed, next: { step: null, kind: 'exhausted', cause: 'exhausted', effort: null, carry } }
  }
  const step = ladder.rungs[index + 1].step
  const raised = { ...state, step, attempts, repeats, lastKeys, status: 'open' }
  return { accepted: true, state: raised, next: { step, kind: 'rise', cause, effort: effortFor(ladder, step), carry } }
}

// Whether the finding says the change fell outside Owns, in the Spanish the gate and the merge write or in
// the English a supervisor writes: 'fuera de Owns', or 'changes outside Owns' with the file named or not.
const OUTSIDE_OWNS = /outside(\s+the(\s+task's)?)?\s+owns|fuera\s+de\s+owns/
function isOutsideOwns(finding) {
  return OUTSIDE_OWNS.test(String(finding.what).replace(/\s+/g, ' ').trim().toLowerCase())
}

// The file a finding names, normalized the way findingKey normalizes it: an outside-Owns finding
// rephrased between attempts is still the same repeat when it names the same file (issue 179).
function fileKey(finding) {
  return String(finding.file).replace(/\s+/g, ' ').trim().toLowerCase()
}

function judgeFix(state, verdict, ladder, carry) {
  // The gate cut is left out of the keys (#112). A verdict that is only a cut is no repeat: it neither adds to a streak
  // of the real findings nor breaks it, so a cut between two verdicts of the same finding does not hide the repetition,
  // and two cuts in a row never rise by the repeat rule. A cut mixed with a real finding counts as that finding alone.
  const real = verdict.findings.filter((finding) => findingKey(finding) !== GATE_CUT_KEY)
  const allOutside = real.length > 0 && real.every(isOutsideOwns)
  const keys = [...new Set(allOutside ? real.map(fileKey) : real.map(findingKey))].sort()
  const cutOnly = keys.length === 0
  const same = state.lastKeys !== null && state.lastKeys.length === keys.length && state.lastKeys.every((key, i) => key === keys[i])
  const repeats = cutOnly ? state.repeats : same ? state.repeats + 1 : 1
  const lastKeys = cutOnly ? state.lastKeys : keys

  if (same && allOutside && repeats >= (ladder.repeatBlocked ?? 2)) {
    const files = [...new Set(real.map((finding) => finding.file))].join(', ')
    const reason =
      `the same change outside Owns came back again (${files}): a plan error, not a model error; ` +
      'the brief and an existing test disagree, or the file is missing from Owns. ' +
      'Add the file to Owns or change the brief, then relaunch.'
    const blocked = { ...state, attempts: state.attempts + 1, repeats, lastKeys, status: 'blocked' }
    return { accepted: true, state: blocked, next: { step: null, kind: 'blocked', cause: 'blocked-outside-owns', reason, effort: null, carry: true } }
  }

  return rise(state, ladder, 'failed', carry, repeats, lastKeys)
}

// The key of a BLOCKED attempt report (issue 188): the gate's red tests, keyed as judgeFix keys a fix verdict, sorted and
// joined; or one fixed value when the gate found no red test (none, or only its time-limit cut). The model's sentence is
// no part of it: each implementer words the same cause its own way.
const NO_RED_TEST_KEY = 'blocked with no red test'
function blockedKeyOf(findings) {
  const real = (Array.isArray(findings) ? findings : [])
    .filter((finding) => finding && isText(finding.file) && isText(finding.what))
    .map(findingKey)
    .filter((key) => key !== GATE_CUT_KEY)
  const keys = [...new Set(real)].sort()
  return keys.length ? keys.join('\n') : NO_RED_TEST_KEY
}

// Judges the Lead's verdict on the state the earlier verdicts left.
function judge(state, verdict, ladder) {
  if (state.status !== 'open') return rejected(`the task is ${state.status}: no verdict is accepted after it`)
  // Attempt reports track blockers separately from review verdicts: a review between launches
  // must not break the streak, and a rise must carry it to the next rung.
  if (verdict && verdict.kind === 'attempt') {
    const sentence = typeof verdict.reason === 'string' ? verdict.reason.trim() : ''
    const blocked = verdict.status === 'BLOCKED'
    const key = blocked ? blockedKeyOf(verdict.findings) : null
    const count = key ? (state.blockedKey === key ? state.blockedCount + 1 : 1) : 0
    const updated = { ...state, blockedKey: key, blockedCount: count, blockedReason: blocked ? sentence : null }
    if (key && count >= (ladder.repeatBlocked ?? 2)) {
      const evidence = key === NO_RED_TEST_KEY ? 'no red test' : `the same red tests came back: ${key.split('\n').join(', ')}`
      const reason = sentence || evidence
      return { accepted: true, state: { ...updated, attempts: state.attempts + 1, status: 'blocked' }, next: { step: null, kind: 'blocked', cause: 'blocked-same-cause', reason, effort: null, carry: true } }
    }
    return { accepted: true, state: updated, next: null }
  }
  const error = checkVerdict(verdict)
  if (error) return rejected(error)
  if (verdict.kind === 'approve') {
    const closed = { ...state, attempts: state.attempts + 1, status: 'approved' }
    return { accepted: true, state: closed, next: { step: null, kind: 'done', cause: null, effort: null, carry: true } }
  }
  const carry = !verdict.fromScratch
  if (verdict.kind === 'infeasible') return rise(state, ladder, 'infeasible', carry)
  return judgeFix(state, verdict, ladder, carry)
}

// Folds the recorded verdict inputs (the `input` field of each verdict entry) to the state the judging left, from the
// step the task started on (see newState).
function stateOf(inputs, ladder, step = null) {
  let state = newState(ladder, step)
  for (const input of inputs) {
    const answer = judge(state, input, ladder)
    if (answer.accepted) state = answer.state
  }
  return state
}

module.exports = { loadLadder, newState, parseFinding, findingKey, effortFor, supervisorOf, judge, stateOf, GATE_CUT }
