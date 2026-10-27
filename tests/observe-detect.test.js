'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { PLUGIN } = require('./helpers.js')

const d = require(path.join(PLUGIN, 'lib', 'observe-detect.js'))
const CFG = { pairFailures: { consecutive: 3 }, blockedByMistake: { repeatBlocks: 2 } }

const launch = (line, task, step, launchKind, time, attempt, session = 's-1') => ({ line, kind: 'launch', time, session, task, step, attempt, launchKind })
const verdict = (line, task, step, label, next, time, session = 's-1') => ({ line, kind: 'verdict', time, session, task, step, verdict: label, next })

test('a rise after a verdict with a rise cause is fine; after a fix or after nothing it is flagged (E2)', () => {
  const entries = [
    launch(1, 't1', 'haiku', 'first', 10, 1), verdict(2, 't1', 'haiku', 'fix', { kind: 'rise', cause: 'repeated', step: 'sonnet' }, 20), launch(3, 't1', 'sonnet', 'rise', 30, 2),
    launch(4, 't2', 'haiku', 'first', 40, 1), verdict(5, 't2', 'haiku', 'fix', { kind: 'fix', cause: 'fix', step: 'haiku' }, 50), launch(6, 't2', 'sonnet', 'rise', 60, 2),
    launch(7, 't3', 'haiku', 'first', 70, 1), launch(8, 't3', 'sonnet', 'rise', 80, 2),
    { line: 9, kind: 'launch', time: 90, session: 's-1', task: 't4', step: null, attempt: 1, launchKind: 'refused' },
  ]
  const found = d.detectRiseWithoutReason(entries)
  assert.deepEqual(found.map((f) => f.id), ['rise-without-reason:t2:2', 'rise-without-reason:t3:2'])
  assert.equal(found[0].kind, 'failure')
  assert.equal(found[0].type, 'rise-without-reason')
  assert.deepEqual(found[0].sessions, ['s-1'])
  assert.equal(found[0].lastTime, 60)
  const text = found[0].evidence.join('\n')
  assert.ok(text.includes('t2') && text.includes('log line 5') && text.includes('log line 6'))
  assert.ok(found[1].evidence.join('\n').includes('no verdict'))
})

const outcome = (task, time, status, model = 'gemini-3.8-flash-medium', harness = 'agy') => ({ kind: 'outcome', id: task, time, session: 's-1', status, harness, model })

test('three failures in a row on different tasks flag the pair; an ok in between or one task repeated does not (E3)', () => {
  const entries = [
    outcome('a', 1, 'failed'), outcome('b', 2, 'timeout'), outcome('c', 3, 'failed'), outcome('d', 4, 'ok'), outcome('e', 5, 'failed'), outcome('f', 6, 'failed'),
    outcome('x', 1, 'ok', 'grok-4.7', 'grok'),
    outcome('y', 1, 'failed', 'muse-spark-1.3', 'muse'), outcome('y', 2, 'failed', 'muse-spark-1.3', 'muse'), outcome('y', 3, 'failed', 'muse-spark-1.3', 'muse'),
  ]
  const found = d.detectPairFailures(entries, CFG)
  assert.equal(found.length, 1)
  assert.equal(found[0].id, 'pair-failing:agy/gemini-3.8-flash-medium')
  assert.equal(found[0].numbers.failures, 3)
  assert.deepEqual(found[0].numbers.tasks, ['a', 'b', 'c'])
  assert.deepEqual(found[0].sessions, ['s-1'])
})

test('a ScheduleWakeup while a delegate task of its session is open breaks the rule (E4)', () => {
  const delegateEntries = [launch(1, 't1', 'haiku', 'first', 100, 1), verdict(2, 't1', 'haiku', 'approved', { kind: 'done' }, 300), launch(3, 't2', 'haiku', 'first', 400, 1)]
  const events = [
    { time: 200, session: 's-1', kind: 'PostToolUse', tool: 'ScheduleWakeup' },
    { time: 350, session: 's-1', kind: 'PostToolUse', tool: 'ScheduleWakeup' },
    { time: 500, session: 's-1', kind: 'PostToolUse', tool: 'ScheduleWakeup' },
    { time: 450, session: 's-2', kind: 'PostToolUse', tool: 'ScheduleWakeup' },
    { time: 450, session: 's-1', kind: 'PostToolUseFailure', tool: 'Bash' },
  ]
  const found = d.detectRuleBroken({ events, delegateEntries })
  assert.equal(found.length, 1)
  assert.equal(found[0].id, 'rule-broken:no-wakeup-for-delegate:s-1')
  assert.equal(found[0].kind, 'failure')
  assert.equal(found[0].numbers.count, 2)
  assert.deepEqual(found[0].sessions, ['s-1'])
})

