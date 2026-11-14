'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const review = require('../plugins/aether/lib/skill-review.js')

function skill(root, name, { where = '.agents/skills', body = 5, description = 'Use for the work.', frontName = name, extra = '' } = {}) {
  const dir = path.join(root, where, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), ['---', `name: ${frontName}`, ...(description === null ? [] : [`description: ${description}`]), '---', ...Array.from({ length: body }, (_, i) => `rule ${i + 1}${extra}`)].join('\n') + '\n')
  return dir
}
function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const data = tempDir(t, 'aether-data-')
  return { repo, home, data, opts: { cwd: repo.dir, home }, ctx: { env: {}, home, now: 5000, dataDir: data } }
}
const write = (w, file, tool = 'Write') => ({ session_id: 's1', cwd: w.repo.dir, tool_name: tool, tool_input: { file_path: file } })

test('a good skill has no problem; size, name and description are checked (R32)', (t) => {
  const w = world(t)
  assert.deepEqual(review.reviewSkill(skill(w.repo.dir, 'good'), w.opts), [])
  const problems = review.reviewSkill(skill(w.repo.dir, 'bad', { body: 600, description: null, frontName: 'Other' }), w.opts)
  assert.equal(problems.length, 4)
  assert.ok(problems.some((p) => p.includes('has 6') && p.includes('lines (at most 500)')))
  assert.ok(problems.includes('no description'))
})

test('a skill with the same name in a personal folder, or with the same content under another name, is a duplicate; a link to the same folder is not (R32, A8)', (t) => {
  const w = world(t)
  const mine = skill(w.repo.dir, 'erebus-ui')
  skill(w.home, 'erebus-ui', { where: '.agents/skills', extra: ' (other text)' })
  assert.ok(review.reviewSkill(mine, w.opts).some((p) => p.startsWith('a skill with the same name exists at ') && p.endsWith(path.join(w.home, '.agents', 'skills', 'erebus-ui'))))
  const copy = skill(w.repo.dir, 'erebus-ui-copy', { frontName: 'erebus-ui-copy' })
  const twin = skill(w.repo.dir, 'erebus-twin', { frontName: 'erebus-ui-copy' })
  fs.writeFileSync(path.join(twin, 'SKILL.md'), fs.readFileSync(path.join(copy, 'SKILL.md')))
  assert.ok(review.reviewSkill(twin, w.opts).some((p) => p.startsWith('the same content as the skill "erebus-ui-copy" at ')))
  const solo = skill(w.repo.dir, 'solo')
  fs.mkdirSync(path.join(w.repo.dir, '.claude', 'skills'), { recursive: true })
  fs.symlinkSync(solo, path.join(w.repo.dir, '.claude', 'skills', 'solo'))
  assert.deepEqual(review.reviewSkill(solo, w.opts), [])
})

test('after the Lead writes a skill the handler names its problems, records it as created once, and changes nothing (C11, H3 scenario 24)', (t) => {
  const w = world(t)
  const dir = skill(w.repo.dir, 'long-one', { body: 600 })
  const before = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')
  const text = review.posttool(write(w, path.join(dir, 'SKILL.md')), w.ctx)
  assert.ok(text.startsWith('Skill "long-one": SKILL.md has 6') && text.includes('(at most 500)'))
  assert.equal(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), before)
  review.posttool(write(w, path.join(dir, 'SKILL.md'), 'Edit'), w.ctx)
  const created = fs.readFileSync(review.createdFile(w.data), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(created.length, 1, 'the second edit does not record it again')
  assert.deepEqual([created[0].session, created[0].repo, created[0].name, created[0].path, created[0].type, created[0].time], ['s1', w.repo.dir, 'long-one', dir, 'project', 5000])
  const good = skill(w.repo.dir, 'fine')
  const fine = review.posttool(write(w, path.join(good, 'SKILL.md')), w.ctx)
  assert.ok(fine && fine.includes('aether:skills'))
  assert.ok(!fine.includes('.agents/skills/fine'))
})

test('a permanent skill is recorded without a repository, and writes outside the skill folders are ignored (R32)', (t) => {
  const w = world(t)
  const dir = skill(w.home, 'owner-one', { where: '.agents/skills' })
  assert.equal(review.posttool(write(w, path.join(dir, 'SKILL.md')), w.ctx), null)
  const created = fs.readFileSync(review.createdFile(w.data), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual([created[0].repo, created[0].type], [null, 'owner'])
  for (const input of [write(w, path.join(w.repo.dir, 'src', 'a.js')), { ...write(w, path.join(dir, 'SKILL.md')), tool_name: 'Bash' }, null, {}]) assert.equal(review.posttool(input, w.ctx), null)
  assert.equal(fs.readFileSync(review.createdFile(w.data), 'utf8').trim().split('\n').length, 1)
})
