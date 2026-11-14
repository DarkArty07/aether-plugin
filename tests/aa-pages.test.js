'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { block, page, pageFromExtract, snapshotOf } = require('./aa-page-fixtures.js')
const reader = require('../scripts/aa-pages.js')

const EVIDENCE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'specs', '038-aa-pages-hydrogen', 'evidence', 'aa-extract-2026-11-13.json'), 'utf8'))
const OWN = { intelligence: 51.8421, cost: 3.4646622, code: 0.565656565656566, codeCost: 5.118905, seconds: 955.9325 }
const NEIGHBOUR = { intelligence: 10, cost: 9, code: 0.9, codeCost: 9, seconds: 9 }
const URL_OF = (slug) => `${reader.PAGE_URL}${slug}`
const ok = (html) => ({ ok: true, status: 200, text: async () => html })
const answer = (status) => ({ ok: false, status, text: async () => '' })
const NOW = () => new Date(2026, 10, 13, 12, 0, 0).getTime()

function setup(t, { pairs = null, snapshot = null } = {}) {
  const dir = tempDir(t, 'aether-aa-pages-')
  const files = { snapshot: path.join(dir, 'aa-pages.json'), pairs: path.join(dir, 'pairs.json'), cache: path.join(dir, 'cache') }
  if (snapshot) fs.writeFileSync(files.snapshot, reader.serializeSnapshot(snapshot))
  if (pairs) fs.writeFileSync(files.pairs, JSON.stringify({ fetchedAt: '2026-10-19', pairs }))
  return files
}
const run = (files, args, fetch, extra = {}) =>
  reader.main(['read', ...args, '--snapshot', files.snapshot, '--pairs', files.pairs, '--cache', files.cache], { fetch, pause: async () => {}, now: NOW, ...extra })
const read = (files) => JSON.parse(fs.readFileSync(files.snapshot, 'utf8'))
const row = (id, over = {}) => ({ id, slug: over.slug ?? id.replace(/[/@.]/g, '-'), harness: id.split('/')[0], ...over })

test('parsePage reads the block of the page\'s own model, never a neighbour\'s or the first of the page, rounded as the tables keep them', () => {
  const html = page(block('claude-other-5-5', NEIGHBOUR), block('claude-opus-5-5-high', OWN), block('claude-next-5-5', NEIGHBOUR))
  const found = reader.parsePage(html, 'claude-opus-5-5-high')
  assert.equal(found.name, 'Model claude-opus-5-5-high')
  assert.deepEqual(
    [found.figures.intelligence, found.figures.costPerTaskUsd, found.figures.code, found.figures.codeCostPerTaskUsd, found.figures.codeMinutesPerTask, found.figures.terminalBench, found.figures.briefcaseElo, found.figures.briefcaseRubricPassRate],
    [51.8, 3.465, 56.57, 5.119, 15.9, 0.566, 1100, 0.3])
  assert.equal(reader.parsePage(html, 'claude-missing-5-5'), null)
  // A figure the page does not carry is absent from `figures`, never null.
  assert.equal(Object.hasOwn(found.figures, 'priceInput'), false)
  assert.equal(Object.values(found.figures).every((value) => Number.isFinite(value)), true)
  // Without a Terminal-Bench eval the block has no code figure, and keeps the others.
  const noCode = reader.parsePage(page(block('claude-opus-5-5-high', OWN).replace('terminalbench-4-0', 'other-bench')), 'claude-opus-5-5-high')
  assert.deepEqual([Object.hasOwn(noCode.figures, 'code'), noCode.figures.intelligence], [false, 51.8])
})

