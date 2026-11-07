'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const check = require('../plugins/aether/lib/tree-check.js')
const posttool = require('../plugins/aether/lib/continuity-posttool.js')

const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n'
const put = (root, name, text) => fs.writeFileSync(path.join(root, name), text)

test('importsAgents sees @AGENTS.md as a line and not inside a code fence', () => {
  assert.equal(check.importsAgents('@AGENTS.md\n'), true)
  assert.equal(check.importsAgents('# Claude\n\n@AGENTS.md\n\nUse pnpm.\n'), true)
  assert.equal(check.importsAgents('  @./AGENTS.md  \n'), true)
  assert.equal(check.importsAgents('see @AGENTS.md for more\n'), false)
  assert.equal(check.importsAgents('```\n@AGENTS.md\n```\n'), false)
  assert.equal(check.importsAgents(''), false)
})

test('a CLAUDE.md of 74 lines that does not import a 161-line AGENTS.md is reported; a one-line @AGENTS.md is not (C5, H2 scenario 10)', (t) => {
  const dir = tempDir(t)
  put(dir, 'AGENTS.md', lines(161))
  put(dir, 'CLAUDE.md', lines(74))
  assert.deepEqual(check.checkProjectFiles(dir), [{ code: 'claude-no-import', file: 'CLAUDE.md' }])
  put(dir, 'CLAUDE.md', '@AGENTS.md\n')
  assert.deepEqual(check.checkProjectFiles(dir), [])
})

test('the limit of 200 lines applies to CLAUDE.md and to AGENTS.md, and only warns (A5, R12)', (t) => {
  const dir = tempDir(t)
  put(dir, 'CLAUDE.md', lines(201))
  assert.deepEqual(check.checkProjectFiles(dir), [{ code: 'claude-too-long', file: 'CLAUDE.md', lines: 201 }])
  put(dir, 'CLAUDE.md', lines(200))
  assert.deepEqual(check.checkProjectFiles(dir), [])
  put(dir, 'AGENTS.md', lines(1543))
  put(dir, 'CLAUDE.md', '@AGENTS.md\n')
  assert.deepEqual(check.checkProjectFiles(dir), [{ code: 'agents-too-long', file: 'AGENTS.md', lines: 1543 }])
  assert.deepEqual(check.checkProjectFiles(dir, { maxLines: 2000 }), [])
  assert.deepEqual(check.checkProjectFiles(path.join(dir, 'missing')), [])
})

test('findingText says what fails, in English and in Spanish', () => {
  assert.equal(check.findingText({ code: 'claude-no-import', file: 'CLAUDE.md' }, { spanish: false }), 'CLAUDE.md does not import AGENTS.md: add the line @AGENTS.md to CLAUDE.md.')
  assert.equal(check.findingText({ code: 'claude-too-long', file: 'CLAUDE.md', lines: 250 }, { spanish: false }), 'CLAUDE.md has 250 lines (the limit is 200): move what is not Claude-only to AGENTS.md or to .claude/rules/.')
  assert.equal(check.findingText({ code: 'agents-too-long', file: 'AGENTS.md', lines: 1543 }, { spanish: true }), 'AGENTS.md tiene 1543 líneas (el tope es 200): divídelo y déjalo como un mapa.')
  assert.equal(check.findingText({ code: 'claude-no-import', file: 'CLAUDE.md' }, { spanish: true }), 'CLAUDE.md no importa a AGENTS.md: agrega la línea @AGENTS.md a CLAUDE.md.')
})

