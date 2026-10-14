#!/usr/bin/env node
'use strict'

// Usage: node scripts/build-models-index.js [--from <raw.json>] [--since 2026-01-01] [--write]
//                                           [--lanes <lanes.json>] [--harness <file>] [--out <dir>]
//
// Builds the offline index of the models released since a date, with every effort variant of each,
// from the Artificial Analysis (AA) models list, and says which of them our harnesses reach.
// Without --from it asks the AA API (the key comes from where refresh-lanes.js looks for it, and is
// never printed); with --from it reads a saved answer of the same API. It prints a short summary;
// with --write it also writes index.json and the generated part of README.md, in docs/models (or
// --out). The harness models come from harness-models.json next to them: what each CLI listed on a
// date, kept as a file because the CLIs need a login and a network to list them.

const fs = require('node:fs')
const path = require('node:path')
const { keyFrom, keyFile, envFileFor, KEY, MODELS_URL } = require('./refresh-lanes.js')

const DEFAULT_SINCE = '2026-01-01'
const DEFAULT_LANES = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'lanes.json')
const DEFAULT_OUT = path.join(__dirname, '..', 'docs', 'models')
const USAGE =
  'usage: node scripts/build-models-index.js [--from <raw.json>] [--since YYYY-MM-DD] [--write] [--lanes <lanes.json>] [--harness <file>] [--out <dir>]'
const HARNESSES = ['agy', 'codex', 'grok', 'cursor']
const LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']
// From the least to the most effort. default is a reasoning model with no level named, and none is
// the harness's word for no reasoning; both sit under the named levels.
const ORDER = ['non-reasoning-low', 'non-reasoning', 'non-reasoning-medium', 'non-reasoning-high', 'none', 'default', ...LEVELS, 'ultra']
// The ends of an AA slug that can name an effort. Whether one does is checked against the name.
const SUFFIX = /-(non-reasoning-low-effort|non-reasoning|reasoning|adaptive|minimal|low|medium|high|xhigh|max)$/
// The ends of a harness model id that carry the effort, for the harnesses that put it in the id.
const EFFORT_TOKEN = /-(extra-high|xhigh|none|minimal|low|medium|high|max)$/
const RULE =
  "A slug ending in -minimal, -low, -medium, -high, -xhigh, -max, -adaptive, -reasoning or -non-reasoning joins the family of the slug without it when its name names that effort in parentheses and the slug without it is not another model's; a date stamp or any other word stays in the family slug, so each dated release is a family of its own."
const NO_ENTRY = 'no Artificial Analysis entry'
const README_START = '<!-- models-index:start -->'
const README_END = '<!-- models-index:end -->'

// The index: the families released since `since`, each with its effort variants and the harness
// models that reach it, and the harness models no family took. `models` is the AA list as the API
// gives it; nothing here reads a file or the network.
function buildIndex(models, { since = DEFAULT_SINCE, lanes = {}, harnessModels = {}, generatedAt = null } = {}) {
  const all = groupFamilies(models)
  const families = new Map()
  for (const [key, entries] of all) {
    const family = familyRecord(key, entries, since)
    if (family) families.set(key, family)
  }

  const unmatched = []
  for (const entry of harnessEntries(lanes, harnessModels)) {
    const found = findFamily(entry.model, all)
    const family = found && families.get(found.key)
    if (family) {
      family.available.push({ harness: entry.harness, model: entry.model, match: found.match, ...entry.detail })
    } else {
      const reason = found
        ? `Artificial Analysis lists ${found.key}, released ${earliest(all.get(found.key))}, before ${since}`
        : NO_ENTRY
      unmatched.push({ harness: entry.harness, model: entry.model, ...entry.detail, reason })
    }
  }

  const list = [...families.values()].sort((a, b) => compare(b.releaseDate, a.releaseDate) || compare(a.family, b.family))
  return {
    generatedAt,
    source: MODELS_URL,
    since,
    count: list.length,
    variantCount: list.reduce((sum, family) => sum + family.variants.length, 0),
    rule: RULE,
    harnessListings: {
      capturedAt: harnessModels.capturedAt ?? null,
      listedBy: Object.fromEntries(HARNESSES.map((name) => [name, harnessModels.harnesses?.[name]?.listedBy ?? null])),
    },
    families: list,
    unmatched,
  }
}

