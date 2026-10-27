'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, useDataDir, age } = require('./helpers.js')
const { loadPrices } = require('../plugins/aether/lib/prices.js')
const { writeJson } = require('../plugins/aether/lib/run.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-report')
const OPUS = 'claude-opus-5-5'
const PRICES = loadPrices()
const FORM = 'aether-report --spend [--session <id>]'

function run(dataDir, args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dataDir } })
  const last = r.stdout.trim().split('\n').pop()
  return { status: r.status, stdout: r.stdout, json: last ? JSON.parse(last) : null }
}

// A session of `count` requests of a million input tokens each, at the real price table.
function session(dataDir, id, count = 1) {
  const entries = Array.from({ length: count }, (_, i) => ({ t: Date.parse('2026-09-01T10:00:00Z') + i * 1000, ms: 1, agent: null, model: OPUS, effort: 'low', input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 }))
  writeJson(path.join(dataDir, 'usage', id, '0.json'), { session: id, part: 0, claudeCode: '2.1.296', agents: {}, entries })
}

test('--spend --session prints one JSON with the session list price', (t) => {
  const dataDir = useDataDir(t)
  session(dataDir, 's1', 2)
  const r = run(dataDir, ['--spend', '--session', 's1'])
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim().split('\n').length, 1)
  assert.equal(r.json.session, 's1')
  assert.ok(Math.abs(r.json.usd - 2 * PRICES.models.opus.input) < 1e-9)
  assert.equal(r.json.basis, `${PRICES.basis}, ${PRICES.snapshot}`)
})

test('without --session the session is the one written last', (t) => {
  const dataDir = useDataDir(t)
  session(dataDir, 'older')
  age(path.join(dataDir, 'usage', 'older'), 48)
  session(dataDir, 'newer')
  assert.equal(run(dataDir, ['--spend']).json.session, 'newer')
})

test('a well-formed id with no records exits 0 with recorded false, and no session at all gives session null', (t) => {
  const dataDir = useDataDir(t)
  const a = run(dataDir, ['--spend', '--session', 'nothing'])
  assert.equal(a.status, 0)
  assert.deepEqual([a.json.session, a.json.recorded, a.json.usd], ['nothing', false, null])
  const b = run(dataDir, ['--spend'])
  assert.equal(b.status, 0)
  assert.deepEqual([b.json.session, b.json.recorded], [null, false])
})

test('every other use is a misuse: usage line, non-zero exit, and no figure of any session', (t) => {
  const dataDir = useDataDir(t)
  session(dataDir, 'other')
  const misuses = [
    ['--spend', '--session'], ['--spend', '--session', '--run'], ['--spend', '--session', 'bad id'], ['--spend', '--session', 'unknown'], ['--spend', '--session', 'a/b'],
    ['--spend', '--session', 'a', '--session', 'b'], ['--spend', '--run', 'x'], ['--spend', '--seats'], ['--spend', '--delegates'], ['--spend', '--since', '1'],
    ['finalize', '--spend'], ['price', '--spend'], ['--spend', 'extra'], ['--spend', '--no-tests'],
  ]
  for (const args of misuses) {
    const r = run(dataDir, args)
    assert.notEqual(r.status, 0, args.join(' '))
    assert.ok(r.json.error.includes(`usage: ${FORM}`), args.join(' '))
    assert.ok(!r.stdout.includes('"usd"'), args.join(' '))
  }
})

test('the bin names the new form in its usage text', () => {
  assert.ok(fs.readFileSync(BIN, 'utf8').includes(FORM))
})
