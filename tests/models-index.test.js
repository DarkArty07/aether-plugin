'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { buildIndex, buildModels, harnessEntries, renderGenerated, mergeReadme, serialize, findFamily, splitId, missingProfiles, missingListings, badListings, readProfiles, main } = require('../scripts/build-models-index.js')

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

test('by default the native harness and the lanes agy, codex and grok are read, and a model is in the index only when its CLI lists it', () => {
  const index = buildIndex(RAW, { since: '2026-01-01', lanes: LANES, harnessModels: LISTINGS, generatedAt: '2026-10-13' })
  // LISTINGS has no claude listing, so the native harness offers nothing here.
  assert.deepEqual(index.harnesses, ['claude', 'agy', 'codex', 'grok', 'muse'])
  assert.equal(index.releasedCount, 5)
  assert.deepEqual(index.families.map((entry) => entry.family), ['acme-1-5', 'acme-1', 'edge-1'])
  assert.deepEqual(index.families.map((entry) => [entry.family, entry.available.map((offer) => offer.harness)]), [
    ['acme-1-5', ['codex']],
    ['acme-1', ['agy']],
    ['edge-1', ['codex']],
  ])
  assert.equal(index.count, 3)
  assert.deepEqual(index.unmatched.map((entry) => `${entry.harness}/${entry.model}`), ['agy/oldie-1', 'grok/acme-1.5-build-fast'])
  assert.deepEqual(index.notOffered.map((entry) => `${entry.harness}/${entry.model}`), ['agy/ghost-9'])
  // acme-1 is superseded by acme-1-5, which codex offers.
  assert.deepEqual([index.families[1].current, index.families[1].supersededBy], [false, 'acme-1-5'])
  assert.equal(index.currentCount, 2)

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
  // The listings' day is per harness; a file with one day for all gives it to each.
  assert.deepEqual([file.generatedAt, file.since, file.harnesses], ['2026-10-13', '2026-01-01', ALL])
  assert.deepEqual(file.listedOn, { agy: '2026-10-13', codex: '2026-10-13', grok: '2026-10-13', cursor: '2026-10-13' })
  assert.deepEqual(file.excluded, [])
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
  assert.deepEqual(acme.lane, { roles: ['implementer'] })
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

// A directory with the inputs of a build: the raw list, the lane table, the harness listings and the profiles
// in `out` (where the data files go), and a README in `docs`.
function workDir(t, { raw = RAW, lanes = LANES, listings = LISTINGS, profiles = PROFILES } = {}) {
  const dir = tempDir(t, 'models-index-')
  fs.writeFileSync(path.join(dir, 'raw.json'), JSON.stringify(raw))
  fs.writeFileSync(path.join(dir, 'lanes.json'), JSON.stringify(lanes))
  fs.mkdirSync(path.join(dir, 'out'))
  fs.mkdirSync(path.join(dir, 'docs'))
  fs.writeFileSync(path.join(dir, 'out', 'harness-models.json'), JSON.stringify(listings))
  fs.writeFileSync(path.join(dir, 'out', 'profiles.json'), JSON.stringify(profiles))
  fs.writeFileSync(path.join(dir, 'docs', 'README.md'), '# Mine\n\nkept\n\n<!-- models-index:start -->\nold\n<!-- models-index:end -->\n\nalso kept\n')
  return dir
}

const NOW = () => new Date(2026, 9, 13, 12, 0, 0).getTime()

test('main builds from a saved list with no key, writes only with --write, and keeps the README text it did not generate', async (t) => {
  const dir = workDir(t)
  const args = ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out'), '--docs', path.join(dir, 'docs'), '--harnesses', 'cursor,grok,codex,agy']

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
  // The three data files go to --out and the README to --docs; there is no index.json and no current.json, and no README in --out.
  assert.deepEqual(fs.readdirSync(path.join(dir, 'out')).sort(), ['harness-models.json', 'models.json', 'profiles.json'])
  assert.deepEqual(fs.readdirSync(path.join(dir, 'docs')), ['README.md'])
  assert.match(wrote.stdout, new RegExp(`written to ${path.join(dir, 'out', 'models.json')} and ${path.join(dir, 'docs', 'README.md')}`))
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
  const readme = fs.readFileSync(path.join(dir, 'docs', 'README.md'), 'utf8')
  assert.ok(readme.startsWith('# Mine\n\nkept\n\n<!-- models-index:start -->\n## Rules'))
  assert.ok(readme.endsWith('<!-- models-index:end -->\n\nalso kept\n'))
  assert.ok(readme.includes('## Models in use'))
  assert.ok(readme.includes('- **Acme 1.5** `acme-1.5` (codex), Acme Labs: "Model acme-1-5 is for tests." context 1M, output 128K; default effort high; $2 / $10 per M; cutoff 2026-06. Everywhere. A caveat. (checked 2026-10-13)'))
})

test('a model without a profile is listed, with an exit code of 1, and is marked in the README', async (t) => {
  const dir = workDir(t)
  fs.writeFileSync(path.join(dir, 'out', 'profiles.json'), JSON.stringify({ profiles: { 'acme-1-5': profile('Acme 1.5'), 'ghost-9': profile('Ghost') } }))
  const args = ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out'), '--docs', path.join(dir, 'docs'), '--harnesses', 'agy,codex,grok,cursor']
  const result = await main([...args, '--write'], { env: {}, now: NOW })
  assert.equal(result.exitCode, 1)
  assert.match(result.stdout, /Without a profile \(3\): edge-1, acme-1\.5-build-fast, auto\./)
  // The files are written all the same, so the model is in models.json and the README names what is missing.
  assert.ok(fs.readFileSync(path.join(dir, 'docs', 'README.md'), 'utf8').includes('**no profile: read the maker\'s page and add it to profiles.json**'))
  assert.deepEqual(missingProfiles(buildModels(build(), {})), ['acme-1-5', 'edge-1', 'acme-1.5-build-fast', 'auto', 'ghost-9'])
  assert.deepEqual(missingProfiles(buildModels(build(), PROFILES.profiles)), [])
  assert.deepEqual(readProfiles(path.join(dir, 'nowhere.json')), {})
})

test('a chosen harness with no listing in harness-models.json is named, with how to capture it, before anything is asked or written', async (t) => {
  const dir = workDir(t)
  fs.writeFileSync(path.join(dir, 'out', 'harness-models.json'), JSON.stringify({ capturedAt: '2026-10-13', harnesses: { agy: LISTINGS.harnesses.agy } }))
  const args = ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out'), '--docs', path.join(dir, 'docs'), '--harnesses', 'claude,agy,codex,cursor,grok']
  const result = await main([...args, '--write'], { env: {}, now: NOW })
  assert.deepEqual(result, {
    exitCode: 1,
    stdout:
      'no listing captured for claude: capture it by hand from `claude --help` (its --model aliases and its --effort levels; Claude Code has no command that lists models) and add it to harness-models.json\n' +
      'no listing captured for codex: capture it from the `models` of ~/.codex/models_cache.json (codex has no command that lists them) and add it to harness-models.json\n' +
      'no listing captured for grok: capture it with `grok models` and add it to harness-models.json\n' +
      'no listing captured for cursor: capture it with `cursor-agent --list-models` and add it to harness-models.json\n',
  })
  assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false)
  assert.equal(fs.readFileSync(path.join(dir, 'docs', 'README.md'), 'utf8').includes('## Rules'), false)
  assert.deepEqual(missingListings(LISTINGS, ['agy', 'codex', 'grok', 'cursor']), [])
  assert.equal(missingListings({ harnesses: { agy: {} } }, ['agy']).length, 1)
})

test('a chosen muse with no listing is named, with how to capture it', async (t) => {
  const dir = workDir(t)
  fs.writeFileSync(path.join(dir, 'out', 'harness-models.json'), JSON.stringify({ capturedAt: '2026-10-13', harnesses: { claude: { models: [] } } }))
  const args = ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out'), '--docs', path.join(dir, 'docs'), '--harnesses', 'claude,muse']
  const result = await main([...args, '--write'], { env: {}, now: NOW })
  assert.deepEqual(result, {
    exitCode: 1,
    stdout: 'no listing captured for muse: capture it with the model/list method of `muse serve` (no model call; the ids it lists, newest first) and add it to harness-models.json\n',
  })
  assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false)
})

