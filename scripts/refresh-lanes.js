#!/usr/bin/env node
'use strict'

// Usage: node scripts/refresh-lanes.js [--pairs <path>] [--ladder <path>] [--write]
//
// Refreshes the code figures of Claude rows in the pairs table from their Artificial Analysis model pages.
// Intelligence and cost per task are not touched. The stored ladder is recalculated and compared, but never
// written automatically.

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
  const fields = ['code', 'codeCostPerTaskUsd', 'codeMinutesPerTask', 'codeChecked']
  for (const field of fields) {
    if (!(field in values)) continue
    const valStr = JSON.stringify(values[field])
    const regex = new RegExp(`("${field}":\\s*)(?:"[^"]*"|[^,}]+)`)
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
    if (!line.includes('"harness": "claude"')) continue
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
  const { readPages } = require(path.join(__dirname, '..', '.claude', 'skills', 'artificial-analysis', 'aa-api.js'))

  const ladder = JSON.parse(fs.readFileSync(args.ladderPath, 'utf8'))
  const pairsText = fs.readFileSync(args.pairsPath, 'utf8')
  const pairsTable = JSON.parse(pairsText)

  const claudeRows = pairsTable.pairs.filter((row) => row.harness === 'claude')
  const slugs = [...new Set(claudeRows.map((row) => row.slug))]
  const pages = await readPages(slugs, { fetch, pause })

  const changes = []
  const failures = []
  const rowUpdates = new Map()
  let hadError = false
  const today = new Date(now()).toISOString().slice(0, 10)

  for (const row of claudeRows) {
    const figures = pages.get(row.slug)
    if (!figures) {
      failures.push(`${row.id}: the page of ${row.slug} has no code figure`)
      continue
    }
    if (figures.error) {
      failures.push(`${row.id}: ${figures.error}`)
      hadError = true
      continue
    }

    for (const field of ['code', 'codeCostPerTaskUsd', 'codeMinutesPerTask']) {
      const before = row[field] ?? 'none'
      const after = figures[field]
      if (row[field] !== after) {
        changes.push(`${row.id}: ${field} ${before} → ${after}`)
      }
      row[field] = after
    }
    row.codeChecked = today
    rowUpdates.set(row.id, {
      code: figures.code,
      codeCostPerTaskUsd: figures.codeCostPerTaskUsd,
      codeMinutesPerTask: figures.codeMinutesPerTask,
      codeChecked: today,
    })
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

  if (args.write) {
    const updatedText = patchPairsText(pairsText, rowUpdates)
    fs.writeFileSync(args.pairsPath, updatedText)
    stdout += `written to ${args.pairsPath}\n`
  }

  stdout += 'The intelligence and the cost per task of the table were not refreshed: they are refreshed together in part 2.\n'

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
