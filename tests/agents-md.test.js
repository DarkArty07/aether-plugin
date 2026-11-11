'use strict'
// Issue 221, part A: this repository's own instructions follow the rule of AGENTS.md (the map) and CLAUDE.md
// (the import of AGENTS.md plus the Claude-only lines), and the lane reader still gives an agent the whole map.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { claudeMdSections } = require('../plugins/aether/lib/lane-calls.js')

const ROOT = path.join(__dirname, '..')
const put = (dir, name, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
  fs.writeFileSync(path.join(dir, name), text)
}
const section = (file, text) => `## Instructions from ${file}\n\n${text}`

test('AGENTS.md is the map of this repository, and CLAUDE.md is the three lines that import it (issue 221)', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8'), '# CLAUDE.md\n\n@AGENTS.md\n')
  const map = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8')
  assert.ok(map.startsWith('# AGENTS.md\n\nThis file is the map of this repository for any coding agent that works in it.\n'))
  for (const heading of ['## Commands', '## Architecture', '## Working rules']) assert.ok(map.split('\n').includes(heading), heading)
})

test('a project with only CLAUDE.md gives that file as one section', (t) => {
  const dir = tempDir(t)
  const home = tempDir(t)
  put(dir, 'CLAUDE.md', 'claude only\n')
  assert.deepEqual(claudeMdSections(dir, home), [section(path.join(dir, 'CLAUDE.md'), 'claude only')])
})

test('a CLAUDE.md that imports AGENTS.md gives the map once, and no import line', (t) => {
  const dir = tempDir(t)
  const home = tempDir(t)
  put(dir, 'AGENTS.md', 'MAP-221\n')
  put(dir, 'CLAUDE.md', '# CLAUDE.md\n\n@AGENTS.md\n')
  const text = claudeMdSections(dir, home).join('\n')
  assert.equal(text.split('MAP-221').length - 1, 1)
  assert.ok(!text.includes('@AGENTS.md'))
  assert.equal(claudeMdSections(dir, home).at(-1), section(path.join(dir, 'AGENTS.md'), 'MAP-221'))
})

test('a project with only AGENTS.md gives that file as one section', (t) => {
  const dir = tempDir(t)
  const home = tempDir(t)
  put(dir, 'AGENTS.md', 'the map\n')
  assert.deepEqual(claudeMdSections(dir, home), [section(path.join(dir, 'AGENTS.md'), 'the map')])
})

test('a CLAUDE.md whose imported AGENTS.md is missing behaves as a file without sections (no map, no error)', (t) => {
  const dir = tempDir(t)
  const home = tempDir(t)
  put(dir, 'CLAUDE.md', '# CLAUDE.md\n\n@AGENTS.md\n')
  assert.deepEqual(claudeMdSections(dir, home), [section(path.join(dir, 'CLAUDE.md'), '# CLAUDE.md')])
})
