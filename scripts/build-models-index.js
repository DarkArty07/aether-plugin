'use strict'

// Build the local index from captured listings, pair addresses and page figures.
const fs = require('node:fs')
const path = require('node:path')
const { loadSnapshot, SNAPSHOT_FILE } = require('./aa-pages.js')
const DEFAULT_LANES = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'lanes.json')
const DEFAULT_PAIRS = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'pairs.json')
const DEFAULT_OUT = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models')
const DEFAULT_DOCS = path.join(__dirname, '..', 'docs', 'models')
const USAGE = 'usage: node scripts/build-models-index.js [--harnesses claude,agy,grok] [--profiles <file>] [--write] [--lanes <lanes.json>] [--pairs <pairs.json>] [--harness <file>] [--snapshot <aa-pages.json>] [--out <dir>] [--docs <dir>]'
const HARNESSES = ['claude', 'agy', 'codex', 'grok', 'cursor', 'muse']
// The chosen harnesses, whose models the index keeps. Another comes in with --harnesses once its listing is in harness-models.json.
const DEFAULT_HARNESSES = ['claude', 'agy', 'codex', 'grok', 'muse']
const LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']
// From the least to the most effort. default is a reasoning model with no level named, and none is
// the harness's word for no reasoning; both sit under the named levels.
const ORDER = ['non-reasoning-low', 'non-reasoning', 'non-reasoning-medium', 'non-reasoning-high', 'none', 'default', ...LEVELS, 'ultra']
const EFFORT_TOKEN = /-(extra-high|xhigh|none|minimal|low|medium|high|max)$/
const RULES = {
  newest: 'Only the newest generation of each line is used (Sonnet 5.5, not Sonnet 5): an older one is declared superseded in harness-models.json, with its reason and date.',
  offered: 'Only a model the CLI of a chosen harness lists is in, whatever Artificial Analysis lists; a model only the lane table names is not offered.',
  profiled: "Every model has a profile written from its maker's pages, with its sources and the date checked; without one the build exits 1.",
}
// How to capture the listing of each harness into harness-models.json.
const CAPTURE = {
  claude: 'by hand from `claude --help` (its --model aliases and its --effort levels; Claude Code has no command that lists models)',
  agy: 'with `agy models`',
  codex: 'from the `models` of ~/.codex/models_cache.json (codex has no command that lists them)',
  grok: 'with `grok models`',
  cursor: 'with `cursor-agent --list-models`',
  muse: 'with the model/list method of `muse serve` (no model call; the ids it lists, newest first)',
}
const NO_ENTRY = 'no Artificial Analysis entry'
const README_START = '<!-- models-index:start -->'
const README_END = '<!-- models-index:end -->'

// Pure assembly: only the supplied snapshot gives scores; declarations decide scope.
function buildIndex({ lanes = {}, harnessModels = {}, pairs = [], snapshot = { pages: {} }, harnesses = DEFAULT_HARNESSES, generatedAt = null }) {
  const pages = snapshot.pages ?? {}
  const dates = Object.values(pages).map((page) => page.readOn).filter(Boolean).sort()
  const index = {
    generatedAt: generatedAt ?? dates.at(-1) ?? null,
    source: 'plugins/aether/config/models/aa-pages.json, from the model pages https://artificialanalysis.ai/models/<slug>',
    harnesses: HARNESSES.filter((name) => harnesses.includes(name)),
    listedOn: Object.fromEntries(harnesses.map((name) => [name, harnessModels.harnesses?.[name]?.capturedAt ?? harnessModels.capturedAt ?? null])),
    entries: [],
    superseded: [],
    outOfScope: [],
  }
  for (const harness of index.harnesses) {
    const listing = harnessModels.harnesses?.[harness] ?? {}
    for (const [id, value] of Object.entries(listing.superseded ?? {}).sort((a, b) => compare(a[0], b[0]))) {
      index.superseded.push({ harness, id, supersededBy: value.by, on: value.on, reason: value.reason, ...(value.figures ? { figures: value.figures } : {}) })
    }
    for (const [model, value] of Object.entries(listing.outOfScope ?? {}).sort((a, b) => compare(a[0], b[0]))) {
      index.outOfScope.push({ harness, model, reason: value.reason, on: value.on })
    }
  }
  for (const entry of harnessEntries(lanes, harnessModels, harnesses, pairs)) {
    const { harness, model, detail } = entry
    const listing = harnessModels.harnesses?.[harness] ?? {}
    if (detail.listing !== 'not-listed' && !detail.excluded && (listing.superseded?.[model] || listing.outOfScope?.[model])) continue
    const scores = []
    for (const effort of detail.efforts) {
      const pair = pairs.find((row) => row.harness === harness && (row.model === model || row.model === detail.alias) && row.effort === effort)
      const page = pages[pair?.slug]
      if (!page) continue
      const value = (key) => page.figures?.[key]?.value ?? null
      scores.push({
        effort,
        intelligence: value('intelligence'),
        ...(value('terminalBench') === null ? {} : { terminalBench: value('terminalBench') }),
        priceInput: value('priceInput'),
        priceOutput: value('priceOutput'),
        tokensPerSecond: value('outputTokensPerSecond'),
        ttftSeconds: value('timeToFirstTokenS'),
      })
    }
    index.entries.push({ harness, model, ...detail, scores })
  }
  return index
}

