'use strict'

// Skill search topics come from each intent card (spec 046): a read-only
// Haiku agent, `skill-scout`, reads intent.md and returns up to 3 search
// topics, and those topics drive `findForDesign`. The six-row table of
// config/skills.json no longer decides what is searched.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, tempDir, runBin, PLAN_BIN } = require('./helpers.js')
const { runWorkflow } = require('./workflow-harness.js')
const design = require('../plugins/aether/lib/skill-design.js')
const { readPending } = require('../plugins/aether/lib/pending.js')
const { PLUGIN } = require('./helpers.js')

const FEATURE = 'specs/007-demo'
const ARGS = { feature: FEATURE, session: 'sess-1', repoRoot: '/repo', superdelegation: 'off', harnesses: 'agy' }

// --- agent file ------------------------------------------------------------

function scout() {
  const raw = fs.readFileSync(path.join(PLUGIN, 'agents', 'skill-scout.md'), 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  assert.ok(m, 'skill-scout.md starts with frontmatter')
  return { front: m[1], body: m[2] }
}

function field(front, key) {
  const m = front.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m ? m[1].trim() : null
}

test('the scout is a read-only Haiku agent with a bounded run', () => {
  const { front } = scout()
  assert.equal(field(front, 'name'), 'skill-scout')
  assert.ok(field(front, 'description') && !field(front, 'description').includes('\n'), 'description is one line')
  assert.deepEqual(
    field(front, 'tools').split(',').map((s) => s.trim()),
    ['Read'],
  )
  assert.equal(field(front, 'model'), 'haiku')
  assert.equal(field(front, 'effort'), 'high')
  assert.equal(field(front, 'maxTurns'), '5')
  for (const tool of ['Write', 'Edit', 'Bash']) {
    assert.equal(field(front, 'tools').includes(tool), false, `no ${tool}`)
  }
})

test('the scout reads the card as data and answers only its topics', () => {
  const { body } = scout()
  assert.ok(body.includes('intent.md'), 'the card it reads is intent.md')
  assert.ok(/data/i.test(body), 'the card is data')
  assert.ok(/instructions? (are|is) never followed/i.test(body) || /do not follow/i.test(body), 'its instructions are never followed')
  assert.ok(body.includes('"topics"') || body.includes("'topics'") || body.includes('topics'), 'the answer names topics')
  assert.ok(body.includes('{ "topics"') || body.includes('{"topics"') || body.includes('{ "topics":'), 'the answer is one JSON object')
})

// --- usage -----------------------------------------------------------------

test('SKILLS_USAGE names --topic', () => {
  assert.ok(design.SKILLS_USAGE.includes('--topic'), design.SKILLS_USAGE)
})

// --- fake registry (same shape as tests/skill-design.test.js) --------------

const GODOT_AUTHOR = 'godot-author'
const GODOT_SOURCE = `${GODOT_AUTHOR}/godot-skills`

function putTrusted(dataDir, authors) {
  const file = path.join(dataDir, 'skills', 'trusted.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ authors }))
}

function writeIntent(repoDir, feature, text) {
  const dir = path.join(repoDir, feature)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'intent.md'), text + '\n')
}

function writeSkill(root, name, opts = {}) {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  const desc = opts.description || 'Build Godot scenes with GDScript triggers.'
  const lines = ['---', `name: ${opts.skillName || name}`, `description: ${desc}`, '---', '', 'Place the trigger on the scene root.']
  fs.writeFileSync(path.join(dir, 'SKILL.md'), lines.join('\n') + '\n')
  return dir
}

