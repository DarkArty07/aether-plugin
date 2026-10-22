'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')
const { runWorkflow } = require('./workflow-harness.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const seats = require('../plugins/aether/lib/seats.js')
const schemas = require('../plugins/aether/lib/lane-schemas.js')

const FEATURE = 'specs/007-demo'
const SCOPE = 'Deliver what was asked, at the scope asked. When that work is done and checked, stop and report. Do not add features, tests, files, docs or refactors that were not asked for. If you think one would help, say so at the end instead of doing it.'
const ARGS = { feature: FEATURE, session: 'sess-1', repoRoot: '/repo', superdelegation: 'off', harnesses: 'agy' }
const SHORT = { ...ARGS, mode: 'short', document: `${FEATURE}/design.md`, intent: 'Understanding: add a retry. Owner: «hazlo robusto»', author: 'opus' }
const ROLES = ['writer', 'judge', 'examiner', 'ops']

let parseOpsPrompt
let PAYLOAD_PATH
test.before(async () => {
  ;({ parseOpsPrompt, PAYLOAD_PATH } = await import(path.join(PLUGIN, 'hooks', 'ops-command.mjs')))
})

const COMMAND = /^cd '[^']*' && (aether-lane|aether-plan|aether-exam) ([a-z-]+)(.*)$/m
function commandOf(prompt) {
  const m = COMMAND.exec(prompt)
  return m ? { tool: m[1], verb: m[2], rest: m[3].trim().split(' ').filter(Boolean), line: `${m[1]} ${m[2]}${m[3]}` } : null
}

const SPEC_ANSWER = { spec: `${FEATURE}/spec.md`, commit: 'c1', clarify: [], assumptions: ['A1. a default'], proposals: ['P1. a proposal'], questions: [], disagreements: [] }
const PLAN_ANSWER = { plan: `${FEATURE}/plan.md`, tasks: `${FEATURE}/tasks.md`, commit: 'c2', check: '{"ok":true}', complexity: '| Violation | Why needed | Simpler alternative rejected because |', assumptions: [], questions: [], disagreements: [] }
const APPROVE = { verdict: 'approve', findings: [], openQuestions: [] }
const finding = (title) => ({ severity: 'major', type: 'wrong', title, evidence: '`R1`', fix: `fix ${title}` })
const EXAM = { tests: [{ id: 'c1', criterion: 'C1', command: 'node --test .aether-exam/c1.test.js', files: ['c1.test.js'] }], notes: 'none' }
const CHECK_OK = { ok: true, tasks: 3, waves: [['task-1', 'task-2', 'task-3']], warnings: [] }
const nativeSeat = (seat) => ({ unavailable: 'no-external', seat, native: { ...seats.NATIVE[seat] }, tried: [] })
const handedBack = (seat) => ({ done: true, exitCode: 3, value: nativeSeat(seat) })

// The fakes: every seat round is handed back to the native agent (exit 3), the Examiner's too.
function handlers() {
  let starts = 0
  return {
    writer: (call) => (call.label.startsWith('spec:') ? SPEC_ANSWER : PLAN_ANSWER),
    judge: () => APPROVE,
    examiner: () => EXAM,
    ops: (call) => {
      const { verb, rest } = call.command
      if (verb === 'seat-start') return { started: true, id: `${rest[0]}-20261015-12000${++starts}-ab12` }
      if (verb === 'seat-wait') return handedBack(rest[0].split('-')[0])
      if (verb === 'seat-stop') return { stopped: true }
      if (verb === 'check') return CHECK_OK
      if (verb === 'store') return { stored: '/data/exams/007-demo' }
      throw new Error(`unexpected ops command: ${call.command.line}`)
    },
  }
}
const go = (args, overrides = {}) => runWorkflow(JSON.stringify(args), overrides, { script: 'design.workflow.js', roles: ROLES, commandOf, defaults: handlers })

const nativeCalls = (run) => run.calls.filter((c) => c.role !== 'ops')
const opsCalls = (run, verb) => run.calls.filter((c) => c.role === 'ops' && c.command.verb === verb)
const startOf = (run, seat) => opsCalls(run, 'seat-start').find((c) => c.command.rest[0] === seat)
const flag = (call, name) => call.command.rest[call.command.rest.indexOf(name) + 1]
const waitFor = (seat, answer) => (call, fallback) => (call.command.verb === 'seat-wait' && call.command.rest[0].startsWith(seat) ? answer(call) : fallback(call))
const front = (name) => {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(fs.readFileSync(path.join(PLUGIN, 'agents', `${name}.md`), 'utf8'))[1]
  const get = (key) => new RegExp(`^${key}: (.+)$`, 'm').exec(block)[1].trim()
  return [get('model'), get('effort')]
}

test('one run takes the card to an approved plan with no turn of the Lead in between (E1)', async () => {
  const run = await go(ARGS)
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(nativeCalls(run).map((c) => c.role), ['writer', 'judge', 'writer', 'judge', 'examiner'])
  const r = run.result
  assert.equal(r.status, 'approved')
  assert.deepEqual([r.spec, r.plan, r.tasks], [`${FEATURE}/spec.md`, `${FEATURE}/plan.md`, `${FEATURE}/tasks.md`])
  assert.deepEqual(r.verdicts.map((v) => [v.document, v.round, v.seat, v.verdict]), [['spec', 1, 'native', 'approve'], ['plan', 1, 'native', 'approve']])
  assert.equal(r.verdicts[0].text, '## Verdict\napprove\n## Findings\nnone\n## Open questions\n- none')
  assert.equal(r.complexity, PLAN_ANSWER.complexity)
  assert.deepEqual(r.proposals, ['P1. a proposal'])
  assert.deepEqual(r.exam, { status: 'stored', dir: '/data/exams/007-demo' })
  assert.deepEqual(r.rounds.map((x) => [x.document, x.seat, x.provider]), [['spec', 'writer', 'native'], ['spec', 'judge', 'native'], ['plan', 'writer', 'native'], ['plan', 'judge', 'native'], ['exam', 'examiner', 'native']])
  assert.equal(opsCalls(run, 'check').length, 1)
})

test('with superdelegation off every seat round is started off, and the Examiner runs native and stores its exam (C2)', async () => {
  const run = await go(ARGS)
  const starts = opsCalls(run, 'seat-start')
  assert.deepEqual(starts.map((c) => c.command.rest[0]), ['writer', 'judge', 'writer', 'judge', 'examiner'])
  for (const start of starts) assert.equal(flag(start, '--superdelegation'), 'off', start.command.rest[0])
  assert.equal(opsCalls(run, 'store').length, 1)
})

test('the native agents carry the model and effort of their definitions, the Writer at high (R11), and the schemas of the lib', async () => {
  const run = await go(ARGS)
  for (const role of ['writer', 'judge', 'examiner']) {
    assert.deepEqual([seats.NATIVE[role].model, seats.NATIVE[role].effort], front(role), role)
    for (const call of run.calls.filter((c) => c.role === role)) assert.deepEqual([call.model, call.effort], front(role), call.label)
  }
  assert.deepEqual(front('writer'), ['sonnet', 'high'])
  const by = (label) => run.calls.find((c) => c.label === label).schema
  assert.deepEqual(by('spec: writer write'), schemas.SPEC_WRITER_SCHEMA)
  assert.deepEqual(by('plan: writer write'), schemas.WRITER_SCHEMA)
  assert.deepEqual(by('spec: judge review 1'), schemas.JUDGE_SCHEMA)
  assert.deepEqual(by('exam: examiner'), schemas.EXAMINER_SCHEMA)
  const stored = opsCalls(run, 'store')
  assert.equal(stored.length, 1)
  assert.equal(stored[0].command.rest[0], FEATURE)
  assert.deepEqual(run.result.exam, { status: 'stored', dir: '/data/exams/007-demo' })
})

test('issue 64: a Judge that answered from the author family keeps that note on the round', async () => {
  const note = 'the same family that wrote the document judged it: no other external pair could'
  const lane = '- Lane: muse muse-wonder-full-1.0, seat judge-20261015-120002-ab12'
  const answer = `## Verdict\napprove\n## Findings\nnone\n## Open questions\n- none\n${lane}`
  const external = waitFor('judge', (call) => ({
    done: true,
    exitCode: 0,
    value: { seat: 'judge', id: call.command.rest[0], harness: 'muse', model: 'muse-wonder-full-1.0', answer, result: APPROVE, lane, note },
  }))
  const run = await go({ ...ARGS, superdelegation: 'on' }, { ops: external })
  assert.equal(run.error, null, run.error && run.error.stack)
  const records = run.result.rounds.filter((entry) => entry.seat === 'judge')
  assert.ok(records.length >= 1)
  for (const record of records) {
    assert.equal(record.provider, 'muse muse-wonder-full-1.0')
    assert.equal(record.note, note)
  }
})

