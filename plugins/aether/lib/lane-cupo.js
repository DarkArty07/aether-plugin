'use strict'

// How many calls one harness can take at once. `ramp` runs 1, 2, 3, … calls together, up to a ceiling,
// and stops when a call fails or the slowest of a step takes more than twice the single call. A test passes
// its own `run`; scripts/lane-cupo.js is the wrapper that spawns the real calls and, with --write, records
// the result on that harness's row. The edit replaces two lines and leaves the rest of the file as written:
// lanes.json keeps objects on one line, so this is not a JSON rewrite. Strings in that file stay on one line.

const fs = require('node:fs')

const CEILING = 8
const MAX_CEILING = 16
const SLOWDOWN = 2
const USAGE = 'usage: node scripts/lane-cupo.js <harness> [--ceiling <1-16>] [--write]'

function parseArgs(argv) {
  let harness = null
  let ceiling = CEILING
  let write = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--write') {
      write = true
    } else if (arg === '--ceiling') {
      const raw = argv[++i]
      if (raw === undefined || !/^\d+$/.test(raw)) throw new Error(USAGE)
      const value = Number(raw)
      if (value < 1 || value > MAX_CEILING) throw new Error(USAGE)
      ceiling = value
    } else if (arg.startsWith('-') || harness !== null) {
      throw new Error(USAGE)
    } else {
      harness = arg
    }
  }
  if (harness === null) throw new Error(USAGE)
  return { harness, ceiling, write }
}

// The slowest call of the step, and how many were not ok. `ms` counts a failed call too: the step's time
// is the slowest of the calls that ran, not only the ones that succeeded.
function stepOf(n, results) {
  let ms = 0
  let failed = 0
  for (const result of results) {
    if (!result.ok) failed += 1
    if (typeof result.ms === 'number' && result.ms > ms) ms = result.ms
  }
  return { n, ms, failed }
}

async function ramp({ run, ceiling = CEILING }) {
  const steps = []
  let baseline = null
  for (let n = 1; n <= ceiling; n++) {
    const step = stepOf(n, await run(n))
    steps.push(step)
    const slower = baseline !== null && step.ms > baseline * SLOWDOWN
    if (step.failed > 0 || slower) {
      const reason = n === 1
        ? 'the single call failed'
        : step.failed > 0
          ? `a call failed at ${n}`
          : `step ${n} was slower than ${SLOWDOWN} times the single call`
      return { maxParallel: n - 1, limited: true, ceiling, steps, reason }
    }
    if (baseline === null) baseline = step.ms
  }
  return { maxParallel: ceiling, limited: false, ceiling, steps, reason: 'no limit up to the ceiling' }
}

function escapeRegExp(text) {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

// `{` and `}` outside of strings. A string that contains a brace must not move the depth.
function braceDelta(line) {
  let inString = false
  let escaped = false
  let delta = 0
  for (const ch of line) {
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') delta += 1
    else if (ch === '}') delta -= 1
  }
  return delta
}

function measuredLine(indent, result, iso) {
  const limited = result.limited === true ? 'true' : 'false'
  return `${indent}"maxParallelMeasured": { "at": "${iso}", "ceiling": ${result.ceiling}, "limited": ${limited} },`
}

// The harness object's own "maxParallel" line: the first one at depth 1, not a line nested under models.
function maxParallelAt(lines, harness) {
  const key = new RegExp(`^\\s*"${escapeRegExp(harness)}":\\s*\\{\\s*$`)
  const start = lines.findIndex((line) => key.test(line))
  if (start < 0) throw new Error(`no harness ${harness} in the file`)
  const property = /^(\s*)"maxParallel": \d+,\s*$/
  let depth = braceDelta(lines[start])
  for (let i = start + 1; i < lines.length; i++) {
    if (depth === 1 && property.test(lines[i])) return i
    depth += braceDelta(lines[i])
    if (depth <= 0) break
  }
  throw new Error(`harness ${harness} has no "maxParallel" line`)
}

function writeCupo(file, harness, result, options = {}) {
  if (!Number.isInteger(result?.maxParallel) || result.maxParallel < 1) {
    throw new Error('maxParallel must be an integer of at least 1')
  }
  const now = options.now ?? Date.now()
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const at = maxParallelAt(lines, harness)
  const indent = lines[at].match(/^\s*/)[0]
  const fresh = [
    `${indent}"maxParallel": ${result.maxParallel},`,
    measuredLine(indent, result, new Date(now).toISOString()),
  ]
  const replaceCount = /^\s*"maxParallelMeasured":/.test(lines[at + 1] || '') ? 2 : 1
  lines.splice(at, replaceCount, ...fresh)
  const next = lines.join('\n')
  try {
    JSON.parse(next)
  } catch {
    throw new Error(`refusing to write ${file}: the edit is not valid JSON`)
  }
  fs.writeFileSync(file, next)
}

module.exports = { CEILING, MAX_CEILING, SLOWDOWN, USAGE, parseArgs, ramp, writeCupo }
