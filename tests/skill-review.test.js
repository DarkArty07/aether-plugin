'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const review = require('../plugins/aether/lib/skill-review.js')
const loads = require('../plugins/aether/lib/skill-loads.js')

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

const reg = require('../plugins/aether/lib/skill-registry.js')

test('location advice accepts only the corresponding agents skill link; prior Lead loads suppress unloaded advice', (t) => {
  const w = world(t)
  const good = skill(w.repo.dir, 'good')
  const wrong = skill(w.repo.dir, 'wrong', { where: '.claude/skills' })
  const links = path.join(w.repo.dir, '.claude', 'skills')
  fs.symlinkSync(path.relative(links, good), path.join(links, 'good'))
  fs.symlinkSync('wrong', path.join(links, 'misdirected'))
  const nested = path.join(good, 'nested')
  fs.mkdirSync(nested)
  fs.copyFileSync(path.join(good, 'SKILL.md'), path.join(nested, 'SKILL.md'))
  fs.symlinkSync(nested, path.join(links, 'nested-good'))
  for (const name of ['good', 'misdirected']) {
    review.posttool(write(w, path.join(links, name, 'SKILL.md')), w.ctx)
  }
  assert.deepEqual(reg.readNotices(w.data).filter((n) => n.kind === 'skill-location').map((n) => n.name), ['wrong'])
  assert.equal(reg.readNotices(w.data).filter((n) => n.kind === 'skill-unloaded').length, 2)
  for (const name of ['aether:skills', 'skills']) {
    loads.recordLeadSkillLoad({ session_id: 'loaded', cwd: w.repo.dir, tool_name: 'Skill', tool_input: { skill: name + ' PRIVATE-ARGS' } }, w.ctx)
    const before = reg.readNotices(w.data).length
    review.posttool({ ...write(w, path.join(good, 'SKILL.md')), session_id: 'loaded' }, w.ctx)
    assert.equal(reg.readNotices(w.data).length, before)
  }
  assert.ok(!JSON.stringify(reg.readUses(w.data)).includes('PRIVATE-ARGS'))
  assert.ok(fs.existsSync(path.join(wrong, 'SKILL.md')))
  fs.unlinkSync(path.join(links, 'good'))
  fs.symlinkSync(nested, path.join(links, 'good'))
  review.posttool(write(w, path.join(links, 'good', 'SKILL.md')), w.ctx)
  assert.equal(reg.readNotices(w.data).filter((n) => n.kind === 'skill-location').length, 2, 'a link into a subdirectory is not the corresponding skill directory')
})

test('creation is deduplicated across worktrees and excludes skills already committed in the repository', (t) => {
  const w = world(t)
  const existing = skill(w.repo.dir, 'existing')
  w.repo.git('add', '.agents')
  w.repo.git('commit', '-qm', 'existing skill')
  const wt = path.join(w.repo.dir, '.aether', 'worktrees', 'unit')
  w.repo.git('worktree', 'add', '-qb', 'unit', wt)
  review.posttool(write(w, path.join(existing, 'SKILL.md')), w.ctx)
  const fresh = skill(w.repo.dir, 'fresh')
  review.posttool(write(w, path.join(fresh, 'SKILL.md')), w.ctx)
  const copy = skill(wt, 'fresh')
  review.posttool({ ...write(w, path.join(copy, 'SKILL.md')), cwd: wt }, w.ctx)
  review.posttool({ ...write(w, path.join(wt, '.agents/skills/existing/SKILL.md')), cwd: wt }, w.ctx)
  assert.deepEqual(reg.readCreated(w.data).map((e) => [e.name, e.repo]), [['fresh', w.repo.dir]])
})

test('a tracked skill at the same path in another worktree of the same repo is not a duplicate, while two different folders are (issue 287)', (t) => {
  const w = world(t)
  const tracked = skill(w.repo.dir, 'artificial-analysis', { where: '.claude/skills' })
  w.repo.git('add', '.claude')
  w.repo.git('commit', '-qm', 'tracked skill')
  const wt = path.join(w.repo.dir, '.aether', 'worktrees', 'unit')
  w.repo.git('worktree', 'add', '-qb', 'unit', wt)
  const wtSkill = path.join(wt, '.claude', 'skills', 'artificial-analysis')
  assert.deepEqual(review.reviewSkill(wtSkill, { cwd: wt, home: w.home }), [])
  // Two genuinely different folders with the same name are still reported.
  skill(wt, 'artificial-analysis', { where: '.agents/skills', extra: ' (second)' })
  const problems = review.reviewSkill(wtSkill, { cwd: wt, home: w.home })
  assert.ok(problems.some((p) => p.startsWith('a skill with the same name exists at ') && p.endsWith(path.join('.agents', 'skills', 'artificial-analysis'))))
  assert.ok(fs.existsSync(tracked))
})

