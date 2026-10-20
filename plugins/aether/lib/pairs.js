'use strict'

// The pairs table: one row per (harness, model, effort) with its Artificial Analysis figures. Superdelegation
// (lib/superdelegation.js) asks each call for the points of its native reference pair and picks among these.

const fs = require('node:fs')
const path = require('node:path')

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'pairs.json')
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const NATIVE_MODELS = ['haiku', 'sonnet', 'opus']
const NATIVE_HARNESS = 'claude'

function pairsPath(env = process.env) {
  return env.AETHER_PAIRS_CONFIG || CONFIG_FILE
}

function pairId(harness, model, effort) {
  return `${harness}/${model}@${effort}`
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.length > 0
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const isNumberOrNull = (value) => value === null || (isNumber(value) && value >= 0)

function validatePair(pair, index) {
  const label = isObject(pair) && isText(pair.id) ? `pair ${index} (${pair.id})` : `pair ${index}`
  const fail = (field, problem) => {
    throw new Error(`${label}: ${field} ${problem}`)
  }
  if (!isObject(pair)) throw new Error(`${label}: must be an object`)
  if (!isText(pair.harness)) fail('harness', 'must be a non-empty string')
  if (!isText(pair.model)) fail('model', 'must be a non-empty string')
  if (pair.harness === NATIVE_HARNESS && !NATIVE_MODELS.includes(pair.model)) fail('model', `must be one of ${NATIVE_MODELS.join(', ')} for ${NATIVE_HARNESS}`)
  if (!EFFORTS.includes(pair.effort)) fail('effort', `must be one of ${EFFORTS.join(', ')}`)
  if (!isText(pair.family)) fail('family', 'must be a non-empty string')
  if (pair.harness === NATIVE_HARNESS) {
    if (pair.group !== null) fail('group', `must be null for ${NATIVE_HARNESS}`)
  } else if (!isText(pair.group)) {
    fail('group', 'must be a non-empty string for an external harness')
  }
  if (!isText(pair.slug)) fail('slug', 'must be a non-empty string')
  if (!isNumber(pair.intelligence)) fail('intelligence', 'must be a number')
  if (!isNumberOrNull(pair.costPerTaskUsd)) fail('costPerTaskUsd', 'must be a number of at least 0, or null')
  if (!isNumberOrNull(pair.outputTokensPerSecond)) fail('outputTokensPerSecond', 'must be a number of at least 0, or null')
  if (!isNumberOrNull(pair.timeToFirstTokenS)) fail('timeToFirstTokenS', 'must be a number of at least 0, or null')
  if (Object.hasOwn(pair, 'ownerDecision') && !isText(pair.ownerDecision)) fail('ownerDecision', 'must be a non-empty string when present')
  const id = pairId(pair.harness, pair.model, pair.effort)
  if (pair.id !== id) fail('id', `must be ${id}`)
}

function validateTable(table) {
  if (!isObject(table)) throw new Error('must be an object')
  if (!isText(table.fetchedAt)) throw new Error('fetchedAt must be a non-empty string')
  if (!Array.isArray(table.pairs)) throw new Error('pairs must be an array')
  const seen = new Set()
  table.pairs.forEach((pair, index) => {
    validatePair(pair, index)
    if (seen.has(pair.id)) throw new Error(`pair ${index} (${pair.id}): duplicate id`)
    seen.add(pair.id)
  })
}

// The table at file. Throws, naming the file, when it is missing, is not JSON or breaks a rule.
function loadPairs(file = pairsPath()) {
  try {
    const table = JSON.parse(fs.readFileSync(file, 'utf8'))
    validateTable(table)
    return { fetchedAt: table.fetchedAt, pairs: table.pairs }
  } catch (err) {
    throw new Error(`pairs config ${file}: ${err.message}`)
  }
}

// The native pair a call names by its model alias and effort: the points it asks for.
function referenceOf(pairs, { model, effort }) {
  const found = pairs.find((pair) => pair.harness === NATIVE_HARNESS && pair.model === model && pair.effort === effort)
  if (!found) throw new Error(`no reference pair for ${model} ${effort}`)
  return found
}

module.exports = {
  CONFIG_FILE,
  EFFORTS,
  NATIVE_MODELS,
  NATIVE_HARNESS,
  pairsPath,
  loadPairs,
  pairId,
  referenceOf,
}
