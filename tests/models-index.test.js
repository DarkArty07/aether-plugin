'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { buildIndex, renderGenerated, mergeReadme, serialize, findFamily, splitId, main } = require('../scripts/build-models-index.js')

function aa(slug, name, { creator = 'Acme', date = '2026-03-01', intelligence = null, terminalBench = null, input = 2, output = 10, tps = 100, ttft = 5 } = {}) {
  return {
    id: slug,
    name,
    slug,
    release_date: date,
    model_creator: creator,
    evaluations: {
      artificial_analysis_intelligence_index: intelligence,
      artificial_analysis_coding_index: null,
      terminalbench_v4_0: terminalBench,
    },
    pricing: { price_1m_input_tokens: input, price_1m_output_tokens: output, price_1m_blended_3_to_1: 0 },
    median_output_tokens_per_second: tps,
    median_time_to_first_token_seconds: ttft,
  }
}

const RAW = [
  aa('acme-1', 'Acme 1 (Max, Default Fallback)', { creator: { name: 'Acme', slug: 'acme' }, intelligence: 50, terminalBench: 0.5 }),
  aa('acme-1-high', 'Acme 1 (High, Default Fallback)', { creator: { name: 'Acme', slug: 'acme' }, intelligence: 46.84, terminalBench: 0.404, tps: 0, ttft: 0 }),
  aa('acme-1-low', 'Acme 1 (Low, Default Fallback)', { creator: { name: 'Acme', slug: 'acme' }, intelligence: 40, terminalBench: 0.2 }),
  aa('oldie-1', 'Oldie 1', { creator: { name: 'Old Labs' }, date: '2025-12-31', intelligence: 10 }),
  aa('edge-1', 'Edge 1 (Reasoning)', { creator: 'Edge Co', date: '2026-01-01', intelligence: 20, terminalBench: 0, input: 0, output: 0 }),
  aa('acme-1-5', 'Acme 1.5 (High)', { creator: { name: 'Acme' }, date: '2026-06-01', intelligence: 55 }),
  aa('tier-2', 'Tier 2 (High)', { creator: { name: 'Tierco' }, date: '2026-04-01', intelligence: 30 }),
  aa('tier-2-max', 'Tier 2 Max', { creator: { name: 'Tierco' }, date: '2026-05-01', intelligence: 35 }),
]

