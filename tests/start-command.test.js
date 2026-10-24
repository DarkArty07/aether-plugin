'use strict'

// The launcher is the README's start command with a short name. It ships in the plugin, at
// plugins/aether/launcher/aether-lead, and scripts/aether-lead is a forwarder to it, so a link to the script of a clone
// keeps working. These tests run both against a fake `claude` that prints its arguments, so they spend no tokens and
// start no session.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')

const ROOT = path.join(__dirname, '..')
// The forwarder of a clone, the command the documents name, and the launcher it runs.
const LAUNCHER = path.join(ROOT, 'scripts', 'aether-lead')
const PLUGIN_LAUNCHER = path.join(ROOT, 'plugins', 'aether', 'launcher', 'aether-lead')
const SETTINGS = '{"enabledPlugins":{"superpowers@claude-plugins-official":false},"theme":"custom:aether:aether"}'
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

test('the launcher is executable and starts the Lead at xhigh, with permissions bypassed, superpowers off and the Aether theme', (t) => {
  const r = spawnSync(LAUNCHER, [], { encoding: 'utf8', env: { ...process.env, ...fakeClaude(t) } })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(argsOf(r), OWN_ARGS)
  assert.deepEqual(JSON.parse(SETTINGS), {
    enabledPlugins: { 'superpowers@claude-plugins-official': false },
    theme: 'custom:aether:aether',
  })
})

// A plugin theme is selected as custom:<plugin name>:<file name>, measured on Claude Code 2.1.301. The theme is
// only in the session's --settings, so a plain `claude` keeps the user's own theme.
test('the theme the launcher selects is a file the plugin ships, and it sets only colors', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', 'aether', '.claude-plugin', 'plugin.json'), 'utf8'))
  const slug = JSON.parse(SETTINGS).theme
  assert.equal(slug.slice(0, 'custom:'.length), 'custom:')
  const [pluginName, file] = [slug.split(':')[1], slug.split(':')[2]]
  assert.equal(pluginName, plugin.name, 'the slug names this plugin')
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', 'aether', 'themes', `${file}.json`), 'utf8'))
  assert.equal(theme.name, 'Aether')
  assert.equal(theme.base, 'dark')
  const entries = Object.entries(theme.overrides)
  assert.ok(entries.length > 0, 'the theme overrides something')
  for (const [token, color] of entries) assert.match(color, /^#[0-9a-f]{6}$/, `${token} is a #rrggbb color`)
})

test('the launcher passes its arguments on, whole and after its own', (t) => {
  const r = spawnSync(LAUNCHER, ['-p', 'two words', '--resume'], { encoding: 'utf8', env: { ...process.env, ...fakeClaude(t) } })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(argsOf(r).slice(OWN_ARGS.length), ['-p', 'two words', '--resume'])
})

function fakeClaudeWithObserve(t) {
  const dir = tempDir(t, 'aether-launcher-')
  fs.writeFileSync(
    path.join(dir, 'claude'),
    '#!/bin/sh\nprintf "OBSERVE:%s\\n" "${AETHER_OBSERVE-<unset>}"\nfor a in "$@"; do printf "%s\\n" "$a"; done\n',
    { mode: 0o755 },
  )
  return { PATH: `${dir}${path.delimiter}${process.env.PATH}` }
}

test('the launcher recognizes --dev, exports AETHER_OBSERVE=dev and removes it from claude arguments', (t) => {
  const run = (args, env = {}) => {
    const base = { ...process.env, ...fakeClaudeWithObserve(t) }
    delete base.AETHER_OBSERVE
    const r = spawnSync(LAUNCHER, args, { encoding: 'utf8', env: { ...base, ...env } })
    assert.equal(r.status, 0, r.stderr)
    const lines = r.stdout.split('\n').filter(Boolean)
    const observe = lines[0].replace(/^OBSERVE:/, '')
    const claudeArgs = lines.slice(1)
    return { observe, claudeArgs }
  }

  // without the flag nothing is exported by the launcher
  const without = run([])
  assert.equal(without.observe, '<unset>')
  assert.deepEqual(without.claudeArgs, OWN_ARGS)

  // aether-lead --dev gives claude AETHER_OBSERVE=dev and does not pass --dev
  const devRun = run(['--dev'])
  assert.equal(devRun.observe, 'dev')
  assert.deepEqual(devRun.claudeArgs, OWN_ARGS)

  // -p "x" --dev --resume arrives as -p "x" --resume
  const extraRun = run(['-p', 'x', '--dev', '--resume'])
  assert.equal(extraRun.observe, 'dev')
  assert.deepEqual(extraRun.claudeArgs.slice(OWN_ARGS.length), ['-p', 'x', '--resume'])

  // AETHER_OBSERVE=standard aether-lead --dev still gives dev
  const winRun = run(['--dev'], { AETHER_OBSERVE: 'standard' })
  assert.equal(winRun.observe, 'dev')
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
  assert.ok(fs.readFileSync(PLUGIN_LAUNCHER, 'utf8').includes(SETTINGS), 'the launcher carries them')
})

