'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, makeRepo, tempDir, writePlan, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

function skill(root, name, body = 3) {
  const dir = path.join(root, '.agents', 'skills', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), ['---', `name: ${name}`, 'description: Use for the work.', '---', ...Array.from({ length: body }, (_, i) => `rule ${i + 1} of ${name}`)].join('\n') + '\n')
}
const withSkills = (n, names) => task(n).replace(/- Depends on: none\n/, `- Depends on: none\n- Skills: ${names}\n`)
function setup(t) {
  const repo = makeRepo(t)
  return { repo, home: tempDir(t, 'aether-home-'), data: tempDir(t, 'aether-data-') }
}
const env = (w) => ({ HOME: w.home, AETHER_DATA_DIR: w.data, CLAUDE_CODE_SESSION_ID: 'sess-1' })

test('check rejects more than 3 skills and a skill that does not exist, and a plan without the field is as before (R28, H3 scenario 23)', (t) => {
  const w = setup(t)
  for (const name of ['erebus-ui', 'patron-api', 'three', 'four']) skill(w.repo.dir, name)
  const four = runBin(PLAN_BIN, ['check', writePlan(w.repo.dir, plan([withSkills(1, 'erebus-ui, patron-api, three, four')]))], w.repo.dir, env(w))
  assert.equal(four.status, 1)
  assert.ok(JSON.stringify(four.json).includes('Task 1: Skills lists 4 skills (at most 3).'), four.stdout)
  const ghost = runBin(PLAN_BIN, ['check', writePlan(w.repo.dir, plan([withSkills(1, 'erebus-ui, ghost')]))], w.repo.dir, env(w))
  assert.equal(ghost.status, 1)
  assert.ok(JSON.stringify(ghost.json).includes('Task 1: skill \\"ghost\\" does not exist.'), ghost.stdout)
  const ok = runBin(PLAN_BIN, ['check', writePlan(w.repo.dir, plan([withSkills(1, 'erebus-ui, patron-api')]))], w.repo.dir, env(w))
  assert.equal(ok.status, 0, ok.stdout)
  assert.equal(runBin(PLAN_BIN, ['check', writePlan(w.repo.dir, plan([task(1)]))], w.repo.dir, env(w)).status, 0)
})

test('compile writes AETHER-SKILLS and the content of the skills in the brief of the unit and one line of uses.jsonl, for the swarm and the external lanes (C10, R45, H3 scenario 22)', (t) => {
  const w = setup(t)
  skill(w.repo.dir, 'erebus-ui')
  skill(w.repo.dir, 'patron-api')
  const r = runBin(PLAN_BIN, ['compile', writePlan(w.repo.dir, plan([withSkills(1, 'erebus-ui, patron-api'), task(2)]))], w.repo.dir, env(w))
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const brief = fs.readFileSync(r.json.tasks['task-1'].brief, 'utf8')
  assert.match(brief, /^- AETHER-SKILLS: erebus-ui, patron-api$/m)
  assert.ok(brief.indexOf('## Skills for this task') < brief.indexOf('## Task'))
  assert.ok(brief.includes('rule 1 of erebus-ui') && brief.includes('rule 3 of patron-api'))
  const plain = fs.readFileSync(r.json.tasks['task-2'].brief, 'utf8')
  assert.ok(!plain.includes('AETHER-SKILLS') && !plain.includes('## Skills for this task'))
  const uses = fs.readFileSync(path.join(w.data, 'skills', 'uses.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(uses.length, 1)
  assert.deepEqual([uses[0].session, uses[0].kind, uses[0].run, uses[0].task, uses[0].skills], ['sess-1', 'run', r.json.runId, 'task-1', ['erebus-ui', 'patron-api']])
})

test('compile refuses a skill that is missing or too many, with the message of the problem, and writes no brief for it (R28)', (t) => {
  const w = setup(t)
  skill(w.repo.dir, 'erebus-ui')
  const r = runBin(PLAN_BIN, ['compile', writePlan(w.repo.dir, plan([withSkills(1, 'erebus-ui, ghost')]))], w.repo.dir, env(w))
  assert.equal(r.status, 1)
  assert.ok(r.stdout.includes('skill \\"ghost\\" does not exist'))
  assert.equal(fs.existsSync(path.join(w.data, 'skills', 'uses.jsonl')), false)
})

test('the skills of the members of a unit that builds several tasks together are the union of theirs (R45)', (t) => {
  const w = setup(t)
  for (const name of ['a1', 'a2']) skill(w.repo.dir, name)
  const md = plan([withSkills(1, 'a1').replace('- Depends on: none\n', '- Depends on: none\n- Merges with: Task 2\n'), withSkills(2, 'a1, a2')])
  const r = runBin(PLAN_BIN, ['compile', writePlan(w.repo.dir, md)], w.repo.dir, env(w))
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const unit = Object.values(r.json.tasks)[0]
  assert.match(fs.readFileSync(unit.brief, 'utf8'), /^- AETHER-SKILLS: a1, a2$/m)
})
