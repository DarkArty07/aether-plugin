'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, PLUGIN } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow, laneAnswer, laneOf } = require('./workflow-harness.js')
const { loadLadder, effortFor } = require('../plugins/aether/lib/ladder.js')

const L = loadLadder()
const [HAIKU, SONNET] = L.rungs
const FIRST = `${HAIKU.model} ${HAIKU.effort.first}`
const RETRY = `${HAIKU.model} ${HAIKU.effort.retry}`

const build = (t, tasks) => compile(makeRepo(t), plan(tasks))
const one = (t, options = {}) => build(t, [task(1, options)])
const finding = (title, file = 'src/t1/a.js:3') => ({ severity: 'important', title, file, evidence: `evidence of ${title}` })
const retry = (...titles) => ({ verdict: 'retry', findings: titles.map((x) => finding(x)), ruling: `Retry: ${titles.join(', ')}.`, guidance: 'fix it', question: '' })
const verdict = (kind, ruling, extra = {}) => ({ verdict: kind, findings: [], ruling, guidance: '', question: '', ...extra })
const attempts = (run, unitId = 'task-1') => run.calls.filter((c) => c.role === 'implementer' && c.unit === unitId)
const rungs = (run, unitId = 'task-1') => attempts(run, unitId).map((c) => `${c.model} ${c.effort}`)
const supervisions = (run, unitId = 'task-1') => run.calls.filter((c) => c.role === 'supervisor' && c.unit === unitId)
const unitOf = (run, id = 'task-1') => run.result.units.find((u) => u.id === id)

test('every unit starts on the first rung of the ladder, whatever the plan asks for', async (t) => {
  const args = build(t, [task(1, { tier: 'haiku — x' }), task(2, { tier: 'sonnet xhigh — wiring' }), task(3, { tier: 'opus max — security' })])
  const run = await runWorkflow(args)
  assert.equal(run.error, null, run.error && run.error.stack)
  for (const id of ['task-1', 'task-2', 'task-3']) assert.deepEqual(rungs(run, id), [FIRST], id)
  assert.deepEqual(unitOf(run, 'task-3').tiers, [FIRST])
})

test('args without tier, effort or ladder run: the script reads none of them', async (t) => {
  const args = one(t)
  delete args.ladder
  for (const task of Object.values(args.tasks)) {
    delete task.tier
    delete task.effort
    delete task.tierReason
  }
  const run = await runWorkflow(args)
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(unitOf(run).status, 'merged')
})

test('a retry with findings raises the effort of Haiku and keeps the model', async (t) => {
  const run = await runWorkflow(one(t), { supervisor: (call, approve) => (call.n === 1 ? retry('gap') : approve(call)) })
  assert.deepEqual(rungs(run), [FIRST, RETRY])
  const u = unitOf(run)
  assert.deepEqual([u.status, u.ladder.corrections, u.ladder.firstTry, u.ladder.steps], ['merged', 1, false, [HAIKU.model]])
  assert.deepEqual(u.tiers, [FIRST, RETRY])
})

test('the same findings twice raise the model, and the rise is counted by its cause', async (t) => {
  const run = await runWorkflow(one(t), { supervisor: (call, approve) => (call.n <= L.repeatFindings ? retry('same gap') : approve(call)) })
  const models = attempts(run).map((c) => c.model)
  assert.deepEqual(models, [...Array(L.repeatFindings).fill(HAIKU.model), SONNET.model])
  assert.equal(attempts(run).pop().effort, effortFor(L, SONNET.step, 'rise'))
  const u = unitOf(run)
  assert.deepEqual([u.ladder.rises.repeated, u.ladder.rises.exhausted, u.ladder.steps], [1, 0, [HAIKU.model, SONNET.model]])
})

test('different findings spend the corrections of the rung, then the model rises', async (t) => {
  const cap = HAIKU.corrections + 1
  const run = await runWorkflow(one(t), { supervisor: (call, approve) => (call.n <= cap ? retry(`gap ${call.n}`) : approve(call)) })
  assert.deepEqual(attempts(run).map((c) => c.model), [...Array(cap).fill(HAIKU.model), SONNET.model])
  assert.equal(unitOf(run).ladder.rises.exhausted, 1)
})

