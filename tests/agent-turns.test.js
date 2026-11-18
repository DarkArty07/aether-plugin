'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const text = (name) => fs.readFileSync(path.join(PLUGIN, 'agents', `${name}.md`), 'utf8')

test('R1: the Writer declares maxTurns: 100', () => {
  assert.match(text('writer'), /^maxTurns: 100$/m)
})

test('R2: the Examiner declares maxTurns: 80', () => {
  assert.match(text('examiner'), /^maxTurns: 80$/m)
})

test('R7: the Writer body says what to answer when the message asks for plan.md only, and for tasks.md only', () => {
  const body = text('writer')
  assert.ok(body.includes('When the message asks only for plan.md, load the skill `aether:plan` with the Skill tool and follow it; when the feature is visual (an interface, a page, a graphic piece), load the skill `aether:art-direction` too and write `specs/NNN-<topic>/art-direction.md` before the plan. Write plan.md, commit plan.md (and art-direction.md when written), do not touch tasks.md, and answer plan, commit, assumptions, questions and complexity.'))
  assert.ok(body.includes('When the message asks only for tasks.md, load the skill `aether:tasks` with the Skill tool and follow it. Write tasks.md reading the plan.md already written (its path is in the message), run aether-plan check until it passes, commit it, and answer tasks, commit, check, assumptions and questions.'))
})

const sectionOf = (body, heading) => {
  const start = body.indexOf(heading)
  assert.ok(start >= 0, `writer.md has: ${heading}`)
  const next = body.indexOf('**After', start + heading.length)
  return next === -1 ? body.slice(start) : body.slice(start, next)
}

test('R7: the Writer body lists the answer shapes of the plan-only and the tasks-only calls', () => {
  const body = text('writer')
  for (const shape of ['**After plan.md only:**', '**After tasks.md only:**']) {
    assert.ok(sectionOf(body, shape).includes(shape), `Your answer lists: ${shape}`)
  }
  assert.ok(sectionOf(body, '**After plan.md only:**').includes('- `plan`: the path of `plan.md`.'))
  assert.ok(sectionOf(body, '**After tasks.md only:**').includes('- `tasks`: the path of `tasks.md`.'))
  assert.ok(sectionOf(body, '**After plan.md only:**').includes('- `commit`: the commit that holds `plan.md` (and `art-direction.md` when written).'))
  assert.ok(sectionOf(body, '**After tasks.md only:**').includes('- `commit`: the commit that holds `tasks.md`.'))
  assert.ok(sectionOf(body, '**After tasks.md only:**').includes('- `check`: what `aether-plan check` printed.'))
})