test('an external answer is the verdict as it is, the switch travels in flags, and no native Judge runs', async () => {
  const lane = '- Lane: agy gemini-4-argon-high, seat judge-20261015-120002-ab12; 9 tokens, $? at list price; Gemini Models used 0.0 % of the 5 h window and 0.0 % of the weekly one'
  const answer = `## Verdict\napprove\n## Findings\nnone\n## Open questions\n- none\n${lane}`
  const external = waitFor('judge', (call) => ({ done: true, exitCode: 0, value: { seat: 'judge', id: call.command.rest[0], harness: 'agy', model: 'gemini-4-argon', answer, result: APPROVE, lane } }))
  const run = await go({ ...ARGS, superdelegation: 'on' }, { ops: external })
  assert.equal(run.result.status, 'approved')
  assert.equal(run.calls.filter((c) => c.role === 'judge').length, 0)
  assert.deepEqual(run.result.verdicts.map((v) => [v.seat, v.text]), [['agy gemini-4-argon', answer], ['agy gemini-4-argon', answer]])
  assert.equal(run.result.rounds.find((x) => x.document === 'spec' && x.seat === 'judge').lane, lane)
  const start = startOf(run, 'judge')
  assert.deepEqual(['--session', '--author', '--feature', '--superdelegation', '--harnesses'].map((f) => flag(start, f)), ['sess-1', 'sonnet', FEATURE, 'on', 'agy'])
  assert.equal(flag(start, '--digest'), lanes.digest(start.payload.text))
  assert.equal(start.payload.path, '/repo/.aether-tmp/seats/sess-1/message.md')
})

for (const [exit, wait] of [
  ['3', { done: true, exitCode: 3, value: nativeSeat('judge') }],
  ['4', { done: true, exitCode: 4, value: { failed: 'failed', seat: 'judge', id: 'judge-20261015-120002-ab12', harness: 'agy', model: 'gemini-4-argon', detail: 'x', undone: true, native: { ...seats.NATIVE.judge } } }],
  ['1', { done: true, exitCode: 1, value: { error: 'boom' } }],
]) {
  test(`exit ${exit} of a seat round is a result: the native Judge takes it with the same message (E3)`, async () => {
    const run = await go(ARGS, { ops: waitFor('judge', () => wait) })
    assert.equal(run.error, null)
    assert.equal(run.result.status, 'approved')
    const message = startOf(run, 'judge').payload.text
    const native = run.calls.find((c) => c.role === 'judge').prompt
    assert.ok(native.startsWith(message), 'the same message')
    assert.equal(native.slice(message.length).trim(), 'Your checkout is /repo: the paths above are relative to it.')
  })
}

test('a round with no time cap (the exam) is waited for in steps of 540 s, at most 12, then stopped and handed to the native agent', async () => {
  const run = await go(ARGS, { ops: waitFor('examiner', () => ({ done: false })) })
  const waits = opsCalls(run, 'seat-wait').filter((c) => c.command.rest[0].startsWith('examiner'))
  assert.equal(waits.length, 12)
  for (const w of waits) assert.deepEqual(w.command.rest.slice(1), ['--max', '540'])
  assert.ok(waits[0].prompt.startsWith("Run this command with the Bash tool, once, exactly as written, with the Bash tool's timeout set to 600000:"))
  assert.equal(opsCalls(run, 'seat-stop').length, 1)
  assert.equal(run.calls.filter((c) => c.role === 'examiner').length, 1)
  assert.equal(run.result.status, 'approved')
})

test('a third review that does not approve ends in a dispute with both positions (E2)', async () => {
  let n = 0
  const writer = (call, fallback) => (call.label.startsWith('spec: writer revision') ? { ...SPEC_ANSWER, disagreements: ['gap 1: kept, the card says so'] } : fallback(call))
  const run = await go(ARGS, { judge: () => ({ verdict: 'revise', findings: [finding(`gap ${++n}`)], openQuestions: [] }), writer })
  const r = run.result
  assert.equal(r.status, 'dispute')
  assert.deepEqual([r.dispute.document, r.dispute.kind, r.dispute.judge.verdict], ['spec', 'limit', 'revise'])
  assert.ok(r.dispute.judge.text.includes('gap 3'))
  assert.deepEqual(r.dispute.writer.disagreements, ['gap 1: kept, the card says so'])
  assert.deepEqual(nativeCalls(run).map((c) => c.label), ['spec: writer write', 'spec: judge review 1', 'spec: writer revision 1', 'spec: judge review 2', 'spec: writer revision 2', 'spec: judge review 3'])
  assert.equal(r.verdicts.length, 3)
  assert.ok(nativeCalls(run)[3].prompt.includes('Your earlier verdict:') && nativeCalls(run)[3].prompt.includes('gap 1'))
  assert.ok(nativeCalls(run)[2].prompt.includes('gap 1') && nativeCalls(run)[2].prompt.includes('disagreements'))
})

test('a reject ends the design at once with the direction of the Judge, in the spec or in the plan (E2)', async () => {
  const reject = { verdict: 'reject', findings: [finding('the approach is wrong')], openQuestions: [] }
  const first = await go(ARGS, { judge: () => reject })
  assert.deepEqual([first.result.status, first.result.dispute.kind, first.result.dispute.writer], ['dispute', 'reject', null])
  assert.ok(first.result.dispute.direction.includes('fix the approach is wrong'))
  assert.equal(first.calls.filter((c) => c.role === 'writer').length, 1)
  const plan = await go(ARGS, { judge: (call, fallback) => (call.label.startsWith('plan:') ? reject : fallback(call)) })
  assert.deepEqual([plan.result.status, plan.result.dispute.document], ['dispute', 'plan'])
  assert.deepEqual(plan.result.verdicts.map((v) => [v.document, v.verdict]), [['spec', 'approve'], ['plan', 'reject']])
})

test('a mark the Writer could not settle goes back as a clarify, before any review (E4)', async () => {
  const mark = '[NEEDS CLARIFICATION: Which database holds the cards?]'
  const run = await go(ARGS, { writer: (call, fallback) => (call.label === 'spec: writer write' ? { ...SPEC_ANSWER, clarify: [mark] } : fallback(call)) })
  assert.deepEqual([run.result.status, run.result.questions, run.result.spec], ['clarify', [mark], `${FEATURE}/spec.md`])
  assert.equal(run.calls.filter((c) => c.role === 'judge').length, 0)
})

test('an agent that ends without an answer is tried again once, and the second time the design fails (R3)', async () => {
  const none = await go(ARGS, { writer: (call, fallback) => (call.label.startsWith('spec: writer write') ? null : fallback(call)) })
  assert.equal(none.result.status, 'failed')
  assert.equal(none.result.failed.step, 'spec-writer')
  assert.deepEqual(nativeCalls(none).map((c) => c.label), ['spec: writer write', 'spec: writer write (retry)'])
  let first = true
  const once = await go(ARGS, { judge: (call, fallback) => (first && call.label === 'spec: judge review 1' ? ((first = false), null) : fallback(call)) })
  assert.equal(once.result.status, 'approved')
  assert.ok(once.calls.some((c) => c.label === 'spec: judge review 1 (retry)'))
})

test('a plan that fails aether-plan check gets one more try with the errors, then the design fails', async () => {
  const error = 'Task 2 serves no requirement: add a "- Serves: R1" line to its Aether block.'
  const failing = (call, fallback) => (call.command.verb === 'check' ? { raw: { exitCode: 1, stdout: `${JSON.stringify({ ok: false, errors: [error], warnings: [] })}\n` } } : fallback(call))
  const run = await go(ARGS, { ops: failing })
  assert.deepEqual([run.result.status, run.result.failed.step], ['failed', 'plan-check'])
  assert.ok(run.result.failed.reason.includes(error))
  const writes = nativeCalls(run).filter((c) => c.label.startsWith('plan: writer'))
  assert.deepEqual(writes.map((c) => c.label), ['plan: writer write', 'plan: writer write (retry)'])
  assert.ok(writes[1].prompt.includes(error))
  assert.equal(run.calls.filter((c) => c.label.startsWith('plan: judge')).length, 0)
})