test('main without --from asks the API with the key, never prints it, and says why when it cannot', async (t) => {
  const dir = workDir(t)
  // LISTINGS has no claude listing: this test reads the lanes.
  const args = ['--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out'), '--docs', path.join(dir, 'docs'), '--harnesses', 'agy,grok']
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
  for (const file of [path.join('out', 'models.json'), path.join('docs', 'README.md')]) {
    assert.equal(fs.readFileSync(path.join(dir, file), 'utf8').includes('secret-key'), false)
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
  fs.writeFileSync(path.join(dir, 'docs', 'README.md'), '# No markers here\n')
  const args = ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out'), '--docs', path.join(dir, 'docs'), '--harnesses', 'agy,grok']
  const refused = await main([...args, '--write'], { env: {}, now: NOW })
  assert.equal(refused.exitCode, 1)
  assert.match(refused.stdout, /has no <!-- models-index:start --> and <!-- models-index:end --> lines to write between/)
  assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false)

  const absent = await main(['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--harness', path.join(dir, 'nope.json')], { env: {}, now: NOW })
  assert.deepEqual(absent, { exitCode: 1, stdout: `cannot read ${path.join(dir, 'nope.json')}: ENOENT\n` })

  assert.equal((await main(['--since', 'last year'], { env: {} })).exitCode, 2)
  assert.equal((await main(['--bogus'], { env: {} })).exitCode, 2)
})


// The native harness. A made-up maker, Zeta, with a line offered by claude (an alias, five efforts) and by agy (three
// efforts in the id), a line the owner keeps out, a line with its own efforts, a plain-string line and a ghost AA lacks.
const FIVE = ['low', 'medium', 'high', 'xhigh', 'max']
const family5 = (slug, name, scores, options = {}) =>
  FIVE.map((effort, at) =>
    aa(effort === 'max' ? slug : `${slug}-${effort}`, `${name} (${effort[0].toUpperCase()}${effort.slice(1)})`, { creator: 'Zeta', date: '2026-09-01', intelligence: scores[at], ...options }),
  )
