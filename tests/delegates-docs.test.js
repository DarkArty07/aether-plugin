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

test('the table of steps is config/ladder.json: each step, its model and its corrections, and the repeat count', () => {
  const rows = page.split('\n').filter((line) => /^\| (Haiku|Sonnet|Opus) \|/.test(line)).map((line) => line.split('|').map((cell) => cell.trim()))
  assert.equal(rows.length, ladder.rungs.length, 'one row per step')
  ladder.rungs.forEach((rung, index) => {
    const [, name, corrections, first, retry] = rows[index]
    assert.equal(name.toLowerCase(), rung.step, `row ${index + 1} is the step ${rung.step}`)
    assert.equal(Number(corrections), rung.corrections, `${rung.step} corrections`)
    assert.equal(first, `\`${rung.effort.first}\``, `${rung.step} effort at first`)
    assert.equal(retry, `\`${rung.effort.retry}\``, `${rung.step} effort on a correction`)
  })
  assert.equal(ladder.repeatFindings, 2, 'the page says twice; change it with the file')
  assert.ok(page.includes('twice in a row'), 'the page says how often the same findings may come back')
})

test('the guide gives the three causes of a rise, the verdicts, the checks that run first and what comes after Opus', () => {
  const section = page.slice(page.indexOf('## The ladder'), page.indexOf('## The brief'))
  for (const needed of ['the corrections of the step are spent', 'the same findings', 'infeasible', 'a reason', 'from scratch', 'exhausted', 'defer']) {
    assert.ok(section.includes(needed), `The ladder: ${needed}`)
  }
  const judge = page.slice(page.indexOf('## Who judges'), page.indexOf('## aether-delegate'))
  for (const needed of ['without a model', 'before the verdict', 'approve', 'fix', 'infeasible', 'does not count', 'outside what the task owns', 'empty']) {
    assert.ok(judge.includes(needed), `Who judges: ${needed}`)
  }
})

test('the guide says where the log is, what a delegate shows as, and what the report counts', () => {
  for (const needed of ['delegates/log.jsonl', 'append-only', 'agent', 'worktree', 'unit worktree', 'aether-wt merge', 'relaunch', 'attempts']) {
    assert.ok(page.includes(needed), needed)
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