test('a retry without a file is completed with the first Owns entry and the ruling, and counted', async (t) => {
  for (const findings of [[], [{ ...finding('no file'), file: '' }]]) {
    const run = await runWorkflow(one(t), {
      supervisor: (call, approve) => (call.n === 1 ? { verdict: 'retry', findings, ruling: 'Retry: nothing named.', guidance: '', question: '' } : approve(call)),
    })
    assert.equal(unitOf(run).status, 'merged')
    assert.equal(unitOf(run).ladder.filled, 1)
    assert.match(attempts(run)[1].prompt, /src\/t1\/\*\*/)
    assert.match(attempts(run)[1].prompt, /Retry: nothing named\./)
  }
})

test('escalate with a ruling is infeasible: the model rises with the reason, counted as infeasible', async (t) => {
  const run = await runWorkflow(one(t), { supervisor: (call, approve) => (call.n === 1 ? verdict('escalate', 'Beyond this model: needs a parser.') : approve(call)) })
  assert.deepEqual(attempts(run).map((c) => c.model), [HAIKU.model, SONNET.model])
  assert.match(attempts(run)[1].prompt, /Beyond this model: needs a parser\./)
  assert.equal(unitOf(run).ladder.rises.infeasible, 1)
})

test('escalate without a ruling is a supervisor failure: asked again twice, then the unit is blocked, with no new attempt', async (t) => {
  const run = await runWorkflow(one(t), { supervisor: () => verdict('escalate', '') })
  assert.equal(supervisions(run).length, 3)
  assert.equal(attempts(run).length, 1)
  assert.equal(unitOf(run).status, 'blocked')
  assert.match(unitOf(run).reason, /supervisor/)
})

test('a supervisor agent that fails is asked again, outside the ladder, and a third failure blocks the unit', async (t) => {
  let run = await runWorkflow(one(t), { supervisor: (call, approve) => (call.n <= 2 ? null : approve(call)) })
  assert.equal(unitOf(run).status, 'merged')
  assert.equal(attempts(run).length, 1)
  assert.equal(unitOf(run).ladder.corrections, 0)
  run = await runWorkflow(one(t), { supervisor: () => null })
  assert.equal(supervisions(run).length, 3)
  assert.equal(unitOf(run).status, 'blocked')
  assert.match(unitOf(run).reason, /supervisor/)
})

test('an implementer that fails twice is two equal findings: the second one raises the model', async (t) => {
  const run = await runWorkflow(one(t), { implementer: (call, done) => (call.n <= 2 ? null : done(call)) })
  assert.deepEqual(attempts(run).map((c) => c.model), [HAIKU.model, HAIKU.model, SONNET.model])
  assert.match(unitOf(run).rounds[0].findings[0].title, /el intento no terminó/)
  assert.equal(unitOf(run).rounds[0].findings[0].file, 'src/t1/**')
  assert.equal(unitOf(run).ladder.rises.repeated, 1)
})

test('escalate every time walks the ladder to its end, and the unit is blocked with the ladder\'s cause', async (t) => {
  const run = await runWorkflow(one(t), { supervisor: () => verdict('escalate', 'Too hard.') })
  assert.equal(attempts(run).length, L.rungs.length)
  assert.equal(unitOf(run).status, 'blocked')
  assert.match(unitOf(run).reason, /exhausted/)
  assert.equal(unitOf(run).ladder.rises.infeasible, L.rungs.length - 1)
})

test('a merge that is refused for files outside Owns is a correction with a synthetic finding', async (t) => {
  const run = await runWorkflow(one(t), {
    ops: (call, wt) => (call.kind === 'ops:merge' && call.n === 1 ? { merged: false, reason: 'ownership', files: ['src/other/x.js'] } : wt(call)),
  })
  assert.equal(unitOf(run).status, 'merged')
  assert.match(attempts(run)[1].prompt, /src\/other\/x\.js/)
  assert.match(attempts(run)[1].prompt, /fuera de Owns/)
  assert.equal(unitOf(run).ladder.corrections, 1)
})

