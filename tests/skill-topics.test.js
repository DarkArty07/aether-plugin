'use strict'
// Uncovered practical topics by visible signals (spec 037 R12, R13, R16).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const topics = require('../plugins/aether/lib/skill-topics.js')
const reg = require('../plugins/aether/lib/skill-registry.js')

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
    assert.deepEqual(topics.detectUncoveredTopics({ ...w.opts, dataDir: w.data }).map((x) => x.id), ['containers'], variant)
  }
})

test('file and dependency signals, installed coverage in every search location, and notice isolation', (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.repo.dir, 'project.godot'), '')
  fs.writeFileSync(path.join(w.repo.dir, 'package.json'), JSON.stringify({ devDependencies: { playwright: '1' } }))
  const opts = { ...w.opts, dataDir: w.data, session: 's1' }
  assert.deepEqual(topics.detectUncoveredTopics(opts).map((x) => x.id), ['godot', 'browser-automation'])
  assert.ok(topics.startupTopicNotice(opts).includes('aether:skills'))
  assert.equal(topics.startupTopicNotice(opts), null)
  fs.writeFileSync(path.join(w.repo.dir, 'Dockerfile'), '')
  assert.deepEqual(topics.detectUncoveredTopics(opts).map((x) => x.id), ['containers'])
  assert.equal(topics.detectUncoveredTopics({ ...opts, session: 's2' }).length, 3)
  const other = makeRepo(t)
  fs.writeFileSync(path.join(other.dir, 'Dockerfile'), '')
  assert.deepEqual(topics.detectUncoveredTopics({ ...opts, cwd: other.dir }).map((x) => x.id), ['containers'])
  for (const [root, where] of [[w.repo.dir, '.agents/skills'], [w.repo.dir, '.claude/skills'], [w.home, '.agents/skills'], [w.home, '.claude/skills'], [w.home, 'registered']]) {
    const dir = skill(root, 'coverage', { where, description: '>\n  Use for Godot, browser automation\n  and Docker work.' })
    if (where === 'registered') reg.recordInstall(w.data, { name: 'coverage', path: dir, scope: 'global' })
    assert.deepEqual(topics.detectUncoveredTopics({ ...opts, session: 'fresh' }), [], `${root}/${where}`)
    fs.rmSync(dir, { recursive: true })
  }
  assert.ok(reg.readNotices(w.data).every((n) => n.repo === w.repo.dir && n.kind === 'topic-search'))
})

test('a topic notice is kept per session, repository and topic: another one is notified again (R13, R16, C6)', (t) => {
  const w = world(t)
  const other = makeRepo(t)
  for (const dir of [w.repo.dir, other.dir]) {
    fs.writeFileSync(path.join(dir, 'project.godot'), '')
    fs.writeFileSync(path.join(dir, 'Dockerfile'), '')
  }
  const ids = (extra) => topics.detectUncoveredTopics({ ...w.opts, dataDir: w.data, ...extra }).map((x) => x.id)
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
  assert.deepEqual(topics.detectUncoveredTopics({ ...opts, intentPath: intent }).map((x) => x.id), [])
  fs.writeFileSync(intent, '# Intent\nEntrenar en Google Colab.\n')
  assert.deepEqual(topics.detectUncoveredTopics({ ...opts, intentPath: intent }).map((x) => x.id), ['google-colab'])
  fs.writeFileSync(path.join(w.repo.dir, 'requirements.txt'), 'torch==2.3\n')
  assert.deepEqual(topics.detectUncoveredTopics({ ...opts, intentPath: intent }).map((x) => x.id), ['machine-learning', 'google-colab'])
})

test('an installed skill covers a topic only with a whole word of it, so Composer does not cover containers (R13)', (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.repo.dir, 'Dockerfile'), 'FROM scratch')
  skill(w.home, 'php-packages', { description: 'Use for Composer packages.' })
  assert.deepEqual(topics.detectUncoveredTopics({ ...w.opts, dataDir: w.data }).map((x) => x.id), ['containers'])
  skill(w.home, 'docker-basics', { description: 'Use for Docker containers.' })
  assert.deepEqual(topics.detectUncoveredTopics({ ...w.opts, dataDir: w.data }).map((x) => x.id), [])
})

test('requirements.txt and pyproject.toml count only declared dependencies, not project names, TOML keys, or arbitrary quoted strings', (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.repo.dir, 'pyproject.toml'), [
    '[project]',
    'name = "torch"',
    'description = "A three tier app with pytorch and playwright"',
    'dependencies = ["requests>=2.0"]',
    '',
    '[tool.custom]',
    'torch = "1.0"',
  ].join('\n') + '\n')
  fs.writeFileSync(path.join(w.repo.dir, 'requirements.txt'), [
    '-r base.txt',
    '--index-url https://pypi.org/simple',
    '# torch==2.0',
    'flask>=3.0',
  ].join('\n') + '\n')
  assert.deepEqual(topics.detectUncoveredTopics({ ...w.opts, dataDir: w.data }), [])

  fs.writeFileSync(path.join(w.repo.dir, 'pyproject.toml'), [
    '[project]',
    'name = "app"',
    'dependencies = [',
    '  "torch>=2.3",',
    ']',
  ].join('\n') + '\n')
  assert.deepEqual(topics.detectUncoveredTopics({ ...w.opts, dataDir: w.data }).map((x) => x.id), ['machine-learning'])
})

test('skill-topics.js exports the topic detector and its auxiliaries', () => {
  const names = Object.keys(require('../plugins/aether/lib/skill-topics.js')).sort()
  for (const name of ['detectUncoveredTopics', 'topicLine', 'startupTopicNotice', 'shallowNames', 'fileSignal', 'dependencyNames', 'installedBlobs', 'topicCovered', 'intentPathOf']) assert.ok(names.includes(name), `skill-topics.js exports ${name}`)
})