const NATIVE_RAW = [
  ...family5('zeta-2', 'Zeta 2', [36, 41, 47, 52, 56]),
  ...family5('zeta-big-2', 'Zeta Big 2', [47, 49, 51, 53, 53.4], { input: 10, output: 50, tps: 50 }),
  aa('zeta-lite-1-low', 'Zeta Lite 1 (Low)', { creator: 'Zeta', intelligence: 20 }),
  aa('zeta-lite-1-medium', 'Zeta Lite 1 (Medium)', { creator: 'Zeta', intelligence: 25 }),
  aa('zeta-lite-1-high', 'Zeta Lite 1 (High)', { creator: 'Zeta', intelligence: 30 }),
  aa('zeta-plain-1', 'Zeta Plain 1 (High)', { creator: 'Zeta', intelligence: 33 }),
]
const NATIVE_LANES = { harnesses: { agy: { models: { 'zeta-2': { roles: ['implementer'], levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' } } } } } }
const NATIVE_LISTINGS = {
  harnesses: {
    claude: {
      capturedAt: '2026-10-14',
      listedBy: 'claude --help',
      effortVia: 'flag',
      efforts: FIVE,
      models: [
        { id: 'zeta-2', alias: 'zeta' },
        { id: 'zeta-big-2', alias: 'big', excluded: 'Kept out until Zeta Big 3 (decision X1).' },
        { id: 'zeta-lite-1', alias: 'lite', efforts: ['low', 'medium'] },
        'zeta-plain-1',
        { id: 'zeta-ghost-1', alias: 'ghost', excluded: 'Also kept out.' },
      ],
    },
    agy: { capturedAt: '2026-10-13', listedBy: 'agy models', effortVia: 'id', models: ['zeta-2-low', 'zeta-2-medium', 'zeta-2-high'] },
    codex: { capturedAt: '2026-10-29', listedBy: 'models_cache.json', effortVia: 'flag', efforts: ['low', 'high'], models: [] },
    grok: { capturedAt: '2026-10-13', listedBy: 'grok models', effortVia: 'flag', efforts: ['low', 'high'], models: [] },
    muse: { capturedAt: '2026-10-19', listedBy: 'muse serve (model/list)', effortVia: 'flag', efforts: ['low', 'high'], models: [] },
  },
}
const NATIVE_PROFILES = { profiles: Object.fromEntries(['zeta-2', 'zeta-big-2', 'zeta-lite-1', 'zeta-plain-1', 'zeta-ghost-1'].map((key) => [key, profile(`Model ${key}`)])) }
const native = (extra = {}) =>
  buildIndex(NATIVE_RAW, { since: '2026-01-01', lanes: NATIVE_LANES, harnessModels: NATIVE_LISTINGS, generatedAt: '2026-10-14', harnesses: ['claude', 'agy'], ...extra })
const nativeFile = () => buildModels(native(), NATIVE_PROFILES.profiles)

test('claude is the first harness and a default one; its entries carry the alias, the five efforts and a null lane', () => {
  const defaults = buildIndex(NATIVE_RAW, { since: '2026-01-01', lanes: NATIVE_LANES, harnessModels: NATIVE_LISTINGS, generatedAt: '2026-10-14' })
  assert.deepEqual(defaults.harnesses, ['claude', 'agy', 'codex', 'grok', 'muse'])
  // The order of the harnesses is the native one first, whatever order they are asked for.
  assert.deepEqual(native({ harnesses: ['agy', 'claude'] }).harnesses, ['claude', 'agy'])

  const file = nativeFile()
  assert.deepEqual(
    file.models.map((entry) => `${entry.harness}/${entry.model}`),
    ['claude/zeta-2', 'claude/zeta-lite-1', 'claude/zeta-plain-1', 'agy/zeta-2'],
  )
  const [zeta] = file.models
  assert.equal(zeta.alias, 'zeta')
  assert.deepEqual(zeta.efforts, FIVE)
  // AA scored all five efforts, and the entry keeps each one's figures and price.
  assert.deepEqual(zeta.scores.map((score) => [score.effort, score.intelligence, score.priceInput, score.priceOutput]), FIVE.map((effort, at) => [effort, [36, 41, 47, 52, 56][at], 2, 10]))
  assert.equal(zeta.lane, null)
  assert.equal(zeta.effortVia, 'flag')
  assert.equal('ids' in zeta, false)
  assert.equal(zeta.maker, 'Acme Labs')
  assert.equal(zeta.released, '2026-09-01')
})

test('a model of the native harness shares its profile with the same family on agy, which keeps its three efforts, its ids and its lane', () => {
  const [claude, , , agy] = nativeFile().models
  assert.deepEqual([claude.harness, agy.harness, claude.family, agy.family], ['claude', 'agy', 'zeta-2', 'zeta-2'])
  assert.deepEqual(claude.profile, agy.profile)
  assert.equal(claude.profile.purpose, '"Model zeta-2 is for tests."')
  assert.equal('alias' in agy, false)
  assert.deepEqual(agy.efforts, ['low', 'medium', 'high'])
  assert.deepEqual(agy.scores.map((score) => score.effort), ['low', 'medium', 'high'])
  assert.deepEqual(agy.ids, { low: 'zeta-2-low', medium: 'zeta-2-medium', high: 'zeta-2-high' })
  assert.deepEqual(agy.lane, { roles: ['implementer'] })
})

test('a listing is a string or an object: a string has no alias and takes the harness efforts, an object may have its own', () => {
  const [, lite, plain] = nativeFile().models
  assert.deepEqual([lite.model, lite.alias, lite.efforts], ['zeta-lite-1', 'lite', ['low', 'medium']])
  assert.deepEqual(lite.scores.map((score) => score.effort), ['low', 'medium'])
  assert.deepEqual([plain.model, 'alias' in plain, plain.efforts], ['zeta-plain-1', false, FIVE])
  const offers = family(native(), 'zeta-plain-1').available
  assert.deepEqual(offers.map((offer) => [offer.harness, offer.listing, 'alias' in offer, 'excluded' in offer]), [['claude', 'listed', false, false]])
  const zeta = family(native(), 'zeta-2').available.map((offer) => [offer.harness, offer.alias ?? null])
  assert.deepEqual(zeta, [['claude', 'zeta'], ['agy', null]])
})

test('a listed model marked excluded is in the excluded list with its reason, price, scores and profile, and not among the models', () => {
  const file = nativeFile()
  assert.equal(file.models.some((entry) => entry.model === 'zeta-big-2' || entry.model === 'zeta-ghost-1'), false)
  assert.deepEqual(file.excluded.map((entry) => [entry.harness, entry.model, entry.alias]), [['claude', 'zeta-big-2', 'big'], ['claude', 'zeta-ghost-1', 'ghost']])
  const [big, ghost] = file.excluded
  assert.deepEqual([big.name, big.maker, big.reason], ['Zeta Big 2', 'Acme Labs', 'Kept out until Zeta Big 3 (decision X1).'])
  assert.deepEqual(big.price, { input: 10, output: 50 })
  assert.deepEqual(big.scores.map((score) => [score.effort, score.intelligence]), FIVE.map((effort, at) => [effort, [47, 49, 51, 53, 53.4][at]]))
  assert.equal(big.profile.purpose, '"Model zeta-big-2 is for tests."')
  assert.deepEqual(big.efforts, FIVE)
  // A model AA has no entry for is excluded all the same, with no price and no scores, and is not one without figures.
  assert.deepEqual([ghost.price, ghost.scores, ghost.reason, ghost.name], [null, [], 'Also kept out.', 'Model zeta-ghost-1'])
  assert.equal(ghost.profile.purpose, '"Model zeta-ghost-1 is for tests."')
  assert.deepEqual(file.withoutFigures, [])
  // An excluded model needs a profile like any other, so the build exits 1 without one.
  assert.deepEqual(missingProfiles(buildModels(native(), {})), ['zeta-2', 'zeta-lite-1', 'zeta-plain-1', 'zeta-big-2', 'zeta-ghost-1'])
  assert.deepEqual(missingProfiles(file), [])
  // A file without the list is still read as one with none.
  assert.deepEqual(missingProfiles({ models: [], withoutFigures: [], notOffered: [] }), [])
})

test('the README shows the native rows with no star, and lists the excluded model under Left out with its profile', () => {
  const text = renderGenerated(nativeFile())
  assert.ok(text.includes('| Zeta 2 `zeta-2` | claude | low, medium, high, xhigh, max | 56 | – | 2 / 10 | 100 |'))
  assert.ok(text.includes('| Zeta 2 `zeta-2` | agy* | low, medium, high | 47 | – | 2 / 10 | 100 |'))
  assert.equal(text.includes('claude*'), false)
  assert.equal(text.includes('| Zeta Big 2 `zeta-big-2` |'), false)
  assert.ok(text.includes('- **Zeta 2** `zeta-2` (claude, alias `zeta`), Acme Labs: "Model zeta-2 is for tests."'))
  assert.ok(text.includes('- **Zeta Big 2** `zeta-big-2` (claude, alias `big`, excluded), Acme Labs: "Model zeta-big-2 is for tests."'))
  assert.ok(text.includes('- Excluded, not used: claude `zeta-big-2` (`big`): Kept out until Zeta Big 3 (decision X1); claude `zeta-ghost-1` (`ghost`): Also kept out.'))
  // The listings' days differ, so each harness gives its own.
  assert.ok(text.includes("the harnesses' listings are of claude 2026-10-14, agy 2026-10-13."))
})

test('main reads the native harness by default, writes the data to --out and the README to --docs, and says what is excluded', async (t) => {
  const dir = workDir(t, { raw: NATIVE_RAW, lanes: NATIVE_LANES, listings: NATIVE_LISTINGS, profiles: NATIVE_PROFILES })
  const args = ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out'), '--docs', path.join(dir, 'docs')]
  const dry = await main(args, { env: {}, now: NOW })
  assert.equal(dry.exitCode, 0)
  assert.match(dry.stdout, /are offered by claude, agy, codex, grok, muse, of the/)
  assert.match(dry.stdout, /Offered by harness \(families\): claude 4, agy 1, codex 0, grok 0, muse 0\./)
  assert.match(dry.stdout, /Offered with no figures \(0\): none\./)
  assert.match(dry.stdout, /Offered and excluded by the owner \(2\): claude\/zeta-big-2, claude\/zeta-ghost-1\./)

  const wrote = await main([...args, '--write'], { env: {}, now: NOW })
  assert.equal(wrote.exitCode, 0)
  assert.deepEqual(fs.readdirSync(path.join(dir, 'out')).sort(), ['harness-models.json', 'models.json', 'profiles.json'])
  assert.deepEqual(fs.readdirSync(path.join(dir, 'docs')), ['README.md'])
  const file = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'models.json'), 'utf8'))
  assert.deepEqual(file.harnesses, ['claude', 'agy', 'codex', 'grok', 'muse'])
  assert.deepEqual(file.listedOn, { claude: '2026-10-14', agy: '2026-10-13', codex: '2026-10-29', grok: '2026-10-13', muse: '2026-10-19' })
  assert.deepEqual(file.excluded.map((entry) => entry.model), ['zeta-big-2', 'zeta-ghost-1'])
  assert.equal(`${serialize(file)}\n`, fs.readFileSync(path.join(dir, 'out', 'models.json'), 'utf8'))
  assert.ok(fs.readFileSync(path.join(dir, 'docs', 'README.md'), 'utf8').includes('- Excluded, not used: claude `zeta-big-2`'))
})

test("without --out the profiles are read from the plugin's config folder", async (t) => {
  const dir = workDir(t, { raw: NATIVE_RAW, lanes: NATIVE_LANES, listings: NATIVE_LISTINGS })
  // The harness listing is the test's own; the profiles come from the default folder, which has none of the made-up models.
  const args = ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--harness', path.join(dir, 'out', 'harness-models.json'), '--harnesses', 'claude']
  const result = await main(args, { env: {}, now: NOW })
  assert.equal(result.exitCode, 1)
  assert.ok(result.stdout.includes(`add it to ${path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models', 'profiles.json')}`), result.stdout)
  assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false)
})

const ROOT = path.join(__dirname, '..')
const CONFIG = path.join(ROOT, 'plugins', 'aether', 'config', 'models')
const DOCS = path.join(ROOT, 'docs', 'models')
const idOf = (listed) => (typeof listed === 'string' ? listed : listed.id)
const readCommitted = () => ({
  text: fs.readFileSync(path.join(CONFIG, 'models.json'), 'utf8'),
  listings: JSON.parse(fs.readFileSync(path.join(CONFIG, 'harness-models.json'), 'utf8')),
  profiles: readProfiles(path.join(CONFIG, 'profiles.json')),
  readme: fs.readFileSync(path.join(DOCS, 'README.md'), 'utf8'),
})

test('the committed models.json and README are in the shape the script writes, and every model has a profile', () => {
  const { text, listings, profiles, readme } = readCommitted()
  const file = JSON.parse(text)
  assert.equal(`${serialize(file)}\n`, text)
  // The data ships with the plugin, in its config folder; docs/models has the reading copy and nothing else.
  assert.deepEqual(fs.readdirSync(CONFIG).sort(), ['harness-models.json', 'models.json', 'profiles.json'])
  assert.deepEqual(fs.readdirSync(DOCS), ['README.md'])

  // Rule 2: the models are those of the chosen harnesses, each with a listing and the day it was captured, and the listings are of no other harness.
  assert.ok(file.harnesses.length > 0)
  assert.deepEqual(missingListings(listings, file.harnesses), [])
  assert.deepEqual(Object.keys(listings.harnesses).sort(), [...file.harnesses].sort())
  for (const [name, listing] of Object.entries(listings.harnesses)) assert.match(listing.capturedAt, /^\d{4}-\d{2}-\d{2}$/, name)
  assert.deepEqual(file.listedOn, Object.fromEntries(file.harnesses.map((name) => [name, listings.harnesses[name].capturedAt])))
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
    const listedModels = [
      ...(listings.harnesses[entry.harness].models ?? []),
      ...(listings.harnesses[entry.harness].calledNotListed ?? []),
    ]
    assert.ok(listedModels.some((listed) => idOf(listed).startsWith(entry.model)), where)
  }
  // Rule 1: a superseded model is not among the models in use, and its successor is.
  const inUse = new Set(file.models.map((entry) => `${entry.harness}/${entry.model}`))
  for (const old of file.superseded) assert.equal(inUse.has(`${old.harness}/${old.id}`), false, old.id)
  for (const out of file.outOfScope) assert.equal(inUse.has(`${out.harness}/${out.model}`), false, out.model)
  // A model the owner keeps out is not in use, and was listed with its reason.
  for (const out of file.excluded) {
    assert.equal(inUse.has(`${out.harness}/${out.model}`), false, out.model)
    assert.equal(listings.harnesses[out.harness].models.find((listed) => idOf(listed) === out.model).excluded, out.reason, out.model)
  }

  // Rule 3: every model has a profile, from the maker's pages, with its sources and the date they were read.
  assert.deepEqual(missingProfiles(file), [])
  for (const entry of [...file.models, ...file.excluded, ...file.withoutFigures, ...file.notOffered]) {
    assert.ok(typeof entry.profile.purpose === 'string' && entry.profile.purpose !== '', entry.model)
    assert.ok(Array.isArray(entry.profile.sources) && entry.profile.sources.length > 0 && entry.profile.sources.every((url) => /^https:\/\//.test(url)), entry.model)
    assert.match(entry.profile.checked, /^\d{4}-\d{2}-\d{2}$/, entry.model)
  }
  // The profiles are the ones the file was built from.
  // Every profile field models.json carries is a copy of the profile's own, so a stale copy of any of them fails here.
  const keyed = [
    ...[...file.models, ...file.excluded].map((entry) => [entry, entry.family]),
    ...[...file.withoutFigures, ...file.notOffered].map((entry) => [entry, entry.model]),
  ]
  for (const [entry, key] of keyed) {
    const fields = Object.keys(entry.profile)
    assert.ok(fields.includes('purpose') && fields.includes('price') && fields.includes('availability') && fields.includes('sources') && fields.includes('checked'), `${entry.model}: the fields are there`)
    for (const field of fields) assert.deepEqual(entry.profile[field], profiles[key][field] ?? null, `${entry.harness}/${entry.model}: ${field} is the profile's`)
  }

  // The README's generated part is made from models.json alone.
  const start = '<!-- models-index:start -->\n'
  assert.ok(readme.includes(start) && readme.includes('\n<!-- models-index:end -->'))
  assert.equal(renderGenerated(file), readme.slice(readme.indexOf(start) + start.length, readme.indexOf('\n<!-- models-index:end -->')))
  assert.ok(readme.split('\n').length < 80, 'the README is short')
  // The hand-written part points at the three files where they are now, and says where the native listing comes from.
  for (const name of ['models', 'profiles', 'harness-models']) {
    const link = `../../plugins/aether/config/models/${name}.json`
    assert.ok(readme.includes(`(${link})`), link)
    assert.ok(fs.existsSync(path.join(DOCS, link)), link)
  }
  assert.ok(readme.includes('`claude --help`'))
})

test('the committed index has the native harness: aliases, five efforts, no lane, profiles shared with agy, and Fable 5.1 excluded', () => {
  const { text, listings, profiles, readme } = readCommitted()
  const file = JSON.parse(text)
  assert.equal(file.harnesses[0], 'claude')
  const claude = listings.harnesses.claude
  assert.deepEqual([claude.listedBy, claude.effortVia, claude.efforts, claude.capturedAt], ['claude --help', 'flag', FIVE, '2026-10-14'])
  assert.deepEqual(claude.models.map((listed) => [listed.id, listed.alias]), [['claude-haiku-5-5', 'haiku'], ['claude-sonnet-5-5', 'sonnet'], ['claude-opus-5-5', 'opus'], ['claude-fable-5-1', 'fable']])
  // The lanes keep the day they were captured.
  assert.equal(listings.harnesses.agy.capturedAt, '2026-10-15')
  assert.equal(listings.harnesses.grok.capturedAt, '2026-10-13')

  const natives = file.models.filter((entry) => entry.harness === 'claude')
  assert.deepEqual(natives.map((entry) => [entry.model, entry.alias]).sort(), [['claude-haiku-5-5', 'haiku'], ['claude-opus-5-5', 'opus'], ['claude-sonnet-5-5', 'sonnet']])
  for (const entry of natives) {
    assert.deepEqual(entry.efforts, FIVE, entry.model)
    assert.deepEqual(entry.scores.map((score) => score.effort), FIVE, entry.model)
    assert.ok(entry.scores.every((score) => score.intelligence !== null && score.priceInput !== null && score.priceOutput !== null), entry.model)
    assert.equal(entry.lane, null, entry.model)
    assert.equal(entry.effortVia, 'flag', entry.model)
    assert.equal(entry.profile.purpose, profiles[entry.family].purpose, entry.model)
  }
  // An agy entry of the same family has the same profile, no alias, and only the efforts agy takes.
  const shared = file.models.filter((entry) => entry.harness === 'agy' && entry.family.startsWith('claude-'))
  assert.deepEqual(shared.map((entry) => entry.family).sort(), ['claude-opus-5-5', 'claude-sonnet-5-5'])
  for (const agy of shared) {
    const twin = natives.find((entry) => entry.family === agy.family)
    assert.deepEqual(twin.profile, agy.profile, agy.family)
    assert.equal('alias' in agy, false, agy.family)
    assert.deepEqual(agy.efforts, ['low', 'medium', 'high'], agy.family)
    // The shared profile does not say what one harness takes: each entry lists its own efforts.
    assert.doesNotMatch(profiles[agy.family].availability, /agy|only/, agy.family)
  }

  // Fable 5.1 is listed, kept out, and not among the models.
  assert.equal(file.models.some((entry) => entry.model === 'claude-fable-5-1'), false)
  assert.equal(file.excluded.length, 8)
  const fable = file.excluded.find((entry) => entry.model === 'claude-fable-5-1')
  assert.deepEqual([fable.harness, fable.model, fable.alias, fable.name, fable.maker], ['claude', 'claude-fable-5-1', 'fable', 'Claude Fable 5.1', 'Anthropic'])
  assert.equal(fable.reason, 'The owner keeps Fable out until Fable 5.5 (decision A43).')
  assert.deepEqual(fable.price, { input: 10, output: 50 })
  assert.deepEqual(fable.scores.map((score) => score.effort), FIVE)
  assert.deepEqual([fable.profile.price.input, fable.profile.price.output], [10, 50])

  // The profile side of the maker's words: each purpose has the maker's description, ignoring case.
  const says = {
    'claude-haiku-5-5': 'high-volume, latency-sensitive tasks such as classification, extraction, and routing',
    'claude-sonnet-5-5': 'the best combination of speed and intelligence',
    'claude-opus-5-5': 'long-running agentic coding and knowledge work',
    'claude-fable-5-1': 'demanding reasoning and long-horizon agentic work',
  }
  for (const [key, words] of Object.entries(says)) assert.ok(profiles[key].purpose.toLowerCase().includes(words), key)
  // Haiku's price says it rises for a prompt over 100K tokens.
  assert.match(profiles['claude-haiku-5-5'].price.note, /over 100,000 tokens/)

  // The README has the native rows without a star, and Fable under Left out.
  assert.ok(readme.includes('| Claude Sonnet 5.5 `claude-sonnet-5-5` | claude | low, medium, high, xhigh, max |'))
  assert.ok(readme.includes('| Claude Sonnet 5.5 `claude-sonnet-5-5` | agy* | low, medium, high |'))
  assert.equal(readme.includes('claude*'), false)
  assert.ok(readme.includes('- Excluded, not used: claude `claude-fable-5-1` (`fable`): The owner keeps Fable out until Fable 5.5 (decision A43)'))
})

// The listings of NATIVE_LISTINGS with changes to the `claude` and `agy` entries (each change is merged into its harness).
const withListings = (change) => {
  const { claude, agy, grok } = NATIVE_LISTINGS.harnesses
  return { harnesses: { claude: { ...claude, ...change.claude }, agy: { ...agy, ...change.agy }, grok } }
}
const WRITE_ARGS = (dir) => ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out'), '--docs', path.join(dir, 'docs'), '--harnesses', 'claude,agy', '--write']

test('a harness whose effort is in the id lists ids only: an object there is an error that says so, and nothing is written', async (t) => {
  const object = { id: 'zeta-2-low', excluded: 'Kept out.' }
  const listings = withListings({ agy: { models: ['zeta-2-medium', object] } })
  assert.deepEqual(badListings(NATIVE_LISTINGS, ['claude', 'agy', 'grok']), [])
  const [problem, ...rest] = badListings(listings, ['claude', 'agy'])
  assert.equal(rest.length, 0)
  assert.ok(problem.startsWith('agy lists {"id":"zeta-2-low","excluded":"Kept out."}'), problem)
  assert.match(problem, /its effort is in the id, so it lists ids as strings/)
  // The same object on a harness whose effort is a flag is fine, and a harness that is not chosen is not read.
  assert.deepEqual(badListings(withListings({ claude: { models: [object] } }), ['claude']), [])
  assert.deepEqual(badListings(listings, ['claude']), [])

  const dir = workDir(t, { raw: NATIVE_RAW, lanes: NATIVE_LANES, listings, profiles: NATIVE_PROFILES })
  const result = await main(WRITE_ARGS(dir), { env: {}, now: NOW })
  assert.equal(result.exitCode, 1)
  assert.match(result.stdout, /^agy lists .*its effort is in the id/)
  assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false)
  assert.ok(fs.readFileSync(path.join(dir, 'docs', 'README.md'), 'utf8').includes('\nold\n'), 'the README was not touched')
})

test('an excluded that is there and is not a non-empty string is an error with a clear message, not a model put into use', async (t) => {
  for (const excluded of ['', '   ', 5, true, null, ['why'], {}]) {
    const claude = { models: [{ id: 'zeta-2', alias: 'zeta' }, { id: 'zeta-big-2', alias: 'big', excluded }] }
    const [problem, ...rest] = badListings(withListings({ claude }), ['claude', 'agy'])
    assert.equal(rest.length, 0, JSON.stringify(excluded))
    assert.match(problem, /^claude lists zeta-big-2 in harness-models\.json with an excluded that is not a non-empty string/, JSON.stringify(excluded))
    assert.ok(problem.includes(`(${JSON.stringify(excluded)})`), problem)

    const dir = workDir(t, { raw: NATIVE_RAW, lanes: NATIVE_LANES, listings: withListings({ claude }), profiles: NATIVE_PROFILES })
    const result = await main(WRITE_ARGS(dir), { env: {}, now: NOW })
    assert.equal(result.exitCode, 1, JSON.stringify(excluded))
    assert.match(result.stdout, /zeta-big-2 in harness-models\.json with an excluded that is not a non-empty string/)
    assert.match(result.stdout, /give the reason the owner keeps it out, or remove the field/)
    assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false, JSON.stringify(excluded))
  }
})