test('the plan Judge reads what check printed, and the author of each document is the model that wrote it', async () => {
  const warn = { ...CHECK_OK, warnings: ['R3 has no task that serves it.'] }
  let docs = {}
  const ops = (call, fallback) => {
    if (call.command.verb === 'check') return warn
    const out = fallback(call)
    if (call.command.verb === 'seat-start' && call.command.rest[0] === 'writer') docs[out.id] = flag(call, '--doc')
    if (call.command.verb === 'seat-wait' && docs[call.command.rest[0]] === 'plan') {
      return { done: true, exitCode: 0, value: { seat: 'writer', id: call.command.rest[0], harness: 'agy', model: 'gemini-4-argon', answer: 'x', result: { ...PLAN_ANSWER, commit: 'c9' }, lane: '- Lane: agy gemini-4-argon-high' } }
    }
    return out
  }
  const run = await go({ ...ARGS, superdelegation: 'on' }, { ops })
  assert.equal(run.result.status, 'approved')
  const judges = opsCalls(run, 'seat-start').filter((c) => c.command.rest[0] === 'judge')
  assert.deepEqual(judges.map((c) => flag(c, '--author')), ['sonnet', 'gemini-4-argon'])
  assert.equal(flag(startOf(run, 'examiner'), '--author'), 'gemini-4-argon')
  const planJudge = judges[1].payload.text
  assert.ok(planJudge.includes('aether-plan check printed:') && planJudge.includes('R3 has no task that serves it.'))
})

test('the messages carry what each seat needs, and the scope instruction', async () => {
  const run = await go(ARGS)
  const prompt = (label) => run.calls.find((c) => c.label === label).prompt
  for (const label of ['spec: writer write', 'spec: judge review 1', 'plan: writer write', 'plan: judge review 1', 'exam: examiner']) assert.ok(prompt(label).includes(SCOPE), label)
  for (const text of [`${FEATURE}/intent.md`, 'aether:specify', '[NEEDS CLARIFICATION: <question>]']) assert.ok(prompt('spec: writer write').includes(text), text)
  for (const text of [`${FEATURE}/spec.md`, `${FEATURE}/intent.md`, "each criterion comes from the owner's words", 'severity', 'type']) assert.ok(prompt('spec: judge review 1').includes(text), text)
  for (const text of [`${FEATURE}/spec.md`, 'aether:plan', 'aether:tasks', '## Gate', '## Complexity', 'Serves']) assert.ok(prompt('plan: writer write').includes(text), text)
  assert.ok(prompt('plan: judge review 1').includes('Complexity table'))
  assert.ok(prompt('exam: examiner').includes(`${FEATURE}/intent.md`) && prompt('exam: examiner').includes('never tasks.md'))
  assert.ok(prompt('exam: examiner').includes('Write the exam under /repo/.aether-exam/ and nothing else.'))
  assert.ok(prompt('spec: writer write').includes('Your checkout is /repo: the paths above are relative to it.'))
})

test('a short design runs only the Judge, with the native Writer to correct design.md, and the author of the Lead', async () => {
  const run = await go(SHORT)
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(run.result.status, 'approved')
  assert.deepEqual(run.result.verdicts.map((v) => [v.document, v.round]), [['design', 1]])
  assert.equal('plan' in run.result, false)
  assert.equal(run.calls.filter((c) => c.role !== 'ops').length, 1)
  const start = startOf(run, 'judge')
  assert.equal(flag(start, '--author'), 'opus')
  assert.ok(start.payload.text.includes(`${FEATURE}/design.md`) && start.payload.text.includes('hazlo robusto'))
  let n = 0
  const revised = await go(SHORT, { judge: (call, fallback) => (++n === 1 ? { verdict: 'revise', findings: [finding('gap')], openQuestions: [] } : fallback(call)) })
  assert.deepEqual(nativeCalls(revised).map((c) => c.label), ['design: judge review 1', 'design: writer revision 1', 'design: judge review 2'])
  assert.deepEqual(revised.calls.find((c) => c.label === 'design: writer revision 1').schema, schemas.REVISION_SCHEMA)
  assert.equal(startOf(revised, 'writer'), undefined, 'design.md is a document no Writer seat can write: its correction is the native Writer\'s')
  assert.deepEqual(revised.calls.filter((c) => c.role === 'writer').map((c) => [c.model, c.effort]), [['sonnet', 'high']])
  assert.equal(revised.result.status, 'approved')
})

test('a short design on plan.md runs only the Judge, the Writer revises in a seat round, and the changed plan gets a new exam', async () => {
  const PLAN = { ...SHORT, document: `${FEATURE}/plan.md` }
  let n = 0
  const revise = (call, fallback) => (++n === 1 ? { verdict: 'revise', findings: [finding('gap')], openQuestions: [] } : fallback(call))
  const run = await go(PLAN, { judge: revise })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved')
  assert.deepEqual(nativeCalls(run).map((c) => c.label), ['plan: judge review 1', 'plan: writer revision 1', 'plan: judge review 2', 'exam: examiner'])
  assert.deepEqual(run.calls.find((c) => c.label === 'plan: writer revision 1').schema, schemas.REVISION_SCHEMA)
  assert.equal(flag(startOf(run, 'writer'), '--doc'), 'plan')
  assert.equal(opsCalls(run, 'check').length, 2, 'before the first review and after the revision')
  assert.deepEqual(run.result.verdicts.map((v) => [v.document, v.round]), [['plan', 1], ['plan', 2]])
  assert.deepEqual(run.result.exam, { status: 'stored', dir: '/data/exams/007-demo' })
  const spec = await go({ ...SHORT, document: `${FEATURE}/spec.md` })
  assert.equal(spec.result.status, 'approved')
  assert.equal(opsCalls(spec, 'check').length, 0)
  assert.equal('exam' in spec.result, false)
})

test('every ops prompt is one the mod runs without a model, and every payload goes where the mod saves it', async () => {
  const run = await go({ ...ARGS, superdelegation: 'on', harnesses: 'agy,codex' })
  const ops = run.calls.filter((c) => c.role === 'ops')
  assert.deepEqual([...new Set(ops.map((c) => c.command.verb))].sort(), ['check', 'seat-start', 'seat-wait', 'store'])
  for (const c of ops) {
    const parsed = parseOpsPrompt(c.prompt)
    assert.ok(parsed, c.prompt)
    assert.equal(parsed.cwd, '/repo')
    if (c.command.verb === 'seat-start') assert.ok(PAYLOAD_PATH.test(c.payload.path), c.payload.path)
    else assert.equal(c.payload, null)
  }
})

test('the questions of every Writer answer reach the Lead as writerQuestions, in order and without duplicates', async () => {
  const writer = (call, fallback) => {
    if (call.label === 'spec: writer write') return { ...SPEC_ANSWER, questions: ['Q1. which database?'] }
    if (call.label === 'plan: writer write') return { ...PLAN_ANSWER, questions: ['Q2. is the spec wrong on R3?', 'Q1. which database?'] }
    return fallback(call)
  }
  const run = await go(ARGS, { writer })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved')
  assert.deepEqual(run.result.writerQuestions, ['Q1. which database?', 'Q2. is the spec wrong on R3?'])
})

test('the questions of an external Writer answer, a check retry and a correction are kept too', async () => {
  const docs = {}
  let n = 0
  let checks = 0
  const ops = (call, fallback) => {
    const out = fallback(call)
    const [verb, id] = [call.command.verb, call.command.rest[0]]
    if (verb === 'check') return ++checks === 1 ? { raw: { exitCode: 1, stdout: `${JSON.stringify({ ok: false, errors: ['e'], warnings: [] })}\n` } } : CHECK_OK
    if (verb === 'seat-start' && id === 'writer') docs[out.id] = flag(call, '--doc')
    if (verb === 'seat-wait' && docs[id] === 'spec') {
      return { done: true, exitCode: 0, value: { seat: 'writer', id, harness: 'agy', model: 'gemini-4-argon', answer: 'x', result: { ...SPEC_ANSWER, questions: ['external spec'] }, lane: '- Lane: agy gemini-4-argon-high' } }
    }
    return out
  }
  const writer = (call, fallback) => {
    if (call.label === 'plan: writer write') return { ...PLAN_ANSWER, questions: ['plan first'] }
    if (call.label === 'plan: writer write (retry)') return { ...PLAN_ANSWER, questions: ['plan retry', 'plan first'] }
    if (call.label === 'plan: writer revision 1') return { document: `${FEATURE}/tasks.md`, commit: 'c3', assumptions: [], questions: ['correction'], disagreements: [] }
    return fallback(call)
  }
  const judge = (call, fallback) => (call.label === 'plan: judge review 1' ? { verdict: 'revise', findings: [finding('gap')], openQuestions: [] } : fallback(call))
  const run = await go({ ...ARGS, superdelegation: 'on' }, { ops, writer, judge })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved')
  assert.ok(nativeCalls(run).some((c) => c.label === 'plan: writer revision 1'))
  assert.deepEqual(run.result.writerQuestions, ['external spec', 'plan first', 'plan retry', 'correction'])
})

