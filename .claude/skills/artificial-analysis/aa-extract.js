#!/usr/bin/env node
'use strict'

// Reads everything a model page of Artificial Analysis (AA) carries about its own model, once, into a JSON file.
//
//   node aa-extract.js [slug ...] [--cache <dir>] [--out <file>]
//
// With no slug it reads every slug of plugins/aether/config/pairs.json. Each page is fetched once, 1.5 s after the
// last, and saved in --cache (default ./aa-cache); a page already in the cache is parsed again without a request, so
// a change to the parser never costs a new one. --out is where the parsed result goes (default ./aa-extract.json).
//
// WARNING: fetching a page is an automated request to the AA website, which AA's terms of use forbid (section 3.3
// (b)(vi), read in docs/reference/artificial-analysis.md on 2026-10-26). It runs only with the owner's yes.
//
// A page embeds, as JSON in a script, the data of the 27 models it compares. Each model object starts with
// "slug":"<slug>","name":"…","shortName":"…" and runs to the next such start; the page's own model is the one whose
// AA-Briefcase block follows the page's slug.

const fs = require('node:fs')
const path = require('node:path')

const PAGE_URL = 'https://artificialanalysis.ai/models/'
const PAIRS = path.join(__dirname, '..', '..', '..', 'plugins', 'aether', 'config', 'pairs.json')
const PAUSE_MS = 1500

const SCALARS = [
  'reasoningTokens', 'contextWindowTokens', 'intelligenceIndex', 'financeAndAccounting', 'strategyAndOps', 'legal',
  'healthcareAndMedical', 'engineering', 'economics', 'omniscience', 'omniscienceAccuracy', 'omniscienceHallucinationRate',
  'mlcrOverall', 'gdpPdfAllPass', 'gdpval', 'terminalBench40', 'frontierCode', 'terminalBenchScience', 'scicode', 'lcr', 'hle', 'critpt',
  'automationBenchPartialScore', 'price1mInputTokens', 'price1mOutputTokens', 'cacheHitPrice', 'cacheHitDiscountPercent',
  'cacheWritePrice', 'price1mBlended7To2To1', 'intelligenceIndexTimePerTask', 'briefcaseTotalCost', 'medianOutputSpeed',
  'medianTimeToFirstChunk', 'medianTimeToFirstAnswerToken', 'medianEndToEndResponseTime',
]
const OBJECTS = ['gdpval', 'intelligenceIndexCost', 'intelligenceIndexCostPerTask', 'briefcaseBreakdown', 'timescaleData', 'outputSpeedVariance', 'timeToFirstChunkVariance']

function segmentOf(html, slug) {
  const text = html.replace(/\\"/g, '"')
  const starts = [...text.matchAll(/"slug":"([a-z0-9.-]+)","name":"([^"]+)","shortName":"([^"]+)"/g)]
  for (const b of text.matchAll(/"briefcaseBreakdown":\{"overall":\{"elo":/g)) {
    const i = starts.findLastIndex((s) => s.index < b.index)
    if (i < 0 || starts[i][1] !== slug) continue
    const end = starts[i + 1] ? starts[i + 1].index : text.length
    return { name: starts[i][2], shortName: starts[i][3], seg: text.slice(starts[i].index, end) }
  }
  return null
}

const scalar = (seg, key) => {
  const m = new RegExp(`"${key}":(-?[\\d.]+(?:e-?\\d+)?)[,}]`).exec(seg)
  return m ? Number(m[1]) : null
}

function object(seg, key) {
  const at = seg.indexOf(`"${key}":`)
  if (at < 0) return null
  const open = at + key.length + 3
  if (seg[open] !== '{' && seg[open] !== '[') return null
  let depth = 0
  for (let i = open; i < seg.length; i++) {
    if (seg[i] === '{' || seg[i] === '[') depth++
    else if (seg[i] === '}' || seg[i] === ']') depth--
    if (depth === 0) {
      try { return JSON.parse(seg.slice(open, i + 1)) } catch { return null }
    }
  }
  return null
}

function parse(html, slug) {
  const found = segmentOf(html, slug)
  if (!found) return null
  const { seg } = found
  const scalars = {}
  for (const key of SCALARS) scalars[key] = scalar(seg, key)
  const objects = {}
  for (const key of OBJECTS) objects[key] = object(seg, key)
  const evals = {}
  for (const m of seg.matchAll(/\{"slug":"([^"]+)","score":(-?[\d.]+),"outputTokensPerTask":(-?[\d.]+),"costPerTask":(-?[\d.e-]+),"timePerTask":(-?[\d.]+)\}/g)) {
    if (!evals[m[1]]) evals[m[1]] = { score: Number(m[2]), outputTokens: Number(m[3]), costUsd: Number(m[4]), seconds: Number(m[5]) }
  }
  return { slug, name: found.name, shortName: found.shortName, scalars, objects, evals }
}

async function main() {
  const args = process.argv.slice(2)
  const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
  const cache = path.resolve(flag('--cache', 'aa-cache'))
  const out = path.resolve(flag('--out', 'aa-extract.json'))
  const named = args.filter((a, i) => !a.startsWith('--') && !['--cache', '--out'].includes(args[i - 1]))
  const slugs = named.length > 0 ? named : [...new Set(JSON.parse(fs.readFileSync(PAIRS, 'utf8')).pairs.map((p) => p.slug).filter(Boolean))]
  fs.mkdirSync(cache, { recursive: true })
  const result = {}
  let requests = 0
  for (const slug of slugs) {
    const file = path.join(cache, `${slug}.html`)
    if (!fs.existsSync(file)) {
      if (requests > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
      const response = await fetch(PAGE_URL + slug, { headers: { 'user-agent': 'aether-plugin-research (one pass, owner-approved)' } })
      requests++
      if (!response.ok) { result[slug] = { error: response.status }; continue }
      fs.writeFileSync(file, await response.text())
    }
    result[slug] = parse(fs.readFileSync(file, 'utf8'), slug) || { error: 'own block not found' }
  }
  fs.writeFileSync(out, JSON.stringify(result, null, 1))
  const bad = Object.entries(result).filter(([, v]) => v.error)
  console.log(`${slugs.length} slugs, ${requests} requests, ${bad.length} not read${bad.length ? ': ' + bad.map(([k, v]) => `${k} (${v.error})`).join(', ') : ''}. Result in ${out}`)
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 })
