'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const { claudeMdSections, buildPrompt } = require('../plugins/aether/lib/lane-calls.js')

const put = (dir, name, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
  fs.writeFileSync(path.join(dir, name), text)
}
const section = (file, text) => `## Instructions from ${file}\n\n${text}`

test('a CLAUDE.md alone gives its section as before (R13)', (t) => {
  const dir = tempDir(t)
  const home = tempDir(t)
  put(home, '.claude/CLAUDE.md', 'personal rules\n')
  put(dir, 'CLAUDE.md', 'project rules\n')
  put(dir, '.claude/CLAUDE.md', 'more rules\n')
  assert.deepEqual(claudeMdSections(dir, home), [
    section(path.join(home, '.claude', 'CLAUDE.md'), 'personal rules'),
    section(path.join(dir, 'CLAUDE.md'), 'project rules'),
    section(path.join(dir, '.claude', 'CLAUDE.md'), 'more rules'),
  ])
  assert.deepEqual(claudeMdSections(tempDir(t), tempDir(t)), [])
})

test('an AGENTS.md alone and alongside a CLAUDE.md gives sections (R13, C5)', (t) => {
  const dir = tempDir(t)
  const home = tempDir(t)
  put(dir, 'AGENTS.md', 'the map\n')
  assert.deepEqual(claudeMdSections(dir, home), [section(path.join(dir, 'AGENTS.md'), 'the map')])
  put(dir, 'CLAUDE.md', 'claude only\n')
  assert.deepEqual(claudeMdSections(dir, home), [section(path.join(dir, 'CLAUDE.md'), 'claude only'), section(path.join(dir, 'AGENTS.md'), 'the map')])
})

test('imports are removed and other instructions preserved (R13, H2 scenario 11)', (t) => {
  const dir = tempDir(t)
  const home = tempDir(t)
  put(dir, 'AGENTS.md', 'the map\n')
  put(dir, 'CLAUDE.md', '@AGENTS.md\n')
  assert.deepEqual(claudeMdSections(dir, home), [section(path.join(dir, 'AGENTS.md'), 'the map')])
  put(dir, 'CLAUDE.md', '@AGENTS.md\n\nUse pnpm, not npm.\n')
  const sections = claudeMdSections(dir, home)
  assert.equal(sections.length, 2)
  assert.ok(sections[0].includes('Use pnpm, not npm.') && !sections[0].includes('@AGENTS.md'))
  assert.equal(sections[1], section(path.join(dir, 'AGENTS.md'), 'the map'))
  put(dir, 'CLAUDE.md', '@./AGENTS.md\n')
  assert.equal(claudeMdSections(dir, home).length, 1)
})

test('the prompt carries AGENTS.md exactly once (C5)', (t) => {
  const dir = tempDir(t)
  put(dir, 'AGENTS.md', 'MAP-OF-THE-PROJECT-4711\n')
  put(dir, 'CLAUDE.md', '@AGENTS.md\n')
  const prompt = buildPrompt({ role: 'implementer', message: 'do the task', workdir: dir, home: tempDir(t) })
  assert.equal(prompt.split('MAP-OF-THE-PROJECT-4711').length - 1, 1)
  assert.ok(prompt.endsWith('do the task'))
})

test('main checkout AGENTS.md is added only when different (R13)', (t) => {
  const repo = makeRepo(t)
  const home = tempDir(t)
  put(repo.dir, 'AGENTS.md', 'main map\n')
  repo.git('add', 'AGENTS.md')
  repo.git('commit', '-q', '-m', 'agents')
  const copy = path.join(tempDir(t), 'wt')
  repo.git('worktree', 'add', '-q', copy, '-b', 'unit')
  assert.deepEqual(claudeMdSections(copy, home), [section(path.join(copy, 'AGENTS.md'), 'main map')])
  put(copy, 'AGENTS.md', 'copy map\n')
  assert.deepEqual(claudeMdSections(copy, home), [section(path.join(copy, 'AGENTS.md'), 'copy map'), section(path.join(repo.dir, 'AGENTS.md'), 'main map')])
})

test('imports in fenced code remain, and project .claude imports are removed', (t) => {
  const dir = tempDir(t)
  const home = tempDir(t)
  put(dir, 'AGENTS.md', 'map\n')
  put(dir, 'CLAUDE.md', '```md\n@AGENTS.md\n```\n@AGENTS.md\n')
  put(dir, '.claude/CLAUDE.md', '@./AGENTS.md\nkeep\n')
  assert.deepEqual(claudeMdSections(dir, home), [section(path.join(dir, 'CLAUDE.md'), '```md\n@AGENTS.md\n```'), section(path.join(dir, '.claude', 'CLAUDE.md'), 'keep'), section(path.join(dir, 'AGENTS.md'), 'map')])
})
