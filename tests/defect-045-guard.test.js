'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo, useDataDir, PLUGIN } = require('./helpers.js')
const { decide, decideBash, irreversibleClasses } = require('../plugins/aether/lib/guard.js')
const { readPending } = require('../plugins/aether/lib/pending.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const ROOT = path.join(__dirname, '..')
const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
const human = (text, time) => JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content: text } })

function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const data = useDataDir(t)
  const configDir = tempDir(t, 'aether-claude-')
  const previous = { HOME: process.env.HOME, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR }
  process.env.HOME = home
  process.env.CLAUDE_CONFIG_DIR = configDir
  t.after(() => { for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })
  put(path.join(repo.dir, '.agents', 'skills', 'mine', 'SKILL.md'))
  put(path.join(repo.dir, '.agents', 'skills', 'pdf', 'SKILL.md'))
  put(path.join(repo.dir, 'skills-lock.json'), JSON.stringify({ version: 1, skills: { pdf: { source: 'anthropics/skills' } } }))
  fs.mkdirSync(path.join(repo.dir, '.claude', 'skills'), { recursive: true })
  fs.symlinkSync(path.join(repo.dir, '.agents', 'skills', 'pdf'), path.join(repo.dir, '.claude', 'skills', 'pdf'))
  put(path.join(home, '.agents', 'skills', 'owner-one', 'SKILL.md'))
  const enforce = { ...process.env, AETHER_IRREVERSIBLE: 'enforce' }
  const file = (target, who = { agent_type: 'aether:lead' }, tool = 'Write') => ({ hook_event_name: 'PreToolUse', cwd: repo.dir, session_id: 's1', tool_name: tool, tool_input: { file_path: target }, ...who })
  const bash = (command, env = enforce) => decideBash({ hook_event_name: 'PreToolUse', cwd: repo.dir, session_id: 's1', tool_name: 'Bash', tool_input: { command } }, env)
  const trust = (...authors) => put(path.join(data, 'skills', 'trusted.json'), JSON.stringify({ authors }))
  const allow = (quote) => {
    put(path.join(configDir, 'projects', '-p', 's1.jsonl'), human(quote, '2026-11-07T10:00:00.000Z') + '\n')
    return autonomy.grant(repo.dir, { class: 'skill-install', quote, session: 's1', scope: 'session' }, { configDir })
  }
  return { repo, home, data, configDir, enforce, file, bash, trust, allow }
}

const READS = [
  'find ~/.claude -name settings.json',
  'find . -name settings.json -path "*/.claude/*"',
  'find ~/.claude/plugins/data -name trusted.json',
  'sudo find ~/.claude/plugins/data -name trusted.json',
  '/usr/bin/find ~/.claude/plugins/data -name trusted.json',
  'gh issue create --title t --body "mentions .claude/settings.json and skills/trusted.json"',
  'gh pr comment 3 --body "the .claude/hooks folder and skills/trusted.json"',
  'find .claude/hooks -type f',
  "find .claude/hooks -name '*.sh' | wc -l",
  'find .claude -name settings.json | grep hooks',
  'gh issue view 3 --json body',
  'gh pr view 3 | head -20',
]
const WRITES = [
  'echo {} > .claude/settings.json',
  'cp x .claude/settings.json',
  'rm -rf .claude/hooks',
  'sed -i s/a/b/ .claude/settings.json',
  'find .claude -name settings.json -delete',
  'echo {} > ~/.claude/plugins/data/skills/trusted.json',
  'gh issue create --body x > .claude/settings.json',
  'gh issue create --body "$(cp x .claude/settings.json)"',
]
test('R4: reads that only name Claude settings or the trusted list are not refused', (t) => {
  const w = world(t)
  for (const command of READS) assert.equal(w.bash(command), null, command)
})
test('R4: a write, redirection or deletion on those targets is still refused', (t) => {
  const w = world(t)
  for (const command of WRITES) assert.notEqual(w.bash(command), null, command)
})
test('R4: a find or gh read redirected with >& to those targets is still refused', (t) => {
  const w = world(t)
  const REDIRECT_WRITES = [
    'find . >& .claude/settings.json',
    'find . >&.claude/settings.json',
    'gh issue view 3 >& .claude/settings.json',
    'find . >& skills/trusted.json',
    'find . >&skills/trusted.json',
    'gh issue view 3 >& skills/trusted.json',
    `find . >& ${w.data}/skills/trusted.json`,
    `gh issue view 3 >& ${w.data}/skills/trusted.json`,
  ]
  for (const command of REDIRECT_WRITES) assert.notEqual(w.bash(command), null, command)
})
test('R4: a find piped to an unknown writer, or through an unresolved redirect, still refuses', (t) => {
  const w = world(t)
  const PIPED_UNKNOWN = [
    'find .claude/settings.json | xargs tee </dev/null',
    'find .claude/hooks -type f | xargs perl -pi -e s/a/b/',
    'find .claude/settings.json | while read f; do echo x > "$f"; done',
    'echo \'{}\' > "$(find .claude/settings.json)"',
    'echo \'{}\' > "$(find skills/trusted.json)"',
    `echo '{}' > "$(find ${w.data}/skills/trusted.json)"`,
  ]
  for (const command of PIPED_UNKNOWN) assert.notEqual(w.bash(command), null, command)
})
test('R4: a read-only find piped to a writer still refuses (!writes clause)', (t) => {
  const w = world(t)
  const PIPED_WRITES = [
    'find .claude/settings.json | xargs rm',
    'sudo find .claude/settings.json | xargs rm',
    'find .claude/hooks | while read f; do rm "$f"; done',
    'find .claude/settings.json -print0 | xargs -0 sed -i s/a/b/',
    'find ~/.claude/plugins/data/skills/trusted.json | xargs rm',
    `find ${w.data}/skills/trusted.json | xargs rm`,
  ]
  for (const command of PIPED_WRITES) assert.notEqual(w.bash(command), null, command)
  for (const command of ['find .claude/settings.json', 'find ~/.claude/plugins/data/skills/trusted.json']) {
    assert.equal(w.bash(command), null, command)
  }
})
