#!/usr/bin/env node
'use strict'

// Reads Artificial Analysis (AA) for the models Aether uses. The key is never printed.
//
//   node aa-pages.js api [name-filter]      what the API gives for each matching model (default: Claude 5.5)
//   node aa-pages.js pages [slug ...]       what the model pages give, per slug (default: every slug of
//                                           plugins/aether/config/pairs.json); --json prints the whole result
//
// WARNING: `pages` makes automated requests to the AA website, which AA's terms of use forbid (section 3.3 (b)(vi), read
// in docs/reference/artificial-analysis.md on 2026-10-26). It is kept because the owner asked for it back. Do not run it
// without the owner's yes. `api` is the supported way.
//
// The API key comes from ARTIFICIAL_ANALYSIS_API_KEY, else from the first such line of .env in AETHER_DATA_DIR or
// ~/.local/share/aether-plugin (the same places as scripts/refresh-lanes.js).

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// AA's free list of language models, paged (?page=N from page 2). The legacy data address answers 410 since 2026-11-04.
const MODELS_URL = 'https://artificialanalysis.ai/api/v2/language/models/free'
const PAGE_URL = 'https://artificialanalysis.ai/models/'
const PAIRS = path.join(__dirname, '..', '..', '..', 'plugins', 'aether', 'config', 'pairs.json')
const PAUSE_MS = 1200

function apiKey() {
  if (process.env.ARTIFICIAL_ANALYSIS_API_KEY) return process.env.ARTIFICIAL_ANALYSIS_API_KEY
  const dirs = [process.env.AETHER_DATA_DIR, path.join(os.homedir(), '.local', 'share', 'aether-plugin')].filter(Boolean)
  for (const dir of dirs) {
    try {
      const line = fs.readFileSync(path.join(dir, '.env'), 'utf8').split('\n').find((l) => l.startsWith('ARTIFICIAL_ANALYSIS_API_KEY='))
      if (line) return line.slice('ARTIFICIAL_ANALYSIS_API_KEY='.length).trim()
    } catch {
      // try the next place
    }
  }
  throw new Error('no ARTIFICIAL_ANALYSIS_API_KEY in the environment or in a .env of the data directory')
}

const pct = (v) => (v === null || v === undefined ? '-' : (v <= 1 ? v * 100 : v).toFixed(0))

// Every page of the free list, in order, until pagination.has_more is false (at most 20 pages). A 410 or any other answer
// that is not a page of the list ends the read with an error: no part of the list is returned.
async function freeModels(key) {
  const rows = []
  for (let page = 1; page <= 20; page++) {
    const response = await fetch(page === 1 ? MODELS_URL : `${MODELS_URL}?page=${page}`, { headers: { 'x-api-key': key } })
    if (response.status === 410) throw new Error('the API answered 410: that address is retired')
    if (!response.ok) throw new Error(`the API answered ${response.status}`)
    const body = await response.json()
    if (!Array.isArray(body.data) || typeof body.pagination?.has_more !== 'boolean') throw new Error('the API gave a page with no list or no pagination')
    rows.push(...body.data)
    if (!body.pagination.has_more) return rows
  }
  throw new Error('the API has more than 20 pages of models')
}

const num = (v, digits) => (typeof v === 'number' ? v.toFixed(digits) : '-')

async function api(filter = 'Claude (Haiku|Sonnet|Opus) 5\\.5') {
  const list = await freeModels(apiKey())
  const re = new RegExp(filter, 'i')
  console.log(`${list.length} models. Per model the API gives: id, name, slug, release_date, model_creator, evaluations (the intelligence index and six area indexes), the cost per task of the index, pricing, and speed and first-token times. Not given: the coding and agentic indexes, Terminal-Bench, LCR, HLE and SciCode, which are on the model pages.`)
  console.log('name'.padEnd(46), 'intel  cost/task  $in/M  $out/M   tok/s  ttft s')
  for (const m of list.filter((x) => re.test(x.name))) {
    const e = m.evaluations ?? {}
    const p = m.pricing ?? {}
    const perf = m.performance ?? {}
    console.log(m.name.padEnd(46), String(e.artificial_analysis_intelligence_index).padStart(5), num(m.artificial_analysis_intelligence_index_cost?.cost_per_task?.total_cost, 3).padStart(10),
      num(p.price_1m_input_tokens, 2).padStart(6), num(p.price_1m_output_tokens, 2).padStart(7), num(perf.median_output_tokens_per_second, 1).padStart(7), num(perf.median_time_to_first_token_seconds, 2).padStart(7))
  }
}

