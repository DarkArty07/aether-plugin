'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const sb = require('../plugins/aether/lib/skill-brief.js')

function skill(root, name, { body = 5, description = 'Use for the work.', frontName = name, where = '.agents/skills' } = {}) {
  const dir = path.join(root, where, name)
  fs.mkdirSync(dir, { recursive: true })
  const front = ['---', `name: ${frontName}`, ...(description === null ? [] : [`description: ${description}`]), '---']
  fs.writeFileSync(path.join(dir, 'SKILL.md'), [...front, ...Array.from({ length: body }, (_, i) => `rule ${i + 1} of ${name}`)].join('\n') + '\n')
  return dir
}
function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const plugin = tempDir(t, 'aether-plugin-')
  return { repo, home, plugin, opts: { cwd: repo.dir, home, pluginRoot: plugin } }
}

test('parseSkillNames reads commas or spaces, drops repeats and the label (R27)', () => {
  assert.deepEqual(sb.parseSkillNames('AETHER-SKILLS: erebus-ui, patron-api'), ['erebus-ui', 'patron-api'])
  assert.deepEqual(sb.parseSkillNames('Skills: erebus-ui patron-api erebus-ui'), ['erebus-ui', 'patron-api'])
  assert.deepEqual(sb.parseSkillNames('erebus-ui,patron-api'), ['erebus-ui', 'patron-api'])
  assert.deepEqual(sb.parseSkillNames(''), [])
  assert.deepEqual(sb.parseSkillNames('AETHER-SKILLS:'), [])
})

test('resolveSkill looks in the project, then the personal folders, then Aether, and refuses a name that leaves the folder (R27)', (t) => {
  const w = world(t)
  skill(w.repo.dir, 'both', { body: 1 })
  skill(w.repo.dir, 'both', { body: 2, where: '.claude/skills' })
  skill(w.home, 'both', { body: 3 })
  skill(w.home, 'personal', { where: '.claude/skills' })
  skill(w.plugin, 'tidy', { where: 'skills' })
  assert.equal(sb.resolveSkill('both', w.opts).dir, path.join(w.repo.dir, '.agents', 'skills', 'both'))
  assert.equal(sb.resolveSkill('personal', w.opts).dir, path.join(w.home, '.claude', 'skills', 'personal'))
  assert.equal(sb.resolveSkill('aether:tidy', w.opts).dir, path.join(w.plugin, 'skills', 'tidy'))
  assert.equal(sb.resolveSkill('tidy', w.opts).dir, path.join(w.plugin, 'skills', 'tidy'))
  for (const bad of ['nope', '../x', 'a/b', '', '..']) assert.equal(sb.resolveSkill(bad, w.opts), null, bad)
})

test('loadSkills gives the content of 0, 1 and 3 skills, and says the problem of 4, of one that does not exist and of one that is too big (C10, H3 scenario 23)', (t) => {
  const w = world(t)
  for (const name of ['one', 'two', 'three', 'four']) skill(w.repo.dir, name)
  skill(w.repo.dir, 'big', { body: 600 })
  assert.deepEqual(sb.loadSkills([], w.opts), { ok: true, skills: [] })
  const one = sb.loadSkills(['one'], w.opts)
  assert.equal(one.ok, true)
  assert.ok(one.skills[0].text.includes('rule 1 of one') && one.skills[0].lines >= 6)
  assert.equal(sb.loadSkills(['one', 'two', 'three'], w.opts).skills.length, 3)
  assert.deepEqual(sb.loadSkills(['one', 'two', 'three', 'four'], w.opts), { ok: false, error: 'too many skills: 4 (at most 3)' })
  assert.deepEqual(sb.loadSkills(['one', 'ghost'], w.opts), { ok: false, error: 'skill "ghost" does not exist' })
  const big = sb.loadSkills(['big'], w.opts)
  assert.equal(big.ok, false)
  assert.match(big.error, /^skill "big" is invalid: SKILL\.md has 60\d lines \(at most 500\)$/)
})