test('a merge that is refused for no changes is a correction with a synthetic finding, and merges', async (t) => {
  const run = await runWorkflow(one(t), {
    ops: (call, wt) => (call.kind === 'ops:merge' && call.n === 1 ? { merged: false, reason: 'empty' } : wt(call)),
  })
  assert.equal(unitOf(run).status, 'merged')
  assert.match(attempts(run)[1].prompt, /el intento no cambió ningún archivo/)
  assert.equal(unitOf(run).ladder.corrections, 1)
})

test('a clean run has ladder.firstTry === true', async (t) => {
  const run = await runWorkflow(one(t))
  assert.equal(unitOf(run).status, 'merged')
  assert.equal(unitOf(run).ladder.firstTry, true)
})

test('after a merge the ladder file has state.status === "approved"', async (t) => {
  const args = one(t)
  const run = await runWorkflow(args)
  assert.equal(unitOf(run).status, 'merged')
  const ladderPath = path.join(args.runDir, 'ladder', 'task-1.json')
  assert.ok(fs.existsSync(ladderPath))
  const data = JSON.parse(fs.readFileSync(ladderPath, 'utf8'))
  assert.equal(data.state.status, 'approved')
})

test('the exact what for an implementer that returns null versus a lane failure', async (t) => {
  const noReport = await runWorkflow(one(t), {
    implementer: (call, done) => (call.n === 1 ? null : done(call)),
  })
  assert.equal(unitOf(noReport).rounds[0].findings[0].title, 'el intento no terminó (sin informe)')

  const args = {
    ...compile(makeRepo(t), plan([task(1, { owns: '`src/a.js`, `src/b.js`' })])),
    lanes: { superdelegation: true, harnesses: ['agy'], waits: { implementer: 3, supervisor: 2, reviewer: 2 } },
  }
  const FLASH = { id: 'agy/gemini-3.8-flash@high', harness: 'agy', model: 'gemini-3.8-flash', family: 'gemini-3.8-flash', effort: 'high', group: null, intelligence: 40, costPerTaskUsd: 1 }
  let implementPicks = 0
  let implementWaits = 0
  const laneFail = await runWorkflow(args, {
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
        if (implementWaits === 1) {
          return laneAnswer({ result: { status: 'DONE', summary: 'ok', head: 'h1', tests: 'p', concerns: '', question: '' }, lane: laneOf(call.started) })
        }
        return { error: 'the wait cap ran out' }
      }
      return fallback(call)
    },
  })
  assert.equal(unitOf(laneFail).rounds[1].findings[0].title, 'el intento no terminó (el intento falló)')
})

test('a relaunch of a unit whose ladder is already approved blocks with no implementer call', async (t) => {
  const args = one(t)
  const first = await runWorkflow(args)
  assert.equal(unitOf(first).status, 'merged')
  const again = await runWorkflow(args)
  assert.equal(unitOf(again).status, 'blocked')
  assert.equal(unitOf(again).reason, 'the ladder is not open (approved)')
  assert.equal(attempts(again).length, 0)
})

test('a rejected verdict in the no-report path blocks the unit and does not loop', async (t) => {
  const args = one(t)
  const run = await runWorkflow(args, {
    implementer: () => null,
    ops: (call, fallback) => {
      if (call.kind === 'ops:ladder' && call.command.rest.includes('--verdict')) {
        return { accepted: false, rejection: 'invalid payload in test' }
      }
      return fallback(call)
    },
  })
  const unit = unitOf(run)
  assert.equal(unit.status, 'blocked')
  assert.equal(unit.reason, 'the ladder rejected the verdict: invalid payload in test')
  assert.equal(unit.attempts, 1)
})

test('a merge conflict still gets one retry outside the ladder: no correction is spent', async (t) => {
  const run = await runWorkflow(one(t), {
    ops: (call, wt) => (call.kind === 'ops:merge' && call.n === 1 ? { merged: false, reason: 'conflict', files: ['src/shared.js'], detail: 'CONFLICT' } : wt(call)),
  })
  assert.equal(unitOf(run).status, 'merged')
  assert.equal(unitOf(run).ladder.corrections, 0)
  assert.deepEqual(rungs(run), [FIRST, FIRST])
})

