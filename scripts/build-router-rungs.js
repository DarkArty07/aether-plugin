#!/usr/bin/env node
'use strict'

// Usage: node scripts/build-router-rungs.js [--write | --check] [--models <file>] [--lanes <file>] [--out <file>]
//
// Derives the router's table of rungs (plugins/aether/config/router/rungs.json) from the models index and
// the lane table. Without flags it prints one line per harness; --write writes the file; --check exits 0
// when the file equals what the measures derive and 1 when not, and prints the difference in one line.

const fs = require('node:fs')
const path = require('node:path')
const rungs = require('../plugins/aether/lib/router-rungs.js')

const CONFIG = path.join(__dirname, '..', 'plugins', 'aether', 'config')
const USAGE = 'usage: node scripts/build-router-rungs.js [--write | --check] [--models <file>] [--lanes <file>] [--out <file>]'

function parseArgs(argv) {
  const opts = { write: false, check: false, models: path.join(CONFIG, 'models', 'models.json'), lanes: path.join(CONFIG, 'lanes.json'), out: rungs.rungsFile() }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--write') opts.write = true
    else if (arg === '--check') opts.check = true
    else if (arg === '--models' || arg === '--lanes' || arg === '--out') {
      if (!argv[i + 1]) return null
      opts[arg.slice(2)] = path.resolve(argv[++i])
    } else return null
  }
  return opts.write && opts.check ? null : opts
}

function firstDifference(committed, derived) {
  const a = committed.rungs || []
  const b = derived.rungs
  if (JSON.stringify(committed.bands) !== JSON.stringify(derived.bands)) return 'the bands differ'
  if (committed.generatedFrom !== derived.generatedFrom) return 'generatedFrom differs'
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return `rung ${i} differs: file ${a[i] ? a[i].id : 'none'}, derived ${b[i] ? b[i].id : 'none'}`
  }
  return 'the files differ'
}

function main(argv) {
  const opts = parseArgs(argv)
  if (!opts) {
    console.error(USAGE)
    return 1
  }
  const index = JSON.parse(fs.readFileSync(opts.models, 'utf8'))
  const lanesConfig = JSON.parse(fs.readFileSync(opts.lanes, 'utf8'))
  const table = rungs.deriveRungs(index, lanesConfig)
  const text = JSON.stringify(table, null, 2) + '\n'
  if (opts.write) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true })
    fs.writeFileSync(opts.out, text)
  }
  if (opts.check) {
    let current = null
    try {
      current = fs.readFileSync(opts.out, 'utf8')
    } catch {
      console.log(`${opts.out} is missing: run with --write`)
      return 1
    }
    if (current === text) return 0
    let why = 'the files differ'
    try {
      why = firstDifference(JSON.parse(current), JSON.parse(text))
    } catch {
      why = 'the file is not valid JSON'
    }
    console.log(`${opts.out} is stale: ${why}; run with --write`)
    return 1
  }
  for (const harness of ['claude', 'agy', 'grok']) {
    const own = table.rungs.filter((r) => r.harness === harness)
    const count = (f) => own.filter(f).length
    console.log(`${harness}: ${own.length} rungs, ${count((r) => r.status === 'measured')} measured, ${count((r) => r.status === 'unmeasured')} unmeasured, ${count((r) => r.eligible)} eligible`)
  }
  return 0
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))

module.exports = { main }
