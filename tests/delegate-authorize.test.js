'use strict'

// The owner's authorization of a delegate task on a model above the first rung (spec 021): the verb that records the
// owner's words, the cover that begin honors on a task's first launch, and the step a task starts on. The transcripts
// are fake: JSONL records shaped like Claude Code's, written where CLAUDE_CONFIG_DIR would point (as tests/autonomy.test.js).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const auth = require('../plugins/aether/lib/delegate-authorize.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const ladderLib = require('../plugins/aether/lib/ladder.js')

const SESSION = 'sess-lead-1'
const BIN = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-delegate')
const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }
const SUPER = { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } }
const GROK = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high', group: 'grok' }
const FINDING = 'src/a.js:3: the empty case is missing'
const F = (n) => `src/f${n}.js:${n}: missing case ${n}`

// The owner's words, as they would sit in a transcript. Each names a model, or (STRONGEST) does not.
const OPUS_WORDS = 'despliega un agente que lo haga en Opus, en español natural'
const SONNET_WORDS = 'pásalo a Sonnet para esto, por favor'
const STRONGEST = 'pon el más fuerte para esto, gracias por todo'

// A Claude config directory with one transcript per session; sessions maps a session id to the owner's messages.
function transcripts(t, sessions) {
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  for (const [id, messages] of Object.entries(sessions)) {
    const lines = messages.map((text) => JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: '2026-10-29T10:00:00.000Z', message: { role: 'user', content: text } }))
    fs.writeFileSync(path.join(folder, `${id}.jsonl`), lines.join('\n') + '\n')
  }
  return { configDir, file: (id) => path.join(folder, `${id}.jsonl`) }
}

// A data directory, the transcripts of the session, and the deps begin and verdict take (the pair choice is recorded).
function world(t, { settings = NATIVE, pick = null, sessions = { [SESSION]: [OPUS_WORDS] } } = {}) {
  const dataDir = tempDir(t, 'aether-data-')
  const dirs = transcripts(t, sessions)
  const asked = []
  let n = 0
  const deps = {
    dataDir,
    cwd: dataDir,
    configDir: dirs.configDir,
    now: () => 1000 + (n += 1),
    settings,
    newId: () => `gen-${n}`,
    pickPair: async (reference) => (asked.push(reference), { pick, quota: [] }),
  }
  return { dataDir, configDir: dirs.configDir, file: dirs.file, deps, asked }
}

const call = (prompt, extra = {}, session = SESSION) => ({ session, event: { subagent_type: 'general-purpose', description: 'd', prompt, ...extra } })
const BRIEF = (id, more = '') => `AETHER-TASK: ${id}\n${more}Do the work.`
const entries = (dataDir, id) => log.readEntries(dataDir, { task: id })
const authorized = (w, input, session = SESSION) =>
  auth.authorize({ session, ...input }, { dataDir: w.dataDir, configDir: w.configDir, now: () => 500 })
const authorizeLines = (dataDir) => log.readEntries(dataDir).filter((e) => e.kind === 'authorize')

// ---- 1: refusals write nothing ----