test('an object listing with no id, or an entry that is not a string or an object, is an error and not a TypeError', async (t) => {
  for (const listed of [{ alias: 'x' }, { id: '' }, { id: 7 }, {}, null, 7]) {
    const claude = { models: [{ id: 'zeta-2', alias: 'zeta' }, listed] }
    const [problem, ...rest] = badListings(withListings({ claude }), ['claude', 'agy'])
    assert.equal(rest.length, 0, JSON.stringify(listed))
    assert.match(problem, /with no id: a model is an id \(a string\) or an object with a non-empty string id$/, JSON.stringify(listed))
    assert.ok(problem.startsWith(`claude lists ${JSON.stringify(listed)} `), problem)

    const dir = workDir(t, { raw: NATIVE_RAW, lanes: NATIVE_LANES, listings: withListings({ claude }), profiles: NATIVE_PROFILES })
    const result = await main(WRITE_ARGS(dir), { env: {}, now: NOW })
    assert.equal(result.exitCode, 1, JSON.stringify(listed))
    assert.match(result.stdout, /with no id/)
    assert.equal(fs.existsSync(path.join(dir, 'out', 'models.json')), false)
  }
})

// A model the owner excluded stays excluded, with its reason, when it is also superseded or released before the date.
const KEPT_RAW = [
  ...NATIVE_RAW,
  aa('zeta-1', 'Zeta 1 (High)', { creator: 'Zeta', date: '2026-03-01', intelligence: 30 }),
  aa('zeta-old-1', 'Zeta Old 1', { creator: 'Zeta', date: '2025-06-01', intelligence: 10 }),
  aa('zeta-dusty-1', 'Zeta Dusty 1', { creator: 'Zeta', date: '2025-06-01', intelligence: 10 }),
]
const KEPT_LISTINGS = withListings({
  claude: {
    models: [
      ...NATIVE_LISTINGS.harnesses.claude.models,
      { id: 'zeta-1', alias: 'one', excluded: 'Superseded and kept out all the same.' },
      { id: 'zeta-old-1', alias: 'old', excluded: 'Old and kept out all the same.' },
      'zeta-dusty-1',
    ],
  },
  agy: { models: [...NATIVE_LISTINGS.harnesses.agy.models, 'zeta-1-high'] },
})
const KEPT_PROFILES = { profiles: { ...NATIVE_PROFILES.profiles, 'zeta-1': profile('Model zeta-1'), 'zeta-old-1': profile('Model zeta-old-1') } }
const kept = () => buildModels(buildIndex(KEPT_RAW, { since: '2026-01-01', lanes: NATIVE_LANES, harnessModels: KEPT_LISTINGS, generatedAt: '2026-10-14', harnesses: ['claude', 'agy'] }), KEPT_PROFILES.profiles)

