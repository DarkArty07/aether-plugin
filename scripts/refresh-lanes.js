#!/usr/bin/env node
'use strict'

// Usage: node scripts/refresh-lanes.js [--pairs <path>] [--ladder <path>] [--write]
//
// Refreshes the figures of the pairs table from their Artificial Analysis model pages: the intelligence,
// the cost per task and the code figures of every row that has a page, in one run, with one date on all
// of them. Rows without a page (the Muse Spark estimates) move with their reference row instead (their
// intelligence is the reference's plus the stored distance). The stored ladder is recalculated and
// compared, but never written automatically.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const KEY = 'ARTIFICIAL_ANALYSIS_API_KEY'
const DEFAULT_PAIRS = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'pairs.json')
const DEFAULT_LADDER = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'ladder.json')
const USAGE = 'usage: node scripts/refresh-lanes.js [--pairs <path>] [--ladder <path>] [--write]'

// The key from the environment when set, else from the first ARTIFICIAL_ANALYSIS_API_KEY line of
// the .env text, without one pair of surrounding quotes. Null when neither has it.
function keyFrom(env, envFileText) {
  if (env[KEY]) return env[KEY]
  if (envFileText === null || envFileText === undefined) return null
  for (const line of envFileText.split(/\r?\n/)) {
    const match = /^ARTIFICIAL_ANALYSIS_API_KEY=(.*)$/.exec(line)
    if (match) return unquote(match[1].trim()) || null
  }
  return null
}

function unquote(value) {
  const quoted = /^(['"])(.*)\1$/.exec(value)
  return quoted ? quoted[2] : value
}

// The .env file of the data directory: AETHER_DATA_DIR when set, else ~/.local/share/aether-plugin.
function keyFile(env) {
  return path.join(env.AETHER_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'aether-plugin'), '.env')
}

// The .env text to look in: the one given, none when the environment already has the key, or else
// the data directory's .env (null when that file does not exist).
function envFileFor(env, envFile) {
  if (envFile !== undefined) return envFile
  if (env[KEY]) return null
  const file = keyFile(env)
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

function parseArgs(argv) {
  let pairsPath = DEFAULT_PAIRS
  let ladderPath = DEFAULT_LADDER
  let write = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--write') {
      write = true
    } else if (argv[i] === '--pairs' && i + 1 < argv.length) {
      pairsPath = path.resolve(argv[++i])
    } else if (argv[i] === '--ladder' && i + 1 < argv.length) {
      ladderPath = path.resolve(argv[++i])
    } else {
      return null
    }
  }
  return { pairsPath, ladderPath, write }
}

function patchRowLine(line, values) {
  let updated = line
  const missing = []
  const fields = ['intelligence', 'costPerTaskUsd', 'code', 'codeCostPerTaskUsd', 'codeMinutesPerTask', 'checked', 'codeChecked']
  for (const field of fields) {
    if (!(field in values)) continue
    const valStr = JSON.stringify(values[field])
    const regex = new RegExp(`("${field}":\\s*)(?:"[^"]*"|[^,}\\s]+)`)
    if (regex.test(updated)) {
      updated = updated.replace(regex, `"${field}": ${valStr}`)
    } else {
      missing.push(`"${field}": ${valStr}`)
    }
  }
  if (missing.length > 0) {
    const additions = ', ' + missing.join(', ')
    updated = updated.replace(/\s*\}(,?)\s*$/, `${additions} }$1`)
  }
  return updated
}

function patchPairsText(text, rowUpdates) {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = /"id":\s*"([^"]+)"/.exec(line)
    if (!match) continue
    const id = match[1]
    if (rowUpdates.has(id)) {
      lines[i] = patchRowLine(line, rowUpdates.get(id))
    }
  }
  return lines.join('\n')
}

