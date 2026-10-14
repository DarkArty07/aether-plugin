'use strict'

// scripts/aether-lead is the README's start command with a short name. These tests run it against a
// fake `claude` that prints its arguments, so they spend no tokens and start no session.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')

const ROOT = path.join(__dirname, '..')
const LAUNCHER = path.join(ROOT, 'scripts', 'aether-lead')
const SETTINGS = '{"enabledPlugins":{"superpowers@claude-plugins-official":false}}'

// A directory with a `claude` that prints one argument per line, put first on the PATH.
function fakeClaude(t) {
  const dir = tempDir(t, 'aether-launcher-')
  const file = path.join(dir, 'claude')
  fs.writeFileSync(file, '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n', { mode: 0o755 })
  return { PATH: `${dir}${path.delimiter}${process.env.PATH}` }
}

const argsOf = (r) => r.stdout.split('\n').slice(0, -1)

test('the launcher is executable and starts the Lead at xhigh with superpowers off', (t) => {
  const r = spawnSync(LAUNCHER, [], { encoding: 'utf8', env: { ...process.env, ...fakeClaude(t) } })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(argsOf(r), ['--agent', 'aether:lead', '--effort', 'xhigh', '--settings', SETTINGS])
  assert.deepEqual(JSON.parse(SETTINGS), { enabledPlugins: { 'superpowers@claude-plugins-official': false } })
})

test('the launcher passes its arguments on, whole and after its own', (t) => {
  const r = spawnSync(LAUNCHER, ['-p', 'two words', '--resume'], { encoding: 'utf8', env: { ...process.env, ...fakeClaude(t) } })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(argsOf(r).slice(6), ['-p', 'two words', '--resume'])
})

test('the launcher gives the exit code of claude', (t) => {
  const dir = tempDir(t, 'aether-launcher-')
  fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\nexit 7\n', { mode: 0o755 })
  const r = spawnSync(LAUNCHER, [], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` } })
  assert.equal(r.status, 7)
})

test('the launcher works from fish, the owner\'s shell', (t) => {
  if (spawnSync('fish', ['--version']).error) return t.skip('fish is not installed')
  // --no-config: a user's config.fish may put its own directories ahead of the fake `claude` on the PATH.
  const r = spawnSync('fish', ['--no-config', '-c', `${LAUNCHER} --version`], { encoding: 'utf8', env: { ...process.env, ...fakeClaude(t) } })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(argsOf(r), ['--agent', 'aether:lead', '--effort', 'xhigh', '--settings', SETTINGS, '--version'])
})

test('the README shows the same settings as the launcher, and the launcher\'s name', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  assert.ok(readme.includes(`--settings '${SETTINGS}'`), 'the README names the settings the launcher passes')
  assert.ok(readme.includes('scripts/aether-lead'), 'the README names the launcher')
  assert.ok(fs.readFileSync(LAUNCHER, 'utf8').includes(SETTINGS), 'the launcher carries them')
})