test('an excluded model that is also superseded or out of scope stays excluded with its reason, and is in neither of those lists', () => {
  const file = kept()
  const names = (list) => list.map((entry) => `${entry.harness}/${entry.model ?? entry.id}`)
  assert.deepEqual(names(file.excluded).sort(), ['claude/zeta-1', 'claude/zeta-big-2', 'claude/zeta-ghost-1', 'claude/zeta-old-1'])
  const one = file.excluded.find((entry) => entry.model === 'zeta-1')
  assert.deepEqual([one.alias, one.family, one.reason], ['one', 'zeta-1', 'Superseded and kept out all the same.'])
  assert.deepEqual(one.price, { input: 2, output: 10 })
  assert.equal(one.profile.purpose, '"Model zeta-1 is for tests."')
  const old = file.excluded.find((entry) => entry.model === 'zeta-old-1')
  assert.deepEqual([old.alias, old.reason, old.price, old.scores], ['old', 'Old and kept out all the same.', null, []])
  assert.equal(old.profile.purpose, '"Model zeta-old-1 is for tests."')
  // Not in use, and not in the lists it would have gone to; the other harness's superseded and the other out-of-scope stay there.
  assert.equal(file.models.some((entry) => entry.harness === 'claude' && ['zeta-1', 'zeta-old-1', 'zeta-dusty-1'].includes(entry.model)), false)
  assert.deepEqual(names(file.superseded), ['agy/zeta-1'])
  assert.deepEqual(names(file.outOfScope), ['claude/zeta-dusty-1'])
  assert.deepEqual(missingProfiles(file), [])
  const text = renderGenerated(file)
  assert.ok(text.includes('claude `zeta-1` (`one`): Superseded and kept out all the same'))
  assert.ok(text.includes('claude `zeta-old-1` (`old`): Old and kept out all the same'))
  assert.ok(text.includes('- Superseded, not to be used: agy `zeta-1` by `zeta-2`'))
  assert.ok(text.includes('- Out of scope: claude `zeta-dusty-1`:'))
  assert.equal(text.includes('`zeta-old-1`: Artificial Analysis lists'), false)
})

