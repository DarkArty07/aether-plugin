'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const SCOPE = 'Deliver what was asked, at the scope asked. When that work is done and checked, stop and report. Do not add features, tests, files, docs or refactors that were not asked for. If you think one would help, say so at the end instead of doing it.'
const source = fs.readFileSync(path.join(PLUGIN, 'agents', 'mapper.md'), 'utf8')
const [, frontText, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
const field = (key) => new RegExp(`^${key}: (.+)$`, 'm').exec(frontText)[1].trim()

test('R4: the mapper reads only: Read, Grep and Glob, no write tool and no shell', () => {
  assert.deepEqual(field('tools').split(',').map((s) => s.trim()), ['Read', 'Grep', 'Glob'])
  for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash']) assert.ok(!field('tools').includes(tool), tool)
})

test('R4: the mapper is the cheapest rung: haiku at high, the first rung of config/ladder.json', () => {
  const rung = require('../plugins/aether/lib/ladder.js').loadLadder().rungs[0]
  assert.deepEqual([field('model'), field('effort')], [rung.model, rung.effort])
  assert.deepEqual([field('model'), field('effort'), field('maxTurns')], ['haiku', 'high', '40'])
  assert.match(field('description'), /^"?Aether mapper:/)
})

test('R4: the body says it never changes a file, the answer form per requirement, and carries the scope sentence', () => {
  assert.ok(body.includes('Never change a file. You have no shell.'))
  assert.ok(body.includes('Rn: <path>:<line>, <what is reused>, <tests that pin the text>'))
  assert.ok(body.includes('reading positions'))
  assert.ok(body.includes(SCOPE))
})
