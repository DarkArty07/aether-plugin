#!/usr/bin/env node
'use strict'

// Reads the figures of models from their Artificial Analysis pages: the pair figures for scripts/refresh-lanes.js, and Terminal-Bench
// for scripts/build-models-index.js --pages.
//
//   node aa-api.js <slug>...

const fs = require('node:fs')
const path = require('node:path')

const PAGE_URL = 'https://artificialanalysis.ai/models/'
// One pause between two requests, at least 1.5 s. Sent with every request, so AA can tell who asks and why.
const PAGE_PAUSE_MS = 1500
const USER_AGENT = 'aether-plugin models reader (one request per model page, asked by its owner)'
// The answers that stop a pass at once: nothing after them is asked.
const BLOCKED = [403, 429]

function round(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

// The block of the page's own model: the first AA-Briefcase block whose nearest model start before it is `slug`. Its text runs
// from that start (the scalars come before the evals) and its evals are read into { score, outputTokens, costUsd, seconds } by
// their slug, with the intelligence index and the cost per task of the block alongside (null when the page does not carry
// them as numbers). Null when the page has no block for the slug.
function ownBlock(html, slug) {
  const text = html.replace(/\\"/g, '"')
  const starts = [...text.matchAll(/"slug":"([a-z0-9.-]+)","name":"([^"]+)","shortName":"([^"]+)"/g)]
  const finiteOrNull = (value) => (Number.isFinite(value) ? value : null)
  for (const b of text.matchAll(/"briefcaseBreakdown":/g)) {
    const start = [...starts].reverse().find((s) => s.index < b.index)
    if (!start || start[1] !== slug) continue
    const segment = text.slice(start.index, b.index)
    const evals = {}
    for (const m of segment.matchAll(/\{"slug":"([^"]+)","score":(-?[\d.]+),"outputTokensPerTask":(-?[\d.]+),"costPerTask":(-?[\d.e-]+),"timePerTask":(-?[\d.]+)\}/g)) {
      evals[m[1]] = { score: +m[2], outputTokens: Math.round(+m[3]), costUsd: +m[4], seconds: +m[5] }
    }
    // Anywhere in the model's segment, whatever scalar key comes first. The same read as aa-extract.js:
    // a number followed by `,` or `}`. `null` and a missing key stay null.
    const intelligence = /"intelligenceIndex":(-?[\d.]+(?:e-?\d+)?)[,}]/.exec(segment)
    const cost = /"intelligenceIndexCostPerTask":\{"cost":\{"total":(-?[\d.e-]+|null)/.exec(segment)
    return { evals, intelligence: finiteOrNull(intelligence ? +intelligence[1] : NaN), costPerTaskUsd: finiteOrNull(cost ? +cost[1] : NaN) }
  }
  return null
}

// The code figures of the page of `slug` (the page embeds the data of the models it compares, as JSON inside a script: read the block of
// the page's own model, as aa-pages.js does). Null when the page has no block for the slug or no code figure (the `terminalbench-4-0`
// entry). Rounding: code 2 decimals (the fraction by 100), cost 3, minutes 1 (seconds / 60).
function figuresOf(html, slug) {
  const own = ownBlock(html, slug)
  const tb = own?.evals['terminalbench-4-0']
  if (!tb || !Number.isFinite(tb.score) || !Number.isFinite(tb.costUsd) || !Number.isFinite(tb.seconds)) return null
  return {
    code: round(tb.score * 100, 2),
    codeCostPerTaskUsd: round(tb.costUsd, 3),
    codeMinutesPerTask: round(tb.seconds / 60, 1),
  }
}

// The figure the models index takes from a page: Terminal-Bench 4.0, the fraction of the `terminalbench-4-0` eval of the page's own
// block, three decimals, the same as the free API gives it. Null when the page has no block for the slug, and { terminalBench: null }
// when the block has no Terminal-Bench. No coding index is read: neither the free API nor the model pages give one (read on 2026-11-11).
function indexesOf(html, slug) {
  const own = ownBlock(html, slug)
  if (!own) return null
  const tb = own.evals['terminalbench-4-0']
  return { terminalBench: tb && Number.isFinite(tb.score) ? round(tb.score, 3) : null }
}

// What a cache folder holds for a slug: <slug>.html for a page that answered 200, <slug>.json ({ status }) for any other answer
// but a block (403 and 429 are never saved: the pass stops on them and the next run asks again). Null when nothing is saved.
function savedAnswer(cacheDir, slug) {
  const html = path.join(cacheDir, `${slug}.html`)
  if (fs.existsSync(html)) return { status: 200, html: fs.readFileSync(html, 'utf8') }
  const json = path.join(cacheDir, `${slug}.json`)
  if (fs.existsSync(json)) return JSON.parse(fs.readFileSync(json, 'utf8'))
  return null
}

function saveAnswer(cacheDir, slug, answer) {
  fs.mkdirSync(cacheDir, { recursive: true })
  if (answer.status === 200) fs.writeFileSync(path.join(cacheDir, `${slug}.html`), answer.html)
  else fs.writeFileSync(path.join(cacheDir, `${slug}.json`), `${JSON.stringify({ status: answer.status })}\n`)
}

// The figures of an answer: the parse of its page, or { error } for an answer that is not a page.
function figuresFrom(answer, slug, parse) {
  if (answer.status !== 200) return { error: `the page answered ${answer.status}` }
  return parse(answer.html, slug)
}

// Reads the pages of `slugs`, in order. One request per page: a page saved in `cacheDir` is read from there with no request and no
// pause. Between two requests there is a pause of `pauseMs` (1.5 s at least). Each answer is saved in `cacheDir`, so a second run
// and a change of `parse` cost no request. A 403 or 429 stops the read at once: the error names the page, and no page after it is
// asked. Any other answer that is not a page gives { error: 'the page answered <status>' }. `report`, when given, is counted up:
// `network` for the requests made, `cached` for the pages read from `cacheDir`.
async function readPages(slugs, { fetch = globalThis.fetch, pause = (ms) => new Promise((r) => setTimeout(r, ms)), pauseMs = PAGE_PAUSE_MS, cacheDir = null, parse = figuresOf, report = {} } = {}) {
  const out = new Map()
  report.network ??= 0
  report.cached ??= 0
  for (const slug of slugs) {
    if (!/^[a-z0-9.-]+$/.test(slug)) {
      out.set(slug, { error: 'not the slug of a model page' })
      continue
    }
    const saved = cacheDir ? savedAnswer(cacheDir, slug) : null
    if (saved) {
      report.cached++
      out.set(slug, figuresFrom(saved, slug, parse))
      continue
    }
    if (report.network > 0) await pause(pauseMs)
    report.network++
    const url = `${PAGE_URL}${slug}`
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
    if (BLOCKED.includes(response.status)) {
      throw new Error(`Artificial Analysis answered ${response.status} for ${url}: the pass stopped there, no later page was asked.`)
    }
    const answer = response.ok ? { status: 200, html: await response.text() } : { status: response.status }
    if (cacheDir) saveAnswer(cacheDir, slug, answer)
    out.set(slug, figuresFrom(answer, slug, parse))
  }
  return out
}

async function cli(argv) {
  const slugs = argv.filter((a) => !a.startsWith('-'))
  if (slugs.length === 0) {
    console.log('usage: node aa-api.js <slug>...')
    return
  }
  const pages = await readPages(slugs)
  for (const [slug, fig] of pages) {
    if (!fig) console.log(`${slug}: no code figure`)
    else if (fig.error) console.log(`${slug}: ${fig.error}`)
    else console.log(`${slug}: code ${fig.code}, cost ${fig.codeCostPerTaskUsd}, minutes ${fig.codeMinutesPerTask}`)
  }
}

// The figures the pairs table keeps for a row, from the block of the page's own model: intelligence (1 decimal),
// cost per task (3), code (2), code cost (3) and code minutes (1). Null when the page has no block for the slug;
// the code triple is null when the block has no Terminal-Bench, and intelligence or cost is null when the page
// does not carry it as a number.
function pairFiguresOf(html, slug) {
  const own = ownBlock(html, slug)
  if (!own) return null
  const tb = own.evals['terminalbench-4-0']
  const hasCode = tb && Number.isFinite(tb.score) && Number.isFinite(tb.costUsd) && Number.isFinite(tb.seconds)
  return {
    intelligence: own.intelligence === null ? null : round(own.intelligence, 1),
    costPerTaskUsd: own.costPerTaskUsd === null ? null : round(own.costPerTaskUsd, 3),
    code: hasCode ? round(tb.score * 100, 2) : null,
    codeCostPerTaskUsd: hasCode ? round(tb.costUsd, 3) : null,
    codeMinutesPerTask: hasCode ? round(tb.seconds / 60, 1) : null,
  }
}

module.exports = { PAGE_URL, figuresOf, indexesOf, pairFiguresOf, readPages }

if (require.main === module) {
  cli(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
