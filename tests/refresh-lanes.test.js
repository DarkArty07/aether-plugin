'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { main } = require('../scripts/refresh-lanes.js')
const { block, page } = require('./aa-page-fixtures.js')

const row = (id, over = {}) => {
  const [harness, rest] = id.split('/')
  const [model, effort] = rest.split('@')
  return { id, slug: `${harness}-${model}-${effort}`, harness, model, family: `${harness}-${model}`, effort, group: harness === 'claude' ? null : 'g', intelligence: 20, costPerTaskUsd: 0.1, outputTokensPerSecond: 90, timeToFirstTokenS: 2, ...over }
}
// A row on one line in the style of the real plugins/aether/config/pairs.json: `{ "id": "…", "slug": "…" }`, spaces after the braces, the colons and the commas.
const spaced = (r) => `{ ${Object.entries(r).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`
const CLAUDE_HIGH = row('claude/a@high', { code: 10, codeCostPerTaskUsd: 0.1, codeMinutesPerTask: 5, codeChecked: '2026-11-10' })
const CLAUDE_XHIGH = row('claude/a@xhigh', { intelligence: 30, costPerTaskUsd: 0.2 })
// Rows of other harnesses: one that reuses the slug of a Claude row, as the agy rows with Claude models and muse-wonder-full do.
const OTHER = row('agy/b@high', { intelligence: 44.4, costPerTaskUsd: null })
const REUSED = row('agy/claude-a@high', { slug: 'claude-a-high', intelligence: 20, checked: '2026-10-30' })
const LADDER = { law: { candidateEfforts: ['high', 'xhigh'], minJumpPoints: 2 }, supervisorFloor: 1, repeatBlocked: 2, rungs: [{ step: 'a-high', model: 'a', effort: 'high' }, { step: 'a-xhigh', model: 'a', effort: 'xhigh' }] }

function setup(t) {
  const dir = tempDir(t, 'aether-refresh-')
  const files = { pairs: path.join(dir, 'pairs.json'), ladder: path.join(dir, 'ladder.json') }
  const lines = [CLAUDE_HIGH, CLAUDE_XHIGH, OTHER, REUSED].map((r) => `    ${spaced(r)}`)
  fs.writeFileSync(files.pairs, `{\n  "fetchedAt": "2026-10-19",\n  "pairs": [\n${lines.join(',\n')}\n  ]\n}\n`)
  fs.writeFileSync(files.ladder, `${JSON.stringify(LADDER, null, 2)}\n`)
  return files
}
const NOW = () => Date.UTC(2026, 10, 12)
const serve = (figures, asked = []) => async (url) => {
  const slug = url.split('/').pop()
  asked.push(slug)
  return figures[slug] ? { ok: true, status: 200, text: async () => page(block(slug, figures[slug])) } : { ok: false, status: 404, text: async () => '' }
}
// intelligence and cost are on the page, and the refresh must not write them; seconds / 60 is the minutes of a code task.
const fig = (intelligence, cost, code, codeCost, seconds) => ({ intelligence, cost, code, codeCost, seconds })
const GOOD = { 'claude-a-high': fig(21, 0.11, 0.11, 0.12, 330), 'claude-a-xhigh': fig(31, 0.21, 0.22, 0.22, 500) }
const run = (files, fetch, extra = []) => main(['--pairs', files.pairs, '--ladder', files.ladder, ...extra], { fetch, now: NOW, pause: async () => {} })
const rowsOf = (files) => JSON.parse(fs.readFileSync(files.pairs, 'utf8')).pairs

test('the refresh writes only the code figures of the Claude rows, says the rest was not refreshed, shows the ladder and says it did not change', async (t) => {
  const files = setup(t)
  const out = await run(files, serve(GOOD), ['--write'])
  assert.equal(out.exitCode, 0)
  assert.match(out.stdout, /claude\/a@high: code 10 → 11\n/)
  assert.match(out.stdout, /claude\/a@high: codeCostPerTaskUsd 0\.1 → 0\.12\n/)
  assert.match(out.stdout, /claude\/a@high: codeMinutesPerTask 5 → 5\.5\n/)
  assert.match(out.stdout, /claude\/a@xhigh: code none → 22\n/)
  assert.match(out.stdout, /The intelligence and the cost per task of the table were not refreshed: they are refreshed together in part 2\.\n/)
  assert.match(out.stdout, /Recalculated ladder: a high > a xhigh\nStored ladder: unchanged\n/)
  assert.equal(/intelligence \d/.test(out.stdout), false)
  const table = JSON.parse(fs.readFileSync(files.pairs, 'utf8'))
  assert.deepEqual(Object.keys(table), ['fetchedAt', 'pairs'])
  assert.equal(table.fetchedAt, '2026-10-19')
  const [high, xhigh] = rowsOf(files)
  assert.deepEqual([high.code, high.codeCostPerTaskUsd, high.codeMinutesPerTask, high.codeChecked], [11, 0.12, 5.5, '2026-11-12'])
  assert.deepEqual([xhigh.code, xhigh.codeCostPerTaskUsd, xhigh.codeMinutesPerTask, xhigh.codeChecked], [22, 0.22, 8.3, '2026-11-12'])
  // The page says 21 and 0.11 for the first row and 31 and 0.21 for the second: neither is written, and no row gains a checked.
  assert.deepEqual([high.intelligence, high.costPerTaskUsd, xhigh.intelligence, xhigh.costPerTaskUsd], [20, 0.1, 30, 0.2])
  assert.equal(rowsOf(files).some((r) => Object.hasOwn(r, 'checked') && r.harness === 'claude'), false)
  // Byte for byte: a refreshed line keeps its style, the figure that was there is replaced in place, the ones that were not are added at the end, and none is written twice.
  const text = fs.readFileSync(files.pairs, 'utf8')
  const written = text.split('\n')
  assert.ok(written.includes(`    ${spaced({ ...CLAUDE_HIGH, code: 11, codeCostPerTaskUsd: 0.12, codeMinutesPerTask: 5.5, codeChecked: '2026-11-12' })},`))
  assert.ok(written.includes(`    ${spaced({ ...CLAUDE_XHIGH, code: 22, codeCostPerTaskUsd: 0.22, codeMinutesPerTask: 8.3, codeChecked: '2026-11-12' })},`))
  for (const field of ['code', 'codeCostPerTaskUsd', 'codeMinutesPerTask', 'codeChecked']) assert.equal(text.split(`"${field}":`).length - 1, 2, field)
})

