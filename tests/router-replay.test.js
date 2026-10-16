'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const replay = require('../plugins/aether/lib/router-replay.js')
const crit = require('../plugins/aether/lib/router-criterion.js')
const { loadRungs } = require('../plugins/aether/lib/router-rungs.js')
const { loadPrices } = require('../plugins/aether/lib/prices.js')

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

test('replay says what the decider would have chosen against what the Lead chose, and what each cost (C11)', async (t) => {
  const rows = replay.extractCorpus({ projectsDir: projects(t) })
  const asked = []
  const report = await replay.replay({ rows, criterion, rungs, prices, fallback, answersFor: async (row) => { asked.push(row.id); return answers() } })
  assert.deepEqual(asked, ['toolu_1'], 'a row with a secret is never sent anywhere')
  assert.equal(report.totals.n, 1)
  assert.equal(report.totals.skipped, 1)
  const [row] = report.rows
  assert.deepEqual({ model: row.lead.model, effort: row.lead.effort }, { model: 'opus', effort: 'xhigh' })
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

test('askDecider asks Haiku through claude -p, or Jev over HTTP, and a failure is a fallback', async () => {
  const text = JSON.stringify(answers())
  let seen
  const execFile = async (command, args) => { seen = { command, args }; return { stdout: JSON.stringify({ result: text }) } }
  const task = { description: 'find header', prompt: 'Find where the header is defined.' }
  const got = await replay.askDecider({ decider: 'haiku', task, criterion, deps: { execFile, timeoutMs: 8000 } })
  assert.deepEqual(got, answers())
  assert.equal(seen.command, 'claude')
  for (const arg of ['-p', '--model', 'haiku', '--effort', 'low', '--output-format', 'json']) assert.ok(seen.args.includes(arg), arg)
  const broken = await replay.askDecider({ decider: 'haiku', task, criterion, deps: { timeoutMs: 8000, execFile: async () => ({ stdout: JSON.stringify({ result: 'nope' }) }) } })
  assert.deepEqual(broken, { failure: 'unreadable' })
  const jev = await replay.askDecider({ decider: 'jev', task, criterion, deps: { timeoutMs: 3000, env: { OPENROUTER_API_KEY: 'k' }, fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ answers: answers() }) }) } })
  assert.deepEqual(jev, answers())
  assert.deepEqual(await replay.askDecider({ decider: 'jev', task, criterion, deps: { timeoutMs: 3000, env: {}, fetch: async () => { throw new Error('no') } } }), { failure: 'no-key' })
})

test('formatReport ends with the counts', async (t) => {
  const rows = replay.extractCorpus({ projectsDir: projects(t) })
  const report = await replay.replay({ rows, criterion, rungs, prices, fallback, answersFor: async () => ({ failure: 'timeout' }) })
  const out = replay.formatReport(report)
  for (const line of ['delegations: 1', 'fallback: 1', 'changed: 0']) assert.ok(out.split('\n').includes(line), line)
  assert.ok(out.includes('toolu_1'))
})
