'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const replay = require('../plugins/aether/lib/router-replay.js')
const crit = require('../plugins/aether/lib/router-criterion.js')
const { loadRungs } = require('../plugins/aether/lib/router-rungs.js')
const { loadPrices } = require('../plugins/aether/lib/prices.js')
const reference = require('../plugins/aether/lib/router-reference.js')
const route = require('../plugins/aether/lib/route.js')
const session = require('../plugins/aether/lib/session.js')
const log = require('../plugins/aether/lib/router-log.js')

const criterion = crit.loadCriterion()
const rungs = loadRungs()
const prices = loadPrices()
const fallback = { alias: 'sonnet', effort: 'high' }

const answers = (over = {}) => ({
  shape: { choice: 'lookup', confidence: 0.95 },
  stakes: { score: 0.9, confidence: 0.95 },
  reads_a_lot: { score: 0.5, confidence: 0.9 },
  pinned_by_checks: { noul: 0.2, confidence: 0.9 },
  needs_judgment: { noul: 0.3, confidence: 0.9 },
  edits_files: { noul: 0.02, confidence: 0.95 },
  many_steps: { noul: 0.05, confidence: 0.9 },
  ...over,
})
const assistant = (usage) => JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-5-5', usage } })
const USAGE = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 20000, cache_creation: { ephemeral_5m_input_tokens: 2000, ephemeral_1h_input_tokens: 0 } }

function projects(t) {
  const root = tempDir(t)
  const proj = path.join(root, '-home-u-work')
  const call = (id, prompt, extra = {}) => JSON.stringify({ type: 'assistant', timestamp: '2026-10-14T10:00:00Z', message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { description: `task ${id}`, subagent_type: 'general-purpose', prompt, ...extra } }] } })
  fs.mkdirSync(path.join(proj, 'sess1', 'subagents'), { recursive: true })
  fs.writeFileSync(path.join(proj, 'sess1.jsonl'), [
    call('toolu_1', 'Find where the header is defined.', { model: 'opus' }),
    call('toolu_2', `Use this key sk-${'a'.repeat(30)} to call the API.`, { model: 'sonnet', effort: 'high' }),
  ].join('\n') + '\n')
  fs.writeFileSync(path.join(proj, 'sess1', 'subagents', 'agent-a.meta.json'), JSON.stringify({ toolUseId: 'toolu_1', agentType: 'general-purpose' }))
  fs.writeFileSync(path.join(proj, 'sess1', 'subagents', 'agent-a.jsonl'), `${assistant(USAGE)}\n`)
  fs.mkdirSync(path.join(root, '-tmp-scratch'))
  fs.writeFileSync(path.join(root, '-tmp-scratch', 's.jsonl'), call('toolu_9', 'ignored') + '\n')
  return root
}

test('extractCorpus finds each delegation with its real cost, and never keeps a prompt that holds a secret', (t) => {
  const rows = replay.extractCorpus({ projectsDir: projects(t) })
  assert.deepEqual(rows.map((r) => r.id), ['toolu_1', 'toolu_2'])
  const [first, second] = rows
  assert.equal(first.modelParam, 'opus')
  assert.equal(first.subagentType, 'general-purpose')
  assert.equal(first.secret, false)
  assert.equal(first.prompt, 'Find where the header is defined.')
  assert.equal(first.actual.model, 'claude-opus-5-5')
  assert.equal(first.actual.turns, 1)
  assert.deepEqual(first.actual.reqs, [[1000, 500, 20000, 2000, 0]])
  assert.ok(Math.abs(first.actual.cost - 0.028) < 1e-9)
  assert.equal(second.secret, true)
  assert.equal(second.prompt, null)
  assert.equal(second.actual, null)
  assert.equal(second.effortParam, 'high')
  assert.deepEqual(replay.extractCorpus({ projectsDir: projects(t), projects: ['nothing-like-this'] }), [])
})