function buildModels(index, profiles = {}) {
  const profileOf = (key) => profiles[key] ?? profiles[key?.replace(/\./g, '-')] ?? profiles[key?.replace(/-/g, '.')] ?? null
  const file = {
    generatedAt: index.generatedAt,
    source: index.source,
    harnesses: index.harnesses,
    listedOn: index.listedOn,
    rules: RULES,
    models: [],
    excluded: [],
    notOffered: [],
    withoutFigures: [],
    superseded: index.superseded,
    outOfScope: index.outOfScope,
  }
  for (const entry of index.entries) {
    const family = entry.model.toLowerCase().replace(/\./g, '-')
    const profile = profileOf(family)
    const record = {
      harness: entry.harness,
      model: entry.model,
      ...(entry.alias ? { alias: entry.alias } : {}),
      family,
      name: profile?.name ?? entry.model,
      maker: profile?.maker ?? null,
      ...(profile?.released ? { released: profile.released } : {}),
      effortVia: entry.effortVia,
      efforts: entry.efforts,
      ...(entry.ids ? { ids: entry.ids } : {}),
      ...(entry.fastIds ? { fastIds: entry.fastIds } : {}),
      scores: entry.scores,
      lane: entry.inLaneTable ? { roles: entry.roles } : null,
      profile: profileRecord(profile),
    }
    if (entry.excluded) file.excluded.push({ ...record, reason: entry.excluded, price: priceOf(entry.scores) })
    else if (entry.listing === 'not-listed') file.notOffered.push({ ...record, roles: entry.roles, reason: 'named by the lane table, but not listed by the CLI' })
    else if (entry.scores.length === 0) file.withoutFigures.push({ ...record, note: `offered, with ${NO_ENTRY}, so no figures${entry.inLaneTable ? '' : '; not a lane: the lane table does not list it'}` })
    else file.models.push(record)
  }
  return file
}

function orderOf(effort) {
  const at = ORDER.indexOf(effort)
  return at === -1 ? ORDER.length : at
}

