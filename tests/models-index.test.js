'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { buildIndex, buildModels, renderGenerated, mergeReadme, serialize, findFamily, splitId, missingProfiles, missingListings, readProfiles, main } = require('../scripts/build-models-index.js')

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
        'acme-1': { replaces: 'sonnet', roles: ['implementer'], levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' }, aa: { slug: 'acme-1-high' } },
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
  checked: '2026-10-13',
})
const PROFILES = {
  profiles: Object.fromEntries(['acme-1-5', 'edge-1', 'acme-1.5-build-fast', 'auto', 'ghost-9'].map((key) => [key, profile(`Model ${key}`)])),
}

const ALL = ['agy', 'codex', 'grok', 'cursor']
// Every released family, whether a harness offers it or not, with the four harnesses read.
const build = (extra = {}) => buildIndex(RAW, { since: '2026-01-01', lanes: LANES, harnessModels: LISTINGS, generatedAt: '2026-10-13', harnesses: ALL, offeredOnly: false, ...extra })
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
  assert.equal(buildIndex(RAW, { since: '2026-05-01', offeredOnly: false }).families.length, 2)
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

  const stamped = buildIndex([aa('flash', 'Flash (High)'), aa('flash-0420', 'Flash 0420 (High)'), aa('flash-0420-low', 'Flash 0420 (Low)')], { offeredOnly: false })
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
    { offeredOnly: false },
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
      replaces: 'sonnet',
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
      replaces: null,
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

test('an offered harness model no family took is kept, with why: no entry or released before the date', () => {
  const { unmatched } = build()
  assert.deepEqual(
    unmatched.map((entry) => [entry.harness, entry.model, entry.listing, entry.reason]),
    [
      ['agy', 'oldie-1', 'listed', 'Artificial Analysis lists oldie-1, released 2025-12-31, before 2026-01-01'],
      ['grok', 'acme-1.5-build-fast', 'listed', 'no Artificial Analysis entry'],
      ['cursor', 'auto', 'listed', 'no Artificial Analysis entry'],
    ],
  )
  assert.equal(unmatched[1].effortVia, 'flag')
  assert.deepEqual(unmatched[1].efforts, ['low', 'medium', 'high', 'xhigh'])
})

test('a model only the lane table names is not offered: it is in notOffered, with its roles, and in no family', () => {
  const index = build()
  assert.deepEqual(index.notOffered, [{ harness: 'agy', model: 'ghost-9', roles: ['judge'], reason: 'named by the lane table, and not listed by agy models' }])
  assert.equal(index.families.some((entry) => entry.available.some((offer) => offer.model === 'ghost-9')), false)
})

test('by default only agy and grok are read, and a model is in the index only when its CLI lists it', () => {
  const index = buildIndex(RAW, { since: '2026-01-01', lanes: LANES, harnessModels: LISTINGS, generatedAt: '2026-10-13' })
  assert.deepEqual(index.harnesses, ['agy', 'grok'])
  assert.equal(index.releasedCount, 5)
  assert.deepEqual(index.families.map((entry) => entry.family), ['acme-1'])
  assert.deepEqual(index.families[0].available.map((offer) => offer.harness), ['agy'])
  assert.equal(index.count, 1)
  assert.deepEqual(index.unmatched.map((entry) => `${entry.harness}/${entry.model}`), ['agy/oldie-1', 'grok/acme-1.5-build-fast'])
  assert.deepEqual(index.notOffered.map((entry) => `${entry.harness}/${entry.model}`), ['agy/ghost-9'])
  // acme-1 is superseded by acme-1-5, which neither chosen harness offers: the index names the successor and does not keep it.
  assert.deepEqual([index.families[0].current, index.families[0].supersededBy], [false, 'acme-1-5'])
  assert.equal(index.currentCount, 0)

  const more = buildIndex(RAW, { since: '2026-01-01', lanes: LANES, harnessModels: LISTINGS, generatedAt: '2026-10-13', harnesses: ['cursor', 'codex'] })
  assert.deepEqual(more.harnesses, ['codex', 'cursor'])
  assert.deepEqual(more.families.map((entry) => entry.family), ['acme-1-5', 'acme-1', 'edge-1'])
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

test('models.json is written with a short record on one line and a long one a line per key, and the text reads back the same', () => {
  const file = buildModels(build(), PROFILES.profiles)
  const text = serialize(file)
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(file)))
  assert.ok(text.split('\n').some((line) => line.includes('"effort":"high"') && line.includes('"ttftSeconds":5')))
  assert.equal(serialize(JSON.parse(text)), text)
  assert.equal(serialize({ a: [], b: {}, c: 'x'.repeat(200) }), `{\n  "a": [],\n  "b": {},\n  "c": "${'x'.repeat(200)}"\n}`)
})