test('a rise with cause exhausted leaves the task open; a verdict of exhausted closes it', () => {
  const delegateEntries = [
    launch(1, 't1', 'haiku', 'first', 100, 1, 's-1'),
    verdict(2, 't1', 'haiku', 'fix', { kind: 'rise', cause: 'exhausted', step: 'sonnet' }, 200, 's-1'),
    launch(3, 't1', 'sonnet', 'rise', 300, 2, 's-1'),
    launch(4, 't2', 'haiku', 'first', 100, 1, 's-2'),
    verdict(5, 't2', 'haiku', 'exhausted', { kind: 'exhausted', cause: 'exhausted' }, 200, 's-2'),
  ]
  const events = [
    { time: 350, session: 's-1', kind: 'PostToolUse', tool: 'ScheduleWakeup' },
    { time: 350, session: 's-2', kind: 'PostToolUse', tool: 'ScheduleWakeup' },
  ]
  const found = d.detectRuleBroken({ events, delegateEntries })
  assert.equal(found.length, 1)
  assert.equal(found[0].id, 'rule-broken:no-wakeup-for-delegate:s-1')
  assert.equal(found[0].numbers.count, 1)
  assert.deepEqual(found[0].sessions, ['s-1'])
  assert.equal(found.some((f) => f.sessions.includes('s-2')), false)
})

test('a grant of the same class after a block, or the same fingerprint twice, is a possible mistaken block (E5)', () => {
  const fp = d.fingerprintOf('git   push origin main')
  assert.equal(fp, d.fingerprintOf('git push origin main'))
  assert.match(fp, /^[0-9a-f]{12}$/)
  const pending = [
    { time: 1000, session: 's-1', class: 'push', fingerprint: fp },
    { time: 2000, session: 's-1', class: 'delete', fingerprint: d.fingerprintOf('rm -rf build') },
    { time: 3000, session: 's-2', class: 'deploy', fingerprint: 'aaaaaaaaaaaa' },
    { time: 4000, session: 's-2', class: 'deploy', fingerprint: 'aaaaaaaaaaaa' },
  ]
  const grants = [
    { class: 'push', added: new Date(1500).toISOString(), quote: 'SECRET QUOTE' },
    { class: 'delete', added: new Date(1500).toISOString() },
  ]
  const found = d.detectBlockedByMistake({ pending, grants }, CFG)
  assert.deepEqual(found.map((f) => f.id).sort(), [`blocked-by-mistake:deploy:aaaaaaaaaaaa`, `blocked-by-mistake:push:${fp}`])
  const text = JSON.stringify(found)
  assert.ok(text.includes(fp) && text.includes(new Date(1500).toISOString()))
  assert.equal(text.includes('SECRET QUOTE'), false)
  assert.equal(text.includes('rm -rf'), false)
})

test('every detector returns [] for empty input', () => {
  assert.deepEqual(d.detectRiseWithoutReason([]), [])
  assert.deepEqual(d.detectPairFailures([], CFG), [])
  assert.deepEqual(d.detectRuleBroken({ events: [], delegateEntries: [] }), [])
  assert.deepEqual(d.detectBlockedByMistake({ pending: [], grants: [] }, CFG), [])
})

test('detectors do not use network, process execution or date/clock', () => {
  const source = fs.readFileSync(path.join(PLUGIN, 'lib', 'observe-detect.js'), 'utf8')
  assert.doesNotMatch(source, /node:(http|https|http2|net|tls|dgram|dns|child_process)|child_process|\bfetch\s*\(/)
  assert.doesNotMatch(source, /Date\.now|new\s+Date\(\)/)
})