test('skill-location and skill-unloaded notices are emitted and recorded once per skill and per session', (t) => {
  const w = world(t)
  const misplaced = skill(w.repo.dir, 'misplaced', { where: '.claude/skills' })
  const file = path.join(misplaced, 'SKILL.md')
  const first = review.posttool(write(w, file), w.ctx)
  assert.ok(first.includes('.agents/skills/misplaced'))
  assert.ok(first.includes('load aether:skills'))
  const second = review.posttool(write(w, file, 'Edit'), w.ctx)
  assert.equal(second, null)
  assert.equal(reg.readNotices(w.data).filter((n) => n.kind === 'skill-location').length, 1)
  assert.equal(reg.readNotices(w.data).filter((n) => n.kind === 'skill-unloaded').length, 1)
  // Another session is notified again.
  const other = review.posttool({ ...write(w, file), session_id: 's2' }, w.ctx)
  assert.ok(other.includes('.agents/skills/misplaced'))
  assert.ok(other.includes('load aether:skills'))
})

test('writing specs/NNN-topic/intent.md triggers topic search from a subdirectory and from a worktree', (t) => {
  const w = world(t)
  const intent = path.join(w.repo.dir, 'specs', '001-ml', 'intent.md')
  fs.mkdirSync(path.dirname(intent), { recursive: true })
  fs.writeFileSync(intent, '# Intent\nTrain a model with PyTorch.\n')
  const sub = path.join(w.repo.dir, 'src', 'nested')
  fs.mkdirSync(sub, { recursive: true })
  const fromSub = review.posttool({ session_id: 's-sub', cwd: sub, tool_name: 'Write', tool_input: { file_path: intent } }, w.ctx)
  assert.ok(fromSub && fromSub.includes('Machine Learning'))

  const wt = path.join(w.repo.dir, '.aether', 'worktrees', 'wt-intent')
  w.repo.git('worktree', 'add', '-qb', 'wt-intent', wt)
  const wtIntent = path.join(wt, 'specs', '002-godot', 'intent.md')
  fs.mkdirSync(path.dirname(wtIntent), { recursive: true })
  fs.writeFileSync(wtIntent, '# Intent\nBuild a game in Godot.\n')
  const fromWt = review.posttool({ session_id: 's-wt', cwd: wt, tool_name: 'Write', tool_input: { file_path: wtIntent } }, w.ctx)
  assert.ok(fromWt && fromWt.includes('Godot Engine'))
})

test('skill-review.js keeps only the review exports and stays under 330 lines', () => {
  const names = Object.keys(review)
  for (const name of ['recordLeadSkillLoad', 'leadLoadedSkills', 'alreadyNoticed', 'skillToken', 'mainRootOf', 'detectUncoveredTopics', 'topicLine', 'startupTopicNotice', 'shallowNames', 'fileSignal', 'dependencyNames', 'installedBlobs', 'topicCovered', 'intentPathOf']) assert.equal(names.includes(name), false, `skill-review.js no longer exports ${name}`)
  for (const name of ['reviewSkill', 'posttool', 'outsideAgents']) assert.ok(names.includes(name), `skill-review.js keeps ${name}`)
  const lines = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'skill-review.js'), 'utf8').split('\n').length
  assert.ok(lines < 330, `skill-review.js has ${lines} lines (fewer than 330)`)
})

test('reviewSkill derives the repository from the skill path even when cwd is the main checkout', (t) => {
  const w = world(t)
  skill(w.repo.dir, 'artificial-analysis', { where: '.claude/skills' })
  w.repo.git('add', '.claude')
  w.repo.git('commit', '-qm', 'tracked skill')
  const wt = path.join(w.repo.dir, '.aether', 'worktrees', 'unit')
  w.repo.git('worktree', 'add', '-qb', 'unit', wt)
  const wtSkill = path.join(wt, '.claude', 'skills', 'artificial-analysis')
  assert.deepEqual(review.reviewSkill(wtSkill, { cwd: w.repo.dir, home: w.home }), [])
})

test('reviewSkill uses the repository of the skill being reviewed even when cwd is a different repository', (t) => {
  const w = world(t)
  const other = makeRepo(t)
  // A skill with the same name in the session's repo must not be flagged when reviewing other's skill.
  skill(w.repo.dir, 'shared-name', { extra: ' (session)' })
  const otherSkill = skill(other.dir, 'shared-name', { extra: ' (other)' })
  assert.deepEqual(review.reviewSkill(otherSkill, { cwd: w.repo.dir, home: w.home }), [])
  // A duplicate inside the skill's own repository IS flagged.
  skill(other.dir, 'shared-name', { where: '.claude/skills', extra: ' (other dup)' })
  const problems = review.reviewSkill(otherSkill, { cwd: w.repo.dir, home: w.home })
  assert.ok(problems.some((p) => p.startsWith('a skill with the same name exists at ') && p.includes(other.dir)))
})