// Every AA entry, grouped by family key. A map from the key to its entries, each with the pieces
// of its name and the effort it stands for.
function groupFamilies(models) {
  const entries = models.filter((model) => model && typeof model.slug === 'string').map(describe)
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]))
  const byStem = new Map()
  for (const entry of entries) byStem.set(entry.stem, [...(byStem.get(entry.stem) ?? []), entry])
  const groups = new Map()
  for (const entry of entries) {
    const key = familyKey(entry, bySlug, byStem)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }
  return groups
}

function describe(model) {
  const name = typeof model.name === 'string' && model.name.trim() !== '' ? model.name.trim() : model.slug
  const tag = parseName(name)
  const creator = typeof model.model_creator === 'string' ? model.model_creator : model.model_creator?.name
  return {
    slug: model.slug,
    stem: tag.stem,
    label: tag.label,
    words: tag.words,
    effort: effortOf(tag.words),
    creator: typeof creator === 'string' && creator.trim() !== '' ? creator.trim() : null,
    releaseDate: typeof model.release_date === 'string' && model.release_date !== '' ? model.release_date : null,
    evaluations: model.evaluations ?? {},
    pricing: model.pricing ?? {},
    tokensPerSecond: model.median_output_tokens_per_second,
    ttftSeconds: model.median_time_to_first_token_seconds,
  }
}

// A name split into its stem and the words of its effort tag: "Claude Opus 5.5 (Max, Default
// Fallback)" has the stem "Claude Opus 5.5" and the words max and default fallback. A tag with no
// effort or reasoning word, such as a date or "Preview", is part of the name and gives no words.
function parseName(name) {
  const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name)
  if (!match) return { stem: name, label: null, words: [] }
  const words = match[2].split(',').map((word) => word.trim().toLowerCase())
  const effortTag = words.some((word) => LEVELS.includes(word) || word === 'reasoning' || word === 'non-reasoning')
  return effortTag ? { stem: match[1], label: match[2].trim(), words } : { stem: name, label: null, words: [] }
}

// The effort a tag's words name: a level, non-reasoning (with its level when it has one), or default.
function effortOf(words) {
  const level = words.find((word) => LEVELS.includes(word))
  if (words.includes('non-reasoning')) return level ? `non-reasoning-${level}` : 'non-reasoning'
  return level ?? 'default'
}

// The family a model belongs to. Its slug without an effort suffix, when the suffix is one its
// name confirms (qwen3-7-max is a tier, not an effort: its name has no tag) and the slug without
// it is not another model's. When it is another model's (hy3-non-reasoning is the non-reasoning
// build of Hy3-preview, not of Hy3), the one suffixless entry with the model's own name; and a
// family of its own when there is none.
function familyKey(entry, bySlug, byStem) {
  const base = baseOf(entry)
  if (base === null) return entry.slug
  const own = bySlug.get(base)
  if (!own || own.stem === entry.stem) return base
  const same = (byStem.get(entry.stem) ?? []).filter((other) => other !== entry && baseOf(other) === null)
  return same.length === 1 ? same[0].slug : entry.slug
}

// The slug without the effort suffix its name confirms, or null when it has none.
function baseOf(entry) {
  const match = SUFFIX.exec(entry.slug)
  return match && confirms(match[1], entry.words) ? entry.slug.slice(0, match.index) : null
}

function confirms(suffix, words) {
  if (suffix === 'adaptive') return words.some((word) => LEVELS.includes(word))
  if (suffix === 'non-reasoning-low-effort') return words.includes('non-reasoning')
  return words.includes(suffix)
}

// The family's record from the entries released since `since`, or null when it has none.
function familyRecord(key, entries, since) {
  const released = entries
    .filter((entry) => entry.releaseDate !== null && entry.releaseDate >= since)
    .sort((a, b) => orderOf(a.effort) - orderOf(b.effort) || compare(a.slug, b.slug))
  if (released.length === 0) return null
  const bare = released.find((entry) => entry.slug === key) ?? released[0]
  return {
    family: key,
    name: bare.stem,
    creator: bare.creator,
    releaseDate: earliest(released),
    variants: released.map(variantRecord),
    available: [],
  }
}

function variantRecord(entry) {
  return {
    slug: entry.slug,
    effort: entry.effort,
    label: entry.label,
    intelligence: round(entry.evaluations.artificial_analysis_intelligence_index, 1),
    coding: round(entry.evaluations.artificial_analysis_coding_index, 1),
    terminalBench: round(entry.evaluations.terminalbench_v4_0, 3),
    priceInput: measured(entry.pricing.price_1m_input_tokens, 4),
    priceOutput: measured(entry.pricing.price_1m_output_tokens, 4),
    tokensPerSecond: measured(entry.tokensPerSecond, 1),
    ttftSeconds: measured(entry.ttftSeconds, 2),
  }
}

