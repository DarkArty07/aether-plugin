'use strict'

// The skills step of `/aether:design` (spec 045, R22-R25): after the spec is
// approved and before the plan map, the flow searches downloaded skills, has
// the skill-reviewer review at most one per topic and three per design, and
// installs what it approves. Fail closed: no review answer, an invalid one or
// a failed call discards the candidate.

const test = require('node:test')
const assert = require('node:assert/strict')
const { runWorkflow } = require('./workflow-harness.js')

const FEATURE = 'specs/007-demo'
const ARGS = { feature: FEATURE, session: 'sess-1', repoRoot: '/repo', superdelegation: 'off', harnesses: 'agy' }
const SHORT = { ...ARGS, mode: 'short', document: `${FEATURE}/design.md`, intent: 'Understanding: add a retry. Owner: «hazlo robusto»', author: 'opus' }
const ROLES = ['writer', 'judge', 'examiner', 'mapper', 'skill-reviewer', 'ops']

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

const FIND = (candidates, extra = {}) => ({ ok: true, topics: ['godot', 'containers'], candidates, rejected: [], pending: [], errors: [], ...extra })
const godot = { id: 'godot-helper-1a2b', topic: 'godot', name: 'godot-helper', source: 'vercel-labs/agent-skills', author: 'vercel-labs', hash: 'h1', dir: '/data/skills/review/godot-helper-1a2b', code: { ok: true } }
const docker = { id: 'dockerfile-3c4d', topic: 'containers', name: 'dockerfile', source: 'anthropics/skills', author: 'anthropics', hash: 'h2', dir: '/data/skills/review/dockerfile-3c4d', code: { ok: true } }
const skillsOps = (find) => (call, fallback) => {
  if (call.command.verb !== 'skills') return fallback(call)
  const what = call.command.rest[0]
  const id = call.command.rest.at(-1) // `install <feature> <id>` and `discard <id>` both end with the id; `find <feature>` ends with the folder, unused
  if (what === 'find') return find
  if (what === 'install') return { ok: true, name: id.replace(/-[0-9a-f]{4}$/, ''), hash: 'h1', path: `/repo/.agents/skills/${id}`, committed: false }
  return { ok: true }
}
const reviewByName = (verdicts) => (call) => verdicts[call.label.replace('skills: review ', '')]

function handlers() {
  return {
    writer: (call) => {
      if (call.label.startsWith('spec:')) return SPEC_ANSWER
      if (call.label.startsWith('plan: writer tasks')) return { tasks: `${FEATURE}/tasks.md`, commit: 'c3', check: '{"ok":true}', assumptions: [], questions: [] }
      return { plan: `${FEATURE}/plan.md`, commit: 'c2', complexity: PLAN_ANSWER.complexity, assumptions: [], questions: [] }
    },
    judge: () => APPROVE,
    examiner: () => EXAM,
    ops: (call) => {
      const { verb, rest } = call.command
      if (verb === 'check') return CHECK_OK
      if (verb === 'requirements') return { requirements: 8, threshold: 15, map: false }
      if (verb === 'skills' && rest[0] === 'find') return { ok: true, topics: [], candidates: [], rejected: [], pending: [], errors: [] }
      if (verb === 'store') return { stored: '/data/exams/007-demo' }
      throw new Error(`unexpected ops command: ${call.command.line}`)
    },
  }
}
const go = (args, overrides = {}) => runWorkflow(JSON.stringify(args), overrides, { script: 'design.workflow.js', roles: ROLES, commandOf, defaults: handlers })

