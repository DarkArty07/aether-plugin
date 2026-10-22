'use strict'

// Spec 002, R19: the documentation of lanes explains the order, the marks and the readings, says that Grok's quota is read
// over ACP (`_x.ai/billing`) with its UI as the fallback, and tells how to add a harness; and what it says of the lengths
// agrees with the table. The decisions have their own test, lanes-decisions.test.js.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const lanes = require('../plugins/aether/lib/lanes.js')
const { ACP_TIMEOUT_MS } = require('../plugins/aether/lib/harness/grok-acp.js')
const { STALE_MS, TIMEOUT_MS } = require('../plugins/aether/lib/harness/grok-quota.js')

const ROOT = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8')
// Spec 004: the README is the way in, and the guide to lanes lives in docs/. `docs()` is the README and the pages of
// R3 to R9 as one text, for the strings that were once searched in the README alone.
const DOC_FILES = [
  'README.md', 'docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/guide/options.md',
  'docs/guide/lanes.md', 'docs/guide/design-seats.md', 'docs/guide/autonomy.md', 'docs/guide/ops.md',
  'docs/guide/maintenance.md', 'docs/guide/troubleshooting.md', 'docs/reference/components.md', 'docs/changelog.md',
  'docs/contributing.md', 'docs/roadmap.md', 'docs/index.md',
]
const docs = () => DOC_FILES.map((file) => read(...file.split('/'))).join('\n')
const includesAll = (text, phrases, where) => {
  for (const phrase of phrases) assert.ok(text.includes(phrase), `${where} lacks: ${phrase}`)
}

