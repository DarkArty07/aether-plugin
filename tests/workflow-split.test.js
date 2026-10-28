'use strict'

// Issue 14: an attempt that ended without its report is retried as a split pass, one sub-attempt per owned file.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow, laneAnswer, laneOf } = require('./workflow-harness.js')

const FILES = ['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js']
const LANES = { superdelegation: true, harnesses: ['agy'], waits: { implementer: 3, supervisor: 2, reviewer: 2 } }
const FLASH = { id: 'agy/gemini-3.8-flash@high', harness: 'agy', model: 'gemini-3.8-flash', family: 'gemini-3.8-flash', effort: 'high', group: null, intelligence: 40, costPerTaskUsd: 1 }

const owns = (files) => files.map((file) => `\`${file}\``).join(', ')
const attemptsOf = (run, unit) => run.calls.filter((c) => c.role === 'implementer' && c.unit === unit)
const limitOf = (prompt) => {
  const match = prompt.match(/Your task is limited to `([^`]+)`: work only on it, commit it, and report\./)
  return match ? match[1] : null
}
const reportFor = (file, extra = {}) => ({
  status: 'DONE',
  summary: `Implemented ${file}.`,
  head: `head-${file}`,
  tests: `${file} pass`,
  concerns: '',
  question: '',
  ...extra,
})

function runOf(t, owned, { maxAgents = null, lanes = null } = {}) {
  const args = compile(makeRepo(t), plan([task(1, { owns: owned, tier: 'haiku xhigh — complete code' })]))
  if (maxAgents !== null) args.maxAgents = maxAgents
  if (lanes) args.lanes = lanes
  return args
}

// The first attempt of task-1 ends without a report. Later attempts answer from `later(call)`.
function afterNoReport(later) {
  return (call, done) => (call.unit === 'task-1' && call.n === 1 ? null : later(call, done))
}

const finished = (call, fields) => laneAnswer({ lane: laneOf(call.started), ...fields })

test('a unit of four owned files is retried as four sub-attempts, and the supervisor gets one combined report', async (t) => {
  const args = runOf(t, owns(FILES))
  const run = await runWorkflow(args, {
    implementer: afterNoReport((call) => reportFor(limitOf(call.prompt))),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[0]
  const prompts = attemptsOf(run, 'task-1').map((call) => call.prompt)
  assert.equal(unit.attempts, 2)
  assert.deepEqual(unit.tiers, ['haiku high', 'haiku xhigh'])
  assert.equal(prompts.length, 5)
  assert.equal(limitOf(prompts[0]), null)
  assert.deepEqual(prompts.slice(1).map(limitOf), FILES)
  for (const prompt of prompts.slice(1)) assert.match(prompt, /work only on it, commit it, and report/)
  assert.equal(run.calls.filter((call) => call.role === 'supervisor' && call.unit === 'task-1').length, 1)
  const supervise = run.calls.find((call) => call.role === 'supervisor' && call.unit === 'task-1')
  assert.match(supervise.prompt, /status: DONE/)
  assert.match(supervise.prompt, /head: head-src\/d\.js/)
  for (const file of FILES) assert.match(supervise.prompt, new RegExp(`\\[${file.replace('/', '\\/')}\\] Implemented ${file.replace('/', '\\/')}`))
  assert.equal(unit.status, 'merged')
  assert.equal(unit.rounds[1].split, true)
  assert.equal(unit.rounds[1].subAttempts, 4)
  assert.equal(unit.rounds[1].status, 'DONE')
  assert.equal(unit.rounds[1].head, 'head-src/d.js')
})

test('a unit with one owned file is retried whole', async (t) => {
  const args = runOf(t, '`src/only.js`')
  const run = await runWorkflow(args, {
    implementer: afterNoReport((call, done) => done(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const prompts = attemptsOf(run, 'task-1').map((call) => call.prompt)
  assert.equal(prompts.length, 2)
  assert.equal(limitOf(prompts[1]), null)
  assert.match(prompts[1], /one at a time/)
  assert.equal(run.result.units[0].attempts, 2)
  assert.equal(run.result.units[0].rounds[1].split, undefined)
})

test('a glob that matches nothing yet stays one item, so the retry is not split', async (t) => {
  const args = runOf(t, '`src/t1/**`')
  const run = await runWorkflow(args, {
    implementer: afterNoReport((call, done) => done(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(attemptsOf(run, 'task-1').length, 2)
  assert.equal(limitOf(attemptsOf(run, 'task-1')[1].prompt), null)
})

test('a glob that matches several tracked files becomes one sub-attempt per file', async (t) => {
  const args = runOf(t, '`src/t1/*.js`')
  const listed = ['src/t1/a.js', 'src/other.js', 'src/t1/b.js']
  const run = await runWorkflow(args, {
    implementer: afterNoReport((call) => reportFor(limitOf(call.prompt))),
    ops: (call, wt) => (call.kind === 'ops:ls-files' ? { files: listed } : wt(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(attemptsOf(run, 'task-1').slice(1).map((call) => limitOf(call.prompt)), ['src/t1/a.js', 'src/t1/b.js'])
  assert.match(run.calls.find((call) => call.kind === 'ops:ls-files').prompt, new RegExp(`git -C '${args.repoRoot}/\\.aether/worktrees/${args.runId}/task-1' ls-files`))
})

test('more than eight owned files share the last sub-attempt', async (t) => {
  const files = Array.from({ length: 10 }, (_, i) => `src/f${i + 1}.js`)
  const args = runOf(t, owns(files))
  const run = await runWorkflow(args, {
    implementer: afterNoReport((call) => reportFor(limitOf(call.prompt) || 'group')),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const limits = attemptsOf(run, 'task-1').slice(1).map((call) => limitOf(call.prompt))
  assert.equal(limits.length, 8)
  assert.deepEqual(limits.slice(0, 7), files.slice(0, 7))
  assert.equal(limits[7], files.slice(7).join(', '))
  assert.equal(run.result.units[0].rounds[1].subAttempts, 8)
  assert.equal(run.result.units[0].attempts, 2)
})

test('the combined report uses the worst status, and labels each item', async (t) => {
  const files = ['src/a.js', 'src/b.js', 'src/c.js']
  const byFile = {
    'src/a.js': reportFor('src/a.js', { head: 'head-a' }),
    'src/b.js': reportFor('src/b.js', { status: 'BLOCKED', summary: 'Stopped on the API.', head: 'head-b', question: 'Which API?' }),
    'src/c.js': reportFor('src/c.js', { status: 'DONE_WITH_CONCERNS', summary: 'Left a corner.', head: 'head-c', concerns: 'Thin tests.' }),
  }
  const args = runOf(t, owns(files))
  const run = await runWorkflow(args, {
    implementer: afterNoReport((call) => byFile[limitOf(call.prompt)]),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const round = run.result.units[0].rounds[1]
  assert.equal(round.status, 'BLOCKED')
  assert.equal(round.head, 'head-c')
  assert.match(round.summary, /\[src\/a\.js\] Implemented src\/a\.js/)
  assert.match(round.summary, /\[src\/b\.js\] Stopped on the API/)
  assert.match(round.concerns, /\[src\/c\.js\] Thin tests/)
  assert.match(round.question, /\[src\/b\.js\] Which API\?/)
  assert.match(round.tests, /src\/a\.js pass/)
  assert.match(round.tests, /src\/c\.js pass/)
  const supervise = run.calls.find((call) => call.role === 'supervisor' && call.unit === 'task-1')
  assert.match(supervise.prompt, /status: BLOCKED/)
  assert.match(supervise.prompt, /Which API\?/)
})

test('a sub-attempt that ends without a report counts the pass as a missing report, and two such passes block the unit', async (t) => {
  const args = runOf(t, owns(FILES))
  const run = await runWorkflow(args, {
    implementer: (call, done) => {
      if (call.unit !== 'task-1') return done(call)
      if (call.n === 1) return null
      if (limitOf(call.prompt) === 'src/a.js') return reportFor('src/a.js')
      return null
    },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[0]
  const prompts = attemptsOf(run, 'task-1').map((call) => limitOf(call.prompt))
  assert.deepEqual(prompts.slice(0, 3), [null, 'src/a.js', 'src/b.js'])
  assert.deepEqual(unit.failures, Array(unit.attempts).fill('no report'))
  assert.equal(unit.attempts, 6)
  assert.deepEqual([unit.status, unit.reason], ['blocked', 'the ladder is spent (exhausted)'])
  assert.equal(run.calls.some((call) => call.role === 'supervisor' && call.unit === 'task-1'), false)
  assert.equal(unit.rounds[1].split, true)
  assert.equal(unit.rounds[1].subAttempts, 2)
  assert.equal(unit.rounds[1].status, 'FAILED')
})

test('a split pass stops when the agent budget is spent', async (t) => {
  const args = runOf(t, owns(FILES), { maxAgents: 3 })
  const run = await runWorkflow(args, {
    implementer: afterNoReport((call) => reportFor(limitOf(call.prompt))),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[0]
  assert.deepEqual([unit.status, unit.reason], ['not-run', 'the agent budget is spent'])
  assert.deepEqual(attemptsOf(run, 'task-1').map((call) => limitOf(call.prompt)), [null, 'src/a.js', 'src/b.js'])
  assert.equal(run.calls.some((call) => call.role === 'supervisor' && call.unit === 'task-1'), false)
  assert.equal(run.calls.some((call) => call.role === 'reviewer'), false)
  assert.equal(unit.rounds[1].split, true)
  assert.equal(unit.rounds[1].subAttempts, 2)
  assert.equal(run.result.agents.total - run.result.agents.byRole.ops, 3)
})

test('with lanes, one pair is picked for the pass and every sub-attempt uses it', async (t) => {
  const args = runOf(t, owns(FILES), { lanes: LANES })
  let implementPicks = 0
  let lastPrompt = ''
  const run = await runWorkflow(args, {
    implementer: afterNoReport((call, done) => done(call)),
    lane: (call, fallback) => {
      if (call.command.verb === 'pick' && call.lane.role === 'implementer') {
        implementPicks += 1
        const decision = fallback(call)
        if (implementPicks === 1) return decision
        return { ...decision, picked: FLASH, reason: `took ${FLASH.id}` }
      }
      if (call.command.verb === 'start' && call.lane.role === 'implementer') lastPrompt = call.payload.text
      if (call.command.verb === 'wait' && call.started && call.started.role === 'implementer') {
        return finished(call, { result: reportFor(limitOf(lastPrompt)) })
      }
      return fallback(call)
    },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const starts = run.calls.filter((call) => call.kind === 'ops:lane-start' && call.lane.role === 'implementer')
  assert.equal(implementPicks, 2)
  assert.equal(starts.length, 4)
  assert.deepEqual(starts.map((call) => call.lane.model), [FLASH.model, FLASH.model, FLASH.model, FLASH.model])
  assert.deepEqual(starts.map((call) => call.lane.call), ['task-1-2-implement', 'task-1-2-implement', 'task-1-2-implement', 'task-1-2-implement'])
  assert.deepEqual(starts.map((call) => limitOf(call.payload.text)), FILES)
  assert.equal(run.calls.filter((call) => call.kind === 'ops:lane-pick' && call.lane.role === 'implementer').length, 2)
  assert.equal(run.result.units[0].rounds[1].split, true)
  assert.equal(run.result.units[0].rounds[1].subAttempts, 4)
  assert.equal(run.result.units[0].status, 'merged')
  const supervise = run.calls.find((call) => call.role === 'supervisor' && call.unit === 'task-1')
  assert.match(supervise.prompt, /status: DONE/)
  for (const file of FILES) assert.match(supervise.prompt, new RegExp(`Implemented ${file.replace('/', '\\/')}`))
})

test('a pair that fails during a split pass ends it, and the next attempt leaves that pair out', async (t) => {
  const args = runOf(t, owns(FILES), { lanes: LANES })
  let implementPicks = 0
  let implementWaits = 0
  const run = await runWorkflow(args, {
    implementer: (call, done) => (call.unit === 'task-1' && call.n === 1 ? null : done(call)),
    lane: (call, fallback) => {
      if (call.command.verb === 'pick' && call.lane.role === 'implementer') {
        implementPicks += 1
        const decision = fallback(call)
        if (implementPicks === 1) return decision
        return { ...decision, picked: FLASH, reason: `took ${FLASH.id}` }
      }
      if (call.command.verb === 'wait' && call.started && call.started.role === 'implementer') {
        implementWaits += 1
        if (implementWaits === 2) return finished(call, { status: 'quota', detail: 'its quota ran out' })
        return finished(call, { result: reportFor('lane') })
      }
      return fallback(call)
    },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[0]
  const starts = run.calls.filter((call) => call.kind === 'ops:lane-start' && call.lane.role === 'implementer')
  assert.equal(starts.length, 2)
  assert.deepEqual(starts.map((call) => limitOf(call.payload.text)), ['src/a.js', 'src/b.js'])
  assert.equal(unit.attempts, 3)
  assert.equal(unit.rounds[1].split, true)
  assert.equal(unit.rounds[1].subAttempts, 2)
  assert.equal(unit.rounds[1].status, 'FAILED')
  assert.match(unit.rounds[1].summary, /quota/)
  const picks = run.calls.filter((call) => call.kind === 'ops:lane-pick' && call.lane.role === 'implementer')
  assert.equal(picks.length, 3)
  assert.equal(picks[2].lane.exclude, FLASH.id)
  // The pass a pair failure ended is split again. The excluded pair is not taken, so the
  // sub-attempts run native, one per owned file.
  const native = attemptsOf(run, 'task-1')
  assert.equal(limitOf(native[0].prompt), null)
  assert.deepEqual(native.slice(1).map((call) => limitOf(call.prompt)), FILES)
  assert.equal(unit.rounds[2].split, true)
  assert.equal(unit.rounds[2].subAttempts, FILES.length)
  assert.equal(unit.status, 'merged')
})

test('a violation during a split pass is retried whole, not as another split', async (t) => {
  const args = runOf(t, owns(FILES), { lanes: LANES })
  let implementPicks = 0
  let implementWaits = 0
  const run = await runWorkflow(args, {
    implementer: (call, done) => (call.unit === 'task-1' && call.n === 1 ? null : done(call)),
    lane: (call, fallback) => {
      if (call.command.verb === 'pick' && call.lane.role === 'implementer') {
        implementPicks += 1
        const decision = fallback(call)
        if (implementPicks === 1) return decision
        return { ...decision, picked: FLASH, reason: `took ${FLASH.id}` }
      }
      if (call.command.verb === 'wait' && call.started && call.started.role === 'implementer') {
        implementWaits += 1
        if (implementWaits === 2) return finished(call, { status: 'violation', detail: 'changes outside Owns', files: ['README.md'] })
        return finished(call, { result: reportFor('lane') })
      }
      return fallback(call)
    },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[0]
  assert.equal(unit.rounds[1].split, true)
  assert.match(unit.rounds[1].summary, /outside the task's Owns/)
  const prompts = attemptsOf(run, 'task-1').map((call) => call.prompt)
  assert.equal(limitOf(prompts[prompts.length - 1]), null)
  assert.equal(unit.rounds.at(-1).split, undefined)
  assert.equal(unit.status, 'merged')
})

test('changes outside Owns are retried whole, not as a split pass', async (t) => {
  const args = runOf(t, owns(FILES), { lanes: LANES })
  const run = await runWorkflow(args, {
    lane: (call, fallback) => {
      if (call.command.verb === 'pick' && call.lane.role === 'implementer') {
        const decision = fallback(call)
        return { ...decision, picked: FLASH, reason: `took ${FLASH.id}` }
      }
      if (call.command.verb === 'wait' && call.lane.call === 'task-1-1-implement') {
        return finished(call, { status: 'violation', detail: 'changes outside Owns', files: ['README.md'] })
      }
      return fallback(call)
    },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const prompts = [
    ...run.calls.filter((call) => call.kind === 'ops:lane-start' && call.lane.role === 'implementer').map((call) => call.payload.text),
    ...attemptsOf(run, 'task-1').map((call) => call.prompt),
  ]
  assert.equal(prompts.length, 2)
  assert.equal(prompts.every((prompt) => limitOf(prompt) === null), true)
  assert.equal(run.result.units[0].attempts, 2)
  assert.equal(run.result.units[0].rounds[1].split, undefined)
})

test('the guide and the swarm skill say a missing report is retried as a split pass', () => {
  const root = path.join(__dirname, '..')
  const files = [
    'docs/guide/troubleshooting.md',
    'docs/guide/lanes.md',
    'docs/reference/components.md',
    'plugins/aether/skills/swarm/SKILL.md',
  ]
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8')
    assert.match(text, /split pass/, file)
    assert.match(text, /sub-attempt/, file)
  }
})