test('the ladder state survives a relaunch: the unit goes on at the effort it had reached', async (t) => {
  const args = one(t)
  const first = await runWorkflow(args, { supervisor: (call) => (call.n === 1 ? retry('gap') : verdict('block', 'Block: needs the owner.', { question: 'Which format?' })) })
  assert.equal(unitOf(first).status, 'blocked')
  const again = await runWorkflow(args)
  assert.equal(rungs(again)[0], RETRY)
  assert.equal(unitOf(again).ladder.firstTry, false)
  assert.ok(fs.existsSync(path.join(args.runDir, 'ladder', 'task-1.json')))
})

test('a relaunch with --only goes on at the effort the unit had reached, and leaves the other units alone', async (t) => {
  const repo = makeRepo(t)
  const tasks = [task(1), task(2)]
  const first = compile(repo, plan(tasks))
  let seen = 0
  const firstRun = await runWorkflow(first, {
    supervisor: (call, approve) => {
      if (call.unit !== 'task-1') return approve(call)
      seen += 1
      return seen === 1 ? retry('gap') : verdict('block', 'Block: needs the owner.', { question: 'Which format?' })
    },
  })
  assert.equal(unitOf(firstRun).status, 'blocked')
  const args = compile(repo, plan(tasks), ['--run', first.runId, '--only', 'task-1'])
  assert.deepEqual(args.waves, [['task-1']])
  const again = await runWorkflow(args)
  assert.equal(again.error, null, again.error && again.error.stack)
  assert.equal(rungs(again)[0], RETRY)
  assert.equal(unitOf(again).ladder.firstTry, false)
  assert.equal(attempts(again, 'task-2').length, 0)
})

test('the final review runs on Opus xhigh when a unit asks for Review xhigh or max, and not for a Tier', async (t) => {
  for (const review of ['xhigh — loses data', 'max — loses data']) {
    const run = await runWorkflow(one(t, { review }))
    const call = run.calls.find((c) => c.role === 'reviewer')
    assert.deepEqual([call.model, call.effort], ['opus', 'xhigh'], review)
  }
  const tierOnly = await runWorkflow(one(t, { tier: 'opus xhigh — security' }))
  const call = tierOnly.calls.find((c) => c.role === 'reviewer')
  assert.deepEqual([call.model, call.effort], ['sonnet', 'high'], 'a Tier alone no longer raises the review')
})

test('the final review is Sonnet high for up to three units that review at high, and Opus high for four', async (t) => {
  let run = await runWorkflow(build(t, [task(1, { review: 'high — x' }), task(2, { review: 'high — x' }), task(3)]))
  assert.deepEqual([run.calls.find((c) => c.role === 'reviewer').model, run.calls.find((c) => c.role === 'reviewer').effort], ['sonnet', 'high'])
  run = await runWorkflow(build(t, [task(1), task(2), task(3), task(4)]))
  assert.deepEqual([run.calls.find((c) => c.role === 'reviewer').model, run.calls.find((c) => c.role === 'reviewer').effort], ['opus', 'high'])
})

test('the supervisor\'s message shows the rung and the corrections used, with no prediction of what a retry would do', async (t) => {
  const run = await runWorkflow(one(t), { supervisor: (call, approve) => (call.n === 1 ? retry('gap') : approve(call)) })
  assert.match(supervisions(run)[0].prompt, new RegExp(`Corrections used on this rung: 0 of ${HAIKU.corrections}`))
  assert.match(supervisions(run)[1].prompt, new RegExp(`Corrections used on this rung: 1 of ${HAIKU.corrections}`))
  assert.doesNotMatch(supervisions(run)[0].prompt, /A retry runs on|blocks the unit: the ladder is spent/)
})

test('the script keeps no policy of its own: no tier ladder, attempt counters or rule of three repeats', () => {
  const text = fs.readFileSync(path.join(PLUGIN, 'workflows', 'run.workflow.js'), 'utf8')
  for (const pattern of [/\bnextTier\b/, /\beffortFor\b/, /\bladderOutlook\b/, /\bconst used\b/, /\bused\[/, /came back 3 times/, /task\.tier\b/, /\bladder\[t\]/, /\bFINDINGS_PREFIX\b/]) {
    assert.doesNotMatch(text, pattern)
  }
})
