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
const ARGS = { feature: FEATURE, session: 'sess-1', repoRoot: '/repo', seats: 'native', lanes: 'off', harnesses: 'agy' }
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
const nativeSeat = (seat) => ({ unavailable: 'no-external', seat, choice: 'native', native: { ...seats.NATIVE[seat] }, tried: [] })
const handedBack = (seat) => ({ done: true, exitCode: 3, value: seat === 'examiner' ? { unavailable: 'off', seat, choice: 'native', native: null, tried: [] } : nativeSeat(seat) })

// The fakes: every seat round is handed back to the native agent (exit 3), the Examiner of the native choice is off.
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
  assert.deepEqual(nativeCalls(run).map((c) => c.role), ['writer', 'judge', 'writer', 'judge'])
  const r = run.result
  assert.equal(r.status, 'approved')
  assert.deepEqual([r.spec, r.plan, r.tasks], [`${FEATURE}/spec.md`, `${FEATURE}/plan.md`, `${FEATURE}/tasks.md`])
  assert.deepEqual(r.verdicts.map((v) => [v.document, v.round, v.seat, v.verdict]), [['spec', 1, 'native', 'approve'], ['plan', 1, 'native', 'approve']])
  assert.equal(r.verdicts[0].text, '## Verdict\napprove\n## Findings\nnone\n## Open questions\n- none')
  assert.equal(r.complexity, PLAN_ANSWER.complexity)
  assert.deepEqual(r.proposals, ['P1. a proposal'])
  assert.deepEqual(r.exam, { status: 'off' })
  assert.deepEqual(r.rounds.map((x) => [x.document, x.seat, x.provider]), [['spec', 'writer', 'native'], ['spec', 'judge', 'native'], ['plan', 'writer', 'native'], ['plan', 'judge', 'native'], ['exam', 'examiner', 'off']])
  assert.equal(opsCalls(run, 'check').length, 1)
})

