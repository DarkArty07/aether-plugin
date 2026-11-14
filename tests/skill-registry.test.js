'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const reg = require('../plugins/aether/lib/skill-registry.js')

const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
const bash = (repo, command, session = 's1') => ({ session_id: session, cwd: repo.dir, tool_name: 'Bash', tool_input: { command } })

test('computedHash is SHA-256 over the files sorted by relative path, the path and then the bytes, without .git, node_modules or links (R26)', (t) => {
  const dir = tempDir(t)
  put(path.join(dir, 'b.md'), 'bee')
  put(path.join(dir, 'a', 'x.txt'), 'ex')
  put(path.join(dir, '.git', 'config'), 'ignored')
  put(path.join(dir, 'node_modules', 'm', 'i.js'), 'ignored')
  fs.symlinkSync(path.join(dir, 'b.md'), path.join(dir, 'link.md'))
  const expected = crypto.createHash('sha256')
  expected.update('a/x.txt')
  expected.update(Buffer.from('ex'))
  expected.update('b.md')
  expected.update(Buffer.from('bee'))
  const digest = expected.digest('hex')
  assert.equal(reg.computedHash(dir), digest)
  put(path.join(dir, 'b.md'), 'changed')
  assert.notEqual(reg.computedHash(dir), digest)
})

test('recordInstall only appends, one line per installation, with the fields of R26', (t) => {
  const data = tempDir(t, 'aether-data-')
  assert.equal(reg.recordInstall(data, { time: 1, session: 's1', source: 'a/b', scope: 'project', repo: '/r', name: 'pdf', path: '/r/.agents/skills/pdf', hash: 'h1' }), true)
  assert.equal(reg.recordInstall(data, { time: 2, session: 's1', source: 'a/c', scope: 'global', repo: null, name: 'x', path: '/h/.agents/skills/x', hash: 'h2' }), true)
  assert.deepEqual(reg.readInstalls(data).map((e) => [e.time, e.scope, e.name, e.hash]), [[1, 'project', 'pdf', 'h1'], [2, 'global', 'x', 'h2']])
  assert.equal(fs.readFileSync(reg.installsFile(data), 'utf8').split('\n').filter(Boolean).length, 2)
})

function project(t, { lockHash = 'same', lockName = 'pdf' } = {}) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const data = tempDir(t, 'aether-data-')
  put(path.join(repo.dir, '.agents', 'skills', 'pdf', 'SKILL.md'), '---\nname: pdf\ndescription: Use for pdf.\n---\nBody\n')
  const hash = reg.computedHash(path.join(repo.dir, '.agents', 'skills', 'pdf'))
  put(path.join(repo.dir, 'skills-lock.json'), JSON.stringify({ version: 1, skills: { [lockName]: { source: 'anthropics/skills', sourceType: 'github', computedHash: lockHash === 'same' ? hash : lockHash } } }))
  return { repo, home, data, hash, ctx: { env: {}, home, now: 5000, dataDir: data } }
}

test('after a project install the skill is recorded once with its source and its fingerprint, and a matching lock says nothing (C9, H3 scenario 19)', (t) => {
  const w = project(t)
  assert.equal(reg.posttool(bash(w.repo, 'npx skills add anthropics/skills@pdf'), w.ctx), null)
  const [entry, ...rest] = reg.readInstalls(w.data)
  assert.deepEqual(rest, [])
  assert.deepEqual([entry.session, entry.source, entry.scope, entry.repo, entry.name, entry.path, entry.hash], ['s1', 'anthropics/skills', 'project', w.repo.dir, 'pdf', path.join(w.repo.dir, '.agents', 'skills', 'pdf'), w.hash])
  assert.equal(entry.time, 5000)
  assert.equal(reg.posttool(bash(w.repo, 'npx skills add anthropics/skills@pdf'), w.ctx), null)
  assert.equal(reg.readInstalls(w.data).length, 1, 'the same skill is not recorded twice')
})

test('a lock entry that is missing or has another fingerprint is reported (R26)', (t) => {
  const different = project(t, { lockHash: 'f'.repeat(64) })
  const message = reg.posttool(bash(different.repo, 'npx skills add anthropics/skills@pdf'), different.ctx)
  assert.ok(message.includes('The fingerprint of the skill "pdf" differs from skills-lock.json'), message)
  const missing = project(t, { lockName: 'other' })
  fs.rmSync(path.join(missing.repo.dir, '.agents', 'skills', 'pdf'), { recursive: true })
  const text = reg.posttool(bash(missing.repo, 'npx skills add anthropics/skills@pdf'), missing.ctx)
  assert.ok(text.includes('The skill "pdf" is not in skills-lock.json after the install.'), text)
})