test('one request is counted once however many transcript lines repeat its usage', (t) => {
  const root = tempDir(t)
  const proj = path.join(root, '-home-u-work')
  fs.mkdirSync(path.join(proj, 'sess1', 'subagents'), { recursive: true })
  fs.writeFileSync(path.join(proj, 'sess1.jsonl'), JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'Agent', input: { prompt: 'Find it.' } }] } }) + '\n')
  fs.writeFileSync(path.join(proj, 'sess1', 'subagents', 'agent-a.meta.json'), JSON.stringify({ toolUseId: 'toolu_1', agentType: 'general-purpose' }))
  const line = (requestId, id, output, over = {}) => JSON.stringify({ type: 'assistant', requestId, message: { id, model: 'claude-opus-5-5', usage: { ...USAGE, output_tokens: output }, ...over } })
  fs.writeFileSync(path.join(proj, 'sess1', 'subagents', 'agent-a.jsonl'), [
    line('req_1', 'msg_1', 8),
    line('req_1', 'msg_1', 8),
    line('req_1', 'msg_1', 500),
    line('req_2', 'msg_2', 500),
    JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-5-5', usage: USAGE } }),
  ].join('\n') + '\n')
  const [row] = replay.extractCorpus({ projectsDir: root })
  assert.equal(row.actual.turns, 3, 'msg_1 once, msg_2 once, the line with no id as before')
  assert.deepEqual(row.actual.reqs, [[1000, 500, 20000, 2000, 0], [1000, 500, 20000, 2000, 0], [1000, 500, 20000, 2000, 0]], 'the last line of a message holds its final usage')
  assert.ok(Math.abs(row.actual.cost - 3 * 0.028) < 1e-9)
})

test('replay says what the decider would have chosen against what the Lead chose, and what each cost (C11)', async (t) => {
  const rows = replay.extractCorpus({ projectsDir: projects(t) })
  const asked = []
  const report = await replay.replay({ rows, criterion, rungs, prices, fallback, answersFor: async (row) => { asked.push(row.id); return answers() } })
  assert.deepEqual(asked, ['toolu_1'], 'a row with a secret is never sent anywhere')
  assert.equal(report.totals.n, 1)
  assert.equal(report.totals.skipped, 1)
  const [row] = report.rows
  assert.deepEqual({ model: row.lead.model, effort: row.lead.effort }, { model: 'opus', effort: 'xhigh' }, 'the call named no effort: the inherited one, the Lead\'s (A63)')
  assert.ok(Math.abs(row.lead.usd - 0.028) < 1e-9)
  assert.equal(row.decision.level, 'A')
  assert.equal(row.decision.alias, 'haiku')
  assert.equal(row.decision.effort, 'low')
  assert.equal(row.changed, true)
  assert.ok(Math.abs(row.estimatedUsd - 0.0008) < 1e-9, 'haiku rates over the same tokens')
  assert.ok(Math.abs(report.totals.leadUsd - 0.028) < 1e-9)
  assert.ok(Math.abs(report.totals.deciderUsd - 0.0008) < 1e-9)
})

test('a decider that fails is counted as a fallback and changes nothing (C10)', async (t) => {
  const rows = replay.extractCorpus({ projectsDir: projects(t) })
  const report = await replay.replay({ rows, criterion, rungs, prices, fallback, answersFor: async () => ({ failure: 'timeout' }) })
  const [row] = report.rows
  assert.equal(row.fallback, 'decider: timeout')
  assert.equal(row.decision, null)
  assert.equal(row.changed, false)
  assert.equal(row.estimatedUsd, row.lead.usd)
  assert.equal(report.totals.fallback, 1)
  assert.equal(report.totals.changed, 0)
})

test('a quality gate keeps the Lead level in the replay (R6)', async (t) => {
  const rows = replay.extractCorpus({ projectsDir: projects(t) })
  const report = await replay.replay({ rows, criterion, rungs, prices, fallback, answersFor: async () => answers({ shape: { choice: 'audit', confidence: 0.95 } }) })
  assert.equal(report.rows[0].decision.level, 'D')
})

