#!/usr/bin/env node
'use strict'

// Refresh the intelligence, the cost per task and the date of each pair from the local page snapshot. The code
// figures are not read or written (A127). The recalculated ladder is shown and never written.
const fs = require('node:fs')
const path = require('node:path')
const { loadSnapshot } = require('./aa-pages.js')
const DEFAULT_PAIRS = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'pairs.json')
const DEFAULT_LADDER = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'ladder.json')
const USAGE = 'usage: node scripts/refresh-lanes.js [--pairs <path>] [--ladder <path>] [--snapshot <path>] [--write]'

function parseArgs(argv) {
  let pairsPath = DEFAULT_PAIRS
  let ladderPath = DEFAULT_LADDER
  let snapshotPath
  let write = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--write') {
      write = true
    } else if (argv[i] === '--pairs' && i + 1 < argv.length) {
      pairsPath = path.resolve(argv[++i])
    } else if (argv[i] === '--ladder' && i + 1 < argv.length) {
      ladderPath = path.resolve(argv[++i])
    } else if (argv[i] === '--snapshot' && i + 1 < argv.length) {
      snapshotPath = path.resolve(argv[++i])
    } else {
      return null
    }
  }
  return { pairsPath, ladderPath, snapshotPath, write }
}

function patchRowLine(line, values) {
  let updated = line
  const missing = []
  const fields = ['intelligence', 'costPerTaskUsd', 'checked']
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

function main(argv, { now = Date.now } = {}) {
  const args = parseArgs(argv)
  if (!args) return { exitCode: 2, stdout: `${USAGE}\n` }

  const { ladderFrom, diffLadder } = require(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'pareto.js'))

  const ladder = JSON.parse(fs.readFileSync(args.ladderPath, 'utf8'))
  const pairsText = fs.readFileSync(args.pairsPath, 'utf8')
  const pairsTable = JSON.parse(pairsText)

  // Every row without an estimate has a page; the estimate rows (Muse Spark low to xhigh) name no
  // page and move with their reference row instead.
  const pagedRows = pairsTable.pairs.filter((row) => !Object.hasOwn(row, 'estimateOf'))
  const estimateRows = pairsTable.pairs.filter((row) => Object.hasOwn(row, 'estimateOf'))
  const pages = loadSnapshot(args.snapshotPath).pages

  const changes = []
  const failures = []
  const rowUpdates = new Map()
  let hadError = false

  const record = (row, updates, field, after) => {
    const before = row[field] ?? 'none'
    if (row[field] !== after) {
      changes.push(`${row.id}: ${field} ${before} → ${after}`)
    }
    row[field] = after
    updates[field] = after
  }

  for (const row of pagedRows) {
    const page = pages[row.slug]
    if (!page) {
      failures.push(`${row.id}: the snapshot has no page for ${row.slug}: run node scripts/aa-pages.js read ${row.slug}`)
      hadError = true
      continue
    }
    const figures = page.figures
    const updates = {}
    if (typeof figures.intelligence?.value === 'number') {
      record(row, updates, 'intelligence', figures.intelligence.value)
      // checked dates the intelligence. A page that gave none must not mark the old figure as freshly checked.
      row.checked = figures.intelligence.on
      updates.checked = figures.intelligence.on
    }
    // A cost of null stays null only when it is the owner's decision (ownerDecision); a missing figure without one is filled from the snapshot.
    if (typeof figures.costPerTaskUsd?.value === 'number' && (typeof row.costPerTaskUsd === 'number' || (row.costPerTaskUsd == null && !row.ownerDecision))) {
      record(row, updates, 'costPerTaskUsd', figures.costPerTaskUsd.value)
    }
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

  const readDates = new Map()
  for (const row of pagedRows) {
    const date = pages[row.slug]?.readOn
    if (date && (!readDates.has(row.harness) || date > readDates.get(row.harness))) readDates.set(row.harness, date)
  }
  const claudeDate = readDates.get('claude')
  if (claudeDate) {
    for (const [harness, date] of readDates) {
      if (harness !== 'claude' && date !== claudeDate) stdout += `Read dates differ: ${harness} was read on ${date}, claude on ${claudeDate}.\n`
    }
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

module.exports = { main }

if (require.main === module) {
  const { exitCode, stdout } = main(process.argv.slice(2))
  process.stdout.write(stdout)
  process.exitCode = exitCode
}
