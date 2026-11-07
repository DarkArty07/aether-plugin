'use strict'

// Spec 024 R12: the skill help says what Aether adds, by what the person wants to do, with the command of each thing
// and the link to the guide in their language. It carries its own map, because the installed plugin does not ship
// docs/. These tests hold that map to the tree so it cannot drift: it names every skill the person invokes, every
// workflow and every panel, every link points at a file of the repository, and every `aether-<name>` is a real bin.
// Nothing here uses a model or the network.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const PLUGIN = path.join(ROOT, 'plugins', 'aether')
const SKILL = path.join(PLUGIN, 'skills', 'help', 'SKILL.md')
const text = fs.readFileSync(SKILL, 'utf8')
const BLOB = 'https://github.com/DarkArty07/aether-plugin/blob/main/'

// The skills that the person does not invoke by name, each with its reason. Every other skill of the plugin must be
// named in the help as `/aether:<name>`.
const EXCLUDED = {
  'using-aether': 'the Lead\'s bootstrap, injected at session start; nobody invokes it',
  swarm: 'the Lead loads it itself when it runs the swarm',
  'autonomous-runs': 'the Lead loads it itself when the owner gives permission to work for hours',
  skills: 'the Lead loads it itself; nobody invokes it by name',
  'art-direction': 'the Writer loads it itself; nobody invokes it by name',
  help: 'this skill itself',
  'first-setup': 'being renamed to setup, which the help names; if the directory is gone, this entry is harmless',
}
// Named whether or not their directory exists yet: other tasks of spec 024 write them.
const REQUIRED = ['setup', 'doctor']
// The panels are commands of the mod, not skills or workflows.
const PANELS = ['harnesses', 'spend']
// The guides of spec 024 R13 and R14, by their file names (the list at the end of the spec's tasks.md).
const GUIDES = [
  ...['install-and-start', 'first-request', 'whole-feature', 'read-the-brief', 'work-for-hours', 'other-harnesses', 'see-the-spend', 'update-and-uninstall']
    .map((name) => `docs/tutorials/${name}.md`),
  ...['instalar-y-arrancar', 'primera-peticion', 'feature-completa', 'leer-el-brief', 'trabajar-horas', 'otros-harnesses', 'ver-el-gasto', 'actualizar-y-desinstalar']
    .map((name) => `docs/es/guias/${name}.md`),
  'docs/what-aether-adds.md',
  'docs/es/que-agrega-aether.md',
]

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// `/aether:plan` must not count as a mention of `/aether:planner`.
const names = (command) => new RegExp(`(?<![\\w/])${escape(command)}(?![\\w-])`).test(text)

test('the skill help has a name, a one-line description, an argument hint and disable-model-invocation', () => {
  const block = text.match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(block, 'the skill starts with front matter')
  const lines = block[1].split('\n')
  const front = Object.fromEntries(lines.map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]))
  assert.deepEqual(Object.keys(front), ['name', 'description', 'argument-hint', 'disable-model-invocation'])
  assert.equal(front.name, 'help')
  assert.ok(front.description && front.description.length > 0, 'it has a description')
  assert.ok(front.description.length <= 200, 'the description is short')
  assert.ok(!front.description.includes('\n'), 'the description is one line')
  assert.equal(front['argument-hint'], '"[topic]"')
  assert.equal(front['disable-model-invocation'], 'true')
  // It changes nothing and starts no work, and the person can ask for one topic.
  assert.match(text, /change nothing/i)
  assert.match(text, /start no work/i)
  assert.match(text, /topic/i)
  // The way to confirm that a skill exists before naming one that the map does not hold.
  assert.ok(text.includes('${CLAUDE_PLUGIN_ROOT}/skills/'), 'it may list the skills of the plugin')
})

test('the help names every skill the person invokes as /aether:<name>', () => {
  const skills = fs.readdirSync(path.join(PLUGIN, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(PLUGIN, 'skills', entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
  assert.ok(skills.includes('audit'), 'the plugin has skills')
  for (const [name, reason] of Object.entries(EXCLUDED)) assert.ok(reason.length > 0, `${name} is excluded with a reason`)
  const missing = skills.filter((name) => !(name in EXCLUDED) && !names(`/aether:${name}`))
  assert.deepEqual(missing, [], `the help does not name /aether:${missing.join(', /aether:')}`)
  // The ones that other tasks of spec 024 write are named even if their directory is not there yet.
  for (const name of REQUIRED) assert.ok(names(`/aether:${name}`), `the help names /aether:${name}`)
  // The excluded ones are not offered to the person as commands.
  for (const name of ['using-aether', 'swarm', 'autonomous-runs', 'skills', 'art-direction']) assert.ok(!names(`/aether:${name}`), `the help does not offer /aether:${name}`)
})

test('the help names every workflow as /aether:<name>, and the panels /harnesses and /spend', () => {
  const workflows = fs.readdirSync(path.join(PLUGIN, 'workflows'))
    .filter((file) => file.endsWith('.workflow.js'))
    .map((file) => file.slice(0, -'.workflow.js'.length))
  assert.ok(workflows.length >= 2, 'the plugin has workflows')
  const missing = workflows.filter((name) => !names(`/aether:${name}`))
  assert.deepEqual(missing, [], `the help does not name /aether:${missing.join(', /aether:')}`)
  for (const panel of PANELS) assert.ok(names(`/${panel}`), `the help names /${panel}`)
})

test('every link of the help to the repository points to a file that exists', () => {
  const links = [...text.matchAll(/https:\/\/github\.com\/DarkArty07\/aether-plugin\/blob\/main\/[^\s)>\]`"']+/g)].map((m) => m[0])
  assert.ok(links.length > 0, 'the help links the guides')
  const missing = []
  for (const link of links) {
    const file = link.slice(BLOB.length).replace(/#.*$/, '').replace(/[.,;:]+$/, '')
    if (!fs.existsSync(path.join(ROOT, file))) missing.push(file)
  }
  assert.deepEqual(missing, [], `the help links files that are not in the repository: ${missing.join(', ')}`)
})

test('the help links every guide in English and in Spanish, and the pages of what Aether adds', () => {
  const missing = GUIDES.filter((file) => !text.includes(`${BLOB}${file}`))
  assert.deepEqual(missing, [], `the help does not link ${missing.join(', ')}`)
  assert.match(text, /Spanish page when you answer in Spanish/i, 'it says which language to link')
})

test('every aether-<name> in a code span of the help is a bin, the launcher or aeth', () => {
  const bins = new Set(fs.readdirSync(path.join(PLUGIN, 'bin')))
  const allowed = new Set([...bins, 'aether-lead', 'aeth'])
  const spans = [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1])
  const found = new Set()
  for (const span of spans) for (const m of span.matchAll(/(?<![\w@/.:-])(aether-[a-z0-9-]+|aeth)(?![\w:-])/g)) found.add(m[1])
  assert.ok(found.has('aeth'), 'the help names the command that starts Aether mode')
  assert.ok(found.has('aether-report'), 'the help names the command that reports the spend')
  const unknown = [...found].filter((name) => !allowed.has(name))
  assert.deepEqual(unknown, [], `the help names commands that are not files of bin/: ${unknown.join(', ')}`)
})
