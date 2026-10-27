'use strict'

// Grok's billing, asked of grok itself through ACP. lib/harness/grok-quota.js asks for it.
// Family: harness.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { isObject } = require('../common.js')
const { commandPath, killMarked, laneEnv } = require('../lane-process.js')

const ACP_TIMEOUT_MS = 10000
// What killMarked waits between SIGTERM and SIGKILL. A read waits for the answer no longer than its timeout less
// this, so that ending the agent still ends inside the timeout.
const KILL_WAIT_MS = 2000
// A line of the agent's output that grows past this without a newline is not ACP.
const MAX_LINE_BYTES = 1024 * 1024

const INITIALIZE_ID = 1
const BILLING_ID = 2

// A response's result, or null when the message is an error or has no result object.
function resultOf(message) {
  if (message.error !== undefined && message.error !== null) return null
  return isObject(message.result) ? message.result : null
}

// Talks to the agent through child's pipes: initialize, then _x.ai/billing. Settles, never rejects, to the answer or
// to null when the agent errors, exits, sends something that is no answer, or says nothing before waitMs. It does not
// end the agent. Its listeners are in place when it returns, so call it right after spawn.
function ask(child, { waitMs, now }) {
  return new Promise((resolve) => {
    let finished = false
    let buffer = ''
    let version = null
    let billingAsked = false
    const timer = setTimeout(() => finish(null), waitMs)
    function finish(value) {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve(value)
    }
    const send = (message) => {
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`)
      } catch {
        finish(null)
      }
    }
    const onMessage = (message) => {
      if (message.id === INITIALIZE_ID && !billingAsked) {
        const result = resultOf(message)
        if (result === null) return finish(null)
        version = isObject(result._meta) && typeof result._meta.agentVersion === 'string' ? result._meta.agentVersion : null
        billingAsked = true
        send({ jsonrpc: '2.0', id: BILLING_ID, method: '_x.ai/billing', params: {} })
      } else if (message.id === BILLING_ID && billingAsked) {
        const result = resultOf(message)
        if (result === null || !isObject(result.config)) return finish(null)
        finish({ config: result.config, subscriptionTier: result.subscription_tier ?? null, version, at: now() })
      }
    }
    const onLine = (line) => {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        return
      }
      if (isObject(message)) onMessage(message)
    }

    child.on('error', () => finish(null))
    // 'close', not 'exit': the output the agent wrote just before it exited is read first.
    child.on('close', () => finish(null))
    child.stdin.on('error', () => {})
    child.stdout.on('error', () => {})
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      for (let newline = buffer.indexOf('\n'); newline !== -1 && !finished; newline = buffer.indexOf('\n')) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        onLine(line)
      }
      if (buffer.length > MAX_LINE_BYTES) finish(null)
    })

    if (child.pid === undefined) return finish(null)
    send({ jsonrpc: '2.0', id: INITIALIZE_ID, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: {} } })
  })
}

// What to undo when a signal ends this process while a refresh runs: the agent, the directory, the lock. A killed
// parent would otherwise leave them, and the agent with whatever it started. One set of handlers serves every refresh
// in the process, as lane-calls.js and seats.js register theirs; they are in place only while something is to undo.
const SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP']
const undoOnSignal = new Set()

// Undoes, newest first, whatever is registered, then ends the process as a signal does.
function onSignal() {
  for (const undo of [...undoOnSignal].reverse()) {
    try {
      undo()
    } catch {
      // Whatever stays is harmless: the next refresh takes over a left-over lock.
    }
  }
  process.exit(143)
}

// Registers undo to run if SIGTERM, SIGINT or SIGHUP arrives. Returns the function that takes it back out; call it
// when the work is done.
function undoWhenKilled(undo) {
  if (undoOnSignal.size === 0) for (const signal of SIGNALS) process.on(signal, onSignal)
  undoOnSignal.add(undo)
  return () => {
    undoOnSignal.delete(undo)
    if (undoOnSignal.size === 0) for (const signal of SIGNALS) process.removeListener(signal, onSignal)
  }
}

function signalGroup(pid, signal) {
  if (!Number.isInteger(pid) || pid <= 0) return
  try {
    process.kill(-pid, signal)
  } catch {
    // Gone already.
  }
}

// Ends the agent and whatever it started, and removes its directory. Each step runs whatever the one before did.
// SIGTERM to the group, then killMarked, which waits and sends SIGKILL to what still carries the marker, then
// SIGKILL to the group. Never throws.
function stopAgent({ child, dir, marker }) {
  if (child) {
    try {
      child.stdin.destroy()
    } catch {
      // Closed already.
    }
    signalGroup(child.pid, 'SIGTERM')
  }
  try {
    killMarked(marker)
  } catch {
    // Nothing more to end.
  }
  if (child) signalGroup(child.pid, 'SIGKILL')
  if (dir !== null) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // A directory the system cleans up with its temporary files.
    }
  }
}

// Asks grok for its billing over ACP. Resolves to { config, subscriptionTier, version, at } (at is now() when the
// answer came), or to null when grok is not installed, cannot start, errors, exits, or does not answer inside
// timeoutMs. Never throws. It takes up to timeoutMs: do not run it inside a lane call. now is for tests.
async function readBillingViaAcp({ command = 'grok', env = process.env, timeoutMs = ACP_TIMEOUT_MS, now = Date.now } = {}) {
  // The marker uses the real clock, not now: it must tell this agent from every other, whatever clock a test gives.
  const session = { child: null, dir: null, marker: `grok-acp/${process.pid}-${Date.now()}` }
  const release = undoWhenKilled(() => stopAgent(session))
  try {
    const grok = commandPath(command, env)
    if (grok === null) return null
    session.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-grok-acp-'))
    session.child = spawn(grok, ['agent', '--no-leader', 'stdio'], {
      cwd: session.dir,
      detached: true,
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...laneEnv(env, session.marker), GROK_DISABLE_AUTOUPDATER: '1' },
    })
    const limit = Number.isFinite(timeoutMs) ? timeoutMs : ACP_TIMEOUT_MS
    return await ask(session.child, { waitMs: Math.max(0, limit - KILL_WAIT_MS), now })
  } catch {
    return null
  } finally {
    release()
    stopAgent(session)
  }
}

module.exports = {
  ACP_TIMEOUT_MS,
  readBillingViaAcp,
  undoWhenKilled,
}
