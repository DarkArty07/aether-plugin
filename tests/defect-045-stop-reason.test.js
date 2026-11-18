'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, makeRepo } = require('./helpers.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const { recordAnswer } = require('../plugins/aether/lib/delegate-run.js')
const { unverdictedDelegates } = require('../plugins/aether/lib/delegate-report.js')
const { unverdictedStopMessage } = require('../plugins/aether/lib/continuity-hook.js')
const log = require('../plugins/aether/lib/delegate-log.js')

const BIN = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-delegate')
const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }

async function launchReadOnly(t, id = 'ro-stop') {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  let n = 0
  const deps = { dataDir, cwd: repo.dir, now: () => 1000 + (n += 1), settings: NATIVE, newId: () => `gen-${n}`, pickPair: async () => ({ pick: null, quota: [] }) }
  await task.begin({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt: `AETHER-TASK: ${id}\nDo the work.` } }, deps)
  return { dataDir, cwd: repo.dir, session: 's1', task: id, env: { ...process.env, AETHER_DATA_DIR: dataDir } }
}
const answer = (w, stopReason, text) => recordAnswer({ task: w.task, attempt: 1, text, session: w.session, cwd: w.cwd, dataDir: w.dataDir, now: () => 5000, stopReason })
const pending = (w) => unverdictedDelegates({ dataDir: w.dataDir, session: w.session })
const verdicts = (w) => log.readEntries(w.dataDir, { task: w.task }).filter((e) => e.kind === 'verdict')

for (const stopReason of ['max_tokens', 'length', 'incomplete', 'refusal', 'content_filter', 'something-else']) {
  test(`Claude: a read-only answer that stopped on ${stopReason} stays pending`, async (t) => {
    const w = await launchReadOnly(t)
    assert.equal(answer(w, stopReason, 'half an answer').recorded, true)
    assert.deepEqual(pending(w).map((x) => x.task), [w.task])
    assert.deepEqual(verdicts(w), [])
  })
}

for (const stopReason of ['end_turn', undefined, null]) {
  test(`Claude: a read-only answer with stop reason ${String(stopReason)} is closed as A132 decided`, async (t) => {
    const w = await launchReadOnly(t)
    answer(w, stopReason, 'a full answer')
    assert.equal(verdicts(w)[0].auto, true)
    assert.deepEqual(pending(w), [])
  })
}

test('the Stop notice names a task left pending by a cut-off answer', async (t) => {
  const w = await launchReadOnly(t)
  answer(w, 'max_tokens', 'cut')
  assert.ok(unverdictedStopMessage(pending(w), false).includes(w.task))
})

test('aether-delegate answer --stop-reason leaves the task pending (CLI)', async (t) => {
  const w = await launchReadOnly(t)
  const out = spawnSync(process.execPath, [BIN, 'answer', '--session', w.session, '--stop-reason', 'refusal', '--task', w.task, '--attempt', '1', '--text', 'no'], { cwd: w.cwd, encoding: 'utf8', env: w.env })
  assert.equal(JSON.parse(out.stdout.trim()).recorded, true)
  assert.equal(pending(w).length, 1)
  assert.deepEqual(verdicts(w), [])
})

// agy, codex and muse report no stop reason, so a cut or refusal there is not
// detected: the hole stays on the owner's list.

test('grok parse carries a cut-off stop reason, and drops end_turn or a missing field', () => {
  const { createGrok } = require('../plugins/aether/lib/harness/grok.js')
  const grok = createGrok({ groups: { grok: 'Grok models' } })
  const answer = JSON.stringify({ answer: 'x' })
  const cut = grok.parse({ stdout: JSON.stringify({ result: answer, stopReason: 'max_tokens' }), stderr: '', exitCode: 0 }, { required: ['answer'] })
  assert.equal(cut.clean, true)
  assert.equal(cut.stopReason, 'max_tokens')
  const ended = grok.parse({ stdout: JSON.stringify({ result: answer, stopReason: 'end_turn' }), stderr: '', exitCode: 0 }, { required: ['answer'] })
  assert.equal(ended.clean, true)
  assert.equal(Object.hasOwn(ended, 'stopReason'), false)
  const missing = grok.parse({ stdout: JSON.stringify({ result: answer }), stderr: '', exitCode: 0 }, { required: ['answer'] })
  assert.equal(missing.clean, true)
  assert.equal(Object.hasOwn(missing, 'stopReason'), false)
})

