'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { tempDir } = require('./helpers.js')
const { loadLadder } = require('../plugins/aether/lib/ladder.js')
const delegates = require('../plugins/aether/lib/delegate-task.js')

const L = loadLadder()
const SESSION = 's1'
const world = (t, settings = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }) => {
  const dataDir = tempDir(t, 'aether-data-')
  const asked = []
  let n = 0
  return {
    asked,
    deps: { dataDir, cwd: dataDir, now: () => 1000 + (n += 1), settings, newId: () => `gen-${n}`, ladder: L, pickPair: async (reference) => (asked.push(reference), { pick: null, quota: [] }) },
  }
}
const call = (id, owns = null) => ({ session: SESSION, event: { subagent_type: 'general-purpose', description: 'd', prompt: `AETHER-TASK: ${id}\n${owns ? `AETHER-OWNS: ${owns}\n` : ''}Do the work.` } })
const ran = (plan) => `${plan.step} ${plan.args.model} ${plan.args.effort}`
const fixOf = (n) => `src/f${n}.js:${n}: missing case ${n}`
const judge = (id, verdict, extra = {}) => ({ task: id, verdict, session: SESSION, ...extra })

for (const [name, owns] of [['an editing delegate', 'src/a.js'], ['a read-only delegate', null]]) {
  test(`${name} climbs one rung per rejected attempt and is exhausted and deferred after the fifth`, async (t) => {
    const w = world(t)
    const id = owns ? 'e1' : 'r1'
    const seen = [ran(await delegates.begin(call(id, owns), w.deps))]
    for (let n = 1; n <= 5; n++) {
      const v = await delegates.verdict(judge(id, 'fix', { findings: [fixOf(n)] }), w.deps)
      assert.equal(v.ok, true, v.error)
      assert.equal('corrections' in v, false)
      if (n < 5) {
        assert.deepEqual([v.verdict, v.next.kind, v.next.cause], ['fix', 'rise', 'failed'])
        seen.push(ran(await delegates.begin(call(id, owns), w.deps)))
      } else {
        assert.equal(v.verdict, 'exhausted')
      }
    }
    assert.deepEqual(seen, ['haiku-high haiku high', 'haiku-xhigh haiku xhigh', 'sonnet-high sonnet high', 'opus-high opus high', 'opus-xhigh opus xhigh'])
    assert.match(JSON.stringify(await delegates.begin(call(id, owns), w.deps)), /is exhausted/)
  })
}

test('the same change outside Owns twice blocks the task on its rung; infeasible with a reason rises', async (t) => {
  const w = world(t)
  await delegates.begin(call('b1', 'src/a.js'), w.deps)
  const out = 'tests/x.test.js: changes outside Owns'
  assert.equal((await delegates.verdict(judge('b1', 'fix', { findings: [out] }), w.deps)).next.kind, 'rise')
  await delegates.begin(call('b1', 'src/a.js'), w.deps)
  const blocked = await delegates.verdict(judge('b1', 'fix', { findings: [out] }), w.deps)
  assert.deepEqual([blocked.next.kind, blocked.next.cause, blocked.step], ['blocked', 'blocked-outside-owns', 'haiku-xhigh'])

  await delegates.begin(call('i1'), w.deps)
  const rose = await delegates.verdict(judge('i1', 'infeasible', { reason: 'the brief asks for a file nobody owns' }), w.deps)
  assert.deepEqual([rose.next.kind, rose.next.cause, rose.step], ['rise', 'infeasible', 'haiku-xhigh'])
  assert.equal((await delegates.verdict(judge('i1', 'infeasible'), w.deps)).ok, false)
})

test('a task that runs on another harness is chosen by the points of the reference pair of its rung', async (t) => {
  const w = world(t, { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } })
  await delegates.begin(call('o1', 'src/a.js'), w.deps)
  await delegates.verdict(judge('o1', 'fix', { findings: [fixOf(1)] }), w.deps)
  await delegates.begin(call('o1', 'src/a.js'), w.deps)
  assert.deepEqual(w.asked, [{ model: 'haiku', effort: 'high' }, { model: 'haiku', effort: 'xhigh' }])
})