// Orders strings by code units, the default string order (localeCompare would differ).
function compare(a, b) {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

// The models each harness offers, as listed by its CLI and as named by the lane table, one entry
// per model in harness order. `detail` is what the index records about it. A model the lane table names and the
// CLI does not list has no efforts of its own: it takes those of its rows in `pairs`.
function harnessEntries(lanes, listings, harnesses = HARNESSES, pairs = []) {
  const entries = []
  for (const harness of HARNESSES.filter((name) => harnesses.includes(name))) {
    const listing = listings.harnesses?.[harness] ?? {}
    const lane = lanes.harnesses?.[harness]?.models ?? {}
    const effortVia = listing.effortVia ?? null
    const listingModels = [...(listing.models ?? []), ...(listing.calledNotListed ?? [])]
    const byModel = effortVia === 'id' ? listedById(listingModels) : listedByFlag(listing)
    for (const id of Object.keys(lane)) {
      if (byModel.has(id)) continue
      const asked = pairs.filter((pair) => pair.harness === harness && pair.model === id).map((pair) => pair.effort)
      byModel.set(id, { efforts: sortEfforts(new Set(asked)), ids: null, fastIds: null, listing: 'not-listed' })
    }
    for (const [model, found] of [...byModel].sort((a, b) => compare(a[0], b[0]))) {
      const inLaneTable = Object.hasOwn(lane, model)
      const entry = inLaneTable ? lane[model] : null
      entries.push({
        harness,
        model,
        detail: {
          effortVia,
          efforts: found.efforts,
          ids: found.ids,
          fastIds: found.fastIds,
          listing: found.listing,
          ...(found.alias ? { alias: found.alias } : {}),
          ...(found.excluded ? { excluded: found.excluded } : {}),
          inLaneTable,
          roles: entry?.roles ?? [],
          aaSlug: entry?.aa?.slug ?? null,
        },
      })
    }
  }
  return entries
}

// The models of a harness that puts the effort in the id (agy, Cursor): each listed id is a model
// at an effort, so the ids are grouped by the model they share. A -fast build and a -thinking
// build are kept apart from the plain one: -fast under fastIds, -thinking as a model of its own.
function listedById(ids) {
  const byModel = new Map()
  for (const listed of ids) {
    const parts = splitId(String(listed))
    if (!byModel.has(parts.model)) byModel.set(parts.model, { ids: {}, fastIds: {} })
    byModel.get(parts.model)[parts.fast ? 'fastIds' : 'ids'][parts.effort ?? 'default'] = String(listed)
  }
  const result = new Map()
  for (const [model, found] of byModel) {
    const efforts = sortEfforts(new Set([...Object.keys(found.ids), ...Object.keys(found.fastIds)]))
    const fastIds = Object.keys(found.fastIds).length > 0 ? sortKeys(found.fastIds) : null
    result.set(model, { efforts, ids: sortKeys(found.ids), fastIds, listing: 'listed' })
  }
  return result
}

// An id split into its model (with -thinking kept), its effort or null, and whether it is -fast.
function splitId(listed) {
  let rest = listed
  const fast = rest.endsWith('-fast')
  if (fast) rest = rest.slice(0, -'-fast'.length)
  let thinking = rest.endsWith('-thinking')
  if (thinking) rest = rest.slice(0, -'-thinking'.length)
  let effort = null
  const token = EFFORT_TOKEN.exec(rest)
  if (token) {
    effort = token[1] === 'extra-high' ? 'xhigh' : token[1]
    rest = rest.slice(0, token.index)
  }
  if (!thinking && rest.endsWith('-thinking')) {
    thinking = true
    rest = rest.slice(0, -'-thinking'.length)
  }
  return { model: thinking ? `${rest}-thinking` : rest, effort, fast }
}

// The models of a harness that takes the effort in a flag (claude, codex, grok): each listed id is a model.
// A listing is an id (a string) or an object: {id, alias, efforts, listed, excluded}. A model's own efforts
// win over the harness's; the alias is the name the CLI takes in place of the id (claude --model sonnet);
// `excluded` is the reason the owner keeps a listed model out of use.
function listedByFlag(listing) {
  const result = new Map()
  const models = [...(listing.models ?? []), ...(listing.calledNotListed ?? [])]
  for (const listed of models) {
    const object = typeof listed === 'string' ? {} : listed
    const model = typeof listed === 'string' ? listed : listed.id
    const efforts = object.efforts ?? listing.efforts
    result.set(model, {
      efforts: sortEfforts(new Set(efforts ?? [])),
      ids: null,
      fastIds: null,
      listing: object.listed === false ? 'hidden' : 'listed',
      alias: typeof object.alias === 'string' && object.alias !== '' ? object.alias : null,
      excluded: typeof object.excluded === 'string' && object.excluded !== '' ? object.excluded : null,
    })
  }
  return result
}

function sortEfforts(efforts) {
  return [...efforts].sort((a, b) => orderOf(a) - orderOf(b) || compare(a, b))
}

function sortKeys(object) {
  return Object.fromEntries(sortEfforts(new Set(Object.keys(object))).map((key) => [key, object[key]]))
}

function serialize(value, depth = 0) {
  const flat = JSON.stringify(value)
  if (value === null || typeof value !== 'object' || flat.length <= 150) return flat
  const pad = '  '.repeat(depth)
  const list = Array.isArray(value)
  const parts = list
    ? value.map((item) => serialize(item, depth + 1))
    : Object.keys(value).map((key) => `${JSON.stringify(key)}: ${serialize(value[key], depth + 1)}`)
  return `${list ? '[' : '{'}\n${parts.map((part) => `${pad}  ${part}`).join(',\n')}\n${pad}${list ? ']' : '}'}`
}

function priceOf(scores) {
  const priced = [...scores].reverse().find((score) => score.priceInput !== null && score.priceOutput !== null)
  return priced ? { input: priced.priceInput, output: priced.priceOutput } : null
}

const PROFILE_FIELDS = ['purpose', 'contextTokens', 'maxOutputTokens', 'defaultEffort', 'price', 'knowledgeCutoff', 'availability', 'caveats', 'sources', 'checked']
function profileRecord(profile) {
  return profile ? Object.fromEntries(PROFILE_FIELDS.map((field) => [field, profile[field] ?? null])) : null
}

function renderGenerated(file) {
  const lines = [
    '## Rules',
    '',
    ...Object.values(file.rules).map((rule, at) => `${at + 1}. ${rule}`),
    '',
    '## Models in use',
    '',
    '| Model | Harness | Efforts taken | Intelligence | Terminal-bench | $/M in/out | Tokens/s |',
    '|---|---|---|---:|---:|---:|---:|',
    ...file.models.map(tableRow),
    '',
    `Generated on ${file.generatedAt} from ${file.source}; the harnesses' listings are of ${listedText(file.listedOn)}. Scores are at the highest effort the harness takes that AA scored (\`models.json\` has each effort); \`*\`: in the lane table.`,
    '',
    "## What each is for (`profiles.json`, from the maker's pages)",
    '',
    ...file.models.map((entry) => profileLine(entry, null)),
    ...(file.supersededProfiles ?? []).map((entry) => profileLine(entry, 'superseded')),
    ...(file.excluded ?? []).map((entry) => profileLine(entry, 'excluded')),
    ...file.withoutFigures.map((entry) => profileLine(entry, 'no figures')),
    ...file.notOffered.map((entry) => profileLine(entry, 'not offered')),
    '',
    '## Left out',
    '',
  ]
  const left = [
    ['Excluded, not used', (file.excluded ?? []).map((entry) => `${entry.harness} \`${entry.model}\`${entry.alias ? ` (\`${entry.alias}\`)` : ''}: ${entry.reason.replace(/\.$/, '')}`)],
    ['Not offered', file.notOffered.map((entry) => `${entry.harness} \`${entry.model}\`${entry.roles.length > 0 ? ` (${entry.roles.join(', ')})` : ''}: ${entry.reason}${entry.on ? ` (${entry.on})` : ''}`)],
    ['No figures', file.withoutFigures.map((entry) => `${entry.harness} \`${entry.model}\`: ${entry.note}`)],
    ['Superseded, not to be used', file.superseded.map((entry) => `${entry.harness} \`${entry.id}\` by \`${entry.supersededBy}\`${entry.reason ? `: ${entry.reason} (${entry.on})` : ''}${entry.figures ? `; ${entry.figures}` : ''}`)],
    ['Out of scope', file.outOfScope.map((entry) => `${entry.harness} \`${entry.model}\`: ${entry.reason}${entry.on ? ` (${entry.on})` : ''}`)],
  ]
  for (const [title, items] of left) {
    if (items.length > 0) lines.push(`- ${title}: ${items.join('; ')}.`)
  }
  return lines.join('\n')
}

// The days the listings were captured: one date when every harness has the same, else a date per harness.
function listedText(listedOn) {
  if (listedOn === null || listedOn === undefined) return '–'
  if (typeof listedOn === 'string') return listedOn
  const dates = new Set(Object.values(listedOn))
  if (dates.size === 1) return [...dates][0] ?? '–'
  return Object.entries(listedOn).map(([name, date]) => `${name} ${date ?? '–'}`).join(', ')
}

// A model as a row of the table: its figures are those of the highest effort its harness takes that AA scored;
// price and speed come from that effort, or from the nearest below it that has them.
function tableRow(entry) {
  const down = [...entry.scores].reverse()
  const top = down.find((score) => score.intelligence !== null) ?? down[0]
  const below = top ? down.slice(down.indexOf(top)) : []
  const priced = below.find((score) => score.priceInput !== null && score.priceOutput !== null)
  const timed = below.find((score) => score.tokensPerSecond !== null)
  const figure = (value) => (value === null || value === undefined ? '–' : String(value))
  return [
    `${cell(entry.name)} \`${entry.model}\``,
    `${entry.harness}${entry.lane ? '*' : ''}`,
    entry.efforts.join(', ') || '–',
    figure(top?.intelligence),
    figure(top?.terminalBench),
    priced ? `${priced.priceInput} / ${priced.priceOutput}` : '–',
    figure(timed?.tokensPerSecond),
  ].reduce((row, value) => `${row} ${value} |`, '|')
}

// A model as a line of the README: what it is for, its limits, price and where it runs.
function profileLine(entry, state) {
  const where = [entry.harness, entry.alias ? `alias \`${entry.alias}\`` : null, state].filter(Boolean).join(', ')
  const head = `- **${cell(entry.name)}** \`${entry.model}\` (${where})`
  const profile = entry.profile
  if (!profile) return `${head}: **no profile: read the maker's page and add it to profiles.json**`
  const tokens = (count) => (count === null || count === undefined ? '–' : count >= 1e6 ? `${Number((count / 1e6).toFixed(2))}M` : `${Math.round(count / 1000)}K`)
  const price = profile.price && profile.price.input !== null ? `$${profile.price.input} / $${profile.price.output} per M` : "price: the host's"
  const facts = [
    `context ${tokens(profile.contextTokens)}, output ${tokens(profile.maxOutputTokens)}`,
    `default effort ${profile.defaultEffort ?? '–'}`,
    price,
    `cutoff ${profile.knowledgeCutoff ?? '–'}`,
  ].join('; ')
  const caveats = (profile.caveats ?? []).map((text) => ` ${text}`).join('')
  return `${head}, ${entry.maker}: ${profile.purpose} ${facts}. ${profile.availability}${caveats} (checked ${profile.checked})`
}

function cell(text) {
  return String(text).replace(/\|/g, '\\|')
}

// README text with its generated part replaced. A missing README is made, with only that part.
function mergeReadme(text, generated) {
  const block = `${README_START}\n${generated}\n${README_END}`
  if (text === null) return `# Models released since 2026-01\n\n${block}\n`
  const start = text.indexOf(README_START)
  const end = text.indexOf(README_END)
  if (start === -1 || end === -1 || end < start) return null
  return `${text.slice(0, start)}${block}${text.slice(end + README_END.length)}`
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`cannot read ${file}: ${err.code ?? err.message}`)
  }
}

