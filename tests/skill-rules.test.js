'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const rules = require('../plugins/aether/lib/skill-rules.js')

const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

test('authorOf takes the first segment in lowercase, resolves the two aliases and gives null without an author (R25, C9)', () => {
  const cases = {
    'anthropics/skills@pdf': 'anthropics',
    'Anthropics/Skills': 'anthropics',
    'vercel-labs/agent-skills/skills/web': 'vercel-labs',
    'owner/repo#v2': 'owner',
    'github:owner/repo': 'owner',
    'gitlab:Group/repo': 'group',
    'https://github.com/owner/repo': 'owner',
    'https://gitlab.com/group/repo.git': 'group',
    'vercel-labs/vercel-skills': 'vercel-labs',
    'coinbase/agentWallet': 'coinbase',
    './local/skills': null,
    '../up/skills': null,
    '/abs/skills': null,
    '~/skills': null,
    'https://example.com/skills.git': null,
    'git@example.com:me/skills.git': null,
  }
  for (const [source, author] of Object.entries(cases)) assert.equal(rules.authorOf(source), author, source)
})

test('parseInstall reads each launcher, the sources, the author and -g, and ignores what does not install (R25)', () => {
  const same = { sources: ['anthropics/skills@pdf'], authors: ['anthropics'], global: false }
  for (const [command, launcher] of [
    ['npx skills add anthropics/skills@pdf', 'npx'],
    ['npx -y skills add anthropics/skills@pdf', 'npx'],
    ['npx skills@latest add anthropics/skills@pdf', 'npx'],
    ['bunx skills add anthropics/skills@pdf', 'bunx'],
    ['pnpm dlx skills add anthropics/skills@pdf', 'pnpm dlx'],
    ['skills add anthropics/skills@pdf', 'skills'],
    ['cd app && npx skills add anthropics/skills@pdf --skill pdf', 'npx'],
  ]) assert.deepEqual(rules.parseInstall(command), { launcher, ...same }, command)
  assert.equal(rules.parseInstall('npx skills add -g anthropics/skills@pdf').global, true)
  assert.equal(rules.parseInstall('npx skills add anthropics/skills --global').global, true)
  assert.deepEqual(rules.parseInstall('npx skills add a/b c/d').authors, ['a', 'c'])
  assert.deepEqual(rules.parseInstall('npx skills add ./local').authors, [null])
  assert.deepEqual(rules.parseInstall('npx skills add anthropics/skills -s pdf -a claude-code').sources, ['anthropics/skills'])
  for (const command of ['npx skills find react', 'npx skills list', 'npx skills update', 'npx skills remove pdf', 'echo "npx skills add a/b"', 'ls', 'npx other add a/b', '']) assert.equal(rules.parseInstall(command), null, command)
})

test('installClass lets a trusted author through for the project and holds everything else; an empty list holds all (R25, R47, H3 scenarios 19 to 21)', (t) => {
  const data = tempDir(t, 'aether-data-')
  const hold = (command) => rules.installClass(command, { dataDir: data })
  assert.equal(rules.readTrusted(data).length, 0)
  assert.equal(hold('npx skills add anthropics/skills@pdf'), 'skill-install', 'the list starts empty')
  put(rules.trustedFile(data), JSON.stringify({ authors: ['Anthropics', 'vercel-labs'], log: [] }))
  assert.deepEqual(rules.readTrusted(data), ['anthropics', 'vercel-labs'])
  assert.equal(hold('npx skills add anthropics/skills@pdf'), null)
  assert.equal(hold('bunx skills add vercel-labs/agent-skills'), null)
  assert.equal(hold('npx skills add someone/skills'), 'skill-install')
  assert.equal(hold('npx skills add -g anthropics/skills@pdf'), 'skill-install')
  assert.equal(hold('npx skills add anthropics/skills someone/skills'), 'skill-install')
  assert.equal(hold('npx skills add ./local'), 'skill-install')
  assert.equal(hold('npx skills add https://example.com/x.git'), 'skill-install')
  assert.equal(hold('npx skills add'), 'skill-install')
  assert.equal(hold('npx skills find pdf'), null)
  fs.writeFileSync(rules.trustedFile(data), '{ not json')
  assert.deepEqual(rules.readTrusted(data), [])
  assert.deepEqual(rules.readTrusted(path.join(data, 'missing')), [])
})