test('a design that ends failed still carries the questions the Writer raised before it', async () => {
  const failing = (call, fallback) => (call.command.verb === 'check' ? { raw: { exitCode: 1, stdout: `${JSON.stringify({ ok: false, errors: ['e'], warnings: [] })}\n` } } : fallback(call))
  const writer = (call, fallback) => (call.label.startsWith('plan: writer') ? { ...PLAN_ANSWER, questions: [`asked in ${call.label}`] } : fallback(call))
  const run = await go(ARGS, { ops: failing, writer })
  assert.equal(run.result.status, 'failed')
  assert.deepEqual(run.result.writerQuestions, ['asked in plan: writer write', 'asked in plan: writer write (retry)'])
})

test('a design whose Writers raise no questions has no writerQuestions key', async () => {
  for (const args of [ARGS, SHORT, { ...SHORT, document: `${FEATURE}/plan.md` }]) {
    const run = await go(args)
    assert.equal(run.result.status, 'approved')
    assert.equal('writerQuestions' in run.result, false)
  }
  const failed = await go(ARGS, { writer: () => null })
  assert.equal(failed.result.status, 'failed')
  assert.equal('writerQuestions' in failed.result, false)
})

test('the args are checked', async () => {
  const bad = (change) => go({ ...ARGS, ...change }).then((run) => run.error && run.error.message)
  for (const change of [{ feature: 'docs/x' }, { session: 'a b' }, { repoRoot: 'repo' }, { superdelegation: 'maybe' }, { superdelegation: true }, { harnesses: 'AGY' }, { mode: 'short' }, { mode: 'short', document: `${FEATURE}/other.md`, intent: 'i' }]) {
    assert.match(await bad(change), /^aether:design args are missing or invalid: /, JSON.stringify(change))
  }
})

test('a seat round is started with --superdelegation and --harnesses, and never with --seats or --lanes', async () => {
  const run = await go({ ...ARGS, superdelegation: 'on' })
  assert.equal(run.error, null, run.error && run.error.stack)
  for (const seat of ['writer', 'judge', 'examiner']) {
    const start = startOf(run, seat)
    assert.equal(flag(start, '--superdelegation'), 'on', seat)
    assert.equal(flag(start, '--harnesses'), 'agy', seat)
    assert.equal(start.command.rest.includes('--seats') || start.command.rest.includes('--lanes'), false, seat)
  }
})

test('args with seats or lanes, or a superdelegation that is neither on nor off, are refused before any agent starts', async () => {
  for (const bad of [{ seats: 'balanced' }, { lanes: 'on' }, { superdelegation: 'maybe' }, { superdelegation: undefined }]) {
    const run = await go({ ...ARGS, superdelegation: 'on', ...bad })
    assert.ok(run.error, JSON.stringify(bad))
    assert.equal(run.calls.length, 0, JSON.stringify(bad))
  }
})

test('E7: a Judge handed back to the native agent runs in the model and effort the seat reply names', async () => {
  const reply = { unavailable: 'no-external', seat: 'judge', native: { ...seats.NATIVE.judge, model: 'sonnet', effort: 'high' }, tried: [] }
  const run = await go({ ...ARGS, superdelegation: 'on' }, { ops: waitFor('judge', () => ({ done: true, exitCode: 3, value: reply })) })
  assert.equal(run.error, null, run.error && run.error.stack)
  for (const call of run.calls.filter((c) => c.role === 'judge')) assert.deepEqual([call.model, call.effort], ['sonnet', 'high'], call.label)
})

test('a failed external round (exit 4) hands the native agent its model and effort from the reply, and a reply with none leaves the reference of the workflow', async () => {
  const failed = { failed: 'failed', seat: 'examiner', id: 'examiner-20261015-120005-ab12', harness: 'agy', model: 'gemini-4-argon', detail: 'x', undone: true, native: { ...seats.NATIVE.examiner, model: 'sonnet', effort: 'xhigh' } }
  const exam = await go(ARGS, { ops: waitFor('examiner', () => ({ done: true, exitCode: 4, value: failed })) })
  assert.deepEqual(exam.calls.filter((c) => c.role === 'examiner').map((c) => [c.model, c.effort]), [['sonnet', 'xhigh']])
  const handBack = (native) => ({ done: true, exitCode: 3, value: { unavailable: 'no-external', seat: 'examiner', native, tried: [] } })
  for (const native of [null, { ...seats.NATIVE.examiner, model: 'gpt-5', effort: 'high' }, { ...seats.NATIVE.examiner, effort: 'ultra' }]) {
    const run = await go(ARGS, { ops: waitFor('examiner', () => handBack(native)) })
    assert.deepEqual(run.calls.filter((c) => c.role === 'examiner').map((c) => [c.model, c.effort]), [['opus', 'high']], JSON.stringify(native))
  }
  const broke = await go(ARGS, { ops: waitFor('writer', () => ({ done: true, exitCode: 1, value: { error: 'boom' } })) })
  assert.deepEqual(broke.calls.filter((c) => c.role === 'writer').map((c) => [c.model, c.effort]).slice(0, 1), [['sonnet', 'high']])
})

test('an external Examiner stores its own exam, and no native Examiner or aether-exam store runs', async () => {
  const external = waitFor('examiner', (call) => ({ done: true, exitCode: 0, value: { seat: 'examiner', id: call.command.rest[0], harness: 'agy', model: 'gemini-4-argon', answer: 'x', result: EXAM, lane: '- Lane: agy gemini-4-argon-high', stored: '/data/exams/007-demo' } }))
  const run = await go({ ...ARGS, superdelegation: 'on' }, { ops: external })
  assert.equal(run.calls.filter((c) => c.role === 'examiner').length, 0)
  assert.equal(opsCalls(run, 'store').length, 0)
  assert.deepEqual(run.result.exam, { status: 'stored', dir: '/data/exams/007-demo' })
})

test('C3: the corrections of the Writer are seat rounds too, and fall to the native agent with the revision schema only when the seat is handed back', async () => {
  let n = 0
  const revise = (call, fallback) => (++n === 1 ? { verdict: 'revise', findings: [finding('gap')], openQuestions: [] } : fallback(call))
  const run = await go({ ...ARGS, superdelegation: 'on' }, { judge: revise })
  assert.equal(run.error, null, run.error && run.error.stack)
  const writers = opsCalls(run, 'seat-start').filter((c) => c.command.rest[0] === 'writer')
  assert.deepEqual(writers.map((c) => flag(c, '--doc')), ['spec', 'spec', 'plan'])
  assert.ok(writers[1].payload.text.includes('Revise '), 'the second round of the Writer carries the correction message')
  assert.deepEqual(run.calls.find((c) => c.label === 'spec: writer revision 1').schema, schemas.REVISION_SCHEMA)
})

test('an external correction of the Writer answers with the schema of its document, and its model is the next author', async () => {
  const docs = {}
  const revisions = []
  const ops = (call, fallback) => {
    const out = fallback(call)
    const [verb, id] = [call.command.verb, call.command.rest[0]]
    if (verb === 'seat-start' && id === 'writer') docs[out.id] = { doc: flag(call, '--doc'), text: call.payload.text }
    if (verb === 'seat-wait' && docs[id] && docs[id].text.startsWith('Revise ')) {
      revisions.push(docs[id].doc)
      const result = docs[id].doc === 'plan' ? { ...PLAN_ANSWER, commit: 'c9', disagreements: ['kept'] } : { ...SPEC_ANSWER, commit: 'c8' }
      return { done: true, exitCode: 0, value: { seat: 'writer', id, harness: 'agy', model: 'gemini-4-argon', answer: 'x', result, lane: '- Lane: agy gemini-4-argon-high' } }
    }
    return out
  }
  const revise = (call, fallback) => (/review 1$/.test(call.label) ? { verdict: 'revise', findings: [finding('gap')], openQuestions: [] } : fallback(call))
  const run = await go({ ...ARGS, superdelegation: 'on' }, { ops, judge: revise })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved')
  assert.deepEqual(revisions, ['spec', 'plan'])
  assert.equal(nativeCalls(run).some((c) => c.label.includes('revision')), false, 'an external Writer needs no native correction')
  const judges = opsCalls(run, 'seat-start').filter((c) => c.command.rest[0] === 'judge')
  assert.deepEqual(judges.map((c) => flag(c, '--author')), ['sonnet', 'gemini-4-argon', 'sonnet', 'gemini-4-argon'])
  assert.ok(judges[1].payload.text.includes('in commit c8'))
  assert.ok(judges[3].payload.text.includes('in commit c9') && judges[3].payload.text.includes('- kept'))
  assert.equal(opsCalls(run, 'check').length, 2, 'after the first plan write and after its correction')
})

