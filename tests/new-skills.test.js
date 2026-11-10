'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')
const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')

function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text)
  assert.ok(m, 'front matter')
  return Object.fromEntries(m[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim().replace(/^"|"$/g, '')]))
}

test('aether:skills has its cover and can be loaded by the Lead (C12, R34)', () => {
  const text = read('skills', 'skills', 'SKILL.md')
  const front = frontMatter(text)
  assert.equal(front.name, 'skills')
  assert.ok(front.description.startsWith('Use ') && front.description.length <= 300)
  assert.equal(front['disable-model-invocation'], undefined)
})

test('aether:skills teaches the four types, where to find and download, what to review, when to create and how to give skills to a task (R34, R46, C12)', () => {
  const text = read('skills', 'skills', 'SKILL.md')
  for (const token of ['~/.agents/skills/', '.agents/skills/', '.claude/skills/', 'skills-lock.json', 'uses.jsonl', 'npx skills find', 'npx skills add', 'aether-autonomy trust', 'trusted.json', 'skill-install', 'AETHER-SKILLS:', 'Skills:', 'AGENTS.md', 'at most 3', '500 lines']) {
    assert.ok(text.includes(token), `the skill names ${token}`)
  }
  const lower = text.toLowerCase()
  for (const phrase of ['read the whole skill', 'downloaded', 'aether', 'project', 'permanent', 'copy it with another name', '-g']) assert.ok(lower.includes(phrase), phrase)
  assert.ok(!/onboard/i.test(text))
})

test('aether:art-direction names the file the Writer writes before the plan (R34, R35)', () => {
  const text = read('skills', 'art-direction', 'SKILL.md')
  const front = frontMatter(text)
  assert.equal(front.name, 'art-direction')
  assert.ok(front.description.startsWith('Use ') && front.description.length <= 300)
  assert.equal(front['disable-model-invocation'], undefined)
  assert.ok(text.includes('specs/NNN-<topic>/art-direction.md'))
  for (const word of ['palette', 'typography', 'spacing', 'motion', 'states']) assert.ok(text.toLowerCase().includes(word), word)
})

test('the Writer and the plan skill name the art direction before the plan; there is no hook for it (R35, H3 scenario 26)', () => {
  const writer = read('agents', 'writer.md')
  assert.ok(writer.includes('aether:art-direction') && writer.includes('art-direction.md'))
  assert.ok(writer.indexOf('aether:art-direction') < writer.indexOf('Write `plan.md`, then `tasks.md`') || writer.indexOf('art-direction.md') < writer.indexOf('Run `aether-plan check'))
  assert.ok(read('skills', 'plan', 'SKILL.md').includes('art-direction.md'))
  assert.ok(read('speckit', 'commands', 'speckit.plan.md').includes('art-direction.md'))
  const hooks = fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')
  assert.ok(!/art-direction/.test(hooks))
})

test('the components page names the models and designing skills', () => {
  const components = fs.readFileSync(path.join(PLUGIN, '..', '..', 'docs', 'reference', 'components.md'), 'utf8')
  for (const name of ['models', 'designing']) assert.ok(components.includes(`\`aether:${name}\``), `components.md names aether:${name}`)
})

test('models and designing skills exist with valid frontmatter and expected content', () => {
  const models = read('skills', 'models', 'SKILL.md')
  const designing = read('skills', 'designing', 'SKILL.md')

  assert.equal(frontMatter(models).name, 'models')
  assert.ok(frontMatter(models).description.length > 20)
  assert.ok(models.includes('\n## Models\n'))
  assert.ok(models.includes('| Model | Price | Speed | Its maker says |'))
  assert.ok(models.includes(['config', 'models', 'models.json'].join('/')))
  assert.ok(models.includes(['config', 'prices.json'].join('/')))
  assert.match(models, /Haiku 5\.5/)
  assert.match(models, /Opus 5\.5/)

  assert.equal(frontMatter(designing).name, 'designing')
  assert.ok(frontMatter(designing).description.length > 20)
  assert.match(designing, /specs\/NNN-<topic>\/intent\.md/)
  assert.match(designing, /\/aether:design/)
  assert.match(designing, /aether-exam store specs\/NNN-<topic>/)
  assert.doesNotMatch(designing, /`aether-exam store`/)
})

test('skills skill uses --author flag in aether-autonomy trust command', () => {
  const text = read('skills', 'skills', 'SKILL.md')
  assert.match(text, /aether-autonomy trust --author <author> --quote "<their words>"/)
  assert.doesNotMatch(text, /aether-autonomy trust <author>/)
})

