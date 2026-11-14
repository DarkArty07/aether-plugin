'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const reg = require('../plugins/aether/lib/skill-registry.js')

const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }
const EXTERNAL = { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } }
const GROK = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high', group: 'grok' }

function skill(root, name, body = 3) {
  const dir = path.join(root, '.agents', 'skills', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), ['---', `name: ${name}`, 'description: Use for the work.', '---', ...Array.from({ length: body }, (_, i) => `rule ${i + 1} of ${name}`)].join('\n') + '\n')
}
function world(t, { settings = NATIVE, pick = null } = {}) {
  const dataDir = tempDir(t, 'aether-data-')
  const cwd = tempDir(t, 'aether-cwd-')
  const home = tempDir(t, 'aether-home-')
  let n = 0
  const deps = { dataDir, cwd, home, now: () => 1000 + (n += 1), settings, newId: () => `gen-${n}`, pickPair: async () => ({ pick, quota: [] }) }
  return { dataDir, cwd, deps }
}
const call = (prompt) => ({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt } })
const BRIEF = (id, skills) => `AETHER-TASK: ${id}\n${skills === undefined ? '' : `AETHER-SKILLS: ${skills}\n`}Do the work.`
const entries = (dataDir, id) => log.readEntries(dataDir, { task: id })
const uses = (dataDir) => (fs.existsSync(path.join(dataDir, 'skills', 'uses.jsonl')) ? fs.readFileSync(path.join(dataDir, 'skills', 'uses.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])

test('parseBrief reads the skills of the first AETHER-SKILLS line (R27)', () => {
  assert.deepEqual(task.parseBrief('AETHER-TASK: t1\nAETHER-SKILLS: erebus-ui, patron-api\nAETHER-SKILLS: other\nbody').skills, ['erebus-ui', 'patron-api'])
  assert.deepEqual(task.parseBrief('AETHER-TASK: t1\nbody').skills, [])
})

test('a task with two skills gets their content in its brief, in the launch record and in the uses record (C10, R29, H3 scenario 22)', async (t) => {
  const w = world(t)
  skill(w.cwd, 'erebus-ui')
  skill(w.cwd, 'patron-api')
  const plan = await task.begin(call(BRIEF('t1', 'erebus-ui, patron-api')), w.deps)
  assert.equal(plan.kind, 'first')
  assert.ok(plan.args.prompt.includes('## Skills for this task') && plan.args.prompt.includes('rule 1 of erebus-ui') && plan.args.prompt.includes('rule 3 of patron-api'))
  assert.ok(plan.args.prompt.startsWith('AETHER-TASK: t1'))
  const launch = entries(w.dataDir, 't1').find((e) => e.kind === 'launch')
  assert.deepEqual(launch.skills, ['erebus-ui', 'patron-api'])
  assert.deepEqual(uses(w.dataDir).map((u) => [u.session, u.kind, u.task, u.skills]), [['s1', 'delegate', 't1', ['erebus-ui', 'patron-api']]])
})

test('the same content reaches an external harness, in its brief file (C10, R29)', async (t) => {
  const w = world(t, { settings: EXTERNAL, pick: GROK })
  skill(w.cwd, 'erebus-ui')
  const plan = await task.begin(call(`${BRIEF('t2', 'erebus-ui')}\nAETHER-OWNS: src/**`), w.deps)
  assert.ok(plan.external)
  const briefs = path.join(w.dataDir, 'delegates', 'briefs')
  const text = fs.readFileSync(path.join(briefs, fs.readdirSync(briefs)[0]), 'utf8')
  assert.ok(text.includes('## Skills for this task') && text.includes('rule 2 of erebus-ui'))
})

test('a task without skills is as before: the call is not changed and nothing is recorded (R29)', async (t) => {
  const w = world(t)
  const plan = await task.begin(call(BRIEF('t3')), w.deps)
  assert.equal(plan.args.prompt, undefined)
  assert.equal(entries(w.dataDir, 't3').find((e) => e.kind === 'launch').skills, undefined)
  assert.deepEqual(uses(w.dataDir), [])
})

test('four skills, a skill that does not exist and a skill that is too big are not launched, and the message says which problem it is (R29, H3 scenario 23)', async (t) => {
  const w = world(t)
  for (const name of ['a', 'b', 'c', 'd']) skill(w.cwd, name)
  skill(w.cwd, 'big', 600)
  const cases = [['four', 'a, b, c, d', 'too many skills: 4 (at most 3)'], ['ghost', 'a, ghost', 'skill "ghost" does not exist'], ['big', 'big', 'has 60']]
  for (const [id, skills, text] of cases) {
    const plan = await task.begin(call(BRIEF(id, skills)), w.deps)
    assert.equal(plan.kind, 'refused', id)
    assert.ok(plan.args.prompt.startsWith(`Aether delegate task ${id} was not launched: `) && plan.args.prompt.includes(text) && plan.args.prompt.endsWith('Fix the AETHER-SKILLS line and call again.'), plan.args.prompt)
    assert.equal(entries(w.dataDir, id).find((e) => e.kind === 'launch').launchKind, 'refused')
  }
  assert.deepEqual(uses(w.dataDir), [])
})

test('a rise that repeats the AETHER-SKILLS line pastes the same skills again (R29)', async (t) => {
  const w = world(t)
  skill(w.cwd, 'erebus-ui')
  await task.begin(call(BRIEF('t4', 'erebus-ui')), w.deps)
  await task.verdict({ task: 't4', verdict: 'fix', findings: ['src/a.js:3: the empty case is missing'] }, w.deps)
  const again = await task.begin(call(BRIEF('t4', 'erebus-ui')), w.deps)
  assert.equal(again.kind, 'rise')
  assert.ok(again.args.prompt.includes('rule 1 of erebus-ui') && again.args.prompt.includes('## Findings to fix'))
})

test('aether-delegate begin without AETHER-SKILLS suggests a matching project skill in notes without changing the brief (R15, R16, C7)', async (t) => {
  const w = world(t)
  skill(w.cwd, 'diseno-de-juego')
  const plan = await task.begin(call('AETHER-TASK: d-sug\nAjusta el diseno y balance del juego en src/game.js.'), w.deps)
  assert.equal(plan.kind, 'first')
  assert.ok(plan.notes.some((n) => n.includes('project skill(s) diseno-de-juego') && n.includes('AETHER-SKILLS: diseno-de-juego')), plan.notes.join('\n'))
  assert.equal(plan.args.prompt, undefined, 'the call is not changed')
  assert.equal(entries(w.dataDir, 'd-sug').find((e) => e.kind === 'launch').skills, undefined)
  assert.deepEqual(reg.readNotices(w.dataDir).map((n) => [n.kind, n.name]), [['delegate-skill', 'diseno-de-juego']])

  const other = await task.begin(call('AETHER-TASK: d-none\nActualiza el parser de JSON en src/json.js.'), w.deps)
  assert.equal(other.notes.some((n) => n.includes('diseno-de-juego')), false)
})

test('delegate skill use persists the canonical project and only usage metadata', async (t) => {
  const w = world(t)
  const repo = makeRepo(t)
  w.deps.cwd = repo.dir
  skill(repo.dir, 'project-skill')
  const plan = await task.begin(call(BRIEF('repo-use', 'project-skill')), w.deps)
  assert.equal(plan.kind, 'first')
  const records = reg.readUses(w.dataDir)
  assert.deepEqual(records, [{ time: records[0].time, session: 's1', kind: 'delegate', run: null, task: 'repo-use', skills: ['project-skill'], repo: repo.dir }])
})

test('a brief that already names its skills gets no suggestion (R15)', async (t) => {
  const w = world(t)
  skill(w.cwd, 'diseno-de-juego')
  const plan = await task.begin(call('AETHER-TASK: d-has\nAETHER-SKILLS: diseno-de-juego\nAjusta el diseno y balance del juego en src/game.js.'), w.deps)
  assert.equal(plan.kind, 'first')
  assert.equal(plan.notes.some((n) => n.includes('project skill(s)')), false, plan.notes.join('\n'))
  assert.deepEqual(reg.readNotices(w.dataDir), [])
})

test('a suggestion from the AETHER-OWNS paths is stored with the canonical project and leaves the skills line out (R15, R16, C7)', async (t) => {
  const w = world(t)
  const repo = makeRepo(t)
  w.deps.cwd = repo.dir
  skill(repo.dir, 'juego-motor')
  const plan = await task.begin(call('AETHER-TASK: d-owns\nAETHER-OWNS: src/juego/motor.js\nRevisa el archivo.'), w.deps)
  assert.equal(plan.kind, 'first')
  assert.ok(plan.notes.some((n) => n.includes('project skill(s) juego-motor') && n.includes('AETHER-SKILLS: juego-motor')), plan.notes.join('\n'))
  assert.equal((plan.args.prompt ?? '').includes('AETHER-SKILLS'), false, 'the brief gets no skills line from the suggestion')
  assert.deepEqual(reg.readNotices(w.dataDir).map((n) => [n.kind, n.name, n.session, n.repo]), [['delegate-skill', 'juego-motor', 's1', repo.dir]])
})
