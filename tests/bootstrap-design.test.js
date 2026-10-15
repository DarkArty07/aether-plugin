'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const FILE = path.join(PLUGIN, 'skills', 'using-aether', 'SKILL.md')
const BOOTSTRAP = fs.readFileSync(FILE, 'utf8')
const SCOPE = 'Deliver what was asked, at the scope asked. When that work is done and checked, stop and report. Do not add features, tests, files, docs or refactors that were not asked for. If you think one would help, say so at the end instead of doing it.'
const designing = () => {
  const start = BOOTSTRAP.indexOf('\n## Designing\n')
  assert.ok(start >= 0, 'the bootstrap has Designing')
  const rest = BOOTSTRAP.slice(start + 1)
  const end = rest.indexOf('\n## ', 1)
  return end < 0 ? rest : rest.slice(0, end)
}

test('the bootstrap sends the Lead to /aether:design, and no longer describes the rounds or the exit codes (C1)', () => {
  const section = designing()
  for (const text of ['`/aether:design`', 'You decide no round, and you start no seat', 'At most two revisions per document', '"session": "<CLAUDE_CODE_SESSION_ID>"', '"mode": "short"']) assert.ok(section.includes(text), text)
  for (const gone of ['aether-lane seat', 'Exit 3', 'Exit 4', 'Exit 1', 'SendMessage', 'sameModelAsAuthor', '## Writing and judging', '## The design seats']) assert.ok(!BOOTSTRAP.includes(gone), `gone: ${gone}`)
})

test('the Lead asks at most five questions, writes the card, and acts on each of the four results (R4, R5, R14)', () => {
  const section = designing()
  for (const text of ['at most five questions, one at a time', 'hard to reverse, surprising, or a real trade-off', '`specs/NNN-<topic>/intent.md`', 'Only you write the card: aether-guard refuses every other writer', "the owner's words, quoted as they said them", 'what is out', 'the answers to the clarifying questions', '- `approved`:', '- `clarify`:', '- `dispute`:', '- `failed`:', 'take the reversible side of each as an assumption, put the question in "Espera tu sí"', 'Never override the Judge silently', '**Later changes.**', 'a fix after a stop at the plan stage', 'A changed plan gets a new exam', 'an approved spec is never rewritten']) {
    assert.ok(section.includes(text), text)
  }
})

test('the procedure of a run is in the skill, and what holds outside a run stays here (C4)', () => {
  for (const gone of ['aether-autonomy start --quote', '**Permission prompts.**', '**The diary,**', '**Keep going.**', '**Ceilings.**', '**Cost.**', '**Honest stop.**', '**Resuming.**', '**An unreadable run state.**', '# Brief: <run id>', '- Delegación: <llamadas']) assert.ok(!BOOTSTRAP.includes(gone), `moved: ${gone}`)
  for (const kept of ['aether-autonomy check <class>', 'aether-autonomy grant --class <class> --quote', '--scope session', '**Repetition.**', '**Recording the owner\'s authorizations', '| `merge-main` |', 'Outside a run the brief is short', '.aether/pending.jsonl', 'load the `aether:autonomous-runs` skill and follow it', 'session start says a run is open']) assert.ok(BOOTSTRAP.includes(kept), `stays: ${kept}`)
  assert.ok(fs.existsSync(path.join(PLUGIN, 'skills', 'autonomous-runs', 'SKILL.md')))
})

test('the bootstrap carries the scope instruction and weighs less than the 29,470 bytes of 0.10.0 (R10, C4)', () => {
  assert.ok(BOOTSTRAP.includes(SCOPE))
  assert.ok(fs.statSync(FILE).size < 29470, `${fs.statSync(FILE).size} bytes`)
})
