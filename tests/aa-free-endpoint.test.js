'use strict'

// Issue 233: Artificial Analysis retired /api/v2/data/llms/models (HTTP 410 since 2026-11-04). The index is read from the
// free list /api/v2/language/models/free, paged, with the same key. The fixture is page 1 of that list, cut to nine rows.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { buildIndex, main } = require('../scripts/build-models-index.js')

const ROOT = path.join(__dirname, '..')
const FREE = 'https://artificialanalysis.ai/api/v2/language/models/free'
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'aa-language-free-2026-11-11.json'), 'utf8'))
const NOW = () => new Date(2026, 10, 11, 12, 0, 0).getTime()

// Two pages of the new shape, from the fixture's rows.
function pageOf(number, total, rows, hasMore) {
  return { tier: 'free', intelligence_index_version: 5, pagination: { page: number, page_size: 200, total_pages: total, has_more: hasMore }, data: rows }
}
const ROWS = FIXTURE.data
const PAGE_1 = pageOf(1, 2, ROWS.slice(0, 5), true)
const PAGE_2 = pageOf(2, 2, ROWS.slice(5), false)

// A directory with the inputs of a build: an empty lane table, one harness listing (agy, which lists the two Claude
// models of the fixture), the profiles of their families, and an empty out folder and docs folder.
function workDir(t) {
  const dir = tempDir(t, 'aa-free-')
  const listings = { capturedAt: '2026-11-11', harnesses: { agy: { listedBy: 'agy models', effortVia: 'id', models: ['claude-sonnet-5-5-medium', 'claude-haiku-5-5-low'] } } }
  const profile = (name) => ({ name, maker: 'Anthropic', purpose: '"tests"', contextTokens: null, maxOutputTokens: null, defaultEffort: null, price: null, knowledgeCutoff: null, availability: null, caveats: [], sources: [], checked: '2026-11-11' })
  fs.writeFileSync(path.join(dir, 'lanes.json'), JSON.stringify({ harnesses: {} }))
  fs.writeFileSync(path.join(dir, 'harness-models.json'), JSON.stringify(listings))
  fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify({ profiles: { 'claude-sonnet-5-5': profile('Claude Sonnet 5.5'), 'claude-haiku-5-5': profile('Claude Haiku 5.5') } }))
  fs.mkdirSync(path.join(dir, 'out'))
  fs.mkdirSync(path.join(dir, 'docs'))
  return dir
}
const args = (dir, extra = []) => ['--lanes', path.join(dir, 'lanes.json'), '--harness', path.join(dir, 'harness-models.json'), '--profiles', path.join(dir, 'profiles.json'), '--out', path.join(dir, 'out'), '--docs', path.join(dir, 'docs'), '--harnesses', 'agy', ...extra]

test('the index reads the free list page by page: page 1 at the address, then ?page=2, with the key header, and stops when has_more is false', async (t) => {
  const dir = workDir(t)
  const asked = []
  const fetch = async (url, init) => {
    asked.push([url, init.headers['x-api-key']])
    const body = url === FREE ? PAGE_1 : url === `${FREE}?page=2` ? PAGE_2 : null
    return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404 }
  }
  const result = await main(args(dir, ['--write']), { env: { ARTIFICIAL_ANALYSIS_API_KEY: 'test-key' }, fetch, now: NOW })
  assert.equal(result.exitCode, 0, result.stdout)
  assert.deepEqual(asked, [[FREE, 'test-key'], [`${FREE}?page=2`, 'test-key']])
  assert.equal(result.stdout.includes('test-key'), false)
  const file = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'models.json'), 'utf8'))
  assert.equal(file.source, FREE)
})

test('a source that keeps saying it has more pages is stopped after 20 requests, with no index written', async (t) => {
  const dir = workDir(t)
  let requests = 0
  const fetch = async () => {
    requests++
    return { ok: true, status: 200, json: async () => pageOf(requests, 99, ROWS.slice(0, 1), true) }
  }
  const result = await main(args(dir, ['--write']), { env: { ARTIFICIAL_ANALYSIS_API_KEY: 'test-key' }, fetch, now: NOW })
  assert.equal(requests, 20)
  assert.equal(result.exitCode, 1)
  assert.match(result.stdout, /more than 20 pages/)
  assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false)
})