async function main(argv, { fetch = globalThis.fetch, now = Date.now, pause = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const args = parseArgs(argv)
  if (!args) return { exitCode: 2, stdout: `${USAGE}\n` }

  const { ladderFrom, diffLadder } = require(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'pareto.js'))
  const { pairFiguresOf, readPages } = require(path.join(__dirname, '..', '.claude', 'skills', 'artificial-analysis', 'aa-api.js'))

  const ladder = JSON.parse(fs.readFileSync(args.ladderPath, 'utf8'))
  const pairsText = fs.readFileSync(args.pairsPath, 'utf8')
  const pairsTable = JSON.parse(pairsText)

  // Every row without an estimate has a page; the estimate rows (Muse Spark low to xhigh) name no
  // page and move with their reference row instead.
  const pagedRows = pairsTable.pairs.filter((row) => !Object.hasOwn(row, 'estimateOf'))
  const estimateRows = pairsTable.pairs.filter((row) => Object.hasOwn(row, 'estimateOf'))
  const slugs = [...new Set(pagedRows.map((row) => row.slug))]
  let pages
  try {
    pages = await readPages(slugs, { fetch, pause, parse: pairFiguresOf })
  } catch (err) {
    // A 403 or 429 stops the pass at the page it names: nothing is written, and the exit code is 1.
    return { exitCode: 1, stdout: `${err.message}\nNothing was written.\n` }
  }

  const changes = []
  const failures = []
  const rowUpdates = new Map()
  let hadError = false
  const today = new Date(now()).toISOString().slice(0, 10)

  const record = (row, updates, field, after) => {
    const before = row[field] ?? 'none'
    if (row[field] !== after) {
      changes.push(`${row.id}: ${field} ${before} → ${after}`)
    }
    row[field] = after
    updates[field] = after
  }

  for (const row of pagedRows) {
    const figures = pages.get(row.slug)
    if (!figures) {
      failures.push(`${row.id}: the page of ${row.slug} has no figure`)
      continue
    }
    if (figures.error) {
      failures.push(`${row.id}: ${figures.error}`)
      hadError = true
      continue
    }
    if (figures.code === null || figures.codeCostPerTaskUsd === null || figures.codeMinutesPerTask === null) {
      failures.push(`${row.id}: the page of ${row.slug} has no code figure`)
      continue
    }

    const updates = {}
    if (typeof figures.intelligence === 'number') record(row, updates, 'intelligence', figures.intelligence)
    // A cost of null stays null: it is the owner's decision (Muse), or the page has no cost.
    if (typeof figures.costPerTaskUsd === 'number' && typeof row.costPerTaskUsd === 'number') {
      record(row, updates, 'costPerTaskUsd', figures.costPerTaskUsd)
    }
    for (const field of ['code', 'codeCostPerTaskUsd', 'codeMinutesPerTask']) {
      record(row, updates, field, figures[field])
    }
    row.checked = today
    row.codeChecked = today
    updates.checked = today
    updates.codeChecked = today
    rowUpdates.set(row.id, updates)
  }

  // The estimates follow their reference row: a move of the Claude scale moves them by the same
  // amount, so no refresh changes which pair serves a rung.
  for (const row of estimateRows) {
    const ref = pairsTable.pairs.find((other) => other.id === row.estimateOf)
    if (!ref || typeof ref.intelligence !== 'number' || typeof row.estimateDistance !== 'number') {
      failures.push(`${row.id}: no reference intelligence for ${row.estimateOf}`)
      hadError = true
      continue
    }
    const after = Math.round((ref.intelligence + row.estimateDistance) * 10) / 10
    const before = row.intelligence ?? 'none'
    if (row.intelligence !== after) {
      changes.push(`${row.id}: intelligence ${before} → ${after} (estimate from ${row.estimateOf} plus ${row.estimateDistance})`)
    }
    row.intelligence = after
    rowUpdates.set(row.id, { intelligence: after })
  }

  let stdout = ''
  if (changes.length > 0) {
    stdout += changes.map((line) => `${line}\n`).join('')
  } else {
    stdout += 'No figure changed.\n'
  }
  for (const line of failures) {
    stdout += `${line}\n`
  }

  if (args.write && rowUpdates.size > 0) {
    const updatedText = patchPairsText(pairsText, rowUpdates)
    if (updatedText !== pairsText) {
      fs.writeFileSync(args.pairsPath, updatedText)
      stdout += `written to ${args.pairsPath}\n`
    }
  }

  const recalculated = ladderFrom(pairsTable.pairs, ladder.law)
  const ladderStr = recalculated.length === 0 ? 'none' : recalculated.map((r) => `${r.model} ${r.effort}`).join(' > ')
  stdout += `Recalculated ladder: ${ladderStr}\n`

  const diff = diffLadder(ladder.rungs, recalculated)
  if (diff.length === 0) {
    stdout += 'Stored ladder: unchanged\n'
  } else {
    stdout += 'Stored ladder: changed\n'
    for (const line of diff) {
      stdout += `  ${line}\n`
    }
    stdout += `The stored ladder was not written: to approve the recalculated one, edit ${args.ladderPath} in a commit.\n`
  }

  return { exitCode: hadError ? 1 : 0, stdout }
}

// Exported for scripts/build-models-index.js, which imports them from this file.
module.exports = { keyFrom, keyFile, envFileFor, KEY, main }

if (require.main === module) {
  main(process.argv.slice(2)).then(({ exitCode, stdout }) => {
    process.stdout.write(stdout)
    process.exitCode = exitCode
  })
}