test('main counts a superseded or out-of-scope excluded model among the excluded ones, and not among the out of scope', async (t) => {
  const dir = workDir(t, { raw: KEPT_RAW, lanes: NATIVE_LANES, listings: KEPT_LISTINGS, profiles: KEPT_PROFILES })
  const result = await main(WRITE_ARGS(dir), { env: {}, now: NOW })
  assert.equal(result.exitCode, 0, result.stdout)
  assert.match(result.stdout, /Offered and excluded by the owner \(4\): .*claude\/zeta-1.*claude\/zeta-old-1/)
  assert.match(result.stdout, /Offered and out of scope, released before 2026-01-01 \(1\): claude\/zeta-dusty-1\./)
  const file = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'models.json'), 'utf8'))
  assert.deepEqual(file.excluded.map((entry) => entry.model).sort(), ['zeta-1', 'zeta-big-2', 'zeta-ghost-1', 'zeta-old-1'])
})

test('without --docs the README is written to docs/models next to the script', async (t) => {
  // The script finds its folders from its own place, so a copy in a throwaway tree has a docs/models of its own.
  const tree = tempDir(t, 'models-index-tree-')
  fs.mkdirSync(path.join(tree, 'scripts'))
  for (const name of ['build-models-index.js', 'refresh-lanes.js']) fs.copyFileSync(path.join(ROOT, 'scripts', name), path.join(tree, 'scripts', name))
  fs.mkdirSync(path.join(tree, 'docs', 'models'), { recursive: true })
  fs.writeFileSync(path.join(tree, 'docs', 'models', 'README.md'), '# Mine\n\n<!-- models-index:start -->\nold\n<!-- models-index:end -->\n\nkept\n')
  const copy = require(path.join(tree, 'scripts', 'build-models-index.js'))
  const dir = workDir(t, { raw: NATIVE_RAW, lanes: NATIVE_LANES, listings: NATIVE_LISTINGS, profiles: NATIVE_PROFILES })
  const real = fs.readFileSync(path.join(DOCS, 'README.md'), 'utf8')
  const args = ['--from', path.join(dir, 'raw.json'), '--lanes', path.join(dir, 'lanes.json'), '--out', path.join(dir, 'out'), '--write']
  const result = await copy.main(args, { env: {}, now: NOW })
  assert.equal(result.exitCode, 0, result.stdout)
  const readme = path.join(tree, 'docs', 'models', 'README.md')
  assert.ok(result.stdout.includes(`written to ${path.join(dir, 'out', 'models.json')} and ${readme}`), result.stdout)
  const text = fs.readFileSync(readme, 'utf8')
  assert.ok(text.startsWith('# Mine\n') && text.endsWith('\nkept\n'))
  assert.ok(text.includes('## Models in use') && !text.includes('\nold\n'))
  // The copy wrote into its own tree: neither the repository's README nor the work folder's was touched.
  assert.equal(fs.readFileSync(path.join(DOCS, 'README.md'), 'utf8'), real)
  assert.ok(fs.readFileSync(path.join(dir, 'docs', 'README.md'), 'utf8').includes('\nold\n'))
})

