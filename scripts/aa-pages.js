'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const PAGE_URL = 'https://artificialanalysis.ai/models/'
const PAUSE_MS = 1500
const TIMEOUT_MS = 30000
const SNAPSHOT_FILE = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models', 'aa-pages.json')
const FIGURES = ['intelligence', 'costPerTaskUsd', 'code', 'codeCostPerTaskUsd', 'codeMinutesPerTask', 'terminalBench', 'briefcaseElo', 'briefcaseRubricPassRate', 'hallucinationRate', 'timePerTaskSeconds', 'priceInput', 'priceOutput', 'cacheReadPrice', 'outputTokensPerSecond', 'timeToFirstTokenS']
const USER_AGENT = 'aether-plugin models reader (one request per model page, asked by its owner)'

// Extract a JSON value from embedded page data without assuming the surrounding HTML is JSON.
function field(text, key) {
  const match = new RegExp(`"${key}":`).exec(text)
  if (!match) return undefined
  const tail = text.slice(match.index + match[0].length)
  if (tail[0] === '{' || tail[0] === '[') {
    let depth = 0, quoted = false, escaped = false
    for (let i = 0; i < tail.length; i++) {
      const c = tail[i]
      if (quoted) {
        if (escaped) escaped = false
        else if (c === '\\') escaped = true
        else if (c === '"') quoted = false
      } else if (c === '"') quoted = true
      else if (c === '{' || c === '[') depth++
      else if ((c === '}' || c === ']') && --depth === 0) {
        try { return JSON.parse(tail.slice(0, i + 1)) } catch { return undefined }
      }
    }
    return undefined
  }
  const number = /^(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(?=[,}\]])/.exec(tail)
  return number ? Number(number[1]) : undefined
}

function parsePage(html, slug) {
  const text = html.replace(/\\"/g, '"')
  const starts = [...text.matchAll(/"slug":"([a-z0-9.-]+)","name":"((?:[^"\\]|\\.)*)","shortName":"(?:[^"\\]|\\.)*"/g)]
  let start
  let distance = Infinity
  for (const b of text.matchAll(/"briefcaseBreakdown":\{"overall":\{"elo":/g)) {
    const nearest = [...starts].reverse().find((s) => s.index < b.index)
    if (nearest && nearest[1] === slug && b.index - nearest.index < distance) {
      start = nearest
      distance = b.index - nearest.index
    }
  }
  if (!start) return null
  const end = starts.find((s) => s.index > start.index)?.index ?? text.length
  const segment = text.slice(start.index, end)
  const briefcase = field(segment, 'briefcaseBreakdown')
  const evaluation = /\{"slug":"terminalbench-4-0","score":[^{}]*\}/.exec(segment)
  let tb
  if (evaluation) { try { tb = JSON.parse(evaluation[0]) } catch {} }
  const score = evaluation ? tb?.score : field(segment, 'terminalBench40')
  const headline = field(segment, 'headline')
  const figures = {}
  const add = (key, value, digits) => { if (Number.isFinite(value)) { const f = 10 ** digits; figures[key] = Math.round(value * f) / f } }
  add('intelligence', field(segment, 'intelligenceIndex'), 1)
  add('costPerTaskUsd', field(segment, 'intelligenceIndexCostPerTask')?.cost?.total, 3)
  add('code', Number.isFinite(score) ? score * 100 : undefined, 2)
  add('codeCostPerTaskUsd', tb?.costPerTask, 3)
  add('codeMinutesPerTask', Number.isFinite(tb?.timePerTask) ? tb.timePerTask / 60 : undefined, 1)
  add('terminalBench', score, 3)
  add('briefcaseElo', briefcase?.overall?.elo, 0)
  add('briefcaseRubricPassRate', briefcase?.rubricPassRate, 3)
  for (const [key, source, digits] of [['hallucinationRate', 'omniscienceHallucinationRate', 3], ['timePerTaskSeconds', 'intelligenceIndexTimePerTask', 0], ['priceInput', 'price1mInputTokens', 4], ['priceOutput', 'price1mOutputTokens', 4], ['cacheReadPrice', 'cacheHitPrice', 4]]) add(key, field(segment, source), digits)
  add('outputTokensPerSecond', field(segment, 'medianOutputSpeed') ?? headline?.outputSpeed, 1)
  add('timeToFirstTokenS', field(segment, 'medianTimeToFirstAnswerToken') ?? headline?.timeToFirstAnswerToken, 2)
  let name = start[2]
  try { name = JSON.parse(`"${name}"`) } catch {}
  return { name, figures }
}

class StopPass extends Error {
  constructor(status, url) { super(`Artificial Analysis answered ${status} for ${url}: the pass stopped there, no later page was asked. Nothing was written.`); this.status = status; this.url = url }
}

async function readPages(slugs, { fetch = globalThis.fetch, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), pauseMs = PAUSE_MS, timeoutMs = TIMEOUT_MS, cacheDir = null, report = {} } = {}) {
  const results = new Map()
  report.network ??= 0
  report.cached ??= 0
  let requests = 0
  for (const slug of slugs) {
    if (!/^[a-z0-9.-]+$/.test(slug)) { results.set(slug, { ok: false, cause: 'bad-slug', detail: 'Invalid page address' }); continue }
    const file = cacheDir && path.join(cacheDir, `${slug}.html`)
    let html
    if (file && fs.existsSync(file)) { html = fs.readFileSync(file, 'utf8'); report.cached++ }
    else {
      if (requests) await pause(pauseMs)
      requests++; report.network++
      const url = PAGE_URL + slug
      try {
        const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) })
        if (response.status === 403 || response.status === 429) throw new StopPass(response.status, url)
        if (!response.ok) { results.set(slug, { ok: false, cause: `http ${response.status}`, detail: url }); continue }
        html = await response.text()
        if (file && response.status === 200) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(file, html) }
      } catch (error) {
        if (error instanceof StopPass) throw error
        results.set(slug, { ok: false, cause: error.name === 'TimeoutError' ? 'timeout' : 'network', detail: error.message })
        continue
      }
    }
    const parsed = parsePage(html, slug)
    results.set(slug, parsed ? { ok: true, ...parsed } : { ok: false, cause: 'no-block', detail: 'Model block not found' })
  }
  return results
}

