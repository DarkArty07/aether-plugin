'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, runBin, PLAN_BIN, PLUGIN, commitIn } = require('./helpers.js')

const BIN_DIR = path.join(PLUGIN, 'bin')

test('aether-plan design-args prints full-mode JSON args from env and repoRoot', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'specs/042-topic/intent.md', '# Intent\n', 'add intent')

  const env = {
    CLAUDE_CODE_SESSION_ID: 'sess-123',
    AETHER_SUPERDELEGATION: 'on',
    AETHER_LANE_HARNESSES: 'agy,codex',
  }
  const r = runBin(PLAN_BIN, ['design-args', 'specs/042-topic'], repo.dir, env)
  assert.equal(r.status, 0, r.stderr || r.stdout)
  assert.equal(r.stdout.trim().split('\n').length, 1)
  assert.deepEqual(r.json, {
    feature: 'specs/042-topic',
    session: 'sess-123',
    repoRoot: fs.realpathSync(repo.dir),
    superdelegation: 'on',
    harnesses: 'agy,codex',
    binDir: BIN_DIR,
  })
})

test('aether-plan design-args --short includes mode, document, intent and author', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'specs/042-topic/design.md', '# Design\n', 'add design')

  const env = {
    CLAUDE_CODE_SESSION_ID: 'sess-456',
    AETHER_SUPERDELEGATION: 'off',
    AETHER_LANE_HARNESSES: 'agy',
  }
  const r = runBin(
    PLAN_BIN,
    ['design-args', 'specs/042-topic', '--short', 'specs/042-topic/design.md', '--intent', 'owner words', '--author', 'opus'],
    repo.dir,
    env,
  )
  assert.equal(r.status, 0, r.stderr || r.stdout)
  assert.deepEqual(r.json, {
    feature: 'specs/042-topic',
    session: 'sess-456',
    repoRoot: fs.realpathSync(repo.dir),
    superdelegation: 'off',
    harnesses: 'agy',
    binDir: BIN_DIR,
    mode: 'short',
    document: 'specs/042-topic/design.md',
    intent: 'owner words',
    author: 'opus',
  })
  assert.equal(repo.git('status', '--porcelain').trim(), '')
})

test('aether-plan design-args rejects --short without --intent or --author', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'specs/042-topic/design.md', '# Design\n', 'add design')

  for (const args of [
    ['design-args', 'specs/042-topic', '--short', 'specs/042-topic/design.md'],
    ['design-args', 'specs/042-topic', '--short', 'specs/042-topic/design.md', '--intent', 'x'],
    ['design-args', 'specs/042-topic', '--short', 'specs/042-topic/design.md', '--author', 'opus'],
    ['design-args', 'specs/042-topic', '--intent', 'x', '--author', 'opus'],
    ['design-args'],
  ]) {
    const r = runBin(PLAN_BIN, args, repo.dir)
    assert.equal(r.status, 1, args.join(' '))
    assert.equal(r.json.ok, false)
    assert.match(r.json.errors[0], /usage:/)
  }
})

test('aether-plan design-args errors when feature folder, intent.md, or short document is missing', (t) => {
  const repo = makeRepo(t)
  const missingFeature = runBin(PLAN_BIN, ['design-args', 'specs/099-missing'], repo.dir)
  assert.equal(missingFeature.status, 1)
  assert.equal(missingFeature.json.ok, false)
  assert.ok(missingFeature.json.errors[0].includes('specs/099-missing'), missingFeature.json.errors[0])

  fs.mkdirSync(path.join(repo.dir, 'specs', '042-topic'), { recursive: true })
  const missingIntent = runBin(PLAN_BIN, ['design-args', 'specs/042-topic'], repo.dir)
  assert.equal(missingIntent.status, 1)
  assert.equal(missingIntent.json.ok, false)
  assert.ok(missingIntent.json.errors[0].includes('intent.md'), missingIntent.json.errors[0])

  const missingDoc = runBin(
    PLAN_BIN,
    ['design-args', 'specs/042-topic', '--short', 'specs/042-topic/design.md', '--intent', 'x', '--author', 'opus'],
    repo.dir,
  )
  assert.equal(missingDoc.status, 1)
  assert.equal(missingDoc.json.ok, false)
  assert.ok(missingDoc.json.errors[0].includes('design.md'), missingDoc.json.errors[0])
})