test('a global install is recorded from the owner lock file, with our own fingerprint and no comparison (R26)', (t) => {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const data = tempDir(t, 'aether-data-')
  put(path.join(home, '.agents', 'skills', 'globalpdf', 'SKILL.md'), '---\nname: globalpdf\ndescription: d\n---\n')
  put(path.join(home, '.agents', '.skill-lock.json'), JSON.stringify({ version: 3, skills: { globalpdf: { source: 'anthropics/skills', skillFolderHash: 'tree-sha' } } }))
  assert.equal(reg.posttool(bash(repo, 'npx skills add -g anthropics/skills@globalpdf'), { env: {}, home, now: 9, dataDir: data }), null)
  const [entry] = reg.readInstalls(data)
  assert.deepEqual([entry.scope, entry.repo, entry.name, entry.hash], ['global', null, 'globalpdf', reg.computedHash(path.join(home, '.agents', 'skills', 'globalpdf'))])
})

test('other commands, other tools and a failed lookup record nothing and never throw', (t) => {
  const w = project(t)
  for (const input of [bash(w.repo, 'npx skills find pdf'), bash(w.repo, 'ls'), { ...bash(w.repo, 'npx skills add a/b'), tool_name: 'Write' }, null, {}]) assert.equal(reg.posttool(input, w.ctx), null)
  assert.deepEqual(reg.readInstalls(w.data), [])
  assert.deepEqual(reg.readInstalls(path.join(w.data, 'missing')), [])
})

test('readCreatedDeduplicated groups worktree entries by main repo and discards skills already committed in git before entry.time (R5, R6, R7, C3, C8)', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-skills-reg-')
  const preDir = path.join(repo.dir, '.agents', 'skills', 'artificial-analysis')
  fs.mkdirSync(preDir, { recursive: true })
  fs.writeFileSync(path.join(preDir, 'SKILL.md'), '---\nname: artificial-analysis\ndescription: AA\n---\nbody\n')
  repo.git('add', '.agents/skills/artificial-analysis/SKILL.md')
  repo.git('commit', '-m', 'pre-existing skill')
  const commitSec = Number.parseInt(repo.git('log', '-n', '1', '--format=%ct'), 10)
  const afterCommitMs = (commitSec + 10) * 1000

  for (const wt of ['wt-1', 'wt-2', 'wt-3']) {
    reg.recordCreated(data, {
      time: afterCommitMs + 100,
      session: 's1',
      repo: path.join(repo.dir, '.aether', 'work', 'delegates', wt, 'wt'),
      name: 'artificial-analysis',
      path: path.join(repo.dir, '.aether', 'work', 'delegates', wt, 'wt', '.agents', 'skills', 'artificial-analysis'),
      type: 'project',
    })
  }
  reg.recordCreated(data, { time: afterCommitMs + 200, session: 's1', repo: repo.dir, name: 'artificial-analysis', path: preDir, type: 'project' })
  for (const p of [
    path.join(repo.dir, '.aether', 'work', 'delegates', 'd1', 'wt', '.agents', 'skills', 'diseno-de-juego'),
    path.join(repo.dir, '.agents', 'skills', 'diseno-de-juego'),
  ]) {
    reg.recordCreated(data, { time: afterCommitMs + 300, session: 's2', repo: path.dirname(path.dirname(path.dirname(p))), name: 'diseno-de-juego', path: p, type: 'project' })
  }
  reg.recordCreated(data, { time: afterCommitMs + 400, session: 's3', repo: '/gone/project-a', name: 'criterio-del-dueno', path: '/gone/project-a/.claude/skills/criterio-del-dueno', type: 'project' })
  reg.recordCreated(data, { time: afterCommitMs + 500, session: 's4', repo: '/gone/project-b', name: 'direccion-de-arte', path: '/gone/project-b/.claude/skills/direccion-de-arte', type: 'project' })

  assert.equal(reg.readCreated(data).length, 8)
  const deduped = reg.readCreatedDeduplicated(data)
  assert.deepEqual(deduped.map((e) => e.name), ['diseno-de-juego', 'criterio-del-dueno', 'direccion-de-arte'])
  const game = deduped[0]
  assert.equal(game.path.endsWith(path.join('.agents', 'skills', 'diseno-de-juego')), true)
  assert.equal(game.path.includes('.aether'), false, 'the worktree path is rewritten to the main repo')
  assert.equal(reg.shouldRecordCreated(data, { repo: repo.dir, name: 'artificial-analysis', dir: preDir }), false)
  assert.equal(reg.shouldRecordCreated(data, { repo: repo.dir, name: 'diseno-de-juego', dir: path.join(repo.dir, '.agents', 'skills', 'diseno-de-juego') }), false)
  assert.equal(reg.shouldRecordCreated(data, { repo: repo.dir, name: 'brand-new', dir: path.join(repo.dir, '.agents', 'skills', 'brand-new') }), true)

  const rep = reg.skillsReport(data)
  assert.equal(rep.totals.createdRaw, 8)
  assert.equal(rep.totals.created, 3)
  assert.equal(rep.totals.downloaded, 0)
  assert.equal(rep.totals.agentUses, 0)
})