const LANES = {
  harnesses: {
    agy: {
      models: {
        'acme-1': { roles: ['implementer'], levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' }, aa: { slug: 'acme-1-high' } },
        'ghost-9': { roles: ['judge'], levels: { low: 'low', high: 'high' } },
      },
    },
    codex: { models: {} },
  },
}

const LISTINGS = {
  capturedAt: '2026-10-13',
  harnesses: {
    agy: { listedBy: 'agy models', effortVia: 'id', models: ['acme-1-low', 'acme-1-high', 'oldie-1-medium'] },
    codex: {
      listedBy: 'a cache',
      effortVia: 'flag',
      models: [
        { id: 'acme-1.5', efforts: ['low', 'high', 'max'], listed: true },
        { id: 'edge-1', efforts: ['low'], listed: false },
      ],
    },
    grok: { listedBy: 'grok models', effortVia: 'flag', efforts: ['low', 'medium', 'high', 'xhigh'], models: ['acme-1.5-build-fast'] },
    cursor: {
      listedBy: 'cursor-agent --list-models',
      effortVia: 'id',
      models: ['cursor-acme-1.5-high', 'cursor-acme-1.5-high-fast', 'acme-1-thinking-low', 'acme-1-thinking-extra-high', 'auto'],
    },
  },
}

const build = (extra = {}) => buildIndex(RAW, { since: '2026-01-01', lanes: LANES, harnessModels: LISTINGS, generatedAt: '2026-10-13', ...extra })
const family = (index, key) => index.families.find((entry) => entry.family === key)

test('a base model is one family with its effort variants, from the least effort to the most', () => {
  const acme = family(build(), 'acme-1')
  assert.deepEqual(
    acme.variants.map((variant) => [variant.slug, variant.effort]),
    [['acme-1-low', 'low'], ['acme-1-high', 'high'], ['acme-1', 'max']],
  )
  assert.equal(acme.name, 'Acme 1')
  assert.equal(acme.creator, 'Acme')
  assert.equal(acme.releaseDate, '2026-03-01')
  assert.deepEqual(acme.variants[1], {
    slug: 'acme-1-high',
    effort: 'high',
    label: 'High, Default Fallback',
    intelligence: 46.8,
    coding: null,
    terminalBench: 0.404,
    priceInput: 2,
    priceOutput: 10,
    tokensPerSecond: null,
    ttftSeconds: null,
  })
})

test('families are newest first, and only variants released since the date are in, the date included', () => {
  const index = build()
  assert.deepEqual(index.families.map((entry) => entry.family), ['acme-1-5', 'tier-2-max', 'tier-2', 'acme-1', 'edge-1'])
  assert.equal(family(index, 'oldie-1'), undefined)
  assert.equal(index.count, 5)
  assert.equal(index.variantCount, 7)
  assert.equal(index.since, '2026-01-01')
  assert.equal(index.generatedAt, '2026-10-13')
  assert.equal(buildIndex(RAW, { since: '2026-05-01' }).families.length, 2)
})

test('a 0 for speed, time to first token or price is null, a missing score is null and a 0 score stays 0', () => {
  const edge = family(build(), 'edge-1').variants[0]
  assert.equal(edge.effort, 'default')
  assert.equal(edge.terminalBench, 0)
  assert.equal(edge.priceInput, null)
  assert.equal(edge.priceOutput, null)
  const high = family(build(), 'acme-1').variants[1]
  assert.equal(high.tokensPerSecond, null)
  assert.equal(high.ttftSeconds, null)
  const low = family(build(), 'acme-1').variants[0]
  assert.equal(low.tokensPerSecond, 100)
  assert.equal(low.ttftSeconds, 5)
  assert.equal(low.coding, null)
})

test('the creator is read from an object with a name, or from a string', () => {
  const index = build()
  assert.equal(family(index, 'acme-1').creator, 'Acme')
  assert.equal(family(index, 'edge-1').creator, 'Edge Co')
})

test('a tier called max is not an effort, and a date stamp is part of the family', () => {
  const index = build()
  assert.deepEqual(family(index, 'tier-2').variants.map((variant) => variant.slug), ['tier-2'])
  assert.deepEqual(family(index, 'tier-2-max').variants.map((variant) => [variant.slug, variant.effort, variant.label]), [['tier-2-max', 'default', null]])
  assert.equal(family(index, 'tier-2-max').name, 'Tier 2 Max')

  const stamped = buildIndex([aa('flash', 'Flash (High)'), aa('flash-0420', 'Flash 0420 (High)'), aa('flash-0420-low', 'Flash 0420 (Low)')], {})
  assert.deepEqual(stamped.families.map((entry) => [entry.family, entry.variants.length]), [['flash', 1], ['flash-0420', 2]])
})

test('a suffix on another model\'s slug joins the entry with its own name, and the non-reasoning level is kept', () => {
  const index = buildIndex(
    [
      aa('hy3', 'Hy3', { date: '2026-07-06' }),
      aa('hy3-preview', 'Hy3-preview (Reasoning)', { date: '2026-04-23' }),
      aa('hy3-non-reasoning', 'Hy3-preview (Non-reasoning)', { date: '2026-04-23' }),
      aa('opus-4', 'Opus 4 (Max)'),
      aa('opus-4-non-reasoning', 'Opus 4 (Non-reasoning, High)'),
      aa('opus-4-adaptive', 'Opus 4 (Xhigh)'),
    ],
    {},
  )
  assert.deepEqual(index.families.map((entry) => entry.family), ['hy3', 'hy3-preview', 'opus-4'])
  assert.deepEqual(family(index, 'hy3-preview').variants.map((variant) => [variant.slug, variant.effort]), [['hy3-non-reasoning', 'non-reasoning'], ['hy3-preview', 'default']])
  assert.deepEqual(family(index, 'opus-4').variants.map((variant) => variant.effort), ['non-reasoning-high', 'xhigh', 'max'])
})

test('a harness model matches a family exactly, after normalizing, or as a guess, and records what the harness takes', () => {
  const index = build()
  const acme = family(index, 'acme-1')
  assert.deepEqual(acme.available, [
    {
      harness: 'agy',
      model: 'acme-1',
      match: 'exact',
      effortVia: 'id',
      efforts: ['low', 'high'],
      ids: { low: 'acme-1-low', high: 'acme-1-high' },
      fastIds: null,
      listing: 'listed',
      inLaneTable: true,
      roles: ['implementer'],
      levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' },
      aaSlug: 'acme-1-high',
    },
    {
      harness: 'cursor',
      model: 'acme-1-thinking',
      match: 'normalized',
      effortVia: 'id',
      efforts: ['low', 'xhigh'],
      ids: { low: 'acme-1-thinking-low', xhigh: 'acme-1-thinking-extra-high' },
      fastIds: null,
      listing: 'listed',
      inLaneTable: false,
      roles: [],
      levels: null,
      aaSlug: null,
    },
  ])

  const next = family(index, 'acme-1-5')
  assert.deepEqual(
    next.available.map((entry) => [entry.harness, entry.model, entry.match, entry.effortVia, entry.efforts]),
    [
      ['codex', 'acme-1.5', 'normalized', 'flag', ['low', 'high', 'max']],
      ['cursor', 'cursor-acme-1.5', 'guess', 'id', ['high']],
    ],
  )
  assert.deepEqual(next.available[1].fastIds, { high: 'cursor-acme-1.5-high-fast' })
  assert.equal(next.available[0].ids, null)

  assert.deepEqual(family(index, 'edge-1').available.map((entry) => [entry.harness, entry.listing]), [['codex', 'hidden']])
  assert.deepEqual(family(index, 'tier-2').available, [])
})

test('a harness model no family took is kept, with why: no entry, released before the date, or not listed', () => {
  const { unmatched } = build()
  assert.deepEqual(
    unmatched.map((entry) => [entry.harness, entry.model, entry.listing, entry.reason]),
    [
      ['agy', 'ghost-9', 'not-listed', 'no Artificial Analysis entry'],
      ['agy', 'oldie-1', 'listed', 'Artificial Analysis lists oldie-1, released 2025-12-31, before 2026-01-01'],
      ['grok', 'acme-1.5-build-fast', 'listed', 'no Artificial Analysis entry'],
      ['cursor', 'auto', 'listed', 'no Artificial Analysis entry'],
    ],
  )
  const ghost = unmatched[0]
  assert.deepEqual(ghost.efforts, ['low', 'high'])
  assert.equal(ghost.inLaneTable, true)
  assert.deepEqual(ghost.roles, ['judge'])
  assert.equal(unmatched[2].effortVia, 'flag')
  assert.deepEqual(unmatched[2].efforts, ['low', 'medium', 'high', 'xhigh'])
})

test('an id is split into its model, its effort and whether it is fast; a name is found as exact, normalized or guess', () => {
  assert.deepEqual(splitId('claude-opus-5-thinking-high-fast'), { model: 'claude-opus-5-thinking', effort: 'high', fast: true })
  assert.deepEqual(splitId('claude-4.6-opus-high-thinking'), { model: 'claude-4.6-opus-thinking', effort: 'high', fast: false })
  assert.deepEqual(splitId('gpt-5.5-extra-high'), { model: 'gpt-5.5', effort: 'xhigh', fast: false })
  assert.deepEqual(splitId('composer-2.5-fast'), { model: 'composer-2.5', effort: null, fast: true })
  assert.deepEqual(splitId('gpt-5.6-sol-none'), { model: 'gpt-5.6-sol', effort: 'none', fast: false })

  const all = new Map(['claude-opus-4-6', 'claude-sonnet-5-5', 'gemini-3-1-pro-preview', 'grok-4-7'].map((key) => [key, []]))
  assert.deepEqual(findFamily('claude-sonnet-5-5', all), { key: 'claude-sonnet-5-5', match: 'exact' })
  assert.deepEqual(findFamily('grok-4.7', all), { key: 'grok-4-7', match: 'normalized' })
  assert.deepEqual(findFamily('claude-sonnet-5-5-thinking', all), { key: 'claude-sonnet-5-5', match: 'normalized' })
  assert.deepEqual(findFamily('claude-4.6-opus-thinking', all), { key: 'claude-opus-4-6', match: 'guess' })
  assert.deepEqual(findFamily('gemini-3.1-pro', all), { key: 'gemini-3-1-pro-preview', match: 'guess' })
  assert.equal(findFamily('grok-4.7-build-fast', all), null)
})

test('the index is written with each record on one line, and the text reads back the same', () => {
  const index = build()
  const text = serialize(index)
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(index)))
  assert.ok(text.split('\n').some((line) => line.includes('"slug":"acme-1-low"') && line.includes('"effort":"low"') && line.includes('"ttftSeconds":5')))
  assert.equal(serialize(JSON.parse(text)), text)
})