test('replayJournal decides the recorded answers again, and shows what the new criterion moves (scenario 12)', () => {
  const entries = [
    { kind: 'decision', id: 'a', requested: { model: 'opus', effort: null }, asked: { alias: 'opus', effort: 'xhigh', level: 'D' }, answers: answers(), decision: { level: 'A', alias: 'haiku', effort: 'low' }, description: 'find header' },
    { kind: 'decision', id: 'b', requested: null, asked: null, answers: answers({ shape: { choice: 'explore', confidence: 0.95 } }), decision: { level: 'B', alias: 'haiku', effort: 'high' }, description: 'explain order' },
    { kind: 'decision', id: 'c', requested: null, asked: null, answers: null, decision: null, description: 'no answers' },
    { kind: 'spawn', id: 'a', agentId: 'x' },
  ]
  const same = replay.replayJournal({ entries, criterion, rungs, prices, fallback })
  assert.equal(same.rows.length, 2)
  assert.equal(same.totals.changed, 0)
  assert.equal(same.totals.skipped, 1)
  const stricter = structuredClone(criterion)
  stricter.base.lookup = 'C'
  const moved = replay.replayJournal({ entries, criterion: stricter, rungs, prices, fallback })
  assert.equal(moved.totals.changed, 1)
  const row = moved.rows.find((r) => r.id === 'a')
  assert.equal(row.changed, true)
  assert.deepEqual({ level: row.previous.level, alias: row.previous.alias }, { level: 'A', alias: 'haiku' })
  assert.equal(row.decision.level, 'C')
  assert.equal(row.decision.alias, 'sonnet')
})

// An exec stub in the shape of promisify(execFile): a promise that carries the child, whose stdin the caller writes.
function stubExec(reply, log) {
  return (command, args, options) => {
    const call = { command, args, options, stdin: null, cwdFiles: null, cwdExists: fs.existsSync(options.cwd) }
    if (call.cwdExists) call.cwdFiles = fs.readdirSync(options.cwd)
    log.push(call)
    const promise = Promise.resolve({ stdout: reply })
    promise.child = { stdin: { on() {}, end(data) { call.stdin = data } } }
    return promise
  }
}

test('askDecider asks Haiku through a bare claude -p, or Jev over HTTP, and a failure is a fallback', async () => {
  const text = JSON.stringify(answers())
  const calls = []
  const execFile = stubExec(JSON.stringify({ result: text }), calls)
  const task = { description: 'find header', prompt: 'Find where the header is defined.' }
  const got = await replay.askDecider({ decider: 'haiku', task, criterion, deps: { execFile, timeoutMs: 8000 } })
  assert.deepEqual(got, answers())
  const [seen] = calls
  assert.equal(seen.command, 'claude')
  for (const arg of ['-p', '--model', 'haiku', '--effort', 'low', '--output-format', 'json']) assert.ok(seen.args.includes(arg), arg)
  const broken = await replay.askDecider({ decider: 'haiku', task, criterion, deps: { timeoutMs: 8000, execFile: stubExec(JSON.stringify({ result: 'nope' }), []) } })
  assert.deepEqual(broken, { failure: 'unreadable' })
  const jev = await replay.askDecider({ decider: 'jev', task, criterion, deps: { timeoutMs: 3000, env: { OPENROUTER_API_KEY: 'k' }, fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ answers: answers() }) }) } })
  assert.deepEqual(jev, answers())
  assert.deepEqual(await replay.askDecider({ decider: 'jev', task, criterion, deps: { timeoutMs: 3000, env: {}, fetch: async () => { throw new Error('no') } } }), { failure: 'no-key' })
})

