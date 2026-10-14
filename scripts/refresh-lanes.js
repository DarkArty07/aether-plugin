#!/usr/bin/env node
'use strict'

// Usage: node scripts/refresh-lanes.js [--config <path>] [--write]
//
// Refreshes the Artificial Analysis figures of the lane table from the Artificial Analysis API.
// Prints each figure that changed; with --write, also writes the table back. The API key comes
// from ARTIFICIAL_ANALYSIS_API_KEY, or else from .env in the data directory (AETHER_DATA_DIR, or
// ~/.local/share/aether-plugin), and is never printed.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const KEY = 'ARTIFICIAL_ANALYSIS_API_KEY'
const MODELS_URL = 'https://artificialanalysis.ai/api/v2/data/llms/models'
const DEFAULT_CONFIG = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'lanes.json')
const USAGE = 'usage: node scripts/refresh-lanes.js [--config <path>] [--write]'

// Sets each model's aa figures from the Artificial Analysis models list. Works on `config` in
// place and returns it, with one line per changed figure (or per missing slug) in table order.
function refresh(config, models, { checked }) {
  const changes = []
  for (const harness of Object.values(config.harnesses)) {
    for (const [id, model] of Object.entries(harness.models)) {
      if (!model.aa || !model.aa.slug) continue
      const entry = models.find((candidate) => candidate.slug === model.aa.slug)
      if (!entry) {
        changes.push(`${id}: slug ${model.aa.slug} not found`)
        continue
      }
      const figures = {
        intelligence: round(entry.evaluations.artificial_analysis_intelligence_index, 1),
        terminalBench: round(entry.evaluations.terminalbench_v4_0, 2),
      }
      for (const field of ['intelligence', 'terminalBench']) {
        if (model.aa[field] !== figures[field]) changes.push(`${id}: ${field} ${model.aa[field]} → ${figures[field]}`)
        model.aa[field] = figures[field]
      }
      model.aa.checked = checked
    }
  }
  return { config, changes }
}

function round(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

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
  let configPath = DEFAULT_CONFIG
  let write = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--write') write = true
    else if (argv[i] === '--config' && i + 1 < argv.length) configPath = argv[++i]
    else return null
  }
  return { configPath: path.resolve(configPath), write }
}

async function main(argv, { env = process.env, fetch = globalThis.fetch, now = Date.now, envFile } = {}) {
  const args = parseArgs(argv)
  if (!args) return { exitCode: 2, stdout: `${USAGE}\n` }

  const key = keyFrom(env, envFileFor(env, envFile))
  if (!key) {
    return { exitCode: 1, stdout: `${KEY} is not set, and ${keyFile(env)} does not have it.\n` }
  }

  const config = JSON.parse(fs.readFileSync(args.configPath, 'utf8'))
  const response = await fetch(MODELS_URL, { headers: { 'x-api-key': key } })
  if (!response.ok) return { exitCode: 1, stdout: `Artificial Analysis answered ${response.status}.\n` }
  const body = await response.json()
  const models = Array.isArray(body) ? body : body.data

  const checked = new Date(now()).toISOString().slice(0, 10)
  const { changes } = refresh(config, models, { checked })
  let stdout = changes.length > 0 ? changes.map((line) => `${line}\n`).join('') : 'No figure changed.\n'
  if (args.write) {
    fs.writeFileSync(args.configPath, `${JSON.stringify(config, null, 2)}\n`)
    stdout += `written to ${args.configPath}\n`
  }
  return { exitCode: 0, stdout }
}

module.exports = { refresh, keyFrom, keyFile, envFileFor, KEY, MODELS_URL, main }

if (require.main === module) {
  main(process.argv.slice(2)).then(({ exitCode, stdout }) => {
    process.stdout.write(stdout)
    process.exitCode = exitCode
  })
}