test('the generated part of the README is one table per creator, newest first, with the best scores and the harness', () => {
  const text = renderGenerated(build())
  assert.ok(text.includes('| Acme (2) | Released |'))
  assert.ok(text.includes('| Edge Co (1) | Released |'))
  assert.ok(text.includes('| Acme 1 `acme-1` | 2026-03-01 | low, high, max | 50 (max) | 0.5 (max) | 2 / 10 | 100 | agy*, cursor |'))
  assert.ok(text.includes('| Acme 1.5 `acme-1-5` | 2026-06-01 | high | 55 | – | 2 / 10 | 100 | codex, cursor |'))
  assert.ok(text.indexOf('Acme 1.5 `acme-1-5`') < text.indexOf('Acme 1 `acme-1`'))
  assert.ok(text.includes('- agy: no AA entry: `ghost-9`; released before 2026-01-01: `oldie-1`'))
  assert.ok(text.includes('agy* `acme-1` low/high'))
})

test('mergeReadme replaces only what is between the markers, makes a missing README, and refuses one with no markers', () => {
  const START = '<!-- models-index:start -->'
  const END = '<!-- models-index:end -->'
  const old = `# Title\n\nby hand\n\n${START}\nold table\n${END}\n\nafter\n`
  assert.equal(mergeReadme(old, 'new table'), `# Title\n\nby hand\n\n${START}\nnew table\n${END}\n\nafter\n`)
  assert.equal(mergeReadme(null, 'new table'), `# Models released since 2026-01\n\n${START}\nnew table\n${END}\n`)
  assert.equal(mergeReadme('# Title\nno markers\n', 'new table'), null)
})