test('the Haiku replay is the bare decider request: stdin, an empty temporary directory, no tools, no settings, no session (R28)', async () => {
  const calls = []
  const execFile = stubExec(JSON.stringify({ result: JSON.stringify(answers()) }), calls)
  const prompt = `Find the header.\n${'x'.repeat(300 * 1024)}`
  const got = await replay.askDecider({ decider: 'haiku', task: { description: 'find header', prompt }, criterion, deps: { execFile, timeoutMs: 8000 } })
  assert.deepEqual(got, answers())
  const [seen] = calls
  assert.ok(seen.stdin.includes('x'.repeat(1000)) && seen.stdin.includes('<brief>'), 'the whole prompt goes on stdin')
  assert.ok(seen.args.every((arg) => arg.length < 1024), 'nothing large on argv')
  assert.ok(!seen.args.includes(seen.stdin), 'the prompt is not an argument')
  const at = (flag) => seen.args.indexOf(flag)
  assert.equal(seen.args[at('--tools') + 1], '', 'no tools')
  for (const flag of ['--safe-mode', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--system-prompt']) assert.ok(at(flag) !== -1, flag)
  assert.ok(!seen.args.includes('--bare'), '--bare would need an API key')
  assert.ok(seen.cwdExists, 'the cwd exists while the call runs')
  assert.deepEqual(seen.cwdFiles, [], 'and it is empty')
  assert.ok(path.resolve(seen.options.cwd).startsWith(path.resolve(os.tmpdir()) + path.sep), 'inside the temporary directory')
  assert.equal(fs.existsSync(seen.options.cwd), false, 'removed afterwards')
  await replay.askDecider({ decider: 'haiku', task: { description: 'd', prompt: 'p' }, criterion, deps: { execFile: (command, args, options) => { calls.push({ options }); const p = Promise.reject(new Error('boom')); p.catch(() => {}); p.child = { stdin: { on() {}, end() {} } }; return p }, timeoutMs: 8000 } })
  assert.equal(fs.existsSync(calls[1].options.cwd), false, 'removed when the call fails too')
})

test('formatReport ends with the counts', async (t) => {
  const rows = replay.extractCorpus({ projectsDir: projects(t) })
  const report = await replay.replay({ rows, criterion, rungs, prices, fallback, answersFor: async () => ({ failure: 'timeout' }) })
  const out = replay.formatReport(report)
  for (const line of ['delegations: 1', 'fallback: 1', 'changed: 0']) assert.ok(out.split('\n').includes(line), line)
  assert.ok(out.includes('toolu_1'))
})

// ---- fix G3: the replay decides as the router decides ----

test('the reference rung, the floor and the Claude rung of a level are one function for the router and the replay', () => {
  assert.deepEqual(reference.askedOf({ model: 'opus', effort: 'xhigh' }, rungs, criterion), { alias: 'opus', effort: 'xhigh' })
  assert.deepEqual(reference.askedOf({ model: 'claude-opus-5-5', effort: null }, rungs, criterion), { alias: 'opus', effort: criterion.inheritedEffort }, 'an effort the Lead left out is the inherited one')
  assert.equal(reference.askedOf({ model: null, effort: 'high' }, rungs, criterion), null, 'an effort alone names no rung')
  assert.equal(reference.askedOf({ model: 'gpt-5', effort: 'high' }, rungs, criterion), null)
  assert.equal(reference.askedOf(null, rungs, criterion), null)
  // A63: the inherited effort is the Lead's, xhigh; a Sonnet that names no effort has the floor of Sonnet xhigh, level C (it was D at max, A62).
  for (const [alias, floor] of [['haiku', 'B'], ['sonnet', 'C'], ['opus', 'D']]) {
    const inherited = reference.askedOf({ model: alias, effort: null }, rungs, criterion)
    assert.deepEqual(inherited, { alias, effort: 'xhigh' }, `${alias} with no effort asks for xhigh`)
    assert.equal(reference.stanceOf(rungs, { asked: inherited, standard: fallback, axis: 'general' }).floor, floor, `the floor of ${alias} at xhigh`)
  }

  const asked = { alias: 'opus', effort: 'xhigh' }
  const standard = { alias: 'sonnet', effort: 'high' }
  const withAsked = reference.stanceOf(rungs, { asked, standard, axis: 'general' })
  assert.deepEqual(withAsked, { reference: asked, floor: 'D' })
  const without = reference.stanceOf(rungs, { asked: null, standard, axis: 'general' })
  assert.deepEqual(without, { reference: standard, floor: 'C' })

  const atFloor = reference.claudeRungAt(rungs, { ...withAsked, level: 'D', axis: 'general' })
  assert.deepEqual({ alias: atFloor.claudeRung.alias, effort: atFloor.claudeRung.effort }, { alias: 'opus', effort: 'xhigh' }, 'at the floor the call keeps the reference rung, although a cheaper rung has the same level')
  assert.deepEqual({ alias: atFloor.sameLevel.alias, effort: atFloor.sameLevel.effort }, { alias: 'sonnet', effort: 'max' }, 'and the cheapest rung of the level is the one an external delegate falls back to')
  const below = reference.claudeRungAt(rungs, { ...withAsked, level: 'A', axis: 'general' })
  assert.deepEqual({ alias: below.claudeRung.alias, effort: below.claudeRung.effort }, { alias: 'haiku', effort: 'low' })
  assert.equal(below.claudeRung, below.sameLevel)
})

const lookupRow = (over = {}) => ({
  id: 'toolu_x', description: 'a delegation', subagentType: 'general-purpose', modelParam: null, effortParam: null, prompt: 'Find the header.', secret: false,
  actual: { model: 'claude-opus-5-5', cost: 0.028, turns: 1, reqs: [[1000, 500, 20000, 2000, 0]] },
  ...over,
})
const AUDIT = { shape: { choice: 'audit', confidence: 0.95 } }

test('a decision kept at the Lead floor keeps the rung the Lead asked for: the same criterion changes nothing (history)', async () => {
  const row = lookupRow({ modelParam: 'opus', effortParam: 'xhigh' })
  const report = await replay.replay({ rows: [row], criterion, rungs, prices, fallback, answersFor: async () => answers(AUDIT) })
  const [got] = report.rows
  assert.equal(got.decision.level, 'D')
  assert.deepEqual({ alias: got.decision.alias, effort: got.decision.effort }, { alias: 'opus', effort: 'xhigh' }, 'not the cheapest rung of level D')
  assert.equal(got.changed, false)
  assert.equal(got.estimatedUsd, got.lead.usd)
  assert.equal(report.totals.changed, 0)
})

test('the floor is what the Lead asked in the call, never the model that ran: a call with no model has the fallback as the reference (history)', async () => {
  const row = lookupRow()
  const ran = await replay.replay({ rows: [row], criterion, rungs, prices, fallback, answersFor: async () => answers(AUDIT) })
  const [got] = ran.rows
  assert.deepEqual({ model: got.lead.model, effort: got.lead.effort }, { model: 'opus', effort: 'xhigh' }, 'what ran is still what the report shows, with the inherited effort of the Lead (A63)')
  assert.equal(got.decision.level, 'C', 'the floor is the fallback sonnet high, not the opus that ran')
  assert.deepEqual({ alias: got.decision.alias, effort: got.decision.effort }, { alias: 'sonnet', effort: 'high' })
  assert.equal(got.changed, true, 'the router would have rewritten the inherited opus xhigh')
  const opus = await replay.replay({ rows: [row], criterion, rungs, prices, fallback: { alias: 'opus', effort: 'high' }, answersFor: async () => answers(AUDIT) })
  assert.deepEqual({ alias: opus.rows[0].decision.alias, effort: opus.rows[0].decision.effort }, { alias: 'opus', effort: 'high' }, 'the fallback option is the reference')
  const effortOnly = await replay.replay({ rows: [lookupRow({ effortParam: 'max' })], criterion, rungs, prices, fallback, answersFor: async () => answers(AUDIT) })
  assert.equal(effortOnly.rows[0].decision.level, 'C', 'an effort with no model names no rung')
})

test('a delegation to an aether agent is never replayed: the router never routes it, so nothing is asked and nothing is saved', async (t) => {
  const root = tempDir(t)
  const proj = path.join(root, '-home-u-work')
  fs.mkdirSync(proj, { recursive: true })
  const call = (id, subagentType) => JSON.stringify({ type: 'assistant', timestamp: '2026-10-14T10:00:00Z', message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { description: id, subagent_type: subagentType, prompt: `Review the package of ${id}.` } }] } })
  fs.writeFileSync(path.join(proj, 'sess1.jsonl'), [call('toolu_j', 'aether:judge'), call('toolu_r', 'aether:reviewer'), call('toolu_w', 'aether:writer'), call('toolu_p', 'other-plugin:agent'), call('toolu_g', 'general-purpose')].join('\n') + '\n')
  const rows = replay.extractCorpus({ projectsDir: root })
  assert.deepEqual(rows.map((r) => r.subagentType), ['aether:judge', 'aether:reviewer', 'aether:writer', 'other-plugin:agent', 'general-purpose'], 'the extracted row keeps the subagent type')
  const asked = []
  const report = await replay.replay({ rows, criterion, rungs, prices, fallback, answersFor: async (row) => { asked.push(row.id); return answers() } })
  assert.deepEqual(asked, ['toolu_p', 'toolu_g'], 'only the agents the router routes are asked')
  assert.deepEqual(report.rows.map((r) => r.id), ['toolu_p', 'toolu_g'])
  assert.equal(report.totals.n, 2)
  assert.equal(report.totals.skipped, 3)
  assert.equal(report.totals.skippedBy['aether-agent'], 3)
})