test('parsePage reads every field of the 13 pages read on 2026-11-13, as the evidence table gives them', () => {
  const spot = {
    'gemini-4-hydrogen-medium': { intelligence: 41.2, costPerTaskUsd: 0.798, code: 29.29, terminalBench: 0.293, priceInput: 1.5, priceOutput: 7.5, cacheReadPrice: 0.075 },
    'gemini-4-hydrogen-high': { intelligence: 50.8, costPerTaskUsd: 1.873, code: 54.04, briefcaseElo: 1497, briefcaseRubricPassRate: 0.524 },
    'claude-haiku-5-5-high': { intelligence: 29.9, costPerTaskUsd: 0.159, code: 21.72 },
    'claude-opus-5-5-high': { intelligence: 51.8, costPerTaskUsd: 3.465, code: 56.57 },
  }
  for (const [slug, entry] of Object.entries(EVIDENCE)) {
    const found = reader.parsePage(pageFromExtract(entry), slug)
    assert.ok(found, slug)
    assert.equal(found.name, entry.name, slug)
    assert.equal(found.figures.intelligence, Math.round(entry.scalars.intelligenceIndex * 10) / 10, slug)
  }
  for (const [slug, expected] of Object.entries(spot)) {
    const figures = reader.parsePage(pageFromExtract(EVIDENCE[slug]), slug).figures
    for (const [key, value] of Object.entries(expected)) assert.equal(figures[key], value, `${slug} ${key}`)
  }
  // Argon medium has no Terminal-Bench eval on its page: no code figure, and the reader does not invent one.
  assert.equal(Object.hasOwn(reader.parsePage(pageFromExtract(EVIDENCE['gemini-4-argon-medium']), 'gemini-4-argon-medium').figures, 'code'), false)
})

test('a field the page does not bring keeps its previous value with its previous date, and the others of the same address take the new date', () => {
  const before = { pages: { a: { readOn: '2026-11-01', name: 'A', figures: { intelligence: { value: 40, on: '2026-11-01' }, code: { value: 30, on: '2026-11-01' } } } } }
  const copy = JSON.stringify(before)
  const results = new Map([['a', { ok: true, name: 'A (High)', figures: { intelligence: 41.2, priceInput: 1.5 } }]])
  const { snapshot, summary } = reader.mergeSnapshot(before, results, '2026-11-13')
  assert.deepEqual(snapshot.pages.a.figures.intelligence, { value: 41.2, on: '2026-11-13' })
  assert.deepEqual(snapshot.pages.a.figures.priceInput, { value: 1.5, on: '2026-11-13' })
  assert.deepEqual(snapshot.pages.a.figures.code, { value: 30, on: '2026-11-01' })
  assert.deepEqual([snapshot.pages.a.readOn, snapshot.pages.a.name], ['2026-11-13', 'A (High)'])
  assert.ok(summary.missing.a.includes('code') && !summary.missing.a.includes('intelligence'))
  assert.equal(JSON.stringify(before), copy, 'the snapshot given is not changed')
  // An address whose page gave no figure at all stays as it was, readOn included, and is named as missing everything.
  const empty = reader.mergeSnapshot(before, new Map([['a', { ok: true, name: 'A', figures: {} }]]), '2026-11-13')
  assert.deepEqual(empty.snapshot.pages.a, before.pages.a)
  assert.equal(empty.summary.missing.a.length, reader.FIGURES.length)
})

test('the file has one line per address, the addresses sorted, the figures in the fixed order, and is the same text every time', () => {
  const shot = { pages: {
    'b-model': { readOn: '2026-11-13', name: 'B', figures: { code: { value: 3, on: '2026-11-13' }, intelligence: { value: 4, on: '2026-11-13' } } },
    'a-model': { readOn: '2026-11-13', name: 'A', figures: { intelligence: { value: 1, on: '2026-11-13' } } },
  } }
  const text = reader.serializeSnapshot(shot)
  const lines = text.split('\n')
  assert.deepEqual([lines[0], lines[1], lines.at(-3), lines.at(-2), lines.at(-1)], ['{', '  "pages": {', '  }', '}', ''])
  assert.equal(lines.filter((line) => line.includes('"readOn"')).length, 2)
  assert.ok(lines.findIndex((line) => line.includes('"a-model"')) < lines.findIndex((line) => line.includes('"b-model"')))
  assert.ok(text.indexOf('"intelligence"', text.indexOf('"b-model"')) < text.indexOf('"code"', text.indexOf('"b-model"')))
  assert.equal(reader.serializeSnapshot(JSON.parse(text)), text)
})