test('the newest family of a line is current, and the others are superseded by it and stay in the index', () => {
  const index = build()
  const [old, newest] = [family(index, 'acme-1'), family(index, 'acme-1-5')]
  assert.deepEqual([newest.line, newest.current, newest.supersededBy], ['acme', true, null])
  assert.deepEqual([old.line, old.current, old.supersededBy], ['acme', false, 'acme-1-5'])
  assert.equal(index.count, 5)
  assert.equal(index.currentCount, 4)
  // A tier is not a version: tier-2 and tier-2-max are lines of their own.
  assert.equal(family(index, 'tier-2').current && family(index, 'tier-2-max').current, true)
})

test('a line drops version and date numbers and "preview", and nothing else: a size or a tier is a line of its own', () => {
  const raw = [
    aa('gem-3-7-flash', 'Gem 3.7 Flash', { date: '2026-08-01' }),
    aa('gem-3-8-flash', 'Gem 3.8 Flash', { date: '2026-09-01' }),
    aa('gem-3-8-flash-lite', 'Gem 3.8 Flash Lite', { date: '2026-09-02' }),
    aa('gem-4-31b', 'Gem 4 31B', { date: '2026-04-02' }),
    aa('gem-4-12b', 'Gem 4 12B', { date: '2026-06-03' }),
    aa('gem-3-1-pro-preview', 'Gem 3.1 Pro Preview', { date: '2026-02-19' }),
    aa('gem-3-2-pro', 'Gem 3.2 Pro', { date: '2026-03-19' }),
    aa('gem-3-2-pro-0319', 'Gem 3.2 Pro 0319', { date: '2026-03-20' }),
  ]
  const index = buildIndex(raw, { since: '2026-01-01', generatedAt: '2026-10-13', offeredOnly: false })
  const superseded = Object.fromEntries(index.families.map((entry) => [entry.family, entry.supersededBy]))
  assert.deepEqual(superseded, {
    'gem-3-8-flash-lite': null,
    'gem-3-8-flash': null,
    'gem-4-12b': null,
    'gem-4-31b': null,
    'gem-3-2-pro-0319': null,
    'gem-3-2-pro': 'gem-3-2-pro-0319',
    'gem-3-7-flash': 'gem-3-8-flash',
    'gem-3-1-pro-preview': 'gem-3-2-pro-0319',
  })
  assert.equal(family(index, 'gem-3-8-flash-lite').line, 'gem-flash-lite')
})

test('models.json lists the current models a harness offers, one per harness model, in harness order', () => {
  const file = buildModels(build(), PROFILES.profiles)
  assert.deepEqual(
    file.models.map((entry) => `${entry.harness}/${entry.model}`),
    ['codex/acme-1.5', 'codex/edge-1', 'cursor/cursor-acme-1.5'],
  )
  const [acme, edge, cursor] = file.models
  assert.deepEqual([acme.family, acme.name, acme.maker, acme.released, acme.effortVia, acme.efforts], ['acme-1-5', 'Acme 1.5', 'Acme Labs', '2026-06-01', 'flag', ['low', 'high', 'max']])
  // AA scored acme-1.5 at high only, so that is its only score; a harness that takes the effort in a flag has no ids.
  assert.deepEqual(acme.scores.map((score) => score.effort), ['high'])
  assert.equal('ids' in acme, false)
  assert.equal(acme.lane, null)
  assert.deepEqual(cursor.fastIds, { high: 'cursor-acme-1.5-high-fast' })
  assert.deepEqual(edge.scores.map((score) => [score.effort, score.terminalBench, score.priceInput]), [['default', 0, null]])
  // The profile is the maker's words and facts; its name and maker are the model's own fields.
  assert.deepEqual(Object.keys(acme.profile), ['purpose', 'contextTokens', 'maxOutputTokens', 'defaultEffort', 'price', 'knowledgeCutoff', 'availability', 'caveats', 'sources', 'checked'])
  assert.equal(acme.profile.purpose, '"Model acme-1-5 is for tests."')
  // A model with no profile has none, and the maker is then the one AA names.
  const bare = buildModels(build(), {}).models[0]
  assert.deepEqual([bare.maker, bare.profile], ['Acme', null])
  // Neither the rules nor the superseded and unmatched records are repeated per model.
  assert.equal(JSON.stringify(file.models).includes('Only the newest'), false)
  assert.deepEqual(Object.keys(file.rules), ['newest', 'offered', 'profiled'])
  assert.deepEqual([file.generatedAt, file.since, file.listedOn, file.harnesses], ['2026-10-13', '2026-01-01', '2026-10-13', ALL])
})