function parseArgs(argv) {
  const args = { write: false, lanes: DEFAULT_LANES, pairs: DEFAULT_PAIRS, pairsGiven: false, harness: null, out: DEFAULT_OUT, docs: DEFAULT_DOCS, harnesses: DEFAULT_HARNESSES.join(','), profiles: null, snapshot: SNAPSHOT_FILE }
  const flags = { '--lanes': 'lanes', '--pairs': 'pairs', '--harness': 'harness', '--harnesses': 'harnesses', '--profiles': 'profiles', '--out': 'out', '--docs': 'docs', '--snapshot': 'snapshot' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--write') args.write = true
    else if (flags[argv[i]] && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      if (argv[i] === '--pairs') args.pairsGiven = true
      args[flags[argv[i]]] = argv[++i]
    }
    else return null
  }
  args.harnesses = args.harnesses.split(',').map((name) => name.trim().toLowerCase()).filter((name) => name !== '')
  if (args.harnesses.length === 0 || !args.harnesses.every((name) => HARNESSES.includes(name))) return null
  args.harnesses = HARNESSES.filter((name) => args.harnesses.includes(name))
  args.out = path.resolve(args.out)
  args.docs = path.resolve(args.docs)
  args.snapshot = path.resolve(args.snapshot)
  args.harness = path.resolve(args.harness ?? (fs.existsSync(path.join(args.out, 'harness-models.json')) ? path.join(args.out, 'harness-models.json') : path.join(DEFAULT_OUT, 'harness-models.json')))
  args.profiles = path.resolve(args.profiles ?? (fs.existsSync(path.join(args.out, 'profiles.json')) ? path.join(args.out, 'profiles.json') : path.join(DEFAULT_OUT, 'profiles.json')))
  args.lanes = path.resolve(args.lanes)
  args.pairs = path.resolve(args.pairs)
  return args
}