test('a 403 or a 429 stops the pass: nothing is written, the address is named, and no later address is asked', async (t) => {
  for (const status of [403, 429]) {
    const files = setup(t)
    const asked = []
    const fetch = async (url) => {
      asked.push(url)
      return url === URL_OF('b') ? answer(status) : ok(page(block(url.split('/').pop(), OWN)))
    }
    const out = await run(files, ['a', 'b', 'c'], fetch)
    assert.equal(out.exitCode, 1)
    assert.deepEqual(asked, [URL_OF('a'), URL_OF('b')])
    assert.match(out.stdout, new RegExp(`answered ${status} for ${URL_OF('b').replace(/[.]/g, '\\.')}`))
    assert.match(out.stdout, /Nothing was written\./)
    assert.equal(fs.existsSync(files.snapshot), false)
  }
})

test('a 404, a 5xx, a network error, a timeout and a page with no block of the slug each leave that address unread and named with its cause, keep its values, write the others and end with a code other than zero', async (t) => {
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
  const cases = [
    ['http 404', async () => answer(404)],
    ['http 503', async () => answer(503)],
    ['network', async () => { throw new TypeError('fetch failed') }],
    ['timeout', async () => { throw timeout }],
    ['no-block', async () => ok(page(block('some-other-model', OWN)))],
  ]
  for (const [cause, bad] of cases) {
    const previous = { pages: { bad: { readOn: '2026-11-01', name: 'Bad', figures: { intelligence: { value: 40, on: '2026-11-01' } } } } }
    const files = setup(t, { snapshot: previous })
    const fetch = async (url) => (url === URL_OF('bad') ? bad() : ok(page(block(url.split('/').pop(), OWN))))
    const out = await run(files, ['good-1', 'bad', 'good-2'], fetch)
    assert.equal(out.exitCode, 1, cause)
    assert.match(out.stdout, new RegExp(`Not read: bad \\(${cause}\\)`), cause)
    const written = read(files)
    assert.deepEqual(Object.keys(written.pages), ['bad', 'good-1', 'good-2'], cause)
    assert.deepEqual(written.pages.bad, previous.pages.bad, cause)
    assert.equal(written.pages['good-1'].figures.intelligence.value, 51.8, cause)
    assert.equal(written.pages['good-2'].readOn, '2026-11-13', cause)
  }
})

test('a run with no failure ends with code 0, names the fields the pages did not bring, and a second run writes the same bytes', async (t) => {
  const files = setup(t)
  const fetch = async (url) => ok(page(block(url.split('/').pop(), OWN)))
  const first = await run(files, ['a', 'b'], fetch)
  assert.equal(first.exitCode, 0, first.stdout)
  assert.match(first.stdout, /^Read 2 address\(es\): 2 written, 0 not read\./)
  assert.match(first.stdout, /Missing fields: a: .*priceInput/)
  const text = fs.readFileSync(files.snapshot, 'utf8')
  const second = await run(files, ['a', 'b'], fetch)
  assert.equal(second.exitCode, 0)
  assert.equal(fs.readFileSync(files.snapshot, 'utf8'), text)
})

test('one request per address with a pause of at least 1.5 s between two, a cached page costs no request and no pause, and no key is sent', async (t) => {
  const files = setup(t)
  const asked = []
  const pauses = []
  const fetch = async (url, options) => { asked.push([url, options]); return ok(page(block(url.split('/').pop(), OWN))) }
  await run(files, ['a', 'b', 'c'], fetch, { pause: async (ms) => pauses.push(ms) })
  assert.deepEqual(asked.map(([url]) => url), [URL_OF('a'), URL_OF('b'), URL_OF('c')])
  assert.deepEqual(pauses, [1500, 1500])
  for (const [, options] of asked) assert.equal(/key|authorization/i.test(JSON.stringify(options ?? {})), false)
  assert.match(asked[0][1].headers['user-agent'], /aether-plugin models reader/)
  const again = []
  await run(files, ['a', 'b', 'c'], async (url) => { again.push(url); return ok('') }, { pause: async (ms) => again.push(ms) })
  assert.deepEqual(again, [], 'the pages are in the cache folder: no request and no pause')
})