test('three skills of 500 lines are over the total that is pasted, and an invalid name or description is refused, never cut (A7, C10)', (t) => {
  const w = world(t)
  for (const name of ['a1', 'a2', 'a3']) skill(w.repo.dir, name, { body: 496 })
  const over = sb.loadSkills(['a1', 'a2', 'a3'], w.opts)
  assert.equal(over.ok, false)
  assert.match(over.error, /^the skills total \d+ lines \(at most 1500\)$/)
  for (const name of ['b1', 'b2', 'b3']) skill(w.repo.dir, name, { body: 480 })
  assert.equal(sb.loadSkills(['b1', 'b2', 'b3'], w.opts).ok, true)
  skill(w.repo.dir, 'Bad_Name', { frontName: 'Bad_Name' })
  assert.match(sb.loadSkills(['Bad_Name'], w.opts).error, /is invalid: the name "Bad_Name" is not lowercase letters, digits and dashes of at most 64 characters/)
  skill(w.repo.dir, 'wrong', { frontName: 'other-name' })
  assert.match(sb.loadSkills(['wrong'], w.opts).error, /is invalid: the name "other-name" is not the name of its folder "wrong"/)
  skill(w.repo.dir, 'nodesc', { description: null })
  assert.match(sb.loadSkills(['nodesc'], w.opts).error, /is invalid: no description/)
  skill(w.repo.dir, 'longdesc', { description: 'd'.repeat(1025) })
  assert.match(sb.loadSkills(['longdesc'], w.opts).error, /is invalid: the description has 1025 characters \(at most 1024\)/)
})

test('checkSkillFile lists every problem of a skill, and nothing for a good one (R32)', (t) => {
  const w = world(t)
  assert.deepEqual(sb.checkSkillFile(skill(w.repo.dir, 'good')), [])
  const bad = sb.checkSkillFile(skill(w.repo.dir, 'bad', { body: 600, description: null, frontName: 'Other' }))
  assert.equal(bad.length, 4)
})

test('skillsSection pastes each skill under its own heading, and nothing without skills (R27)', () => {
  assert.equal(sb.skillsSection([]), '')
  const text = sb.skillsSection([{ name: 'erebus-ui', text: 'RULES A\n' }, { name: 'patron-api', text: 'RULES B' }])
  assert.equal(text, '## Skills for this task\n\n### erebus-ui\n\nRULES A\n\n### patron-api\n\nRULES B\n\n')
})

test('recordUse only appends one line with the time, the session, the kind, the run, the task and the skills (R29)', (t) => {
  const data = tempDir(t, 'aether-data-')
  assert.equal(sb.recordUse(data, { session: 's1', kind: 'run', run: '20261107-120000-abcd', task: 'task-3', skills: ['erebus-ui'], time: 7 }), true)
  assert.equal(sb.recordUse(data, { session: 's1', kind: 'delegate', task: 't1', skills: ['a', 'b'], time: 8 }), true)
  const lines = fs.readFileSync(sb.usesFile(data), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual(lines, [
    { time: 7, session: 's1', kind: 'run', run: '20261107-120000-abcd', task: 'task-3', skills: ['erebus-ui'] },
    { time: 8, session: 's1', kind: 'delegate', run: null, task: 't1', skills: ['a', 'b'] },
  ])
})

test('listProjectSkills, formatProjectSkills and matchDelegateSkills discover and match project skills without a model (R8, R15, C4, C7)', (t) => {
  const dir = tempDir(t, 'aether-proj-skills-')
  const a = path.join(dir, '.agents', 'skills', 'diseno-de-juego')
  const b = path.join(dir, '.claude', 'skills', 'direccion-de-arte')
  fs.mkdirSync(a, { recursive: true })
  fs.mkdirSync(b, { recursive: true })
  fs.writeFileSync(path.join(a, 'SKILL.md'), '---\nname: diseno-de-juego\ndescription: Balance de economia, niveles y combate del juego\n---\nbody\n')
  fs.writeFileSync(path.join(b, 'SKILL.md'), '---\nname: direccion-de-arte\ndescription: Paleta, tipografia y composicion visual\n---\nbody\n')

  const skills = sb.listProjectSkills(dir)
  assert.deepEqual(skills.map((s) => s.name), ['direccion-de-arte', 'diseno-de-juego'])
  assert.equal(
    sb.formatProjectSkills(skills),
    [
      '## Project skills',
      '',
      'Available project skills in this repository (use `- Skills: <name>` in tasks where one applies, at most 3 per task):',
      '- `direccion-de-arte`: Paleta, tipografia y composicion visual',
      '- `diseno-de-juego`: Balance de economia, niveles y combate del juego',
    ].join('\n'),
  )
  assert.equal(sb.formatProjectSkills([]), '')
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Ajusta el balance de economia y combate del juego', description: 'balance', owns: ['src/game.js'] }),
    ['diseno-de-juego'],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Actualiza el parser de JSON', description: 'parser', owns: ['src/json.js'] }),
    [],
  )
})