const EDIT_ONLY = 'Edit the document in place. Change only what the findings need. Do not rewrite, reorder or reformat the rest. Keep everything the Judge did not flag.'

test('issue 67: a revision names the findings and where they touch, and tells the Writer to edit only those; the first round does not', async () => {
  const findings = [
    { severity: 'major', type: 'wrong', title: 'the limit', evidence: '`plan.md:12-14`', fix: 'raise it' },
    { severity: 'minor', type: 'extra', title: 'the table', evidence: 'see `## Complexity`', fix: 'drop the row' },
    { severity: 'blocking', type: 'missing', title: 'a gap', evidence: '`R1`', fix: 'name it' },
  ]
  const judge = (call, fallback) => (/ review 1$/.test(call.label) ? { verdict: 'revise', findings, openQuestions: ['Which limit?'] } : fallback(call))
  const run = await go({ ...ARGS, superdelegation: 'on' }, { judge })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved')

  const writers = opsCalls(run, 'seat-start').filter((c) => c.command.rest[0] === 'writer')
  const first = run.calls.find((c) => c.label === 'spec: writer write').prompt
  const planFirst = run.calls.find((c) => c.label === 'plan: writer write').prompt
  for (const prompt of [first, planFirst]) {
    assert.equal(prompt.includes(EDIT_ONLY), false, prompt.slice(0, 80))
    assert.equal(prompt.includes('names no line'), false)
    assert.equal(prompt.includes('Findings:'), false)
  }

  const specPayload = writers[1].payload.text
  const specNative = run.calls.find((c) => c.label === 'spec: writer revision 1').prompt
  assert.ok(specNative.startsWith(specPayload), 'the native Writer and the external seat get the same revision message')
  assert.ok(specPayload.startsWith(`Revise ${FEATURE}/spec.md `))
  assert.ok(specPayload.includes(EDIT_ONLY))
  assert.ok(specPayload.includes(`- ${FEATURE}/spec.md`))
  assert.ok(specPayload.includes('[major] [wrong] the limit — lines 12-14'))
  assert.ok(specPayload.includes('[minor] [extra] the table — ## Complexity'))
  assert.ok(specPayload.includes('[blocking] [missing] a gap — names no line'))
  assert.ok(specPayload.includes('Which limit?'))
  assert.equal(specPayload.includes('Write the spec of'), false)

  const planPayload = writers[3].payload.text
  assert.ok(planPayload.startsWith('Revise '))
  assert.ok(planPayload.includes(EDIT_ONLY))
  assert.ok(planPayload.includes(`- ${FEATURE}/plan.md`))
  assert.ok(planPayload.includes(`- ${FEATURE}/tasks.md`))
  assert.ok(planPayload.includes('names no line'))
  assert.ok(planPayload.includes(seats.revisionBrief({ paths: [`${FEATURE}/plan.md`, `${FEATURE}/tasks.md`], findings, openQuestions: ['Which limit?'] })))

  // The next Judge review gets the same places. A git diff of the document is not in the message: the workflow
  // can only shell out through the ops commands the mod allowlists, and that list is outside this task.
  const judgeFirst = run.calls.find((c) => c.label === 'spec: judge review 1').prompt
  const judgeNext = run.calls.find((c) => c.label === 'spec: judge review 2').prompt
  assert.equal(judgeFirst.includes('Where those findings touch:'), false)
  assert.ok(judgeNext.includes('Your earlier verdict:'))
  assert.ok(judgeNext.includes('Where those findings touch:'))
  assert.ok(judgeNext.includes('[major] [wrong] the limit — lines 12-14'))
  assert.ok(judgeNext.includes('[blocking] [missing] a gap — names no line'))

  const guide = fs.readFileSync(path.join(PLUGIN, '..', '..', 'docs', 'guide', 'design-seats.md'), 'utf8')
  assert.ok(guide.includes('edit the document in place'))
  assert.ok(guide.includes('names no line'))
})

test('the design workflow holds no copy of the seat profiles and no native correction by rule', () => {
  const source = fs.readFileSync(path.join(PLUGIN, 'workflows', 'design.workflow.js'), 'utf8')
  for (const gone of ['SEAT_CHOICES', 'nativeRevision', 'with no seat round', "'balanced'", "'robust'", 'input.seats', 'input.lanes']) assert.equal(source.includes(gone), false, gone)
})

// R17: a Judge or an Examiner is never the model that wrote what it reviews, also when the seat round names no native
// agent (it broke, or did not start). The workflow holds a small rule of its own for that case, and these tests pin it to
// the real choice: the model it falls back to is the `native` that lib/seats.js chooseSeat gives for the same seat and author.
function brokenRound(seat) {
  return (call, fallback) => {
    const { verb, rest } = call.command
    if (verb === 'seat-wait' && rest[0].startsWith(seat)) return { done: true, exitCode: 1, value: { error: 'boom' } }
    return fallback(call)
  }
}

const realNative = (seat, author) => {
  const pairs = require('../plugins/aether/lib/pairs.js').loadPairs().pairs
  return seats.chooseSeat({ config: null, pairs, seat, author, harnesses: {} }).native
}

for (const seat of ['judge', 'examiner']) {
  test(`R17: a native ${seat} taken after a seat round that names no native pair is the model chooseSeat gives, not the author's`, async () => {
    const document = `${FEATURE}/${seat === 'judge' ? 'design' : 'plan'}.md`
    const run = await go({ ...SHORT, superdelegation: 'on', author: 'opus', document }, { ops: brokenRound(seat) })
    assert.equal(run.error, null, run.error && run.error.stack)
    const taken = run.calls.filter((c) => c.role === seat)
    assert.ok(taken.length >= 1, `a native ${seat} ran`)
    const real = realNative(seat, 'opus')
    assert.notEqual(real.model, 'opus')
    for (const call of taken) assert.deepEqual([call.model, call.effort], [real.model, real.effort], call.label)
  })

  test(`R17: the fallback of the ${seat} is chooseSeat's native for every author, the reference pair when the author is another model`, async () => {
    const document = `${FEATURE}/${seat === 'judge' ? 'design' : 'plan'}.md`
    for (const author of ['haiku', 'sonnet', 'opus', 'claude-opus-5-5', 'agy/claude-opus-5-5', 'gemini-4-argon']) {
      const run = await go({ ...SHORT, superdelegation: 'on', author, document }, { ops: brokenRound(seat) })
      assert.equal(run.error, null, run.error && run.error.stack)
      const taken = run.calls.filter((c) => c.role === seat)
      assert.ok(taken.length >= 1, `a native ${seat} ran for ${author}`)
      const real = realNative(seat, author)
      for (const call of taken) assert.deepEqual([call.model, call.effort], [real.model, real.effort], `${author}: ${call.label}`)
    }
  })
}

// A seat round that fails asks for the next pair before the native agent takes it. The fakes below script the replies of
// `aether-lane seat-wait` as seats.js prints them: exit 4 for a round that failed (the pair is `decision.picked`), exit 0
// for one that answered, exit 3 when no pair is left.
const AGY = 'agy/gemini-4-argon@high'
const GROK = 'grok/grok-4.7@high'
const MUSE = 'muse/muse-wonder-full-1.0@high'
const QUOTA = 'Individual quota reached for this model. Resets in 133h5m24s'

const parts = (pair) => {
  const [harness, rest] = pair.split('/')
  const [model, effort] = rest.split('@')
  return { harness, model, effort }
}
const failedWait = (seat, id, pair, { status = 'failed', detail = 'exit 4: the harness failed' } = {}) => {
  const { harness, model, effort } = parts(pair)
  return { done: true, exitCode: 4, value: { failed: status, seat, id, harness, model, detail, undone: true, native: { ...seats.NATIVE[seat] }, decision: { picked: { id: pair, harness, model, effort } } } }
}
const answeredWait = (seat, id, pair, result, answer = 'x') => {
  const { harness, model, effort } = parts(pair)
  return { done: true, exitCode: 0, value: { seat, id, harness, model, answer, result, lane: `- Lane: ${harness} ${model}-${effort}` } }
}
const verdictText = '## Verdict\napprove\n## Findings\nnone\n## Open questions\n- none'

