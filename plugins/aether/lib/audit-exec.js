'use strict'

// The audit's command runner: it runs a file with a time limit and an environment without secrets, and never throws.
// Family: audit.

const { spawn } = require('node:child_process')
const { killGroup } = require('./common.js')

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

function collectCapped(chunks, chunk) {
  let size = 0
  for (const piece of chunks) size += piece.length
  if (size >= MAX_OUTPUT_BYTES) return
  const left = MAX_OUTPUT_BYTES - size
  chunks.push(chunk.length > left ? chunk.slice(0, left) : chunk)
}

// Runs file with args; never throws. Stdin is closed (or is `input`). The child is a process-group leader: on timeoutMs the whole group is killed with killGroup of lib/common.js.
// -> Promise<{ status: number | null, stdout: string, stderr: string, timedOut: boolean, error?: { code: string, message: string } }>
// stdout and stderr are cut at 8 MB each. A program that does not exist gives status null and error.code 'ENOENT'.
async function runCommand(file, args, { cwd, env, timeoutMs = 300000, input = null } = {}) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(file, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true })
    } catch (err) {
      resolve({ status: null, stdout: '', stderr: '', timedOut: false, error: { code: err.code || 'SPAWN', message: String((err && err.message) || err) } })
      return
    }
    const outChunks = []
    const errChunks = []
    child.stdout.on('data', (chunk) => collectCapped(outChunks, chunk))
    child.stderr.on('data', (chunk) => collectCapped(errChunks, chunk))
    let timedOut = false
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      timedOut = true
      killGroup(child.pid)
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    child.on('error', (err) => {
      finish({ status: null, stdout: Buffer.concat(outChunks).toString('utf8'), stderr: Buffer.concat(errChunks).toString('utf8'), timedOut, error: { code: err.code || 'SPAWN', message: String((err && err.message) || err) } })
    })
    child.on('close', (status) => {
      finish({ status: timedOut ? null : status, stdout: Buffer.concat(outChunks).toString('utf8'), stderr: Buffer.concat(errChunks).toString('utf8'), timedOut })
    })
    if (input === null || input === undefined) child.stdin.end()
    else child.stdin.end(input)
  })
}

// A copy of env without the names that look like secrets (/TOKEN|SECRET|PASSW(OR)?D|API_?KEY|ACCESS_KEY|CREDENTIAL|PRIVATE/i), with CI=true, GIT_TERMINAL_PROMPT=0 and NO_COLOR=1.
function projectEnv(env) {
  const SECRET_NAME = /TOKEN|SECRET|PASSW(OR)?D|API_?KEY|ACCESS_KEY|CREDENTIAL|PRIVATE/i
  const out = {}
  for (const [name, value] of Object.entries(env || {})) {
    if (SECRET_NAME.test(name)) continue
    out[name] = value
  }
  out.CI = 'true'
  out.GIT_TERMINAL_PROMPT = '0'
  out.NO_COLOR = '1'
  return out
}

module.exports = {
  runCommand,
  projectEnv,
}