function earliest(entries) {
  return entries.map((entry) => entry.releaseDate).filter((date) => date !== null).sort(compare)[0] ?? null
}

// A measured number rounded, or null when it is missing or not a number. A 0 stays 0.
function round(value, digits) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

// Like round, but a 0 is null: AA reports 0 for a speed, a time or a price it has no data for.
function measured(value, digits) {
  return value > 0 ? round(value, digits) : null
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
// per model in harness order. `detail` is what the index records about it.
function harnessEntries(lanes, listings) {
  const entries = []
  for (const harness of HARNESSES) {
    const listing = listings.harnesses?.[harness] ?? {}
    const lane = lanes.harnesses?.[harness]?.models ?? {}
    const effortVia = listing.effortVia ?? null
    const byModel = effortVia === 'id' ? listedById(listing.models ?? []) : listedByFlag(listing)
    for (const id of Object.keys(lane)) {
      if (byModel.has(id)) continue
      const levels = Object.values(lane[id].levels ?? {})
      byModel.set(id, { efforts: sortEfforts(new Set(levels)), ids: null, fastIds: null, listing: 'not-listed' })
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
          inLaneTable,
          roles: entry?.roles ?? [],
          levels: entry?.levels ?? null,
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

// The models of a harness that takes the effort in a flag (codex, grok): each listed id is a model.
// A model's own efforts win over the harness's.
function listedByFlag(listing) {
  const result = new Map()
  for (const listed of listing.models ?? []) {
    const model = typeof listed === 'string' ? listed : listed.id
    const efforts = typeof listed === 'string' ? listing.efforts : (listed.efforts ?? listing.efforts)
    const hidden = typeof listed !== 'string' && listed.listed === false
    result.set(model, { efforts: sortEfforts(new Set(efforts ?? [])), ids: null, fastIds: null, listing: hidden ? 'hidden' : 'listed' })
  }
  return result
}

function sortEfforts(efforts) {
  return [...efforts].sort((a, b) => orderOf(a) - orderOf(b) || compare(a, b))
}

function sortKeys(object) {
  return Object.fromEntries(sortEfforts(new Set(Object.keys(object))).map((key) => [key, object[key]]))
}

// The family a harness model id names, with how sure the match is: exact (the id is the family
// key), normalized (the same once dots become dashes and a -thinking end is dropped), or guess (a
// known rewriting of the name: no cursor- prefix, a -preview end, or Claude's tier and version in
// the other order). Null when none of them is a family.
function findFamily(model, all) {
  const lower = model.toLowerCase()
  const dashed = lower.replace(/-thinking$/, '').replace(/\./g, '-')
  const tries = [
    [lower, 'exact'],
    [dashed, 'normalized'],
    [dashed.replace(/^cursor-/, ''), 'guess'],
    [`${dashed}-preview`, 'guess'],
    [dashed.replace(/^claude-(\d+(?:-\d+)*)-(opus|sonnet|haiku)$/, 'claude-$2-$1'), 'guess'],
  ]
  for (const [key, match] of tries) {
    if (all.has(key)) return { key, match }
  }
  return null
}

// JSON with a two-space indent, where each record that holds no list of records (a variant, an
// available entry, an unmatched entry) is on one line, so a grep finds the whole record.
function serialize(value, depth = 0) {
  const pad = '  '.repeat(depth)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((item) => (isFlat(item) ? JSON.stringify(item) : serialize(item, depth + 1)))
    return `[\n${items.map((item) => `${pad}  ${item}`).join(',\n')}\n${pad}]`
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return '{}'
    return `{\n${keys.map((key) => `${pad}  ${JSON.stringify(key)}: ${serialize(value[key], depth + 1)}`).join(',\n')}\n${pad}}`
  }
  return JSON.stringify(value)
}

function isFlat(value) {
  if (value === null || typeof value !== 'object') return true
  if (Array.isArray(value)) return value.every(isFlat)
  return Object.values(value).every((item) => !(Array.isArray(item) && item.some((entry) => entry !== null && typeof entry === 'object')))
}

// The part of README.md that comes from the index: the tables by creator, what our harnesses
// reach, and what they offer that no family took.
function renderGenerated(index) {
  const lines = [
    '## Families by creator',
    '',
    `${index.count} families and ${index.variantCount} variants released since ${index.since}, generated on ${index.generatedAt} from ${index.source}; ` +
      `harness models as listed on ${index.harnessListings.capturedAt}. ` +
      'Best intelligence and best terminal-bench name the effort that scored it (the lowest, on a tie). Price and tokens/s are of the best-intelligence variant when it has them, else of the highest effort that does. `*` after a harness: the model is in the lane table.',
    '',
  ]
  const byCreator = new Map()
  for (const family of index.families) {
    const creator = family.creator ?? 'Unknown'
    if (!byCreator.has(creator)) byCreator.set(creator, [])
    byCreator.get(creator).push(family)
  }
  for (const creator of [...byCreator.keys()].sort((a, b) => compare(a.toLowerCase(), b.toLowerCase()))) {
    const rows = byCreator.get(creator)
    lines.push(
      `| ${cell(creator)} (${rows.length}) | Released | Efforts | Best intelligence | Best terminal-bench | $/M in/out | Tokens/s | Reached through |`,
      '|---|---|---|---:|---:|---:|---:|---|',
    )
    for (const family of rows) lines.push(familyRow(family))
    lines.push('')
  }

  const reachable = index.families.filter((family) => family.available.length > 0)
  lines.push(
    '## Reachable through our harnesses',
    '',
    `${reachable.length} of the ${index.count} families, newest first, with each harness model and the efforts it takes. ` +
      '`*` is in the lane table. A match is exact unless it says otherwise: `~` is a guess (a rewritten name), and a note says when the CLI does not list the model. ' +
      'On agy and Cursor the effort is part of the id (`ids` in index.json has each one); on codex and grok it is a flag.',
    '',
  )
  for (const family of reachable) {
    const entries = family.available.map((entry) => {
      const notes = [
        entry.match === 'guess' ? '~' : '',
        entry.listing === 'hidden' ? ' (hidden)' : entry.listing === 'not-listed' ? ' (not listed by the CLI)' : '',
        entry.fastIds ? ' +fast' : '',
      ].join('')
      return `${entry.harness}${entry.inLaneTable ? '*' : ''} \`${entry.model}\`${notes} ${entry.efforts.join('/') || '–'}`
    })
    lines.push(`- ${cell(family.name)} \`${family.family}\`: ${entries.join('; ')}`)
  }

  lines.push('', '## Harness models no family took', '')
  for (const harness of HARNESSES) {
    const own = index.unmatched.filter((entry) => entry.harness === harness)
    if (own.length === 0) continue
    const none = own.filter((entry) => entry.reason === NO_ENTRY).map((entry) => `\`${entry.model}\``)
    const old = own.filter((entry) => entry.reason !== NO_ENTRY).map((entry) => `\`${entry.model}\``)
    const parts = []
    if (none.length > 0) parts.push(`no AA entry: ${none.join(', ')}`)
    if (old.length > 0) parts.push(`released before ${index.since}: ${old.join(', ')}`)
    lines.push(`- ${harness}: ${parts.join('; ')}`)
  }
  return lines.join('\n')
}

function familyRow(family) {
  const best = (field) => {
    let top = null
    for (const variant of family.variants) {
      if (variant[field] !== null && (top === null || variant[field] > top[field])) top = variant
    }
    return top
  }
  const bestIntelligence = best('intelligence')
  const bestTerminal = best('terminalBench')
  const byEffortDesc = [...family.variants].reverse()
  const priced = [bestIntelligence, ...byEffortDesc].find((variant) => variant && variant.priceInput !== null && variant.priceOutput !== null)
  const timed = [bestIntelligence, ...byEffortDesc].find((variant) => variant && variant.tokensPerSecond !== null)
  const several = family.variants.length > 1
  const scored = (variant, field) => (variant ? `${variant[field]}${several ? ` (${variant.effort})` : ''}` : '–')
  const reached = HARNESSES.filter((name) => family.available.some((entry) => entry.harness === name)).map((name) =>
    family.available.some((entry) => entry.harness === name && entry.inLaneTable) ? `${name}*` : name,
  )
  return [
    `${cell(family.name)} \`${family.family}\``,
    family.releaseDate,
    family.variants.map((variant) => variant.effort).join(', '),
    scored(bestIntelligence, 'intelligence'),
    scored(bestTerminal, 'terminalBench'),
    priced ? `${priced.priceInput} / ${priced.priceOutput}` : '–',
    timed ? String(timed.tokensPerSecond) : '–',
    reached.join(', ') || '–',
  ].reduce((row, value) => `${row} ${value} |`, '|')
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

// The models of an AA answer: the list itself, or the list under data. Null when it is neither.
function modelsOf(body) {
  const list = Array.isArray(body) ? body : body?.data
  return Array.isArray(list) ? list : null
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`cannot read ${file}: ${err.code ?? err.message}`)
  }
}

function parseArgs(argv) {
  const args = { from: null, since: DEFAULT_SINCE, write: false, lanes: DEFAULT_LANES, harness: null, out: DEFAULT_OUT }
  const flags = { '--from': 'from', '--since': 'since', '--lanes': 'lanes', '--harness': 'harness', '--out': 'out' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--write') args.write = true
    else if (flags[argv[i]] && i + 1 < argv.length) args[flags[argv[i]]] = argv[++i]
    else return null
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.since)) return null
  args.out = path.resolve(args.out)
  args.harness = path.resolve(args.harness ?? path.join(args.out, 'harness-models.json'))
  args.lanes = path.resolve(args.lanes)
  return args
}

async function main(argv, { env = process.env, fetch = globalThis.fetch, now = Date.now, envFile } = {}) {
  const args = parseArgs(argv)
  if (!args) return { exitCode: 2, stdout: `${USAGE}\n` }

  let lanes, harnessModels, body
  try {
    lanes = readJson(args.lanes)
    harnessModels = readJson(args.harness)
    if (args.from) body = readJson(path.resolve(args.from))
  } catch (err) {
    return { exitCode: 1, stdout: `${err.message}\n` }
  }
  if (!args.from) {
    const key = keyFrom(env, envFileFor(env, envFile))
    if (!key) {
      return { exitCode: 1, stdout: `${KEY} is not set, and ${keyFile(env)} does not have it.\n` }
    }
    let response
    try {
      response = await fetch(MODELS_URL, { headers: { 'x-api-key': key } })
    } catch (err) {
      return { exitCode: 1, stdout: `Artificial Analysis could not be reached: ${err.cause?.code ?? err.message}.\n` }
    }
    if (!response.ok) return { exitCode: 1, stdout: `Artificial Analysis answered ${response.status}.\n` }
    body = await response.json()
  }
  const models = modelsOf(body)
  if (!models) return { exitCode: 1, stdout: 'Artificial Analysis gave no list of models.\n' }

  const generatedAt = localDate(new Date(now()))
  const index = buildIndex(models, { since: args.since, lanes, harnessModels, generatedAt })

  let stdout = summary(index)
  if (args.write) {
    const readmeFile = path.join(args.out, 'README.md')
    const existing = fs.existsSync(readmeFile) ? fs.readFileSync(readmeFile, 'utf8') : null
    const readme = mergeReadme(existing, renderGenerated(index))
    if (readme === null) return { exitCode: 1, stdout: `${readmeFile} has no ${README_START} and ${README_END} lines to write between.\n` }
    fs.mkdirSync(args.out, { recursive: true })
    const indexFile = path.join(args.out, 'index.json')
    fs.writeFileSync(indexFile, `${serialize(index)}\n`)
    fs.writeFileSync(readmeFile, readme)
    stdout += `written to ${indexFile} and ${readmeFile}\n`
  }
  return { exitCode: 0, stdout }
}

// The date as the person running the script reads it (the local one, not UTC's).
function localDate(date) {
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function summary(index) {
  const reached = HARNESSES.map((name) => {
    const count = index.families.filter((family) => family.available.some((entry) => entry.harness === name)).length
    return `${name} ${count}`
  })
  const unmatched = index.unmatched.map((entry) => `${entry.harness}/${entry.model}`)
  return (
    `${index.count} families, ${index.variantCount} variants released since ${index.since}.\n` +
    `Reached by harness (families): ${reached.join(', ')}.\n` +
    `Unmatched harness models (${unmatched.length}): ${unmatched.join(', ') || 'none'}.\n`
  )
}

module.exports = { buildIndex, renderGenerated, mergeReadme, serialize, findFamily, splitId, main }

if (require.main === module) {
  main(process.argv.slice(2)).then(({ exitCode, stdout }) => {
    process.stdout.write(stdout)
    process.exitCode = exitCode
  })
}