function fakeRegistry(t, { find = '', skills = {} } = {}) {
  const dir = tempDir(t, 'aether-fake-registry-')
  const home = tempDir(t, 'aether-fake-home-')
  const srcDir = path.join(dir, 'src')
  fs.mkdirSync(srcDir, { recursive: true })
  const mapping = {}
  for (const [name, spec] of Object.entries(skills)) {
    mapping[name] = name
    writeSkill(srcDir, name, spec)
  }
  const countersFile = path.join(dir, 'counters.json')
  fs.writeFileSync(countersFile, JSON.stringify({ find: 0, add: 0, queries: [], adds: [] }))
  const findFile = path.join(dir, 'find.json')
  fs.writeFileSync(findFile, JSON.stringify(typeof find === 'string' ? { lines: find } : find))
  const skillsFile = path.join(dir, 'skills.json')
  fs.writeFileSync(skillsFile, JSON.stringify(mapping))
  const bin = path.join(dir, 'skills-fake')
  fs.writeFileSync(bin, `#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const countersFile = process.env.SKILLS_FAKE_COUNTERS
const srcDir = process.env.SKILLS_FAKE_SRC
const findFile = process.env.SKILLS_FAKE_FIND
const skillsFile = process.env.SKILLS_FAKE_SKILLS
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return fb } }
const bump = (kind, entry) => {
  const c = readJson(countersFile, { find: 0, add: 0, queries: [], adds: [] })
  c[kind] += 1
  if (kind === 'find') c.queries.push(entry); else c.adds.push(entry)
  fs.writeFileSync(countersFile, JSON.stringify(c))
}
const args = process.argv.slice(2)
if (args[0] === 'find') {
  const query = args.slice(1).join(' ')
  bump('find', query)
  const cfg = readJson(findFile, { lines: '' })
  const lines = typeof cfg.lines === 'string' ? cfg.lines : (cfg.byQuery || {})[query] || ''
  if (lines !== '') process.stdout.write(lines.endsWith('\\n') ? lines : lines + '\\n')
} else if (args[0] === 'add') {
  const at = args.indexOf('--skill')
  const name = at >= 0 ? args[at + 1] : null
  const source = args[1]
  bump('add', (source || '') + ' --skill ' + (name || ''))
  const mapping = readJson(skillsFile, {})
  const fixture = name ? mapping[name] : null
  if (!name || !fixture) { process.stderr.write('no such skill\\n'); process.exit(1) }
  try {
    fs.cpSync(path.join(srcDir, fixture), path.join(process.cwd(), '.agents', 'skills', name), { recursive: true })
  } catch (err) { process.stderr.write(String(err) + '\\n'); process.exit(1) }
} else { process.stderr.write('usage\\n'); process.exit(2) }
`)
  fs.chmodSync(bin, 0o755)
  const env = {
    AETHER_SKILLS_BIN: bin,
    HOME: home,
    SKILLS_FAKE_COUNTERS: countersFile,
    SKILLS_FAKE_SRC: srcDir,
    SKILLS_FAKE_FIND: findFile,
    SKILLS_FAKE_SKILLS: skillsFile,
  }
  const counts = () => JSON.parse(fs.readFileSync(countersFile, 'utf8'))
  return { env, home, dir, counts }
}

function setup(t, feature = 'specs/001-quest') {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  putTrusted(data, [GODOT_AUTHOR])
  return { repo, data, feature }
}

function callFind(w, fake, { topics = [], extra = {} } = {}) {
  return design.findForDesign({
    cwd: w.repo.dir,
    feature: w.feature,
    home: fake.home,
    dataDir: w.data,
    env: fake.env,
    topics,
    ...extra,
  })
}

// --- findForDesign over the scout's topics ----------------------------------

const PIXEL_FIND = `${GODOT_SOURCE}@pixel-art-kit  3 installs of a pixel art helper\n`

test('a card on a topic outside the six searches and installs a trusted skill', (t) => {
  const w = setup(t)
  writeIntent(w.repo.dir, w.feature, 'A pixel-art editor: draw sprites tile by tile with a tiny palette.')
  const fake = fakeRegistry(t, {
    find: PIXEL_FIND,
    skills: { 'pixel-art-kit': { description: 'Pixel art sprites and palettes for tiny games.' } },
  })
  const r = callFind(w, fake, { topics: ['pixel-art'] })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual(r.topics, ['pixel-art'])
  assert.equal(r.candidates.length, 1)
  assert.equal(r.candidates[0].topic, 'pixel-art')
  assert.equal(fake.counts().find, 1)
  const installed = design.installForDesign({ cwd: w.repo.dir, feature: w.feature, id: r.candidates[0].id, home: fake.home, dataDir: w.data, env: fake.env })
  assert.equal(installed.ok, true, JSON.stringify(installed))
  assert.equal(installed.name, 'pixel-art-kit')
})