// `now` remains an accepted option; snapshot dates make the output reproducible.
function main(argv, { now } = {}) {
  const args = parseArgs(argv)
  if (!args) return { exitCode: 2, stdout: `${USAGE}\n` }
  let lanes, pairs, harnessModels, profiles, snapshot
  try {
    lanes = readJson(args.lanes)
    pairs = readPairs(args.pairs, args.pairsGiven)
    harnessModels = readJson(args.harness)
    profiles = readProfiles(args.profiles)
    snapshot = loadSnapshot(args.snapshot)
  } catch (error) { return { exitCode: 1, stdout: `${error.message}\n` } }
  const problems = [...missingListings(harnessModels, args.harnesses), ...badListings(harnessModels, args.harnesses)]
  if (problems.length) return { exitCode: 1, stdout: `${problems.join('\n')}\n` }
  const index = buildIndex({ lanes, pairs, harnessModels, snapshot, harnesses: args.harnesses })
  const file = buildModels(index, profiles)
  const missing = missingProfiles(file)
  let stdout = summary(file)
  if (missing.length) stdout += `Without a profile (${missing.length}): ${missing.join(', ')}. Read each maker's page and add it to ${args.profiles}.\n`
  if (args.write) {
    const readmeFile = path.join(args.docs, 'README.md')
    const existing = fs.existsSync(readmeFile) ? fs.readFileSync(readmeFile, 'utf8') : null
    const supersededProfiles = file.superseded.map((entry) => {
      const family = entry.id.toLowerCase().replace(/\./g, '-')
      const profile = profiles[family] ?? profiles[entry.id]
      return { harness: entry.harness, model: entry.id, name: profile?.name ?? entry.id, maker: profile?.maker ?? null, profile: profileRecord(profile) }
    })
    const readme = mergeReadme(existing, renderGenerated({ ...file, supersededProfiles }))
    if (readme === null) return { exitCode: 1, stdout: `${readmeFile} has no ${README_START} and ${README_END} lines to write between.\n` }
    fs.mkdirSync(args.out, { recursive: true })
    fs.mkdirSync(args.docs, { recursive: true })
    const modelsFile = path.join(args.out, 'models.json')
    fs.writeFileSync(modelsFile, `${serialize(file)}\n`)
    fs.writeFileSync(readmeFile, readme)
    stdout += `written to ${modelsFile} and ${readmeFile}\n`
  }
  return { exitCode: missing.length ? 1 : 0, stdout }
}

