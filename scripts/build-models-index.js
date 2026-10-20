#!/usr/bin/env node
'use strict'

// Usage: node scripts/build-models-index.js [--from <raw.json>] [--since 2026-01-01] [--harnesses claude,agy,grok] [--write]
//                                           [--lanes <lanes.json>] [--pairs <pairs.json>] [--harness <file>] [--profiles <file>] [--out <dir>] [--docs <dir>]
//
// Builds the list of the models our harnesses offer, from the Artificial Analysis (AA) models list: the
// families released since a date, each with its effort variants, of which the ones that are the newest of
// their line and that the CLI of a chosen harness lists are the models in use. The harnesses are the
// native one (claude) and the lanes (agy, grok by default; codex, cursor and muse on request).
// Without --from it asks the AA API (the key comes from where refresh-lanes.js looks for it, and is
// never printed); with --from it reads a saved answer of the same API. It prints a short summary; with
// --write it also writes models.json (the models in use, each with its scores at the efforts its harness
// takes and its profile, the models the owner keeps out, and what was left out) in --out, which is the
// plugin's config/models folder (it ships with the plugin, so a session in any project reads it), and the
// generated part of README.md in --docs (docs/models). profiles.json, kept by hand, says what each model is
// for; a model in use or excluded without one is listed and the exit code is 1. The harness models come from
// harness-models.json next to models.json: what each CLI listed on a date (per harness), kept as a file
// because the CLIs need a login and a network to list them. A model the lane table names and its CLI does not
// list takes its efforts from the rows of the pairs table (config/pairs.json) of its harness and model.

const fs = require('node:fs')
const path = require('node:path')
const { keyFrom, keyFile, envFileFor, KEY, MODELS_URL } = require('./refresh-lanes.js')

const DEFAULT_SINCE = '2026-01-01'
const DEFAULT_LANES = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'lanes.json')
const DEFAULT_PAIRS = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'pairs.json')
const DEFAULT_OUT = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models')
const DEFAULT_DOCS = path.join(__dirname, '..', 'docs', 'models')
const USAGE =
  'usage: node scripts/build-models-index.js [--from <raw.json>] [--since YYYY-MM-DD] [--harnesses claude,agy,grok] [--profiles <file>] [--write] [--lanes <lanes.json>] [--pairs <pairs.json>] [--harness <file>] [--out <dir>] [--docs <dir>]'
