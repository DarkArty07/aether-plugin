'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const page = read('docs/guide/router.md')
const row = (n) => page.split('\n').find((l) => l.startsWith(`| C${n}. `))
const SHOWN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14]
const AS_IS = [2, 10, 13, 14]

test('C12: the guide has a viability row for each of C1 to C14 except C12, with a verdict and its adjustment named', () => {
  for (const n of SHOWN) {
    assert.ok(row(n), `a row for C${n}`)
    const cells = row(n).split('|').map((c) => c.trim())
    assert.ok(['viable as is', 'viable with an adjustment'].includes(cells[2]), `C${n}: ${cells[2]}`)
    assert.equal(cells[2], AS_IS.includes(n) ? 'viable as is' : 'viable with an adjustment', `C${n}`)
    if (cells[2] === 'viable with an adjustment') assert.ok(cells[3].length > 20, `C${n} names its adjustment`)
  }
  assert.equal(row(12), undefined, 'the design does not rate C12 itself')
})

test('C12: the measurements asked before command becomes the default are given', () => {
  const c5 = row(5)
  for (const text of ['3.84', 'median', 'p90', 'real delegations', 'agree']) assert.ok(c5.includes(text), `C5: ${text}`)
  const c9 = row(9)
  for (const text of ['A49', 'owner', 'literal', 'refusal', 'issue 021', 'renewal', '0.7 s', '5 s']) assert.ok(c9.includes(text), `C9: ${text}`)
  const c11 = row(11)
  for (const text of ['paid replay', 'both deciders', 'cheaper']) assert.ok(c11.includes(text), `C11: ${text}`)
})

test('the quota section gives the owner rule, says that superdelegation uses it too, and that a reading with balance does not lift a mark', () => {
  const section = page.slice(page.indexOf('## Quota'), page.indexOf('## Other harnesses'))
  for (const text of ['weekly window', 'renews first', '5 %', 'valid reading', 'does not lift', 'Individual quota reached', 'superdelegation', 'cost per task']) assert.ok(section.includes(text), text)
})

test('the levels section says how the bands are cut and what is not measured on a harness', () => {
  const section = page.slice(page.indexOf('## Levels'), page.indexOf('## Quota'))
  for (const text of ['cut-off', 'upper level', 'unmeasured']) assert.ok(section.includes(text), text)
})

test('C14: the other uses found are listed with their measurements, and none is built', () => {
  const section = page.slice(page.indexOf('## Other uses found, not built'))
  for (const text of ['45 %', '57 commands', '55 %', '22 of 40', '53 %', '98 tasks', '255', '021-agy-refuses-with-individual-quota-reached-while-usage-shows-balance.md']) assert.ok(section.includes(text), text)
  assert.ok(/none of them is built/i.test(section))
  for (const built of ['lib/guard-decider', 'lib/plan-lint', 'lib/graders']) assert.ok(!fs.existsSync(path.join(ROOT, 'plugins', 'aether', `${built}.js`)), built)
})

test('the guide says how to read and change the criterion, how the Lead overrides, and the four options', () => {
  assert.ok(page.includes('`plugins/aether/config/router/criterion.json`'))
  assert.ok(page.includes('`ROUTER-OVERRIDE: <reason>`'))
  assert.ok(page.includes('`aether-route replay --journal`'))
  for (const mode of ['record', 'advise', 'command']) assert.ok(page.includes(`\`${mode}\``), mode)
  for (const option of ['decider', 'fallback', 'deadlines']) assert.ok(page.includes(`\`${option}\``), option)
})

test('the docs index links the guide', () => {
  assert.ok(read('docs/index.md').includes('](guide/router.md)'))
  assert.ok(read('tests/docs-facts.test.js').includes("'docs/guide/router.md'"))
})

test('R21: the router page speaks of one switch, superdelegation, and of the points of a pair, not of the retired profiles, options or equivalences', () => {
  for (const pattern of [/`balanced`/, /`robust`/, /`seats`/, /\bseats option\b/, /--seats\b/, /AETHER_SEATS/, /AETHER_LANES\b/, /`replaces`/, /the `lanes` option/]) assert.doesNotMatch(page, pattern, `router.md still says ${pattern}`)
  assert.ok(page.includes('`superdelegation`'), 'router.md names the switch')
})