test('loadSkillsConfig reads repeat and topics, and notices store only metadata (R2, R12, R16)', (t) => {
  const cfg = reg.loadSkillsConfig()
  assert.equal(cfg.repeat.minWordLength, 3)
  assert.equal(cfg.repeat.similarityThreshold, 0.35)
  assert.ok(cfg.repeat.stopwords.includes('falta'))
  assert.deepEqual(cfg.topics.slice(0, 6).map((topic) => topic.id), [
    'machine-learning', 'google-colab', 'godot', 'containers', 'browser-automation', 'shaders',
  ])
  const data = tempDir(t, 'aether-skills-notice-')
  const saved = reg.recordNotice(data, {
    time: 9,
    session: 's1',
    repo: '/r',
    kind: 'topic-search',
    name: 'machine-learning',
    detail: 'do not store this',
  })
  assert.deepEqual(saved, { time: 9, session: 's1', repo: '/r', kind: 'topic-search', name: 'machine-learning' })
  assert.deepEqual(reg.readNotices(data), [saved])
  reg.recordUse(data, { time: 9, session: 's1', kind: 'lead', skills: ['skills'], repo: '/r' })
  reg.recordUse(data, { time: 10, session: 's1', kind: 'delegate', task: 't1', skills: ['pdf'], repo: '/r' })
  reg.recordUse(data, { time: 11, session: 's2', kind: 'run', run: 'run-1', skills: ['pdf'], repo: '/other' })
  const rep = reg.skillsReport(data, { repo: '/r', since: 9, until: 10 })
  assert.equal(rep.mode, 'skills')
  assert.deepEqual(rep.period, { since: 9, until: 10 })
  assert.equal(rep.totals.leadLoads, 1)
  assert.equal(rep.totals.delegateUses, 1)
  assert.equal(rep.totals.swarmUses, 0)
  assert.equal(rep.totals.agentUses, 1)
  assert.equal(rep.totals.notices, 1)
  assert.deepEqual(rep.leadLoadsBySkill, { skills: 1 })
  assert.deepEqual(rep.agentUsesBySkill, { pdf: 1 })
  assert.equal(rep.totals.noticesByKind['topic-search'], 1)
})

test('loadSkillsConfig reads AETHER_SKILLS_CONFIG when no path is passed (R2)', (t) => {
  const dir = tempDir(t, 'aether-skills-cfg-')
  const file = path.join(dir, 'skills.json')
  fs.writeFileSync(file, JSON.stringify({
    repeat: { minWordLength: 4, similarityThreshold: 0.5, stopwords: ['zz'] },
    topics: [{ id: 'from-env' }],
  }))
  const previous = process.env.AETHER_SKILLS_CONFIG
  process.env.AETHER_SKILLS_CONFIG = file
  t.after(() => {
    if (previous === undefined) delete process.env.AETHER_SKILLS_CONFIG
    else process.env.AETHER_SKILLS_CONFIG = previous
  })
  const fromEnv = reg.loadSkillsConfig()
  assert.equal(fromEnv.repeat.minWordLength, 4)
  assert.equal(fromEnv.repeat.similarityThreshold, 0.5)
  assert.deepEqual(fromEnv.topics.map((topic) => topic.id), ['from-env'])
  const bundled = reg.loadSkillsConfig(reg.CONFIG_FILE)
  assert.equal(bundled.repeat.similarityThreshold, 0.35)
})
