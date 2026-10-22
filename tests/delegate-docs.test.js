'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')

test('the user pages say editing delegates leave Claude first, and none still says they stay', () => {
  const lanes = read('docs', 'guide', 'lanes.md')
  for (const needed of [
    'aether-lane delegate --brief <file> --model <model> --effort <effort> --owns <globs> [--tests <command>]',
    'unit worktree',
    'aether-wt merge',
    'no-candidate',
    'Its uncommitted work, if any, is in the worktree',
    'git apply --check',
    'why the earlier work was not carried over',
    'whether it started from the earlier work',
  ]) assert.ok(lanes.includes(needed), needed)

  const options = read('docs', 'guide', 'options.md')
  assert.ok(!options.includes('a task that edits files stays on Claude'))
  assert.ok(options.includes('a task that edits files goes first through `aether-lane delegate`, to the pair the one rule picks, and runs on Claude only when that command finds no candidate'))

  const delegates = read('docs', 'guide', 'delegates.md')
  for (const needed of ['AETHER-TASK: <id>', 'aether-report --delegates', 'aether:*']) {
    assert.ok(delegates.includes(needed), needed)
  }

  const components = read('docs', 'reference', 'components.md')
  assert.ok(/`aether-lane`[^\n]*delegate/.test(components))
})
