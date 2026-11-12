'use strict'

// Configuration for unit worktree swarm runs and wait limits.
// Family: wt.

const fs = require('node:fs')
const path = require('node:path')

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'swarm.json')

function loadSwarmConfig(file = CONFIG_FILE) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    throw new Error(`swarm config: cannot read ${file}: ${err.message}`)
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(`swarm config: invalid JSON in ${file}: ${err.message}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`swarm config: expected an object in ${file}`)
  }
  if (!Number.isInteger(parsed.stuckWaitSeconds) || parsed.stuckWaitSeconds < 0) {
    throw new Error(`swarm config: stuckWaitSeconds must be an integer >= 0 in ${file}`)
  }
  let watchSilenceSeconds
  if (parsed.watchSilenceSeconds === undefined) {
    watchSilenceSeconds = parsed.stuckWaitSeconds + 600
  } else if (!Number.isInteger(parsed.watchSilenceSeconds) || parsed.watchSilenceSeconds < 1) {
    throw new Error(`swarm config: watchSilenceSeconds must be an integer >= 1 in ${file}`)
  } else {
    watchSilenceSeconds = parsed.watchSilenceSeconds
  }
  return {
    stuckWaitSeconds: parsed.stuckWaitSeconds,
    watchSilenceSeconds,
  }
}

module.exports = { loadSwarmConfig }
