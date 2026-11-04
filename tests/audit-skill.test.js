'use strict'

// Spec 026 (R1, R2, R9, R26, R28): the skill audit has the front matter of onboard, names the seven phases and the twelve topics
// of its catalog (each with a source that research.md holds), does not depend on the Workflow tool, and the help names it.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const PLUGIN = path.join(ROOT, 'plugins', 'aether')
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8')
const skill = read('plugins', 'aether', 'skills', 'audit', 'SKILL.md')
const topics = read('plugins', 'aether', 'skills', 'audit', 'topics.md')
const research = read('specs', '026-project-audit', 'research.md')
const help = read('plugins', 'aether', 'skills', 'help', 'SKILL.md')

const TOPIC_IDS = ['bugs', 'security', 'dependencies', 'tests', 'reliability', 'performance', 'accessibility', 'architecture', 'docs', 'releases', 'hygiene', 'opportunities']
const VERBS = ['analyze', 'candidates', 'verdicts', 'clean', 'triage', 'report']

function frontMatter(text) {
  const block = text.match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(block, 'the skill starts with front matter')
  return Object.fromEntries(block[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]))
}

test('the front matter is the one of onboard: name, description, argument-hint and disable-model-invocation (R1, R28)', () => {
  const front = frontMatter(skill)
  assert.deepEqual(Object.keys(front), ['name', 'description', 'argument-hint', 'disable-model-invocation'])
  assert.equal(front.name, 'audit')
  assert.ok(front.description.length > 0 && front.description.length <= 200)
  assert.equal(front['argument-hint'], '"[topics] [--no-tests]"')
  assert.equal(front['disable-model-invocation'], 'true')
  assert.doesNotMatch(front.description, /workflow/i)
})

test('the seven phases are headings, in the order of R2', () => {
  const names = ['Automated analysis', 'Topic question', 'Discovery', 'Verification', 'Cleanup', 'Triage', 'Delivery']
  const at = names.map((name, i) => skill.search(new RegExp(`^## ${i + 1}\\. ${name}\\s*$`, 'm')))
  assert.ok(at.every((position) => position > -1), `a phase is missing: ${names.filter((_, i) => at[i] === -1)}`)
  assert.deepEqual([...at].sort((a, b) => a - b), at)
})

test('the catalog has the twelve topics, each with sources that research.md holds (R9, C3)', () => {
  for (const id of TOPIC_IDS) {
    const row = topics.split('\n').find((line) => line.startsWith(`| ${id} |`))
    assert.ok(row, `topics.md has a row for ${id}`)
    const urls = [...row.matchAll(/https?:\/\/[^\s|)>\]]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ''))
    assert.ok(urls.length >= 1, `${id} has a source`)
    for (const url of urls) assert.ok(research.includes(url), `${id}: ${url} is not in research.md`)
  }
  assert.equal(topics.split('\n').filter((line) => /^\| [a-z]+ \|/.test(line) && !line.startsWith('| id |')).length, 12)
})

test('it does not need the Workflow tool and says so (R26)', () => {
  assert.match(skill, /does not need the Workflow tool/i)
  assert.doesNotMatch(skill, /allowed-tools|^tools:/m)
  assert.match(skill, /run_in_background/)
  assert.match(skill, /mktemp -d/)
})

test('it names every subcommand of aether-audit next to the bin, as tests/commands.test.js reads it', () => {
  for (const verb of VERBS) assert.match(skill, new RegExp(`aether-audit[^\\n]{0,80}\\b${verb}\\b`), verb)
})

test('it holds the rules that cross the phases: one question, no changes, secrets, issues only after the choice', () => {
  assert.match(skill, /one question/i)
  assert.match(skill, /--no-tests/)
  assert.match(skill, /--tests-command/)
  assert.match(skill, /read-only/i)
  assert.match(skill, /never (print|quote|copy|repeat)[^.\n]*value of a secret/i)
  assert.match(skill, /gh issue create/)
  assert.match(skill, /only after the person (chooses|picks|takes)/i)
  assert.match(skill, /(not|never) (choose|pick|name) (a|the|any) model|does not choose the model/i)
  assert.match(skill, /not the reviewer's reasoning|without the reviewer's reasoning/i)
})

test('the help names /aether:audit, with its argument and the fact that it changes nothing in the project', () => {
  assert.match(help, /\/aether:audit/)
  assert.match(help, /\/aether:audit \[topics\] \[--no-tests\]/)
  const section = help.slice(help.indexOf('## Audit a project'))
  assert.ok(section.length > 0 && help.includes('## Audit a project'))
  assert.match(section.split(/\n## /)[0], /(changes nothing|does not change)/i)
})

test('the plugin has the skill in the folder that the other skills use', () => {
  assert.ok(fs.existsSync(path.join(PLUGIN, 'skills', 'audit', 'SKILL.md')))
})
