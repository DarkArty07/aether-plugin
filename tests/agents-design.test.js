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

// The rules for a check on prose (#99) live in the Examiner's file only: the design workflow's message does not repeat
// them (tests/workflow-design.test.js), and an external seat gets the file as its role body.
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

test('the Judge lists everything in round one, and from round two on answers for each earlier finding (#103)', () => {
  has('judge', [
    'list every finding you can find',
    'Do not stop at the first few',
    'Answer for each finding of that list whether it is resolved or still open',
    'a finding you leave unanswered counts as still open',
    'Add a new finding only when the revision introduced it or you could not have seen it before',
  ])
})

test('the Writer, the tasks skill and the Judge document and check the Skills field on tasks (R9, C4)', () => {
  const writer = agent('writer')
  const planRulesStart = writer.indexOf('## Aether plan rules')
  const planRulesEnd = writer.indexOf('## Your answer', planRulesStart)
  assert.ok(planRulesStart >= 0 && planRulesEnd > planRulesStart, 'writer.md has ## Aether plan rules')
  const planRules = writer.slice(planRulesStart, planRulesEnd)
  for (const text of ['- **Skills** is optional', '`- Skills:', 'at most 3']) {
    assert.ok(planRules.includes(text), `writer.md Aether plan rules has: ${text}`)
  }
  const step6 = agent('judge').split('\n').find((line) => line.startsWith('6. On a plan with its tasks'))
  assert.ok(step6, 'judge.md has step 6 for reviewing a plan with its tasks')
  assert.ok(step6.includes('`- Skills:`') && step6.includes('at most 3 skills per task'), 'judge.md checks Skills in step 6')
  const section3 = (text, label) => {
    const start = text.indexOf('3. Write each task section in this order.')
    const end = text.indexOf('\n4. ', start)
    assert.ok(start >= 0 && end > start, `${label} has step 3`)
    return text.slice(start, end)
  }
  const tasksStep3 = section3(fs.readFileSync(path.join(PLUGIN, 'skills', 'tasks', 'SKILL.md'), 'utf8'), 'tasks/SKILL.md')
  const speckitStep3 = section3(fs.readFileSync(path.join(PLUGIN, 'speckit', 'commands', 'speckit.tasks.md'), 'utf8'), 'speckit.tasks.md')
  assert.ok(tasksStep3.includes('**Skills:**') && tasksStep3.includes('- Skills:'))
  assert.ok(speckitStep3.includes('**Skills:**') && speckitStep3.includes('- Skills:'))
})
