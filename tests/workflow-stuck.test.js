'use strict'

// Spec 034: a stuck unit waits for the Lead's fix while the others go on; the fix merges by the usual rules.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

const OPS_MODULE = path.join(__dirname, '..', 'plugins', 'aether', 'hooks', 'ops-command.mjs')

// task-1 gets stuck (its implementer never answers, so its ladder is spent). task-2 is independent in its wave,
// task-3 depends on task-1, and task-4 is in a later wave and depends only on task-2.
function four(t) {
  return compile(makeRepo(t), plan([task(1), task(2), task(3, { depends: 'Task 1 — needs it' }), task(4, { depends: 'Task 2 — needs it' })]))
}
const stuckUnits = (...ids) => (call, implement) => (ids.includes(call.unit) ? null : implement(call))
const never = () => new Promise(() => {})
const reply = (seconds, extra = {}) => ({ exitCode: 0, stdout: `${JSON.stringify({ paused: seconds, state: 'waiting', stop: false, ...extra })}\n` })
// The script's clock for the wait of the stuck units: `answer(unit, n, seconds)` is the reply of the n-th tick of a unit.
function clock(answer) {
  const count = {}
  return async ({ label, seconds }) => {
    const found = /^(task-\d+): stuck wait \d+\/\d+$/.exec(label)
    if (!found) return never()
    const unit = found[1]
    count[unit] = (count[unit] || 0) + 1
    await new Promise((resolve) => setTimeout(resolve, 15))
    return answer(unit, count[unit], seconds)
  }
}
const byId = (run) => Object.fromEntries(run.result.units.map((u) => [u.id, u]))
const statuses = (run) => Object.values(byId(run)).map((u) => `${u.id} ${u.status}`)
const ticksOf = (run, unit) => run.ticks.filter((tick) => tick.label.startsWith(`${unit}: stuck wait`))
const endOf = (run, unit) => run.calls.find((c) => c.kind === 'ops:stuck-end' && c.unit === unit)

