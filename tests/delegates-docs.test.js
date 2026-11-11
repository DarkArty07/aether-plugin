'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')
const page = read('docs', 'guide', 'delegates.md')
const ladder = JSON.parse(read('plugins', 'aether', 'config', 'ladder.json'))

test('the guide of the delegates describes the ladder (R10)', () => {
  for (const needed of ['AETHER-TASK:', 'AETHER-OWNS:', 'AETHER-TESTS:', 'aether-delegate', 'config/ladder.json', 'Haiku', 'Sonnet', 'Opus', 'aether-report --delegates', 'from scratch']) {
    assert.ok(page.includes(needed), needed)
  }
})

test('the guide keeps the choice of the pair and the failures of A72', () => {
  assert.ok(page.includes('aether-lane delegate'))
  assert.match(page, /never repeated|not repeated/)
})

test('the page has its front matter and the index links it', () => {
  assert.match(page, /^---\ntitle: .+\ndescription: .+\norder: \d+\n/)
  assert.ok(read('docs', 'index.md').includes('guide/delegates.md'))
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'docs', 'guide', 'router.md')), false)
})

const stepRows = (text) => text.split('\n').filter((line) => /^\| `?(haiku|sonnet|opus)/i.test(line)).map((line) => line.split('|').map((cell) => cell.trim()))

test('the table of steps is config/ladder.json: each step, its model and its effort', () => {
  const rows = stepRows(read('docs', 'guide', 'delegates.md'))
  assert.equal(rows.length, ladder.rungs.length, 'one row per step')
  ladder.rungs.forEach((rung, index) => {
    const [, step, model, effort] = rows[index]
    assert.deepEqual([step, model.toLowerCase(), effort], [rung.step, rung.model, `\`${rung.effort}\``], `row ${index + 1}`)
  })
})

test('the guide says what makes a task rise, be blocked or be exhausted, with the words of the new policy', () => {
  const text = read('docs', 'guide', 'delegates.md')
  for (const needed of ['Pareto', 'one step', 'outside Owns', 'infeasible', 'a reason', 'from scratch', 'exhausted', 'defer']) assert.ok(text.includes(needed), needed)
  const judge = text.slice(text.indexOf('## Who judges'), text.indexOf('## aether-delegate'))
  for (const needed of ['without a model', 'before the verdict', 'approve', 'fix', 'infeasible', 'does not count', 'outside what the task owns', 'empty']) {
    assert.ok(judge.includes(needed), `Who judges: ${needed}`)
  }
})

test('the guide says where the log is, how it is pruned after 30 days, what a delegate shows as, and what the report counts (R12)', () => {
  for (const needed of ['delegates/log.jsonl', 'spend/<id>.outcomes.jsonl', '30 days', 'agent', 'worktree', 'unit worktree', 'aether-wt merge', 'relaunch', 'attempts']) {
    assert.ok(page.includes(needed), needed)
  }
  const maintenance = read('docs', 'guide', 'maintenance.md')
  assert.ok(maintenance.includes('spend/<id>.outcomes.jsonl'))
  for (const text of [page, maintenance, read('plugins', 'aether', 'lib', 'delegate-log.js')]) {
    assert.doesNotMatch(text, /none of it is pruned|append-only/i)
  }
})

test('the guide keeps the rule that picks the pair of a step, and the readings and marks it uses', () => {
  const section = page.slice(page.indexOf('## The pair of a step'), page.indexOf('## When a pair fails'))
  for (const text of ['weekly window', 'renews first', '5 %', 'valid reading', 'does not lift', 'Individual quota reached', 'superdelegation', 'cost per task', "author's own family"]) assert.ok(section.includes(text), text)
})

test('the page speaks of one switch, superdelegation, and not of the retired profiles or equivalences', () => {
  for (const pattern of [/`balanced`/, /`robust`/, /`seats`/, /\bseats option\b/, /--seats\b/, new RegExp('AETHER_' + 'SEATS'), new RegExp('AETHER_' + 'LAN' + 'ES\\b'), /`replaces`/, /the `lanes` option/]) assert.doesNotMatch(page, pattern, `delegates.md still says ${pattern}`)
  assert.ok(page.includes('`superdelegation`'), 'delegates.md names the switch')
})

test('the guide records the owner effort: the authorize usage, the naming rule and the effort a covered task runs at (issue 141)', () => {
  for (const needed of [
    'authorize --model <sonnet|opus> [--effort <low|medium|high|xhigh|max>]',
    "The effort is the owner's only when their words name it",
    'at the authorized effort when the record names one',
    'keeps it unless the ladder raises it further',
    'the effort when the owner',
  ]) assert.ok(page.includes(needed), needed)
})
