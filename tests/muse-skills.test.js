'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const skill = (name) => fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'skills', name, 'SKILL.md'), 'utf8')
const FIVE = /agy, codex, grok, cursor,? (?:and )?muse/i

test('the bootstrap and the swarm skill list Muse with the other lane harnesses, and count none as four', () => {
  for (const name of ['using-aether', 'swarm']) {
    const text = skill(name)
    assert.match(text, FIVE, name)
    assert.doesNotMatch(text, /\b(four|4) (external )?harnesses\b/i, name)
  }
})

test('the swarm skill says a Muse call falls back to the native agent without asking', () => {
  assert.match(skill('swarm'), /muse/i)
  assert.match(skill('swarm'), /native/i)
})
