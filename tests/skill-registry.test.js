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
