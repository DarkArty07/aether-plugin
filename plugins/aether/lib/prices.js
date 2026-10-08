'use strict'

// Model costs at OpenRouter list prices (config/prices.json, A6), in USD.
// Claude Code's usage does not split cache writes by lifetime: the main session's are billed at the
// 1-hour rate and agents' at the 5-minute rate, as Claude Code bills them (Phase 0).

const fs = require('node:fs')
const path = require('node:path')

const PRICES_FILE = path.join(__dirname, '..', 'config', 'prices.json')

function loadPrices(file = PRICES_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

// A model's family and rates: an exact id, or a listed id followed by a suffix such as a date.
function ratesFor(prices, model) {
  if (typeof model !== 'string') return null
  for (const [family, rates] of Object.entries(prices.models)) {
    const listed = rates.ids.some((id) => model === id || model.startsWith(`${id}-`) || model.startsWith(`${id}[`))
    if (listed) return { family, rates }
  }
  return null
}

function cost(prices, rates, tokens, ttl) {
  const write = ttl === '1h' ? rates.cacheWrite1h : rates.cacheWrite5m
  const sum = tokens.input * rates.input + tokens.output * rates.output + tokens.cacheRead * rates.cacheRead + tokens.cacheWrite * write
  return sum / prices.per
}

// The cost of one recorded request (see hooks/register.js), or null for a model with no price.
// A long-prompt tier applies to the whole request once its prompt reaches the tier's size.
function priceEntry(entry, prices) {
  const found = ratesFor(prices, entry.model)
  if (!found) return null
  let rates = found.rates
  const prompt = entry.input + entry.cacheRead + entry.cacheWrite
  if (rates.longPrompt && prompt >= rates.longPrompt.minPromptTokens) rates = rates.longPrompt
  return cost(prices, rates, entry, entry.agent ? prices.cacheWriteTtl.agents : prices.cacheWriteTtl.main)
}

// Prices the modelUsage of a `claude -p --output-format json` output, next to Claude Code's own
// list cost. The totals are per model, so the long-prompt tier cannot apply, and only the main
// model's cache writes are billed at the main session's rate.
function priceModelUsage(output, prices, { mainModel = null } = {}) {
  const byModel = {}
  const unpriced = []
  let totalUsd = 0
  let listUsd = 0
  for (const [model, usage] of Object.entries((output && output.modelUsage) || {})) {
    const tokens = {
      input: usage.inputTokens || 0,
      output: usage.outputTokens || 0,
      cacheRead: usage.cacheReadInputTokens || 0,
      cacheWrite: usage.cacheCreationInputTokens || 0,
    }
    const found = ratesFor(prices, model)
    const ttl = model === mainModel ? prices.cacheWriteTtl.main : prices.cacheWriteTtl.agents
    const usd = found ? cost(prices, found.rates, tokens, ttl) : null
    byModel[model] = { tokens, usd, listUsd: typeof usage.costUSD === 'number' ? usage.costUSD : null }
    if (usd === null) unpriced.push(model)
    else totalUsd += usd
    listUsd += usage.costUSD || 0
  }
  return { basis: `${prices.basis}, ${prices.snapshot}`, totalUsd, listUsd, byModel, unpriced }
}

module.exports = { PRICES_FILE, loadPrices, ratesFor, priceEntry, priceModelUsage }