test('words of the old table no longer activate anything by themselves', (t) => {
  const w = setup(t)
  writeIntent(w.repo.dir, w.feature, 'Run it in docker next to the godot build with shader support.')
  const fake = fakeRegistry(t, { find: PIXEL_FIND, skills: { 'pixel-art-kit': {} } })
  const r = callFind(w, fake, { topics: [] })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual(r.topics, [])
  assert.deepEqual(r.candidates, [])
  assert.equal(fake.counts().find, 0, 'no topic, no search')
})

test('a card that names docker only searches when the scout returns that topic', (t) => {
  const w = setup(t)
  writeIntent(w.repo.dir, w.feature, 'Run it in docker with a compose file.')
  const fake = fakeRegistry(t, {
    find: { byQuery: { docker: `${GODOT_SOURCE}@docker-helper  5 installs of a docker helper\n` } },
    skills: { 'docker-helper': { description: 'Docker containers and compose files for local work.' } },
  })
  const without = callFind(w, fake, { topics: [] })
  assert.deepEqual(without.candidates, [])
  assert.equal(fake.counts().find, 0)
  const withTopic = callFind(w, fake, { topics: ['docker'] })
  assert.equal(withTopic.ok, true, JSON.stringify(withTopic))
  assert.deepEqual(withTopic.topics, ['docker'])
  assert.deepEqual(withTopic.candidates.map((c) => c.name), ['docker-helper'])
  assert.deepEqual(fake.counts().queries, ['docker'])
})

test('a topic already covered by an installed skill is not searched', (t) => {
  const w = setup(t)
  writeIntent(w.repo.dir, w.feature, 'A pixel-art editor with tiny palettes.')
  writeSkill(path.join(w.repo.dir, '.agents', 'skills'), 'pixel-art-kit', { description: 'Pixel art sprites and palettes for tiny games.' })
  const fake = fakeRegistry(t, { find: PIXEL_FIND, skills: { 'pixel-art-kit': {} } })
  const r = callFind(w, fake, { topics: ['pixel-art'] })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual(r.topics, [])
  assert.deepEqual(r.candidates, [])
  assert.equal(fake.counts().find, 0)
})

test('a covered topic is skipped and still blocks a duplicate skill for the next topic', (t) => {
  const w = setup(t)
  writeIntent(w.repo.dir, w.feature, 'Godot scenes with a shader pass.')
  writeSkill(path.join(w.repo.dir, '.agents', 'skills'), 'godot-helper', { description: 'Build Godot scenes with GDScript triggers.' })
  const fake = fakeRegistry(t, {
    find: {
      byQuery: {
        shader: `${GODOT_SOURCE}@shader-kit  3 installs of a shader helper for tiny games\n`,
      },
    },
    skills: {
      'shader-kit': { description: 'Godot shader helpers for godot scenes and graphs.' },
    },
  })
  const r = callFind(w, fake, { topics: ['godot', 'shader'] })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual(r.topics, ['shader'], 'the covered topic is skipped, not searched')
  assert.deepEqual(r.candidates, [], 'the candidate duplicates the covered topic')
  assert.equal(r.rejected.length, 1)
  assert.ok(/already accepted|duplicat/i.test(r.rejected[0].reasons.join(' ')), JSON.stringify(r.rejected[0].reasons))
  assert.deepEqual(fake.counts().queries, ['shader'])
})

test('find with no topic answers ok:true with empty lists and never calls the registry', (t) => {
  const w = setup(t)
  writeIntent(w.repo.dir, w.feature, 'A pixel-art editor.')
  const fake = fakeRegistry(t, { find: PIXEL_FIND, skills: { 'pixel-art-kit': {} } })
  const env = { ...fake.env, AETHER_DATA_DIR: w.data }
  const found = runBin(PLAN_BIN, ['skills', 'find', w.feature], w.repo.dir, env)
  assert.equal(found.status, 0, found.stdout + found.stderr)
  assert.deepEqual(found.json, { ok: true, topics: [], candidates: [], rejected: [], pending: [], errors: [] })
  assert.equal(fake.counts().find, 0)
})