// A directory with the inputs of a build: the raw list, the lane table, the harness listings and a README.
function workDir(t) {
  const dir = tempDir(t, 'models-index-')
  fs.writeFileSync(path.join(dir, 'raw.json'), JSON.stringify(RAW))
  fs.writeFileSync(path.join(dir, 'lanes.json'), JSON.stringify(LANES))
  fs.mkdirSync(path.join(dir, 'out'))
  fs.writeFileSync(path.join(dir, 'out', 'harness-models.json'), JSON.stringify(LISTINGS))
  fs.writeFileSync(path.join(dir, 'out', 'README.md'), '# Mine\n\nkept\n\n<!-- models-index:start -->\nold\n<!-- models-index:end -->\n\nalso kept\n')
  return dir
}

const NOW = () => new Date(2026, 9, 13, 12, 0, 0).getTime()

test('main builds from a saved list with no key, writes only with --write, and keeps the README text it did not generate', async (t) => {
  const dir = workDir(t)
  const args = ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out')]

  const dry = await main(args, { env: {}, fetch: async () => assert.fail('no request without a key'), now: NOW })
  assert.equal(dry.exitCode, 0)
  assert.match(dry.stdout, /^5 families, 7 variants released since 2026-01-01\./)
  assert.match(dry.stdout, /Reached by harness \(families\): agy 1, codex 2, grok 0, cursor 2\./)
  assert.match(dry.stdout, /Unmatched harness models \(4\): agy\/ghost-9, agy\/oldie-1, grok\/acme-1\.5-build-fast, cursor\/auto\./)
  assert.equal(fs.existsSync(path.join(dir, 'out', 'index.json')), false)

  const wrote = await main([...args, '--write'], { env: {}, now: NOW })
  assert.equal(wrote.exitCode, 0)
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'index.json'), 'utf8'))
  assert.equal(index.generatedAt, '2026-10-13')
  assert.equal(index.families.length, 5)
  const readme = fs.readFileSync(path.join(dir, 'out', 'README.md'), 'utf8')
  assert.ok(readme.startsWith('# Mine\n\nkept\n\n<!-- models-index:start -->\n## Families by creator'))
  assert.ok(readme.endsWith('<!-- models-index:end -->\n\nalso kept\n'))
})

