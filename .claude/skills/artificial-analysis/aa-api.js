#!/usr/bin/env node
'use strict'

// Reads the code figures of models from their Artificial Analysis pages.
//
//   node aa-api.js <slug>...

const PAGE_URL = 'https://artificialanalysis.ai/models/'

function round(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

// The code figures of the page of `slug` (the page embeds the data of the models it compares, as JSON inside a script: read the block of
// the page's own model, as aa-pages.js does). Null when the page has no block for the slug or no code figure (the `terminalbench-4-0`
// entry). Rounding: code 2 decimals (the fraction by 100), cost 3, minutes 1 (seconds / 60).
function figuresOf(html, slug) {
  const text = html.replace(/\\"/g, '"')
  const starts = [...text.matchAll(/"slug":"([a-z0-9.-]+)","name":"([^"]+)","shortName":"([^"]+)"/g)]
  const briefcases = [...text.matchAll(/"briefcaseBreakdown":/g)]
  for (const b of briefcases) {
    const start = [...starts].reverse().find((s) => s.index < b.index)
    if (!start || start[1] !== slug) continue
    const segment = text.slice(start.index, b.index)
    const evals = {}
    for (const m of segment.matchAll(/\{"slug":"([^"]+)","score":(-?[\d.]+),"outputTokensPerTask":(-?[\d.]+),"costPerTask":(-?[\d.e-]+),"timePerTask":(-?[\d.]+)\}/g)) {
      evals[m[1]] = { score: +m[2], outputTokens: Math.round(+m[3]), costUsd: +m[4], seconds: +m[5] }
    }
    const tb = evals['terminalbench-4-0']
    if (!tb || !Number.isFinite(tb.score) || !Number.isFinite(tb.costUsd) || !Number.isFinite(tb.seconds)) return null
    return {
      code: round(tb.score * 100, 2),
      codeCostPerTaskUsd: round(tb.costUsd, 3),
      codeMinutesPerTask: round(tb.seconds / 60, 1),
    }
  }
  return null
}

// One request per page, one pause between two requests, no headers. A page that does not answer ok gives { error: 'the page answered <status>' }.
async function readPages(slugs, { fetch = globalThis.fetch, pause = (ms) => new Promise((r) => setTimeout(r, ms)), pauseMs = 1200 } = {}) {
  const out = new Map()
  for (let i = 0; i < slugs.length; i++) {
    if (i > 0) await pause(pauseMs)
    const slug = slugs[i]
    const response = await fetch(`${PAGE_URL}${slug}`)
    if (!response.ok) {
      out.set(slug, { error: `the page answered ${response.status}` })
      continue
    }
    const html = await response.text()
    out.set(slug, figuresOf(html, slug))
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

module.exports = { PAGE_URL, figuresOf, readPages, cli }

if (require.main === module) {
  cli(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
