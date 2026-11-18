'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-observe')

test('aether-observe usage names models-read and models-read runs and exits 0', (t) => {
  const dir = tempDir(t)
  const bad = spawnSync('node', [BIN, 'unknown-verb'], {
    encoding: 'utf8',
    env: { ...process.env, AETHER_DATA_DIR: dir },
  })
  assert.equal(bad.status, 1)
  const err = JSON.parse(bad.stdout)
  assert.match(err.error, /models-read/)

  const fakeBin = tempDir(t)
  const fakeMuse = path.join(fakeBin, 'muse')
  fs.writeFileSync(fakeMuse, '#!/bin/sh\nexit 1\n')
  fs.chmodSync(fakeMuse, 0o755)
  const ok = spawnSync('node', [BIN, 'models-read'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      AETHER_DATA_DIR: dir,
      AETHER_LANE_HARNESSES: 'muse',
    },
  })
  assert.equal(ok.status, 0)
  const out = JSON.parse(ok.stdout.trim())
  assert.ok(out && typeof out === 'object')
  assert.equal(out.harnesses.muse.status, 'failed', 'the fake muse exits before it answers initialize')
})
