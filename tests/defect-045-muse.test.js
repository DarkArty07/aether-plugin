'use strict'

// R13/R14: the evidence file of the single 2026-11-17 model/list query pins
// case (1), and the reader returns its five ids in order. No test of this
// task runs the quota renewal or a headless turn.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const EVIDENCE = path.join(__dirname, '..', 'specs', '045-defect-issues', 'evidence', 'muse-model-list-2026-11-17.md')
const FIVE_IDS = ['muse-wonder-1.0', 'muse-wonder-full-1.0', 'muse-ember-1.0', 'muse-spark-1.3', 'muse-spark-1.2']

function evidenceJson() {
  const text = fs.readFileSync(EVIDENCE, 'utf8')
  const block = text.match(/```json\n([\s\S]*?)\n```/)
  assert.ok(block, 'the evidence file holds a fenced json block')
  return JSON.parse(block[1])
}

function fakeMuseFive(t) {
  const dir = tempDir(t, 'aether-fake-muse-five-')
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  const file = path.join(bin, 'muse')
  const script = `#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const dir = process.env.FAKE_MUSE_DIR
let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  let idx
  while ((idx = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, idx)
    buf = buf.slice(idx + 1)
    if (!line.trim()) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    if (msg.method === 'initialize') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'muse' } } }) + '\\n')
    } else if (msg.method === 'model/list') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { models: [{ modelId: 'muse-wonder-1.0' }, { modelId: 'muse-wonder-full-1.0' }, { modelId: 'muse-ember-1.0' }, { modelId: 'muse-spark-1.3' }, { modelId: 'muse-spark-1.2' }], profileId: null, providerId: 'meta', source: 'providerCatalog' } }) + '\\n')
    }
  }
})
`
  fs.writeFileSync(file, script, { mode: 0o755 })
  fs.chmodSync(file, 0o755)
  return { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_MUSE_DIR: dir }
}

test('R13: the evidence file records case (1) with no model call', () => {
  assert.ok(fs.existsSync(EVIDENCE), 'the evidence file exists')
  const doc = evidenceJson()
  assert.equal(doc.why, 'listed')
  assert.equal(doc.usageSeen, false)
  assert.equal(doc.turnSeen, false)
  assert.equal(doc.quotaError, false)
  assert.deepEqual(doc.models.map((m) => m.id), FIVE_IDS)
})

test('R14: the reader returns the five evidence ids in the same order', async (t) => {
  const { listMuseModels } = require(path.join(PLUGIN, 'lib', 'muse-models.js'))
  const env = fakeMuseFive(t)
  const res = await listMuseModels({ env, timeoutMs: 5000 })
  assert.deepEqual(res, { status: 'ok', ids: FIVE_IDS })
})

// Built from parts, so that a search for them does not find this test.
const RENEWAL = 'refresh' + 'MuseQuota'
const HEADLESS = 'muse' + ' exec'

test('R13: no test of this task runs the quota renewal or a headless turn', () => {
  const files = [
    'tests/muse-models.test.js',
    'tests/defect-045-muse.test.js',
    'tests/model-watch.test.js',
    'tests/model-listing.test.js',
    'tests/doctor.test.js',
    'tests/session-start-model-watch.test.js',
    'tests/components-docs.test.js',
    'tests/aether-observe.test.js',
  ]
  for (const file of files) {
    const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    assert.ok(!text.includes(RENEWAL), `${file} calls the quota renewal`)
    assert.ok(!text.includes(HEADLESS), `${file} runs a headless turn`)
  }
})
