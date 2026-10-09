'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir } = require('./helpers.js')

const ROOT = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8')

test('aether-mode launches the Lead on Sonnet at xhigh, with the advisor off', () => {
  const FISH = `env CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir $repo/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh $argv`
  assert.ok(read('scripts', 'aether-mode.fish').includes(FISH))
})

test('the README shows the same launch for bash and zsh', () => {
  const LINE = `aether-mode() { CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir "$(realpath ~/.local/share/aether-plugin/installed/current)/plugins/aether" --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh "$@"; }`
  assert.ok(read('README.md').includes(LINE))
})

test('the manifest is version 0.6.0 and names the Lead, the Designer, the lanes and the autonomy', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.version, '0.6.0')
  assert.match(manifest.description, /the Lead on Sonnet/)
  assert.match(manifest.description, /the Designer on Opus/)
  assert.match(manifest.description, /Lanes run its calls on other coding plans/)
  assert.match(manifest.description, /decides as the owner's delegate/)
})

test('the documents record the decisions and the verified facts', () => {
  const decisions = read('docs', 'decisions.md')
  for (const id of ['A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17']) {
    assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
  }
  const research = read('docs', 'claude-code-research.md')
  assert.match(research, /^## Lead and Designer findings \(2026-10-08\)$/m)
  for (const fact of ['agent_id', 'agent_type', 'cacheTtl', 'autoCompactWindow', 'CLAUDE_CODE_DISABLE_ADVISOR_TOOL']) {
    assert.ok(research.includes(fact), fact)
  }
  const v01 = read('docs', 'superpowers', 'specs', '2026-10-07-aether-plugin-design.md')
  const status = v01.split('\n').find((line) => line.startsWith('- **Status:**'))
  assert.match(status, /2026-10-08-lead-and-designer-design\.md/)
})

test('the documents record the lanes: decisions, facts, and the skills that use them', () => {
  const decisions = read('docs', 'decisions.md')
  for (const id of ['A20', 'A21', 'A22']) assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
  assert.match(decisions, /\*\*Update \(2026-10-08, lanes\)\.\*\*/)
  const research = read('docs', 'claude-code-research.md')
  assert.match(research, /^## Lanes findings \(2026-10-08\)$/m)
  for (const fact of ['remaining_fraction', '--dangerously-skip-permissions', 'AGENTS.md', 'structured_output']) assert.ok(research.includes(fact), fact)
  const lead = read('plugins', 'aether', 'skills', 'using-aether', 'SKILL.md')
  for (const text of ['aether-lane design start --session', 'aether-lane design reply', 'aether-lane design end', '**Exit 3**', 'SendMessage']) {
    assert.ok(lead.includes(text), text)
  }
  const swarm = read('plugins', 'aether', 'skills', 'swarm', 'SKILL.md')
  for (const text of ['--no-lanes', 'laneFailure', '`aether-lane`', 'Blocked by a lane']) assert.ok(swarm.includes(text), text)
  assert.match(read('README.md'), /^### Lanes$/m)
  assert.match(read('README.md'), /^Version 0\.6: /m)
})

test('the documents record the autonomy: decisions, the README, and no per-stage gates', () => {
  const decisions = read('docs', 'decisions.md')
  for (const id of ['A23', 'A24', 'A25']) assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
  assert.match(decisions, /\*\*Update \(2026-10-09, autonomy\)\.\*\*/)
  const readme = read('README.md')
  assert.match(readme, /^### Autonomy$/m)
  assert.ok(readme.includes('| `aether-autonomy` |'))
  assert.ok(readme.includes('docs/superpowers/specs/2026-10-09-lead-autonomy-design.md'))
  assert.doesNotMatch(readme, /approves the spec and the plan/)
  assert.doesNotMatch(readme, /the relay of both sides/)
})

test('the documents record the separation: the README, the decision and the launcher', () => {
  const readme = read('README.md')
  const texts = [
    'node scripts/aether-install.js install',
    'ln -sfn ~/.local/share/aether-plugin/installed/current/scripts/aether-mode.fish ~/.config/fish/functions/aether-mode.fish',
    '`aether-mode --dev`',
    'The main checkout no longer feeds `aether-mode`',
    '### Release',
    'claude plugin tag plugins/aether',
    'docs/superpowers/specs/2026-10-09-separation-design.md',
  ]
  for (const text of texts) assert.ok(readme.includes(text), text)
  assert.ok(!readme.includes('ln -s (realpath scripts/aether-mode.fish)'))
  const decisions = read('docs', 'decisions.md')
  assert.match(decisions, /^\| A26 \|/m)
  assert.ok(decisions.includes('updated A8 and added A26.'))
  assert.ok(read('scripts', 'aether-mode.fish').includes('if test "$argv[1]" = --dev'))
})

const NO_FISH = spawnSync('fish', ['--version']).status === 0 ? false : 'fish is not installed'
const FLAGS = ['--settings', '{"enableWorkflows": true}', '--model', 'sonnet', '--effort', 'xhigh']
const FAKE_CLAUDE = '#!/usr/bin/env node\nconsole.log(JSON.stringify({ argv: process.argv.slice(2), advisor: process.env.CLAUDE_CODE_DISABLE_ADVISOR_TOOL }))\n'

// An installed copy laid out as scripts/aether-install.js leaves it, a development tree, a fish
// function directory that links the launcher through `current`, and a fake claude that prints
// what it was given. The paths hold a space, as a data directory may.
function layout(t) {
  const base = tempDir(t, 'aether launcher ')
  const installed = path.join(base, 'installed')
  const version = path.join(installed, '0.6.0-abcdef0')
  const dev = path.join(base, 'dev')
  const fn = path.join(base, 'fn')
  const bin = path.join(base, 'bin')
  for (const dir of [path.join(version, 'plugins', 'aether'), path.join(version, 'scripts'), path.join(dev, 'plugins', 'aether'), fn, bin]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.copyFileSync(path.join(ROOT, 'scripts', 'aether-mode.fish'), path.join(version, 'scripts', 'aether-mode.fish'))
  fs.symlinkSync(dev, path.join(version, 'dev-tree'))
  fs.symlinkSync('0.6.0-abcdef0', path.join(installed, 'current'))
  fs.symlinkSync(path.join(installed, 'current', 'scripts', 'aether-mode.fish'), path.join(fn, 'aether-mode.fish'))
  fs.writeFileSync(path.join(bin, 'claude'), FAKE_CLAUDE, { mode: 0o755 })
  return { version, dev, fn, bin }
}

// Runs `aether-mode <args>` in a fish without the user's configuration, which finds the
// function in `fn` and claude in `bin`. Returns the status, stderr, and what claude printed.
function aetherMode({ fn, bin }, args) {
  const script = 'set -g fish_function_path $argv[1] $fish_function_path; set -gx PATH $argv[2] $PATH; aether-mode $argv[3..-1]'
  const r = spawnSync('fish', ['--no-config', '-c', script, fn, bin, ...args], { encoding: 'utf8' })
  if (r.error) throw r.error
  return { status: r.status, stderr: r.stderr, claude: r.stdout.trim() === '' ? null : JSON.parse(r.stdout) }
}

test('aether-mode loads the installed release that current names, resolved, with the same flags', { skip: NO_FISH }, (t) => {
  const l = layout(t)
  const r = aetherMode(l, ['-p', 'hello world'])
  assert.equal(r.status, 0)
  assert.deepEqual(r.claude, { argv: ['--plugin-dir', path.join(l.version, 'plugins', 'aether'), ...FLAGS, '-p', 'hello world'], advisor: '1' })
})

test('aether-mode --dev loads the tree that dev-tree names, and passes the rest on', { skip: NO_FISH }, (t) => {
  const l = layout(t)
  const r = aetherMode(l, ['--dev', '-p', 'hi'])
  assert.equal(r.status, 0)
  assert.deepEqual(r.claude.argv, ['--plugin-dir', path.join(l.dev, 'plugins', 'aether'), ...FLAGS, '-p', 'hi'])
})

test('--dev counts only as the first argument', { skip: NO_FISH }, (t) => {
  const l = layout(t)
  assert.deepEqual(aetherMode(l, ['-p', '--dev']).claude.argv, ['--plugin-dir', path.join(l.version, 'plugins', 'aether'), ...FLAGS, '-p', '--dev'])
})

test('aether-mode --dev refuses a development tree that is gone, and never falls back to the release', { skip: NO_FISH }, (t) => {
  const l = layout(t)
  fs.rmSync(l.dev, { recursive: true })
  const r = aetherMode(l, ['--dev', '-p', 'hi'])
  assert.equal(r.status, 1)
  assert.equal(r.claude, null)
  assert.match(r.stderr, /^aether-mode: the development tree that .*dev-tree points to is gone$/m)
})

test('run from the repository, aether-mode loads its plugins/aether, with or without --dev', { skip: NO_FISH }, (t) => {
  const l = layout(t)
  fs.rmSync(path.join(l.fn, 'aether-mode.fish'))
  fs.symlinkSync(path.join(ROOT, 'scripts', 'aether-mode.fish'), path.join(l.fn, 'aether-mode.fish'))
  const plugin = path.join(fs.realpathSync(ROOT), 'plugins', 'aether')
  assert.deepEqual(aetherMode(l, ['x']).claude.argv, ['--plugin-dir', plugin, ...FLAGS, 'x'])
  assert.deepEqual(aetherMode(l, ['--dev', 'x']).claude.argv, ['--plugin-dir', plugin, ...FLAGS, 'x'])
})
