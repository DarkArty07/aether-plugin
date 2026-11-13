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

test('the refresh writes the intelligence, the cost and the code figures of every row with a page, sets one date on them, shows the ladder and says it did not change', async (t) => {
  const files = setup(t)
  const pages = { ...GOOD, 'agy-b-high': fig(44.4, 0.5, 0.2, 0.6, 600) }
  const out = await run(files, serve(pages), ['--write'])
  assert.equal(out.exitCode, 0)
  assert.match(out.stdout, /claude\/a@high: intelligence 20 → 21\n/)
  assert.match(out.stdout, /claude\/a@high: costPerTaskUsd 0\.1 → 0\.11\n/)
  assert.match(out.stdout, /claude\/a@high: code 10 → 11\n/)
  assert.match(out.stdout, /claude\/a@high: codeCostPerTaskUsd 0\.1 → 0\.12\n/)
  assert.match(out.stdout, /claude\/a@high: codeMinutesPerTask 5 → 5\.5\n/)
  assert.match(out.stdout, /claude\/a@xhigh: intelligence 30 → 31\n/)
  assert.match(out.stdout, /claude\/a@xhigh: code none → 22\n/)
  assert.doesNotMatch(out.stdout, /part 2/)
  assert.match(out.stdout, /Recalculated ladder: a high > a xhigh\nStored ladder: unchanged\n/)
  const table = JSON.parse(fs.readFileSync(files.pairs, 'utf8'))
  assert.deepEqual(Object.keys(table), ['fetchedAt', 'pairs'])
  assert.equal(table.fetchedAt, '2026-10-19')
  const [high, xhigh, other, reused] = rowsOf(files)
  assert.deepEqual([high.intelligence, high.costPerTaskUsd, high.code, high.codeCostPerTaskUsd, high.codeMinutesPerTask, high.checked, high.codeChecked], [21, 0.11, 11, 0.12, 5.5, '2026-11-12', '2026-11-12'])
  assert.deepEqual([xhigh.intelligence, xhigh.costPerTaskUsd, xhigh.code, xhigh.codeCostPerTaskUsd, xhigh.codeMinutesPerTask, xhigh.checked, xhigh.codeChecked], [31, 0.21, 22, 0.22, 8.3, '2026-11-12', '2026-11-12'])
  // The other harness's own page is read too: its figures land, and its null cost stays null.
  assert.deepEqual([other.intelligence, other.costPerTaskUsd], [44.4, null])
  assert.deepEqual([other.code, other.codeCostPerTaskUsd, other.codeMinutesPerTask, other.checked, other.codeChecked], [20, 0.6, 10, '2026-11-12', '2026-11-12'])
  // The row that reuses a Claude slug follows that page, with its own dates.
  assert.deepEqual([reused.intelligence, reused.costPerTaskUsd, reused.code, reused.checked, reused.codeChecked], [21, 0.11, 11, '2026-11-12', '2026-11-12'])
  // Byte for byte: a refreshed line keeps its style, the figure that was there is replaced in place, the ones that were not are added at the end, and none is written twice.
  const text = fs.readFileSync(files.pairs, 'utf8')
  const written = text.split('\n')
  const withoutChecked = ({ codeChecked, ...rest }) => rest
  assert.ok(written.includes(`    ${spaced({ ...withoutChecked({ ...CLAUDE_HIGH, intelligence: 21, costPerTaskUsd: 0.11, code: 11, codeCostPerTaskUsd: 0.12, codeMinutesPerTask: 5.5 }), codeChecked: '2026-11-12', checked: '2026-11-12' })},`))
  assert.ok(written.includes(`    ${spaced({ ...CLAUDE_XHIGH, intelligence: 31, costPerTaskUsd: 0.21, code: 22, codeCostPerTaskUsd: 0.22, codeMinutesPerTask: 8.3, checked: '2026-11-12', codeChecked: '2026-11-12' })},`))
  assert.ok(written.includes(`    ${spaced({ ...OTHER, code: 20, codeCostPerTaskUsd: 0.6, codeMinutesPerTask: 10, checked: '2026-11-12', codeChecked: '2026-11-12' })},`))
  for (const field of ['intelligence', 'costPerTaskUsd', 'code', 'codeCostPerTaskUsd', 'codeMinutesPerTask', 'checked', 'codeChecked']) assert.equal(text.split(`"${field}":`).length - 1, 4, field)
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

test('without --write nothing is written, and with it every row with a page is patched in place, sharing one request per slug', async (t) => {
  const files = setup(t)
  const pages = { ...GOOD, 'agy-b-high': fig(44.4, 0.5, 0.2, 0.6, 600) }
  const before = fs.readFileSync(files.pairs, 'utf8')
  const asked = []
  const dry = await run(files, serve(pages, asked))
  assert.equal(fs.readFileSync(files.pairs, 'utf8'), before)
  assert.match(dry.stdout, /claude\/a@xhigh: code none → 22/)
  assert.deepEqual(asked, ['claude-a-high', 'claude-a-xhigh', 'agy-b-high'], 'one request per page, shared slugs asked once')
  await run(files, serve(pages), ['--write'])
  const after = fs.readFileSync(files.pairs, 'utf8').split('\n')
  assert.ok(after.includes(`    ${spaced({ ...OTHER, code: 20, codeCostPerTaskUsd: 0.6, codeMinutesPerTask: 10, checked: '2026-11-12', codeChecked: '2026-11-12' })},`))
  assert.ok(after.includes(`    ${spaced({ ...REUSED, intelligence: 21, costPerTaskUsd: 0.11, code: 11, codeCostPerTaskUsd: 0.12, codeMinutesPerTask: 5.5, codeChecked: '2026-11-12', checked: '2026-11-12' })}`))
  assert.equal(after.filter((line) => line.includes('"harness": "claude"')).length, 2)
})

test('a page with no code figure still writes intelligence, cost and checked but no code fields, and a page that does not answer leaves its row alone, the second with exit code 1', async (t) => {
  const files = setup(t)
  const noCode = async (url) => ({ ok: true, status: 200, text: async () => page(block(url.split('/').pop(), GOOD['claude-a-xhigh']).replace('terminalbench-4-0', 'other-bench')) })
  const absent = await run(files, async (url) => (url.endsWith('claude-a-high') ? serve(GOOD)(url) : noCode(url)), ['--write'])
  assert.equal(absent.exitCode, 0)
  assert.match(absent.stdout, /claude\/a@xhigh: the page of claude-a-xhigh has no code figure/)
  const [, xhighNoCode, otherNoCode] = rowsOf(files)
  // The no-code row gets its intelligence, cost and checked from the pass, but no code fields or codeChecked are invented.
  assert.deepEqual([xhighNoCode.intelligence, xhighNoCode.costPerTaskUsd, xhighNoCode.checked], [31, 0.21, '2026-11-12'])
  assert.equal(xhighNoCode.code, undefined)
  assert.equal(Object.hasOwn(xhighNoCode, 'code'), false)
  assert.equal(Object.hasOwn(xhighNoCode, 'codeCostPerTaskUsd'), false)
  assert.equal(Object.hasOwn(xhighNoCode, 'codeMinutesPerTask'), false)
  assert.equal(Object.hasOwn(xhighNoCode, 'codeChecked'), false)
  // A null cost stays null on a no-code page too, while its intelligence and checked still land.
  assert.deepEqual([otherNoCode.intelligence, otherNoCode.costPerTaskUsd, otherNoCode.checked], [31, null, '2026-11-12'])
  assert.equal(Object.hasOwn(otherNoCode, 'code'), false)
  assert.equal(Object.hasOwn(otherNoCode, 'codeChecked'), false)
  const beforeAbsent = rowsOf(files)[1]
  const out = await run(files, serve({ 'claude-a-high': GOOD['claude-a-high'] }), ['--write'])
  assert.equal(out.exitCode, 1)
  assert.match(out.stdout, /claude\/a@xhigh: the page answered 404/)
  assert.deepEqual(rowsOf(files)[1], beforeAbsent)
  // A page with no block for the slug at all also leaves the row untouched.
  const beforeNoBlock = rowsOf(files)[1]
  const noBlock = await run(files, async () => ({ ok: true, status: 200, text: async () => page(block('some-other-model', GOOD['claude-a-xhigh'])) }), ['--write'])
  assert.match(noBlock.stdout, /claude\/a@xhigh: the page of claude-a-xhigh has no figure/)
  assert.deepEqual(rowsOf(files)[1], beforeNoBlock)
})

test('a non-Claude page with no Terminal-Bench still writes its intelligence and checked with the single date of the pass, and invents no code fields', async (t) => {
  const dir = tempDir(t, 'aether-refresh-nocode-nonclaude-')
  const files = { pairs: path.join(dir, 'pairs.json'), ladder: path.join(dir, 'ladder.json') }
  const claude = row('claude/haiku@high', { slug: 'claude-haiku-5-5-high', intelligence: 29.6, costPerTaskUsd: 0.159, code: 21.72, codeCostPerTaskUsd: 0.331, codeMinutesPerTask: 12.1, codeChecked: '2026-11-10' })
  const agy = row('agy/gemini-4-argon@high', { slug: 'gemini-4-argon', intelligence: 50, costPerTaskUsd: 7 })
  const lines = [claude, agy].map((r) => `    ${spaced(r)}`)
  fs.writeFileSync(files.pairs, `{\n  "fetchedAt": "2026-10-19",\n  "pairs": [\n${lines.join(',\n')}\n  ]\n}\n`)
  fs.writeFileSync(files.ladder, `${JSON.stringify(LADDER, null, 2)}\n`)
  const fetch = async (url) => {
    const slug = url.split('/').pop()
    if (slug === 'gemini-4-argon') return { ok: true, status: 200, text: async () => page(block(slug, fig(50.5, 7.1, 0.3, 1.2, 600)).replace('terminalbench-4-0', 'other-bench')) }
    return serve({ 'claude-haiku-5-5-high': fig(29.6, 0.159, 0.22, 0.34, 730) })(url)
  }
  const out = await run(files, fetch, ['--write'])
  assert.equal(out.exitCode, 0)
  assert.match(out.stdout, /agy\/gemini-4-argon@high: the page of gemini-4-argon has no code figure/)
  const rows = rowsOf(files)
  // The single-date assertion covers checked of every row whose page answered, including the no-code one.
  assert.deepEqual(new Set(rows.map((r) => r.checked)), new Set(['2026-11-12']))
  const written = rows.find((r) => r.id === 'agy/gemini-4-argon@high')
  assert.deepEqual([written.intelligence, written.costPerTaskUsd, written.checked], [50.5, 7.1, '2026-11-12'])
  assert.equal(Object.hasOwn(written, 'code'), false)
  assert.equal(Object.hasOwn(written, 'codeCostPerTaskUsd'), false)
  assert.equal(Object.hasOwn(written, 'codeMinutesPerTask'), false)
  assert.equal(Object.hasOwn(written, 'codeChecked'), false)
  const claudeWritten = rows.find((r) => r.id === 'claude/haiku@high')
  assert.equal(claudeWritten.codeChecked, '2026-11-12')
})

test('a Claude page with no code figure still refreshes its intelligence so its Spark estimate follows it, leaves its code fields as they are, and never writes the ladder', async (t) => {
  const dir = tempDir(t, 'aether-refresh-nocode-claude-')
  const files = { pairs: path.join(dir, 'pairs.json'), ladder: path.join(dir, 'ladder.json') }
  const haikuHigh = row('claude/haiku@high', { slug: 'claude-haiku-5-5-high', intelligence: 29.6, costPerTaskUsd: 0.159, code: 21.72, codeCostPerTaskUsd: 0.331, codeMinutesPerTask: 12.1, checked: '2026-11-10', codeChecked: '2026-11-10' })
  const sparkHigh = { id: 'muse/muse-spark-1.3@high', slug: 'muse-spark-1-3-high', harness: 'muse', model: 'muse-spark-1.3', family: 'muse-spark-1.3', effort: 'high', group: 'muse', intelligence: 28.7, costPerTaskUsd: 0.824, outputTokensPerSecond: null, timeToFirstTokenS: null, estimateOf: 'claude/haiku@high', estimateDistance: -0.9, ownerDecision: 'Estimate = the figure of the Haiku row of the same effort plus a stored distance (spec 036 R10).' }
  const lines = [haikuHigh, sparkHigh].map((r) => `    ${spaced(r)}`)
  fs.writeFileSync(files.pairs, `{\n  "fetchedAt": "2026-10-19",\n  "pairs": [\n${lines.join(',\n')}\n  ]\n}\n`)
  fs.writeFileSync(files.ladder, `${JSON.stringify(LADDER, null, 2)}\n`)
  const ladderBefore = fs.readFileSync(files.ladder, 'utf8')
  const fetch = async (url) => {
    const slug = url.split('/').pop()
    return { ok: true, status: 200, text: async () => page(block(slug, fig(29.9, 0.159, 0.22, 0.34, 730)).replace('terminalbench-4-0', 'other-bench')) }
  }
  const out = await run(files, fetch, ['--write'])
  assert.equal(out.exitCode, 0)
  assert.match(out.stdout, /claude\/haiku@high: the page of claude-haiku-5-5-high has no code figure/)
  const rows = rowsOf(files)
  const haiku = rows.find((r) => r.id === 'claude/haiku@high')
  assert.deepEqual([haiku.intelligence, haiku.checked], [29.9, '2026-11-12'])
  // Existing code fields and their date are left as they are when the page gives no code figure.
  assert.deepEqual([haiku.code, haiku.codeCostPerTaskUsd, haiku.codeMinutesPerTask, haiku.codeChecked], [21.72, 0.331, 12.1, '2026-11-10'])
  const spark = rows.find((r) => r.id === 'muse/muse-spark-1.3@high')
  assert.equal(spark.intelligence, 29, 'the estimate is the refreshed reference plus the stored distance')
  assert.equal(fs.readFileSync(files.ladder, 'utf8'), ladderBefore)
})

test('a 403 or a 429 from a page stops the refresh: the page is named, no later page is asked, nothing is written, and the exit code is 1', async (t) => {
  for (const status of [403, 429]) {
    const files = setup(t)
    const before = fs.readFileSync(files.pairs, 'utf8')
    const asked = []
    const blocked = async (url) => {
      asked.push(url)
      if (url.endsWith('claude-a-xhigh')) return { ok: false, status, text: async () => '' }
      return serve(GOOD)(url)
    }
    const out = await run(files, blocked, ['--write'])
    assert.equal(out.exitCode, 1, out.stdout)
    assert.ok(out.stdout.includes(`answered ${status} for https://artificialanalysis.ai/models/claude-a-xhigh`), out.stdout)
    assert.ok(out.stdout.includes('Nothing was written.'), out.stdout)
    assert.deepEqual(asked, ['https://artificialanalysis.ai/models/claude-a-high', 'https://artificialanalysis.ai/models/claude-a-xhigh'])
    assert.equal(fs.readFileSync(files.pairs, 'utf8'), before)
  }
})

test('the refresh needs no key and sends none, and no longer reads or writes the lane table', async (t) => {
  const files = setup(t)
  const seen = []
  const env = process.env.ARTIFICIAL_ANALYSIS_API_KEY
  delete process.env.ARTIFICIAL_ANALYSIS_API_KEY
  t.after(() => { if (env !== undefined) process.env.ARTIFICIAL_ANALYSIS_API_KEY = env })
  const out = await main(['--pairs', files.pairs, '--ladder', files.ladder], { fetch: async (url, options) => (seen.push([url, options]), serve({ ...GOOD, 'agy-b-high': fig(44.4, 0.5, 0.2, 0.6, 600) })(url)), now: NOW, pause: async () => {} })
  assert.equal(out.exitCode, 0)
  assert.equal(seen.length, 3)
  assert.ok(seen.every(([url, options]) => url.startsWith('https://artificialanalysis.ai/models/') && !JSON.stringify(options ?? {}).includes('key')))
  const unknown = await main(['--config', 'x'], { fetch: async () => { throw new Error('no') } })
  assert.deepEqual([unknown.exitCode, unknown.stdout], [2, 'usage: node scripts/refresh-lanes.js [--pairs <path>] [--ladder <path>] [--write]\n'])
})

test('one pass leaves a single date on every row that has a page, and writes the intelligence of non-Claude rows from their page', async (t) => {
  const dir = tempDir(t, 'aether-refresh-all-')
  const files = { pairs: path.join(dir, 'pairs.json'), ladder: path.join(dir, 'ladder.json') }
  const claude = row('claude/haiku@high', { slug: 'claude-haiku-5-5-high', intelligence: 29.6, costPerTaskUsd: 0.159, code: 21.72, codeCostPerTaskUsd: 0.331, codeMinutesPerTask: 12.1, codeChecked: '2026-11-10' })
  const agy = row('agy/gemini-4-argon@high', { slug: 'gemini-4-argon', intelligence: 50, costPerTaskUsd: 7, code: undefined, codeCostPerTaskUsd: undefined, codeMinutesPerTask: undefined })
  delete agy.code
  delete agy.codeCostPerTaskUsd
  delete agy.codeMinutesPerTask
  const estimate = { id: 'muse/muse-spark-1.3@high', slug: 'muse-spark-1-3-high', harness: 'muse', model: 'muse-spark-1.3', family: 'muse-spark-1.3', effort: 'high', group: 'muse', intelligence: 28.7, costPerTaskUsd: 0.824, outputTokensPerSecond: null, timeToFirstTokenS: null, estimateOf: 'claude/haiku@high', estimateDistance: -0.9, ownerDecision: 'Estimate = the figure of the Haiku row of the same effort plus a stored distance (spec 036 R10).' }
  const lines = [claude, agy, estimate].map((r) => `    ${spaced(r)}`)
  fs.writeFileSync(files.pairs, `{\n  "fetchedAt": "2026-10-19",\n  "pairs": [\n${lines.join(',\n')}\n  ]\n}\n`)
  fs.writeFileSync(files.ladder, `${JSON.stringify(LADDER, null, 2)}\n`)
  const asked = []
  const out = await run(files, serve({ 'claude-haiku-5-5-high': fig(29.6, 0.159, 0.22, 0.34, 730), 'gemini-4-argon': fig(50.5, 7.1, 0.3, 1.2, 600) }, asked), ['--write'])
  assert.equal(out.exitCode, 0)
  assert.deepEqual([...asked].sort(), ['claude-haiku-5-5-high', 'gemini-4-argon'], 'one request per page, and none for the estimate without a page')
  const rows = rowsOf(files)
  const dated = rows.filter((r) => !Object.hasOwn(r, 'estimateOf'))
  assert.deepEqual(new Set(dated.flatMap((r) => [r.checked, r.codeChecked])), new Set(['2026-11-12']))
  const written = rows.find((r) => r.id === 'agy/gemini-4-argon@high')
  assert.deepEqual([written.intelligence, written.costPerTaskUsd], [50.5, 7.1])
  assert.deepEqual([written.code, written.codeCostPerTaskUsd, written.codeMinutesPerTask], [30, 1.2, 10])
  const spark = rows.find((r) => r.id === 'muse/muse-spark-1.3@high')
  assert.equal(spark.intelligence, 28.7)
  assert.equal(Object.hasOwn(spark, 'checked'), false)
  assert.equal(Object.hasOwn(spark, 'codeChecked'), false)
})

test('a Claude scale 0.3 points higher moves the Spark estimate with its reference and keeps its rung', async (t) => {
  const { ladderFrom } = require('../plugins/aether/lib/pareto.js')
  const { choose } = require('../plugins/aether/lib/superdelegation.js')
  const dir = tempDir(t, 'aether-refresh-rung-')
  const files = { pairs: path.join(dir, 'pairs.json'), ladder: path.join(dir, 'ladder.json') }
  const haikuHigh = row('claude/haiku@high', { slug: 'claude-haiku-5-5-high', intelligence: 29.6, costPerTaskUsd: 0.159, code: 21.72, codeCostPerTaskUsd: 0.331, codeMinutesPerTask: 12.1, codeChecked: '2026-11-10' })
  const haikuXhigh = row('claude/haiku@xhigh', { slug: 'claude-haiku-5-5-xhigh', intelligence: 34.3, costPerTaskUsd: 0.248, code: 29.29, codeCostPerTaskUsd: 0.46, codeMinutesPerTask: 16.3, codeChecked: '2026-11-10' })
  const sparkHigh = { id: 'muse/muse-spark-1.3@high', slug: 'muse-spark-1-3-high', harness: 'muse', model: 'muse-spark-1.3', family: 'muse-spark-1.3', effort: 'high', group: 'muse', intelligence: 28.7, costPerTaskUsd: 0.824, outputTokensPerSecond: null, timeToFirstTokenS: null, estimateOf: 'claude/haiku@high', estimateDistance: -0.9, ownerDecision: 'Estimate = the figure of the Haiku row of the same effort plus a stored distance (spec 036 R10).' }
  const lines = [haikuHigh, haikuXhigh, sparkHigh].map((r) => `    ${spaced(r)}`)
  fs.writeFileSync(files.pairs, `{\n  "fetchedAt": "2026-10-19",\n  "pairs": [\n${lines.join(',\n')}\n  ]\n}\n`)
  fs.writeFileSync(files.ladder, `${JSON.stringify(LADDER, null, 2)}\n`)
  const open = (hours) => ({ usable: true, quota: { windows: { weekly: { remaining: 0.5, resetsAt: new Date(Date.now() + hours * 3600000).toISOString() } } } })
  const harnesses = { muse: { installed: true, groups: { muse: open(1) } } }
  const pick = (pairs) => choose({ pairs, reference: { model: 'haiku', effort: 'high' }, harnesses }).picked?.id
  const names = (pairs) => ladderFrom(pairs.filter((r) => r.harness === 'claude'), LADDER.law).map(({ model, effort }) => `${model} ${effort}`)
  const before = JSON.parse(fs.readFileSync(files.pairs, 'utf8')).pairs
  assert.equal(pick(before), 'muse/muse-spark-1.3@high')
  const ladderBefore = names(before)
  const out = await run(files, serve({ 'claude-haiku-5-5-high': fig(29.9, 0.159, 0.2172, 0.331, 726), 'claude-haiku-5-5-xhigh': fig(34.6, 0.248, 0.2929, 0.46, 978) }), ['--write'])
  assert.equal(out.exitCode, 0)
  const after = rowsOf(files)
  const spark = after.find((r) => r.id === 'muse/muse-spark-1.3@high')
  assert.equal(spark.intelligence, 29, 'the estimate is the new reference plus the stored distance')
  assert.equal(pick(after), 'muse/muse-spark-1.3@high', 'the same pair still serves the rung')
  assert.deepEqual(names(after), ladderBefore, 'the same rungs in the same order')
})

test('the refresh never writes the ladder, and every request goes to a model page through the injected fetch', async (t) => {
  const files = setup(t)
  const before = fs.readFileSync(files.ladder, 'utf8')
  const asked = []
  const out = await run(files, serve({ ...GOOD, 'agy-b-high': fig(44.4, 0.5, 0.2, 0.6, 600) }, asked), ['--write'])
  assert.equal(out.exitCode, 0)
  assert.equal(fs.readFileSync(files.ladder, 'utf8'), before)
  assert.ok(asked.length > 0)
  assert.ok(asked.every((slug) => /^[a-z0-9.-]+$/.test(slug) && !slug.includes('api')), 'slugs only, no API address')
})

test('#236 3: a patch whose last field is numeric keeps the space before }, and --write with no changes prints no written to line', async (t) => {
  const dir = tempDir(t, 'aether-refresh-space-')
  const files = { pairs: path.join(dir, 'pairs.json'), ladder: path.join(dir, 'ladder.json') }
  // Every refreshed figure is already on the line, so nothing is appended: the patched
  // numeric field stays last, and the space before } must survive the patch.
  const last = { id: 'claude/a@high', slug: 'claude-a-high', harness: 'claude', model: 'a', family: 'claude-a', effort: 'high', group: null, intelligence: 20, costPerTaskUsd: 0.1, outputTokensPerSecond: 90, timeToFirstTokenS: 2, checked: '2026-11-10', codeChecked: '2026-11-10', code: 10, codeCostPerTaskUsd: 0.1, codeMinutesPerTask: 5 }
  const line = `    ${spaced(last)}`
  assert.match(line, /"codeMinutesPerTask": 5 \}$/, 'the fixture line ends with a numeric field')
  fs.writeFileSync(files.pairs, `{\n  "fetchedAt": "2026-10-19",\n  "pairs": [\n${line}\n  ]\n}\n`)
  fs.writeFileSync(files.ladder, `${JSON.stringify(LADDER, null, 2)}\n`)
  const first = await run(files, serve(GOOD), ['--write'])
  assert.match(first.stdout, /written to/)
  const written = fs.readFileSync(files.pairs, 'utf8')
  assert.ok(written.includes('"codeMinutesPerTask": 5.5 }'), 'the space before } survives the patch')
  assert.ok(!written.includes('5.5}'), 'no eaten space')
  const second = await run(files, serve(GOOD), ['--write'])
  assert.equal(second.exitCode, 0)
  assert.match(second.stdout, /No figure changed/)
  assert.doesNotMatch(second.stdout, /written to/)
  assert.equal(fs.readFileSync(files.pairs, 'utf8'), written, 'nothing is rewritten when nothing changed')
})

test('the file still exports the key helpers that scripts/build-models-index.js imports, and loads from a tree of two scripts', (t) => {
  const tree = tempDir(t, 'aether-refresh-tree-')
  fs.mkdirSync(path.join(tree, 'scripts'))
  fs.copyFileSync(path.join(__dirname, '..', 'scripts', 'refresh-lanes.js'), path.join(tree, 'scripts', 'refresh-lanes.js'))
  const copy = require(path.join(tree, 'scripts', 'refresh-lanes.js'))
  for (const name of ['keyFrom', 'keyFile', 'envFileFor']) assert.equal(typeof copy[name], 'function', name)
  assert.deepEqual([typeof copy.KEY, typeof copy.main], ['string', 'function'])
})

test('a page with no intelligenceIndex leaves that row\'s checked as it was, while a page with one stamps today', async (t) => {
  const dir = tempDir(t, 'aether-refresh-no-intelligence-')
  const files = { pairs: path.join(dir, 'pairs.json'), ladder: path.join(dir, 'ladder.json') }
  const bare = row('claude/a@high', { intelligence: 20, costPerTaskUsd: 0.1, code: 10, codeCostPerTaskUsd: 0.1, codeMinutesPerTask: 5, checked: '2026-10-30', codeChecked: '2026-11-10' })
  const dated = row('claude/a@xhigh', { intelligence: 30, costPerTaskUsd: 0.2, code: 12, codeCostPerTaskUsd: 0.2, codeMinutesPerTask: 6, checked: '2026-10-01', codeChecked: '2026-11-01' })
  const lines = [bare, dated].map((r) => `    ${spaced(r)}`)
  fs.writeFileSync(files.pairs, `{\n  "fetchedAt": "2026-10-19",\n  "pairs": [\n${lines.join(',\n')}\n  ]\n}\n`)
  fs.writeFileSync(files.ladder, `${JSON.stringify(LADDER, null, 2)}\n`)
  const noIndexBlock = block('claude-a-high', fig(21, 0.11, 0.11, 0.12, 330)).replace(/"intelligenceIndex":[^,]+,/, '')
  const noIndex = page(noIndexBlock)
  const withIndex = page(block('claude-a-xhigh', fig(31, 0.21, 0.22, 0.22, 500)))
  assert.equal(/"intelligenceIndex":/.test(noIndex.replace(/\\"/g, '"')), false, 'the fixture page has no intelligenceIndex')
  assert.equal(/"intelligenceIndex":31[,}]/.test(withIndex.replace(/\\"/g, '"')), true, 'the other fixture page carries a numeric intelligenceIndex')
  const fetch = async (url) => {
    const slug = url.split('/').pop()
    const html = slug === 'claude-a-high' ? noIndex : slug === 'claude-a-xhigh' ? withIndex : ''
    return html ? { ok: true, status: 200, text: async () => html } : { ok: false, status: 404, text: async () => '' }
  }
  const out = await run(files, fetch, ['--write'])
  assert.equal(out.exitCode, 0, out.stdout)
  const [left, stamped] = rowsOf(files)
  // No intelligence on the page: the old intelligence and its checked date stay. Code figures still land, so codeChecked moves.
  assert.deepEqual([left.intelligence, left.checked, left.code, left.codeCostPerTaskUsd, left.codeMinutesPerTask, left.codeChecked], [20, '2026-10-30', 11, 0.12, 5.5, '2026-11-12'])
  assert.deepEqual([stamped.intelligence, stamped.checked, stamped.code, stamped.codeChecked], [31, '2026-11-12', 22, '2026-11-12'])
})
