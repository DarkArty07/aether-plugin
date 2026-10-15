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
// The launcher's own arguments, in order, before the ones it passes on.
const OWN_ARGS = ['--agent', 'aether:lead', '--effort', 'xhigh', '--permission-mode', 'bypassPermissions', '--settings', SETTINGS]

// A directory with a `claude` that prints one argument per line, put first on the PATH.
function fakeClaude(t) {
  const dir = tempDir(t, 'aether-launcher-')
  const file = path.join(dir, 'claude')
  fs.writeFileSync(file, '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n', { mode: 0o755 })
  return { PATH: `${dir}${path.delimiter}${process.env.PATH}` }
}

const argsOf = (r) => r.stdout.split('\n').slice(0, -1)

test('the launcher is executable and starts the Lead at xhigh, with permissions bypassed and superpowers off', (t) => {
  const r = spawnSync(LAUNCHER, [], { encoding: 'utf8', env: { ...process.env, ...fakeClaude(t) } })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(argsOf(r), OWN_ARGS)
  assert.deepEqual(JSON.parse(SETTINGS), { enabledPlugins: { 'superpowers@claude-plugins-official': false } })
})

test('the launcher passes its arguments on, whole and after its own', (t) => {
  const r = spawnSync(LAUNCHER, ['-p', 'two words', '--resume'], { encoding: 'utf8', env: { ...process.env, ...fakeClaude(t) } })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(argsOf(r).slice(OWN_ARGS.length), ['-p', 'two words', '--resume'])
})

// A `claude` that prints the AETHER_IRREVERSIBLE it was given, or <unset>.
function fakeClaudeEnv(t) {
  const dir = tempDir(t, 'aether-launcher-')
  fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\nprintf "%s\\n" "${AETHER_IRREVERSIBLE-<unset>}"\n', { mode: 0o755 })
  return { PATH: `${dir}${path.delimiter}${process.env.PATH}` }
}

// With no permission prompts, aether-guard is the only check left on an irreversible command.
test('the launcher has aether-guard refuse irreversible commands, unless the shell set the variable', (t) => {
  const run = (value) => {
    const env = { ...process.env, ...fakeClaudeEnv(t) }
    delete env.AETHER_IRREVERSIBLE
    if (value !== undefined) env.AETHER_IRREVERSIBLE = value
    const r = spawnSync(LAUNCHER, [], { encoding: 'utf8', env })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout.trim()
  }
  assert.equal(run(undefined), 'enforce')
  assert.equal(run(''), 'enforce')
  assert.equal(run('log'), 'log')
  assert.equal(run('enforce'), 'enforce')
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
  assert.deepEqual(argsOf(r), [...OWN_ARGS, '--version'])
})

test('the documents show the same settings as the launcher, and the launcher\'s name', () => {
  // Spec 004: the README is the way in; the complete start is in the getting-started guide.
  const guide = fs.readFileSync(path.join(ROOT, 'docs', 'getting-started.md'), 'utf8')
  const readme = [fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'), guide].join('\n')
  assert.ok(readme.includes(`--settings '${SETTINGS}'`), 'the documents name the settings the launcher passes')
  assert.ok(readme.includes('scripts/aether-lead'), 'the documents name the launcher')
  assert.ok(guide.includes('\n### Start\n'), 'the guide has ### Start')
  const rest = guide.slice(guide.indexOf('### Start') + '### Start'.length)
  const end = rest.search(/\n##+ /)
  const start = end < 0 ? rest : rest.slice(0, end)
  for (const text of ['--permission-mode bypassPermissions', 'AETHER_IRREVERSIBLE=enforce', 'AETHER_IRREVERSIBLE=log aether-lead']) {
    assert.ok(start.includes(text), `the guide's Start says the launcher's ${text}`)
  }
  assert.ok(fs.readFileSync(LAUNCHER, 'utf8').includes(SETTINGS), 'the launcher carries them')
})