// claude is the native harness, the first: its models are not lanes. The others are lanes.
const HARNESSES = ['claude', 'agy', 'codex', 'grok', 'cursor', 'muse']
// The chosen harnesses, whose models the index keeps. Another comes in with --harnesses once its listing is in harness-models.json.
const DEFAULT_HARNESSES = ['claude', 'agy', 'grok', 'muse']
const LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']
// From the least to the most effort. default is a reasoning model with no level named, and none is
// the harness's word for no reasoning; both sit under the named levels.
const ORDER = ['non-reasoning-low', 'non-reasoning', 'non-reasoning-medium', 'non-reasoning-high', 'none', 'default', ...LEVELS, 'ultra']
// The ends of an AA slug that can name an effort. Whether one does is checked against the name.
const SUFFIX = /-(non-reasoning-low-effort|non-reasoning|reasoning|adaptive|minimal|low|medium|high|xhigh|max)$/
// The ends of a harness model id that carry the effort, for the harnesses that put it in the id.
const EFFORT_TOKEN = /-(extra-high|xhigh|none|minimal|low|medium|high|max)$/
// The three rules of the folder, written into models.json. What marks a family current: of the families of
// one line, the one released last. A line is the creator and the slug without its version and date numbers
// (and without "preview"), so claude-sonnet-5 and claude-sonnet-5-5 are one line, and a size (31b) or a tier
// (flash-lite) is not a version and makes a line of its own.
const RULES = {
  newest: 'Only the newest generation of each line is used (Sonnet 5.5, not Sonnet 5); the older ones are superseded.',
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

// The index: the families released since `since` that a chosen harness offers, each with its effort
// variants and the harness models that reach it, and the harness models no family took. `models` is
// the AA list as the API gives it; nothing here reads a file or the network. `offeredOnly: false`
// keeps every released family, offered or not (the grouping rules do not depend on it).
function buildIndex(models, { since = DEFAULT_SINCE, lanes = {}, harnessModels = {}, generatedAt = null, harnesses = DEFAULT_HARNESSES, offeredOnly = true, pairs = [] } = {}) {
  harnesses = HARNESSES.filter((name) => harnesses.includes(name))
  const all = groupFamilies(models)
  const families = new Map()
  for (const [key, entries] of all) {
    const family = familyRecord(key, entries, since)
    if (family) families.set(key, family)
  }

  // A model is in the index when the harness's own CLI lists it. A model only the lane table names is not offered.
  const unmatched = []
  const notOffered = []
  for (const entry of harnessEntries(lanes, harnessModels, harnesses, pairs)) {
    if (entry.detail.listing === 'not-listed') {
      const listedBy = harnessModels.harnesses?.[entry.harness]?.listedBy ?? `${entry.harness}'s CLI`
      notOffered.push({ harness: entry.harness, model: entry.model, roles: entry.detail.roles, reason: `named by the lane table, and not listed by ${listedBy}` })
      continue
    }
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

  // The lines are read among every family AA lists, so a family a newer generation replaced is superseded
  // even when no harness offers the newer one. Only the families a harness offers are kept.
  const released = [...families.values()].sort((a, b) => compare(b.releaseDate, a.releaseDate) || compare(a.family, b.family))
  markCurrent(released)
  const list = offeredOnly ? released.filter((family) => family.available.length > 0) : released
  return {
    generatedAt,
    source: MODELS_URL,
    since,
    harnesses,
    releasedCount: released.length,
    count: list.length,
    currentCount: list.filter((family) => family.current).length,
    variantCount: list.reduce((sum, family) => sum + family.variants.length, 0),
    listedOn: Object.fromEntries(harnesses.map((name) => [name, captureDate(harnessModels, name)])),
    families: list,
    unmatched,
    notOffered,
  }
}

// The day a harness's listing was captured: its own date, or the file's when the file has one for all.
function captureDate(listings, harness) {
  return listings.harnesses?.[harness]?.capturedAt ?? listings.capturedAt ?? null
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
    line: null,
    current: true,
    supersededBy: null,
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

// The line a family belongs to, written without the creator.
function lineOf(family) {
  const words = family.family.split('-').filter((word) => !/^\d+$/.test(word) && word !== 'preview')
  return words.join('-')
}

// Sets line, current and supersededBy on each family, in place. The newest of a line is the one released last
// (the lower slug on a tie); the others name it in supersededBy.
function markCurrent(list) {
  const lines = new Map()
  for (const family of list) {
    const key = `${family.creator ?? 'Unknown'}|${lineOf(family)}`
    if (!lines.has(key)) lines.set(key, [])
    lines.get(key).push(family)
  }
  for (const members of lines.values()) {
    const newest = [...members].sort((a, b) => compare(b.releaseDate, a.releaseDate) || compare(a.family, b.family))[0]
    for (const family of members) {
      family.line = lineOf(family)
      family.current = family === newest
      family.supersededBy = family === newest ? null : newest.family
    }
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
// per model in harness order. `detail` is what the index records about it. A model the lane table names and the
// CLI does not list has no efforts of its own: it takes those of its rows in `pairs`.
function harnessEntries(lanes, listings, harnesses = HARNESSES, pairs = []) {
  const entries = []
  for (const harness of HARNESSES.filter((name) => harnesses.includes(name))) {
    const listing = listings.harnesses?.[harness] ?? {}
    const lane = lanes.harnesses?.[harness]?.models ?? {}
    const effortVia = listing.effortVia ?? null
    const byModel = effortVia === 'id' ? listedById(listing.models ?? []) : listedByFlag(listing)
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
  for (const listed of listing.models ?? []) {
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

// JSON with a two-space indent, where an object or a list that fits in 150 characters is on one line, so a
// grep finds a whole record (a score, a price) and a longer one is a line per key.
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

// models.json: the models in use, which are the current families a chosen harness offers, one entry per
// harness model, each with the scores of the efforts that harness takes and its profile (what its maker
// says it is for); the listed models the owner keeps out (`excluded`, with the reason, the AA price and
// scores when AA has them, and the profile); and what was left out, with why. A session reads this to
// choose a model. A model a native harness lists has `alias` (the name its CLI takes) and a null lane.
function buildModels(index, profiles = {}) {
  const profileOf = (key) => profiles[key] ?? null
  const laneOf = (entry) => (entry.inLaneTable ? { roles: entry.roles } : null)
  const byHarness = (a, b) => HARNESSES.indexOf(a.harness) - HARNESSES.indexOf(b.harness)

  const models = []
  const excluded = []
  // The owner's exclusion wins over a family being superseded: an excluded offer of any family is kept, with its reason.
  for (const family of index.families) {
    const profile = profileOf(family.family)
    for (const offer of family.available) {
      if (offer.excluded) {
        const scores = offeredVariants(family, [offer]).map(scoreRecord)
        excluded.push({
          harness: offer.harness,
          model: offer.model,
          ...(offer.alias ? { alias: offer.alias } : {}),
          family: family.family,
          name: family.name,
          maker: profile?.maker ?? family.creator,
          released: family.releaseDate,
          reason: offer.excluded,
          effortVia: offer.effortVia,
          efforts: offer.efforts,
          price: priceOf(scores),
          scores,
          profile: profileRecord(profile),
        })
        continue
      }
      if (!family.current) continue
      models.push({
        harness: offer.harness,
        model: offer.model,
        ...(offer.alias ? { alias: offer.alias } : {}),
        family: family.family,
        name: family.name,
        maker: profile?.maker ?? family.creator,
        released: family.releaseDate,
        effortVia: offer.effortVia,
        efforts: offer.efforts,
        ...(offer.ids ? { ids: offer.ids } : {}),
        ...(offer.fastIds ? { fastIds: offer.fastIds } : {}),
        scores: offeredVariants(family, [offer]).map(scoreRecord),
        lane: laneOf(offer),
        profile: profileRecord(profile),
      })
    }
  }

  // The offered models AA has no entry for: they have no figures, and the lane table may not name them.
  const noEntry = index.unmatched.filter((entry) => entry.reason === NO_ENTRY)
  // An excluded model AA has no entry for, or has one released before `since`, is excluded all the same,
  // without a price or scores.
  for (const entry of index.unmatched.filter((item) => item.excluded)) {
    excluded.push({
      harness: entry.harness,
      model: entry.model,
      ...(entry.alias ? { alias: entry.alias } : {}),
      name: profileOf(entry.model)?.name ?? entry.model,
      maker: profileOf(entry.model)?.maker ?? null,
      reason: entry.excluded,
      effortVia: entry.effortVia,
      efforts: entry.efforts,
      price: null,
      scores: [],
      profile: profileRecord(profileOf(entry.model)),
    })
  }
  const withoutFigures = noEntry
    .filter((entry) => !entry.excluded)
    .map((entry) => ({
      harness: entry.harness,
      model: entry.model,
      name: profileOf(entry.model)?.name ?? entry.model,
      maker: profileOf(entry.model)?.maker ?? null,
      effortVia: entry.effortVia,
      efforts: entry.efforts,
      lane: laneOf(entry),
      note: `offered, with ${NO_ENTRY}, so no figures${entry.inLaneTable ? '' : '; not a lane: the lane table does not list it'}`,
      profile: profileRecord(profileOf(entry.model)),
    }))
  const notOffered = index.notOffered.map((entry) => ({
    harness: entry.harness,
    model: entry.model,
    name: profileOf(entry.model)?.name ?? entry.model,
    maker: profileOf(entry.model)?.maker ?? null,
    roles: entry.roles,
    reason: entry.reason,
    profile: profileRecord(profileOf(entry.model)),
  }))

  // A superseded model is named by the id its harness lists, and by the successor's id on the same harness when it offers one.
  const superseded = index.families
    .filter((family) => !family.current)
    .flatMap((family) => {
      const successor = index.families.find((other) => other.family === family.supersededBy)
      return family.available.filter((offer) => !offer.excluded).map((offer) => ({
        harness: offer.harness,
        id: offer.model,
        supersededBy: successor?.available.find((other) => other.harness === offer.harness)?.model ?? family.supersededBy,
      }))
    })
  const outOfScope = index.unmatched.filter((entry) => entry.reason !== NO_ENTRY && !entry.excluded).map(({ harness, model, reason }) => ({ harness, model, reason }))

  return {
    generatedAt: index.generatedAt,
    source: index.source,
    harnesses: index.harnesses,
    since: index.since,
    listedOn: index.listedOn,
    rules: RULES,
    models: models.sort(byHarness),
    excluded: excluded.sort(byHarness),
    notOffered,
    withoutFigures,
    superseded: superseded.sort(byHarness),
    outOfScope,
  }
}

// The price of an excluded model: the first score, from the highest effort down, that has one.
function priceOf(scores) {
  const priced = [...scores].reverse().find((score) => score.priceInput !== null && score.priceOutput !== null)
  return priced ? { input: priced.priceInput, output: priced.priceOutput } : null
}

// The scores of a variant as models.json keeps them: AA's slug and label are in the index, not here.
function scoreRecord(variant) {
  return {
    effort: variant.effort,
    intelligence: variant.intelligence,
    ...(variant.coding === null ? {} : { coding: variant.coding }),
    terminalBench: variant.terminalBench,
    priceInput: variant.priceInput,
    priceOutput: variant.priceOutput,
    tokensPerSecond: variant.tokensPerSecond,
    ttftSeconds: variant.ttftSeconds,
  }
}

// The part of a profile that goes into models.json; the name and the maker are fields of the model itself.
const PROFILE_FIELDS = ['purpose', 'contextTokens', 'maxOutputTokens', 'defaultEffort', 'price', 'knowledgeCutoff', 'availability', 'caveats', 'sources', 'checked']
function profileRecord(profile) {
  return profile ? Object.fromEntries(PROFILE_FIELDS.map((field) => [field, profile[field] ?? null])) : null
}

// The variants of a family whose effort one of the offers takes. When none matches (AA names no level, or
// names others than the harness does), all of them: the figures are then the family's, not a harness's.
function offeredVariants(family, offers = family.available) {
  const taken = new Set(offers.flatMap((entry) => entry.efforts))
  const offered = family.variants.filter((variant) => taken.has(variant.effort))
  return offered.length > 0 ? offered : family.variants
}

// The part of README.md that comes from models.json: the rules, a table of the models in use (the native
// harness's rows have no `*`: they are not lanes), what each is for, and what was left out, the excluded
// models first.
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
    ...(file.excluded ?? []).map((entry) => profileLine(entry, 'excluded')),
    ...file.withoutFigures.map((entry) => profileLine(entry, 'no figures')),
    ...file.notOffered.map((entry) => profileLine(entry, 'not offered')),
    '',
    '## Left out',
    '',
  ]
  const left = [
    ['Excluded, not used', (file.excluded ?? []).map((entry) => `${entry.harness} \`${entry.model}\`${entry.alias ? ` (\`${entry.alias}\`)` : ''}: ${entry.reason.replace(/\.$/, '')}`)],
    ['Not offered', file.notOffered.map((entry) => `${entry.harness} \`${entry.model}\`${entry.roles.length > 0 ? ` (${entry.roles.join(', ')})` : ''}: ${entry.reason}`)],
    ['No figures', file.withoutFigures.map((entry) => `${entry.harness} \`${entry.model}\`: ${entry.note}`)],
    ['Superseded, not to be used', supersededGroups(file.superseded)],
    ['Out of scope', file.outOfScope.map((entry) => `${entry.harness} \`${entry.model}\`: ${entry.reason}`)],
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

// The superseded models as "harness `old`, `older` by `new`", one group per harness and successor.
function supersededGroups(superseded) {
  const groups = new Map()
  for (const old of superseded) {
    const key = `${old.harness} ${old.supersededBy}`
    if (!groups.has(key)) groups.set(key, { harness: old.harness, by: old.supersededBy, ids: [] })
    groups.get(key).ids.push(`\`${old.id}\``)
  }
  return [...groups.values()].map((group) => `${group.harness} ${group.ids.join(', ')} by \`${group.by}\``)
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
  const args = { from: null, since: DEFAULT_SINCE, write: false, lanes: DEFAULT_LANES, pairs: DEFAULT_PAIRS, pairsGiven: false, harness: null, out: DEFAULT_OUT, docs: DEFAULT_DOCS, harnesses: DEFAULT_HARNESSES.join(','), profiles: null }
  const flags = { '--from': 'from', '--since': 'since', '--lanes': 'lanes', '--pairs': 'pairs', '--harness': 'harness', '--harnesses': 'harnesses', '--profiles': 'profiles', '--out': 'out', '--docs': 'docs' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--write') args.write = true
    else if (flags[argv[i]] && i + 1 < argv.length) {
      if (argv[i] === '--pairs') args.pairsGiven = true
      args[flags[argv[i]]] = argv[++i]
    }
    else return null
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.since)) return null
  args.harnesses = args.harnesses.split(',').map((name) => name.trim().toLowerCase()).filter((name) => name !== '')
  if (args.harnesses.length === 0 || !args.harnesses.every((name) => HARNESSES.includes(name))) return null
  args.harnesses = HARNESSES.filter((name) => args.harnesses.includes(name))
  args.out = path.resolve(args.out)
  args.docs = path.resolve(args.docs)
  args.harness = path.resolve(args.harness ?? path.join(args.out, 'harness-models.json'))
  args.profiles = path.resolve(args.profiles ?? path.join(args.out, 'profiles.json'))
  args.lanes = path.resolve(args.lanes)
  args.pairs = path.resolve(args.pairs)
  return args
}

async function main(argv, { env = process.env, fetch = globalThis.fetch, now = Date.now, envFile } = {}) {
  const args = parseArgs(argv)
  if (!args) return { exitCode: 2, stdout: `${USAGE}\n` }

  let lanes, pairs, harnessModels, profiles, body
  try {
    lanes = readJson(args.lanes)
    pairs = readPairs(args.pairs, args.pairsGiven)
    harnessModels = readJson(args.harness)
    profiles = readProfiles(args.profiles)
    if (args.from) body = readJson(path.resolve(args.from))
  } catch (err) {
    return { exitCode: 1, stdout: `${err.message}\n` }
  }
  const unlisted = missingListings(harnessModels, args.harnesses)
  if (unlisted.length > 0) return { exitCode: 1, stdout: `${unlisted.join('\n')}\n` }
  const bad = badListings(harnessModels, args.harnesses)
  if (bad.length > 0) return { exitCode: 1, stdout: `${bad.join('\n')}\n` }
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
  const index = buildIndex(models, { since: args.since, lanes, harnessModels, generatedAt, harnesses: args.harnesses, pairs })

  const file = buildModels(index, profiles)
  const missing = missingProfiles(file)
  let stdout = summary(index)
  if (missing.length > 0) {
    stdout += `Without a profile (${missing.length}): ${missing.join(', ')}. Read each maker's page and add it to ${args.profiles}.\n`
  }
  const exitCode = missing.length > 0 ? 1 : 0
  if (args.write) {
    const readmeFile = path.join(args.docs, 'README.md')
    const existing = fs.existsSync(readmeFile) ? fs.readFileSync(readmeFile, 'utf8') : null
    const readme = mergeReadme(existing, renderGenerated(file))
    if (readme === null) return { exitCode: 1, stdout: `${readmeFile} has no ${README_START} and ${README_END} lines to write between.\n` }
    fs.mkdirSync(args.out, { recursive: true })
    fs.mkdirSync(args.docs, { recursive: true })
    const modelsFile = path.join(args.out, 'models.json')
    fs.writeFileSync(modelsFile, `${serialize(file)}\n`)
    fs.writeFileSync(readmeFile, readme)
    stdout += `written to ${modelsFile} and ${readmeFile}\n`
  }
  return { exitCode, stdout }
}

// The rows of the pairs table at `file`. The shipped table is optional (a copy of the script in a tree without
// the plugin has none, and a model the CLI does not list then has no efforts); one named with --pairs must be there.
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
    for (const listed of listing.models) {
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

// The date as the person running the script reads it (the local one, not UTC's).
function localDate(date) {
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function summary(index) {
  const reached = index.harnesses.map((name) => {
    const count = index.families.filter((family) => family.available.some((entry) => entry.harness === name)).length
    return `${name} ${count}`
  })
  const named = (entries) => entries.map((entry) => `${entry.harness}/${entry.model}`).join(', ') || 'none'
  const noFigures = index.unmatched.filter((entry) => entry.reason === NO_ENTRY && !entry.excluded)
  const outOfScope = index.unmatched.filter((entry) => entry.reason !== NO_ENTRY && !entry.excluded)
  const excluded = [
    ...index.families.flatMap((family) => family.available.filter((entry) => entry.excluded)),
    ...index.unmatched.filter((entry) => entry.excluded),
  ]
  return (
    `${index.count} families (${index.variantCount} variants) are offered by ${index.harnesses.join(', ')}, of the ${index.releasedCount} released since ${index.since}; ${index.currentCount} are current.\n` +
    `Offered by harness (families): ${reached.join(', ')}.\n` +
    `Offered with no figures (${noFigures.length}): ${named(noFigures)}.\n` +
    `Offered and out of scope, released before ${index.since} (${outOfScope.length}): ${named(outOfScope)}.\n` +
    `Named by the lane table and not offered (${index.notOffered.length}): ${named(index.notOffered)}.\n` +
    (excluded.length > 0 ? `Offered and excluded by the owner (${excluded.length}): ${named(excluded)}.\n` : '')
  )
}

module.exports = { buildIndex, harnessEntries, buildModels, renderGenerated, mergeReadme, serialize, findFamily, splitId, missingProfiles, missingListings, badListings, readProfiles, main }

if (require.main === module) {
  main(process.argv.slice(2)).then(({ exitCode, stdout }) => {
    process.stdout.write(stdout)
    process.exitCode = exitCode
  })
}
