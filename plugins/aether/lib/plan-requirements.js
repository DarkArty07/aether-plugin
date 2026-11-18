'use strict'

// Counts the requirements of a spec and answers whether the design's map step runs.
// The threshold lives in config/design.json; this module is its only reader.
// Family: plan.

const fs = require('node:fs')
const path = require('node:path')

// The requirement lines of a spec: the lines that start with `- Rn:`.
function countRequirements(specText) {
  const matches = String(specText).match(/^- R\d+:/gm)
  return matches ? matches.length : 0
}

// The map threshold of config/design.json. The default path is that file, beside this lib.
function loadThreshold(configPath = path.join(__dirname, '..', 'config', 'design.json')) {
  let raw
  try {
    raw = fs.readFileSync(configPath, 'utf8')
  } catch (err) {
    throw new Error(`threshold config not found: ${configPath}: ${err.message}`)
  }
  let data
  try {
    data = JSON.parse(raw)
  } catch (err) {
    throw new Error(`threshold config is not JSON: ${configPath}: ${err.message}`)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`threshold config ${configPath} is not an object`)
  }
  const threshold = data.mapMinRequirements
  if (typeof threshold !== 'number' || !Number.isInteger(threshold) || threshold <= 0) {
    throw new Error(`threshold config ${configPath} needs mapMinRequirements as a positive integer`)
  }
  return threshold
}

// The requirements of a spec against a threshold: the map step runs at the threshold.
function requirementsResult(specText, threshold) {
  const requirements = countRequirements(specText)
  return { requirements, threshold, map: requirements >= threshold }
}

const USAGE = 'usage: aether-plan requirements <spec.md>'

function fail(errors, stdout) {
  stdout.write(JSON.stringify({ ok: false, errors, warnings: [] }) + '\n')
  process.exit(1)
}

// The `requirements` verb: read-only; prints one JSON line and exits 0, or a JSON
// error and exits 1 on a missing spec or an unreadable threshold. It writes nothing.
function main(argv, { cwd = process.cwd(), stdout = process.stdout } = {}) {
  const specArg = argv[1]
  if (!specArg) {
    const { USAGE: SHARED_USAGE } = require('./plan-compile.js')
    fail([SHARED_USAGE], stdout)
  }
  if (argv.length > 2) fail([USAGE], stdout)
  const specPath = path.resolve(cwd, specArg)
  let specText
  try {
    specText = fs.readFileSync(specPath, 'utf8')
  } catch {
    fail([`spec not found: ${specPath}`], stdout)
  }
  let threshold
  try {
    threshold = loadThreshold()
  } catch (err) {
    fail([err.message], stdout)
  }
  stdout.write(JSON.stringify(requirementsResult(specText, threshold)) + '\n')
}

module.exports = { countRequirements, loadThreshold, requirementsResult, main }