test('an answer that is not one of the criterion is a fallback, not a decision', async () => {
  const bad = [
    answers({ shape: { choice: 'banana', confidence: 0.95 } }),
    answers({ edits_files: { noul: 1.5, confidence: 0.95 } }),
    answers({ stakes: { score: 0.9, confidence: 7 } }),
  ]
  for (const wrong of bad) {
    const report = await replay.replay({ rows: [lookupRow()], criterion, rungs, prices, fallback, answersFor: async () => wrong })
    const [got] = report.rows
    assert.equal(got.fallback, 'decider: incoherent', JSON.stringify(wrong))
    assert.equal(got.decision, null)
    assert.equal(got.changed, false)
    assert.equal(got.estimatedUsd, got.lead.usd)
    assert.equal(report.totals.fallback, 1)
    assert.equal(report.totals.changed, 0)
  }
  const entries = [{ kind: 'decision', id: 'z', requested: null, asked: null, answers: bad[0], decision: { harness: 'claude', level: 'C', alias: 'sonnet', effort: 'high' }, description: 'odd' }]
  const journal = replay.replayJournal({ entries, criterion, rungs, prices, fallback })
  assert.equal(journal.rows[0].fallback, 'decider: incoherent')
  assert.equal(journal.rows[0].decision, null)
  assert.equal(journal.totals.fallback, 1)
  assert.equal(journal.totals.changed, 0)
})

