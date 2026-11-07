'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { PLUGIN } = require('./helpers.js')
const seatCalls = require('../plugins/aether/lib/seat-calls.js')

test('the message of a design round is inside .aether/tmp/ (R15)', () => {
  assert.equal(seatCalls.messageFile('/repo', 'sess-1'), path.join('/repo', '.aether', 'tmp', 'seats', 'sess-1', 'message.md'))
  const design = fs.readFileSync(path.join(PLUGIN, 'workflows', 'design.workflow.js'), 'utf8')
  assert.ok(design.includes('.aether/tmp/seats/') && !design.includes('.aether-tmp/seats'))
})

test('the mod accepts the message of a round in the new place and in the old one, and nothing else changes (R15, R19)', async () => {
  const { PAYLOAD_PATH } = await import(pathToFileURL(path.join(PLUGIN, 'hooks', 'ops-command.mjs')).href)
  const SESSION = 'abc-123'
  assert.ok(PAYLOAD_PATH.test(`/repo/.aether/tmp/seats/${SESSION}/message.md`))
  assert.ok(PAYLOAD_PATH.test(`/repo/.aether-tmp/seats/${SESSION}/message.md`))
  assert.ok(!PAYLOAD_PATH.test(`/repo/.aether/tmp/seats/${SESSION}/other.md`))
  assert.ok(!PAYLOAD_PATH.test('/repo/.aether/tmp/x/message.md'))
})

test('the work of a round and of a delegate is named in .aether/work/ and no code writes the old seats and delegates folders (R15)', () => {
  const lib = path.join(PLUGIN, 'lib')
  for (const file of ['seats.js', 'delegate-calls.js']) {
    const text = fs.readFileSync(path.join(lib, file), 'utf8')
    assert.ok(/workDir\(/.test(text), `${file} uses run.workDir`)
    assert.ok(!/aetherDir\(mainRoot\), '(seats|delegates)'/.test(text), `${file} no longer builds the old folder`)
  }
})
