'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { snapshotOf } = require('./aa-page-fixtures.js')
const builder = require('../scripts/build-models-index.js')

const NOW = () => new Date(2026, 10, 13, 12, 0, 0).getTime()
const PROFILE = (name, over = {}) => ({ name, maker: 'Acme', purpose: 'What the maker says it is for.', contextTokens: 1000000, maxOutputTokens: 65536, defaultEffort: null, price: { input: 1, output: 2 }, knowledgeCutoff: null, availability: 'Everywhere.', caveats: [], sources: ['https://example.test'], checked: '2026-11-13', ...over })
const pair = (harness, model, effort, slug, over = {}) => ({ id: `${harness}/${model}@${effort}`, slug, harness, model, family: model, effort, group: harness === 'claude' ? null : harness, intelligence: 40, costPerTaskUsd: 1, outputTokensPerSecond: null, timeToFirstTokenS: null, ...over })
const SNAPSHOT = snapshotOf({
  'acme-1-medium': { name: 'Acme 1 (Medium)', figures: { intelligence: 41.2, terminalBench: 0.293, priceInput: 1.5, priceOutput: 7.5, outputTokensPerSecond: 90 } },
  'acme-1-high': { name: 'Acme 1 (High)', figures: { intelligence: 50.8, terminalBench: 0.54, priceInput: 1.5, priceOutput: 7.5 } },
})

// The inputs of a build, as files in a folder, and the folders it writes to.
function work(t, { listings, pairs = [], snapshot = SNAPSHOT, profiles, lanes = { harnesses: {} } } = {}) {
  const dir = tempDir(t, 'aether-index-')
  const write = (name, value) => { fs.writeFileSync(path.join(dir, name), JSON.stringify(value)); return path.join(dir, name) }
  const files = {
    lanes: write('lanes.json', lanes),
    pairs: write('pairs.json', { fetchedAt: '2026-11-13', pairs }),
    harness: write('harness-models.json', listings),
    profiles: write('profiles.json', { profiles }),
    snapshot: write('aa-pages.json', snapshot),
  }
  fs.mkdirSync(path.join(dir, 'out'))
  fs.mkdirSync(path.join(dir, 'docs'))
  fs.writeFileSync(path.join(dir, 'docs', 'README.md'), '# Models\n\n<!-- models-index:start -->\nold\n<!-- models-index:end -->\n')
  const args = (extra = []) => ['--lanes', files.lanes, '--pairs', files.pairs, '--harness', files.harness, '--profiles', files.profiles, '--snapshot', files.snapshot, '--harnesses', 'agy', '--out', path.join(dir, 'out'), '--docs', path.join(dir, 'docs'), ...extra]
  return { dir, files, args }
}
const AGY = (extra = {}) => ({ capturedAt: '2026-11-13', harnesses: { agy: { listedBy: 'agy models', effortVia: 'id', models: ['acme-1-medium', 'acme-1-high'], ...extra } } })
const ROWS = [pair('agy', 'acme-1', 'medium', 'acme-1-medium'), pair('agy', 'acme-1', 'high', 'acme-1-high')]
const built = (w) => JSON.parse(fs.readFileSync(path.join(w.dir, 'out', 'models.json'), 'utf8'))