test('a stuck unit raises the alert, the others merge while it waits, and the Lead fix merges it and its dependents with one final review', async (t) => {
  const { parseOpsPrompt } = await import(OPS_MODULE)
  const order = []
  const run = await runWorkflow(four(t), {
    stuckWait: 3600,
    implementer: stuckUnits('task-1'),
    ops: (call, wt) => {
      if (call.kind === 'ops:merge') order.push(`merge ${call.unit}`)
      return wt(call)
    },
    deadline: clock((unit, n, seconds) => {
      if (!order.includes('merge task-2') || !order.includes('merge task-4')) return reply(seconds)
      order.push('fix delivered')
      return reply(seconds, { state: 'delivered', commit: 'fix1234', reason: 'moved the test into Owns' })
    }),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 merged', 'task-2 merged', 'task-3 merged', 'task-4 merged'])
  // The alert: the wait is recorded with the unit and its reason, and the progress view says so.
  const begin = run.calls.filter((c) => c.kind === 'ops:stuck')
  assert.equal(begin.length, 1)
  assert.equal(begin[0].unit, 'task-1')
  assert.deepEqual(JSON.parse(begin[0].payload.text), { reason: 'the ladder is spent (exhausted)' })
  assert.ok(run.logs.some((line) => /^task-1: stuck/.test(line) && /exhausted/.test(line)), run.logs.join('\n'))
  // The others went on while it waited: the independent unit of its wave and the one of the later wave merged first.
  const fix = order.indexOf('fix delivered')
  assert.ok(order.indexOf('merge task-2') < fix && order.indexOf('merge task-4') < fix, order.join(', '))
  assert.ok(fix < order.indexOf('merge task-1') && order.indexOf('merge task-1') < order.indexOf('merge task-3'), order.join(', '))
  // The fix is the unit's merge, not a rung of its ladder.
  const units = byId(run)
  // fixedByLead holds the commit the Lead delivered (R10); the merge commit is the unit's own.
  assert.deepEqual(units['task-1'].fixedByLead, { commit: 'fix1234', reason: 'moved the test into Owns' })
  assert.equal(units['task-1'].commit, 'merge-task-1')
  for (const id of ['task-2', 'task-3', 'task-4']) assert.equal(units[id].fixedByLead, undefined, id)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:ladder' && c.command.rest.includes('approve') && c.unit === 'task-1').length, 0)
  assert.deepEqual(endOf(run, 'task-1').command.rest, [run.result.runId, 'task-1', '--outcome', 'merged'])
  // One final review, after the fix merged, with the whole run in its package.
  assert.equal(run.logs.filter((line) => /^final review on /.test(line)).length, 1)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:diff').length, 1)
  assert.ok(run.events.indexOf('end ops:merge task-1') < run.events.indexOf('start ops:diff'))
  assert.equal(run.result.finalReview.status, 'done')
  // The pauses are not calls of the run, and the mod answers every command the wait sends.
  assert.equal(run.result.agents.total, run.calls.length)
  assert.ok(ticksOf(run, 'task-1').length >= 1)
  for (const tick of ticksOf(run, 'task-1')) assert.notEqual(parseOpsPrompt(tick.prompt), null, tick.prompt)
  for (const call of run.calls.filter((c) => /^ops:stuck/.test(c.kind))) assert.notEqual(parseOpsPrompt(call.prompt), null, call.prompt)
})

test('R6: a unit that waits does not hold the later waves: task-5 merges before the fix, then task-1 and task-3, with one final review', async (t) => {
  // Waves [[1,2],[3,4],[5]]: task-3 depends on the stuck task-1, task-5 on task-4, which depends on the free task-2.
  const args = compile(makeRepo(t), plan([task(1), task(2), task(3, { depends: 'Task 1 — needs it' }), task(4, { depends: 'Task 2 — needs it' }), task(5, { depends: 'Task 4 — needs it' })]))
  assert.deepEqual(args.waves, [['task-1', 'task-2'], ['task-3', 'task-4'], ['task-5']])
  const order = []
  const run = await runWorkflow(args, {
    stuckWait: 3600,
    implementer: stuckUnits('task-1'),
    ops: (call, wt) => {
      if (call.kind === 'ops:merge') order.push(`merge ${call.unit}`)
      return wt(call)
    },
    deadline: clock((unit, n, seconds) => {
      if (!order.includes('merge task-5')) return reply(seconds)
      order.push('fix delivered')
      return reply(seconds, { state: 'delivered', commit: 'fix1234', reason: 'moved the test into Owns' })
    }),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 merged', 'task-2 merged', 'task-3 merged', 'task-4 merged', 'task-5 merged'])
  // task-5 merged while task-1 was still waiting: the fix came only after it.
  const fix = order.indexOf('fix delivered')
  assert.ok(fix > order.indexOf('merge task-5'), order.join(', '))
  assert.ok(order.indexOf('merge task-2') < fix && order.indexOf('merge task-4') < fix, order.join(', '))
  // Then the fixed unit and its dependent, in that order.
  assert.ok(fix < order.indexOf('merge task-1') && order.indexOf('merge task-1') < order.indexOf('merge task-3'), order.join(', '))
  assert.equal(byId(run)['task-1'].fixedByLead.commit, 'fix1234')
  assert.equal(byId(run)['task-3'].fixedByLead, undefined)
  assert.equal(byId(run)['task-5'].fixedByLead, undefined)
  // One final review, after every detached body settled, covering the fix.
  assert.equal(run.logs.filter((line) => /^final review on /.test(line)).length, 1)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:diff').length, 1)
  assert.ok(run.events.indexOf('end ops:merge task-3') < run.events.indexOf('start ops:diff'))
  assert.equal(run.result.finalReview.status, 'done')
  assert.equal(run.result.agents.total, run.calls.length)
})

test('a stuck unit delivered with widen merges with the widened files, its dependents run, and fixedByLead carries widened (issue #258)', async (t) => {
  const order = []
  const run = await runWorkflow(four(t), {
    stuckWait: 3600,
    implementer: stuckUnits('task-1'),
    ops: (call, wt) => {
      if (call.kind === 'ops:merge') order.push(`merge ${call.unit}`)
      return wt(call)
    },
    deadline: clock((unit, n, seconds) => {
      if (unit !== 'task-1' || !order.includes('merge task-2') || !order.includes('merge task-4')) return reply(seconds)
      order.push('fix delivered')
      return reply(seconds, { state: 'delivered', commit: 'fix1234', reason: 'the test lives outside Owns', widen: ['tests/other.test.js'] })
    }),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 merged', 'task-2 merged', 'task-3 merged', 'task-4 merged'])
  const fix = order.indexOf('fix delivered')
  assert.ok(fix > order.indexOf('merge task-2') && fix > order.indexOf('merge task-4'), order.join(', '))
  assert.ok(fix < order.indexOf('merge task-1') && order.indexOf('merge task-1') < order.indexOf('merge task-3'), order.join(', '))
  assert.deepEqual(byId(run)['task-1'].fixedByLead, { commit: 'fix1234', reason: 'the test lives outside Owns', widened: ['tests/other.test.js'] })
  for (const id of ['task-2', 'task-3', 'task-4']) assert.equal(byId(run)[id].fixedByLead, undefined, id)
  assert.deepEqual(endOf(run, 'task-1').command.rest.at(-1), 'merged')
  assert.equal(run.logs.filter((line) => /^final review on /.test(line)).length, 1)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:diff').length, 1)
  assert.ok(run.events.indexOf('end ops:merge task-1') < run.events.indexOf('start ops:diff'))
  assert.equal(run.result.finalReview.status, 'done')
})

test('without a fix the wait ends by its time: the unit is blocked as today, its dependent is skipped, the others merged', async (t) => {
  const run = await runWorkflow(four(t), { stuckWait: 240, implementer: stuckUnits('task-1'), deadline: clock((unit, n, seconds) => reply(seconds)) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 blocked', 'task-2 merged', 'task-3 skipped', 'task-4 merged'])
  const unit = byId(run)['task-1']
  assert.equal(unit.reason, 'the ladder is spent (exhausted)')
  assert.equal(unit.fixedByLead, undefined)
  assert.deepEqual(ticksOf(run, 'task-1').map((tick) => tick.seconds), [120, 120])
  assert.equal(endOf(run, 'task-1').command.rest.at(-1), 'expired')
  assert.equal(run.result.finalReview.status, 'deferred')
  assert.equal(run.result.agents.total, run.calls.length)
})

test('the Lead who declines ends the wait at once; a second stuck unit keeps waiting and its fix merges', async (t) => {
  const args = compile(makeRepo(t), plan([task(1), task(2), task(3, { depends: 'Task 1 — a' }), task(4, { depends: 'Task 2 — b' })]))
  const run = await runWorkflow(args, {
    stuckWait: 3600,
    implementer: stuckUnits('task-1', 'task-2'),
    deadline: clock((unit, n, seconds) =>
      unit === 'task-1'
        ? reply(seconds, { state: 'declined', reason: 'the plan puts the test outside Owns' })
        : n < 3
          ? reply(seconds)
          : reply(seconds, { state: 'delivered', commit: 'abc1234', reason: 'fixed' }),
    ),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 blocked', 'task-2 merged', 'task-3 skipped', 'task-4 merged'])
  const declined = byId(run)['task-1']
  assert.ok(declined.reason.startsWith('the ladder is spent (exhausted)'), declined.reason)
  assert.ok(declined.reason.includes('the plan puts the test outside Owns'), declined.reason)
  assert.equal(ticksOf(run, 'task-1').length, 1, 'the wait ended at its first pause')
  assert.equal(endOf(run, 'task-1').command.rest.at(-1), 'declined')
  assert.equal(endOf(run, 'task-2').command.rest.at(-1), 'merged')
  assert.equal(run.calls.filter((c) => c.kind === 'ops:stuck').length, 2)
})

test('a fix the merge refuses leaves the unit blocked with that reason, and there is no second wait', async (t) => {
  const run = await runWorkflow(four(t), {
    stuckWait: 3600,
    implementer: stuckUnits('task-1'),
    ops: (call, wt) => (call.kind === 'ops:merge' && call.unit === 'task-1' ? { merged: false, reason: 'ownership', files: ['tests/other.test.js'], detail: '' } : wt(call)),
    deadline: clock((unit, n, seconds) => reply(seconds, { state: 'delivered', commit: 'bad1234', reason: 'tried' })),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 blocked', 'task-2 merged', 'task-3 skipped', 'task-4 merged'])
  const unit = byId(run)['task-1']
  assert.match(unit.reason, /^the ladder is spent \(exhausted\)/)
  assert.match(unit.reason, /The Lead's fix was refused: .*tests\/other\.test\.js/)
  assert.equal(unit.fixedByLead, undefined)
  assert.equal(ticksOf(run, 'task-1').length, 1)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:stuck').length, 1)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:merge' && c.unit === 'task-1').length, 1)
  assert.equal(endOf(run, 'task-1').command.rest.at(-1), 'rejected')
})

test('the time ceiling of an autonomous run ends the wait at once: the unit is blocked as today', async (t) => {
  const run = await runWorkflow(four(t), {
    stuckWait: 3600,
    implementer: stuckUnits('task-1'),
    deadline: clock((unit, n, seconds) => reply(seconds, { stop: true })),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 blocked', 'task-2 merged', 'task-3 skipped', 'task-4 merged'])
  assert.equal(byId(run)['task-1'].reason, 'the ladder is spent (exhausted)')
  assert.equal(ticksOf(run, 'task-1').length, 1)
  assert.equal(endOf(run, 'task-1').command.rest.at(-1), 'ceiling')
})

test('a pause that cannot run ends the wait with the unit blocked as today', async (t) => {
  const run = await runWorkflow(four(t), { stuckWait: 3600, implementer: stuckUnits('task-1'), deadline: () => ({ exitCode: 1, stdout: '{"error":"no"}\n' }) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 blocked', 'task-2 merged', 'task-3 skipped', 'task-4 merged'])
  assert.equal(endOf(run, 'task-1').command.rest.at(-1), 'expired')
})

test('a launch with no stuck unit changes nothing: no wait calls, no pauses, no new fields', async (t) => {
  const run = await runWorkflow(four(t), { stuckWait: 3600 })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 merged', 'task-2 merged', 'task-3 merged', 'task-4 merged'])
  assert.deepEqual(run.calls.filter((c) => /^ops:stuck/.test(c.kind)), [])
  assert.deepEqual(run.ticks, [])
  assert.deepEqual(Object.keys(run.result), ['runId', 'units', 'finalReview', 'cleanup', 'agents', 'abandoned', 'lanes', 'error'])
  assert.ok(run.result.units.every((u) => u.fixedByLead === undefined))
})

test('with the wait off (0) a blocked unit ends as today, with no wait calls', async (t) => {
  const run = await runWorkflow(four(t), { implementer: stuckUnits('task-1') })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(statuses(run), ['task-1 blocked', 'task-2 merged', 'task-3 skipped', 'task-4 merged'])
  assert.deepEqual(run.calls.filter((c) => /^ops:stuck/.test(c.kind)), [])
  assert.deepEqual(run.ticks, [])
})

test('a unit blocked by a question of its supervisor does not wait', async (t) => {
  const run = await runWorkflow(four(t), {
    stuckWait: 3600,
    supervisor: (call, approve) => (call.unit === 'task-1' ? { verdict: 'block', findings: [], ruling: 'Block: the plan contradicts itself.', guidance: '', question: 'Which of the two?' } : approve(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(byId(run)['task-1'].status, 'blocked')
  assert.equal(byId(run)['task-1'].question, 'Which of the two?')
  assert.deepEqual(run.calls.filter((c) => /^ops:stuck/.test(c.kind)), [])
})

test('a wait that is not a whole number of seconds from 0 is refused', async (t) => {
  const run = await runWorkflow(four(t), { stuckWait: -1 })
  assert.match(String(run.error && run.error.message), /stuckWaitSeconds/)
})

const linesMatching = (run, pattern) => run.logs.filter((line) => pattern.test(line))
const oneRung = (() => {
  const ladder = require('../plugins/aether/config/ladder.json')
  return { ...ladder, rungs: [ladder.rungs[0]] }
})()

test('#256 22: a stuck-end that answers state delivered merges the unit instead of expiring it', async (t) => {
  const run = await runWorkflow(four(t), {
    stuckWait: 120,
    implementer: stuckUnits('task-1'),
    ops: (call, wt) => {
      if (call.kind === 'ops:stuck-end' && call.command.rest.at(-1) === 'expired') {
        return { ended: false, task: 'task-1', state: 'delivered', commit: 'fix1234', reason: 'arrived between the tick and the end' }
      }
      return wt(call)
    },
    deadline: clock((unit, n, seconds) => reply(seconds)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(byId(run)['task-1'].status, 'merged')
  assert.deepEqual(byId(run)['task-1'].fixedByLead, { commit: 'fix1234', reason: 'arrived between the tick and the end' })
  const ends = run.calls.filter((c) => c.kind === 'ops:stuck-end' && c.unit === 'task-1').map((c) => c.command.rest.at(-1))
  assert.deepEqual(ends, ['expired', 'merged'])
  assert.equal(run.calls.filter((c) => c.kind === 'ops:merge' && c.unit === 'task-1').length, 1)
})

test('#256 23: a unit rescued through a fix is not a first try', async (t) => {
  // One rung: the spent ladder is an exhausted verdict, not a rise, so nothing else clears firstTry.
  const run = await runWorkflow(four(t), {
    stuckWait: 120,
    ladder: oneRung,
    implementer: stuckUnits('task-1'),
    deadline: clock((unit, n, seconds) => reply(seconds, { state: 'delivered', commit: 'fix1234', reason: 'moved the test into Owns' })),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = byId(run)['task-1']
  assert.equal(unit.status, 'merged')
  assert.equal(unit.fixedByLead.commit, 'fix1234')
  assert.deepEqual(unit.ladder.rises, { failed: 0, infeasible: 0 })
  assert.equal(unit.ladder.firstTry, false)
})

test('#256 24: a throw from the rescue merge still sends stuck-end and logs', async (t) => {
  // files is a string, so describeMerge's list() throws inside mergeHeld, before stuck-end.
  const run = await runWorkflow(four(t), {
    stuckWait: 120,
    implementer: stuckUnits('task-1'),
    ops: (call, wt) => (call.kind === 'ops:merge' && call.unit === 'task-1'
      ? { merged: false, reason: 'ownership', files: 'tests/other.test.js', detail: '' }
      : wt(call)),
    deadline: clock((unit, n, seconds) => reply(seconds, { state: 'delivered', commit: 'fix1234', reason: 'tried' })),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(byId(run)['task-1'].status, 'blocked')
  assert.equal(endOf(run, 'task-1').command.rest.at(-1), 'rejected')
  assert.equal(linesMatching(run, /task-1: the rescue failed:/).length, 1, run.logs.join('\n'))
})

test('#256 25: expiry, ceiling, declined and refused each add one owner-visible log line', async (t) => {
  const expired = await runWorkflow(four(t), {
    stuckWait: 120,
    implementer: stuckUnits('task-1'),
    deadline: clock((unit, n, seconds) => reply(seconds)),
  })
  assert.equal(expired.error, null, expired.error && expired.error.stack)
  assert.deepEqual(linesMatching(expired, /^task-1: the stuck wait expired$/), ['task-1: the stuck wait expired'])

  const ceiling = await runWorkflow(four(t), {
    stuckWait: 3600,
    implementer: stuckUnits('task-1'),
    deadline: clock((unit, n, seconds) => reply(seconds, { stop: true })),
  })
  assert.equal(ceiling.error, null, ceiling.error && ceiling.error.stack)
  assert.deepEqual(linesMatching(ceiling, /^task-1: the time ceiling ended the stuck wait$/), ['task-1: the time ceiling ended the stuck wait'])

  const declined = await runWorkflow(four(t), {
    stuckWait: 3600,
    implementer: stuckUnits('task-1'),
    deadline: clock((unit, n, seconds) => reply(seconds, { state: 'declined', reason: 'the plan puts the test outside Owns' })),
  })
  assert.equal(declined.error, null, declined.error && declined.error.stack)
  assert.deepEqual(linesMatching(declined, /^task-1: the Lead declined to fix it:/), ['task-1: the Lead declined to fix it: the plan puts the test outside Owns'])

  const refused = await runWorkflow(four(t), {
    stuckWait: 120,
    implementer: stuckUnits('task-1'),
    ops: (call, wt) => (call.kind === 'ops:merge' && call.unit === 'task-1' ? { merged: false, reason: 'ownership', files: ['tests/other.test.js'], detail: '' } : wt(call)),
    deadline: clock((unit, n, seconds) => reply(seconds, { state: 'delivered', commit: 'bad1234', reason: 'tried' })),
  })
  assert.equal(refused.error, null, refused.error && refused.error.stack)
  assert.equal(linesMatching(refused, /^task-1: the Lead's fix was refused:/).length, 1, refused.logs.join('\n'))
})

test('#256 26: a stuck wait with no clock still records its tick', async (t) => {
  const run = await runWorkflow(four(t), { stuckWait: 120, implementer: stuckUnits('task-1') })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(byId(run)['task-1'].status, 'blocked')
  assert.deepEqual(ticksOf(run, 'task-1').map((tick) => tick.seconds), [120])
  assert.equal(endOf(run, 'task-1').command.rest.at(-1), 'expired')
})
