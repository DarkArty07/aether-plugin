'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const detect = require('../plugins/aether/lib/tidy-detect.js')

const put = (file, text = 'x\n') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n'
const skill = (root, where, name, body = 'rules\n') => put(path.join(root, where, name, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\n${body}`)

test('a clean project has no finding and no notice (C13)', (t) => {
  const root = tempDir(t)
  put(path.join(root, 'AGENTS.md'), lines(50))
  put(path.join(root, 'CLAUDE.md'), '@AGENTS.md\n')
  assert.deepEqual(detect.detect(root, { home: tempDir(t) }), { findings: [] })
  assert.deepEqual(detect.noticeLines([], { spanish: false }), [])
})

test('each disorder is found with its count: a CLAUDE.md that does not import, files over 200 lines, leftovers of the old CLI and duplicate skills (C13, H4 scenario 27)', (t) => {
  const root = tempDir(t)
  const home = tempDir(t)
  put(path.join(root, 'AGENTS.md'), lines(1543))
  put(path.join(root, 'CLAUDE.md'), lines(250))
  for (const name of ['aether.db', 'project.toml', 'CONTEXT.md', 'run.draft.md', 'x.lock']) put(path.join(root, '.aether', name))
  put(path.join(root, '.aether', 'objective-contracts', 'a.json'))
  for (const name of ['README.md', 'runs', 'worktrees']) put(path.join(root, '.aether', name, 'keep'))
  skill(root, '.agents/skills', 'erebus-ui')
  skill(home, '.agents/skills', 'erebus-ui', 'other rules\n')
  skill(root, '.agents/skills', 'twin-a', 'same\n')
  skill(root, '.claude/skills', 'twin-b', 'same\n')
  const { findings } = detect.detect(root, { home })
  assert.deepEqual(findings.map((f) => [f.kind, f.count]), [['claude-no-import', 1], ['too-long', 2], ['old-cli', 6], ['duplicate-skills', 2]])
  assert.deepEqual(findings[1].items, ['CLAUDE.md (250 lines)', 'AGENTS.md (1543 lines)'])
  assert.deepEqual(detect.oldCliLeftovers(root), ['CONTEXT.md', 'aether.db', 'objective-contracts', 'project.toml', 'run.draft.md', 'x.lock'])
  assert.ok(findings[3].items.some((i) => i.startsWith('erebus-ui: ')))
  assert.ok(findings[3].items.some((i) => i.startsWith('twin-a=twin-b: ') || i.startsWith('twin-b=twin-a: ')))
})

test('a skill linked from .claude/skills/ to .agents/skills/ is one skill, not a duplicate (C13)', (t) => {
  const root = tempDir(t)
  skill(root, '.agents/skills', 'mine')
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true })
  fs.symlinkSync(path.join(root, '.agents', 'skills', 'mine'), path.join(root, '.claude', 'skills', 'mine'))
  assert.deepEqual(detect.duplicateSkills(root, { home: tempDir(t) }), [])
})

test('the notice has one line per disorder with its count, names aether:tidy and keeps within 5 lines, in both languages (R36)', (t) => {
  const findings = [{ kind: 'claude-no-import', count: 1, items: ['CLAUDE.md'] }, { kind: 'too-long', count: 2, items: [] }, { kind: 'old-cli', count: 6, items: [] }, { kind: 'duplicate-skills', count: 2, items: [] }]
  assert.deepEqual(detect.noticeLines(findings, { spanish: false }), [
    'Tidy: CLAUDE.md does not import AGENTS.md.',
    'Tidy: CLAUDE.md or AGENTS.md over 200 lines: 2.',
    'Tidy: leftovers of the old aether CLI in .aether/: 6.',
    'Tidy: duplicate skills: 2.',
    "Run aether:tidy to order this: it first reports what it would move or delete, and nothing changes without the owner's yes.",
  ])
  const es = detect.noticeLines(findings.slice(0, 1), { spanish: true })
  assert.deepEqual(es, ['Orden: CLAUDE.md no importa a AGENTS.md.', 'Corre aether:tidy para ordenarlo: primero informa lo que movería o borraría, y nada cambia sin el sí del dueño.'])
  assert.ok(t)
})

test('a folder that does not exist or cannot be read gives no finding and does not throw', (t) => {
  assert.deepEqual(detect.detect(path.join(tempDir(t), 'missing'), { home: tempDir(t) }), { findings: [] })
  assert.deepEqual(detect.oldCliLeftovers(path.join(tempDir(t), 'missing')), [])
})
