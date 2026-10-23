'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const chain = require('../plugins/aether/lib/delegate-chain.js')
const laneMarks = require('../plugins/aether/lib/lane-marks.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const marks = require('../plugins/aether/lib/router-marks.js')
const slow = require('../plugins/aether/lib/router-slow.js')

// agy's refusal as it reached the owner: the text of the CLI, whole.
const AGY_REFUSAL = 'exit 3: Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 135h11m.'
const NO_USAGE = { input: 0, output: 0, thinking: 0, cacheRead: 0 }

const ARGON = { harness: 'agy', rung: { model: 'gemini-4-argon', effort: 'high', group: 'gemini' } }
const FLASH = { harness: 'agy', rung: { model: 'gemini-3.8-flash', effort: 'high', group: 'gemini' } }
const GROK = { harness: 'grok', rung: { model: 'grok-4.7', effort: 'high', group: 'grok' } }
const MUSE = { harness: 'muse', rung: { model: 'muse-wonder-full-1.0', effort: 'high', group: 'muse' } }
const MINI = { harness: 'grok', rung: { model: 'grok-4.7-mini', effort: 'low', group: 'grok-mini' } }
const CONFIG = { harnesses: { agy: { groups: { gemini: {}, claude: {} } }, grok: { groups: { grok: {}, 'grok-mini': {} } }, muse: { groups: { muse: {} } } } }
const task = { description: 'audit the retry wrapper', prompt: 'Read src/ and report each call that skips it.' }
const externalOf = (primary, alternates) => ({ id: 'c-1', session: 's1', ...primary, task, ...(alternates === undefined ? {} : { alternates }) })

// A runDelegate that answers from a script, one outcome per call, and moves the clock by the outcome's duration. It
// records what each call was given.
function setup(t, script) {
  const dataDir = tempDir(t, 'aether-chain-data-')
  const clock = { t: Date.parse('2026-10-21T12:00:00Z') }
  const calls = []
  const runDelegate = async (input) => {
    calls.push(input)
    const wanted = script[calls.length - 1]
    assert.ok(wanted, `attempt ${calls.length} was not expected`)
    if (wanted.throws) {
      clock.t += wanted.durationMs ?? 1000
      throw new Error(wanted.throws)
    }
    const outcome = { status: 'ok', text: '', detail: '', durationMs: 5000, usage: { ...NO_USAGE }, quotaSpent: [], timedOut: false, ...wanted }
    clock.t += outcome.durationMs
    return { ...outcome, harness: input.harness, modelArg: `${input.rung.model}-${input.rung.effort}`, text: outcome.status === 'ok' ? 'found it' : '' }
  }
  const run = (primary, alternates) => chain.runChain(
    { cwd: dataDir, id: 'c-1', session: 's1', external: externalOf(primary, alternates), config: CONFIG, dataDir },
    { runDelegate, now: () => clock.t },
  )
  const outcomes = () => log.readEntries(dataDir, { task: 'c-1' }).filter((e) => e.kind === 'outcome')
  return { dataDir, clock, calls, run, outcomes }
}
const refusal = (over = {}) => ({ status: 'quota', detail: AGY_REFUSAL, durationMs: 9000, ...over })

test('a refusal at the start tries the next candidate: both outcomes are journaled, the refusal leaves its mark, and the answer names the pair that gave it', async (t) => {
  const s = setup(t, [refusal(), { status: 'ok', durationMs: 20000 }])
  const out = await s.run(ARGON, [GROK, MUSE])
  assert.equal(out.ok, true)
  assert.equal(out.status, 'ok')
  assert.equal(out.text, 'found it')
  assert.equal(out.marked, null, 'the last attempt ended ok: it marked nothing')
  assert.equal(out.journaled, true)
  assert.deepEqual(out.attempts, [
    { harness: 'agy', model: 'gemini-4-argon', effort: 'high', status: 'quota', detail: AGY_REFUSAL },
    { harness: 'grok', model: 'grok-4.7', effort: 'high', status: 'ok', detail: '' },
  ])
  assert.match(out.attribution, /^Aether delegate: gemini-4-argon on agy refused for quota first, so this answer is from grok-4\.7 at high on grok, run in a disposable copy of the checkout\./)
  assert.match(out.attribution, /Claude Code lists no tool uses or tokens/)
  assert.deepEqual(s.calls.map((c) => [c.harness, c.rung.model]), [['agy', 'gemini-4-argon'], ['grok', 'grok-4.7']])
  assert.deepEqual(s.calls.map((c) => c.task), [task, task])
  const [first, second] = s.outcomes()
  assert.deepEqual([first.attempt, first.status, first.harness, first.model], [1, 'quota', 'agy', 'gemini-4-argon-high'])
  assert.deepEqual([second.attempt, second.status, second.harness, second.model], [2, 'ok', 'grok', 'grok-4.7-high'])
  assert.ok(first.markedUntil > s.clock.t, 'the refusal wrote its mark')
  assert.equal(second.markedUntil, null)
  assert.deepEqual(Object.keys(first).sort(), ['attempt', 'detail', 'durationMs', 'effort', 'harness', 'id', 'kind', 'markedUntil', 'model', 'quotaSpent', 'session', 'status', 'time', 'usage'], 'today\'s fields and the attempt')
  assert.equal(first.session, 's1')
  const held = marks.readAllMarks(s.dataDir, s.clock.t)
  assert.deepEqual(held.map((m) => [m.harness, m.group, m.source]), [['agy', 'gemini', 'router']])
})

test('the attribution lists every earlier pair that refused', async (t) => {
  const s = setup(t, [refusal(), { status: 'unavailable', detail: 'grok is not installed' }, { status: 'ok' }])
  const out = await s.run(ARGON, [GROK, MUSE])
  assert.equal(out.ok, true)
  assert.match(out.attribution, /^Aether delegate: gemini-4-argon on agy refused for quota, grok-4\.7 on grok was unavailable first, so this answer is from muse-wonder-full-1\.0 at high on muse,/)
  assert.deepEqual(s.outcomes().map((e) => [e.attempt, e.status]), [[1, 'quota'], [2, 'unavailable'], [3, 'ok']])
})

test('an answer on the first pair says what it always said, and the journal holds attempt 1', async (t) => {
  const s = setup(t, [{ status: 'ok' }])
  const out = await s.run(ARGON, [GROK])
  assert.equal(out.attribution, 'Aether delegate: this answer is from gemini-4-argon at high on agy, run in a disposable copy of the checkout. Claude Code lists no tool uses or tokens for it because Aether handed you the answer without a Claude request.')
  assert.deepEqual(s.outcomes().map((e) => e.attempt), [1])
  assert.equal(s.calls.length, 1)
  assert.equal(s.calls[0].maxCliSeconds, undefined, 'the first attempt has the limit it always had')
})

test('an unavailable pair counts as a refusal at the start', async (t) => {
  const s = setup(t, [{ status: 'unavailable', detail: 'muse has no model muse-wonder-full-1.0' }, { status: 'ok' }])
  const out = await s.run(MUSE, [GROK])
  assert.equal(out.ok, true)
  assert.equal(out.attempts[0].status, 'unavailable')
  assert.equal(marks.readAllMarks(s.dataDir, s.clock.t).length, 0, 'an unavailable pair leaves no mark')
})

test('a failure whose text is a refusal the router recognizes, with no tokens used, also tries the next candidate', async (t) => {
  const s = setup(t, [{ status: 'failed', detail: AGY_REFUSAL }, { status: 'ok' }])
  assert.equal((await s.run(ARGON, [GROK])).ok, true)
  assert.equal(s.calls.length, 2)
  assert.equal(chain.isStartRefusal({ status: 'failed', detail: 'quota: muse weekly limit', usage: NO_USAGE }), true)
  assert.equal(chain.isStartRefusal({ status: 'failed', detail: 'model not found', usage: NO_USAGE }), false)
})

test('the only alternate shares the group that was just marked: it is skipped, nothing more runs, and the status is the refusal\'s', async (t) => {
  const s = setup(t, [refusal()])
  const out = await s.run(ARGON, [FLASH])
  assert.equal(out.ok, false)
  assert.equal(out.status, 'quota')
  assert.equal(out.detail, AGY_REFUSAL)
  assert.equal(out.attribution, null)
  assert.ok(out.marked > s.clock.t, 'the mod reads the mark the refusal left')
  assert.equal(s.calls.length, 1)
  assert.equal(out.attempts.length, 1)
  assert.equal(s.outcomes().length, 1)
})

test('a candidate whose group has a live mark of the router or the swarm is skipped, and the next one runs', async (t) => {
  const s = setup(t, [refusal(), { status: 'ok' }])
  marks.markRefusal(s.dataDir, { harness: 'grok', group: 'grok', text: 'quota: grok weekly limit, resets later', now: s.clock.t })
  const out = await s.run(ARGON, [GROK, MUSE])
  assert.equal(out.ok, true)
  assert.deepEqual(s.calls.map((c) => c.harness), ['agy', 'muse'])
  assert.deepEqual(s.outcomes().map((e) => [e.attempt, e.harness]), [[1, 'agy'], [2, 'muse']], 'the skipped candidate is not an attempt')

  const swarm = setup(t, [refusal(), { status: 'ok' }])
  const mark = { harness: 'grok', group: 'grok', at: swarm.clock.t, until: swarm.clock.t + 3600000, confirmed: false, resetsAt: null, usedPercentAbsent: false, reason: 'quota refusal' }
  fs.mkdirSync(path.dirname(laneMarks.markFile(swarm.dataDir, 'grok', 'grok')), { recursive: true })
  fs.writeFileSync(laneMarks.markFile(swarm.dataDir, 'grok', 'grok'), JSON.stringify(mark))
  assert.equal((await swarm.run(ARGON, [GROK, MUSE])).ok, true)
  assert.deepEqual(swarm.calls.map((c) => c.harness), ['agy', 'muse'], 'a mark of the swarm holds the group too')
})

test('a group that refused for quota before the call, which writes no mark, is not tried again in the same chain', async (t) => {
  const s = setup(t, [{ status: 'quota', detail: 'agy group gemini is at or under the reserve', durationMs: 100 }, { status: 'ok' }])
  const out = await s.run(ARGON, [FLASH, GROK])
  assert.equal(out.ok, true)
  assert.deepEqual(s.calls.map((c) => c.rung.model), ['gemini-4-argon', 'grok-4.7'])
  assert.equal(marks.readAllMarks(s.dataDir, s.clock.t).length, 0)
})

test('a failure after the call started does not try another candidate: tokens used, a timeout, a failure that is no refusal', async (t) => {
  const cases = [
    ['a refusal after tokens were spent', { status: 'quota', detail: AGY_REFUSAL, usage: { ...NO_USAGE, output: 40 } }],
    ['a quota that ran out during the call', { status: 'quota', detail: 'quota: muse weekly limit', usage: { ...NO_USAGE, input: 10 } }],
    ['a timeout', { status: 'failed', detail: 'timed out after 360s', durationMs: 420000 }],
    ['a failure that used tokens', { status: 'failed', detail: 'invalid answer: answer is not a string', usage: { ...NO_USAGE, output: 200 } }],
    ['a failure that is no refusal', { status: 'failed', detail: 'model not found' }],
  ]
  for (const [name, outcome] of cases) {
    const s = setup(t, [outcome])
    const out = await s.run(ARGON, [GROK, MUSE])
    assert.equal(out.ok, false, name)
    assert.equal(out.status, outcome.status, name)
    assert.equal(s.calls.length, 1, name)
    assert.equal(s.outcomes().length, 1, name)
    assert.equal(out.journaled, true, name)
  }
})

test('dirty and violation go to Claude: another pair would meet the same checkout, or has already changed a file', async (t) => {
  for (const outcome of [{ status: 'dirty', detail: 'the checkout has uncommitted changes (a.js)' }, { status: 'violation', detail: 'the read-only delegate changed notes.txt' }]) {
    const s = setup(t, [outcome])
    const out = await s.run(ARGON, [GROK, MUSE])
    assert.equal(out.ok, false, outcome.status)
    assert.equal(out.status, outcome.status)
    assert.equal(s.calls.length, 1, outcome.status)
    assert.equal(out.marked, null)
  }
})

test('a violation comes back with the files the delegate touched; other endings with none (R6)', async (t) => {
  const s = setup(t, [{ status: 'violation', detail: 'the read-only delegate changed src/a.js', changed: ['src/a.js'] }])
  const out = await s.run(ARGON, [GROK])
  assert.deepEqual([out.ok, out.status, out.changed], [false, 'violation', ['src/a.js']])
  const fine = setup(t, [{ status: 'ok' }])
  assert.deepEqual((await fine.run(ARGON)).changed, [])
})

test('the outcomes of a task go to the delegate log with the task id and an attempt that runs on across its chains', async (t) => {
  const s = setup(t, [refusal(), { status: 'ok' }, { status: 'ok' }])
  await s.run(ARGON, [GROK])
  await s.run(MUSE)
  assert.deepEqual(s.outcomes().map((e) => [e.id, e.attempt, e.harness]), [['c-1', 1, 'agy'], ['c-1', 2, 'grok'], ['c-1', 3, 'muse']])
  assert.equal(fs.existsSync(path.join(s.dataDir, 'delegates', 'log.jsonl')), true)
  assert.equal(fs.existsSync(path.join(s.dataDir, 'router', 'decisions.jsonl')), false, 'nothing goes to the old journal')
})

test('the third attempt is the last, however many candidates are left', async (t) => {
  assert.equal(chain.MAX_ATTEMPTS, 3)
  const s = setup(t, [refusal(), { status: 'unavailable', detail: 'grok is not installed' }, { status: 'unavailable', detail: 'muse is not installed' }])
  const out = await s.run(ARGON, [GROK, MUSE, MINI, FLASH])
  assert.equal(out.ok, false)
  assert.equal(out.status, 'unavailable', 'the status and the detail are the last attempt\'s')
  assert.equal(out.detail, 'muse is not installed')
  assert.equal(s.calls.length, 3)
  assert.deepEqual(out.attempts.map((a) => a.harness), ['agy', 'grok', 'muse'])
  assert.deepEqual(s.outcomes().map((e) => e.attempt), [1, 2, 3])
})

test('time: a slow first attempt leaves too little for another, a medium one gives the next a reduced CLI limit', async (t) => {
  // 400 s used: 170 s left, less than the two readings and the grace (180 s) plus the 120 s a CLI is worth.
  const slow = setup(t, [{ status: 'quota', detail: AGY_REFUSAL, durationMs: 400000 }])
  const stopped = await slow.run(ARGON, [GROK])
  assert.equal(stopped.ok, false)
  assert.equal(slow.calls.length, 1)

  // 100 s used: 470 s left, minus 180 s of readings and grace.
  const medium = setup(t, [{ status: 'quota', detail: AGY_REFUSAL, durationMs: 100000 }, { status: 'ok' }])
  assert.equal((await medium.run(ARGON, [GROK])).ok, true)
  assert.equal(medium.calls[0].maxCliSeconds, undefined)
  assert.equal(medium.calls[1].maxCliSeconds, 290)

  // The edge: 270 s used leaves exactly the 120 s; one second more does not.
  const edge = setup(t, [{ status: 'quota', detail: AGY_REFUSAL, durationMs: 270000 }, { status: 'ok' }])
  assert.equal((await edge.run(ARGON, [GROK])).ok, true)
  assert.equal(edge.calls[1].maxCliSeconds, 120)
  const over = setup(t, [{ status: 'quota', detail: AGY_REFUSAL, durationMs: 271000 }])
  assert.equal((await over.run(ARGON, [GROK])).ok, false)
  assert.equal(over.calls.length, 1)

  // The time counts every attempt: two refusals of 100 s leave 370 s, 190 s of CLI.
  const two = setup(t, [{ status: 'quota', detail: AGY_REFUSAL, durationMs: 100000 }, { status: 'unavailable', detail: 'x', durationMs: 100000 }, { status: 'ok' }])
  await two.run(ARGON, [GROK, MUSE])
  assert.deepEqual(two.calls.map((c) => c.maxCliSeconds), [undefined, 290, 190])
})

test('an external file with no alternates behaves as it did: one attempt, its outcome with attempt 1, and its mark', async (t) => {
  const s = setup(t, [refusal()])
  const out = await s.run(ARGON)
  assert.equal(out.ok, false)
  assert.equal(out.status, 'quota')
  assert.equal(out.attribution, null)
  assert.equal(s.calls.length, 1)
  assert.deepEqual(s.outcomes().map((e) => [e.attempt, e.status]), [[1, 'quota']])
  assert.ok(out.marked > s.clock.t)
  assert.equal(out.attempts.length, 1)

  const bad = setup(t, [refusal()])
  const odd = await bad.run(ARGON, [null, { harness: 'grok' }, { harness: 'grok', rung: { model: 'x' } }, 'grok'])
  assert.equal(odd.ok, false, 'entries that do not name a whole rung are ignored')
  assert.equal(bad.calls.length, 1)
})

// ---- issues 035 and 037 ----

const KILLED = (over = {}) => ({ status: 'failed', detail: 'ran out of time: killed at 420 s, exit 137', durationMs: 420000, timedOut: true, ...over })

test('issue 035: an attempt that ran out of time writes the slow mark of its pair, journals it, and goes to Claude without another try', async (t) => {
  const s = setup(t, [KILLED()])
  const out = await s.run(GROK, [MUSE, ARGON])
  assert.equal(out.ok, false)
  assert.equal(out.status, 'failed')
  assert.match(out.detail, /^ran out of time/)
  assert.equal(out.marked, null, 'no quota mark: a timeout says nothing of the quota')
  assert.equal(s.calls.length, 1, 'a timeout is not a refusal at the start: the chain does not go on')
  assert.equal(out.journaled, true)
  const [entry] = s.outcomes()
  assert.equal(entry.timedOut, true)
  assert.equal(entry.slowUntil, s.clock.t + 60 * 60 * 1000)
  assert.equal(entry.markedUntil, null)
  assert.deepEqual(slow.slowPairIds(s.dataDir, [{ id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high' }, { id: 'grok/grok-4.7@low', harness: 'grok', model: 'grok-4.7', effort: 'low' }], s.clock.t), ['grok/grok-4.7@high'], 'the pair is out, not its group')
  assert.equal(marks.readAllMarks(s.dataDir, s.clock.t).length, 0)
})

test('issue 035: the entries of attempts that did not run out of time keep their fields', async (t) => {
  const s = setup(t, [refusal(), { status: 'ok' }])
  await s.run(ARGON, [GROK])
  for (const entry of s.outcomes()) {
    assert.equal(Object.hasOwn(entry, 'timedOut'), false)
    assert.equal(Object.hasOwn(entry, 'slowUntil'), false)
  }
  assert.equal(slow.slowPairIds(s.dataDir, [{ id: 'a', harness: 'agy', model: 'gemini-4-argon', effort: 'high' }], s.clock.t).length, 0)
})

test('issue 037: a timed-out attempt is never a start refusal, whatever else it says', () => {
  const killed = { status: 'quota', detail: AGY_REFUSAL, usage: NO_USAGE, timedOut: true }
  assert.equal(chain.isStartRefusal(killed), false, 'a quota status with no tokens and a refusal text')
  assert.equal(chain.isStartRefusal({ ...killed, status: 'unavailable' }), false)
  assert.equal(chain.isStartRefusal({ ...killed, timedOut: false }), true)
  assert.equal(chain.isStartRefusal({ status: 'quota', detail: AGY_REFUSAL, usage: NO_USAGE }), true, 'an outcome with no flag is read as before')
})

test('issue 035: a candidate whose pair holds a live slow mark is skipped, and the next one runs', async (t) => {
  const s = setup(t, [refusal(), { status: 'ok' }])
  slow.markSlow(s.dataDir, { harness: 'grok', model: 'grok-4.7', effort: 'high' }, { now: s.clock.t })
  const out = await s.run(ARGON, [GROK, MUSE])
  assert.equal(out.ok, true)
  assert.deepEqual(s.calls.map((c) => c.harness), ['agy', 'muse'], 'a parallel delegate wrote the mark')
  assert.deepEqual(s.outcomes().map((e) => [e.attempt, e.harness]), [[1, 'agy'], [2, 'muse']])

  // The same model at another effort is not the marked pair.
  const other = setup(t, [refusal(), { status: 'ok' }])
  slow.markSlow(other.dataDir, { harness: 'grok', model: 'grok-4.7', effort: 'high' }, { now: other.clock.t })
  await other.run(ARGON, [{ harness: 'grok', rung: { model: 'grok-4.7', effort: 'low', group: 'grok' } }, MUSE])
  assert.deepEqual(other.calls.map((c) => c.rung.effort), ['high', 'low'])

  // An expired mark holds nothing.
  const old = setup(t, [refusal(), { status: 'ok' }])
  slow.markSlow(old.dataDir, { harness: 'grok', model: 'grok-4.7', effort: 'high' }, { now: old.clock.t - 2 * 60 * 60 * 1000 })
  await old.run(ARGON, [GROK])
  assert.deepEqual(old.calls.map((c) => c.harness), ['agy', 'grok'])

  // Every candidate left is out: the chain ends on the refusal of the last attempt.
  const all = setup(t, [refusal()])
  slow.markSlow(all.dataDir, { harness: 'grok', model: 'grok-4.7', effort: 'high' }, { now: all.clock.t })
  const ended = await all.run(ARGON, [GROK])
  assert.equal(ended.ok, false)
  assert.equal(ended.status, 'quota')
  assert.equal(all.calls.length, 1)
})

test('issue 037: an exception of runDelegate is a failed attempt with its outcome entry, and nothing retries', async (t) => {
  const s = setup(t, [{ throws: 'the worktree could not be made', durationMs: 2000 }])
  const out = await s.run(ARGON, [GROK, MUSE])
  assert.equal(out.ok, false)
  assert.equal(out.status, 'failed')
  assert.equal(out.detail, 'delegate: the worktree could not be made')
  assert.equal(out.text, '')
  assert.equal(out.journaled, true)
  assert.equal(out.marked, null)
  assert.equal(s.calls.length, 1)
  assert.deepEqual(out.attempts, [{ harness: 'agy', model: 'gemini-4-argon', effort: 'high', status: 'failed', detail: 'delegate: the worktree could not be made' }])
  const [entry] = s.outcomes()
  assert.deepEqual([entry.attempt, entry.status, entry.harness, entry.model, entry.detail], [1, 'failed', 'agy', 'gemini-4-argon', 'delegate: the worktree could not be made'])
  assert.deepEqual(entry.usage, NO_USAGE)
  assert.deepEqual(entry.quotaSpent, [])
  assert.equal(entry.durationMs, 2000)

  // After a refusal the exception still has its entry, and the chain stops there.
  const later = setup(t, [refusal(), { throws: 'boom' }, { status: 'ok' }])
  const second = await later.run(ARGON, [GROK, MUSE])
  assert.equal(second.ok, false)
  assert.equal(later.calls.length, 2)
  assert.deepEqual(later.outcomes().map((e) => [e.attempt, e.status]), [[1, 'quota'], [2, 'failed']])
})

// A file where each directory of the marks must be makes every mark fail to write, while the journal still works.
function breakMarks(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'router'), { recursive: true })
  for (const name of ['lanes', 'slow']) fs.writeFileSync(path.join(dataDir, 'router', name), 'not a directory')
}

test('issue 037: a mark that cannot be written is swallowed: the outcome is still journaled and the chain goes on or ends as it would', async (t) => {
  const s = setup(t, [refusal(), { status: 'ok' }])
  breakMarks(s.dataDir)
  const out = await s.run(ARGON, [GROK])
  assert.equal(out.ok, true, 'the refusal still moved on to the next candidate')
  assert.equal(s.calls.length, 2)
  assert.equal(out.attempts[0].status, 'quota')

  const timed = setup(t, [KILLED()])
  breakMarks(timed.dataDir)
  const ended = await timed.run(GROK, [MUSE])
  assert.equal(ended.ok, false)
  assert.equal(ended.status, 'failed')
  assert.equal(timed.calls.length, 1)
})