test('the journal of the router, decided again with its own criterion, changes nothing', async (t) => {
  const NOW = Date.parse('2026-10-15T21:32:00-06:00')
  const window = (remaining, hours) => ({ remaining, resetsAt: new Date(NOW + hours * 3600 * 1000).toISOString() })
  const readings = { agy: { readAt: NOW - 120000, groups: { argon: { windows: { '5h': window(1, 5), weekly: window(1, 60) } }, flash: { windows: { '5h': window(1, 5), weekly: window(1, 60) } }, claude: { windows: { weekly: window(0.9, 80) } } } }, grok: { readAt: NOW - 60000, groups: { grok: { windows: { weekly: window(0.95, 29.6) } } } } }
  const event = (over = {}) => ({ subagent_type: 'general-purpose', description: 'Audit the API usage in src/', prompt: 'Read src/ and report each call that skips the retry wrapper.', ...over })
  const explore = answers({ shape: { choice: 'explore', confidence: 0.95 }, stakes: { score: 1.1, confidence: 0.95 }, edits_files: { noul: 0.03, confidence: 0.95 } })
  const cases = [
    ['plain, no request', {}, event(), explore],
    ['a gate at the floor of opus xhigh', {}, event({ model: 'opus', effort: 'xhigh' }), answers(AUDIT)],
    ['a gate at the floor of opus, effort inherited', {}, event({ model: 'opus' }), answers(AUDIT)],
    ['a gate with no request', {}, event(), answers(AUDIT)],
    ['low confidence at the floor of opus high', { fallback: { alias: 'opus', effort: 'high' } }, event(), answers({ shape: { choice: 'other', confidence: 0.3 } })],
    ['low confidence at the floor of a request', {}, event({ model: 'sonnet', effort: 'medium' }), answers({ stakes: { score: 1, confidence: 0.2 } })],
    ['below the request', {}, event({ model: 'opus', effort: 'xhigh' }), answers()],
    ['an effort with no model', {}, event({ effort: 'max' }), answers(AUDIT)],
    ['a read-only task sent to another harness', { lanes: true }, event(), explore],
    ['a read-only task sent to another harness, with a request', { lanes: true }, event({ model: 'opus', effort: 'high' }), explore],
    ['a read-only gate at the floor of sonnet medium, sent to another harness', { lanes: true }, event({ model: 'sonnet', effort: 'medium' }), answers(AUDIT)],
  ]
  let external = 0
  for (const [name, change, ev, given] of cases) {
    const dataDir = tempDir(t)
    const settings = { mode: 'command', decider: 'haiku', fallback: { alias: 'sonnet', effort: 'high' }, deadlines: { haikuMs: 8000, jevMs: 3000, quotaMs: 3000 }, lanes: false, harnesses: ['agy', 'grok'], ...change }
    session.markSession(dataDir, 's1', NOW, { router: settings })
    let n = 0
    const deps = { dataDir, now: () => NOW, sleep: async () => {}, newId: () => `r${++n}`, readings: () => readings, marks: () => [], renew: () => ({ started: false, running: false }), installed: () => true }
    const first = await route.begin({ session: 's1', event: ev }, deps)
    await route.finish({ id: first.id, answer: JSON.stringify(given) }, deps)
    const entries = log.readJournal(dataDir)
    const [entry] = entries.filter((e) => e.kind === 'decision')
    const report = replay.replayJournal({ entries, criterion, rungs, prices, fallback: settings.fallback })
    const [got] = report.rows
    assert.equal(report.rows.length, 1, name)
    assert.equal(got.changed, false, `${name}: the same criterion changes nothing`)
    assert.equal(got.decision.level, entry.decision.level, name)
    if (entry.decision.harness === 'claude') assert.deepEqual({ alias: got.decision.alias, effort: got.decision.effort }, { alias: entry.decision.alias, effort: entry.decision.effort }, name)
    else {
      assert.equal(entry.applied, 'external', name)
      external += 1
    }
  }
  assert.equal(external, 3, 'the three cases that go to another harness are replayed too')
})