test('a model is scored on the efforts its harness takes, not on every effort AA measured, and carries its ids and its lane', () => {
  // Without acme-1-5, acme-1 is current. AA measured it at low, high and max; agy lists it at low and high only, so the max variant (50, 0.5) is out of reach.
  const raw = RAW.filter((model) => model.slug !== 'acme-1-5')
  const index = buildIndex(raw, { since: '2026-01-01', lanes: LANES, harnessModels: LISTINGS, generatedAt: '2026-10-13', harnesses: ['agy'] })
  assert.deepEqual(index.families[0].variants.map((variant) => variant.effort), ['low', 'high', 'max'])
  const file = buildModels(index, { 'acme-1': profile('Acme 1') })
  assert.equal(file.models.length, 1)
  const [acme] = file.models
  assert.deepEqual(acme.efforts, ['low', 'high'])
  assert.deepEqual(acme.ids, { low: 'acme-1-low', high: 'acme-1-high' })
  assert.deepEqual(acme.lane, { roles: ['implementer'], replaces: 'sonnet' })
  assert.deepEqual(acme.scores, [
    { effort: 'low', intelligence: 40, terminalBench: 0.2, priceInput: 2, priceOutput: 10, tokensPerSecond: 100, ttftSeconds: 5 },
    { effort: 'high', intelligence: 46.8, terminalBench: 0.404, priceInput: 2, priceOutput: 10, tokensPerSecond: null, ttftSeconds: null },
  ])
  // The README row has the figures of the highest effort taken, and the speed of the nearest one below that has it.
  const text = renderGenerated(file)
  assert.ok(text.includes('| Acme 1 `acme-1` | agy* | low, high | 46.8 | 0.404 | 2 / 10 | 100 |'))
  assert.equal(text.includes('| 50 |'), false)
})

test('what was left out is listed with why: not offered, no figures, superseded and out of scope', () => {
  const file = buildModels(build(), PROFILES.profiles)
  assert.deepEqual(
    file.notOffered.map((entry) => [entry.harness, entry.model, entry.roles, entry.reason]),
    [['agy', 'ghost-9', ['judge'], 'named by the lane table, and not listed by agy models']],
  )
  assert.equal(file.notOffered[0].profile.purpose, '"Model ghost-9 is for tests."')
  assert.deepEqual(file.withoutFigures.map((entry) => [entry.harness, entry.model, entry.lane]), [['grok', 'acme-1.5-build-fast', null], ['cursor', 'auto', null]])
  assert.match(file.withoutFigures[0].note, /no Artificial Analysis entry.*not a lane: the lane table does not list it/)
  assert.equal(file.withoutFigures[0].profile.name, undefined)
  assert.equal(file.withoutFigures[0].name, 'Model acme-1.5-build-fast')
  // A superseded model is named by its harness's id, and its successor by the id on the same harness when that offers one.
  assert.deepEqual(file.superseded, [
    { harness: 'agy', id: 'acme-1', supersededBy: 'acme-1-5' },
    { harness: 'cursor', id: 'acme-1-thinking', supersededBy: 'cursor-acme-1.5' },
  ])
  assert.deepEqual(file.outOfScope, [{ harness: 'agy', model: 'oldie-1', reason: 'Artificial Analysis lists oldie-1, released 2025-12-31, before 2026-01-01' }])
  assert.equal(file.models.some((entry) => entry.family === 'acme-1' || entry.model === 'oldie-1'), false)
})

