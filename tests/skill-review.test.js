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
    review.recordLeadSkillLoad({ session_id: 'loaded', cwd: w.repo.dir, tool_name: 'Skill', tool_input: { skill: name + ' PRIVATE-ARGS' } }, w.ctx)
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

test('topic coverage requires readable valid name and description, never directory, body or install log names', (t) => {
  for (const variant of ['missing', 'no-name', 'no-description', 'body', 'log-name']) {
    const w = world(t)
    fs.writeFileSync(path.join(w.repo.dir, 'Dockerfile'), 'FROM scratch')
    const dir = path.join(w.home, '.agents/skills/docker')
    fs.mkdirSync(dir, { recursive: true })
    const contents = {
      'no-name': '---\ndescription: docker\n---\n',
      'no-description': '---\nname: docker\n---\n',
      body: '---\nname: other\ndescription: General work\n---\ndocker\n',
    }
    if (contents[variant]) fs.writeFileSync(path.join(dir, 'SKILL.md'), contents[variant])
    if (variant === 'log-name') reg.recordInstall(w.data, { name: 'docker', path: dir, scope: 'global' })
    assert.deepEqual(review.detectUncoveredTopics({ ...w.opts, dataDir: w.data }).map((x) => x.id), ['containers'], variant)
  }
})

test('file and dependency signals, installed coverage in every search location, and notice isolation', (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.repo.dir, 'project.godot'), '')
  fs.writeFileSync(path.join(w.repo.dir, 'package.json'), JSON.stringify({ devDependencies: { playwright: '1' } }))
  const opts = { ...w.opts, dataDir: w.data, session: 's1' }
  assert.deepEqual(review.detectUncoveredTopics(opts).map((x) => x.id), ['godot', 'browser-automation'])
  assert.ok(review.startupTopicNotice(opts).includes('aether:skills'))
  assert.equal(review.startupTopicNotice(opts), null)
  fs.writeFileSync(path.join(w.repo.dir, 'Dockerfile'), '')
  assert.deepEqual(review.detectUncoveredTopics(opts).map((x) => x.id), ['containers'])
  assert.equal(review.detectUncoveredTopics({ ...opts, session: 's2' }).length, 3)
  const other = makeRepo(t)
  fs.writeFileSync(path.join(other.dir, 'Dockerfile'), '')
  assert.deepEqual(review.detectUncoveredTopics({ ...opts, cwd: other.dir }).map((x) => x.id), ['containers'])
  for (const [root, where] of [[w.repo.dir, '.agents/skills'], [w.repo.dir, '.claude/skills'], [w.home, '.agents/skills'], [w.home, '.claude/skills'], [w.home, 'registered']]) {
    const dir = skill(root, 'coverage', { where, description: '>\n  Use for Godot, browser automation\n  and Docker work.' })
    if (where === 'registered') reg.recordInstall(w.data, { name: 'coverage', path: dir, scope: 'global' })
    assert.deepEqual(review.detectUncoveredTopics({ ...opts, session: 'fresh' }), [], `${root}/${where}`)
    fs.rmSync(dir, { recursive: true })
  }
  assert.ok(reg.readNotices(w.data).every((n) => n.repo === w.repo.dir && n.kind === 'topic-search'))
})

test('a Lead load is recorded under the name of the skill whichever field carries it, never with its arguments (R3, C2)', (t) => {
  const w = world(t)
  const load = (tool_input) => review.recordLeadSkillLoad({ session_id: 'lead', cwd: w.repo.dir, tool_name: 'Skill', tool_input }, w.ctx)
  for (const tool_input of [{ name: 'by-name SECRET' }, { skill_name: 'by-skill-name' }, { skill: 'by-skill secret text' }, { args: 'only args' }]) assert.equal(load(tool_input), null)
  assert.deepEqual(reg.readUses(w.data).map((u) => u.skills), [['by-name'], ['by-skill-name'], ['by-skill']])
  assert.ok(!JSON.stringify(reg.readUses(w.data)).includes('SECRET'))
})

test('a topic notice is kept per session, repository and topic: another one is notified again (R13, R16, C6)', (t) => {
  const w = world(t)
  const other = makeRepo(t)
  for (const dir of [w.repo.dir, other.dir]) {
    fs.writeFileSync(path.join(dir, 'project.godot'), '')
    fs.writeFileSync(path.join(dir, 'Dockerfile'), '')
  }
  const ids = (extra) => review.detectUncoveredTopics({ ...w.opts, dataDir: w.data, ...extra }).map((x) => x.id)
  reg.recordNotice(w.data, { session: 's1', repo: w.repo.dir, kind: 'topic-search', name: 'godot' })
  assert.deepEqual(ids({ session: 's1' }), ['containers'], 'a notice for one topic does not silence the others')
  assert.deepEqual(ids({ session: 's2' }), ['godot', 'containers'], 'another session is notified again')
  assert.deepEqual(ids({ session: 's1', cwd: other.dir }), ['godot', 'containers'], 'another repository is notified again')
  reg.recordNotice(w.data, { session: 's1', repo: w.repo.dir, kind: 'skill-location', name: 'containers' })
  assert.deepEqual(ids({ session: 's1' }), ['containers'], 'only topic-search notices silence a topic')
})

test('a dependency or a word signals a topic only as a whole name: a longer name or a word inside another word does not (R12, R13)', (t) => {
  const w = world(t)
  const opts = { ...w.opts, dataDir: w.data }
  const intent = path.join(w.repo.dir, 'specs', '001-equipo', 'intent.md')
  fs.mkdirSync(path.dirname(intent), { recursive: true })
  fs.writeFileSync(intent, '# Intent\nQueremos colaborar con el equipo.\n')
  fs.writeFileSync(path.join(w.repo.dir, 'pyproject.toml'), '[project]\ndescription = "A three tier web app"\ndependencies = ["requests"]\n')
  fs.writeFileSync(path.join(w.repo.dir, 'package.json'), JSON.stringify({ dependencies: { 'three-utils': '1' } }))
  assert.deepEqual(review.detectUncoveredTopics({ ...opts, intentPath: intent }).map((x) => x.id), [])
  fs.writeFileSync(intent, '# Intent\nEntrenar en Google Colab.\n')
  assert.deepEqual(review.detectUncoveredTopics({ ...opts, intentPath: intent }).map((x) => x.id), ['google-colab'])
  fs.writeFileSync(path.join(w.repo.dir, 'requirements.txt'), 'torch==2.3\n')
  assert.deepEqual(review.detectUncoveredTopics({ ...opts, intentPath: intent }).map((x) => x.id), ['machine-learning', 'google-colab'])
})

test('an installed skill covers a topic only with a whole word of it, so Composer does not cover containers (R13)', (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.repo.dir, 'Dockerfile'), 'FROM scratch')
  skill(w.home, 'php-packages', { description: 'Use for Composer packages.' })
  assert.deepEqual(review.detectUncoveredTopics({ ...w.opts, dataDir: w.data }).map((x) => x.id), ['containers'])
  skill(w.home, 'docker-basics', { description: 'Use for Docker containers.' })
  assert.deepEqual(review.detectUncoveredTopics({ ...w.opts, dataDir: w.data }).map((x) => x.id), [])
})
