'use strict'

// An ops agent that adds its own note around the bin's JSON line must not stall the swarm (issue #257).
// Both workflows read the last JSON object of the reply; a reply with no JSON line keeps the
// `unreadable output from` error.

const test = require('node:test')
const assert = require('node:assert/strict')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

// --- run workflow ------------------------------------------------------------

const build = (t) => compile(makeRepo(t), plan([task(1)]))
const unitOf = (run) => run.result.units.find((u) => u.id === 'task-1')

// The first ladder read of the unit comes back with the stdout the case names; `stdout` is either
// that text or a function of the bin's JSON line.
const ladderStdout = (stdout) => async (call, fallback) => {
  const out = await fallback(call)
  if (call.kind === 'ops:ladder' && call.n === 1 && out && !out.error) {
    return { raw: { exitCode: 0, stdout: typeof stdout === 'function' ? stdout(JSON.stringify(out)) : stdout } }
  }
  return out
}

test('run workflow: a trailing ops note after the JSON line still merges the unit (issue #257)', async (t) => {
  const run = await runWorkflow(build(t), {
    ops: ladderStdout((json) => `${json}\n(Note: the command output did not print an exit code)\n`),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(unitOf(run).status, 'merged', JSON.stringify(unitOf(run)))
  assert.doesNotMatch(JSON.stringify(unitOf(run)), /unreadable/)
})

test('run workflow: a leading ops note before the JSON line still merges the unit (issue #257)', async (t) => {
  const run = await runWorkflow(build(t), { ops: ladderStdout((json) => `Ran it.\n${json}`) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(unitOf(run).status, 'merged', JSON.stringify(unitOf(run)))
  assert.doesNotMatch(JSON.stringify(unitOf(run)), /unreadable/)
})

test('run workflow: a reply with no JSON line keeps the unreadable error (issue #257)', async (t) => {
  // The note matches NOT_RUN, so ops asks once more: every ladder read garbles, and the unit blocks
  // with the same did-not-run error as before the change.
  const garbled = async (call, fallback) => {
    const out = await fallback(call)
    if (call.kind === 'ops:ladder' && out && !out.error) return { raw: { exitCode: 0, stdout: 'I could not run that command.' } }
    return out
  }
  const run = await runWorkflow(build(t), { ops: garbled })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(unitOf(run).status, 'blocked', JSON.stringify(unitOf(run)))
  assert.match(String(unitOf(run).reason), /unreadable output from/)
})

// --- design workflow (harness of tests/workflow-design.test.js) --------------

const FEATURE = 'specs/007-demo'
const ARGS = { feature: FEATURE, session: 'sess-1', repoRoot: '/repo', superdelegation: 'off', harnesses: 'agy' }
const ROLES = ['writer', 'judge', 'examiner', 'ops']

const COMMAND = /^cd '[^']*' && (?:PATH='[^']*':"\$PATH" )?(aether-lane|aether-plan|aether-exam) ([a-z-]+)(.*)$/m
function commandOf(prompt) {
  const m = COMMAND.exec(prompt)
  return m ? { tool: m[1], verb: m[2], rest: m[3].trim().split(' ').filter(Boolean), line: `${m[1]} ${m[2]}${m[3]}` } : null
}

const SPEC_ANSWER = { spec: `${FEATURE}/spec.md`, commit: 'c1', clarify: [], assumptions: ['A1. a default'], proposals: ['P1. a proposal'], questions: [], disagreements: [] }
const PLAN_ANSWER = { plan: `${FEATURE}/plan.md`, tasks: `${FEATURE}/tasks.md`, commit: 'c2', check: '{"ok":true}', complexity: '| Violation | Why needed | Simpler alternative rejected because |', assumptions: [], questions: [], disagreements: [] }
const APPROVE = { verdict: 'approve', findings: [], openQuestions: [] }
const EXAM = { tests: [{ id: 'c1', criterion: 'C1', command: 'node --test .aether/exam/c1.test.js', files: ['c1.test.js'] }], notes: 'none' }
const CHECK_OK = { ok: true, tasks: 3, waves: [['task-1', 'task-2', 'task-3']], warnings: [] }

function handlers() {
  return {
    writer: (call) => (call.label.startsWith('spec:') ? SPEC_ANSWER : PLAN_ANSWER),
    judge: () => APPROVE,
    examiner: () => EXAM,
    ops: (call) => {
      const { verb, rest } = call.command
      if (verb === 'seat-start') return { started: true, id: `${rest[0]}-20261015-120000-ab12` }
      if (verb === 'seat-wait') return { done: true, exitCode: 3, value: { unavailable: 'no-external', seat: rest[0].split('-')[0] } }
      if (verb === 'seat-stop') return { stopped: true }
      if (verb === 'check') return CHECK_OK
      if (verb === 'store') return { stored: '/data/exams/007-demo' }
      throw new Error(`unexpected ops command: ${call.command.line}`)
    },
  }
}
const go = (args, overrides = {}) => runWorkflow(JSON.stringify(args), overrides, { script: 'design.workflow.js', roles: ROLES, commandOf, defaults: handlers })

// The `aether-plan check` read comes back with the stdout the case names. A garbled check is fatal:
// the plan cannot be approved without it, so the trailing note must still approve and the missing
// JSON must fail with the unreadable error.
const checkReads = (stdout) => {
  const base = handlers()
  return {
    ...base,
    ops: (call) => {
      const out = base.ops(call)
      if (call.command.verb === 'check') {
        return { raw: { exitCode: 0, stdout: typeof stdout === 'function' ? stdout(JSON.stringify(out)) : stdout } }
      }
      return out
    },
  }
}

test('design workflow: a trailing ops note after the JSON line still approves (issue #257)', async () => {
  const run = await go(ARGS, checkReads((json) => `${json}\nNote: the check passed with no errors.\n`))
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'approved', JSON.stringify(run.result))
})

test('design workflow: a check reply with no JSON line keeps the unreadable error (issue #257)', async () => {
  const run = await go(ARGS, checkReads('I could not run that command.'))
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.status, 'failed', JSON.stringify(run.result))
  assert.match(JSON.stringify(run.result), /unreadable output from/)
})

// --- edge cases through the run harness --------------------------------------

for (const [name, stdout, merged] of [
  ['text around the JSON line', (json) => `text\n${json}\nmore`, true],
  ['a brace line that is not JSON above the JSON line', (json) => `{bad\n${json}`, true],
  ['a JSON array is no object', '[1,2]', false],
  ['an empty reply is no object', '', false],
]) {
  test(`run workflow edge: ${name} (issue #257)`, async (t) => {
    const run = await runWorkflow(build(t), { ops: ladderStdout(stdout) })
    assert.equal(run.error, null, run.error && run.error.stack)
    if (merged) {
      assert.equal(unitOf(run).status, 'merged', JSON.stringify(unitOf(run)))
      assert.doesNotMatch(JSON.stringify(unitOf(run)), /unreadable/)
    } else {
      assert.notEqual(unitOf(run).status, 'merged', JSON.stringify(unitOf(run)))
      assert.match(JSON.stringify(unitOf(run)), /unreadable output from/)
    }
  })
}