test('after the Lead edits either file, the dispatcher tells it what fails and changes nothing (R12)', (t) => {
  const repo = makeRepo(t)
  put(repo.dir, 'AGENTS.md', lines(161))
  put(repo.dir, 'CLAUDE.md', lines(74))
  const before = fs.readFileSync(path.join(repo.dir, 'CLAUDE.md'), 'utf8')
  const ctx = { env: { LANG: 'en_US.UTF-8' }, home: tempDir(t) }
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    const out = posttool.posttool({ cwd: repo.dir, tool_name: 'Edit', tool_input: { file_path: path.join(repo.dir, name) } }, ctx)
    assert.equal(out.additionalContext, 'CLAUDE.md does not import AGENTS.md: add the line @AGENTS.md to CLAUDE.md.', name)
  }
  assert.equal(fs.readFileSync(path.join(repo.dir, 'CLAUDE.md'), 'utf8'), before)
  assert.equal(posttool.posttool({ cwd: repo.dir, tool_name: 'Edit', tool_input: { file_path: path.join(repo.dir, 'README.md') } }, ctx), null)
  put(repo.dir, 'CLAUDE.md', '@AGENTS.md\n')
  assert.equal(posttool.posttool({ cwd: repo.dir, tool_name: 'Write', tool_input: { file_path: 'CLAUDE.md' } }, ctx), null)
})

test('custom limits appear in finding text and fenced imports are ignored', (t) => {
  const dir = tempDir(t)
  put(dir, 'CLAUDE.md', '~~~md\n@AGENTS.md\n~~~\n')
  put(dir, 'AGENTS.md', lines(3))
  const findings = check.checkProjectFiles(dir, { maxLines: 2 })
  assert.deepEqual(findings.map((f) => f.code), ['claude-no-import', 'claude-too-long', 'agents-too-long'])
  assert.match(check.findingText(findings[1], { spanish: false }), /limit is 2/)
  assert.match(check.findingText(findings[2], { spanish: true }), /tope es 2/)
  assert.equal(check.importsAgents('@AGENTS.md extra text\n'), true)
})

test('Write, Edit and MultiEdit warn for both roots from a linked worktree without changing files (R12)', (t) => {
  const repo = makeRepo(t)
  const linked = path.join(tempDir(t), 'linked')
  repo.git('worktree', 'add', '-q', '-b', 'linked', linked)
  const cwd = path.join(linked, 'nested')
  fs.mkdirSync(cwd)
  const ctx = { env: { LANG: 'en_US.UTF-8' }, home: tempDir(t) }
  const snapshots = new Map()
  for (const root of [repo.dir, linked]) {
    put(root, 'CLAUDE.md', lines(201))
    put(root, 'AGENTS.md', lines(root === linked ? 202 : 203))
    for (const name of ['CLAUDE.md', 'AGENTS.md']) {
      const file = path.join(root, name)
      snapshots.set(file, fs.readFileSync(file, 'utf8'))
    }
  }
  const before = repo.git('status', '--porcelain', '--untracked-files=all')
  const linkedBefore = repo.git('-C', linked, 'status', '--porcelain', '--untracked-files=all')
  for (const tool_name of ['Write', 'Edit', 'MultiEdit']) {
    for (const root of [repo.dir, linked]) {
      const expected = [
        'CLAUDE.md does not import AGENTS.md: add the line @AGENTS.md to CLAUDE.md.',
        'CLAUDE.md has 201 lines (the limit is 200): move what is not Claude-only to AGENTS.md or to .claude/rules/.',
        `AGENTS.md has ${root === linked ? 202 : 203} lines (the limit is 200): split it and keep it a map.`,
      ].join('\n')
      for (const name of ['CLAUDE.md', 'AGENTS.md']) {
        const absolute = path.join(root, name)
        for (const file_path of [absolute, path.relative(cwd, absolute)]) {
          assert.deepEqual(posttool.posttool({ cwd, tool_name, tool_input: { file_path } }, ctx),
            { additionalContext: expected }, `${tool_name}: ${file_path}`)
        }
      }
    }
    put(cwd, 'CLAUDE.md', lines(201))
    assert.equal(posttool.posttool({ cwd, tool_name, tool_input: { file_path: 'CLAUDE.md' } }, ctx), null)
  }
  fs.unlinkSync(path.join(cwd, 'CLAUDE.md'))
  for (const [file, text] of snapshots) assert.equal(fs.readFileSync(file, 'utf8'), text, file)
  assert.equal(repo.git('status', '--porcelain', '--untracked-files=all'), before)
  assert.equal(repo.git('-C', linked, 'status', '--porcelain', '--untracked-files=all'), linkedBefore)
})