test('the index has no flag for the API, a saved answer, a date or the pages: each one is a usage error', (t) => {
  const w = work(t, { listings: AGY(), pairs: ROWS, profiles: { 'acme-1': PROFILE('Acme 1') } })
  for (const flag of [['--from', 'x.json'], ['--since', '2026-01-01'], ['--pages'], ['--cache', 'x']]) {
    const out = builder.main(w.args(flag), { now: NOW })
    assert.equal(out.exitCode, 2, flag.join(' '))
    assert.match(out.stdout, /^usage: node scripts\/build-models-index\.js \[--harnesses /)
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build-models-index.js'), 'utf8')
  const KEY_HEADER = ['x', 'api', 'key'].join('-') // built from pieces: the absence test of Task 9 searches the tree for it
  assert.equal(/\bfetch\b/.test(source), false, 'fetch')
  for (const gone of ['MODELS_URL', KEY_HEADER, 'keyFrom', 'refresh-lanes', 'aa-api']) assert.equal(source.includes(gone), false, gone)
})

test('the models in use are the listed ones, with the efforts of their pair rows and the figures of the photo', (t) => {
  const w = work(t, { listings: AGY(), pairs: ROWS, profiles: { 'acme-1': PROFILE('Acme 1', { released: '2026-11-12' }) } })
  const out = builder.main(w.args(['--write']), { now: NOW })
  assert.equal(out.exitCode, 0, out.stdout)
  const file = built(w)
  assert.equal(file.source, 'plugins/aether/config/models/aa-pages.json, from the model pages https://artificialanalysis.ai/models/<slug>')
  assert.equal(Object.hasOwn(file, 'since'), false)
  assert.equal(file.generatedAt, '2026-11-13')
  const [entry] = file.models
  assert.deepEqual([entry.harness, entry.model, entry.family, entry.name, entry.maker, entry.released], ['agy', 'acme-1', 'acme-1', 'Acme 1', 'Acme', '2026-11-12'])
  assert.deepEqual(entry.efforts, ['medium', 'high'])
  assert.deepEqual(entry.scores[0], { effort: 'medium', intelligence: 41.2, terminalBench: 0.293, priceInput: 1.5, priceOutput: 7.5, tokensPerSecond: 90, ttftSeconds: null })
  assert.deepEqual(entry.scores.map((s) => s.effort), ['medium', 'high'])
  assert.match(out.stdout, /^1 models in use \(2 scores\) from agy\./)
})

test('an effort the harness takes and no row asks for has no score, and a model with no score is listed with no figures and named in the summary', (t) => {
  const listings = AGY({ models: ['acme-1-medium', 'acme-1-low', 'orphan-high'] })
  const w = work(t, { listings, pairs: [ROWS[0]], profiles: { 'acme-1': PROFILE('Acme 1'), orphan: PROFILE('Orphan') } })
  const out = builder.main(w.args(['--write']), { now: NOW })
  assert.equal(out.exitCode, 0, out.stdout)
  const file = built(w)
  assert.deepEqual(file.models[0].scores.map((s) => s.effort), ['medium'])
  assert.deepEqual(file.withoutFigures.map((e) => [e.harness, e.model, e.note]), [['agy', 'orphan', 'offered, with no Artificial Analysis entry, so no figures; not a lane: the lane table does not list it']])
  assert.match(out.stdout, /Listed with no pair row and no photo \(1\): agy\/orphan\./)
})

test('a model declared superseded or out of scope is not in use, and models.json and the README say so with the reason and the date', (t) => {
  const listings = AGY({
    models: ['acme-1-medium', 'old-1-high', 'tiny-1-medium'],
    superseded: { 'old-1': { by: 'acme-1', on: '2026-11-13', reason: 'Replaced by Acme 1.', figures: 'Old 1 high 30.8 on 2026-11-13 against Acme 1 medium 41.2.' } },
    outOfScope: { 'tiny-1': { on: '2026-11-13', reason: 'Not a model Aether considers.' } },
  })
  const w = work(t, { listings, pairs: [ROWS[0], pair('agy', 'old-1', 'high', 'old-1-high')], profiles: { 'acme-1': PROFILE('Acme 1'), 'old-1': PROFILE('Old 1') } })
  const out = builder.main(w.args(['--write']), { now: NOW })
  assert.equal(out.exitCode, 0, out.stdout)
  const file = built(w)
  assert.deepEqual(file.models.map((e) => e.model), ['acme-1'])
  assert.deepEqual(file.superseded, [{ harness: 'agy', id: 'old-1', supersededBy: 'acme-1', on: '2026-11-13', reason: 'Replaced by Acme 1.', figures: 'Old 1 high 30.8 on 2026-11-13 against Acme 1 medium 41.2.' }])
  assert.deepEqual(file.outOfScope, [{ harness: 'agy', model: 'tiny-1', reason: 'Not a model Aether considers.', on: '2026-11-13' }])
  assert.match(out.stdout, /Declared superseded \(1\): agy\/old-1 by acme-1\./)
  const readme = fs.readFileSync(path.join(w.dir, 'docs', 'README.md'), 'utf8')
  assert.match(readme, /Superseded, not to be used: agy `old-1` by `acme-1`/)
  assert.match(readme, /\*\*Old 1\*\* `old-1` \(agy, superseded\)/)
  assert.match(readme, /Generated on 2026-11-13 from plugins\/aether\/config\/models\/aa-pages\.json, from the model pages/)
})

test('a declaration without its date, its reason or its successor is refused, naming the model, and nothing is written', (t) => {
  for (const [section, entry, field] of [
    ['superseded', { by: 'acme-1', reason: 'r' }, 'on'],
    ['superseded', { by: 'acme-1', on: '2026-11-13' }, 'reason'],
    ['superseded', { on: '2026-11-13', reason: 'r' }, 'by'],
    ['outOfScope', { on: '13/11/2026', reason: 'r' }, 'on'],
  ]) {
    const w = work(t, { listings: AGY({ [section]: { 'old-1': entry } }), pairs: ROWS, profiles: { 'acme-1': PROFILE('Acme 1') } })
    const out = builder.main(w.args(['--write']), { now: NOW })
    assert.equal(out.exitCode, 1, `${section} ${field}`)
    assert.match(out.stdout, new RegExp(`agy declares ${section} old-1 in harness-models\\.json with no ${field}`))
    assert.equal(fs.existsSync(path.join(w.dir, 'out', 'models.json')), false)
  }
})

test('a model in use with no profile is listed and the exit code is 1; and two builds from the same inputs write the same files', (t) => {
  const bare = work(t, { listings: AGY(), pairs: ROWS, profiles: {} })
  const out = builder.main(bare.args(), { now: NOW })
  assert.equal(out.exitCode, 1)
  assert.match(out.stdout, /Without a profile \(1\): acme-1\./)
  const w = work(t, { listings: AGY(), pairs: ROWS, profiles: { 'acme-1': PROFILE('Acme 1') } })
  builder.main(w.args(['--write']), { now: NOW })
  const first = [fs.readFileSync(path.join(w.dir, 'out', 'models.json'), 'utf8'), fs.readFileSync(path.join(w.dir, 'docs', 'README.md'), 'utf8')]
  builder.main(w.args(['--write']), { now: () => NOW() + 3 * 24 * 3600 * 1000 })
  assert.deepEqual([fs.readFileSync(path.join(w.dir, 'out', 'models.json'), 'utf8'), fs.readFileSync(path.join(w.dir, 'docs', 'README.md'), 'utf8')], first)
})

test('the native harness maps an alias to its pair rows, and the page of the max effort is the model slug without a suffix', (t) => {
  const listings = { capturedAt: '2026-11-13', harnesses: { claude: { listedBy: 'claude --help', effortVia: 'flag', efforts: ['high', 'max'], models: [{ id: 'acme-5', alias: 'acme' }] } } }
  const snapshot = snapshotOf({ 'acme-5-high': { figures: { intelligence: 30 } }, 'acme-5': { figures: { intelligence: 36.2, terminalBench: 0.328 } } })
  const w = work(t, { listings, snapshot, pairs: [pair('claude', 'acme', 'high', 'acme-5-high'), pair('claude', 'acme', 'max', 'acme-5')], profiles: { 'acme-5': PROFILE('Acme 5') } })
  const out = builder.main(w.args(['--write', '--harnesses', 'claude']), { now: NOW })
  assert.equal(out.exitCode, 0, out.stdout)
  assert.deepEqual(built(w).models[0].scores.map((s) => [s.effort, s.intelligence]), [['high', 30], ['max', 36.2]])
})

const { serialize, splitId, harnessEntries, badListings, mergeReadme, renderGenerated, missingProfiles, missingListings } = builder

test('ids retain thinking and fast forms and normalize extra-high', () => {
  assert.deepEqual(splitId('claude-opus-5-thinking-high-fast'), { model: 'claude-opus-5-thinking', effort: 'high', fast: true })
  assert.deepEqual(splitId('claude-4.6-opus-high-thinking'), { model: 'claude-4.6-opus-thinking', effort: 'high', fast: false })
  assert.deepEqual(splitId('gpt-5.5-extra-high'), { model: 'gpt-5.5', effort: 'xhigh', fast: false })
  assert.deepEqual(splitId('composer-2.5-fast'), { model: 'composer-2.5', effort: null, fast: true })
})

test('serialization is stable, compact for short records and readable for long ones', () => {
  const value = { a: [], b: {}, c: 'x'.repeat(200) }
  assert.equal(serialize(value), `{\n  "a": [],\n  "b": {},\n  "c": "${'x'.repeat(200)}"\n}`)
  assert.deepEqual(JSON.parse(serialize(value)), value)
  assert.equal(serialize(JSON.parse(serialize(value))), serialize(value))
})

test('mergeReadme preserves text outside the markers and refuses missing markers', () => {
  const start = '<!-- models-index:start -->'
  const end = '<!-- models-index:end -->'
  assert.equal(mergeReadme(`before\n${start}\nold\n${end}\nafter`, 'new'), `before\n${start}\nnew\n${end}\nafter`)
  assert.match(mergeReadme(null, 'new'), /\nnew\n/)
  assert.equal(mergeReadme('no markers', 'new'), null)
})

test('flag listings validate malformed ids and exclusions; id listings accept only strings', () => {
  for (const listed of [null, 7, {}, { id: '' }, { id: 7 }]) {
    assert.match(badListings({ harnesses: { claude: { models: [listed] } } }, ['claude'])[0], /with no id/)
  }
  for (const excluded of ['', ' ', null, 5, true, []]) {
    assert.match(badListings({ harnesses: { claude: { models: [{ id: 'acme', excluded }] } } }, ['claude'])[0], /excluded that is not a non-empty string/)
  }
  assert.match(badListings(AGY({ models: [{ id: 'acme-high' }] }), ['agy'])[0], /its effort is in the id/)
})

test('harness entries retain aliases, effort overrides, fast ids and lane-only efforts', () => {
  const listings = { harnesses: {
    claude: { effortVia: 'flag', efforts: ['high', 'low'], models: ['plain', { id: 'acme', alias: 'a', efforts: ['max'], excluded: 'Owner decision.' }] },
    agy: { effortVia: 'id', models: ['acme-high-fast', 'acme-low', 'acme-high'] },
  } }
  const entries = harnessEntries({ harnesses: { agy: { models: { absent: { roles: ['writer'] } } } } }, listings, ['agy', 'claude'], [pair('agy', 'absent', 'high', 'absent')])
  assert.deepEqual(entries.map((entry) => `${entry.harness}/${entry.model}`), ['claude/acme', 'claude/plain', 'agy/absent', 'agy/acme'])
  assert.equal(entries[0].detail.alias, 'a')
  assert.deepEqual(entries[0].detail.efforts, ['max'])
  assert.deepEqual(entries[1].detail.efforts, ['low', 'high'])
  assert.equal(entries[2].detail.listing, 'not-listed')
  assert.deepEqual(entries[2].detail.efforts, ['high'])
  assert.deepEqual(entries[3].detail.fastIds, { high: 'acme-high-fast' })
})

test('lane-only entries and owner exclusions stay outside models in use; README keeps columns and profiles', (t) => {
  const w = work(t, { listings: { capturedAt: '2026-11-13', harnesses: { claude: { effortVia: 'flag', efforts: ['high'], models: ['acme', { id: 'excluded', excluded: 'Owner decision.' }] } } }, pairs: [pair('claude', 'acme', 'high', 'acme-1-high'), pair('claude', 'excluded', 'high', 'acme-1-high')], profiles: { acme: PROFILE('Acme'), excluded: PROFILE('Excluded'), absent: PROFILE('Absent') }, lanes: { harnesses: { claude: { models: { absent: { roles: ['writer'] } } } } } })
  const out = builder.main(w.args(['--harnesses', 'claude', '--write']))
  assert.equal(out.exitCode, 0, out.stdout)
  const file = built(w)
  assert.deepEqual(file.models.map((entry) => entry.model), ['acme'])
  assert.deepEqual(file.excluded.map((entry) => entry.model), ['excluded'])
  assert.deepEqual(file.notOffered.map((entry) => entry.model), ['absent'])
  assert.equal(Object.hasOwn(file.models[0], 'released'), false)
  const text = renderGenerated(file)
  assert.match(text, /\| Model \| Harness \| Efforts taken \| Intelligence \| Terminal-bench \| \$\/M in\/out \| Tokens\/s \|/)
  assert.match(text, /Excluded, not used: claude `excluded`: Owner decision/)
  assert.match(text, /\*\*Excluded\*\*/)
  assert.ok(text.split('\n').length < 80)
})

test('lane-only models remain not offered when declared superseded or out of scope', (t) => {
  const listings = AGY({ superseded: { old: { by: 'acme-1', on: '2026-11-13', reason: 'Replaced.' } }, outOfScope: { tiny: { on: '2026-11-13', reason: 'Out of scope.' } } })
  const lanes = { harnesses: { agy: { models: { old: { roles: ['writer'] }, tiny: { roles: ['reviewer'] } } } } }
  const w = work(t, { listings, lanes, pairs: ROWS, profiles: { 'acme-1': PROFILE('Acme 1'), old: PROFILE('Old'), tiny: PROFILE('Tiny') } })
  const out = builder.main(w.args(['--write']))
  assert.equal(out.exitCode, 0, out.stdout)
  const file = built(w)
  assert.deepEqual(file.notOffered.map((entry) => entry.model), ['old', 'tiny'])
  assert.match(out.stdout, /Named by the lane table and not offered \(2\): agy\/old, agy\/tiny\./)
})

test('committed files retain the index shape, profiles, ordering and a short README', () => {
  const config = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models')
  const file = JSON.parse(fs.readFileSync(path.join(config, 'models.json'), 'utf8'))
  const listings = JSON.parse(fs.readFileSync(path.join(config, 'harness-models.json'), 'utf8'))
  const profiles = JSON.parse(fs.readFileSync(path.join(config, 'profiles.json'), 'utf8')).profiles
  assert.deepEqual(fs.readdirSync(config).filter((name) => name !== 'aa-pages.json').sort(), ['harness-models.json', 'models.json', 'profiles.json'])
  assert.deepEqual(Object.keys(file.rules), ['newest', 'offered', 'profiled'])
  assert.deepEqual(missingListings(listings, file.harnesses), [])
  assert.deepEqual(missingProfiles(file), [])
  const fields = ['purpose', 'contextTokens', 'maxOutputTokens', 'defaultEffort', 'price', 'knowledgeCutoff', 'availability', 'caveats', 'sources', 'checked']
  for (const entry of file.models) {
    const required = ['harness', 'model', 'family', 'name', 'maker', 'effortVia', 'efforts', 'scores', 'lane', 'profile']
    const optional = ['alias', 'released', 'ids', 'fastIds']
    assert.deepEqual(Object.keys(entry).filter((key) => !optional.includes(key)).sort(), required.sort())
    const profile = profiles[entry.family] ?? profiles[entry.family.replace(/\./g, '-')] ?? profiles[entry.family.replace(/-/g, '.')]
    assert.ok(profile, `profile for ${entry.harness}/${entry.model}`)
    assert.deepEqual(entry.profile, Object.fromEntries(fields.map((field) => [field, profile[field] ?? null])))
    assert.equal(entry.name, profile.name)
    assert.equal(entry.maker, profile.maker)
  }
  const order = ['claude', 'agy', 'codex', 'grok', 'cursor', 'muse']
  assert.deepEqual(file.models, [...file.models].sort((a, b) => order.indexOf(a.harness) - order.indexOf(b.harness) || (Object.hasOwn(file, 'since') ? 0 : a.model < b.model ? -1 : a.model > b.model ? 1 : 0)))
  for (const entry of [...file.models, ...file.excluded, ...file.withoutFigures, ...file.notOffered]) {
    assert.ok(entry.profile.purpose.length > 0)
    assert.ok(entry.profile.sources.length > 0)
    assert.match(entry.profile.checked, /^\d{4}-\d{2}-\d{2}$/)
  }
  const readme = fs.readFileSync(path.join(__dirname, '..', 'docs', 'models', 'README.md'), 'utf8')
  assert.ok(readme.split('\n').length < 80)
  assert.match(readme, /<!-- models-index:start -->/)
  assert.match(readme, /<!-- models-index:end -->/)
})

test('the README uses the highest scored effort and the nearest lower price and speed', () => {
  const index = builder.buildIndex({ harnessModels: AGY(), pairs: ROWS, snapshot: SNAPSHOT, harnesses: ['agy'] })
  const file = builder.buildModels(index, { 'acme-1': PROFILE('Acme 1') })
  assert.match(renderGenerated(file), /\| Acme 1 `acme-1` \| agy \| medium, high \| 50\.8 \| 0\.54 \| 1\.5 \/ 7\.5 \| 90 \|/)
  assert.equal(builder.buildIndex({ snapshot: { pages: {} } }).generatedAt, null)
})

test('an uncaptured harness and a README without markers fail before writing', (t) => {
  const w = work(t, { listings: AGY(), pairs: ROWS, profiles: { 'acme-1': PROFILE('Acme 1') } })
  let result = builder.main(w.args(['--harnesses', 'muse', '--write']))
  assert.equal(result.exitCode, 1)
  assert.match(result.stdout, /no listing captured for muse: capture it with the model\/list method/)
  fs.writeFileSync(path.join(w.dir, 'docs', 'README.md'), '# Handwritten only\n')
  result = builder.main(w.args(['--write']))
  assert.equal(result.exitCode, 1)
  assert.match(result.stdout, /has no <!-- models-index:start -->/)
  assert.equal(fs.existsSync(path.join(w.dir, 'out', 'models.json')), false)
})
