'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { main } = require('../scripts/build-models-index.js')
const { PAGE_URL } = require('../.claude/skills/artificial-analysis/aa-api.js')

// Pages in the shape of a saved AA page (tests/fixtures/aa-model-page-handmade-*.html, built with tests/aa-page-fixtures.js as the
// figuresOf tests build theirs). Only Terminal-Bench is read from a page: no page gives a coding index.
const WITH = fs.readFileSync(path.join(__dirname, 'fixtures', 'aa-model-page-handmade-with-figures.html'), 'utf8')
const WITHOUT = fs.readFileSync(path.join(__dirname, 'fixtures', 'aa-model-page-handmade-without-figures.html'), 'utf8')
// The page of a slug: the one with figures for its model, the one without for the others, named for the slug asked.
const pageOf = (slug) => (slug === 'model-with-figures' ? WITH : WITHOUT).replaceAll('model-without-figures', slug)

const NOW = () => new Date(2026, 10, 11, 12, 0, 0).getTime()
const noPause = async () => {}

const aa = (slug, name) => ({
  id: slug,
  name,
  slug,
  release_date: '2026-03-01',
  model_creator: { name: 'Acme' },
  evaluations: { artificial_analysis_intelligence_index: 40, artificial_analysis_coding_index: null, terminalbench_v4_0: null },
  pricing: { price_1m_input_tokens: 2, price_1m_output_tokens: 10 },
  performance: { median_output_tokens_per_second: 100, median_time_to_first_token_seconds: 5 },
})
const RAW = [aa('model-with-figures', 'Model with figures'), aa('model-without-figures', 'Model without figures'), aa('model-third', 'Model third')]
const LANES = { harnesses: { agy: { models: {} } } }
const LISTINGS = { capturedAt: '2026-11-11', harnesses: { agy: { listedBy: 'agy models', effortVia: 'id', models: ['model-with-figures', 'model-without-figures', 'model-third'] } } }
const profile = (name) => ({
  name,
  maker: 'Acme Labs',
  purpose: `"${name} is for tests."`,
  contextTokens: 1000000,
  maxOutputTokens: 128000,
  defaultEffort: 'high',
  price: { input: 2, output: 10 },
  knowledgeCutoff: '2026-06',
  availability: 'Everywhere.',
  caveats: ['A caveat.'],
  sources: ['https://example.com/acme'],
  checked: '2026-11-11',
})
const PROFILES = { profiles: Object.fromEntries(['model-with-figures', 'model-without-figures', 'model-third'].map((key) => [key, profile(`Model ${key}`)])) }

// A work directory with the inputs of a build (a saved list, so no key is needed), the data files in out/ and a README in docs/.
function workDir(t) {
  const dir = tempDir(t, 'models-index-pages-')
  fs.writeFileSync(path.join(dir, 'raw.json'), JSON.stringify(RAW))
  fs.writeFileSync(path.join(dir, 'lanes.json'), JSON.stringify(LANES))
  fs.mkdirSync(path.join(dir, 'out'))
  fs.mkdirSync(path.join(dir, 'docs'))
  fs.writeFileSync(path.join(dir, 'out', 'harness-models.json'), JSON.stringify(LISTINGS))
  fs.writeFileSync(path.join(dir, 'out', 'profiles.json'), JSON.stringify(PROFILES))
  fs.writeFileSync(path.join(dir, 'docs', 'README.md'), '# Mine\n\n<!-- models-index:start -->\nold\n<!-- models-index:end -->\n')
  return dir
}

const argsOf = (dir) => ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out'), '--docs', path.join(dir, 'docs'), '--harnesses', 'agy']

// A fetch that answers each page from pageOf, and answers 429 to the request number `blockAt` (1-based), when given.
function pageServer({ blockAt = null } = {}) {
  const calls = []
  const fetch = async (url, options) => {
    calls.push({ url, options })
    if (calls.length === blockAt) return { ok: false, status: 429, text: async () => '' }
    return { ok: true, status: 200, text: async () => pageOf(url.slice(PAGE_URL.length)) }
  }
  return { fetch, calls }
}

test('without --pages no request goes to a page address', async (t) => {
  const dir = workDir(t)
  const { fetch, calls } = pageServer()
  const out = await main(argsOf(dir), { env: {}, fetch, now: NOW, pause: noPause })
  assert.equal(out.exitCode, 0)
  assert.equal(calls.some((call) => call.url.startsWith(PAGE_URL)), false)
  assert.ok(out.stdout.includes('Not given by the source in any row, so left out of models.json: coding, terminalBench.'))
})

