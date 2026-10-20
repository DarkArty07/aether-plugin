'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { ramp, writeCupo, parseArgs, CEILING, SLOWDOWN, USAGE } = require('../plugins/aether/lib/lane-cupo.js')

const clean = (n, ms = 1000) => Array.from({ length: n }, () => ({ ok: true, ms }))

test('a harness that shows no limit reads as the ceiling and is not marked limited', async () => {
  const seen = []
  const r = await ramp({ ceiling: 4, run: async (n) => (seen.push(n), clean(n)) })
  assert.deepEqual(seen, [1, 2, 3, 4])
  assert.deepEqual([r.maxParallel, r.limited, r.ceiling], [4, false, 4])
  assert.deepEqual(r.steps.map((s) => s.n), [1, 2, 3, 4])
})

test('the ceiling is 8 by default and 2 is the slowdown that counts as a delay', async () => {
  assert.equal(CEILING, 8)
  assert.equal(SLOWDOWN, 2)
  const seen = []
  await ramp({ run: async (n) => (seen.push(n), clean(n)) })
  assert.equal(seen.length, 8)
})

test('a call the harness rejects at n ends the ramp at n - 1', async () => {
  const seen = []
  const r = await ramp({ ceiling: 8, run: async (n) => (seen.push(n), n === 3 ? [{ ok: true, ms: 1000 }, { ok: false, ms: 200 }, { ok: true, ms: 1000 }] : clean(n)) })
  assert.deepEqual(seen, [1, 2, 3])
  assert.deepEqual([r.maxParallel, r.limited], [2, true])
  assert.equal(r.steps[2].failed, 1)
})

test('a step more than twice as slow as the single call is a delay; exactly twice is not', async () => {
  const slow = await ramp({ ceiling: 8, run: async (n) => clean(n, n === 3 ? 2500 : 1000) })
  assert.deepEqual([slow.maxParallel, slow.limited], [2, true])
  const exact = await ramp({ ceiling: 3, run: async (n) => clean(n, n === 3 ? 2000 : 1000) })
  assert.deepEqual([exact.maxParallel, exact.limited], [3, false])
})

test('a single call that fails gives 0 and says why', async () => {
  const r = await ramp({ ceiling: 4, run: async () => [{ ok: false, ms: 10 }] })
  assert.deepEqual([r.maxParallel, r.limited], [0, true])
  assert.match(r.reason, /single call/)
})

const TABLE = `{
  "harnesses": {
    "agy": {
      "command": "agy",
      "maxParallel": 4,
      "waitSeconds": 540
    },
    "grok": {
      "command": "grok",
      "maxParallel": 2,
      "waitSeconds": 540
    }
  }
}
`

test('writeCupo edits only the lines of the harness and replaces its own earlier measurement', (t) => {
  const file = path.join(tempDir(t), 'lanes.json')
  fs.writeFileSync(file, TABLE)
  const now = Date.parse('2026-10-20T00:00:00.000Z')
  writeCupo(file, 'grok', { maxParallel: 5, limited: false, ceiling: 8 }, { now })
  const once = fs.readFileSync(file, 'utf8')
  assert.equal(
    once,
    TABLE.replace('"maxParallel": 2,', '"maxParallel": 5,\n      "maxParallelMeasured": { "at": "2026-10-20T00:00:00.000Z", "ceiling": 8, "limited": false },'),
  )
  writeCupo(file, 'grok', { maxParallel: 3, limited: true, ceiling: 8 }, { now: now + 1000 })
  const twice = fs.readFileSync(file, 'utf8')
  assert.equal((twice.match(/maxParallelMeasured/g) || []).length, 1)
  assert.ok(twice.includes('"maxParallel": 3,\n      "maxParallelMeasured": { "at": "2026-10-20T00:00:01.000Z", "ceiling": 8, "limited": true },'))
  assert.ok(twice.includes('"maxParallel": 4,\n      "waitSeconds": 540'), 'agy is untouched')
  assert.doesNotThrow(() => JSON.parse(twice))
})

test('writeCupo refuses a result of 0 and a harness that is not in the file', (t) => {
  const file = path.join(tempDir(t), 'lanes.json')
  fs.writeFileSync(file, TABLE)
  assert.throws(() => writeCupo(file, 'grok', { maxParallel: 0, limited: true, ceiling: 8 }), /at least 1/)
  assert.throws(() => writeCupo(file, 'nope', { maxParallel: 2, limited: true, ceiling: 8 }), /nope/)
  assert.equal(fs.readFileSync(file, 'utf8'), TABLE)
})

test('parseArgs takes a harness, an optional ceiling from 1 to 16 and --write', () => {
  assert.deepEqual(parseArgs(['agy']), { harness: 'agy', ceiling: 8, write: false })
  assert.deepEqual(parseArgs(['grok', '--ceiling', '3', '--write']), { harness: 'grok', ceiling: 3, write: true })
  for (const bad of [[], ['agy', '--ceiling'], ['agy', '--ceiling', '0'], ['agy', '--ceiling', '17'], ['agy', '--ceiling', 'x'], ['agy', 'grok'], ['agy', '--nope']]) {
    assert.throws(() => parseArgs(bad), new RegExp(USAGE.replace(/[[\]().|<>]/g, '\\$&')), JSON.stringify(bad))
  }
})