test('the plugin ships the launcher, executable and outside bin/, so it is not on the Bash tool\'s PATH', () => {
  assert.ok(fs.statSync(PLUGIN_LAUNCHER).mode & 0o111, 'it is executable')
  assert.ok(!fs.existsSync(path.join(ROOT, 'plugins', 'aether', 'bin', 'aether-lead')), 'it is not a command of bin/')
  assert.ok(fs.readFileSync(PLUGIN_LAUNCHER, 'utf8').startsWith('#!/bin/sh\n'), 'it is POSIX sh')
})

test('the plugin\'s launcher and the forwarder start claude with the same arguments and the same environment', (t) => {
  const args = ['-p', 'two words', '--resume', '--plugin-dir', '/some path/plugins/aether']
  const run = (command, extra) => {
    const r = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, ...fakeClaude(t), ...extra } })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout
  }
  const direct = run(PLUGIN_LAUNCHER)
  assert.deepEqual(argsOf({ stdout: direct }), [...OWN_ARGS, ...args])
  assert.equal(run(LAUNCHER), direct)
  const env = (command, value) => {
    const dir = tempDir(t, 'aether-launcher-')
    fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\nprintf "%s\\n" "${AETHER_IRREVERSIBLE-<unset>}"\n', { mode: 0o755 })
    const base = { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` }
    delete base.AETHER_IRREVERSIBLE
    if (value !== undefined) base.AETHER_IRREVERSIBLE = value
    return spawnSync(command, [], { encoding: 'utf8', env: base }).stdout
  }
  for (const value of [undefined, 'log']) assert.equal(env(LAUNCHER, value), env(PLUGIN_LAUNCHER, value))
})

// The forwarder runs the launcher by its own resolved path, so a link to it from anywhere finds the plugin.
test('the forwarder is short, and runs the plugin\'s launcher through a link, from any directory', (t) => {
  const text = fs.readFileSync(LAUNCHER, 'utf8')
  assert.ok(fs.statSync(LAUNCHER).mode & 0o111, 'it is executable')
  assert.ok(text.trimEnd().split('\n').length <= 6, 'a few lines')
  assert.ok(text.includes('readlink -f'), 'it resolves its own path')
  assert.ok(text.includes('plugins/aether/launcher/aether-lead'), 'it names the plugin\'s launcher')
  assert.ok(!text.includes('--agent'), 'it carries no copy of the launcher')
  const links = tempDir(t, 'aether-launcher-')
  const first = path.join(links, 'aether-lead')
  const second = path.join(links, 'chained')
  fs.symlinkSync(LAUNCHER, first)
  fs.symlinkSync(first, second)
  const elsewhere = tempDir(t, 'aether-launcher-')
  const expected = argsOf(spawnSync(PLUGIN_LAUNCHER, ['--resume'], { encoding: 'utf8', env: { ...process.env, ...fakeClaude(t) } }))
  for (const command of [first, second]) {
    const r = spawnSync(command, ['--resume'], { cwd: elsewhere, encoding: 'utf8', env: { ...process.env, ...fakeClaude(t) } })
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(argsOf(r), expected)
  }
  // Found by name on the PATH, the way the owner runs a link in ~/.local/bin.
  const r = spawnSync('aether-lead', ['--resume'], { cwd: elsewhere, encoding: 'utf8', env: { ...process.env, PATH: `${links}${path.delimiter}${fakeClaude(t).PATH}` } })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(argsOf(r), expected)
})