test('with --pages, one request per offered model, never two for one page, and each model keeps the figures its page gives', async (t) => {
  const dir = workDir(t)
  const cache = tempDir(t, 'models-index-pages-cache-')
  const { fetch, calls } = pageServer()
  const out = await main([...argsOf(dir), '--pages', '--cache', cache, '--write'], { env: {}, fetch, now: NOW, pause: noPause })
  assert.equal(out.exitCode, 0, out.stdout)
  const urls = calls.map((call) => call.url)
  assert.deepEqual([...urls].sort(), [`${PAGE_URL}model-third`, `${PAGE_URL}model-with-figures`, `${PAGE_URL}model-without-figures`])
  assert.equal(new Set(urls).size, urls.length)

  const file = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'models.json'), 'utf8'))
  const scores = (model) => file.models.find((entry) => entry.model === model).scores[0]
  assert.equal(scores('model-with-figures').terminalBench, 0.404)
  assert.equal('coding' in scores('model-without-figures'), false)
  assert.equal('terminalBench' in scores('model-without-figures'), false)
  // No page gives a coding index, so none is in the index: the key is absent from models.json.
  assert.equal(fs.readFileSync(path.join(dir, 'out', 'models.json'), 'utf8').includes('"coding"'), false)
  // The index cites both the API address and the model pages.
  assert.equal(file.source, `https://artificialanalysis.ai/api/v2/language/models/free and the model pages ${PAGE_URL}<slug>`)
  // The summary says how many pages came from the network, that neither the API nor the pages give a coding index, and which models gave no Terminal-Bench.
  assert.match(out.stdout, /Pages: 3 read from the network, 0 from the cache/)
  assert.match(out.stdout, /Neither the API nor the model pages give a coding index: coding is left out of models\.json\./)
  assert.match(out.stdout, /no Terminal-Bench \(2\): model-third, model-without-figures\./)
  assert.equal(out.stdout.includes('Not given by the source in any row'), false)
})

test('a second run with the same cache folder makes no page request', async (t) => {
  const dir = workDir(t)
  const cache = tempDir(t, 'models-index-pages-cache-')
  await main([...argsOf(dir), '--pages', '--cache', cache], { env: {}, fetch: pageServer().fetch, now: NOW, pause: noPause })
  const again = pageServer()
  const out = await main([...argsOf(dir), '--pages', '--cache', cache, '--write'], { env: {}, fetch: again.fetch, now: NOW, pause: noPause })
  assert.equal(out.exitCode, 0)
  assert.equal(again.calls.length, 0)
  assert.match(out.stdout, /Pages: 0 read from the network, 3 from the cache/)
  assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), true)
})

test('a 429 on the third page stops the pass: no fourth request, no index, a non-zero exit, and the message names the page', async (t) => {
  const dir = workDir(t)
  const cache = tempDir(t, 'models-index-pages-cache-')
  const { fetch, calls } = pageServer({ blockAt: 3 })
  const out = await main([...argsOf(dir), '--pages', '--cache', cache, '--write'], { env: {}, fetch, now: NOW, pause: noPause })
  assert.equal(calls.length, 3)
  assert.equal(out.exitCode, 1)
  assert.ok(out.stdout.includes(calls[2].url), out.stdout)
  assert.match(out.stdout, /answered 429/)
  assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false)
  assert.equal(fs.readFileSync(path.join(dir, 'docs', 'README.md'), 'utf8').includes('old'), true)
})

test('the pause between two page requests is at least 1.5 seconds, through an injected pause', async (t) => {
  const dir = workDir(t)
  const cache = tempDir(t, 'models-index-pages-cache-')
  const pauses = []
  const { fetch, calls } = pageServer()
  const out = await main([...argsOf(dir), '--pages', '--cache', cache], { env: {}, fetch, now: NOW, pause: async (ms) => pauses.push(ms) })
  assert.equal(out.exitCode, 0)
  assert.equal(calls.length, 3)
  assert.equal(pauses.length, calls.length - 1)
  assert.ok(pauses.every((ms) => ms >= 1500), `pauses: ${pauses}`)
})