test("the Lanes section of the guide explains the order of the candidates, the dry marks, the kept readings and what the report shows", () => {
  const page = read('docs', 'guide', 'lanes.md')
  assert.ok(page.includes('\n### Lanes\n'), 'the Lanes page has ### Lanes')
  const start = page.indexOf('### Lanes')
  const rest = page.slice(start + '### Lanes'.length)
  const end = rest.search(/\n##+ /)
  const section = end < 0 ? rest : rest.slice(0, end)
  assert.ok(section.length > 1000)
  includesAll(
    section,
    [
      '- **The order.**',
      'The quota whose weekly window renews first goes first',
      'Within that quota, the lower cost per task',
      'a pair with no cost per task (Muse\'s) goes last in its quota',
      'a window that cannot be read goes after the ones that can',
      'leaves a dry mark in the plugin\'s data directory',
      '`dryMarkMinutes`',
      '`quotaLifeMinutes`',
      'the same call goes to the next candidate, and to Aether\'s own agent when none is left',
      '`lanes.run.choices`',
      '`aether-lane status <run>`',
    ],
    'the Lanes section of the guide',
  )
})

test('R21: lanes.md holds the rule: the switch, the points, the tolerance, the order, no limit on parallel calls and the report', () => {
  const text = read('docs', 'guide', 'lanes.md')
  for (const fragment of ['`superdelegation`', 'off by default', 'plugins/aether/config/pairs.json', '1 point', 'weekly', 'cost per task', 'No limit on parallel calls', 'aether-report']) assert.ok(text.includes(fragment), `lanes.md says ${fragment}`)
})

test('issue 64: the guide says the design seats reserve the author family and the swarm keeps the bar', () => {
  const lanesPage = read('docs', 'guide', 'lanes.md')
  const seatsPage = read('docs', 'guide', 'design-seats.md')
  const routerPage = read('docs', 'guide', 'router.md')
  const components = read('docs', 'reference', 'components.md')
  for (const [name, text] of [['lanes.md', lanesPage], ['design-seats.md', seatsPage]]) {
    assert.ok(text.includes('another family'), name)
    assert.ok(text.includes("author's own family"), name)
    assert.ok(text.includes('native agent only last'), name)
  }
  assert.ok(lanesPage.includes('aether-lane delegate'))
  assert.ok(lanesPage.includes('keep it as a bar') || lanesPage.includes('keeps it as a bar') || lanesPage.includes('keep that rule as a bar'))
  assert.ok(seatsPage.includes('no other external pair'))
  assert.ok(routerPage.includes("author's own family"))
  assert.ok(routerPage.includes('aether-lane delegate'))
  assert.ok(components.includes("author's own family"))
})

test('R21: lanes.md says how the old options are read and what the rule asks, keeps, and cannot reach', () => {
  const text = read('docs', 'guide', 'lanes.md')
  includesAll(
    text,
    [
      'If `superdelegation` is not set and `lanes` is on, superdelegation counts as on',
      '`seats` is always ignored',
      'Sonnet `high` asks 46.8 and Sonnet `xhigh` asks 51.9',
      'No pair is chosen or left out for being fast or slow',
      'Nobody reviews its own work',
    ],
    'lanes.md',
  )
})

test('R21: the guide pages of this task name neither the retired profiles nor the retired variables', () => {
  for (const page of ['lanes', 'design-seats', 'options', 'router']) {
    const text = read('docs', 'guide', `${page}.md`)
    // The same patterns as Task 18's GONE; lanes.md and options.md alone may name `seats` (the migration says it is ignored).
    const gone = [/`balanced`/, /`robust`/, /\bseats option\b/, /--seats\b/, /AETHER_SEATS/, /AETHER_LANES\b/]
    if (!['lanes', 'options'].includes(page)) gone.push(/`seats`/)
    for (const pattern of gone) assert.doesNotMatch(text, pattern, `${page}.md still says ${pattern}`)
  }
})

test('R25: the Muse section follows the rule: its pair is scored as Opus high by the owner, without cost, and the table maps no effort', () => {
  const page = read('docs', 'guide', 'lanes.md')
  const section = page.slice(page.indexOf('\n## Muse'))
  includesAll(section, ['`muse/muse-wonder-full-1.0@high`', '53.6 points', 'no cost per task', 'goes last in its quota', '`ownerDecision`', '55.8', 'which the CLI does not take'], 'the Muse section')
  assert.doesNotMatch(section, /\breplaces Opus\b|`replaces`|`levels`|runs at Muse's `high`/, 'the Muse section names no equivalence table')
})

test("the documents say that Grok's quota is read over ACP with its UI as the fallback, who refreshes it, and how to add a harness with its reader", () => {
  const readme = docs()
  includesAll(
    readme,
    [
      "**Grok's quota is read over ACP**",
      'the request `_x.ai/billing` on `grok agent stdio`',
      '`aether-lane status <run> --refresh`, the quota step of each wave in the workflow',
      "the fallback opens grok's UI for a few seconds (20 at most)",
      'removes the session folder grok made for that directory, and no other',
      'A `status` run by hand does not refresh.',
      'A line without `creditUsagePercent` is read as 0% used',
      '**Adding a harness.**',
      '`HARNESS_NAMES` and `FACTORY` of `plugins/aether/lib/harness/index.js`',
      "`quotaCost: 'process'`",
      'or `unknown` when it cannot read them',
    ],
    'the documents',
  )
})

test('the documents do not call the reader of Grok provisional any more', () => {
  // The README before spec 002 (9f0370c) said "Grok's is interim, until another method turns up".
  const stopgap = /provisional|interim|until another method/i
  for (const [name, text] of [['the README and the pages', docs()], ['docs/decisions.md', read('docs', 'decisions.md')]]) assert.ok(!stopgap.test(text.split('\n').filter((line) => /grok/i.test(line) && /quota|reader/i.test(line)).join('\n')), name)
  assert.ok(stopgap.test("Grok's is interim, until another method turns up"))
})

test("the lengths the documents give are the table's: 10 minutes for agy, 30 for grok, 60 for a dry mark", () => {
  const config = lanes.loadConfig(lanes.CONFIG_FILE)
  assert.deepEqual([config.harnesses.agy.quotaLifeMinutes, config.harnesses.grok.quotaLifeMinutes, config.dryMarkMinutes, config.reserve], [10, 30, 60, 0.05])
  includesAll(docs(), ['(`quotaLifeMinutes`: 10 minutes)', 'a finished agy call and `aether-lane quota` take a fresh reading', 'its 30 minutes (`quotaLifeMinutes`)', 'otherwise for 60 minutes (`dryMarkMinutes`)', 'above a 5% reserve (`reserve` in the table)'], 'the documents')
})

test("the limits the documents give for Grok's reading are the code's: 10 seconds over ACP, 20 for the UI, 30 minutes before a log line is stale", () => {
  assert.deepEqual([ACP_TIMEOUT_MS, TIMEOUT_MS, STALE_MS], [10000, 20000, 30 * 60 * 1000])
  includesAll(docs(), [`(${ACP_TIMEOUT_MS / 1000} seconds at most)`, `for a few seconds (${TIMEOUT_MS / 1000} at most)`, `they call it stale after ${STALE_MS / 60000} minutes`], 'the documents')
})

test('the swarm skill and the brief name the order, the balance of each group and the choices of the run', () => {
  includesAll(
    read('plugins', 'aether', 'skills', 'swarm', 'SKILL.md'),
    ['each call to the candidate whose quota is most at risk of being lost first', '`aether-lane status <runId>`', 'its `balance`', 'what every call chose (`run.choices`)', 'Lanes (grok)'],
    'the swarm skill',
  )
  includesAll(read('plugins', 'aether', 'skills', 'autonomous-runs', 'SKILL.md'), ['- Delegación: <llamadas y tokens en otros harness; por grupo de cuota, el saldo al empezar y al terminar y su próximo reinicio (aether-report: lanes.run.groups.<grupo>.balance)'], 'the autonomous-runs skill')
})

test('the Lanes guide names the five harnesses in the order of the option, Muse last', () => {
  const lanes = read('docs', 'guide', 'lanes.md')
  assert.ok(lanes.includes('agy, codex, grok, cursor, muse'), 'the fixed list')
  assert.ok(lanes.includes('Codex, Grok, Cursor and Muse'), 'the prose list')
  assert.ok(lanes.includes('## Muse'), 'its own section')
})