test('the generated part of the README has the rules, one table of the models in use, a line for each model and what was left out', () => {
  const text = renderGenerated(buildModels(build(), PROFILES.profiles))
  assert.ok(text.startsWith('## Rules\n\n1. Only the newest generation of each line'))
  assert.ok(text.includes('| Model | Harness | Efforts taken | Intelligence | Terminal-bench | $/M in/out | Tokens/s |'))
  assert.ok(text.includes('| Acme 1.5 `acme-1.5` | codex | low, high, max | 55 | – | 2 / 10 | 100 |'))
  assert.ok(text.includes('| Acme 1.5 `cursor-acme-1.5` | cursor | high | 55 | – | 2 / 10 | 100 |'))
  // A superseded model is in no table, only in the left-out list.
  assert.equal(text.includes('| Acme 1 `acme-1` |'), false)
  assert.ok(text.includes('- **Acme 1.5** `acme-1.5` (codex), Acme Labs: "Model acme-1-5 is for tests." context 1M, output 128K; default effort high; $2 / $10 per M; cutoff 2026-06. Everywhere. A caveat. (checked 2026-10-13)'))
  assert.ok(text.includes('- **Model ghost-9** `ghost-9` (agy, not offered), Acme Labs:'))
  assert.ok(text.includes('- **Model auto** `auto` (cursor, no figures), Acme Labs:'))
  assert.ok(text.includes('- Not offered: agy `ghost-9` (judge): named by the lane table, and not listed by agy models.'))
  assert.ok(text.includes('- No figures: grok `acme-1.5-build-fast`: offered, with no Artificial Analysis entry, so no figures; not a lane: the lane table does not list it; cursor `auto`:'))
  assert.ok(text.includes('- Superseded, not to be used: agy `acme-1` by `acme-1-5`; cursor `acme-1-thinking` by `cursor-acme-1.5`.'))
  assert.ok(text.includes('- Out of scope: agy `oldie-1`: Artificial Analysis lists oldie-1, released 2025-12-31, before 2026-01-01.'))
  assert.equal(renderGenerated(buildModels(build(), {})).includes('**no profile: read the maker\'s page and add it to profiles.json**'), true)
})

test('mergeReadme replaces only what is between the markers, makes a missing README, and refuses one with no markers', () => {
  const START = '<!-- models-index:start -->'
  const END = '<!-- models-index:end -->'
  const old = `# Title\n\nby hand\n\n${START}\nold table\n${END}\n\nafter\n`
  assert.equal(mergeReadme(old, 'new table'), `# Title\n\nby hand\n\n${START}\nnew table\n${END}\n\nafter\n`)
  assert.equal(mergeReadme(null, 'new table'), `# Models released since 2026-01\n\n${START}\nnew table\n${END}\n`)
  assert.equal(mergeReadme('# Title\nno markers\n', 'new table'), null)
})

// A directory with the inputs of a build: the raw list, the lane table, the harness listings, the profiles and a README.
function workDir(t) {
  const dir = tempDir(t, 'models-index-')
  fs.writeFileSync(path.join(dir, 'raw.json'), JSON.stringify(RAW))
  fs.writeFileSync(path.join(dir, 'lanes.json'), JSON.stringify(LANES))
  fs.mkdirSync(path.join(dir, 'out'))
  fs.writeFileSync(path.join(dir, 'out', 'harness-models.json'), JSON.stringify(LISTINGS))
  fs.writeFileSync(path.join(dir, 'out', 'profiles.json'), JSON.stringify(PROFILES))
  fs.writeFileSync(path.join(dir, 'out', 'README.md'), '# Mine\n\nkept\n\n<!-- models-index:start -->\nold\n<!-- models-index:end -->\n\nalso kept\n')
  return dir
}

const NOW = () => new Date(2026, 9, 13, 12, 0, 0).getTime()