test('the bin searches each --topic it is given', (t) => {
  const w = setup(t)
  writeIntent(w.repo.dir, w.feature, 'A pixel-art editor.')
  const fake = fakeRegistry(t, { find: PIXEL_FIND, skills: { 'pixel-art-kit': { description: 'Pixel art sprites and palettes for tiny games.' } } })
  const env = { ...fake.env, AETHER_DATA_DIR: w.data }
  const found = runBin(PLAN_BIN, ['skills', 'find', w.feature, '--topic', 'pixel-art'], w.repo.dir, env)
  assert.equal(found.status, 0, found.stdout + found.stderr)
  assert.equal(found.json.ok, true, found.stdout)
  assert.deepEqual(found.json.topics, ['pixel-art'])
  assert.equal(found.json.candidates.length, 1)
  assert.equal(fake.counts().find, 1)
})

// --- main and the mod reject bad topic lists --------------------------------

test('main accepts 0 to 3 valid distinct topics, and rejects anything else', (t) => {
  const w = setup(t)
  writeIntent(w.repo.dir, w.feature, 'A pixel-art editor.')
  const fake = fakeRegistry(t, { find: '', skills: {} })
  const env = { ...fake.env, AETHER_DATA_DIR: w.data }
  for (const argv of [
    ['skills', 'find', w.feature],
    ['skills', 'find', w.feature, '--topic', 'pixel-art'],
    ['skills', 'find', w.feature, '--topic', 'pixel-art', '--topic', 'postgres'],
    ['skills', 'find', w.feature, '--topic', 'a', '--topic', 'b-c', '--topic', 'd-e-f'],
  ]) {
    const r = runBin(PLAN_BIN, argv, w.repo.dir, env)
    assert.equal(r.status, 0, argv.join(' '))
  }
  for (const argv of [
    ['skills', 'find', w.feature, '--topic', 'pixel-art', '--topic', 'postgres', '--topic', 'redis', '--topic', 'extra'],
    ['skills', 'find', w.feature, '--topic', 'pixel-art', '--topic', 'pixel-art'],
    ['skills', 'find', w.feature, '--topic', 'Pixel-Art'],
    ['skills', 'find', w.feature, '--topic', 'pixel art'],
    ['skills', 'find', w.feature, '--topic', 'pixel;art'],
    ['skills', 'find', w.feature, '--topic', 'pixel$art'],
    ['skills', 'find', w.feature, '--topic', 'pixel/art'],
    ['skills', 'find', w.feature, '--topic', 'abcdefghijklmnopqrstuvwxy'],
    ['skills', 'find', w.feature, '--topic'],
    ['skills', 'find', w.feature, '--topic', 'pixel-art', '--x'],
    ['skills', 'find', w.feature, 'pixel-art'],
  ]) {
    const r = runBin(PLAN_BIN, argv, w.repo.dir, env)
    assert.equal(r.status, 1, argv.join(' '))
    assert.deepEqual(r.json, { ok: false, errors: [design.SKILLS_USAGE], warnings: [] }, argv.join(' '))
  }
})

// --- the mod validates --topic like main ------------------------------------

