'use strict'

// Codex's subscription quota, read from `codex app-server` over stdio. The protocol is a short
// exchange of JSON lines, and lane-readings calls quota() synchronously, so the exchange runs in
// this file as its own process and the caller waits for one JSON line.
// Family: harness.

const { spawn, spawnSync } = require('node:child_process')
const { laneEnv } = require('../lane-process.js')

const RATE_LIMITS_TIMEOUT_MS = 20000

// A window's name in a reading: the 5 hour and weekly windows Codex reports, or its length in minutes.
function windowName(mins) {
  if (mins === 300) return '5h'
  if (mins === 10080) return 'weekly'
  return `${mins}m`
}

// The windows of an `account/rateLimits/read` result. The codex limit wins over the plain one.
// A window that is missing or has no used percent is left out. A refused account reads as nothing left.
function windowsFrom(result) {
  const byId = result && result.rateLimitsByLimitId
  const limit = byId && byId.codex != null ? byId.codex : result && result.rateLimits
  const refused = result && result.ordinaryUsageAllowed === false
  const windows = {}
  for (const key of ['primary', 'secondary']) {
    const window = limit && limit[key]
    if (window == null || !Number.isFinite(window.usedPercent)) continue
    const remaining = refused ? 0 : Math.max(0, (100 - window.usedPercent) / 100)
    windows[windowName(window.windowDurationMins)] = {
      remaining,
      resetsAt: new Date(window.resetsAt * 1000).toISOString(),
    }
  }
  if (Object.keys(windows).length === 0) throw new Error('codex rate limits: no windows')
  return windows
}

// One copy of the windows for each key of the table. The reading has no source.
function groupsFrom(windows, groups) {
  const reported = {}
  for (const key of Object.keys(groups)) {
    reported[key] = { windows: JSON.parse(JSON.stringify(windows)) }
  }
  return { groups: reported }
}

// The one JSON line the child prints, or null when stdout is not that line.
function lineOf(stdout) {
  const line = String(stdout || '').trim().split('\n').filter(Boolean).at(-1)
  if (!line) return null
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

// Reads the windows once and copies them onto every key of groups. Throws when the server cannot
// be started, errors, exits or does not answer in time. Nothing is invented. The server gets the environment of a
// lane call, so the owner's OPENAI_API_KEY and other secrets never reach codex (R19).
function readCodexQuota({ command = 'codex', groups = {}, env = process.env, timeoutMs = RATE_LIMITS_TIMEOUT_MS } = {}) {
  const spawned = spawnSync(process.execPath, [__filename, command, String(timeoutMs)], {
    env: laneEnv(env, 'codex-quota'),
    encoding: 'utf8',
    timeout: timeoutMs + 5000,
  })
  if (spawned.error) {
    const timedOut = spawned.error.code === 'ETIMEDOUT' || /timed out/i.test(spawned.error.message || '')
    throw new Error(`codex rate limits: ${timedOut ? 'timed out' : spawned.error.message}`)
  }
  const parsed = lineOf(spawned.stdout)
  if (!parsed || parsed.ok !== true) {
    const cause = (parsed && parsed.error) || (spawned.stderr || '').trim() || `exit ${spawned.status}`
    throw new Error(`codex rate limits: ${cause}`)
  }
  return groupsFrom(windowsFrom(parsed.result), groups)
}

// The exchange: initialize, then on its answer the initialized notification and the rate-limits read.
// One JSON line goes to stdout either way, and the server is killed before this process ends.
// A command that never starts has no pid and no exit event, so the result is written at once.
function exchange(command, timeoutMs) {
  const child = spawn(command, ['app-server'], { stdio: ['pipe', 'pipe', 'ignore'] })
  let settled = false
  let exited = false
  let buffer = ''
  const timer = setTimeout(() => finish(false, 'timed out'), timeoutMs)

  function finish(ok, value) {
    if (settled) return
    settled = true
    clearTimeout(timer)
    const payload = ok ? { ok: true, result: value } : { ok: false, error: String(value) }
    let written = false
    const write = () => {
      if (written) return
      written = true
      process.stdout.write(`${JSON.stringify(payload)}\n`)
      process.exit(ok ? 0 : 1)
    }
    // exitCode is set when the child has ended, including a spawn that failed (no exit event).
    if (exited || child.exitCode != null || child.signalCode != null) {
      write()
      return
    }
    child.once('exit', write)
    try {
      if (child.kill('SIGKILL') === false) write()
    } catch {
      write()
    }
  }

  child.on('error', (error) => finish(false, error.message))
  child.on('exit', (code) => {
    exited = true
    finish(false, `exit ${code}`)
  })
  child.stdin.on('error', () => {})
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      let message
      try {
        message = JSON.parse(line)
      } catch {
        continue
      }
      if (message.id === 1) {
        if (message.error) {
          finish(false, message.error.message || 'initialize failed')
          return
        }
        child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`)
        child.stdin.write(`${JSON.stringify({ id: 2, method: 'account/rateLimits/read' })}\n`)
      } else if (message.id === 2) {
        if (message.error) finish(false, message.error.message || 'error')
        else finish(true, message.result)
      }
    }
  })
  try {
    child.stdin.write(`${JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'aether', title: 'aether', version: '0.0.0' } } })}\n`)
  } catch {
    // A command that cannot start reports itself on the error event.
  }
}

if (require.main === module) {
  const command = process.argv[2] || 'codex'
  const timeoutMs = Number(process.argv[3])
  exchange(command, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : RATE_LIMITS_TIMEOUT_MS)
}

module.exports = { RATE_LIMITS_TIMEOUT_MS, windowsFrom, readCodexQuota }