test('aether-plan design-args drops trailing slash on feature and normalizes bare short document names', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'specs/042-topic/design.md', '# Design\n', 'add design')

  const r = runBin(
    PLAN_BIN,
    ['design-args', 'specs/042-topic/', '--short', 'design.md', '--intent', 'owner words', '--author', 'opus'],
    repo.dir,
  )
  assert.equal(r.status, 0, r.stderr || r.stdout)
  assert.equal(r.json.feature, 'specs/042-topic')
  assert.equal(r.json.document, 'specs/042-topic/design.md')
})

test('aether-plan design-args refuses feature or short document shapes that the workflow refuses', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'specs/042-topic/intent.md', '# Intent\n', 'add intent')
  commitIn(repo, repo.dir, 'specs/042-topic/design.md', '# Design\n', 'add design')
  commitIn(repo, repo.dir, 'other/042-topic/intent.md', '# Other\n', 'add other')
  commitIn(repo, repo.dir, 'specs/099-other/design.md', '# Other design\n', 'add other design')

  const absFeature = path.join(repo.dir, 'specs', '042-topic')
  for (const badFeature of [absFeature, 'other/042-topic', '042-topic', 'specs/topic']) {
    const r = runBin(PLAN_BIN, ['design-args', badFeature], repo.dir)
    assert.equal(r.status, 1, badFeature)
    assert.equal(r.json.ok, false)
    assert.ok(r.json.errors[0].includes(badFeature), r.json.errors[0])
  }

  const absDoc = path.join(repo.dir, 'specs', '042-topic', 'design.md')
  for (const badDoc of [absDoc, 'intent.md', 'notes.md', 'specs/042-topic/intent.md', 'specs/099-other/design.md']) {
    const r = runBin(
      PLAN_BIN,
      ['design-args', 'specs/042-topic', '--short', badDoc, '--intent', 'x', '--author', 'opus'],
      repo.dir,
    )
    assert.equal(r.status, 1, badDoc)
    assert.equal(r.json.ok, false)
    assert.ok(r.json.errors[0].includes(badDoc), r.json.errors[0])
  }
})

test('aether-plan design-args rejects --intent followed by a flag, same as --short and --author', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'specs/042-topic/design.md', '# Design\n', 'add design')

  for (const args of [
    ['design-args', 'specs/042-topic', '--short', '--intent', 'x', '--author', 'opus'],
    ['design-args', 'specs/042-topic', '--short', 'design.md', '--intent', '--foo', '--author', 'opus'],
    ['design-args', 'specs/042-topic', '--short', 'design.md', '--intent', 'x', '--author', '--other'],
  ]) {
    const r = runBin(PLAN_BIN, args, repo.dir)
    assert.equal(r.status, 1, args.join(' '))
    assert.equal(r.json.ok, false)
    assert.match(r.json.errors[0], /usage:/)
  }
})

test('aether-plan design-args formats git spawn errors and non-missing stat errors as JSON', (t) => {
  const repo = makeRepo(t)
  const gitErr = runBin(PLAN_BIN, ['design-args', 'specs/042-topic'], repo.dir, { PATH: '' })
  assert.equal(gitErr.status, 1)
  assert.equal(gitErr.stderr, '')
  assert.equal(gitErr.json.ok, false)
  assert.equal(gitErr.json.errors.length, 1)

  const longFeature = `specs/042-${'a'.repeat(5000)}`
  const statErr = runBin(PLAN_BIN, ['design-args', longFeature], repo.dir)
  assert.equal(statErr.status, 1)
  assert.equal(statErr.stderr, '')
  assert.equal(statErr.json.ok, false)
  assert.equal(statErr.json.errors.length, 1)
})