// The replies for the rounds whose seat-start `match` accepts: replies[n] answers the n-th of them, as a function of its
// id. A round past the script, and every other command, gets the default fakes.
function scripted(match, replies) {
  const order = new Map()
  return (call, fallback) => {
    const { verb, rest } = call.command
    if (verb === 'seat-start' && match(call)) {
      const out = fallback(call)
      order.set(out.id, order.size)
      return out
    }
    if (verb === 'seat-wait' && order.has(rest[0]) && replies[order.get(rest[0])] !== undefined) return replies[order.get(rest[0])](rest[0])
    return fallback(call)
  }
}
const SPEC_WRITER = (call) => call.command.rest[0] === 'writer' && flag(call, '--doc') === 'spec'
const FIRST_JUDGE = (call) => call.command.rest[0] === 'judge' && call.payload.text.startsWith(`Review the spec ${FEATURE}/spec.md`)
const specStarts = (run) => opsCalls(run, 'seat-start').filter(SPEC_WRITER)
const exclusionOf = (start) => (start.command.rest.includes('--exclude') ? flag(start, '--exclude') : null)
const ON = { ...ARGS, superdelegation: 'on', harnesses: 'agy,grok,muse' }

test('a Writer seat refused for quota asks for the next pair, and the native Writer does not run', async () => {
  const replies = [(id) => failedWait('writer', id, AGY, { status: 'quota', detail: `exit 3: ${QUOTA}` }), (id) => answeredWait('writer', id, GROK, SPEC_ANSWER)]
  const run = await go(ON, { ops: scripted(SPEC_WRITER, replies) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved')
  assert.equal(nativeCalls(run).some((c) => c.label.startsWith('spec: writer')), false, 'no native Writer wrote the spec')
  const starts = specStarts(run)
  assert.equal(starts.length, 2)
  assert.deepEqual(starts.map(exclusionOf), [null, AGY])
  assert.equal(starts[1].command.rest.indexOf('--exclude') + 2, starts[1].command.rest.indexOf('--digest'), '--exclude is the token pair just before --digest')
  assert.equal(starts[1].payload.text, starts[0].payload.text, 'the same message')
  assert.equal(flag(starts[1], '--digest'), lanes.digest(starts[1].payload.text))
  assert.ok(parseOpsPrompt(starts[1].prompt), 'the mod runs the start with --exclude without a model')
  assert.deepEqual(['--session', '--feature', '--doc', '--superdelegation', '--harnesses'].map((f) => flag(starts[1], f)), ['sess-1', FEATURE, 'spec', 'on', 'agy,grok,muse'])
  const record = run.result.rounds[0]
  assert.deepEqual([record.document, record.seat, record.provider, record.note], ['spec', 'writer', 'grok grok-4.7', null])
  assert.equal(record.tries.length, 1)
  assert.deepEqual([record.tries[0].pair, record.tries[0].next], [AGY, true])
  assert.ok(record.tries[0].reason.includes('Individual quota reached'), record.tries[0].reason)
  assert.equal(record.tries[0].id, 'writer-20261015-120001-ab12')
  assert.equal(record.id, 'writer-20261015-120002-ab12')
  assert.deepEqual(run.result.rounds.map((x) => [x.document, x.seat]), [['spec', 'writer'], ['spec', 'judge'], ['plan', 'writer'], ['plan', 'judge'], ['exam', 'examiner']], 'the order of the rounds is the same')
})

// The ops agent of a real run reported the round's own exit (3 or 4) as the exit of `aether-lane seat-wait`, whose process
// exits 0: the wait handler returns the reply as that raw result.
const reportingRoundExit = (ops) => (call, fallback) => {
  const out = ops(call, fallback)
  return call.command.verb === 'seat-wait' && out && out.done === true ? { raw: { exitCode: out.exitCode, stdout: `${JSON.stringify(out)}\n` } } : out
}

test('a wait whose reported exit is the round\'s own (3 or 4) is read at once: no twelve waits, no stop, the next pair is asked', async () => {
  const replies = [(id) => failedWait('writer', id, AGY, { status: 'quota', detail: `exit 3: ${QUOTA}` }), (id) => answeredWait('writer', id, GROK, SPEC_ANSWER)]
  const run = await go(ON, { ops: reportingRoundExit(scripted(SPEC_WRITER, replies)) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved')
  assert.equal(opsCalls(run, 'seat-wait').length, opsCalls(run, 'seat-start').length, 'every round is waited for once')
  assert.equal(opsCalls(run, 'seat-stop').length, 0, 'no round was stopped')
  assert.deepEqual(specStarts(run).map(exclusionOf), [null, AGY])
  assert.equal(nativeCalls(run).some((c) => c.label.startsWith('spec: writer')), false, 'no native Writer wrote the spec')
  assert.deepEqual([run.result.rounds[0].provider, run.result.rounds[0].note], ['grok grok-4.7', null])
  // A round handed back (exit 3) is read the same way, and its note says why, not that it did not finish.
  assert.ok(run.result.rounds[1].note.startsWith('handed back to the native agent'), run.result.rounds[1].note)
})

test('a Judge seat that fails with exit 4 asks for the next pair, and the second one answers as the verdict', async () => {
  const replies = [(id) => failedWait('judge', id, MUSE, { detail: 'exit 4: the harness failed' }), (id) => answeredWait('judge', id, GROK, APPROVE, verdictText)]
  const run = await go(ON, { ops: scripted(FIRST_JUDGE, replies) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved')
  assert.equal(run.calls.some((c) => c.label === 'spec: judge review 1'), false, 'no native Judge took the review')
  const starts = opsCalls(run, 'seat-start').filter(FIRST_JUDGE)
  assert.deepEqual(starts.map(exclusionOf), [null, MUSE])
  assert.deepEqual(starts.map((c) => flag(c, '--author')), ['sonnet', 'sonnet'])
  assert.deepEqual(run.result.verdicts.map((v) => [v.document, v.round, v.seat]), [['spec', 1, 'grok grok-4.7'], ['plan', 1, 'native']])
  assert.equal(run.result.verdicts[0].text, verdictText)
  assert.deepEqual(run.result.rounds[1].tries.map((t) => [t.pair, t.next]), [[MUSE, true]])
})

test('three external tries in all: the native agent takes the round after the third, with the same message', async () => {
  const replies = [(id) => failedWait('writer', id, AGY, { status: 'quota', detail: QUOTA }), (id) => failedWait('writer', id, GROK), (id) => failedWait('writer', id, MUSE, { detail: 'exit 4: muse failed' }), (id) => answeredWait('writer', id, AGY, SPEC_ANSWER)]
  const run = await go(ON, { ops: scripted(SPEC_WRITER, replies) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved')
  const starts = specStarts(run)
  assert.equal(starts.length, 3, 'never a fourth try')
  assert.deepEqual(starts.map(exclusionOf), [null, AGY, `${AGY},${GROK}`])
  assert.ok(parseOpsPrompt(starts[2].prompt), 'the mod runs a start with two excluded pairs too')
  const native = nativeCalls(run).filter((c) => c.label.startsWith('spec: writer'))
  assert.deepEqual(native.map((c) => c.label), ['spec: writer write'])
  assert.ok(native[0].prompt.startsWith(starts[0].payload.text), 'the same message')
  assert.equal(native[0].prompt.slice(starts[0].payload.text.length).trim(), 'Your checkout is /repo: the paths above are relative to it.')
  const record = run.result.rounds[0]
  assert.equal(record.provider, 'native')
  assert.ok(record.note.includes('muse') && record.note.includes('exit 4: muse failed'), record.note)
  assert.deepEqual(record.tries.map((t) => [t.pair, t.next]), [[AGY, true], [GROK, true], [MUSE, false]])
  assert.deepEqual(record.tries.map((t) => t.id), starts.map((_, i) => `writer-20261015-12000${i + 1}-ab12`))
  assert.ok(record.tries[0].reason.includes('Individual quota reached') && record.tries[1].reason.includes('grok') && record.tries[2].reason.includes('muse'))
  assert.equal(record.id, 'writer-20261015-120003-ab12')
})

test('a seat-start that says no pair is left hands the round to the native agent with no retry, and the reply names the native pair', async () => {
  const noneLeft = { unavailable: 'no-external', seat: 'judge', native: { ...seats.NATIVE.judge, model: 'sonnet', effort: 'high' }, tried: [] }
  const first = await go(ON, { ops: scripted(FIRST_JUDGE, [() => ({ done: true, exitCode: 3, value: noneLeft })]) })
  assert.equal(opsCalls(first, 'seat-start').filter(FIRST_JUDGE).length, 1, 'no pair is asked for again')
  assert.deepEqual(first.calls.filter((c) => c.label === 'spec: judge review 1').map((c) => [c.model, c.effort]), [['sonnet', 'high']])
  assert.equal('tries' in first.result.rounds[1], false, 'a round that never asked for a second pair has no tries')
  const after = await go(ON, { ops: scripted(FIRST_JUDGE, [(id) => failedWait('judge', id, AGY, { status: 'quota', detail: QUOTA }), () => ({ done: true, exitCode: 3, value: noneLeft })]) })
  assert.equal(after.error, null, after.error && after.error.stack)
  const starts = opsCalls(after, 'seat-start').filter(FIRST_JUDGE)
  assert.deepEqual(starts.map(exclusionOf), [null, AGY], 'asked once for the next pair, which was none')
  assert.deepEqual(after.calls.filter((c) => c.label === 'spec: judge review 1').map((c) => [c.model, c.effort]), [['sonnet', 'high']])
  const record = after.result.rounds[1]
  assert.deepEqual(record.tries.map((t) => [t.pair, t.next]), [[AGY, true]])
  assert.ok(record.note.startsWith('handed back to the native agent (sonnet high): no-external'), record.note)
})

// The exam has no time cap (issue 62), so a round of it that never finishes ends at the waits' limit, not at a cap.
const EXAMINER = (call) => call.command.rest[0] === 'examiner'
test('a round that does not finish by its waits goes native with no retry, also after a failed first try', async () => {
  const timed = await go(ON, { ops: scripted(EXAMINER, [() => ({ done: false })]) })
  assert.equal(opsCalls(timed, 'seat-start').filter(EXAMINER).length, 1)
  assert.equal(opsCalls(timed, 'seat-stop').length, 1)
  assert.ok(timed.calls.some((c) => c.label === 'exam: examiner'))
  assert.equal('tries' in timed.result.rounds[4], false)
  const replies = [(id) => failedWait('examiner', id, AGY, { status: 'quota', detail: QUOTA }), () => ({ done: false })]
  const after = await go(ON, { ops: scripted(EXAMINER, replies) })
  const starts = opsCalls(after, 'seat-start').filter(EXAMINER)
  assert.deepEqual(starts.map(exclusionOf), [null, AGY], 'a second try that times out is not followed by a third')
  assert.equal(opsCalls(after, 'seat-stop').length, 1)
  assert.ok(after.calls.some((c) => c.label === 'exam: examiner'), 'the native Examiner took it')
  const record = after.result.rounds[4]
  assert.deepEqual(record.tries.map((t) => [t.pair, t.next]), [[AGY, true], [null, false]])
  assert.ok(record.tries[1].reason.includes('did not finish'), record.tries[1].reason)
  assert.ok(typeof record.tries[1].id === 'string' && record.tries[1].id.startsWith('examiner-'))
  assert.ok(record.note.includes('did not finish'), record.note)
})

test('an answer that does not fit goes native with no retry', async () => {
  const unfit = (id) => answeredWait('judge', id, AGY, { verdict: 'maybe' })
  const run = await go(ON, { ops: scripted(FIRST_JUDGE, [unfit]) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(opsCalls(run, 'seat-start').filter(FIRST_JUDGE).length, 1)
  assert.ok(run.calls.some((c) => c.label === 'spec: judge review 1'))
  assert.equal('tries' in run.result.rounds[1], false)
})

test('a round that broke (exit 1) asks again with no new exclusion, and the second pair answers', async () => {
  const broke = () => ({ done: true, exitCode: 1, value: { error: 'boom' } })
  const replies = [broke, (id) => answeredWait('judge', id, GROK, APPROVE, verdictText)]
  const run = await go(ON, { ops: scripted(FIRST_JUDGE, replies) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved')
  assert.equal(run.calls.some((c) => c.label === 'spec: judge review 1'), false, 'no native Judge took the review')
  const starts = opsCalls(run, 'seat-start').filter(FIRST_JUDGE)
  assert.equal(starts.length, 2)
  assert.deepEqual(starts.map(exclusionOf), [null, null], 'a broken round names no pair, so the second start carries no new exclusion')
  assert.equal(run.result.verdicts[0].seat, 'grok grok-4.7')
  assert.deepEqual(run.result.rounds[1].tries.map((t) => [t.pair, t.next]), [[null, true]])
  assert.ok(run.result.rounds[1].tries[0].reason.includes('boom'), run.result.rounds[1].tries[0].reason)
})

test('a round that broke three times goes native with the same message, and the record lists three tries', async () => {
  const broke = () => ({ done: true, exitCode: 1, value: { error: 'boom' } })
  const replies = [broke, broke, broke, (id) => answeredWait('judge', id, GROK, APPROVE, verdictText)]
  const run = await go(ON, { ops: scripted(FIRST_JUDGE, replies) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved')
  const starts = opsCalls(run, 'seat-start').filter(FIRST_JUDGE)
  assert.equal(starts.length, 3, 'never a fourth try')
  assert.deepEqual(starts.map(exclusionOf), [null, null, null])
  const native = run.calls.filter((c) => c.label === 'spec: judge review 1')
  assert.equal(native.length, 1, 'the native Judge took it after the third')
  assert.ok(native[0].prompt.startsWith(starts[0].payload.text), 'the same message')
  assert.deepEqual(run.result.rounds[1].tries.map((t) => [t.pair, t.next]), [[null, true], [null, true], [null, false]])
  for (const t of run.result.rounds[1].tries) assert.ok(t.reason.includes('boom'), t.reason)
})

test('a failed round (exit 4) that names no usable pair asks again with the same exclusion', async () => {
  const unnamed = (id) => ({ done: true, exitCode: 4, value: { failed: 'failed', seat: 'judge', id, harness: 'agy', model: 'gemini-4-argon', detail: 'x', undone: true, native: { ...seats.NATIVE.judge } } })
  const badPair = (id) => ({ done: true, exitCode: 4, value: { failed: 'failed', seat: 'judge', id, harness: 'agy', model: 'gemini-4-argon', detail: 'x', undone: true, native: { ...seats.NATIVE.judge }, decision: { picked: { id: 'agy; rm -rf /' } } } })
  for (const reply of [unnamed, badPair]) {
    const run = await go(ON, { ops: scripted(FIRST_JUDGE, [reply, (id) => answeredWait('judge', id, GROK, APPROVE, verdictText)]) })
    assert.equal(run.error, null, run.error && run.error.stack)
    assert.equal(run.calls.some((c) => c.label === 'spec: judge review 1'), false, reply.name)
    const starts = opsCalls(run, 'seat-start').filter(FIRST_JUDGE)
    assert.deepEqual(starts.map(exclusionOf), [null, null], reply.name)
    assert.deepEqual(run.result.rounds[1].tries.map((t) => [t.pair, t.next]), [[null, true]], reply.name)
  }
})

test('once the next pair was asked, a try whose answer does not fit is listed as the last try', async () => {
  const replies = [(id) => failedWait('judge', id, AGY, { status: 'quota', detail: QUOTA }), (id) => answeredWait('judge', id, GROK, { verdict: 'maybe' })]
  const run = await go(ON, { ops: scripted(FIRST_JUDGE, replies) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(opsCalls(run, 'seat-start').filter(FIRST_JUDGE).length, 2, 'no third try after an unfit answer')
  assert.ok(run.calls.some((c) => c.label === 'spec: judge review 1'), 'the native Judge took it')
  assert.deepEqual(run.result.rounds[1].tries.map((t) => [t.pair, t.next]), [[AGY, true], [null, false]])
  assert.ok(run.result.rounds[1].tries[1].reason.includes('fits its schema'), run.result.rounds[1].tries[1].reason)
})

test('a start that fails counts as a try: the next start carries the same exclusion, and the native agent takes the round after the third', async () => {
  const starting = (failures) => {
    let n = 0
    return (call, fallback) => {
      if (call.command.verb === 'seat-start' && SPEC_WRITER(call) && ++n <= failures) return { error: 'the digest does not match' }
      if (call.command.verb === 'seat-wait' && call.command.rest[0].startsWith('writer')) return answeredWait('writer', call.command.rest[0], AGY, SPEC_ANSWER)
      return fallback(call)
    }
  }
  const once = await go(ON, { ops: starting(1) })
  assert.equal(once.error, null, once.error && once.error.stack)
  assert.equal(specStarts(once).length, 2)
  assert.equal(nativeCalls(once).some((c) => c.label.startsWith('spec: writer')), false)
  const record = once.result.rounds[0]
  assert.equal(record.provider, 'agy gemini-4-argon')
  assert.deepEqual(record.tries.map((t) => [t.pair, t.id, t.next]), [[null, null, true]])
  assert.ok(record.tries[0].reason.includes('the digest does not match'), record.tries[0].reason)
  const always = await go(ON, { ops: starting(9) })
  assert.equal(specStarts(always).length, 3)
  assert.ok(always.calls.some((c) => c.label === 'spec: writer write'), 'the native Writer took the round')
  assert.deepEqual(always.result.rounds[0].tries.map((t) => t.next), [true, true, false])
})

test('a pair the reply names twice is not tried twice, and the loop always ends', async () => {
  const same = (id) => failedWait('writer', id, AGY, { status: 'quota', detail: QUOTA })
  const run = await go(ON, { ops: scripted(SPEC_WRITER, [same, same, same, same]) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(specStarts(run).length, 2, 'the second try failed on a pair that was already excluded: the reply is broken, so the native agent takes it')
  assert.ok(run.calls.some((c) => c.label === 'spec: writer write'))
  assert.deepEqual(run.result.rounds[0].tries.map((t) => [t.pair, t.next]), [[AGY, true], [AGY, false]])
})

test('the author rule holds with the exclusion: the retry keeps --author, and the native Judge after the last try is not the author', async () => {
  const pairs = require('../plugins/aether/lib/pairs.js').loadPairs().pairs
  const left = seats.chooseSeat({ config: null, pairs, seat: 'judge', author: 'opus', harnesses: {}, exclude: [AGY, GROK] })
  assert.notEqual(left.native.model, 'opus')
  const noneLeft = { unavailable: 'no-external', seat: 'judge', native: left.native, tried: left.tried, decision: left.decision }
  const replies = [(id) => failedWait('judge', id, AGY, { status: 'quota', detail: QUOTA }), (id) => failedWait('judge', id, GROK), () => ({ done: true, exitCode: 3, value: noneLeft })]
  const run = await go({ ...SHORT, superdelegation: 'on', harnesses: 'agy,grok,muse', author: 'opus' }, { ops: scripted((call) => call.command.rest[0] === 'judge', replies) })
  assert.equal(run.error, null, run.error && run.error.stack)
  const starts = opsCalls(run, 'seat-start')
  assert.deepEqual(starts.map(exclusionOf), [null, AGY, `${AGY},${GROK}`])
  assert.deepEqual(starts.map((c) => flag(c, '--author')), ['opus', 'opus', 'opus'])
  const judges = run.calls.filter((c) => c.role === 'judge')
  assert.equal(judges.length, 1)
  assert.deepEqual([judges[0].model, judges[0].effort], [left.native.model, left.native.effort])
  assert.notEqual(judges[0].model, 'opus')
  assert.deepEqual(run.result.rounds[0].tries.map((t) => [t.pair, t.next]), [[AGY, true], [GROK, true]])
})

// --- Issue 62: a seat round has a time cap that scales with the document ---

const maxes = (run, idPrefix) => opsCalls(run, 'seat-wait').filter((c) => c.command.rest[0].startsWith(idPrefix)).map((c) => flag(c, '--max'))
const PLAN_WRITER = (call) => call.command.rest[0] === 'writer' && flag(call, '--doc') === 'plan'
// seat-stop names the pair the round ran on, as the bin does once the round had one.
const stopNaming = (pair, ops) => (call, fallback) => (call.command.verb === 'seat-stop' ? { stopped: true, pair } : ops(call, fallback))
const took = (ms, reply) => ({ ...reply, durationMs: ms })
const silentRound = () => ({ done: false })

test('a spec round that reaches 10 minutes is stopped and counts as failed: the next pair is asked, and the first pair is left out (issue 62)', async () => {
  const replies = [silentRound, (id) => took(184000, answeredWait('writer', id, GROK, SPEC_ANSWER))]
  const run = await go(ON, { ops: stopNaming(AGY, scripted(SPEC_WRITER, replies)) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved')
  assert.deepEqual(specStarts(run).map(exclusionOf), [null, AGY])
  // The first round was waited for 540 s and then the 60 s that were left of the 600.
  assert.deepEqual(maxes(run, 'writer-20261015-120001'), ['540', '60'])
  assert.equal(opsCalls(run, 'seat-stop').filter((c) => c.command.rest[0] === 'writer-20261015-120001-ab12').length, 1)
  assert.equal(nativeCalls(run).some((c) => c.label.startsWith('spec: writer')), false, 'no native Writer wrote the spec')
  const record = run.result.rounds[0]
  assert.equal(record.provider, 'grok grok-4.7')
  assert.match(record.tries[0].reason, /reached its time cap of 10 min/)
  assert.deepEqual([record.tries[0].pair, record.tries[0].next, record.tries[0].durationMs], [AGY, true, 600000])
  // The duration of each round is in the result.
  assert.deepEqual(record.durations, [600000, 184000])
  assert.equal(record.durationMs, 784000)
})

test('a plan round has 25 minutes: the waits are 540, 540 and what is left', async () => {
  const replies = [silentRound, (id) => took(300000, answeredWait('writer', id, GROK, PLAN_ANSWER))]
  const run = await go(ON, { ops: stopNaming(AGY, scripted(PLAN_WRITER, replies)) })
  assert.equal(run.error, null, run.error && run.error.stack)
  const plans = opsCalls(run, 'seat-start').filter(PLAN_WRITER)
  assert.deepEqual(plans.map(exclusionOf), [null, AGY])
  const planRound = run.result.rounds.find((x) => x.document === 'plan' && x.seat === 'writer')
  assert.match(planRound.tries[0].reason, /reached its time cap of 25 min/)
  assert.deepEqual(planRound.durations, [1500000, 300000])
  const firstPlan = opsCalls(run, 'seat-start').filter(PLAN_WRITER).length
  assert.equal(firstPlan, 2)
  assert.deepEqual(maxes(run, 'writer-20261015-120003'), ['540', '540', '420'])
})

test('the time of a round that seat-wait reports (elapsedMs) is the clock, not the sum of the waits', async () => {
  let n = 0
  const replies = [() => ({ done: false, elapsedMs: [560000, 601000][n++] }), (id) => answeredWait('writer', id, GROK, SPEC_ANSWER)]
  const run = await go(ON, { ops: stopNaming(AGY, scripted(SPEC_WRITER, replies)) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(maxes(run, 'writer-20261015-120001'), ['540', '40'])
  assert.equal(run.result.rounds[0].tries[0].durationMs, 601000)
})

test('a round whose stop names no pair is retried with the same exclusion, three tries at most, then the native agent takes it', async () => {
  const run = await go(ON, { ops: scripted(SPEC_WRITER, [silentRound, silentRound, silentRound]) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(specStarts(run).length, 3)
  assert.deepEqual(specStarts(run).map(exclusionOf), [null, null, null])
  assert.equal(nativeCalls(run).filter((c) => c.label.startsWith('spec: writer')).length, 1)
  assert.equal(run.result.status, 'approved')
})

test('the Judge of a spec has 10 minutes too, and the Judge of a plan 25', async () => {
  const run = await go(ARGS, { ops: waitFor('judge', silentRound) })
  const judgeWaits = opsCalls(run, 'seat-wait').filter((c) => c.command.rest[0].startsWith('judge'))
  // Three tries of 540 + 60 for the spec, then three of 540 + 540 + 420 for the plan.
  assert.deepEqual(judgeWaits.map((c) => flag(c, '--max')), ['540', '60', '540', '60', '540', '60', '540', '540', '420', '540', '540', '420', '540', '540', '420'])
  assert.equal(opsCalls(run, 'seat-stop').filter((c) => c.command.rest[0].startsWith('judge')).length, 6)
  assert.equal(run.calls.filter((c) => c.role === 'judge').length, 2)
  assert.equal(run.result.status, 'approved')
})

test('a round that answers carries its duration in its record', async () => {
  const run = await go(ON, { ops: scripted(SPEC_WRITER, [(id) => took(125000, answeredWait('writer', id, GROK, SPEC_ANSWER))]) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual([run.result.rounds[0].durations, run.result.rounds[0].durationMs], [[125000], 125000])
  assert.equal(run.result.rounds[1].durationMs, undefined, 'a round only the native agent took has none')
})
