'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const dr = require('../plugins/aether/lib/delegate-run.js')
const log = require('../plugins/aether/lib/delegate-log.js')

function setupExternal(t) {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const base = repo.git('rev-parse', 'HEAD')
  const brief = path.join(dataDir, 'delegates', 'briefs', 't1-1.md')
  fs.mkdirSync(path.dirname(brief), { recursive: true })
  fs.writeFileSync(brief, 'Write src/new.js.')
  const file = path.join(dataDir, 'delegates', 'external', `${log.fileKey('s1', 't1')}.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({
    id: 't1',
    session: 's1',
    cwd: repo.dir,
    attempt: 1,
    step: 'haiku',
    effort: 'high',
    launchKind: 'first',
    edits: true,
    owns: ['src/**'],
    tests: 'npm test',
    brief,
    findings: null,
    carry: null,
    pin: null,
    base,
    harness: 'grok',
    rung: { model: 'grok-4.7', effort: 'high', group: 'grok' },
    task: { description: 'd', prompt: 'P' },
    alternates: [],
    timeoutMs: 570000,
  }))
  return { repo, dataDir }
}

test('a blocked external delegate returns status blocked with the full question and patch path in text, truncated reason, log patch, and wait passes text (#294)', async (t) => {
  const { repo, dataDir } = setupExternal(t)
  const longQuestion = `Need permission to edit ${'outside/file.js and '.repeat(20)}run tests.`
  assert.ok(longQuestion.length > 300)
  const patchPath = path.join(repo.dir, '.aether', 'runs', 'r1', 'patches', 'task-1-attempt-1.patch')
  const blocked = {
    status: 'blocked',
    id: 'r1',
    run: 'r1',
    cause: 'blocked',
    question: longQuestion,
    reason: longQuestion,
    tried: [{ pair: 'grok/grok-4.7@high', cause: 'blocked', patch: patchPath, continued: false }],
  }
  const result = await dr.runTask({ id: 't1', session: 's1', cwd: repo.dir, dataDir }, { delegateCommand: async () => blocked })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'blocked')
  assert.ok(typeof result.text === 'string')
  assert.ok(result.text.includes(longQuestion), 'text must hold the whole question')
  const lines = result.text.split('\n')
  assert.ok(lines.some((line) => line.includes(patchPath) && line !== longQuestion), 'patch path must be on a line of its own')
  assert.equal(result.reason.length, 300)
  assert.ok(result.reason.endsWith('...'))
  const entry = log.readEntries(dataDir, { task: 't1', session: 's1' }).find((e) => e.kind === 'result')
  assert.equal(entry?.patch, patchPath)
  const waited = await dr.wait({ id: 't1', session: 's1', dataDir, seconds: 1 })
  assert.equal(waited.done, true)
  assert.equal(waited.ok, false)
  assert.equal(waited.status, 'blocked')
  assert.equal(waited.text, result.text)
  assert.equal(waited.reason, result.reason)
})

test('a blocked external delegate without a patch puts only the question in text and null in log patch (#294)', async (t) => {
  const { repo, dataDir } = setupExternal(t)
  const question = 'Which file owns the schema?'
  const blocked = {
    status: 'blocked',
    id: 'r1',
    run: 'r1',
    cause: 'needs-context',
    question,
    reason: question,
    tried: [{ pair: 'grok/grok-4.7@high', cause: 'needs-context', patch: null, continued: false }],
  }
  const result = await dr.runTask({ id: 't1', session: 's1', cwd: repo.dir, dataDir }, { delegateCommand: async () => blocked })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'blocked')
  assert.equal(result.text, question)
  assert.equal(result.reason, question)
  const entry = log.readEntries(dataDir, { task: 't1', session: 's1' }).find((e) => e.kind === 'result')
  assert.equal(entry?.patch, null)
})

test('other non-done statuses such as no-candidate still return text: null (#294)', async (t) => {
  const { repo, dataDir } = setupExternal(t)
  const failed = { status: 'no-candidate', id: 'r1', run: 'r1', cause: 'failed', reason: 'quota gone', tried: [] }
  const result = await dr.runTask({ id: 't1', session: 's1', cwd: repo.dir, dataDir }, { delegateCommand: async () => failed })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'no-candidate')
  assert.equal(result.text, null)
  assert.equal(result.reason, 'quota gone')
})