test('the mod parses 0 to 3 --topic and refuses anything else', async () => {
  const { parseOpsPrompt } = await import(path.join(PLUGIN, 'hooks', 'ops-command.mjs'))
  const SHORT = 'Run this command with the Bash tool, once, exactly as written:'
  const CLOSING = 'Then return its exit code and its complete standard output, exactly as printed. Do not run anything else, and do not fix or retry anything.'
  const prompt = (command) => [SHORT, '', `cd '/repo' && ${command}`, '', CLOSING].join('\n')
  for (const command of [
    `aether-plan skills find ${FEATURE}`,
    `aether-plan skills find ${FEATURE} --topic pixel-art`,
    `aether-plan skills find ${FEATURE} --topic pixel-art --topic postgres`,
    `aether-plan skills find ${FEATURE} --topic a --topic b-c --topic d-e-f`,
  ]) {
    assert.ok(parseOpsPrompt(prompt(command)), command)
  }
  for (const command of [
    `aether-plan skills find ${FEATURE} --topic pixel-art --topic postgres --topic redis --topic extra`,
    `aether-plan skills find ${FEATURE} --topic pixel-art --topic pixel-art`,
    `aether-plan skills find ${FEATURE} --topic Pixel-Art`,
    `aether-plan skills find ${FEATURE} --topic pixel;art`,
    `aether-plan skills find ${FEATURE} --topic pixel$art`,
    `aether-plan skills find ${FEATURE} --topic pixel/art`,
    `aether-plan skills find ${FEATURE} --topic abcdefghijklmnopqrstuvwxy`,
    `aether-plan skills find ${FEATURE} --topic`,
    `aether-plan skills find ${FEATURE} --topic pixel-art --x`,
    `aether-plan skills find ${FEATURE} pixel-art`,
  ]) {
    assert.equal(parseOpsPrompt(prompt(command)), null, command)
  }
})

// --- the flow: the scout's topics drive find --------------------------------

const COMMAND = /^cd '[^']*' && (?:PATH='[^']*':"\$PATH" )?(aether-lane|aether-plan|aether-exam) ([a-z-]+)(.*)$/m
function commandOf(prompt) {
  const m = COMMAND.exec(prompt)
  return m ? { tool: m[1], verb: m[2], rest: m[3].trim().split(' ').filter(Boolean), line: `${m[1]} ${m[2]}${m[3]}` } : null
}

const SPEC_ANSWER = { spec: `${FEATURE}/spec.md`, commit: 'c1', clarify: [], assumptions: [], proposals: [], questions: [], disagreements: [] }
const PLAN_ANSWER = { plan: `${FEATURE}/plan.md`, tasks: `${FEATURE}/tasks.md`, commit: 'c2', check: '{"ok":true}', complexity: '', assumptions: [], questions: [], disagreements: [] }
const APPROVE = { verdict: 'approve', findings: [], openQuestions: [] }
const EXAM = { tests: [{ id: 'c1', criterion: 'C1', command: 'node --test .aether/exam/c1.test.js', files: ['c1.test.js'] }], notes: 'none' }
const CHECK_OK = { ok: true, tasks: 3, waves: [['task-1']], warnings: [] }

const pixel = { id: 'pixel-art-kit-9e8f', topic: 'pixel-art', name: 'pixel-art-kit', source: 'vercel-labs/agent-skills', author: 'vercel-labs', hash: 'h3', dir: '/data/skills/review/pixel-art-kit-9e8f', code: { ok: true } }

function flowHandlers() {
  return {
    writer: (call) => {
      if (call.label.startsWith('spec:')) return SPEC_ANSWER
      if (call.label.startsWith('plan: writer tasks')) return { tasks: `${FEATURE}/tasks.md`, commit: 'c3', check: '{"ok":true}', assumptions: [], questions: [] }
      return { plan: `${FEATURE}/plan.md`, commit: 'c2', complexity: '', assumptions: [], questions: [] }
    },
    judge: () => APPROVE,
    examiner: () => EXAM,
    'skill-scout': () => ({ topics: ['godot'] }),
    ops: (call) => {
      const { verb, rest } = call.command
      if (verb === 'check') return CHECK_OK
      if (verb === 'requirements') return { requirements: 8, threshold: 15, map: false }
      if (verb === 'skills' && rest[0] === 'find') return { ok: true, topics: [], candidates: [], rejected: [], pending: [], errors: [] }
      if (verb === 'skills' && rest[0] === 'install') {
        const id = rest.at(-1)
        return { ok: true, name: id.replace(/-[0-9a-f]{4}$/, ''), hash: 'h1', path: `/repo/.agents/skills/${id}`, committed: false }
      }
      if (verb === 'skills' && rest[0] === 'discard') return { ok: true }
      if (verb === 'store') return { stored: '/data/exams/007-demo' }
      throw new Error(`unexpected ops command: ${call.command.line}`)
    },
  }
}
const go = (args, overrides = {}) => runWorkflow(JSON.stringify(args), overrides, { script: 'design.workflow.js', roles: ['writer', 'judge', 'examiner', 'mapper', 'skill-scout', 'skill-reviewer', 'ops'], commandOf, defaults: flowHandlers })
const skillLines = (run) => run.calls.filter((c) => c.command && c.command.verb === 'skills').map((c) => c.command.line)
const findOf = (run) => skillLines(run).find((line) => line.includes('skills find'))