test('with no address it reads the rows of the pairs table that have a page, once each; with --harness, that harness and Claude; with names, only those', async (t) => {
  const pairs = [
    row('claude/haiku@high', { slug: 'claude-haiku-5-5-high' }),
    row('agy/claude-sonnet-5-5@high', { slug: 'claude-sonnet-5-5-high' }),
    row('agy/gemini-4-argon@high', { slug: 'gemini-4-argon' }),
    row('claude/sonnet@high', { slug: 'claude-sonnet-5-5-high' }),
    row('muse/muse-spark-1.3@low', { slug: 'muse-spark-1-3-low', estimateOf: 'claude/haiku@low' }),
    row('grok/grok-4.7@low', { slug: 'grok-4-7-low' }),
  ]
  const asked = []
  const fetch = async (url) => { asked.push(url.split('/').pop()); return ok(page(block(url.split('/').pop(), OWN))) }
  const files = setup(t, { pairs })
  await run(files, [], fetch)
  assert.deepEqual(asked, ['claude-haiku-5-5-high', 'claude-sonnet-5-5-high', 'gemini-4-argon', 'grok-4-7-low'])
  asked.length = 0
  await run(setup(t, { pairs }), ['--harness', 'agy'], fetch)
  assert.deepEqual(asked, ['claude-haiku-5-5-high', 'claude-sonnet-5-5-high', 'gemini-4-argon'])
  asked.length = 0
  await run(setup(t, { pairs }), ['gemini-4-hydrogen-low', 'gemini-4-hydrogen'], fetch)
  assert.deepEqual(asked, ['gemini-4-hydrogen-low', 'gemini-4-hydrogen'])
})

test('a bad argument prints the usage and exits 2, and a slug that is not a page address is not asked', async (t) => {
  const files = setup(t)
  const out = await reader.main(['read', '--nope'], { fetch: async () => { throw new Error('no request expected') } })
  assert.equal(out.exitCode, 2)
  assert.match(out.stdout, /^usage: node scripts\/aa-pages\.js read /)
  const asked = []
  const bad = await run(files, ['../etc/passwd'], async (url) => { asked.push(url); return ok('') })
  assert.deepEqual(asked, [])
  assert.match(bad.stdout, /Not read: \.\.\/etc\/passwd \(bad-slug\)/)
  assert.equal(bad.exitCode, 1)
})

test('snapshotOf dates a bare number with `on`, copies an { value, on } as given, and defaults readOn to `on` and name to `Model <slug>`', () => {
  const shot = snapshotOf({
    a: { figures: { intelligence: 41.5, code: { value: 43.94, on: '2026-11-12' } } },
    b: { readOn: '2026-11-10', name: 'B', figures: {} },
  })
  assert.deepEqual(shot.pages.a, { readOn: '2026-11-13', name: 'Model a', figures: { intelligence: { value: 41.5, on: '2026-11-13' }, code: { value: 43.94, on: '2026-11-12' } } })
  assert.deepEqual(shot.pages.b, { readOn: '2026-11-10', name: 'B', figures: {} })
  const other = snapshotOf({ a: { figures: { intelligence: 1 } } }, '2026-11-01').pages.a
  assert.deepEqual([other.readOn, other.figures.intelligence.on], ['2026-11-01', '2026-11-01'])
})

test('parsePage finds a benchmark object wherever the page places it in the model block', () => {
  const html = page(block('a', OWN).replace('"evals":[', '"benchmarks":['))
  assert.equal(reader.parsePage(html, 'a').figures.code, 56.57)
})
