'use strict'
// Task 15 (#215, R14-R17): agent texts ask only for what is read.
// An agent text must not ask for an output that no response-schema field
// receives, must source or drop unsourced figures, and must present turn
// budgets as guidance, never as a limit.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')
const schemas = require('../plugins/aether/lib/lane-schemas.js')

const agent = (name) => fs.readFileSync(path.join(PLUGIN, 'agents', `${name}.md`), 'utf8')
const tasksSkill = () => fs.readFileSync(path.join(PLUGIN, 'skills', 'tasks', 'SKILL.md'), 'utf8')
const designWorkflow = () => fs.readFileSync(path.join(PLUGIN, 'workflows', 'design.workflow.js'), 'utf8')

// Each row is one of the five unread outputs of evidence/issue-215.md:
// the agent file that asked for it, the phrases that asked, and why no
// schema field receives it.
const UNREAD = [
  {
    file: 'supervisor',
    phrases: ['as VERIFIED, PARTIAL or MISSING'],
    reason: 'the supervisor schema has no per-criterion grade field',
    check: () => {
      assert.ok(!Object.keys(schemas.SUPERVISOR_SCHEMA.properties).some((k) => /grade|criterion/i.test(k)))
      const items = schemas.SUPERVISOR_SCHEMA.properties.findings.items
      assert.ok(!items.required.includes('grade'))
      // The grade words may stay only as an internal check that is not reported.
      assert.ok(agent('supervisor').includes('Do not report those grades'), 'supervisor grades are not an output')
    },
  },
  {
    file: 'supervisor',
    phrases: ['Its Head line must match the commit the implementer reported', 'or its Head does not match'],
    reason: 'the run workflow never compares the package Head with the reported commit',
    check: () => {
      assert.ok(!Object.keys(schemas.SUPERVISOR_SCHEMA.properties).some((k) => /head|commit/i.test(k)))
    },
  },
  {
    file: 'implementer',
    phrases: ['RED: the command and the failing output', 'GREEN: the command and the passing output'],
    reason: 'the implementer tests field is free text that nothing parses for red-then-green proof',
    check: () => {
      assert.equal(schemas.IMPLEMENTER_SCHEMA.properties.tests.type, 'string')
      assert.ok(!('properties' in schemas.IMPLEMENTER_SCHEMA.properties.tests))
    },
  },
  {
    file: 'reviewer',
    phrases: ['and the fix when it is not obvious'],
    reason: 'a review finding has no fix field',
    check: () => {
      const items = schemas.REVIEW_SCHEMA.properties.findings.items
      assert.ok(!items.required.includes('fix'))
      assert.ok(!Object.keys(items.properties).includes('fix'))
    },
  },
  {
    file: 'writer',
    phrases: [
      '`spec`: the path of `spec.md`',
      '`plan`: the path of `plan.md`',
      '`tasks`: the path of `tasks.md`',
      '`document`: the path of the corrected document',
      '`check`: what `aether-plan check` printed',
    ],
    reason: 'the design workflow uses its fixed paths and runs its own check',
    check: () => {
      const text = designWorkflow()
      assert.ok(text.includes('const SPEC = `${feature}/spec.md`'))
      assert.ok(text.includes('const PLAN = `${feature}/plan.md`'))
      assert.ok(text.includes('const TASKS = `${feature}/tasks.md`'))
      assert.ok(text.includes('async function planCheck()'))
    },
  },
]

test('no agent text asks for an output that no schema field receives (R14, R17)', () => {
  for (const row of UNREAD) {
    const body = agent(row.file)
    for (const phrase of row.phrases) {
      assert.equal(body.includes(phrase), false, `${row.file}.md still asks: ${phrase}`)
    }
    row.check()
  }
})

test('unsourced figures are removed or carry a source (R15)', () => {
  const files = {
    'agents/judge.md': agent('judge'),
    'agents/writer.md': agent('writer'),
    'agents/reviewer.md': agent('reviewer'),
    'agents/implementer.md': agent('implementer'),
    'agents/supervisor.md': agent('supervisor'),
    'skills/tasks/SKILL.md': tasksSkill(),
  }
  for (const [name, text] of Object.entries(files)) {
    for (const figure of ['10-100x', 'about 2.5 times']) {
      if (text.includes(figure)) {
        assert.ok(
          text.includes('source') || text.includes('http'),
          `${name} cites ${figure} without a link or source`,
        )
      }
    }
  }
})

test('turn budgets read as guidance, never as a limit (R16)', () => {
  const budgets = {
    judge: agent('judge'),
    reviewer: agent('reviewer'),
    implementer: agent('implementer'),
  }
  const lines = (text) => text.split('\n')
  const budgetLine = (text, turn) =>
    lines(text).find((line) => line.includes(turn) && /turn|budget/i.test(line))
  const cases = [
    ['judge', budgets.judge, '30 turns'],
    ['reviewer', budgets.reviewer, '30 turns'],
    ['implementer', budgets.implementer, 'turn 45'],
  ]
  for (const [name, text, turn] of cases) {
    const line = budgetLine(text, turn)
    assert.ok(line, `${name}.md states its turn budget`)
    assert.ok(/about|guide/i.test(line), `${name}.md budget reads as guidance: ${line.trim()}`)
    assert.ok(!/\blimit\b/i.test(line), `${name}.md budget never says limit: ${line.trim()}`)
    assert.ok(!/\bhard\b/i.test(line), `${name}.md budget never says hard: ${line.trim()}`)
    assert.ok(!/at the latest/i.test(line), `${name}.md budget never says at the latest: ${line.trim()}`)
  }
  // The turn-28 line of the Judge and the reviewer reads as guidance too.
  for (const [name, text] of [['judge', budgets.judge], ['reviewer', budgets.reviewer]]) {
    const line = budgetLine(text, 'turn 28')
    assert.ok(line, `${name}.md states when to give its verdict`)
    assert.ok(/about|guide/i.test(line), `${name}.md turn-28 line reads as guidance: ${line.trim()}`)
    assert.ok(!/\blimit\b/i.test(line), `${name}.md turn-28 line never says limit: ${line.trim()}`)
    assert.ok(!/\bhard\b/i.test(line), `${name}.md turn-28 line never says hard: ${line.trim()}`)
    assert.ok(!/at the latest/i.test(line), `${name}.md turn-28 line never says at the latest: ${line.trim()}`)
  }
  // Every turn-budget line in the three files, not only the first match above.
  for (const [name, text] of Object.entries(budgets)) {
    for (const line of lines(text)) {
      if (/\bturns?\b/i.test(line)) {
        assert.ok(!/at the latest/i.test(line), `${name}.md turn budget says "at the latest": ${line.trim()}`)
      }
    }
  }
  // No budget contradicts the time limit on another harness (lib/seats.js):
  // none of the three files caps the other harness by turns.
  for (const [name, text] of Object.entries(budgets)) {
    assert.equal(
      text.includes('Your limit here is the round'),
      false,
      `${name}.md keeps no turn limit for another harness`,
    )
  }
})
