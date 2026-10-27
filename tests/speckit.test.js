'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const SPECKIT = path.join(PLUGIN, 'speckit')
const NAMES = ['specify', 'plan', 'tasks', 'constitution']

const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')

// The frontmatter (between the first two --- lines) and the body after it.
function split(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(m, 'the file starts with a frontmatter block')
  return { frontmatter: m[1], body: text.slice(m[0].length) }
}

// The value of a single-line key, without its double quotes.
function value(frontmatter, key) {
  const m = frontmatter.match(new RegExp(`^${key}: (.*)$`, 'm'))
  assert.ok(m, `the frontmatter has ${key}`)
  return m[1].replace(/^"(.*)"$/, '$1')
}

// The template entries of preset.yml, read with regular expressions.
function templates(yml) {
  return yml.split(/^\s*- type: /m).slice(1).map((entry) => {
    const field = (key) => {
      const m = entry.match(new RegExp(`^\\s*${key}: "(.*)"\\s*$`, 'm'))
      assert.ok(m, `a template has ${key}`)
      return m[1]
    }
    return {
      type: entry.match(/^"(.*)"/)[1],
      name: field('name'),
      file: field('file'),
      description: field('description'),
      replaces: field('replaces'),
    }
  })
}

test('preset.yml names the four commands, each with a file, a description and a replaces line of its own', () => {
  const yml = read('speckit', 'preset.yml')
  assert.match(yml, /^schema_version: "1\.0"$/m)
  assert.match(yml, /^  id: "aether"$/m)
  assert.match(yml, /^  license: "MIT"$/m)
  for (const tag of ['aether', 'swarm', 'autonomous']) assert.match(yml, new RegExp(`^  - "${tag}"$`, 'm'), tag)
  const entries = templates(yml)
  assert.deepEqual(entries.map((t) => t.name).sort(), NAMES.map((n) => `speckit.${n}`).sort())
  for (const t of entries) {
    assert.equal(t.type, 'command', t.name)
    assert.equal(t.file, `commands/${t.name}.md`, t.name)
    assert.ok(fs.existsSync(path.join(SPECKIT, t.file)), t.file)
    assert.ok(t.description.length > 0 && !t.description.includes('\n'), `${t.name} has a one-line description`)
    assert.equal(t.replaces, t.name, t.name)
  }
})

for (const name of NAMES) {
  test(`the ${name} command has one description line, the User Input block and an Outline`, () => {
    const { frontmatter, body } = split(read('speckit', 'commands', `speckit.${name}.md`))
    assert.match(frontmatter, /^description: "[^"\n]+"$/)
    assert.ok(body.includes('## User Input\n\n```text\n$ARGUMENTS\n```\n\n## Outline\n'), name)
  })

  test(`the ${name} skill has the body of its command, byte for byte`, () => {
    const command = split(read('speckit', 'commands', `speckit.${name}.md`))
    const skill = split(read('skills', name, 'SKILL.md'))
    assert.equal(skill.body, command.body)
  })

  test(`the ${name} skill is named ${name} and says it is Aether mode, with the command's description`, () => {
    const command = split(read('speckit', 'commands', `speckit.${name}.md`))
    const skill = split(read('skills', name, 'SKILL.md'))
    assert.equal(value(skill.frontmatter, 'name'), name)
    assert.equal(value(skill.frontmatter, 'description'), `Aether mode: ${value(command.frontmatter, 'description')}`)
  })
}

test('the specify command never stops to ask, and writes every section of the spec', () => {
  const text = read('speckit', 'commands', 'speckit.specify.md')
  for (const s of [
    'Never stop to ask',
    'specs/NNN-<topic>/',
    '## Criteria',
    '## User scenarios',
    '## Requirements',
    '## Proposals',
    '## Assumptions',
    '## Irreversible actions',
    '## Out of scope',
    'Sirve a: C2',
  ]) {
    assert.ok(text.includes(s), s)
  }
})

test('the tasks command writes an Aether execution, Aether fields and a checklist that aether-plan check accepts', () => {
  const text = read('speckit', 'commands', 'speckit.tasks.md')
  for (const s of [
    '## Aether Execution',
    '- Test command:',
    '- Ladder: haiku 2, sonnet 2, opus 1',
    '- Max agents: 200',
    '## Global Constraints',
    '## Checklist',
    '**Aether:**',
    'Tier:',
    'Review:',
    'Area:',
    'Owns:',
    'Depends on:',
    'aether-plan check',
    'Tests are required',
    'Tasks of the same wave must not own overlapping paths.',
  ]) {
    assert.ok(text.includes(s), s)
  }
})

test('the guidance the Writer reads says the effort defaults to high and keeps xhigh for named risk', () => {
  const files = [
    path.join(PLUGIN, 'skills', 'tasks', 'SKILL.md'),
    path.join(PLUGIN, 'speckit', 'commands', 'speckit.tasks.md'),
    path.join(PLUGIN, 'agents', 'writer.md'),
  ]
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    assert.match(text, /effort(?:\*\*)? (?:defaults to|is) `high`/, file)
    assert.doesNotMatch(text, /defaults to `xhigh`|is `xhigh` when the Tier line names none/, file)
    assert.doesNotMatch(text, /malformed input that the tests do not list/, file)
  }
  for (const file of files.slice(0, 2)) {
    assert.match(fs.readFileSync(file, 'utf8'), /only where a mistake would reach user data, security or concurrency/, file)
  }
})

test('the NOTICE names Spec Kit and oh-my-claudecode, and keeps the superpowers paragraph', () => {
  const notice = read('NOTICE')
  assert.match(notice, /Spec Kit \(https:\/\/github\.com\/github\/spec-kit\), Copyright GitHub, Inc\./)
  assert.match(notice, /oh-my-claudecode \(https:\/\/github\.com\/Yeachan-Heo\/oh-my-claudecode\), Copyright \(c\) 2025 Yeachan Heo/)
  assert.match(notice, /\(https:\/\/github\.com\/obra\/superpowers\)/)
  assert.ok(notice.indexOf('Spec Kit') < notice.indexOf('The rest of the project'))
})
