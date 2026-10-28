'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8')
const RULE = 'The swarm starts every unit on the first rung of `config/ladder.json` and raises it by the same policy as the delegates.'

test('the guides and the skills say the swarm uses the one ladder, starting on its first rung', () => {
  for (const file of [['docs', 'guide', 'models-by-role.md'], ['docs', 'guide', 'delegates.md'], ['plugins', 'aether', 'skills', 'swarm', 'SKILL.md'], ['plugins', 'aether', 'skills', 'using-aether', 'SKILL.md']]) {
    assert.ok(read(...file).includes(RULE), file.join('/'))
  }
})

test('no document or skill says the plan picks the model a task starts on', () => {
  const files = [['docs', 'guide', 'models-by-role.md'], ['docs', 'guide', 'delegates.md'], ['plugins', 'aether', 'skills', 'swarm', 'SKILL.md'], ['plugins', 'aether', 'skills', 'using-aether', 'SKILL.md'], ['CLAUDE.md'], ['docs', 'reference', 'components.md']]
  for (const file of files) {
    let text = read(...file)
    if (file.join('/') === 'docs/guide/models-by-role.md') {
      text = text.replace(/the plan's Tier at `high`/, '')
    }
    assert.doesNotMatch(text, /the plan's Tier/i, file.join('/'))
    assert.doesNotMatch(text, /\btier opus\b/i, file.join('/'))
    assert.doesNotMatch(text, /Tier and the ladder of its plan/, file.join('/'))
    assert.doesNotMatch(text, /\beffortFor\b|\bDEFAULT_EFFORT\b/, file.join('/'))
  }
})

test('the final review rises by Review, in the guide and in the swarm skill', () => {
  for (const file of [['docs', 'guide', 'models-by-role.md'], ['plugins', 'aether', 'skills', 'swarm', 'SKILL.md']]) {
    assert.match(read(...file), /`Review: xhigh` or `max`/, file.join('/'))
  }
})

test('A97 is in the decisions, with the owner\'s words, the issue and the date', () => {
  const row = read('docs', 'decisions.md').split('\n').find((line) => line.startsWith('| A97 |'))
  assert.ok(row, 'there is an A97 row')
  assert.ok(row.includes('Que todo arranque en haiku'))
  assert.match(row, /#102|issue 102/)
  assert.match(row, /config\/ladder\.json/)
  assert.match(row, /Decided 2026-10-2\d/)
})

test('the components page and the ops guide name the two verbs, and the changelog tells the change', () => {
  const components = read('docs', 'reference', 'components.md')
  assert.match(components, /\| wt \| `wt-` \| `wt-gate\.js`, `wt-ladder\.js` \|/)
  assert.ok(components.includes('aether-wt ladder') && components.includes('aether-wt gate'))
  const ops = read('docs', 'guide', 'ops.md')
  assert.ok(ops.includes('aether-wt ladder') && ops.includes('aether-wt gate'))
  assert.match(read('docs', 'changelog.md'), /Version 0\.24\.0[\s\S]*one ladder/i)
})

test('the swarm skill describes the ladder block of a result and its causes of block', () => {
  const swarm = read('plugins', 'aether', 'skills', 'swarm', 'SKILL.md')
  for (const word of ['units[].ladder', 'gateRejections', 'firstTry', 'filled', 'rises', 'steps']) {
    assert.ok(swarm.includes(word), word)
  }
  assert.doesNotMatch(swarm, /same findings three times/)
})