test('an external pick is compared by its level and the Claude rung it falls back to, never by alias (scenario 12)', () => {
  const entry = {
    kind: 'decision', id: 'e', requested: null, asked: null, answers: answers({ shape: { choice: 'explore', confidence: 0.95 }, stakes: { score: 1.1, confidence: 0.95 } }), description: 'read src',
    decision: { harness: 'grok', model: 'grok-4.7', alias: null, effort: 'low', level: 'B' },
    rescue: { harness: 'claude', model: 'claude-haiku-5-5', effort: 'high' },
  }
  const same = replay.replayJournal({ entries: [entry], criterion, rungs, prices, fallback })
  assert.equal(same.rows[0].changed, false)
  assert.equal(same.totals.changed, 0)
  assert.equal(same.rows[0].previous.harness, 'grok')
  const noRescue = replay.replayJournal({ entries: [{ ...entry, rescue: undefined }], criterion, rungs, prices, fallback })
  assert.equal(noRescue.rows[0].changed, false, 'an entry of record mode has no rescue: the level is compared')
  const stricter = structuredClone(criterion)
  stricter.base.explore = 'C'
  const moved = replay.replayJournal({ entries: [entry], criterion: stricter, rungs, prices, fallback })
  assert.equal(moved.rows[0].changed, true, 'a new level is a change')
  assert.equal(moved.rows[0].decision.level, 'C')
  const elsewhere = replay.replayJournal({ entries: [{ ...entry, rescue: { harness: 'claude', model: 'claude-sonnet-5-5', effort: 'low' } }], criterion, rungs, prices, fallback })
  assert.equal(elsewhere.rows[0].changed, true, 'another rescue rung is a change')
})

// ---- fix G3: the paid call is measured, and has its own time ----