test('a row of the free list fills the fields the old shape filled, and the fields it no longer gives are absent, not zero', () => {
  const index = buildIndex(ROWS, { since: '2026-01-01', lanes: {}, harnessModels: {}, generatedAt: '2026-11-11', harnesses: ['agy'], offeredOnly: false })
  const sonnet = index.families.find((family) => family.family === 'claude-sonnet-5-5')
  assert.equal(sonnet.name, 'Claude Sonnet 5.5')
  assert.equal(sonnet.creator, 'Anthropic')
  const medium = sonnet.variants.find((variant) => variant.effort === 'medium')
  assert.equal(medium.intelligence, 30.8)
  assert.equal(medium.priceInput, 2)
  assert.equal(medium.priceOutput, 10)
  assert.equal(medium.tokensPerSecond, 100.2)
  assert.equal(medium.ttftSeconds, 3.56)
  // The coding index is null in every row and Terminal-Bench is not in the answer: neither is a number in the index.
  assert.equal(medium.coding, null)
  assert.equal(medium.terminalBench, null)
  assert.equal(index.source, FREE)
  assert.deepEqual(index.notGiven, ['coding', 'terminalBench'])
})

test('the saved index writes no coding or terminalBench key, and the summary names the figures the source does not give', async (t) => {
  const dir = workDir(t)
  const saved = path.join(dir, 'page-1.json')
  fs.writeFileSync(saved, JSON.stringify(PAGE_1))
  fs.writeFileSync(path.join(dir, 'page-2.json'), JSON.stringify(PAGE_2))
  const result = await main(args(dir, ['--from', saved, '--from', path.join(dir, 'page-2.json'), '--write']), { env: {}, now: NOW })
  assert.equal(result.exitCode, 0, result.stdout)
  assert.match(result.stdout, /coding, terminalBench/)
  const file = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'models.json'), 'utf8'))
  const sonnet = file.models.find((model) => model.family === 'claude-sonnet-5-5')
  const score = sonnet.scores.find((item) => item.effort === 'medium')
  assert.deepEqual(Object.keys(score), ['effort', 'intelligence', 'priceInput', 'priceOutput', 'tokensPerSecond', 'ttftSeconds'])
  assert.equal(score.intelligence, 30.8)
})

test('a 410 from the source is a clear message and a non-zero exit, and never a partial index, on page 1 or a later page', async (t) => {
  const dir = workDir(t)
  const gone = { ok: false, status: 410, json: async () => ({ error: 'retired' }) }
  const first = await main(args(dir, ['--write']), { env: { ARTIFICIAL_ANALYSIS_API_KEY: 'test-key' }, fetch: async () => gone, now: NOW })
  assert.equal(first.exitCode, 1)
  assert.match(first.stdout, /answered 410/)
  assert.match(first.stdout, /retired/)
  assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false)

  const later = await main(args(dir, ['--write']), {
    env: { ARTIFICIAL_ANALYSIS_API_KEY: 'test-key' },
    fetch: async (url) => (url === FREE ? { ok: true, status: 200, json: async () => PAGE_1 } : gone),
    now: NOW,
  })
  assert.equal(later.exitCode, 1)
  assert.match(later.stdout, /answered 410/)
  assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false)
})

test('no file of scripts/ or .claude/skills/artificial-analysis/ holds the retired address', () => {
  const folders = [path.join(ROOT, 'scripts'), path.join(ROOT, '.claude', 'skills', 'artificial-analysis')]
  const hits = []
  for (const folder of folders) {
    for (const name of fs.readdirSync(folder, { recursive: true })) {
      const file = path.join(folder, name)
      if (!fs.statSync(file).isFile()) continue
      if (fs.readFileSync(file, 'utf8').includes('/api/v2/data/')) hits.push(path.relative(ROOT, file))
    }
  }
  assert.deepEqual(hits, [])
})

test('--from reads saved pages of the free list, and refuses one page of a list that has more', async (t) => {
  const dir = workDir(t)
  fs.writeFileSync(path.join(dir, 'page-1.json'), JSON.stringify(PAGE_1))
  fs.writeFileSync(path.join(dir, 'page-2.json'), JSON.stringify(PAGE_2))
  const both = await main(args(dir, ['--from', path.join(dir, 'page-1.json'), '--from', path.join(dir, 'page-2.json')]), { env: {}, now: NOW })
  assert.match(both.stdout, /^\d+ families/)
  const one = await main(args(dir, ['--from', path.join(dir, 'page-1.json')]), { env: {}, now: NOW })
  assert.equal(one.exitCode, 1)
  assert.match(one.stdout, /the answer has 2\./)
})

test('--from still reads a saved answer of the old address, a list with no pagination', async (t) => {
  const dir = workDir(t)
  const old = path.join(ROOT, 'tests', 'fixtures', 'codex', 'aa-api-2026-10-29.json')
  const result = await main(args(dir, ['--from', old]), { env: {}, now: NOW })
  assert.match(result.stdout, /^\d+ families/, result.stdout)
})
