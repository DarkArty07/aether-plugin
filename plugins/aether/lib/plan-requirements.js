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

module.exports = { countRequirements, loadThreshold, requirementsResult }
