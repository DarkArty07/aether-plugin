'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const swarm = () => fs.readFileSync(path.join(PLUGIN, 'skills', 'swarm', 'SKILL.md'), 'utf8')

test('resuming a run is recompiling with --run, and the compile keeps the selection (R21)', () => {
  const text = swarm()
  assert.match(text, /--run/)
  assert.match(text, /resum/i)
  assert.match(text, /keep[s]? the .*selection|selection.*keep[s]?/i)
  assert.match(text, /stderr/)
})