test('the README says an object listing is for the harnesses whose effort is a flag, and the ids of the others are strings', () => {
  const readme = fs.readFileSync(path.join(DOCS, 'README.md'), 'utf8')
  assert.ok(readme.includes('for a harness whose effort is a flag (claude, grok, codex), an object `{id, alias, efforts, listed, excluded}`'))
  assert.ok(readme.includes('A harness whose effort is in the id (agy, cursor) lists ids as strings only, and the script exits 1 on an object there'))
})

test('the index of models is built without levels, and its efforts for a model the harness does not list come from the pairs table', () => {
  // The synthetic lane table still carries levels for ghost-9 (low, high); the pairs table says three efforts, and only its agy rows count.
  const pairs = [
    { harness: 'agy', model: 'ghost-9', effort: 'high' },
    { harness: 'agy', model: 'ghost-9', effort: 'low' },
    { harness: 'agy', model: 'ghost-9', effort: 'medium' },
    { harness: 'grok', model: 'ghost-9', effort: 'xhigh' },
    { harness: 'agy', model: 'other', effort: 'max' },
  ]
  const entries = harnessEntries(LANES, LISTINGS, ['agy'], pairs)
  const ghost = entries.find((entry) => entry.model === 'ghost-9')
  assert.equal(ghost.detail.listing, 'not-listed')
  assert.deepEqual(ghost.detail.efforts, ['low', 'medium', 'high'])
  // Without the pairs table there is nothing to take the efforts from.
  assert.deepEqual(harnessEntries(LANES, LISTINGS, ['agy']).find((entry) => entry.model === 'ghost-9').detail.efforts, [])
  // No entry of the index carries levels or replaces.
  for (const entry of entries) {
    assert.equal(Object.hasOwn(entry.detail, 'levels'), false, entry.model)
    assert.equal(Object.hasOwn(entry.detail, 'replaces'), false, entry.model)
  }
  const index = buildIndex(RAW, { since: '2026-01-01', lanes: LANES, harnessModels: LISTINGS, generatedAt: '2026-10-13', harnesses: ['agy'], pairs })
  for (const offer of index.families.flatMap((entry) => entry.available)) assert.equal(Object.hasOwn(offer, 'levels'), false, offer.model)
  // The files the build wrote are free of both.
  const shipped = fs.readFileSync(path.join(ROOT, 'plugins', 'aether', 'config', 'models', 'models.json'), 'utf8')
  assert.doesNotMatch(shipped, /"levels"|"replaces"/)
})