function summary(file) {
  const named = (entries) => entries.map((entry) => `${entry.harness}/${entry.model}`).join(', ')
  const lines = [
    `${file.models.length} models in use (${file.models.reduce((sum, entry) => sum + entry.scores.length, 0)} scores) from ${file.harnesses.join(', ')}.`,
    `Offered by harness: ${file.harnesses.map((name) => `${name} ${file.models.filter((entry) => entry.harness === name).length}`).join(', ')}.`,
  ]
  for (const [title, entries, text] of [
    ['Listed with no pair row and no photo', file.withoutFigures, named(file.withoutFigures)],
    ['Declared superseded', file.superseded, file.superseded.map((entry) => `${entry.harness}/${entry.id} by ${entry.supersededBy}`).join(', ')],
    ['Declared out of scope', file.outOfScope, named(file.outOfScope)],
    ['Named by the lane table and not offered', file.notOffered, named(file.notOffered)],
    ['Offered and excluded by the owner', file.excluded, named(file.excluded)],
  ]) if (entries.length) lines.push(`${title} (${entries.length}): ${text}.`)
  return `${lines.join('\n')}\n`
}
function readPairs(file, given) {
  if (!given && !fs.existsSync(file)) return []
  const table = readJson(file)
  if (!Array.isArray(table.pairs)) throw new Error(`${file} has no pairs list`)
  return table.pairs
}

