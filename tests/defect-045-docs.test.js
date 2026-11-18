'use strict'

// Task 13 (spec 045, R11/R12/R17/R26/R27/R28/R29): the exception S in the four
// files, the A132 update, A134–A136, and the documents that repeat the rules.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const decisions = () => read('docs/decisions.md')
const row = (id) => decisions().split('\n').find((line) => line.startsWith(`| ${id} |`)) || ''

const S = 'An answer the harness reports as cut off or refused (a stop reason other than `end_turn`) stays pending for `aether-delegate verdict`.'
// The sentence each file keeps word for word, and that S follows.
const KEPT = {
  'plugins/aether/skills/using-aether/SKILL.md': "A read-only delegate whose checks pass is closed by the system when it answers; if its answer is wrong, `verdict --verdict fix|infeasible` reopens it; when a check fails on files another writer changed, `verdict --verdict approve --ignore '<glob>'`.",
  'docs/guide/delegates.md': 'A read-only delegate whose checks pass is closed by the system as approved when it answers, without a verdict;',
  'AGENTS.md': 'a read-only delegate whose checks pass is closed by the system as approved when it answers,',
}
const A132_KEPT = 'A read-only delegate whose checks pass is closed by the system as approved, without a verdict.'

test('R29: the exception of R3 is in the four files, each after the sentence it keeps', () => {
  for (const [file, kept] of Object.entries(KEPT)) {
    const text = read(file)
    assert.ok(text.includes(kept), `${file} keeps its own sentence`)
    assert.ok(text.includes(S), `${file} has S`)
    assert.ok(text.indexOf(S) > text.indexOf(kept), `${file}: S comes after the kept sentence`)
  }
  const a132 = row('A132')
  assert.ok(a132.includes(A132_KEPT), 'A132 keeps its title sentence')
  assert.ok(a132.includes(S) && a132.indexOf(S) > a132.indexOf(A132_KEPT))
  assert.ok(a132.includes('2026-11-17') && a132.includes('Trabaja autonomamente en hacer los de fallos.'))
  assert.ok(/agy.*codex.*muse/s.test(a132) && a132.includes('owner'))
})

test('R29: the sentence that tests pin in using-aether is whole, with S after it and not inside it', () => {
  const using = read('plugins/aether/skills/using-aether/SKILL.md')
  assert.ok(using.includes(KEPT['plugins/aether/skills/using-aether/SKILL.md'] + ' ' + S))
})

test('R11: A132 says what approve does before and after the merge', () => {
  const a132 = row('A132')
  assert.ok(a132.includes('AETHER-TESTS'), 'A132 names AETHER-TESTS')
  assert.ok(a132.includes('keeping the merge'), 'A132 keeps the merge when the tests fail')
  assert.ok(a132.includes('only for a task that named `AETHER-TESTS`'), 'the pre-merge test run exists only for a task with AETHER-TESTS')
  assert.equal(a132.includes('runs the task\'s tests before the merge'), false, 'no clause says tests run before the merge')
})

test('R12/R11: A134 amends A124 clause 5 with the owner words and records the Haiku map', () => {
  const a = row('A134')
  for (const t of ['A124', 'yo digo que subas los turnos', '100', '80', 'Haiku']) assert.ok(a.includes(t), t)
})

test('R17: A135 amends A129 and troubleshooting says Muse is read over muse serve', () => {
  const a = row('A135')
  for (const t of ['A129', 'muse serve', 'model/list', 'Sí, una sola consulta']) assert.ok(a.includes(t), t)
  const page = read('docs/guide/troubleshooting.md')
  assert.equal(page.includes('Muse has no capture means without a model call and is never read'), false)
  assert.ok(page.includes('muse serve'))
  const observe = read('docs/guide/observe.md')
  assert.equal(observe.includes('Muse has no capture means without a model call and is never read'), false)
  assert.ok(observe.includes('Muse is read over `muse serve` (`model/list`) with no model call and no quota'))
})

test('R11: troubleshooting links to the section below and tells the two marks apart', () => {
  const page = read('docs/guide/troubleshooting.md')
  assert.ok(page.includes('#the-harnesses-panel-says-quota-unavailable-or-enabled-not-installed'))
  assert.equal(/Quota unavailable` line above/.test(page), false)
  const sentence = page.split('\n').find((line) => line.includes('#the-harnesses-panel-says-quota-unavailable-or-enabled-not-installed')) || ''
  assert.ok(sentence.includes('below'), 'the sentence points below')
  assert.ok(sentence.includes('enabled, not installed') && sentence.includes('Quota unavailable'), 'the sentence names both marks')
  assert.ok(sentence.includes('CLI is missing') && sentence.includes('no reading'), 'the sentence tells CLI missing from CLI present with no reading')
})

test('R26: A136 amends A125 clause 2 with both owner quotes', () => {
  const a = row('A136')
  for (const t of ['A125', 'Repartir e instalar', 'nuevamente no veo que el lead instale skills por su propia cuenta', 'trusted', 'intent.md']) assert.ok(a.includes(t), t)
})

test('R27: the decision range is A1–A137 in the index and in both pins', () => {
  for (const f of ['docs/index.md', 'tests/docs-032.test.js', 'tests/docs-facts.test.js']) assert.ok(read(f).includes('A1–A137'), f)
})

test('R28: the hole of agy, codex and muse is written down for the owner', () => {
  const a132 = row('A132')
  assert.ok(a132.includes('owner'), 'A132 names the owner')
  assert.ok(/agy.*codex.*muse/s.test(a132), 'A132 names the three harnesses with no stop reason')
  assert.ok(a132.includes("that hole is the owner's to decide"), 'A132 leaves the hole to the owner, as an open choice')
  for (const id of ['A134', 'A135', 'A136']) assert.ok(row(id), `${id} is recorded`)
})