test('authorize refuses, and writes nothing, for a quote that is not the owner\'s words in this session (test 1)', (t) => {
  const cases = [
    [{ model: 'opus', quote: 'esta frase nunca la dijo el dueño', task: 'a1' }, /not in the owner's messages of session/],
    [{ model: 'opus', quote: 'Opus', task: 'a1' }, /at least 12 characters/],
    [{ model: 'opus', quote: 'redáctalo en Opus, dicho en otra sesión', task: 'a1' }, /not in the owner's messages of session/],
    [{ model: 'opus', quote: 'pon el más fuerte para esto', task: 'a1' }, /does not name opus/],
  ]
  for (const [input, error] of cases) {
    const w = world(t, { sessions: { [SESSION]: [OPUS_WORDS, STRONGEST], other: ['redáctalo en Opus, dicho en otra sesión'] } })
    const res = authorized(w, input)
    assert.equal(res.ok, false, JSON.stringify(input))
    assert.match(res.error, error)
    assert.equal(authorizeLines(w.dataDir).length, 0, 'a refusal writes no line')
    assert.equal(fs.existsSync(path.join(w.dataDir, 'delegates', 'log.jsonl')), false)
  }
})

test('authorize refuses, and writes nothing, for a model that is the first rung or names no rung, and for a bad scope or task (test 1)', (t) => {
  const cases = [
    [{ model: 'haiku', quote: OPUS_WORDS, task: 'a1' }, /first rung/],
    [{ model: 'claude-haiku-5', quote: OPUS_WORDS, task: 'a1' }, /first rung/],
    [{ model: 'gpt-9', quote: OPUS_WORDS, task: 'a1' }, /not a rung of the ladder/],
    [{ model: undefined, quote: OPUS_WORDS, task: 'a1' }, /not a rung of the ladder/],
    [{ model: 'opus', quote: OPUS_WORDS }, /--task <id> or --scope session/],
    [{ model: 'opus', quote: OPUS_WORDS, task: 'a1', scope: 'session' }, /cannot be given together/],
    [{ model: 'opus', quote: OPUS_WORDS, scope: 'repo' }, /--scope needs session/],
    [{ model: 'opus', quote: OPUS_WORDS, task: 'bad id!' }, /task id is letters/],
    [{ model: 'opus', quote: OPUS_WORDS, task: 'a1', session: undefined }, /no session/],
  ]
  for (const [input, error] of cases) {
    const w = world(t)
    const res = authorized(w, input)
    assert.equal(res.ok, false, JSON.stringify(input))
    assert.match(res.error, error)
    assert.equal(authorizeLines(w.dataDir).length, 0, 'a refusal writes no line')
  }
})

// ---- 2: acceptance and the recorded line ----

test('authorize accepts the owner\'s words that name Opus in any case or with 5.5, and records the scope, task, quote and time (test 2)', (t) => {
  const w = world(t, { sessions: { [SESSION]: ['redáctalo en Opus 5.5 por favor', 'en opus, en español natural'] } })
  const byTask = authorized(w, { model: 'claude-OPUS-5-5', quote: 'redáctalo en Opus 5.5 por favor', task: 'a2' })
  assert.equal(byTask.ok, true, byTask.error)
  assert.deepEqual(byTask.authorized, {
    kind: 'authorize', time: 500, session: SESSION, scope: 'task', task: 'a2', model: 'opus',
    quote: 'redáctalo en Opus 5.5 por favor', quoteTime: '2026-10-29T10:00:00.000Z',
  })
  assert.deepEqual(authorizeLines(w.dataDir), [byTask.authorized])
  const bySession = authorized(w, { model: 'opus', quote: 'en opus, en español natural', scope: 'session' })
  assert.deepEqual([bySession.ok, bySession.authorized.scope, bySession.authorized.task], [true, 'session', null])
})

// ---- 3: scope ----

test('a task permission covers its own task and no other of the session; a session permission covers every task of its session and none of another (test 3)', async (t) => {
  const w = world(t, { sessions: { [SESSION]: [OPUS_WORDS], other: [OPUS_WORDS] } })
  assert.equal(authorized(w, { model: 'opus', quote: OPUS_WORDS, task: 'a3' }).ok, true)
  const covered = await task.begin(call(BRIEF('a3'), { model: 'opus' }), w.deps)
  const sibling = await task.begin(call(BRIEF('a4'), { model: 'opus' }), w.deps)
  assert.deepEqual([covered.step, sibling.step], ['opus', 'haiku'])

  assert.equal(authorized(w, { model: 'opus', quote: OPUS_WORDS, scope: 'session' }).ok, true)
  assert.equal((await task.begin(call(BRIEF('a5'), { model: 'opus' }), w.deps)).step, 'opus')
  const elsewhere = await task.begin(call(BRIEF('a6'), { model: 'opus' }, 'other'), w.deps)
  assert.equal(elsewhere.step, 'haiku', 'a session permission does not cover another session')
})

// ---- 4: a covered first launch ----

test('a covered first launch starts on the rung at its first effort, notes the owner\'s word, never asks the pair choice, and is not ignored (test 4)', async (t) => {
  const w = world(t, { settings: SUPER, pick: GROK })
  assert.equal(authorized(w, { model: 'opus', quote: OPUS_WORDS, task: 'c4' }).ok, true)
  const plan = await task.begin(call(BRIEF('c4'), { model: 'opus' }), w.deps)
  assert.deepEqual([plan.step, plan.kind, plan.args.model, plan.args.effort], ['opus', 'first', 'opus', 'high'])
  assert.deepEqual(w.asked, [], 'superdelegation is on and a pair is free, yet the pair choice is not asked')
  assert.equal(plan.external, null)
  assert.match(plan.notes.join(' '), /owner/)
  const launch = entries(w.dataDir, 'c4').find((e) => e.kind === 'launch')
  assert.deepEqual(launch.authorized, { model: 'opus', scope: 'task', task: 'c4', quote: OPUS_WORDS, quoteTime: '2026-10-29T10:00:00.000Z' })
  assert.deepEqual([launch.requested, launch.ignored], [{ model: 'opus', effort: null }, false])
})

test('a covered model that also asks for another effort is still ignored on the effort (test 4)', async (t) => {
  const w = world(t)
  authorized(w, { model: 'opus', quote: OPUS_WORDS, task: 'c4b' })
  await task.begin(call(BRIEF('c4b'), { model: 'opus', effort: 'max' }), w.deps)
  assert.equal(entries(w.dataDir, 'c4b').find((e) => e.kind === 'launch').ignored, true)
})

// ---- 5: an Opus cover, a Sonnet one ----

test('an Opus permission covers a request for Sonnet; a Sonnet permission does not cover Opus (test 5)', async (t) => {
  const w = world(t, { sessions: { [SESSION]: [OPUS_WORDS, SONNET_WORDS] } })
  authorized(w, { model: 'opus', quote: OPUS_WORDS, task: 'p5' })
  const sonnet = await task.begin(call(BRIEF('p5'), { model: 'sonnet' }), w.deps)
  assert.deepEqual([sonnet.step, sonnet.args.model, sonnet.args.effort], ['sonnet', 'sonnet', 'high'])

  authorized(w, { model: 'sonnet', quote: SONNET_WORDS, task: 'p6' })
  const opus = await task.begin(call(BRIEF('p6'), { model: 'opus' }), w.deps)
  assert.deepEqual([opus.step, opus.args.model], ['haiku', 'haiku'])
  assert.match(opus.notes.join(' '), /no owner authorization covers/)
})

// ---- 6: no cover, the old behavior ----

test('without a cover the request is ignored as before, with a note on how to record one; haiku or a name with no rung gets no note (test 6)', async (t) => {
  const w = world(t)
  const plan = await task.begin(call(BRIEF('n6'), { model: 'opus' }), w.deps)
  assert.deepEqual([plan.step, plan.args.model], ['haiku', 'haiku'])
  assert.equal(entries(w.dataDir, 'n6').find((e) => e.kind === 'launch').ignored, true)
  const note = plan.notes.join(' ')
  assert.match(note, /no owner authorization covers opus/)
  assert.match(note, /aether-delegate authorize --model opus/)
  for (const model of ['haiku', 'gpt-9']) {
    const quiet = await task.begin(call(BRIEF(`n-${model}`), { model }), w.deps)
    assert.doesNotMatch(quiet.notes.join(' '), /no owner authorization/, `${model} gets no note`)
  }
})

// ---- 7: a later authorization changes nothing ----

test('an authorization recorded after the first launch changes nothing for that task (test 7)', async (t) => {
  const w = world(t)
  const first = await task.begin(call(BRIEF('l7'), { model: 'opus' }), w.deps)
  assert.equal(first.step, 'haiku')
  assert.equal(authorized(w, { model: 'opus', quote: OPUS_WORDS, task: 'l7' }).ok, true)
  await task.verdict({ task: 'l7', verdict: 'fix', findings: [FINDING] }, w.deps)
  const again = await task.begin(call(BRIEF('l7'), { model: 'opus' }), w.deps)
  assert.deepEqual([again.step, again.kind, again.args.model], ['haiku', 'fix', 'haiku'])
})

// ---- 8: exhaustion from the placed rung ----

test('an Opus task has one correction and then is exhausted; a Sonnet task has two and rises to Opus, with the rung it is on (test 8)', async (t) => {
  const w = world(t, { sessions: { [SESSION]: [OPUS_WORDS, SONNET_WORDS] } })
  authorized(w, { model: 'opus', quote: OPUS_WORDS, task: 'o8' })
  await task.begin(call(BRIEF('o8'), { model: 'opus' }), w.deps)
  const once = await task.verdict({ task: 'o8', verdict: 'fix', findings: [F(1)] }, w.deps)
  assert.deepEqual([once.ok, once.next.kind, once.next.step, once.corrections], [true, 'fix', 'opus', { used: 1, cap: 1 }])
  const spent = await task.verdict({ task: 'o8', verdict: 'fix', findings: [F(2)] }, w.deps)
  assert.deepEqual([spent.next.kind, spent.next.step, spent.next.cause], ['exhausted', null, 'exhausted'])
  assert.equal((await task.begin(call(BRIEF('o8'), { model: 'opus' }), w.deps)).kind, 'refused')

  authorized(w, { model: 'sonnet', quote: SONNET_WORDS, task: 's8' })
  const sonnet = await task.begin(call(BRIEF('s8'), { model: 'sonnet' }), w.deps)
  assert.deepEqual([sonnet.step, sonnet.args.model, sonnet.args.effort], ['sonnet', 'sonnet', 'high'])
  const c1 = await task.verdict({ task: 's8', verdict: 'fix', findings: [F(1)] }, w.deps)
  assert.deepEqual([c1.next.step, c1.corrections], ['sonnet', { used: 1, cap: 2 }])
  const c2 = await task.verdict({ task: 's8', verdict: 'fix', findings: [F(2)] }, w.deps)
  assert.deepEqual([c2.next.step, c2.corrections], ['sonnet', { used: 2, cap: 2 }])
  const risen = await task.verdict({ task: 's8', verdict: 'fix', findings: [F(3)] }, w.deps)
  assert.deepEqual([risen.next.kind, risen.next.step, risen.next.cause, risen.step, risen.corrections], ['rise', 'opus', 'exhausted', 'opus', { used: 0, cap: 1 }])
  const plan = await task.begin(call(BRIEF('s8'), { model: 'sonnet' }), w.deps)
  assert.deepEqual([plan.step, plan.kind, plan.args.model, plan.args.effort], ['opus', 'rise', 'opus', 'high'])
})

// ---- 9: a placed task stays on Claude ----

test('a task the owner placed runs on Claude in every attempt, corrections and rises included, with the pair choice on (test 9)', async (t) => {
  const w = world(t, { settings: SUPER, pick: GROK, sessions: { [SESSION]: [SONNET_WORDS] } })
  authorized(w, { model: 'sonnet', quote: SONNET_WORDS, task: 'z9' })
  const first = await task.begin(call(BRIEF('z9'), { model: 'sonnet' }), w.deps)
  assert.deepEqual([first.external, first.args.model], [null, 'sonnet'])
  await task.verdict({ task: 'z9', verdict: 'fix', findings: [F(1)] }, w.deps)
  const fixed = await task.begin(call(BRIEF('z9'), { model: 'sonnet' }), w.deps)
  assert.deepEqual([fixed.external, fixed.args.model, fixed.args.effort], [null, 'sonnet', 'high'])
  await task.verdict({ task: 'z9', verdict: 'fix', findings: [F(2)] }, w.deps)
  await task.verdict({ task: 'z9', verdict: 'fix', findings: [F(3)] }, w.deps)
  const risen = await task.begin(call(BRIEF('z9'), { model: 'sonnet' }), w.deps)
  assert.deepEqual([risen.kind, risen.external, risen.args.model], ['rise', null, 'opus'])
  assert.deepEqual(w.asked, [], 'the pair choice is never asked for the placed task')
})

// ---- 12: the cover is checked again, and a forged line covers nothing ----

test('a forged authorize line whose quote is not in the transcript covers nothing; an earlier valid line still covers (test 12 a)', async (t) => {
  const w = world(t)
  log.appendEntry(w.dataDir, { kind: 'authorize', time: 400, session: SESSION, scope: 'task', task: 'f12', model: 'opus', quote: 'una frase que el dueño nunca escribió', quoteTime: '2026-10-29T10:00:00.000Z' })
  const forged = await task.begin(call(BRIEF('f12'), { model: 'opus' }), w.deps)
  assert.equal(forged.step, 'haiku')
  assert.match(forged.notes.join(' '), /no owner authorization covers opus/)

  assert.equal(authorized(w, { model: 'opus', quote: OPUS_WORDS, task: 'f12b' }).ok, true)
  log.appendEntry(w.dataDir, { kind: 'authorize', time: 600, session: SESSION, scope: 'task', task: 'f12b', model: 'opus', quote: 'una frase que el dueño nunca escribió', quoteTime: '2026-10-29T10:00:00.000Z' })
  const above = await task.begin(call(BRIEF('f12b'), { model: 'opus' }), w.deps)
  assert.equal(above.step, 'opus', 'the last line fails, the earlier one passes')
})

test('a call without AETHER-TASK gets a generated id that a task permission does not cover, while a session permission does (test 12 b)', async (t) => {
  const w = world(t)
  let k = 0
  w.deps.newId = () => `gen-${(k += 1)}`
  authorized(w, { model: 'opus', quote: OPUS_WORDS, task: 'gen-1' })
  const generated = await task.begin(call('Do the work.', { model: 'opus' }), w.deps)
  assert.equal(generated.id, 'gen-1', 'the generated id is the one the permission names, and still not covered')
  assert.equal(generated.step, 'haiku')
  authorized(w, { model: 'opus', quote: OPUS_WORDS, scope: 'session' })
  const bySession = await task.begin(call('Do the work.', { model: 'opus' }), w.deps)
  assert.equal(bySession.step, 'opus')
})

test('a request for the full name claude-opus-5-5, covered by an Opus permission, is honored (test 12 c)', async (t) => {
  const w = world(t)
  authorized(w, { model: 'opus', quote: OPUS_WORDS, task: 'h12' })
  const plan = await task.begin(call(BRIEF('h12'), { model: 'claude-opus-5-5' }), w.deps)
  assert.equal(plan.step, 'opus')
  const launch = entries(w.dataDir, 'h12').find((e) => e.kind === 'launch')
  assert.deepEqual([launch.requested.model, launch.ignored], ['claude-opus-5-5', false])
})

test('a launch added by hand does not move a task off its first step: a fake step, a bad or wrong-model quote discard it, a readable transcript that changed discards it, an unreadable one keeps it (test 12 d)', async (t) => {
  const w = world(t, { sessions: { [SESSION]: [OPUS_WORDS, SONNET_WORDS] } })
  const launchLine = (task_, extra = {}) => ({ kind: 'launch', time: 300, session: SESSION, task: task_, step: 'opus', attempt: 1, launchKind: 'first', effort: 'high', edits: false, owns: [], tests: null, description: 'd', requested: null, ignored: false, pin: null, base: null, dirty: null, ...extra })

  log.appendEntry(w.dataDir, launchLine('d-plain'))
  assert.equal((await task.begin(call(BRIEF('d-plain')), w.deps)).step, 'haiku', 'a launch with no authorized is not an opus start')

  const fakeQuote = { model: 'opus', scope: 'task', task: 'd-fake', quote: 'una frase que el dueño nunca escribió', quoteTime: 'x' }
  log.appendEntry(w.dataDir, launchLine('d-fake', { authorized: fakeQuote }))
  assert.equal((await task.begin(call(BRIEF('d-fake')), w.deps)).step, 'haiku', 'a quote that is not in a readable transcript discards the step')

  const wrongModel = { model: 'opus', scope: 'task', task: 'd-wrong', quote: SONNET_WORDS, quoteTime: 'x' }
  log.appendEntry(w.dataDir, launchLine('d-wrong', { authorized: wrongModel }))
  assert.equal((await task.begin(call(BRIEF('d-wrong')), w.deps)).step, 'haiku', 'a quote that does not name the model discards the step')

  assert.equal(authorized(w, { model: 'opus', quote: OPUS_WORDS, task: 'd-keep' }).ok, true)
  assert.equal((await task.begin(call(BRIEF('d-keep'), { model: 'opus' }), w.deps)).step, 'opus')
  fs.renameSync(w.file(SESSION), `${w.file(SESSION)}.moved`)
  const moved = await task.begin(call(BRIEF('d-keep'), { model: 'opus' }), w.deps)
  assert.deepEqual([moved.step, moved.kind], ['opus', 'unjudged'], 'a transcript that cannot be read does not discard the step')
  fs.renameSync(`${w.file(SESSION)}.moved`, w.file(SESSION))
  fs.writeFileSync(w.file(SESSION), JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: '2026-10-29T11:00:00.000Z', message: { role: 'user', content: 'otro mensaje sin cita' } }) + '\n')
  const changed = await task.begin(call(BRIEF('d-keep'), { model: 'opus' }), w.deps)
  assert.deepEqual([changed.step, changed.kind], ['haiku', 'unjudged'], 'a readable transcript without the quote discards the step of the first launch')
  const fresh = await task.begin(call(BRIEF('d-keep2'), { model: 'opus' }), w.deps)
  assert.equal(fresh.step, 'haiku', 'a new task has no cover from the permission of another task')
})