// The page of a model embeds, as JSON in a script, the data of 27 models it compares. Each model object starts with
// "slug":"<slug>","name":"…","shortName":"…" and its AA-Briefcase block closes its evaluations, so the block that
// belongs to a page's own model is the one whose nearest slug before it is the page's slug.
function ownData(html, slug) {
  const text = html.replace(/\\"/g, '"')
  const starts = [...text.matchAll(/"slug":"([a-z0-9.-]+)","name":"([^"]+)","shortName":"([^"]+)"/g)]
  const briefcases = [...text.matchAll(/"briefcaseBreakdown":\{"overall":\{"elo":([\d.]+)[^}]*\},"rubricPassRate":([\d.]+),"analyticalQuality":\{"elo":([\d.]+)[^}]*\},"presentation":\{"elo":([\d.]+)/g)]
  for (const b of briefcases) {
    const start = [...starts].reverse().find((s) => s.index < b.index)
    if (!start || start[1] !== slug) continue
    const segment = text.slice(start.index, b.index)
    const evals = {}
    for (const m of segment.matchAll(/\{"slug":"([^"]+)","score":(-?[\d.]+),"outputTokensPerTask":(-?[\d.]+),"costPerTask":(-?[\d.e-]+),"timePerTask":(-?[\d.]+)\}/g)) {
      evals[m[1]] = { score: +m[2], outputTokens: Math.round(+m[3]), costUsd: +m[4], seconds: Math.round(+m[5]) }
    }
    const costBlock = /"intelligenceIndexCostPerTask":\{"cost":\{([^}]*)\}/.exec(segment)
    const cost = costBlock ? Object.fromEntries([...costBlock[1].matchAll(/"(\w+)":([\d.e-]+)/g)].map((m) => [m[1], +m[2]])) : null
    return {
      name: start[2],
      briefcase: { elo: +b[1], rubricPassRate: +b[2], analyticalQualityElo: +b[3], presentationElo: +b[4] },
      costPerTaskUsd: cost,
      evals,
    }
  }
  return null
}

async function pages(slugs, { json = false } = {}) {
  const out = {}
  for (const slug of slugs) {
    const response = await fetch(PAGE_URL + slug, { headers: { 'user-agent': 'Mozilla/5.0' } })
    out[slug] = response.ok ? ownData(await response.text(), slug) : { error: response.status }
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
  }
  if (json) return console.log(JSON.stringify(out, null, 1))
  console.log('slug'.padEnd(26), 'brief-elo  analytic  rubric  | TB4.0 score   $/task | cost per index task: total  cache(r+w)  reasoning  answer')
  for (const [slug, d] of Object.entries(out)) {
    if (!d || d.error) { console.log(slug.padEnd(26), d ? `error ${d.error}` : 'own block not found'); continue }
    const tb = d.evals['terminalbench-4-0']
    const c = d.costPerTaskUsd
    console.log(slug.padEnd(26), String(Math.round(d.briefcase.elo)).padStart(9), String(Math.round(d.briefcase.analyticalQualityElo)).padStart(9), `${pct(d.briefcase.rubricPassRate)}%`.padStart(7), ' |',
      tb ? `${pct(tb.score).padStart(5)} ${('$' + tb.costUsd.toFixed(2)).padStart(8)}` : '    -        -', ' |',
      c ? `${('$' + c.total.toFixed(2)).padStart(24)} ${('$' + (c.cacheRead + c.cacheWrite).toFixed(2)).padStart(11)} ${('$' + c.reasoning.toFixed(2)).padStart(10)} ${('$' + c.answer.toFixed(2)).padStart(7)}` : '')
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'api') return api(rest[0])
  if (command === 'pages') {
    const json = rest.includes('--json')
    const named = rest.filter((a) => a !== '--json')
    const slugs = named.length > 0 ? named : [...new Set(JSON.parse(fs.readFileSync(PAIRS, 'utf8')).pairs.map((p) => p.slug).filter(Boolean))]
    return pages(slugs, { json })
  }
  console.log('usage: node aa-pages.js api [name-filter] | node aa-pages.js pages [slug ...] [--json]')
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 })
