'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const HOOKS = path.join(__dirname, '..', 'plugins', 'aether', 'hooks')
let view
let panel
test.before(async () => {
  view = await import(pathToFileURL(path.join(HOOKS, 'spend-view.mjs')).href)
  panel = await import(pathToFileURL(path.join(HOOKS, 'panel-view.mjs')).href)
})

const REPORT = {
  session: 's1', recorded: true, complete: true, basis: 'test table, S1', currency: 'USD', usd: 30.5, leadUsd: 20, agentsUsd: 8.25,
  byModel: { 'claude-haiku-5-5': { usd: 5, requests: 12 }, 'claude-opus-5-5': { usd: 25.5, requests: 7 } },
  byEffort: { 'claude-opus-5-5 xhigh': { usd: 25.5, requests: 7 }, 'claude-haiku-5-5 unknown': { usd: 5, requests: 12 } },
  byRole: { 'aether:implementer': { usd: 8.25, requests: 14 }, main: { usd: 20, requests: 5 } },
  harness: { calls: 3, usd: 2.25, byModel: { 'claude-haiku-5-5': { usd: 2.25, calls: 2 } } },
  unpriced: ['x-free'], firstRequest: '2026-09-01T10:00:00.000Z', lastRequest: '2026-09-03T10:00:00.000Z', resumptions: 4, resumptionsApproximate: true,
}
const ok = (value) => ({ ok: true, value })
const rows = (lines) => lines.map((line) => line.parts.map((part) => part.text).join(''))
const printed = (value, extra = {}) => ({ exitCode: 0, stdout: `${JSON.stringify(value)}\n`, ...extra })

test('dollars have two decimals, rounded half away from zero', () => {
  const cases = [[0, '0.00'], [0.005, '0.01'], [1.005, '1.01'], [2.675, '2.68'], [-0.005, '-0.01'], [36.25, '36.25'], [1e6, '1000000.00'], [0.004, '0.00'], [-0.004, '0.00']]
  for (const [value, text] of cases) assert.equal(view.usdText(value), text, String(value))
  for (const bad of [NaN, Infinity, null, undefined, '3']) assert.equal(view.usdText(bad), '—')
})

test('parseSpend takes the bin output, and every failure is a reason', () => {
  assert.deepEqual(view.parseSpend(printed(REPORT)), ok(REPORT))
  assert.deepEqual(view.parseSpend({ exitCode: 1, stdout: '{"error":"usage: aether-report --spend [--session <id>]"}\n' }), { ok: false, error: 'usage: aether-report --spend [--session <id>]' })
  assert.deepEqual(view.parseSpend({ failed: 'aether-report did not answer in 120 s' }), { ok: false, error: 'aether-report did not answer in 120 s' })
  assert.equal(view.parseSpend(printed({ usd: 1 })).ok, false)
  assert.equal(view.parseSpend({ exitCode: 0, stdout: 'plain text\n' }).ok, false)
})

test('the panel says what the figure holds, in this order', () => {
  // The first-request line is 78 cells. A line is never wider than `columns`, so the snapshot asks for 80.
  const lines = view.spendLines({ result: ok(REPORT), columns: 80 })
  assert.deepEqual(rows(lines), [
    'Aether · session spend',
    'Session s1 · list prices · test table, S1',
    '',
    'Total US$ 30.50',
    'Lead US$ 20.00 · Agents US$ 8.25 · Other harnesses US$ 2.25',
    '',
    'By model',
    '  claude-opus-5-5  US$ 25.50  7 requests',
    '  claude-haiku-5-5  US$ 5.00  12 requests',
    '',
    'By model and effort',
    '  claude-opus-5-5 xhigh  US$ 25.50  7 requests',
    '  claude-haiku-5-5 unknown  US$ 5.00  12 requests',
    '',
    'By role',
    '  main  US$ 20.00  5 requests',
    '  aether:implementer  US$ 8.25  14 requests',
    '',
    'Other harnesses: 3 calls · US$ 2.25',
    '  claude-haiku-5-5  US$ 2.25  2 calls',
    '',
    'No price: x-free',
    '',
    'First request 2026-09-01T10:00:00.000Z · last request 2026-09-03T10:00:00.000Z',
    'Resumptions 4 (approximate)',
  ])
  assert.equal(lines[2].action, true)
})

test('a long figure shows how many rows follow in a small pane', () => {
  const lines = view.spendLines({ result: ok(REPORT), columns: 80, rows: 10 })
  const text = rows(lines)
  const marker = text.findIndex((row) => /^… \d+ more rows \(↓ scrolls\)$/.test(row))
  assert.equal(marker, 9)
  assert.equal(Number(/\d+/.exec(text[marker])[0]), text.length - marker - 1)
})

test('an incomplete figure says incomplete next to the total; a complete one does not', () => {
  const incomplete = rows(view.spendLines({ result: ok({ ...REPORT, complete: false }), columns: 76 }))
  assert.equal(incomplete[3], 'Total US$ 30.50 incomplete')
  assert.ok(!rows(view.spendLines({ result: ok(REPORT), columns: 76 })).some((row) => row.includes('incomplete')))
})

test('nothing recorded is a sentence, never a total of zero or another session', () => {
  const none = { ...REPORT, session: 's9', recorded: false, usd: null, leadUsd: null, agentsUsd: null, byModel: {}, byEffort: {}, byRole: {}, harness: { calls: 0, usd: 0, byModel: {} }, unpriced: [], firstRequest: null, lastRequest: null, resumptions: null }
  const text = rows(view.spendLines({ result: ok(none), columns: 76 }))
  assert.deepEqual(text.slice(0, 3), ['Aether · session spend', 'Session s9', 'No spend recorded yet'])
  assert.ok(!text.join('\n').includes('US$'))
})

test('loading and failure are one line each', () => {
  assert.deepEqual(rows(view.spendLines({ result: null, columns: 76 })).slice(0, 2), ['Aether · session spend', 'Reading…'])
  const failed = rows(view.spendLines({ result: { ok: false, error: 'boom' }, columns: 76 }))
  assert.deepEqual(failed.slice(0, 2), ['Aether · session spend', '  Spend unavailable: boom'])
})

test('text from outside is cleaned, and no row is wider than the room', () => {
  const dirty = { ...REPORT, byModel: { 'bad\u001b[31m‮model': { usd: 1, requests: 1 } }, unpriced: ['x\u0000y'] }
  for (const columns of [20, 30, 40, 76, 120]) {
    const text = rows(view.spendLines({ result: ok(dirty), columns }))
    // Joined on '' : the newline between rows is U+000A, which this class rejects, and it is not part of a row.
    assert.ok(!/[\u0000-\u001f\u007f-\u009f‪-‮]/.test(text.join('')), 'control characters')
    for (const row of text) assert.ok(panel.cells(row) <= columns, `${columns}: ${row}`)
  }
})
