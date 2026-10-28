'use strict'

// The delegate ladder: which model a task's delegate runs on, how many corrections each model gets before the
// step rises, and what the Lead's verdict on a result makes of the next launch. A pure function over the data in
// config/ladder.json: no number of the ladder is written here.
// Family: delegate.

const fs = require('node:fs')
const path = require('node:path')
const { isText } = require('./common.js')

const LADDER_FILE = path.join(__dirname, '..', 'config', 'ladder.json')
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const EFFORT_KEY = { first: 'first', fix: 'retry', rise: 'retry', unjudged: 'retry' }
// The finding wt-gate.js gives a test run that was cut at its time limit. It says nothing of the code, so it is no
// repeated finding (#112): see judgeFix.
const GATE_CUT = Object.freeze({ file: 'npm test', what: 'superó el tiempo límite' })

function isCount(value) {
  return Number.isInteger(value) && value >= 0
}

function checkRung(rung, index) {
  const where = `rungs[${index}]`
  if (!rung || typeof rung !== 'object') throw new Error(`ladder: ${where} is not an object`)
  if (!isText(rung.step)) throw new Error(`ladder: ${where} has no step`)
  if (!isText(rung.model)) throw new Error(`ladder: ${where} (${rung.step}) has no model`)
  if (!isCount(rung.corrections)) throw new Error(`ladder: ${where} (${rung.step}) corrections is not an integer >= 0`)
  for (const key of ['first', 'retry']) {
    if (!EFFORTS.includes(rung.effort && rung.effort[key])) {
      throw new Error(`ladder: ${where} (${rung.step}) effort.${key} is not one of ${EFFORTS.join('|')}`)
    }
  }
}

function loadLadder(file = LADDER_FILE) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!data || !Array.isArray(data.rungs) || data.rungs.length === 0) throw new Error('ladder: rungs is missing or empty')
  data.rungs.forEach(checkRung)
  const steps = data.rungs.map((rung) => rung.step)
  if (new Set(steps).size !== steps.length) throw new Error('ladder: two rungs have the same step')
  if (!isCount(data.repeatFindings)) throw new Error('ladder: repeatFindings is not an integer >= 0')
  return { rungs: data.rungs, repeatFindings: data.repeatFindings }
}

function rungIndex(ladder, step) {
  const index = ladder.rungs.findIndex((rung) => rung.step === step)
  if (index < 0) throw new Error(`ladder: unknown step ${step}`)
  return index
}

function newState(ladder) {
  return { step: ladder.rungs[0].step, attempts: 0, correctionsUsed: 0, repeats: 0, lastKeys: null, status: 'open' }
}

function effortFor(ladder, step, launchKind) {
  const key = EFFORT_KEY[launchKind]
  if (!key) throw new Error(`ladder: unknown launch kind ${launchKind}`)
  return ladder.rungs[rungIndex(ladder, step)].effort[key]
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
function rise(state, ladder, cause, carry) {
  const index = rungIndex(ladder, state.step)
  const attempts = state.attempts + 1
  if (index + 1 >= ladder.rungs.length) {
    const closed = { ...state, attempts, status: 'exhausted' }
    return { accepted: true, state: closed, next: { step: null, kind: 'exhausted', cause: 'exhausted', effort: null, carry } }
  }
  const step = ladder.rungs[index + 1].step
  const raised = { step, attempts, correctionsUsed: 0, repeats: 0, lastKeys: null, status: 'open' }
  return { accepted: true, state: raised, next: { step, kind: 'rise', cause, effort: effortFor(ladder, step, 'rise'), carry } }
}

function judgeFix(state, verdict, ladder, carry) {
  // The gate cut is left out of the keys (#112). A verdict that is only a cut is no repeat: it neither adds to a streak
  // of the real findings nor breaks it, so a cut between two verdicts of the same finding does not hide the repetition,
  // and two cuts in a row never rise by the repeat rule. A cut mixed with a real finding counts as that finding alone.
  const keys = [...new Set(verdict.findings.map(findingKey))].filter((key) => key !== GATE_CUT_KEY).sort()
  const cutOnly = keys.length === 0
  const same = state.lastKeys !== null && state.lastKeys.length === keys.length && state.lastKeys.every((key, i) => key === keys[i])
  // repeats: how many verdicts in a row, this one included, gave the same real findings.
  const repeats = cutOnly ? state.repeats : same ? state.repeats + 1 : 1
  if (!cutOnly && repeats >= ladder.repeatFindings) return rise(state, ladder, 'repeated', carry)
  const cap = ladder.rungs[rungIndex(ladder, state.step)].corrections
  // Every fix spends a correction, the same findings again included: the step's cap is hard (R2).
  if (state.correctionsUsed >= cap) return rise(state, ladder, 'exhausted', carry)
  const next = { step: state.step, kind: 'fix', cause: 'fix', effort: effortFor(ladder, state.step, 'fix'), carry }
  const lastKeys = cutOnly ? state.lastKeys : keys
  return { accepted: true, state: { ...state, attempts: state.attempts + 1, correctionsUsed: state.correctionsUsed + 1, repeats, lastKeys }, next }
}

// Judges the Lead's verdict on the state the earlier verdicts left.
function judge(state, verdict, ladder) {
  if (state.status !== 'open') return rejected(`the task is ${state.status}: no verdict is accepted after it`)
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

// Folds the recorded verdict inputs (the `input` field of each verdict entry) to the state the judging left.
function stateOf(inputs, ladder) {
  let state = newState(ladder)
  for (const input of inputs) {
    const answer = judge(state, input, ladder)
    if (answer.accepted) state = answer.state
  }
  return state
}

module.exports = { loadLadder, newState, parseFinding, findingKey, effortFor, judge, stateOf, GATE_CUT }
