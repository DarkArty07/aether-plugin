#!/usr/bin/env node
'use strict'

// Lists what the Artificial Analysis (AA) API gives for the models whose name matches a regex (default: Claude 5.5).
// The key is never printed. It comes from ARTIFICIAL_ANALYSIS_API_KEY, else from the first such line of .env in
// AETHER_DATA_DIR or ~/.local/share/aether-plugin (the same places as scripts/refresh-lanes.js).
//
//   node aa-api.js ["name regex"] [--json]
//
// This reads the API only. AA's terms forbid automated requests to its website: see docs/reference/artificial-analysis.md.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const MODELS_URL = 'https://artificialanalysis.ai/api/v2/data/llms/models'

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

async function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const filter = args.find((a) => a !== '--json') || 'Claude (Haiku|Sonnet|Opus) 5\\.5'
  const response = await fetch(MODELS_URL, { headers: { 'x-api-key': apiKey() } })
  if (!response.ok) throw new Error(`the API answered ${response.status}`)
  const body = await response.json()
  const list = (body.data || body).filter((m) => new RegExp(filter, 'i').test(m.name))
  if (json) return console.log(JSON.stringify(list, null, 1))
  console.log(`${list.length} models. Per model the API gives: id, name, slug, release_date, model_creator, evaluations, pricing, speed and first-token times.`)
  console.log('name'.padEnd(46), 'intel  TB4.0  LCR  HLE  SciCode   (a dash means the API has no figure)')
  for (const m of list) {
    const e = m.evaluations
    console.log(m.name.padEnd(46), String(e.artificial_analysis_intelligence_index).padStart(5), pct(e.terminalbench_v4_0).padStart(6), pct(e.lcr).padStart(5), pct(e.hle).padStart(4), pct(e.scicode).padStart(8))
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 })