// ---- 13: the bin ----

test('the bin records the owner\'s quote from the command line, reads the session from CLAUDE_CODE_SESSION_ID, and exits 1 on a wrong use (test 13)', (t) => {
  const w = world(t)
  const env = { ...process.env, AETHER_DATA_DIR: w.dataDir, CLAUDE_CONFIG_DIR: w.configDir, CLAUDE_CODE_SESSION_ID: SESSION }
  const run = (...args) => spawnSync(process.execPath, [BIN, 'authorize', ...args], { encoding: 'utf8', env })

  const ok = run('--model', 'opus', '--quote', OPUS_WORDS, '--task', 'b13')
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(JSON.parse(ok.stdout.trim()).ok, true)
  assert.equal(ok.stdout.trim().split('\n').length, 1, 'one JSON line')

  const refused = run('--model', 'opus', '--quote', 'nunca lo dijo el dueño', '--scope', 'session')
  assert.equal(refused.status, 0)
  assert.equal(JSON.parse(refused.stdout.trim()).ok, false)

  const usage = run('--model', 'opus', '--task', 'b13')
  assert.equal(usage.status, 1)
  assert.match(JSON.parse(usage.stdout.trim()).error, /usage: aether-delegate authorize/)

  const bare = spawnSync(process.execPath, [BIN, 'authorize', '--model', 'opus', '--quote', OPUS_WORDS, '--scope', 'session', '--session', SESSION], { encoding: 'utf8', env: { ...env, CLAUDE_CODE_SESSION_ID: '' } })
  assert.equal(JSON.parse(bare.stdout.trim()).ok, true, 'an explicit --session stands in for the environment')
  assert.equal(authorizeLines(w.dataDir).length, 2)
})

// The cover reads the entries of its own session only.
test('the cover reads the log of the session it is asked for, and a null session covers nothing', (t) => {
  const w = world(t)
  authorized(w, { model: 'opus', quote: OPUS_WORDS, scope: 'session' })
  const lines = log.readEntries(w.dataDir, { session: SESSION })
  const ladder = ladderLib.loadLadder()
  const rung = ladder.rungs[2]
  assert.equal(auth.coverOf(lines, { session: SESSION, task: 'any', rung, ladder, configDir: w.configDir })?.scope, 'session')
  assert.equal(auth.coverOf(lines, { session: null, task: 'any', rung, ladder, configDir: w.configDir }), null)
})
