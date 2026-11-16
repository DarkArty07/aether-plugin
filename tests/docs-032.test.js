'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const RULES = ['plugins/aether/skills/using-aether/SKILL.md', 'plugins/aether/skills/swarm/SKILL.md', 'docs/guide/delegates.md', 'AGENTS.md']
const OLD = /corrections? (of|per|on|for) (the|each|its|a|every) (step|rung|model)|corrections of (its|the|each) step|the same findings (return|come back)|spent its corrections|at the step's correction effort|rise only after the step/i

test('the Lead\'s rules, the swarm skill, the delegates guide and AGENTS.md describe the ladder of the law, and no longer the corrections per model (R16)', () => {
  for (const file of RULES) assert.doesNotMatch(read(file), OLD, file)
  assert.match(read('docs/guide/delegates.md'), /Pareto/)
  assert.match(read('plugins/aether/skills/swarm/SKILL.md'), /Sonnet `high`.*Opus `high`.*Opus `xhigh`/is)
})

test('decision A121 is recorded with the owner\'s words, and the index names the range (R16)', () => {
  const decisions = read('docs/decisions.md')
  assert.match(decisions, /^\| A121 \|/m)
  assert.match(decisions, /como lo trasladamos como ley o puntaje o regla o benchmark/)
  assert.match(decisions, /Decided 2026-11-10; spec 032/)
  assert.match(read('docs/index.md'), /A1–A131/)
})

test('the changelog has the Pareto ladder entry for version 0.37.0 (R16)', () => {
  const changelog = read('docs/changelog.md')
  assert.match(changelog, /Pareto/)
  assert.match(changelog.split('\n').find((line) => line.startsWith('Version 0.37.0: ')), /^Version 0\.37\.0:/)
  assert.match(changelog, /AETHER_PAIRS_CONFIG/)
  assert.match(changelog, /codeCostPerTaskUsd/)
  assert.match(changelog, /codeMinutesPerTask/)
  assert.match(changelog, /codeChecked/)
  assert.match(changelog, /loadPairs/)
})

test('the repetition rule in using-aether describes the ladder rungs and repeated causes, not corrections or after Opus', () => {
  const skill = read('plugins/aether/skills/using-aether/SKILL.md')
  const repetition = skill.slice(skill.indexOf('**Repetition.**'), skill.indexOf('\n\n**Every brief,**'))
  assert.doesNotMatch(repetition, /correction/i, 'repetition has no correction')
  assert.doesNotMatch(repetition, /after Opus\b/i, 'repetition does not say after Opus')
  assert.match(repetition, /Opus `xhigh`/)
  assert.match(repetition, /fifth|last rung/i)
  assert.match(repetition, /two attempts/i)
})

test('methodology.md and roadmap.md no longer describe the old climb by correction and rise (R16)', () => {
  for (const file of ['docs/methodology.md', 'docs/roadmap.md']) {
    assert.doesNotMatch(read(file), /a correction raises the effort|a rise lands on the next model/i, file)
  }
  assert.doesNotMatch(read('docs/roadmap.md'), /runs again at `xhigh`; on Sonnet and Opus/i)
  assert.match(read('docs/roadmap.md'), /The default is `high` on every model/)
})

test('the texts say the refresh reads every row with a page, writes their figures together, and still does not save the ladder (spec 036 R9)', () => {
  assert.match(read('AGENTS.md'), /model pages/)
  assert.match(read('AGENTS.md'), /every row with a page/)
  assert.match(read('AGENTS.md'), /does not save it/)
  assert.doesNotMatch(read('docs/contributing.md'), /part 2/)
  assert.match(read('docs/contributing.md'), /every row with a page/)
  assert.match(read('docs/contributing.md'), /does not save it/)
  assert.doesNotMatch(read('docs/reference/artificial-analysis.md'), /`scripts\/refresh-lanes\.js` and `scripts\/build-models-index\.js` are the only code that asks the API/)
  assert.doesNotMatch(read('docs/reference/artificial-analysis.md'), /part 2/)
  assert.match(read('docs/reference/artificial-analysis.md'), /model pages/)
  assert.match(read('docs/reference/artificial-analysis.md'), /does not save it/)
  assert.match(read('docs/guide/lanes.md'), /every row with a page/)
  assert.match(read('docs/guide/lanes.md'), /never saves it/)
})

test('the decision of spec 038 is recorded with the owner\'s words, and the index names its number (C1, C7)', () => {
  const decisions = read('docs/decisions.md')
  const row = decisions.split('\n').find((line) => /^\| A\d+ \|/.test(line) && line.includes('ya no quiero usar la API de AA no sirve'))
  assert.ok(row, 'a numbered decision quotes the owner on the API')
  for (const phrase of ['leeremos la pagina directamente', 'hydrogen esta pensnaod para reemplazar a 3.8 flash', 'Decided 2026-11-13; spec 038']) assert.ok(row.includes(phrase), phrase)
  assert.match(row, /Hydrogen/)
  assert.match(row, /code/i)
  const number = row.match(/^\| (A\d+) \|/)[1].slice(1)
  // The index names the whole range: it reaches this decision, and each later decision moves its end (A127 did).
  const last = Number(read('docs/index.md').match(/A1–A(\d+)\b/)[1])
  assert.ok(last >= Number(number), `the index names A1–A${last}, which reaches A${number}`)
})