// The profiles of a profiles.json text's object, or {} when the file is not there.
function readProfiles(file) {
  if (!fs.existsSync(file)) return {}
  const data = readJson(file)
  return data && typeof data.profiles === 'object' && data.profiles !== null ? data.profiles : {}
}

// What of models.json has no profile, as the keys to research and add to profiles.json: a model in use is
// keyed by its family (an excluded one too, when AA has it), the others by their harness model id.
function missingProfiles(file) {
  const keys = [
    ...file.models.filter((entry) => entry.profile === null).map((entry) => entry.family),
    ...(file.excluded ?? []).filter((entry) => entry.profile === null).map((entry) => entry.family ?? entry.model),
    ...file.withoutFigures.filter((entry) => entry.profile === null).map((entry) => entry.model),
    ...file.notOffered.filter((entry) => entry.profile === null).map((entry) => entry.model),
  ]
  return [...new Set(keys)]
}

// One line per chosen harness that has no listing in harness-models.json: a harness with none would be read as
// offering nothing, and the index would be empty of it without a word.
function missingListings(listings, harnesses) {
  return harnesses
    .filter((name) => !Array.isArray(listings.harnesses?.[name]?.models))
    .map((name) => `no listing captured for ${name}: capture it ${CAPTURE[name]} and add it to harness-models.json`)
}

// One line per listing entry the script cannot read, for the chosen harnesses. A listing is an id (a string) or,
// for a harness whose effort is a flag, an object with a string `id`; `excluded`, when it is there, is the
// reason the owner keeps the model out, a non-empty string (a silent miss would put the model into use).
// A harness whose effort is in the id (agy, Cursor) lists ids only: each id is a model at an effort.
function badListings(listings, harnesses) {
  const problems = []
  for (const name of harnesses) {
    const listing = listings.harnesses?.[name]
    if (!Array.isArray(listing?.models)) continue
    for (const section of ['superseded', 'outOfScope']) {
      for (const [id, entry] of Object.entries(listing[section] ?? {})) {
        for (const field of section === 'superseded' ? ['on', 'reason', 'by'] : ['on', 'reason']) {
          const value = entry?.[field]
          const valid = field === 'on' ? typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) : typeof value === 'string' && value.trim() !== ''
          if (!valid) problems.push(`${name} declares ${section} ${id} in harness-models.json with no ${field}: give a valid ${field}`)
        }
      }
    }
    for (const listed of [...(listing.models ?? []), ...(listing.calledNotListed ?? [])]) {
      if (typeof listed === 'string') continue
      const shown = JSON.stringify(listed)
      if (listing.effortVia === 'id') {
        problems.push(`${name} lists ${shown} in harness-models.json: its effort is in the id, so it lists ids as strings; an object ({id, alias, excluded}) is for the harnesses whose effort is a flag`)
      } else if (listed === null || typeof listed !== 'object' || typeof listed.id !== 'string' || listed.id === '') {
        problems.push(`${name} lists ${shown} in harness-models.json with no id: a model is an id (a string) or an object with a non-empty string id`)
      } else if (Object.hasOwn(listed, 'excluded') && (typeof listed.excluded !== 'string' || listed.excluded.trim() === '')) {
        problems.push(`${name} lists ${listed.id} in harness-models.json with an excluded that is not a non-empty string (${JSON.stringify(listed.excluded)}): give the reason the owner keeps it out, or remove the field`)
      }
    }
  }
  return problems
}

module.exports = { buildIndex, harnessEntries, buildModels, renderGenerated, mergeReadme, serialize, splitId, missingProfiles, missingListings, badListings, readProfiles, main }

if (require.main === module) {
  const { exitCode, stdout } = main(process.argv.slice(2))
  process.stdout.write(stdout)
  process.exitCode = exitCode
}