test('the scout runs before find, and its topics reach the command', async () => {
  const run = await go(ARGS)
  assert.equal(run.error, null, run.error && run.error.stack)
  const scoutCall = run.calls.find((c) => c.role === 'skill-scout')
  assert.ok(scoutCall, 'skill-scout runs')
  assert.deepEqual([scoutCall.model, scoutCall.effort], ['haiku', 'high'])
  assert.ok(scoutCall.prompt.includes(`${FEATURE}/intent.md`), 'the message names intent.md')
  assert.deepEqual(scoutCall.schema, {
    type: 'object',
    required: ['topics'],
    properties: { topics: { type: 'array', items: { type: 'string' }, maxItems: 3 } },
  })
  assert.equal(findOf(run), `aether-plan skills find ${FEATURE} --topic godot`)
  const lines = run.calls.filter((c) => c.command).map((c) => c.command.line)
  assert.ok(lines.indexOf(findOf(run)) < lines.indexOf(`aether-plan requirements ${FEATURE}/spec.md`))
  assert.equal(run.result.status, 'approved')
})

test('a topic outside the six reaches find when the scout returns it', async () => {
  const seen = []
  const run = await go(ARGS, {
    'skill-scout': () => ({ topics: ['pixel-art'] }),
    ops: (call, fallback) => {
      if (call.command.verb === 'skills' && call.command.rest[0] === 'find') {
        seen.push(call.command.line)
        return { ok: true, topics: ['pixel-art'], candidates: [pixel], rejected: [], pending: [], errors: [] }
      }
      return fallback(call)
    },
    'skill-reviewer': () => ({ verdict: 'approved', reasons: [] }),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(seen, [`aether-plan skills find ${FEATURE} --topic pixel-art`])
  assert.deepEqual(run.result.skills.installed.map((s) => s.name), ['pixel-art-kit'])
})

test('the flow discards invalid and repeated topics and keeps 3', async () => {
  const seen = []
  const run = await go(ARGS, {
    'skill-scout': () => ({ topics: ['ok-one', 'Bad', 'ok-one', 'a/b', 'second-topic', 'third-one', 'fourth', 'abcdefghijklmnopqrstuvwxy'] }),
    ops: (call, fallback) => {
      if (call.command.verb === 'skills' && call.command.rest[0] === 'find') {
        seen.push(call.command.rest)
        return { ok: true, topics: [], candidates: [], rejected: [], pending: [], errors: [] }
      }
      return fallback(call)
    },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(seen, [[
    'find', FEATURE, '--topic', 'ok-one', '--topic', 'second-topic', '--topic', 'third-one',
  ]])
})

for (const [name, scout] of [
  ['fails', () => { throw new Error('boom') }],
  ['ends without an answer', () => null],
  ['answers invalid data', () => ({ topics: 'godot' })],
  ['answers no valid topic', () => ({ topics: ['Bad', 'a/b'] })],
  ['answers an empty list', () => ({ topics: [] })],
]) {
  test(`a scout that ${name} never calls find, and the design goes on with empty skills`, async () => {
    const run = await go(ARGS, { 'skill-scout': scout })
    assert.equal(run.error, null, run.error && run.error.stack)
    assert.equal(run.result.status, 'approved')
    assert.equal(findOf(run), undefined, 'find never runs')
    assert.deepEqual(run.result.skills, { installed: [], rejected: [], pending: [] })
    assert.ok(run.logs.some((line) => /^skills: /.test(line)), run.logs.join('\n'))
  })
}