function mergeSnapshot(snapshot, results, today) {
  const pages = structuredClone(snapshot.pages)
  const summary = { written: [], missing: {}, failed: [] }
  for (const [slug, result] of results) {
    if (!result.ok) { summary.failed.push({ slug, cause: result.cause, detail: result.detail }); continue }
    const missing = FIGURES.filter((key) => !Object.hasOwn(result.figures, key))
    if (missing.length) summary.missing[slug] = missing
    const keys = FIGURES.filter((key) => Number.isFinite(result.figures[key]))
    if (!keys.length) continue
    const figures = { ...(pages[slug]?.figures || {}) }
    for (const key of keys) figures[key] = { value: result.figures[key], on: today }
    pages[slug] = { readOn: today, name: result.name, figures }
    summary.written.push(slug)
  }
  return { snapshot: { pages }, summary }
}

function serializeSnapshot(snapshot) {
  const lines = Object.keys(snapshot.pages).sort().map((slug) => {
    const entry = snapshot.pages[slug]
    const figures = Object.fromEntries(FIGURES.filter((key) => Object.hasOwn(entry.figures, key)).map((key) => [key, entry.figures[key]]))
    return `    ${JSON.stringify(slug)}: ${JSON.stringify({ readOn: entry.readOn, name: entry.name, figures })}`
  })
  return `{\n  "pages": {\n${lines.length ? lines.join(',\n') + '\n' : ''}  }\n}\n`
}

function loadSnapshot(file = SNAPSHOT_FILE) {
  if (!fs.existsSync(file)) return { pages: {} }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!data || !data.pages || typeof data.pages !== 'object' || Array.isArray(data.pages)) throw new Error('Snapshot must have a pages object')
  return data
}

function slugsOf(pairsTable, { harness = null } = {}) {
  return [...new Set(pairsTable.pairs.filter((row) => row.slug && !row.estimateOf && (!harness || row.harness === harness || row.harness === 'claude')).map((row) => row.slug))]
}

// The default cache is one folder per day: a page saved on another day is read again, so no figure is dated with a day it was not read on.
function defaultCacheDir(today) {
  return path.join(os.tmpdir(), 'aether-aa-pages', today)
}

async function main(argv, { fetch, pause, now = Date.now, cacheDir } = {}) {
  const usage = 'usage: node scripts/aa-pages.js read [slug ...] [--harness <name>] [--snapshot <file>] [--pairs <file>] [--cache <dir>]'
  if (argv[0] !== 'read') return { exitCode: 2, stdout: usage }
  const date = new Date(now())
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const options = { snapshot: SNAPSHOT_FILE, pairs: path.join(__dirname, '..', 'plugins', 'aether', 'config', 'pairs.json'), cache: cacheDir ?? defaultCacheDir(today) }
  const slugs = []
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      if (!['harness', 'snapshot', 'pairs', 'cache'].includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) return { exitCode: 2, stdout: usage }
      options[key] = argv[++i]
    } else if (arg.startsWith('-')) return { exitCode: 2, stdout: usage }
    else slugs.push(arg)
  }
  const addresses = slugs.length ? [...new Set(slugs)] : slugsOf(JSON.parse(fs.readFileSync(options.pairs, 'utf8')), { harness: options.harness })
  let results
  const report = {}
  try { results = await readPages(addresses, { fetch, pause, cacheDir: options.cache, report }) } catch (error) {
    if (error instanceof StopPass) return { exitCode: 1, stdout: error.message }
    throw error
  }
  const { snapshot, summary } = mergeSnapshot(loadSnapshot(options.snapshot), results, today)
  if (summary.written.length) fs.writeFileSync(options.snapshot, serializeSnapshot(snapshot))
  const lines = [`Read ${addresses.length} address(es): ${summary.written.length} written, ${summary.failed.length} not read.`]
  lines.push(`Pages: ${report.network} from the network, ${report.cached} from the cache ${options.cache}.`)
  if (summary.written.length) lines.push(`Written: ${summary.written.join(', ')}`)
  if (summary.failed.length) lines.push(`Not read: ${summary.failed.map(({ slug, cause }) => `${slug} (${cause})`).join(', ')}`)
  const missing = Object.entries(summary.missing)
  if (missing.length) lines.push(`Missing fields: ${missing.map(([slug, keys]) => `${slug}: ${keys.join(', ')}`).join('; ')}`)
  return { exitCode: summary.failed.length ? 1 : 0, stdout: lines.join('\n') }
}

module.exports = { PAGE_URL, PAUSE_MS, TIMEOUT_MS, SNAPSHOT_FILE, FIGURES, parsePage, readPages, StopPass, mergeSnapshot, serializeSnapshot, loadSnapshot, slugsOf, defaultCacheDir, main }
if (require.main === module) main(process.argv.slice(2)).then(({ exitCode, stdout }) => { console.log(stdout); process.exitCode = exitCode }).catch((error) => { console.error(error.message); process.exitCode = 1 })