function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const plugin = path.join(tempDir(t, 'aether-plugin-'), 'plugin')
  put(path.join(plugin, 'skills', 'tidy', 'SKILL.md'))
  put(path.join(repo.dir, '.agents', 'skills', 'mine', 'SKILL.md'))
  put(path.join(repo.dir, '.agents', 'skills', 'pdf', 'SKILL.md'))
  put(path.join(repo.dir, 'skills-lock.json'), JSON.stringify({ version: 1, skills: { pdf: { source: 'anthropics/skills', computedHash: 'x' } } }))
  fs.mkdirSync(path.join(repo.dir, '.claude', 'skills'), { recursive: true })
  fs.symlinkSync(path.join(repo.dir, '.agents', 'skills', 'mine'), path.join(repo.dir, '.claude', 'skills', 'mine'))
  fs.symlinkSync(path.join(repo.dir, '.agents', 'skills', 'pdf'), path.join(repo.dir, '.claude', 'skills', 'pdf'))
  put(path.join(repo.dir, '.claude', 'skills', 'local-only', 'SKILL.md'))
  put(path.join(home, '.agents', 'skills', 'mine-global', 'SKILL.md'))
  put(path.join(home, '.agents', 'skills', 'globalpdf', 'SKILL.md'))
  put(path.join(home, '.agents', '.skill-lock.json'), JSON.stringify({ version: 3, skills: { globalpdf: { source: 'anthropics/skills' } } }))
  fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true })
  fs.symlinkSync(path.join(home, '.agents', 'skills', 'mine-global'), path.join(home, '.claude', 'skills', 'mine-global'))
  put(path.join(home, '.claude', 'skills', 'real-dir', 'SKILL.md'))
  put(path.join(home, '.claude', 'plugins', 'cache', 'mk', 'aether', '0.35.0', 'skills', 'plan', 'SKILL.md'))
  return { repo, home, plugin, opts: { cwd: repo.dir, home, pluginRoots: [plugin] } }
}
const typeOf = (w, ...parts) => {
  const info = rules.classifySkillPath(path.join(...parts), w.opts)
  return info && [info.type, info.name, info.editable, info.grant]
}

test('the four types are told by the real path, also when the path goes through the link of .claude/skills/ (C8, R22, R23)', (t) => {
  const w = world(t)
  const r = w.repo.dir
  assert.deepEqual(typeOf(w, r, '.agents', 'skills', 'mine', 'SKILL.md'), ['project', 'mine', true, null])
  assert.deepEqual(typeOf(w, r, '.claude', 'skills', 'mine', 'SKILL.md'), ['project', 'mine', true, null])
  assert.deepEqual(typeOf(w, r, '.claude', 'skills', 'local-only', 'SKILL.md'), ['project', 'local-only', true, null])
  assert.deepEqual(typeOf(w, r, '.agents', 'skills', 'pdf', 'SKILL.md'), ['downloaded', 'pdf', false, null])
  assert.deepEqual(typeOf(w, r, '.claude', 'skills', 'pdf', 'SKILL.md'), ['downloaded', 'pdf', false, null])
  assert.deepEqual(typeOf(w, w.home, '.agents', 'skills', 'mine-global', 'SKILL.md'), ['owner', 'mine-global', true, 'skill-install'])
  assert.deepEqual(typeOf(w, w.home, '.claude', 'skills', 'mine-global', 'SKILL.md'), ['owner', 'mine-global', true, 'skill-install'])
  assert.deepEqual(typeOf(w, w.home, '.claude', 'skills', 'real-dir', 'SKILL.md'), ['owner', 'real-dir', true, 'skill-install'])
  assert.deepEqual(typeOf(w, w.home, '.agents', 'skills', 'globalpdf', 'SKILL.md'), ['downloaded', 'globalpdf', false, null])
  assert.deepEqual(typeOf(w, w.plugin, 'skills', 'tidy', 'SKILL.md'), ['aether', 'tidy', false, null])
  assert.deepEqual(typeOf(w, w.home, '.claude', 'plugins', 'cache', 'mk', 'aether', '0.35.0', 'skills', 'plan', 'SKILL.md'), ['aether', 'plan', false, null])
  assert.deepEqual(typeOf(w, r, '.agents', 'skills', 'new-skill', 'SKILL.md'), ['project', 'new-skill', true, null], 'a skill that does not exist yet')
  assert.equal(typeOf(w, r, 'src', 'a.js'), null)
  assert.equal(typeOf(w, r, 'README.md'), null)
})

test('a skill of Aether inside the repository of the session is editable, so that Aether can be developed (D11, P7)', (t) => {
  const w = world(t)
  const inside = path.join(w.repo.dir, 'plugins', 'aether')
  put(path.join(inside, 'skills', 'plan', 'SKILL.md'))
  const info = rules.classifySkillPath(path.join(inside, 'skills', 'plan', 'SKILL.md'), { ...w.opts, pluginRoots: [inside] })
  assert.deepEqual([info.type, info.editable], ['aether', true])
  const outside = rules.classifySkillPath(path.join(w.plugin, 'skills', 'tidy', 'SKILL.md'), w.opts)
  assert.deepEqual([outside.type, outside.editable], ['aether', false])
})

test('copyAdvice tells how to copy an Aether skill and a downloaded one, with another name into .agents/skills/ (C8, H3 scenario 18)', () => {
  const dir = '/x/skills/pdf'
  assert.equal(rules.copyAdvice({ type: 'aether', name: 'tidy', dir: '/p/skills/tidy' }), "This is a skill of Aether, and Aether's skills are not edited: copy it with another name into .agents/skills/ and change the copy (for example: cp -r /p/skills/tidy .agents/skills/tidy-mine).")
  assert.equal(rules.copyAdvice({ type: 'downloaded', name: 'pdf', dir }), 'This skill was downloaded from the internet, and downloaded skills are not edited: copy it with another name into .agents/skills/ and change the copy (for example: cp -r /x/skills/pdf .agents/skills/pdf-mine).')
})