test('the native agents carry the model and effort of their definitions, the Writer at high (R11), and the schemas of the lib', async () => {
  const run = await go(ARGS, { ops: waitFor('examiner', () => ({ done: true, exitCode: 3, value: nativeSeat('examiner') })) })
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

test('an external answer is the verdict as it is, the option travels in flags, and no native Judge runs', async () => {
  const lane = '- Lane: agy gemini-4-argon-high, seat judge-20261015-120002-ab12; 9 tokens, $? at list price; Gemini Models used 0.0 % of the 5 h window and 0.0 % of the weekly one'
  const answer = `## Verdict\napprove\n## Findings\nnone\n## Open questions\n- none\n${lane}`
  const external = waitFor('judge', (call) => ({ done: true, exitCode: 0, value: { seat: 'judge', id: call.command.rest[0], harness: 'agy', model: 'gemini-4-argon', answer, result: APPROVE, lane } }))
  const run = await go({ ...ARGS, seats: 'balanced', lanes: 'on' }, { ops: external })
  assert.equal(run.result.status, 'approved')
  assert.equal(run.calls.filter((c) => c.role === 'judge').length, 0)
  assert.deepEqual(run.result.verdicts.map((v) => [v.seat, v.text]), [['agy gemini-4-argon', answer], ['agy gemini-4-argon', answer]])
  assert.equal(run.result.rounds.find((x) => x.document === 'spec' && x.seat === 'judge').lane, lane)
  const start = startOf(run, 'judge')
  assert.deepEqual(['--session', '--author', '--feature', '--seats', '--lanes', '--harnesses'].map((f) => flag(start, f)), ['sess-1', 'sonnet', FEATURE, 'balanced', 'on', 'agy'])
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

test('a round that does not finish is waited for in steps of 540 s, at most 12, then stopped and handed to the native agent', async () => {
  const run = await go(ARGS, { ops: waitFor('judge', () => ({ done: false })) })
  const waits = opsCalls(run, 'seat-wait').filter((c) => c.command.rest[0].startsWith('judge'))
  assert.equal(waits.length, 24)
  for (const w of waits) assert.deepEqual(w.command.rest.slice(1), ['--max', '540'])
  assert.ok(waits[0].prompt.startsWith("Run this command with the Bash tool, once, exactly as written, with the Bash tool's timeout set to 600000:"))
  assert.equal(opsCalls(run, 'seat-stop').length, 2)
  assert.equal(run.calls.filter((c) => c.role === 'judge').length, 2)
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
  const run = await go({ ...ARGS, seats: 'robust', lanes: 'on' }, { ops })
  assert.equal(run.result.status, 'approved')
  const judges = opsCalls(run, 'seat-start').filter((c) => c.command.rest[0] === 'judge')
  assert.deepEqual(judges.map((c) => flag(c, '--author')), ['sonnet', 'gemini-4-argon'])
  assert.equal(flag(startOf(run, 'examiner'), '--author'), 'gemini-4-argon')
  const planJudge = judges[1].payload.text
  assert.ok(planJudge.includes('aether-plan check printed:') && planJudge.includes('R3 has no task that serves it.'))
})

test('the messages carry what each seat needs, and the scope instruction', async () => {
  const run = await go(ARGS, { ops: waitFor('examiner', () => ({ done: true, exitCode: 3, value: nativeSeat('examiner') })) })
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

test('a short design runs only the Judge, with the Writer to correct it, and the author of the Lead', async () => {
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
  assert.equal(startOf(revised, 'writer'), undefined, 'the Writer of a short design is the native one, with no seat round')
  assert.equal(revised.result.status, 'approved')
})

test('a short design on plan.md runs only the Judge, the Writer revises, and the changed plan gets a new exam when the Examiner runs (later changes)', async () => {
  const PLAN = { ...SHORT, document: `${FEATURE}/plan.md` }
  const examiner = waitFor('examiner', () => ({ done: true, exitCode: 3, value: nativeSeat('examiner') }))
  let n = 0
  const revise = (call, fallback) => (++n === 1 ? { verdict: 'revise', findings: [finding('gap')], openQuestions: [] } : fallback(call))
  const run = await go(PLAN, { ops: examiner, judge: revise })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved')
  assert.deepEqual(nativeCalls(run).map((c) => c.label), ['plan: judge review 1', 'plan: writer revision 1', 'plan: judge review 2', 'exam: examiner'])
  assert.deepEqual(run.calls.find((c) => c.label === 'plan: writer revision 1').schema, schemas.REVISION_SCHEMA)
  assert.equal(startOf(run, 'writer'), undefined)
  assert.equal(opsCalls(run, 'check').length, 2, 'before the first review and after the revision')
  assert.deepEqual(run.result.verdicts.map((v) => [v.document, v.round]), [['plan', 1], ['plan', 2]])
  assert.deepEqual(run.result.exam, { status: 'stored', dir: '/data/exams/007-demo' })
  assert.deepEqual((await go(PLAN)).result.exam, { status: 'off' }, 'the native choice runs no Examiner')
  const spec = await go({ ...SHORT, document: `${FEATURE}/spec.md` })
  assert.equal(spec.result.status, 'approved')
  assert.equal(opsCalls(spec, 'check').length, 0)
  assert.equal('exam' in spec.result, false)
})

test('every ops prompt is one the mod runs without a model, and every payload goes where the mod saves it', async () => {
  const run = await go({ ...ARGS, seats: 'balanced', lanes: 'on', harnesses: 'agy,codex' }, { ops: waitFor('examiner', () => ({ done: true, exitCode: 3, value: nativeSeat('examiner') })) })
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
  const run = await go({ ...ARGS, seats: 'balanced', lanes: 'on' }, { ops, writer, judge })
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
  for (const change of [{ feature: 'docs/x' }, { session: 'a b' }, { repoRoot: 'repo' }, { seats: 'all' }, { lanes: 'maybe' }, { harnesses: 'AGY' }, { mode: 'short' }, { mode: 'short', document: `${FEATURE}/other.md`, intent: 'i' }]) {
    assert.match(await bad(change), /^aether:design args are missing or invalid: /, JSON.stringify(change))
  }
})
