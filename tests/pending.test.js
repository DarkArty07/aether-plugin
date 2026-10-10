'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { pendingFile, appendPending, readPending } = require('../plugins/aether/lib/pending.js')

test('the pending list is .aether/pending.jsonl under the main checkout', (t) => {
  const root = tempDir(t)
  assert.equal(pendingFile(root), path.join(root, '.aether', 'pending.jsonl'))
})

test('appendPending creates the directory and writes one JSON line per entry, read back in order', (t) => {
  const root = tempDir(t)
  assert.equal(appendPending(root, { n: 1 }), true)
  assert.equal(appendPending(root, { n: 2, text: 'x' }), true)
  assert.equal(fs.readFileSync(pendingFile(root), 'utf8'), '{"n":1}\n{"n":2,"text":"x"}\n')
  assert.deepEqual(readPending(root), [{ n: 1 }, { n: 2, text: 'x' }])
})

test('readPending skips a malformed line and keeps the others', (t) => {
  const root = tempDir(t)
  fs.mkdirSync(path.dirname(pendingFile(root)), { recursive: true })
  fs.writeFileSync(pendingFile(root), ['{"n":1}', 'not json', '', '[1,2]', 'null', '{"n":2', '{"n":3}'].join('\n') + '\n')
  assert.deepEqual(readPending(root), [{ n: 1 }, { n: 3 }])
})

test('readPending is [] when the file is missing', (t) => {
  assert.deepEqual(readPending(tempDir(t)), [])
})

test('appendPending returns false when it cannot write, and never throws', (t) => {
  const root = tempDir(t)
  fs.writeFileSync(path.join(root, '.aether'), 'a file, so the directory cannot be made')
  assert.equal(appendPending(root, { n: 1 }), false)
})
