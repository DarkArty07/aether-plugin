'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const SCOPE = 'Deliver what was asked, at the scope asked. When that work is done and checked, stop and report. Do not add features, tests, files, docs or refactors that were not asked for. If you think one would help, say so at the end instead of doing it.'
const agent = (name) => fs.readFileSync(path.join(PLUGIN, 'agents', `${name}.md`), 'utf8')
const has = (name, texts) => texts.forEach((text) => assert.ok(agent(name).includes(text), `${name} has: ${text}`))

test('the Writer, the Judge and the Examiner carry the scope instruction (R10)', () => {
  for (const name of ['writer', 'judge', 'examiner']) has(name, [SCOPE])
})

test('the Judge types every finding and counts what is beyond the intent as a defect (R9)', () => {
  has('judge', [
    '[blocking | major | minor] [missing | extra | wrong] <title> — <evidence> — <fix>',
    '## Finding types',
    '**missing**',
    '**extra**',
    '**wrong**',
    "What goes beyond the owner's intent is a defect, as much as what is missing.",
    "On a spec, check that each criterion comes from the owner's words in the intent card (`intent.md`).",
    'check each row of the Complexity table',
    'duplicates, ambiguity, requirements without a measure, and contradictions',
  ])
})

test('the Writer starts at high (R11), writes the spec from the card, and ties each task to a requirement', () => {
  assert.match(agent('writer'), /^effort: high$/m)
  has('writer', ["When the message asks you to revise a document after the Judge's verdict", '`specs/NNN-<topic>/intent.md`', 'load the skill `aether:specify`', 'skip its steps 1 and 2', '## Gate', '## Complexity', '`- Serves: R1, R3`', 'disagreements', '**Aether:**', '`aether:plan`'])
})

test('the final reviewer marks what is extra, and keeps the rest of its method (R12, R13)', () => {
  has('reviewer', ['- **Extra:** features nobody asked for, or over-engineering.', '**Plan alignment:**', '**Integration:**', '**Code quality:**', '**Evidence:**', '## Declined to judge', 'Return the structured report the workflow asks for'])
  assert.match(agent('reviewer'), /^effort: high$/m)
})

// The rules for a check on prose (#99): the Examiner's file and the message it gets say the same words.
const PROSE_RULES = [
  'tolerant of markdown',
  'bold, backticks, line breaks, plural and inflected forms',
  'compare on the text with the markup stripped',
  'any line or sentence of the document',
  'never the first line that matches',
  'which of its checks are about wording',
]

test('the Examiner checks prose tolerant of its markup, in any line, and names its wording checks in notes (#99)', () => {
  has('examiner', PROSE_RULES)
})

test('the Judge names the inputs its helpers are assumed to return, in the plan review (#91)', () => {
  has('judge', ['the inputs it assumes its helpers return', '`makeRepo` returns `{ dir, git }`, not a path'])
})

test('the Judge names the existing tests each task touches, and flags a task that contradicts one (#92)', () => {
  has('judge', ['the existing tests that exercise the files the task changes', 'a task whose brief contradicts one of them'])
})
