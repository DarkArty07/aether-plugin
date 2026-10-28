'use strict'

// Issue #117: the source and the class of a fault are identifiers or nothing. A raw fault file the mod did not write
// may hold free text there, and it must not reach the durable summary (spec 014 R10).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const observe = require(path.join(PLUGIN, 'lib', 'observe.js'))
const digest = require(path.join(PLUGIN, 'lib', 'observe-digest.js'))

const MARK = '/home/x/ZEBRA-SRC-4417'
const SESSION = 'aaaaaaaa-0000-0000-0000-000000000001'

const faultFile = (dir, faults) => {
  const file = path.join(dir, 'observe', 'faults', `${SESSION}.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ session: SESSION, count: faults.length, faults }))
}

test('a fault whose source or class is free text reads as unclassified, and a real one is kept', (t) => {
  const dir = tempDir(t)
  faultFile(dir, [
    { time: 1, source: MARK, class: 'handler-threw' },
    { time: 2, source: 'delegate.begin', class: `${MARK} with spaces` },
    { time: 3, source: 'delegate.begin', class: 'handler-threw' },
    { time: 4, source: { name: MARK }, class: 'handler-threw' },
  ])
  assert.deepEqual(
    observe.readFaults(dir).map((f) => [f.source, f.class]),
    [
      ['unclassified', 'handler-threw'],
      ['delegate.begin', 'unclassified'],
      ['delegate.begin', 'handler-threw'],
      ['unclassified', 'handler-threw'],
    ],
  )
})

test('the digest never writes the free text of a fault source into summary.json', (t) => {
  const dir = tempDir(t)
  faultFile(dir, [{ time: 1793000000000, source: MARK, class: 'handler-threw' }])
  digest.digestAll(dir)
  const text = fs.readFileSync(path.join(dir, 'observe', 'summary.json'), 'utf8')
  assert.equal(text.includes('ZEBRA-SRC-4417'), false, text)
  assert.deepEqual(JSON.parse(text).sessions[SESSION].faults, { unclassified: 1 })
})
