'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hits } = require('./retired-patterns.js')
const { tempDir } = require('./helpers.js')
const { spendReport } = require('../plugins/aether/lib/spend.js')
const { delegatesReport } = require('../plugins/aether/lib/delegate-report.js')

const OLD = path.join('router', 'dec' + 'isions.jsonl')

test('the old journal and its reader are not in the searched tree (d)', () => {
  assert.deepEqual(hits(['journal']), [])
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'router-' + 'log.js')), false)
})

test('an old journal and an old session file on disk change no figure and are not deleted', (t) => {
  const dataDir = tempDir(t)
  fs.mkdirSync(path.join(dataDir, 'router'), { recursive: true })
  const journal = path.join(dataDir, OLD)
  fs.writeFileSync(journal, JSON.stringify({ kind: 'outcome', id: 'x', time: Date.now(), session: 's', model: 'sonnet', tokens: { input: 1e6, output: 1e6 } }) + '\n')
  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true })
  const stale = path.join(dataDir, 'sessions', 's1.' + 'router' + '.json')
  fs.writeFileSync(stale, '{}')
  const report = delegatesReport({ dataDir, session: 's' })
  assert.deepEqual(report.delegations ?? [], [])
  const spend = spendReport({ dataDir, session: 's' })
  assert.equal(spend.recorded, false)
  assert.ok(fs.existsSync(journal))
  assert.ok(fs.existsSync(stale))
})
