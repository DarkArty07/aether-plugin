'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const observe = require(path.join(PLUGIN, 'lib', 'observe.js'))
const { readObservations } = require(path.join(PLUGIN, 'lib', 'observe-read.js'))

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const jsonl = (list) => list.map((e) => JSON.stringify(e)).join('\n') + '\n'
const PAIRS = [{ id: 'agy/gemini-3.8-flash@medium', harness: 'agy', group: 'flash', effort: 'medium', outputTokensPerSecond: null, costPerTaskUsd: null, intelligence: 33 }]
const RANK = { failure: 0, calibration: 1, friction: 2 }

function fixture(t) {
  const dataDir = tempDir(t)
  const repoRoot = tempDir(t)
  write(path.join(dataDir, 'delegates', 'log.jsonl'), jsonl([
    { kind: 'launch', time: 10, session: 's-1', task: 't2', step: 'haiku', attempt: 1, launchKind: 'first' },
    { kind: 'verdict', time: 20, session: 's-1', task: 't2', step: 'haiku', verdict: 'fix', next: { kind: 'fix', cause: 'fix' }, reason: 'ZEBRA reason' },
    { kind: 'launch', time: 30, session: 's-1', task: 't2', step: 'sonnet', attempt: 2, launchKind: 'rise' },
    { kind: 'launch', time: 400, session: 's-1', task: 't9', step: 'haiku', attempt: 1, launchKind: 'first' },
    { kind: 'answer', time: 41, session: 's-1', task: 't9', attempt: 1, text: 'ZEBRA answer' },
  ]))
  observe.appendEvent(dataDir, { time: 500, session: 's-1', kind: 'PostToolUse', tool: 'ScheduleWakeup' })
  for (let i = 0; i < 3; i++) observe.appendEvent(dataDir, { time: 600 + i, session: 's-1', kind: 'PostToolUseFailure', tool: 'Bash' })
  observe.appendEvent(dataDir, { time: 700, session: 's-1', kind: 'PreCompact', trigger: 'auto' })
  write(path.join(dataDir, 'observe', 'faults', 's-1.json'), JSON.stringify({ session: 's-1', count: 2, faults: [
    { time: 800, source: 'register.flush', class: 'write-failed' }, { time: 801, source: 'register.flush', class: 'write-failed' }] }))
  write(path.join(repoRoot, '.aether', 'pending.jsonl'), jsonl([{ time: 1000, session: 's-1', class: 'push', command: 'git push origin ZEBRA', cwd: '/x', mode: 'enforce' }]))
  write(path.join(repoRoot, '.aether', 'autonomy', 'grants.json'), JSON.stringify({ grants: [{ class: 'push', scope: 'repo', quote: 'ZEBRA QUOTE', session: 's-1', time: 1, added: new Date(1500).toISOString() }], revoked: [] }))
  // A session whose lane log was pruned: only the durable summary remembers it.
  write(path.join(dataDir, 'observe', 'summary.json'), JSON.stringify({ version: 1, sessions: { 's-old': {
    first: 1, last: 2, events: {}, toolFailures: {}, faults: {}, seats: {},
    lanes: { 'agy/flash@medium': { calls: 8, ok: 2, outputTokens: 100, durationMs: 1000, usd: 0, pricedCalls: 0 } } } } }))
  return { dataDir, repoRoot }
}

test('the reading orders failures, calibrations and friction, each with evidence and a drafted issue (E7, C4)', (t) => {
  const { dataDir, repoRoot } = fixture(t)
  const { items } = readObservations({ dataDir, repoRoot, now: 5000, pairs: PAIRS, cfg: observe.loadObserveConfig() })
  const types = items.map((i) => i.type)
  for (const type of ['rise-without-reason', 'rule-broken', 'blocked-by-mistake', 'fault', 'pair-failing-rate', 'tool-failures', 'compactions']) assert.ok(types.includes(type), type)
  const compare = (a, b) => RANK[a.kind] - RANK[b.kind] || b.evidence.length - a.evidence.length || b.lastTime - a.lastTime || (a.id < b.id ? -1 : 1)
  assert.deepEqual(items.map((i) => i.id), [...items].sort(compare).map((i) => i.id))
  for (const item of items) assert.ok(item.evidence.length > 0, item.id)
  for (const item of items.filter((i) => i.kind === 'failure')) {
    assert.ok(item.issue.title.length > 0 && item.issue.body.includes('## Evidence'), item.id)
    const file = path.join(dataDir, 'observe', 'issues', `${item.id.replace(/[^A-Za-z0-9._-]/g, '-')}.md`)
    assert.ok(fs.readFileSync(file, 'utf8').includes(item.evidence[0]), file)
  }
  assert.equal(items.find((i) => i.type === 'fault').numbers.count, 2)
  assert.equal(items.find((i) => i.type === 'tool-failures').numbers.count, 3)
  assert.ok(Array.isArray(items.find((i) => i.type === 'pair-failing-rate').sessions))
})

test('no file the reading writes carries a command, a quote or an answer (R10, E12)', (t) => {
  const { dataDir, repoRoot } = fixture(t)
  const result = readObservations({ dataDir, repoRoot, now: 5000, pairs: PAIRS, cfg: observe.loadObserveConfig() })
  assert.equal(JSON.stringify(result).includes('ZEBRA'), false)
  for (const entry of fs.readdirSync(path.join(dataDir, 'observe'), { recursive: true })) {
    const file = path.join(dataDir, 'observe', entry)
    if (fs.statSync(file).isFile()) assert.equal(fs.readFileSync(file, 'utf8').includes('ZEBRA'), false, entry)
  }
  assert.ok(fs.existsSync(path.join(dataDir, 'observe', 'read.json')))
})

test('with nothing recorded the reading is an empty list and does not throw', (t) => {
  const { items } = readObservations({ dataDir: tempDir(t), repoRoot: null, now: 1, pairs: [], cfg: observe.loadObserveConfig() })
  assert.deepEqual(items, [])
})

test('the reading source has no network or process module (R12)', () => {
  const source = fs.readFileSync(path.join(PLUGIN, 'lib', 'observe-read.js'), 'utf8')
  assert.doesNotMatch(source, /node:(http|https|http2|net|tls|dgram|dns|child_process)|child_process|\bfetch\s*\(|\bgh\s+(issue|api)/)
})