test('main without --from asks the API with the key, never prints it, and says why when it cannot', async (t) => {
  const dir = workDir(t)
  const args = ['--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out')]
  const seen = []
  const fetch = async (url, init) => {
    seen.push([url, init.headers['x-api-key']])
    return { ok: true, status: 200, json: async () => ({ data: RAW }) }
  }
  const env = { ARTIFICIAL_ANALYSIS_API_KEY: 'secret-key' }

  const live = await main([...args, '--write'], { env, fetch, now: NOW })
  assert.equal(live.exitCode, 0)
  assert.deepEqual(seen, [['https://artificialanalysis.ai/api/v2/data/llms/models', 'secret-key']])
  assert.equal(live.stdout.includes('secret-key'), false)
  for (const file of ['index.json', 'README.md']) {
    assert.equal(fs.readFileSync(path.join(dir, 'out', file), 'utf8').includes('secret-key'), false)
  }

  const none = await main(args, { env: { AETHER_DATA_DIR: dir }, fetch, now: NOW })
  assert.deepEqual(none, { exitCode: 1, stdout: `ARTIFICIAL_ANALYSIS_API_KEY is not set, and ${path.join(dir, '.env')} does not have it.\n` })

  const refused = await main(args, { env, fetch: async () => ({ ok: false, status: 401 }), now: NOW })
  assert.deepEqual(refused, { exitCode: 1, stdout: 'Artificial Analysis answered 401.\n' })

  const odd = await main(args, { env, fetch: async () => ({ ok: true, status: 200, json: async () => ({ error: 'x' }) }), now: NOW })
  assert.deepEqual(odd, { exitCode: 1, stdout: 'Artificial Analysis gave no list of models.\n' })
})

test('main refuses a README with no markers before it writes anything, and a bad date or flag is a usage error', async (t) => {
  const dir = workDir(t)
  fs.writeFileSync(path.join(dir, 'out', 'README.md'), '# No markers here\n')
  const args = ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out')]
  const refused = await main([...args, '--write'], { env: {}, now: NOW })
  assert.equal(refused.exitCode, 1)
  assert.match(refused.stdout, /has no <!-- models-index:start --> and <!-- models-index:end --> lines to write between/)
  assert.equal(fs.existsSync(path.join(dir, 'out', 'index.json')), false)

  const absent = await main(['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--harness', path.join(dir, 'nope.json')], { env: {}, now: NOW })
  assert.deepEqual(absent, { exitCode: 1, stdout: `cannot read ${path.join(dir, 'nope.json')}: ENOENT\n` })

  assert.equal((await main(['--since', 'last year'], { env: {} })).exitCode, 2)
  assert.equal((await main(['--bogus'], { env: {} })).exitCode, 2)
})

test('the committed index and README are in the shape the script writes', () => {
  const dir = path.join(__dirname, '..', 'docs', 'models')
  const text = fs.readFileSync(path.join(dir, 'index.json'), 'utf8')
  const index = JSON.parse(text)
  assert.equal(`${serialize(index)}\n`, text)
  assert.equal(index.count, index.families.length)
  assert.equal(index.variantCount, index.families.reduce((sum, entry) => sum + entry.variants.length, 0))
  const dates = index.families.map((entry) => entry.releaseDate)
  assert.deepEqual([...dates].sort().reverse(), dates)
  for (const entry of index.families) {
    assert.ok(entry.releaseDate >= index.since)
    assert.ok(entry.variants.length > 0)
    for (const match of entry.available) assert.ok(['exact', 'normalized', 'guess'].includes(match.match))
  }
  const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8')
  assert.ok(readme.includes('<!-- models-index:start -->') && readme.includes('<!-- models-index:end -->'))
  assert.equal(renderGenerated(index), readme.slice(readme.indexOf('<!-- models-index:start -->\n') + '<!-- models-index:start -->\n'.length, readme.indexOf('\n<!-- models-index:end -->')))
})
