'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const SKILL = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'skills', 'using-aether', 'SKILL.md'), 'utf8')

test('the bootstrap describes the ladder (R19, C2, C3, C5)', () => {
  for (const phrase of ['AETHER-TASK:', 'AETHER-OWNS:', 'AETHER-TESTS:', 'aether-delegate verdict', 'config/ladder.json', '--from-scratch', 'isolation: "worktree"']) {
    assert.ok(SKILL.includes(phrase), phrase)
  }
  assert.match(SKILL, /always start on Haiku|starts on Haiku/i)
  assert.match(SKILL, /after (Opus|the fifth rung)[^.\n]*(defer|owner's list)/i)
})

test('the old rules are gone', () => {
  for (const gone of ['ROUTER-' + 'OVERRIDE', 'Router in `command`', 'run it again one model up', 'relaunch it one model up']) assert.equal(SKILL.includes(gone), false, gone)
})

test('the exception of A72 stays: a pair that fails at its start is replaced, never repeated, and that is not a correction', () => {
  assert.match(SKILL, /quota[^.\n]*(replaced|replace)[^.\n]*never repeated|never repeated[^.\n]*quota/i)
})

test('the Lead does not read the whole diff when the checks and the other pair review are enough', () => {
  assert.match(SKILL, /do not read the whole diff|not read the diff/i)
})

test('an editing delegate is launched with Agent, not with Bash', () => {
  assert.equal(/aether-lane delegate --brief[^\n]*in the background/i.test(SKILL), false)
})

test('the Lead waits for a delegate by its notification and schedules no wakeup for it (issue 89)', () => {
  assert.match(SKILL, /notification of a delegate wakes you/i)
  assert.match(SKILL, /schedule no wakeup[^.\n]*ScheduleWakeup/i)
  assert.match(SKILL, /exception is the fallback of the `aether:autonomous-runs` skill/i)
})

test('the bootstrap records the owner effort with the placement (issue 141)', () => {
  assert.ok(SKILL.includes('authorize --model <sonnet|opus> [--effort <low|medium|high|xhigh|max>]'))
  assert.ok(SKILL.includes('at the recorded effort when the words name one'))
})

test('the brief bullet tells the Lead to put tests that pin changes in AETHER-OWNS (issue #251)', () => {
  assert.match(
    SKILL,
    /\*\*The brief\*\*[^\n]*search `tests\/` for the text the task changes \(and for a folder list it adds to or removes from\), and put each test file that pins it in `AETHER-OWNS`/,
  )
})