test('R22/R23: find runs after the spec is approved and before requirements; an approved candidate is installed, a rejected one is discarded', async () => {
  const run = await go(ARGS, {
    ops: skillsOps(FIND([godot, docker], { pending: [{ source: 'someone/else', author: 'someone' }] })),
    'skill-reviewer': reviewByName({ 'godot-helper': { verdict: 'approved', reasons: [] }, dockerfile: { verdict: 'rejected', reasons: ['a script calls curl | sh'] } }),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const lines = run.calls.filter((c) => c.command).map((c) => c.command.line)
  assert.ok(lines.indexOf(`aether-plan skills find ${FEATURE}`) !== -1)
  assert.ok(lines.indexOf(`aether-plan skills find ${FEATURE}`) < lines.indexOf(`aether-plan requirements ${FEATURE}/spec.md`))
  assert.ok(lines.includes(`aether-plan skills install ${FEATURE} godot-helper-1a2b`))
  assert.ok(lines.includes('aether-plan skills discard dockerfile-3c4d'))
  assert.equal(lines.includes(`aether-plan skills install ${FEATURE} dockerfile-3c4d`), false)
  assert.deepEqual(run.result.skills.installed.map((s) => s.name), ['godot-helper'])
  assert.deepEqual(run.result.skills.rejected.map((s) => s.name), ['dockerfile'])
  assert.deepEqual(run.result.skills.pending, [{ source: 'someone/else', author: 'someone' }])
  assert.equal(run.result.status, 'approved')
})

test('R23: the installed skill is reported on a design that ends failed or in dispute after the step', async () => {
  const reviewed = { 'godot-helper': { verdict: 'approved', reasons: [] }, dockerfile: { verdict: 'rejected', reasons: ['a script calls curl | sh'] } }
  const failing = (call, fallback) => {
    if (call.command.verb === 'check') return { ok: false, errors: ['x'] }
    return skillsOps(FIND([godot, docker]))(call, fallback)
  }
  const failed = await go(ARGS, { ops: failing, 'skill-reviewer': reviewByName(reviewed) })
  assert.equal(failed.error, null, failed.error && failed.error.stack)
  assert.deepEqual([failed.result.status, failed.result.step], ['failed', 'plan-check'])
  assert.deepEqual(failed.result.skills.installed.map((s) => s.name), ['godot-helper'])
  const reject = { verdict: 'reject', findings: [{ severity: 'major', type: 'wrong', title: 'the approach is wrong', evidence: '`R1`', fix: 'fix it' }], openQuestions: [] }
  const dispute = await go(ARGS, {
    ops: skillsOps(FIND([godot, docker])),
    'skill-reviewer': reviewByName(reviewed),
    judge: (call, fallback) => (call.label.startsWith('plan:') ? reject : fallback(call)),
  })
  assert.equal(dispute.error, null, dispute.error && dispute.error.stack)
  assert.equal(dispute.result.status, 'dispute')
  assert.deepEqual(dispute.result.skills.installed.map((s) => s.name), ['godot-helper'])
  const clarify = await go(ARGS, {
    ops: skillsOps(FIND([godot, docker])),
    'skill-reviewer': reviewByName(reviewed),
    writer: (call, fallback) => (call.label === 'spec: writer write' ? { ...SPEC_ANSWER, clarify: ['[NEEDS CLARIFICATION: Which database?]'] } : fallback(call)),
  })
  assert.deepEqual([clarify.result.status, Object.hasOwn(clarify.result, 'skills')], ['clarify', false])
  const specDispute = await go(ARGS, {
    ops: skillsOps(FIND([godot, docker])),
    'skill-reviewer': reviewByName(reviewed),
    judge: () => reject,
  })
  assert.deepEqual([specDispute.result.status, Object.hasOwn(specDispute.result, 'skills')], ['dispute', false])
  const specFailed = await go(ARGS, {
    ops: skillsOps(FIND([godot, docker])),
    'skill-reviewer': reviewByName(reviewed),
    writer: () => null,
  })
  assert.deepEqual([specFailed.result.status, specFailed.result.step, Object.hasOwn(specFailed.result, 'skills')], ['failed', 'spec-writer', false])
})

test('R23: a reviewer that ends without an answer, answers something invalid or throws rejects the skill (fail closed)', async () => {
  for (const verdict of [() => null, () => ({ verdict: 'maybe', reasons: [] }), () => { throw new Error('boom') }]) {
    const run = await go(ARGS, { ops: skillsOps(FIND([godot])), 'skill-reviewer': verdict })
    assert.equal(run.error, null, run.error && run.error.stack)
    const lines = run.calls.filter((c) => c.command).map((c) => c.command.line)
    assert.equal(lines.includes(`aether-plan skills install ${FEATURE} godot-helper-1a2b`), false)
    assert.ok(lines.includes('aether-plan skills discard godot-helper-1a2b'))
    assert.deepEqual(run.result.skills.rejected.map((s) => s.name), ['godot-helper'])
    assert.deepEqual(run.result.skills.installed, [])
  }
})

test('R25: find that does not run, answers ok:false or has errors is logged and the design still completes spec, plan, tasks and exam', async () => {
  for (const find of [{ error: 'no network' }, { ok: false, errors: ['boom'] }, FIND([], { errors: ['timeout'] })]) {
    const run = await go(ARGS, { ops: skillsOps(find) })
    assert.equal(run.error, null, run.error && run.error.stack)
    assert.equal(run.result.status, 'approved')
    assert.deepEqual(run.result.skills, { installed: [], rejected: [], pending: [] })
    assert.ok(run.logs.some((line) => line.startsWith('skills: ') && line.includes('; the design goes on')), run.logs.join('\n'))
  }
})

test('R22: a short design never runs the skills step', async () => {
  const run = await go(SHORT)
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.calls.filter((c) => c.command && c.command.verb === 'skills').length, 0)
  assert.equal(Object.hasOwn(run.result, 'skills'), false)
})

test('R23: the step asks for at most 3 reviews and installs', async () => {
  const five = ['a', 'b', 'c', 'd', 'e'].map((topic) => ({ ...godot, id: `skill-${topic}-1a2b`, topic: `topic-${topic}`, name: `skill-${topic}`, dir: `/data/skills/review/skill-${topic}-1a2b` }))
  const run = await go(ARGS, {
    ops: skillsOps(FIND(five)),
    'skill-reviewer': () => ({ verdict: 'approved', reasons: [] }),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.ok(run.calls.filter((c) => c.role === 'skill-reviewer').length <= 3)
  assert.ok(run.calls.filter((c) => c.command && c.command.line.includes('aether-plan skills install')).length <= 3)
})
