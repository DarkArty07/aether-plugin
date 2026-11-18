'use strict'

// The downloader and byte-for-byte installer behind `aether-plan skills`
// (spec 045, R23): one download, a hash of the review, and a verified copy.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, tempDir } = require('./helpers.js')
const installLib = require('../plugins/aether/lib/skill-install.js')
const { computedHash } = require('../plugins/aether/lib/skill-registry.js')

function putTrusted(dataDir, authors) {
  const file = path.join(dataDir, 'skills', 'trusted.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ authors }))
}

function writeSkill(root, name, { description = 'Build Godot scenes with GDScript.', body = ['Do the work.'] } = {}) {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), ['---', `name: ${name}`, `description: ${description}`, '---', '', ...body].join('\n') + '\n')
  return dir
}

function fakeBin(t, { behavior = 'ok', skill = 'godot-helper' } = {}) {
  const dir = tempDir(t, 'aether-fake-install-')
  const home = tempDir(t, 'aether-fake-install-home-')
  const src = path.join(dir, 'src', skill)
  writeSkill(path.join(dir, 'src'), skill)
  const bin = path.join(dir, 'skills-fake')
  fs.writeFileSync(bin, `#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
if (args[0] !== 'add' || args[1] !== 'acme/scene' || args[2] !== '--skill' || args[3] !== ${JSON.stringify(skill)}) process.exit(2)
${behavior === 'missing' ? 'process.exit(1)' : `fs.cpSync(${JSON.stringify(src)}, path.join(process.cwd(), '.agents', 'skills', ${JSON.stringify(skill)}), { recursive: true })`}
`)
  fs.chmodSync(bin, 0o755)
  return { env: { AETHER_SKILLS_BIN: bin, HOME: home }, home, dir }
}

test('fetchForReview downloads once into an isolated folder under .aether/tmp/skill-review/ of the worktree and writes review.json', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  putTrusted(data, ['acme'])
  const fake = fakeBin(t)
  const r = installLib.fetchForReview({ source: 'acme/scene', name: 'godot-helper', env: fake.env, root: repo.dir })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.ok(r.dir.startsWith(path.join(repo.dir, '.aether', 'tmp', 'skill-review') + path.sep), r.dir)
  assert.ok(!path.resolve(r.dir).startsWith(path.join(repo.dir, '.agents', 'skills') + path.sep), 'never in .agents/skills')
  assert.ok(!path.resolve(r.dir).startsWith(path.join(repo.dir, '.claude', 'skills') + path.sep), 'never in .claude/skills')
  assert.equal(r.hash, computedHash(path.join(r.dir, '.agents', 'skills', 'godot-helper')))
  const review = JSON.parse(fs.readFileSync(path.join(r.dir, 'review.json'), 'utf8'))
  assert.equal(review.name, 'godot-helper')
  assert.equal(review.source, 'acme/scene')
  assert.equal(review.author, 'acme')
  assert.equal(review.hash, r.hash)
})

test('fetchForReview fails when the download leaves no skill folder, and leaves no review folder', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  putTrusted(data, ['acme'])
  const fake = fakeBin(t, { behavior: 'missing' })
  const r = installLib.fetchForReview({ source: 'acme/scene', name: 'godot-helper', env: fake.env, root: repo.dir })
  assert.equal(r.ok, false)
  assert.ok(r.errors.length > 0)
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'tmp', 'skill-review', 'godot-helper')), false)
})

test('copyReviewed copies byte for byte, links .claude/skills and verifies the hash', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const from = writeSkill(tempDir(t, 'aether-review-'), 'godot-helper')
  fs.mkdirSync(path.join(from, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(from, 'scripts', 'run.js'), 'console.log(1)\n')
  const hash = computedHash(from)
  const r = installLib.copyReviewed({ from, name: 'godot-helper', hash, projectRoot: repo.dir, home: tempDir(t, 'aether-home-') })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(r.hash, hash)
  const to = path.join(repo.dir, '.agents', 'skills', 'godot-helper')
  for (const rel of ['SKILL.md', path.join('scripts', 'run.js')]) {
    assert.equal(fs.readFileSync(path.join(to, rel), 'utf8'), fs.readFileSync(path.join(from, rel), 'utf8'), rel)
  }
  const link = path.join(repo.dir, '.claude', 'skills', 'godot-helper')
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true)
  assert.equal(fs.realpathSync(link), fs.realpathSync(to))
})

test('copyReviewed removes the copy and fails when the hash differs', (t) => {
  const repo = makeRepo(t)
  const from = writeSkill(tempDir(t, 'aether-review-'), 'godot-helper')
  const r = installLib.copyReviewed({ from, name: 'godot-helper', hash: '0'.repeat(64), projectRoot: repo.dir, home: tempDir(t, 'aether-home-') })
  assert.equal(r.ok, false)
  assert.match(r.errors.join('\n'), /hash/i)
  assert.equal(fs.existsSync(path.join(repo.dir, '.agents', 'skills', 'godot-helper')), false)
})

test('copyReviewed never overwrites and never writes under home', (t) => {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const from = writeSkill(tempDir(t, 'aether-review-'), 'godot-helper')
  const existing = writeSkill(path.join(repo.dir, '.agents', 'skills'), 'godot-helper', { description: 'The owners own stew book.' })
  const before = fs.readFileSync(path.join(existing, 'SKILL.md'), 'utf8')
  const r = installLib.copyReviewed({ from, name: 'godot-helper', hash: computedHash(from), projectRoot: repo.dir, home })
  assert.equal(r.ok, false)
  assert.match(r.errors.join('\n'), /already exists/)
  assert.equal(fs.readFileSync(path.join(existing, 'SKILL.md'), 'utf8'), before)
  assert.equal(fs.existsSync(path.join(home, '.agents', 'skills')), false)
})

test('copyReviewed refuses a name that is not a safe path segment and writes nothing', async (t) => {
  for (const name of ['../godot-x', 'a/godot', '-godot']) {
    await t.test(name, () => {
      const repo = makeRepo(t)
      const from = writeSkill(tempDir(t, 'aether-review-'), 'godot-helper')
      const r = installLib.copyReviewed({ from, name, hash: computedHash(from), projectRoot: repo.dir, home: tempDir(t, 'aether-home-') })
      assert.equal(r.ok, false)
      assert.ok(r.errors.length > 0)
      assert.equal(fs.existsSync(path.join(repo.dir, '.agents')), false, 'nothing is written to the project')
    })
  }
})

test('skill-install.js runs no git command and no global install flag', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'skill-install.js'), 'utf8')
  for (const needle of ['git add', 'git commit', '-g', '--global']) {
    assert.equal(text.includes(needle), false, `skill-install.js contains ${needle}`)
  }
})