test('main builds from a saved list with no key, writes only with --write, and keeps the README text it did not generate', async (t) => {
  const dir = workDir(t)
  const args = ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out'), '--harnesses', 'cursor,grok,codex,agy']

  const dry = await main(args, { env: {}, fetch: async () => assert.fail('no request without a key'), now: NOW })
  assert.equal(dry.exitCode, 0)
  assert.match(dry.stdout, /^3 families \(5 variants\) are offered by agy, codex, grok, cursor, of the 5 released since 2026-01-01; 2 are current\./)
  assert.match(dry.stdout, /Offered by harness \(families\): agy 1, codex 2, grok 0, cursor 2\./)
  assert.match(dry.stdout, /Offered with no figures \(2\): grok\/acme-1\.5-build-fast, cursor\/auto\./)
  assert.match(dry.stdout, /Offered and out of scope, released before 2026-01-01 \(1\): agy\/oldie-1\./)
  assert.match(dry.stdout, /Named by the lane table and not offered \(1\): agy\/ghost-9\./)
  assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false)

  const wrote = await main([...args, '--write'], { env: {}, now: NOW })
  assert.equal(wrote.exitCode, 0)
  // One data file is written: no index.json and no current.json.
  assert.deepEqual(fs.readdirSync(path.join(dir, 'out')).sort(), ['README.md', 'harness-models.json', 'models.json', 'profiles.json'])
  const file = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'models.json'), 'utf8'))
  assert.equal(file.generatedAt, '2026-10-13')
  assert.deepEqual(file.harnesses, ['agy', 'codex', 'grok', 'cursor'])
  assert.deepEqual(file.models.map((entry) => `${entry.harness}/${entry.model}`), ['codex/acme-1.5', 'codex/edge-1', 'cursor/cursor-acme-1.5'])
  assert.deepEqual(file.withoutFigures.map((entry) => entry.model), ['acme-1.5-build-fast', 'auto'])
  assert.deepEqual(file.notOffered.map((entry) => entry.model), ['ghost-9'])
  // Every model carries its profile, so a session reads what the model is for with it.
  assert.equal(file.models[0].profile.purpose, '"Model acme-1-5 is for tests."')
  assert.equal(file.withoutFigures[0].name, 'Model acme-1.5-build-fast')
  assert.equal(file.notOffered[0].name, 'Model ghost-9')
  const readme = fs.readFileSync(path.join(dir, 'out', 'README.md'), 'utf8')
  assert.ok(readme.startsWith('# Mine\n\nkept\n\n<!-- models-index:start -->\n## Rules'))
  assert.ok(readme.endsWith('<!-- models-index:end -->\n\nalso kept\n'))
  assert.ok(readme.includes('## Models in use'))
  assert.ok(readme.includes('- **Acme 1.5** `acme-1.5` (codex), Acme Labs: "Model acme-1-5 is for tests." context 1M, output 128K; default effort high; $2 / $10 per M; cutoff 2026-06. Everywhere. A caveat. (checked 2026-10-13)'))
})

test('a model without a profile is listed, with an exit code of 1, and is marked in the README', async (t) => {
  const dir = workDir(t)
  fs.writeFileSync(path.join(dir, 'out', 'profiles.json'), JSON.stringify({ profiles: { 'acme-1-5': profile('Acme 1.5'), 'ghost-9': profile('Ghost') } }))
  const args = ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out'), '--harnesses', 'agy,codex,grok,cursor']
  const result = await main([...args, '--write'], { env: {}, now: NOW })
  assert.equal(result.exitCode, 1)
  assert.match(result.stdout, /Without a profile \(3\): edge-1, acme-1\.5-build-fast, auto\./)
  // The files are written all the same, so the model is in models.json and the README names what is missing.
  assert.ok(fs.readFileSync(path.join(dir, 'out', 'README.md'), 'utf8').includes('**no profile: read the maker\'s page and add it to profiles.json**'))
  assert.deepEqual(missingProfiles(buildModels(build(), {})), ['acme-1-5', 'edge-1', 'acme-1.5-build-fast', 'auto', 'ghost-9'])
  assert.deepEqual(missingProfiles(buildModels(build(), PROFILES.profiles)), [])
  assert.deepEqual(readProfiles(path.join(dir, 'nowhere.json')), {})
})

test('a chosen harness with no listing in harness-models.json is named, with how to capture it, before anything is asked or written', async (t) => {
  const dir = workDir(t)
  fs.writeFileSync(path.join(dir, 'out', 'harness-models.json'), JSON.stringify({ capturedAt: '2026-10-13', harnesses: { agy: LISTINGS.harnesses.agy } }))
  const args = ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out'), '--harnesses', 'agy,codex,cursor,grok']
  const result = await main([...args, '--write'], { env: {}, now: NOW })
  assert.deepEqual(result, {
    exitCode: 1,
    stdout:
      'no listing captured for codex: capture it from the `models` of ~/.codex/models_cache.json (codex has no command that lists them) and add it to harness-models.json\n' +
      'no listing captured for grok: capture it with `grok models` and add it to harness-models.json\n' +
      'no listing captured for cursor: capture it with `cursor-agent --list-models` and add it to harness-models.json\n',
  })
  assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false)
  assert.deepEqual(missingListings(LISTINGS, ['agy', 'codex', 'grok', 'cursor']), [])
  assert.equal(missingListings({ harnesses: { agy: {} } }, ['agy']).length, 1)
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
  for (const file of ['models.json', 'README.md']) {
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
  assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false)

  const absent = await main(['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--harness', path.join(dir, 'nope.json')], { env: {}, now: NOW })
  assert.deepEqual(absent, { exitCode: 1, stdout: `cannot read ${path.join(dir, 'nope.json')}: ENOENT\n` })

  assert.equal((await main(['--since', 'last year'], { env: {} })).exitCode, 2)
  assert.equal((await main(['--bogus'], { env: {} })).exitCode, 2)
})

