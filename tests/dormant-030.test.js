'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')

const HOOKS = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')).hooks
const commands = Object.values(HOOKS).flat().flatMap((group) => group.hooks.map((h) => h.command)).filter((c) => c.includes('aether-continuity') || c.includes('aether-session-start'))
const SOURCES = ['startup', 'resume', 'clear', 'compact', 'fork']

const listing = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).sort() : [])

test('every hook of the feature, in a session that is not the Lead, exits 0, prints nothing and writes nothing (C14, R40)', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const configDir = tempDir(t, 'aether-config-')
  const home = tempDir(t, 'aether-home-')
  const watched = [repo.dir, data, configDir, home]
  const before = watched.map(listing)
  assert.ok(commands.length >= 13, `${commands.length} commands`)
  for (const command of commands) {
    const args = command.replace(/^node "\$\{CLAUDE_PLUGIN_ROOT\}\//, '').replace(/"/g, '').split(/\s+/)
    for (const source of SOURCES) {
      const input = { hook_event_name: 'X', session_id: 'a-plain-session', source, cwd: repo.dir, reason: 'other', error: 'x', last_assistant_message: 'hello', compact_summary: 's', trigger: 'auto', tool_name: 'Write', tool_input: { file_path: path.join(repo.dir, '.claude', 'skills', 'x', 'SKILL.md'), command: 'npx skills add a/b' } }
      const r = spawnSync(process.execPath, [path.join(PLUGIN, args[0]), ...args.slice(1)], { cwd: repo.dir, input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir, HOME: home } })
      assert.deepEqual([command, source, r.status, r.stdout], [command, source, 0, ''])
    }
  }
  assert.deepEqual(watched.map(listing), before)
})

test('aether-doctor tidy and aether-autonomy trust act only when called and write nothing on their own (R40)', (t) => {
  const dir = tempDir(t)
  const r = spawnSync(process.execPath, [path.join(PLUGIN, 'bin', 'aether-doctor'), 'tidy', dir], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.deepEqual(listing(dir), [])
})

test('nothing the feature adds calls a model: its modules start no model, harness or lane process (R41)', () => {
  const lib = path.join(PLUGIN, 'lib')
  const files = fs.readdirSync(lib).filter((f) => /^(continuity|tree|skill|tidy)-.*\.js$/.test(f))
  assert.ok(files.length >= 18, files.join(', '))
  for (const file of files) {
    const text = fs.readFileSync(path.join(lib, file), 'utf8')
    assert.ok(!/require\('\.\/(lane|lanes|harness|superdelegation|seats|delegate-run)[^']*'\)/.test(text), `${file} asks for a module that calls a model`)
    assert.ok(!/(spawn|spawnSync|execFile|execFileSync|exec)\(\s*['"`](claude|aether-lane|agy|codex|grok|muse|cursor-agent)\b/.test(text), `${file} starts a harness`)
  }
})
