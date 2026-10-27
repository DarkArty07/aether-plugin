'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, PLUGIN, SESSION_BIN } = require('./helpers.js')

const observe = require(path.join(PLUGIN, 'lib', 'observe.js'))
const digest = require(path.join(PLUGIN, 'lib', 'observe-digest.js'))
const lanes = require(path.join(PLUGIN, 'lib', 'lanes.js'))
const { loadPrices, priceEntry } = require(path.join(PLUGIN, 'lib', 'prices.js'))
const DAY = 24 * 60 * 60 * 1000

const call = (time, status) => JSON.stringify({ kind: 'call', time, session: 's', harness: 'agy', group: 'flash', effort: 'medium', model: 'gemini-3.8-flash-medium', status, durationMs: 10000, usage: { input: 5, output: 1000, thinking: 0, cacheRead: 0, total: 1005 }, prompt: 'ZEBRA' })
const seat = (time) => JSON.stringify({ kind: 'seat', time, session: 's', seat: 'judge', design: 'd1', status: 'native', reason: 'ZEBRA' })

function seed(dir, id, time) {
  observe.appendEvent(dir, { time, session: id, kind: 'PostToolUseFailure', tool: 'Bash' })
  observe.appendEvent(dir, { time: time + 1, session: id, kind: 'PostToolUseFailure', tool: 'Bash' })
  observe.appendEvent(dir, { time: time + 2, session: id, kind: 'PreCompact', trigger: 'auto' })
  fs.mkdirSync(path.join(dir, 'observe', 'faults'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'observe', 'faults', `${id}.json`), JSON.stringify({ session: id, count: 1, faults: [{ time, source: 'register.flush', class: 'write-failed' }] }))
  fs.mkdirSync(path.join(dir, 'lanes'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lanes', `${id}.jsonl`), [call(time, 'ok'), call(time + 1, 'failed'), seat(time + 2), seat(time + 3)].join('\n') + '\n')
}

function age(dir, id, when) {
  for (const file of [path.join(dir, 'observe', 'faults', `${id}.json`), path.join(dir, 'lanes', `${id}.jsonl`)]) fs.utimesSync(file, new Date(when), new Date(when))
}

test('digestSession writes one entry of counts only (R8)', (t) => {
  const dir = tempDir(t)
  seed(dir, 's-1', 5000)
  const entry = digest.digestSession(dir, 's-1')
  const summary = digest.readSummary(dir)
  assert.deepEqual(summary.sessions['s-1'], entry)
  assert.deepEqual(entry.events, { PostToolUseFailure: 2, PreCompact: 1 })
  assert.deepEqual(entry.toolFailures, { Bash: 2 })
  assert.deepEqual(entry.faults, { 'register.flush': 1 })
  assert.deepEqual(entry.seats, { 'd1/judge': 2 })
  const lane = entry.lanes['agy/flash@medium']
  assert.deepEqual({ calls: lane.calls, ok: lane.ok, outputTokens: lane.outputTokens, durationMs: lane.durationMs, pricedCalls: lane.pricedCalls }, { calls: 2, ok: 1, outputTokens: 2000, durationMs: 20000, pricedCalls: 2 })
  assert.equal(typeof lane.usd, 'number')
  assert.equal(entry.first, 5000)
  assert.equal(entry.last, 5003)
  assert.equal(JSON.stringify(summary).includes('ZEBRA'), false)
  assert.deepEqual(digest.digestSession(dir, 's-1'), entry)
  assert.deepEqual(digest.readSummary(dir).sessions, summary.sessions)
})

test('the prune removes old events, faults and lane logs, and the summary keeps their counts (C5)', (t) => {
  const dir = tempDir(t)
  const now = Date.UTC(2026, 9, 23)
  const old = now - 40 * DAY
  seed(dir, 's-old', old)
  seed(dir, 's-new', now - DAY)
  age(dir, 's-old', old)
  digest.digestAll(dir)
  assert.deepEqual(digest.pruneObserve(dir, { days: 30, now }), { events: 3, faults: 1, dev: 0 })
  lanes.pruneLog(dir, { days: 30, now })
  assert.equal(fs.existsSync(path.join(dir, 'lanes', 's-old.jsonl')), false)
  assert.equal(fs.existsSync(path.join(dir, 'observe', 'faults', 's-old.json')), false)
  assert.deepEqual([...new Set(observe.readEvents(dir).map((e) => e.session))], ['s-new'])
  const summary = digest.readSummary(dir)
  assert.equal(summary.sessions['s-old'].events.PostToolUseFailure, 2)
  assert.equal(summary.sessions['s-old'].lanes['agy/flash@medium'].calls, 2)
  assert.equal(summary.sessions['s-new'].events.PreCompact, 1)
  digest.digestSession(dir, 's-old')
  assert.equal(digest.readSummary(dir).sessions['s-old'].events.PostToolUseFailure, 2)
})

test('aether-session-start digests the sessions before the prune deletes their sources (R8)', (t) => {
  const dir = tempDir(t)
  const old = Date.now() - 40 * DAY
  seed(dir, 's-old', old)
  age(dir, 's-old', old)
  const r = spawnSync('node', [SESSION_BIN], {
    input: JSON.stringify({ agent_type: 'aether:lead', session_id: 's-run', source: 'startup', cwd: dir }),
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, AETHER_DATA_DIR: dir },
  })
  assert.equal(r.status, 0)
  assert.equal(fs.existsSync(path.join(dir, 'lanes', 's-old.jsonl')), false)
  assert.equal(digest.readSummary(dir).sessions['s-old'].lanes['agy/flash@medium'].calls, 2)
})

test('a digest with no source leaves the entry, and one with part of the sources keeps the figures of the rest', (t) => {
  const dir = tempDir(t)
  assert.deepEqual(digest.readSummary(dir), { version: 1, sessions: {} })
  seed(dir, 's-1', 5000)
  const entry = digest.digestSession(dir, 's-1')
  fs.rmSync(path.join(dir, 'lanes'), { recursive: true })
  const again = digest.digestSession(dir, 's-1')
  assert.deepEqual(again.lanes, entry.lanes)
  assert.deepEqual(again.events, entry.events)
  assert.equal(again.last, entry.last)
  fs.rmSync(path.join(dir, 'observe', 'events.jsonl'))
  fs.rmSync(path.join(dir, 'observe', 'faults'), { recursive: true })
  assert.deepEqual(digest.digestSession(dir, 's-1'), entry)
  assert.deepEqual(digest.digestAll(dir), [])
  assert.deepEqual(digest.readSummary(dir).sessions['s-1'], entry)
})

test('an unreadable summary reads as empty, and the prune also removes old dev folders', (t) => {
  const dir = tempDir(t)
  fs.mkdirSync(path.join(dir, 'observe', 'dev', 'd-old'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'observe', 'dev', 'd-new'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'observe', 'summary.json'), '{not json')
  assert.deepEqual(digest.readSummary(dir), { version: 1, sessions: {} })
  const now = Date.UTC(2026, 9, 23)
  fs.utimesSync(path.join(dir, 'observe', 'dev', 'd-old'), new Date(now - 40 * DAY), new Date(now - 40 * DAY))
  fs.utimesSync(path.join(dir, 'observe', 'dev', 'd-new'), new Date(now), new Date(now))
  assert.deepEqual(digest.pruneObserve(dir, { days: 30, now }), { events: 0, faults: 0, dev: 1 })
  assert.deepEqual(fs.readdirSync(path.join(dir, 'observe', 'dev')), ['d-new'])
})

test('a lane call is priced as /spend prices it, with the thinking tokens that agy counts (R8)', (t) => {
  const dir = tempDir(t)
  const usage = { input: 5, output: 1000, thinking: 4000, cacheRead: 0, total: 5005 }
  const model = 'gemini-3.8-flash-medium'
  const entry = { kind: 'call', time: 7000, session: 's-think', harness: 'agy', group: 'flash', effort: 'medium', model, status: 'ok', durationMs: 10000, usage }
  fs.mkdirSync(path.join(dir, 'lanes'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lanes', 's-think.jsonl'), `${JSON.stringify(entry)}\n`)
  const expected = priceEntry({ model, ...lanes.laneTokens(usage), agent: 'lane' }, loadPrices())
  const withoutThinking = priceEntry({ model, input: 5, output: 1000, cacheRead: 0, cacheWrite: 0, agent: 'lane' }, loadPrices())
  assert.notEqual(expected, withoutThinking)
  const lane = digest.digestSession(dir, 's-think').lanes['agy/flash@medium']
  assert.equal(lane.usd, expected)
  assert.equal(lane.pricedCalls, 1)
  assert.equal(lane.outputTokens, 1000)
})

// The events of one session on both sides of the 30-day cut: the prune removes the old lines one by one, so the
// summary must keep their counts (the pruned tally) and the next digest must not overwrite them with the rest.
test('a session whose events straddle the prune keeps the counts of the lines pruned (C5)', (t) => {
  const dir = tempDir(t)
  const now = Date.UTC(2026, 9, 23)
  const old = now - 40 * DAY
  const lines = [
    { time: old, session: 's-cut', kind: 'PostToolUseFailure', tool: 'Bash' },
    { time: old + 1, session: 's-cut', kind: 'PostToolUseFailure', tool: 'Edit' },
    { time: old + 2, session: 's-cut', kind: 'PreCompact', trigger: 'auto' },
    { time: now - DAY, session: 's-cut', kind: 'PostToolUseFailure', tool: 'Bash' },
    { time: now - DAY + 1, session: 's-cut', kind: 'SessionEnd' },
  ]
  for (const line of lines) observe.appendEvent(dir, line)
  const all = { events: { PostToolUseFailure: 3, PreCompact: 1, SessionEnd: 1 }, toolFailures: { Bash: 2, Edit: 1 } }
  const counts = () => {
    const entry = digest.readSummary(dir).sessions['s-cut']
    return { events: entry.events, toolFailures: entry.toolFailures }
  }

  digest.digestAll(dir)
  assert.deepEqual(counts(), all)
  for (let round = 0; round < 2; round += 1) {
    assert.equal(digest.pruneObserve(dir, { days: 30, now }).events, round === 0 ? 3 : 0)
    digest.digestSession(dir, 's-cut')
    assert.deepEqual(counts(), all)
  }
  const settled = digest.readSummary(dir)
  digest.digestAll(dir)
  assert.deepEqual(digest.readSummary(dir), settled)
})

// A prune that stops after it wrote the tally and before it rewrote the events file: the old lines are still on
// disk. Their counts must come from the tally only, once, and the next prune removes them without counting again.
test('a prune interrupted before it rewrote the events file counts the old lines once (C5)', (t) => {
  const dir = tempDir(t)
  const now = Date.UTC(2026, 9, 23)
  const old = now - 40 * DAY
  observe.appendEvent(dir, { time: old, session: 's-cut', kind: 'PostToolUseFailure', tool: 'Bash' })
  observe.appendEvent(dir, { time: now - DAY, session: 's-cut', kind: 'PostToolUseFailure', tool: 'Bash' })
  const eventsPath = path.join(dir, 'observe', 'events.jsonl')
  digest.digestAll(dir)
  const beforePrune = fs.readFileSync(eventsPath, 'utf8')
  digest.pruneObserve(dir, { days: 30, now })
  fs.writeFileSync(eventsPath, beforePrune)
  digest.digestSession(dir, 's-cut')
  const entry = digest.readSummary(dir).sessions['s-cut']
  assert.deepEqual(entry.toolFailures, { Bash: 2 })
  assert.deepEqual(entry.events, { PostToolUseFailure: 2 })
  assert.equal(digest.pruneObserve(dir, { days: 30, now }).events, 1)
  assert.deepEqual(digest.readSummary(dir).sessions['s-cut'].toolFailures, { Bash: 2 })
  assert.deepEqual(digest.readSummary(dir).sessions['s-cut'].events, { PostToolUseFailure: 2 })
})