test('the committed models.json and README are in the shape the script writes, and every model has a profile', () => {
  const dir = path.join(__dirname, '..', 'docs', 'models')
  const text = fs.readFileSync(path.join(dir, 'models.json'), 'utf8')
  const file = JSON.parse(text)
  assert.equal(`${serialize(file)}\n`, text)
  // The folder has the one generated data file, and no copy of it.
  assert.deepEqual(fs.readdirSync(dir).sort(), ['README.md', 'harness-models.json', 'models.json', 'profiles.json'])

  // Rule 2: the models are those of the chosen harnesses, each with a listing, and the listings are of no other harness.
  const listings = JSON.parse(fs.readFileSync(path.join(dir, 'harness-models.json'), 'utf8'))
  assert.ok(file.harnesses.length > 0)
  assert.deepEqual(missingListings(listings, file.harnesses), [])
  assert.deepEqual(Object.keys(listings.harnesses).sort(), [...file.harnesses].sort())
  assert.deepEqual(Object.keys(file.rules), ['newest', 'offered', 'profiled'])
  assert.ok(file.models.length > 0)
  for (const entry of file.models) {
    const where = `${entry.harness}/${entry.model}`
    assert.ok(file.harnesses.includes(entry.harness), where)
    assert.ok(entry.released >= file.since, where)
    assert.ok(entry.efforts.length > 0 && entry.scores.length > 0, where)
    // The scores are of efforts the harness takes, and only those; a harness that puts the effort in the id has the id of each.
    assert.ok(entry.scores.every((score) => entry.efforts.includes(score.effort)), where)
    if (entry.effortVia === 'id') assert.deepEqual(Object.keys(entry.ids), entry.efforts, where)
    else assert.equal('ids' in entry, false, where)
    assert.ok(listings.harnesses[entry.harness].models.some((listed) => listed.startsWith(entry.model)), where)
  }
  // Rule 1: a superseded model is not among the models in use, and its successor is.
  const inUse = new Set(file.models.map((entry) => `${entry.harness}/${entry.model}`))
  for (const old of file.superseded) assert.equal(inUse.has(`${old.harness}/${old.id}`), false, old.id)
  for (const out of file.outOfScope) assert.equal(inUse.has(`${out.harness}/${out.model}`), false, out.model)

  // Rule 3: every model has a profile, from the maker's pages, with its sources and the date they were read.
  assert.deepEqual(missingProfiles(file), [])
  for (const entry of [...file.models, ...file.withoutFigures, ...file.notOffered]) {
    assert.ok(typeof entry.profile.purpose === 'string' && entry.profile.purpose !== '', entry.model)
    assert.ok(Array.isArray(entry.profile.sources) && entry.profile.sources.length > 0 && entry.profile.sources.every((url) => /^https:\/\//.test(url)), entry.model)
    assert.match(entry.profile.checked, /^\d{4}-\d{2}-\d{2}$/, entry.model)
  }
  // The profiles are the ones the file was built from.
  const profiles = readProfiles(path.join(dir, 'profiles.json'))
  for (const entry of file.models) assert.equal(entry.profile.purpose, profiles[entry.family].purpose, entry.model)

  // The README's generated part is made from models.json alone.
  const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8')
  const start = '<!-- models-index:start -->\n'
  assert.ok(readme.includes(start) && readme.includes('\n<!-- models-index:end -->'))
  assert.equal(renderGenerated(file), readme.slice(readme.indexOf(start) + start.length, readme.indexOf('\n<!-- models-index:end -->')))
  assert.ok(readme.split('\n').length < 60, 'the README is short')
})
