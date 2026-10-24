'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const { baseline } = require(path.join(PLUGIN, 'lib', 'observe-baseline.js'))
const { loadPrices, ratesFor } = require(path.join(PLUGIN, 'lib', 'prices.js'))

const prices = loadPrices()
const FLASH = ratesFor(prices, 'gemini-3.8-flash').rates
// ratesFor matches model ids, not family names: 'sonnet' is read from the family table itself.
const SONNET = prices.models.sonnet
const usage = { input: 1000, output: 0, thinking: 0, cacheRead: 0 }

const launch = (task, step, launchKind, attempt, time) => ({ kind: 'launch', time, session: 's-1', task, step, attempt, launchKind })
const out = (task, attempt, model, time) => ({ kind: 'outcome', id: task, time, session: 's-1', status: 'ok', harness: 'agy', model, attempt, usage })
const verdict = (task, step, label, time, next = { kind: 'done' }) => ({ kind: 'verdict', time, session: 's-1', task, step, verdict: label, next })

function build(dir) {
  const log = [
    launch('a', 'haiku', 'first', 1, 1), out('a', 1, 'gemini-3.8-flash', 2), verdict('a', 'haiku', 'approved', 3),
    launch('b', 'haiku', 'first', 1, 4), out('b', 1, 'gemini-3.8-flash', 5), verdict('b', 'haiku', 'fix', 6, { kind: 'rise', cause: 'repeated', step: 'sonnet' }),
    launch('b', 'sonnet', 'rise', 2, 7), out('b', 2, 'gemini-4-argon', 8), verdict('b', 'sonnet', 'approved', 9),
    launch('c', 'haiku', 'first', 1, 10), out('c', 1, 'mystery-model', 11), verdict('c', 'haiku', 'approved', 12),
  ]
  fs.mkdirSync(path.join(dir, 'delegates'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'delegates', 'log.jsonl'), log.map((e) => JSON.stringify(e)).join('\n') + '\n')
  fs.mkdirSync(path.join(dir, 'lanes'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lanes', 's-1.jsonl'), [
    { kind: 'delegate', time: 1, session: 's-1', status: 'no-candidate' },
    { kind: 'took', time: 2, session: 's-1', cause: 'no-candidate' },
    { kind: 'call', time: 3, session: 's-1', status: 'ok' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
  fs.writeFileSync(path.join(dir, 'runs.jsonl'), [
    { runId: 'r1', status: 'finalized', report: { cost: { run: { usd: 10 } } } },
    { runId: 'r2', status: 'finalized', report: { cost: { run: { usd: 30 } } } },
    { runId: 'r3', status: 'abandoned' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
  fs.mkdirSync(path.join(dir, 'usage', 's-1'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'usage', 's-1', '0.json'), '{}')
  fs.writeFileSync(path.join(dir, 'usage', 's-1', '1.json'), '{}')
  fs.mkdirSync(path.join(dir, 'exams', 'repo-key', '014-x'), { recursive: true })
}

function buildPending(repoRoot) {
  fs.mkdirSync(path.join(repoRoot, '.aether'), { recursive: true })
  fs.writeFileSync(path.join(repoRoot, '.aether', 'pending.jsonl'), [
    { time: 1, session: 's-1', class: 'push', command: 'git push origin ZEBRA', cwd: '/x', mode: 'enforce' },
    { time: 2, session: 's-1', class: 'delete', command: 'rm -rf ZEBRA', cwd: '/x', mode: 'enforce' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
}

function snapshot(dir) {
  const out = {}
  for (const entry of fs.readdirSync(dir, { recursive: true })) {
    const file = path.join(dir, entry)
    if (fs.statSync(file).isFile()) out[entry] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  }
  return out
}

test('the baseline answers the three questions in numbers and reads another directory without changing it (R15, C13)', (t) => {
  const from = tempDir(t)
  const to = tempDir(t)
  const repoRoot = tempDir(t)
  build(from)
  buildPending(repoRoot)
  const before = snapshot(from)
  const beforeRepo = snapshot(repoRoot)
  const result = baseline({ from, to, prices, repoRoot })
  assert.deepEqual(snapshot(from), before)
  assert.deepEqual(snapshot(repoRoot), beforeRepo)
  assert.equal(JSON.stringify(result).includes('ZEBRA'), false)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(to, 'observe', 'baseline.json'), 'utf8')), result)
  assert.deepEqual(result.approvalsByStep.haiku, { launches: 3, approved: 2, fixes: 0, rises: 0 })
  assert.deepEqual(result.approvalsByStep.sonnet, { launches: 1, approved: 1, fixes: 0, rises: 1 })
  assert.deepEqual(result.noCandidate, { count: 2, calls: 1 })
  assert.deepEqual(result.runs, { finalized: 2, abandoned: 1, usd: { count: 2, min: 10, median: 20, max: 30 } })
  assert.deepEqual(result.usage, { sessions: 1, parts: 2 })
  assert.deepEqual(result.exams, { features: 1 })
  assert.deepEqual(result.pending, { entries: 2, byClass: { push: 1, delete: 1 } })
  const cost = (1000 * FLASH.input) / prices.per
  const saves = (1000 * SONNET.input - 1000 * FLASH.input) / prices.per
  assert.ok(Math.abs(result.haikuCost.costUsd - cost) < 1e-12, 'the attempt of b below its approving step')
  assert.ok(Math.abs(result.haikuCost.savesUsd - saves) < 1e-12, 'the task a approved on haiku')
  assert.equal(result.haikuCost.unpriced, 1)
  assert.equal(result.haikuCost.answer, cost > saves ? 'costs-more' : cost < saves ? 'saves-more' : 'equal')
})

test('with no records the baseline reports zeros and writes nothing into the directory it reads', (t) => {
  const from = tempDir(t)
  const to = tempDir(t)
  const result = baseline({ from, to, prices })
  assert.deepEqual(result.approvalsByStep, {})
  assert.deepEqual(result.noCandidate, { count: 0, calls: 0 })
  assert.deepEqual(result.runs, { finalized: 0, abandoned: 0, usd: { count: 0, min: null, median: null, max: null } })
  assert.deepEqual(result.usage, { sessions: 0, parts: 0 })
  assert.deepEqual(result.exams, { features: 0 })
  assert.deepEqual(result.pending, { entries: 0, byClass: {} })
  assert.equal(result.haikuCost.answer, 'no-data')
  assert.deepEqual(fs.readdirSync(from), [])
})

test('the baseline changes no configuration value (R6)', (t) => {
  const files = ['ladder.json', 'pairs.json', 'prices.json', 'lanes.json'].map((n) => path.join(PLUGIN, 'config', n))
  const hash = () => files.map((f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')).join()
  const before = hash()
  const from = tempDir(t)
  build(from)
  baseline({ from, to: tempDir(t), prices })
  assert.equal(hash(), before)
})
