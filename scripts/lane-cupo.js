#!/usr/bin/env node
'use strict'

// Usage: node scripts/lane-cupo.js <harness> [--ceiling <1-16>] [--write]
//
// Ramps simultaneous `node scripts/lane-smoke.js <harness> --effort low` processes from 1 up to the
// ceiling. Stops when a call fails or the slowest of a step takes more than twice the single call.
// Prints one JSON line. With --write, records maxParallel and maxParallelMeasured on that harness in
// plugins/aether/config/lanes.json. Exits 2 on bad usage, before any process is launched. A real ramp
// spends quota: the Lead runs it with the paid-call grant.

const path = require('node:path')
const { spawn } = require('node:child_process')
const { parseArgs, ramp, writeCupo } = require('../plugins/aether/lib/lane-cupo.js')

const SMOKE = path.join(__dirname, 'lane-smoke.js')
const LANES = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'lanes.json')

// The last JSON line lane-smoke printed, and its exit code. `seconds` is the smoke script's own clock,
// in seconds with one decimal; the ramp compares milliseconds, so a tenth of a second becomes 100 ms.
function readSmoke(stdout, code) {
  let seconds = null
  const lines = stdout.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (!trimmed.startsWith('{')) continue
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed.seconds === 'number') {
        seconds = parsed.seconds
        break
      }
    } catch {
      // not the JSON line; keep looking
    }
  }
  return { ok: code === 0, ms: seconds === null ? 0 : Math.round(seconds * 1000) }
}

// One smoke process. Resolves when it exits; a spawn error is a failed call, not a thrown ramp.
function oneCall(harness) {
  return new Promise((resolve) => {
    let stdout = ''
    let code = null
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve(readSmoke(stdout, code))
    }
    const child = spawn(process.execPath, [SMOKE, harness, '--effort', 'low'], {
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.on('error', () => done())
    child.on('close', (status) => {
      code = status
      done()
    })
  })
}

// The n calls of one step start together: each oneCall spawns before this function awaits.
function callsAtOnce(harness, n) {
  const calls = []
  for (let i = 0; i < n; i++) calls.push(oneCall(harness))
  return Promise.all(calls)
}

async function main(argv) {
  let args
  try {
    args = parseArgs(argv)
  } catch (err) {
    console.error(err.message)
    return 2
  }
  const result = await ramp({ ceiling: args.ceiling, run: (n) => callsAtOnce(args.harness, n) })
  console.log(JSON.stringify({
    harness: args.harness,
    maxParallel: result.maxParallel,
    limited: result.limited,
    ceiling: result.ceiling,
    steps: result.steps,
    reason: result.reason,
  }))
  if (!args.write) return 0
  try {
    writeCupo(LANES, args.harness, result)
  } catch (err) {
    console.error(err.message)
    return 1
  }
  return 0
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  }, (err) => {
    console.error(err && err.message ? err.message : err)
    process.exitCode = 1
  })
}