test('agy, codex and muse parse() never return a stop reason', () => {
  const { createAgy } = require('../plugins/aether/lib/harness/agy.js')
  const { createCodex } = require('../plugins/aether/lib/harness/codex.js')
  const { createMuse } = require('../plugins/aether/lib/harness/muse.js')
  const agy = createAgy({ groups: { g: 'Gemini Models' } })
  const agyOut = JSON.stringify({ conversation_id: 'c-1', status: 'SUCCESS', response: '{"answer":"x"}', structured_output: { answer: 'x' }, usage: { input_tokens: 1, output_tokens: 1 } })
  assert.equal(Object.hasOwn(agy.parse({ stdout: agyOut, stderr: '', exitCode: 0 }, { required: ['answer'] }), 'stopReason'), false)
  const codex = createCodex({ groups: { c: 'Codex' } })
  assert.equal(Object.hasOwn(codex.parse({ stdout: '', stderr: '', exitCode: 1 }, { required: [] }), 'stopReason'), false)
  const muse = createMuse({ groups: { m: 'Muse' } })
  assert.equal(Object.hasOwn(muse.parse({ stdout: '', stderr: '', exitCode: 1 }, { required: [] }), 'stopReason'), false)
})

test('a runTask whose chain stopped short keeps the judge line and stays pending', async (t) => {
  const run = require('../plugins/aether/lib/delegate-run.js')
  const EXTERNAL = { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } }
  const GROK = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high', group: 'grok' }
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  let n = 0
  const deps = { dataDir, cwd: repo.dir, now: () => 1000 + (n += 1), settings: EXTERNAL, newId: () => `gen-${n}`, pickPair: async () => ({ pick: GROK, quota: [] }) }
  await task.begin({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt: 'AETHER-TASK: ro-chain\nDo the work.' } }, deps)
  const cut = await run.runTask({ id: 'ro-chain', session: 's1', cwd: repo.dir, dataDir }, { runChain: async () => ({ ok: true, status: 'ok', text: 'cut', attribution: 'a', stopReason: 'length', attempts: [], changed: [] }) })
  assert.match(cut.text, /Judge it: aether-delegate verdict --task ro-chain --verdict approve\|fix\|infeasible/)
  assert.doesNotMatch(cut.text, /Closed by the system/)
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's1' }).map((x) => x.task), ['ro-chain'])
  assert.deepEqual(log.readEntries(dataDir, { task: 'ro-chain' }).filter((e) => e.kind === 'verdict'), [])

  const repo2 = makeRepo(t)
  const dataDir2 = tempDir(t, 'aether-data-')
  let m = 0
  const deps2 = { dataDir: dataDir2, cwd: repo2.dir, now: () => 1000 + (m += 1), settings: EXTERNAL, newId: () => `gen-${m}`, pickPair: async () => ({ pick: GROK, quota: [] }) }
  await task.begin({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt: 'AETHER-TASK: ro-whole\nDo the work.' } }, deps2)
  const whole = await run.runTask({ id: 'ro-whole', session: 's1', cwd: repo2.dir, dataDir: dataDir2 }, { runChain: async () => ({ ok: true, status: 'ok', text: 'the answer', attribution: 'a', attempts: [], changed: [] }) })
  assert.match(whole.text, /Closed by the system as approved: the read-only checks passed/)
  assert.deepEqual(unverdictedDelegates({ dataDir: dataDir2, session: 's1' }), [])
})