test('a ladder that changed is shown with what enters and leaves, and the stored ladder stays as it was, even with --write', async (t) => {
  const files = setup(t)
  const before = fs.readFileSync(files.ladder, 'utf8')
  // a@xhigh is now 0.5 points above a@high in code: not a step of its own, and the cheaper (a@high) stays.
  const out = await run(files, serve({ ...GOOD, 'claude-a-xhigh': fig(31, 0.21, 0.115, 0.22, 500) }), ['--write'])
  assert.match(out.stdout, /Recalculated ladder: a high\nStored ladder: changed\n  extra rung 2: a xhigh\n/)
  assert.match(out.stdout, /The stored ladder was not written: to approve the recalculated one, edit .*ladder\.json in a commit\./)
  assert.equal(fs.readFileSync(files.ladder, 'utf8'), before)
})

test('without --write nothing is written, and with it the rows of the other harnesses are left byte for byte, also the one that reuses a Claude slug', async (t) => {
  const files = setup(t)
  const before = fs.readFileSync(files.pairs, 'utf8')
  const asked = []
  const dry = await run(files, serve(GOOD, asked))
  assert.equal(fs.readFileSync(files.pairs, 'utf8'), before)
  assert.match(dry.stdout, /claude\/a@xhigh: code none → 22/)
  assert.deepEqual(asked, ['claude-a-high', 'claude-a-xhigh'], 'the pages of the Claude rows only: no request for an agy row with the same slug')
  await run(files, serve(GOOD), ['--write'])
  const after = fs.readFileSync(files.pairs, 'utf8').split('\n')
  assert.ok(after.includes(`    ${spaced(OTHER)},`))
  assert.ok(after.includes(`    ${spaced(REUSED)}`))
  assert.equal(after.filter((line) => line.includes('"harness": "claude"')).length, 2)
})

test('a page with no code figure and a page that does not answer leave their rows alone, the second with exit code 1', async (t) => {
  const files = setup(t)
  const noCode = async (url) => ({ ok: true, status: 200, text: async () => page(block(url.split('/').pop(), GOOD['claude-a-xhigh']).replace('terminalbench-4-0', 'other-bench')) })
  const absent = await run(files, async (url) => (url.endsWith('claude-a-high') ? serve(GOOD)(url) : noCode(url)), ['--write'])
  assert.equal(absent.exitCode, 0)
  assert.match(absent.stdout, /claude\/a@xhigh: the page of claude-a-xhigh has no code figure/)
  assert.equal(rowsOf(files)[1].code, undefined)
  const out = await run(files, serve({ 'claude-a-high': GOOD['claude-a-high'] }), ['--write'])
  assert.equal(out.exitCode, 1)
  assert.match(out.stdout, /claude\/a@xhigh: the page answered 404/)
  assert.equal(rowsOf(files)[1].code, undefined)
})

test('the refresh needs no key and sends none, and no longer reads or writes the lane table', async (t) => {
  const files = setup(t)
  const seen = []
  const env = process.env.ARTIFICIAL_ANALYSIS_API_KEY
  delete process.env.ARTIFICIAL_ANALYSIS_API_KEY
  t.after(() => { if (env !== undefined) process.env.ARTIFICIAL_ANALYSIS_API_KEY = env })
  const out = await main(['--pairs', files.pairs, '--ladder', files.ladder], { fetch: async (url, options) => (seen.push([url, options]), serve(GOOD)(url)), now: NOW, pause: async () => {} })
  assert.equal(out.exitCode, 0)
  assert.equal(seen.length, 2)
  assert.ok(seen.every(([url, options]) => url.startsWith('https://artificialanalysis.ai/models/') && !JSON.stringify(options ?? {}).includes('key')))
  const unknown = await main(['--config', 'x'], { fetch: async () => { throw new Error('no') } })
  assert.deepEqual([unknown.exitCode, unknown.stdout], [2, 'usage: node scripts/refresh-lanes.js [--pairs <path>] [--ladder <path>] [--write]\n'])
})

test('the file still exports the key helpers that scripts/build-models-index.js imports, and loads from a tree of two scripts', (t) => {
  const tree = tempDir(t, 'aether-refresh-tree-')
  fs.mkdirSync(path.join(tree, 'scripts'))
  fs.copyFileSync(path.join(__dirname, '..', 'scripts', 'refresh-lanes.js'), path.join(tree, 'scripts', 'refresh-lanes.js'))
  const copy = require(path.join(tree, 'scripts', 'refresh-lanes.js'))
  for (const name of ['keyFrom', 'keyFile', 'envFileFor']) assert.equal(typeof copy[name], 'function', name)
  assert.deepEqual([typeof copy.KEY, typeof copy.MODELS_URL, typeof copy.main], ['string', 'string', 'function'])
})