test('the paid Haiku call reports the duration and the cost the CLI measured, whether or not the answer is readable', async () => {
  const task = { description: 'find header', prompt: 'Find where the header is defined.' }
  const calls = []
  const seen = []
  const reply = JSON.stringify({ type: 'result', result: JSON.stringify(answers()), duration_ms: 3840, total_cost_usd: 0.00123 })
  const got = await replay.askDecider({ decider: 'haiku', task, criterion, deps: { execFile: stubExec(reply, calls), timeoutMs: 60000, onCall: (call) => seen.push(call) } })
  assert.deepEqual(got, answers())
  assert.deepEqual(seen, [{ durationMs: 3840, costUsd: 0.00123 }])
  assert.equal(calls[0].options.timeout, 60000, 'the process gets the limit it was given')

  const unreadable = []
  const broken = await replay.askDecider({ decider: 'haiku', task, criterion, deps: { execFile: stubExec(JSON.stringify({ result: 'nope', duration_ms: 900, total_cost_usd: 0.0004 }), []), timeoutMs: 60000, onCall: (call) => unreadable.push(call) } })
  assert.deepEqual(broken, { failure: 'unreadable' })
  assert.deepEqual(unreadable, [{ durationMs: 900, costUsd: 0.0004 }], 'a call that was made and paid for is counted although its answer was not')

  const none = []
  await replay.askDecider({ decider: 'haiku', task, criterion, deps: { execFile: stubExec(JSON.stringify({ result: JSON.stringify(answers()) }), []), timeoutMs: 60000, onCall: (call) => none.push(call) } })
  assert.deepEqual(none, [], 'a JSON with neither figure records nothing')
  const half = []
  await replay.askDecider({ decider: 'haiku', task, criterion, deps: { execFile: stubExec(JSON.stringify({ result: JSON.stringify(answers()), duration_ms: 1200, total_cost_usd: 'free' }), []), timeoutMs: 60000, onCall: (call) => half.push(call) } })
  assert.deepEqual(half, [{ durationMs: 1200, costUsd: null }])
})

test('each row keeps the call it cost, and the report totals the latency (median and 90th percentile) and the cost of the decider', async () => {
  const rows = Array.from({ length: 10 }, (_, i) => lookupRow({ id: `toolu_${i}`, modelParam: 'sonnet', effortParam: 'high' }))
  const durations = [4000, 1000, 9000, 3000, 2000, 10000, 5000, 6000, 8000, 7000]
  const report = await replay.replay({
    rows, criterion, rungs, prices, fallback,
    answersFor: async (row, onCall) => {
      const i = Number(row.id.slice(6))
      if (i === 9) {
        onCall({ durationMs: durations[i], costUsd: 0.001 })
        return { failure: 'unreadable' }
      }
      if (i !== 8) onCall({ durationMs: durations[i], costUsd: 0.002 })
      else onCall({ durationMs: durations[i], costUsd: null })
      return answers()
    },
  })
  assert.deepEqual(report.rows[0].call, { durationMs: 4000, costUsd: 0.002 })
  assert.deepEqual(report.rows[9].call, { durationMs: 7000, costUsd: 0.001 }, 'a failed row keeps its call')
  assert.equal(report.rows.length, 10)
  const total = report.totals.call
  assert.equal(total.n, 10)
  assert.equal(total.medianMs, 5500, 'the middle of 1000..10000')
  assert.equal(total.p90Ms, 9000, 'nearest rank: the ninth of ten')
  assert.ok(Math.abs(total.costUsd - (8 * 0.002 + 0.001)) < 1e-9, 'the row with no cost adds nothing')
  const quiet = await replay.replay({ rows: [lookupRow()], criterion, rungs, prices, fallback, answersFor: async () => answers() })
  assert.equal(quiet.rows[0].call, null)
  assert.deepEqual(quiet.totals.call, { n: 0, medianMs: null, p90Ms: null, costUsd: null })
})

test('the replay has its own limit for one claude process: 60 seconds unless told, 300 at most, and a bad value is refused', () => {
  assert.equal(replay.parseTimeout(undefined), 60000)
  assert.equal(replay.parseTimeout('90'), 90000)
  assert.equal(replay.parseTimeout('300'), 300000)
  assert.equal(replay.parseTimeout('1.5'), 1500)
  for (const bad of ['0', '-5', '301', '1000', 'abc', '', ' ', '10s', 'NaN', 'Infinity']) assert.equal(replay.parseTimeout(bad), null, JSON.stringify(bad))
})
