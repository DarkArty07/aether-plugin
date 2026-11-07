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
