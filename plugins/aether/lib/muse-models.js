'use strict'

// Reads the models Muse offers over `muse serve`, last in the round.
// It spawns `<command> serve` with the read-only flags and speaks JSON-RPC
// 2.0 lines on stdio: initialize, then the initialized notification, then
// model/list. It never sends any other method and never calls the network.
// Family: model.

const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const SERVE_ARGS = ['serve', '--no-session-log', '--disable-shell', '--disable-write']
const KILL_GRACE_MS = 500

function pluginVersion() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.version === 'string' && parsed.version) return parsed.version
  } catch {}
  return '0.0.0'
}

function idsOf(models) {
  const out = []
  for (const row of models) {
    if (typeof row === 'string') {
      const id = row.trim()
      if (id) out.push(id)
    } else if (row && typeof row === 'object') {
      const id = typeof row.modelId === 'string' && row.modelId.trim()
        ? row.modelId.trim()
        : (typeof row.id === 'string' && row.id.trim() ? row.id.trim() : null)
      if (id) out.push(id)
    }
  }
  return out
}

function notInstalledReason(command) {
  return `${command} not found on PATH`
}

// Spawns `muse serve` and lists its models. Resolves, never rejects.
function listMuseModels({ command = 'muse', env = process.env, timeoutMs = 10000, spawn = childProcess.spawn, version } = {}) {
  const clientVersion = typeof version === 'string' && version ? version : pluginVersion()
  return new Promise((resolve) => {
    let settled = false
    let child = null
    let phase = 'init'
    let buffer = ''

    const kill = () => {
      if (!child) return
      try {
        if (typeof child.kill === 'function') child.kill('SIGTERM')
      } catch {}
      const target = child
      setTimeout(() => {
        try {
          if (typeof target.kill === 'function') target.kill('SIGKILL')
        } catch {}
        try {
          if (target.stdout && typeof target.stdout.destroy === 'function') target.stdout.destroy()
        } catch {}
        try {
          if (target.stderr && typeof target.stderr.destroy === 'function') target.stderr.destroy()
        } catch {}
        try {
          if (typeof target.unref === 'function') target.unref()
        } catch {}
      }, KILL_GRACE_MS)
      try {
        if (child.stdout && typeof child.stdout.destroy === 'function') child.stdout.destroy()
      } catch {}
      try {
        if (child.stderr && typeof child.stderr.destroy === 'function') child.stderr.destroy()
      } catch {}
      try {
        if (typeof child.unref === 'function') child.unref()
      } catch {}
    }

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      kill()
      resolve(result)
    }

    const timer = setTimeout(() => {
      finish({ status: 'timeout', reason: `timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    const send = (line) => {
      if (settled) return
      try {
        if (child && child.stdin && child.stdin.writable !== false) child.stdin.write(`${line}\n`)
      } catch {}
    }

    const onLine = (line) => {
      if (settled) return
      if (!line.trim()) return
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        finish({ status: 'failed', reason: 'invalid JSON from muse serve' })
        return
      }
      if (msg === null || typeof msg !== 'object') {
        finish({ status: 'failed', reason: 'invalid reply from muse serve' })
        return
      }
      if (phase === 'init') {
        if (msg.id !== 1) return
        if (msg.error || !msg.result || typeof msg.result !== 'object') {
          finish({ status: 'failed', reason: 'initialize failed' })
          return
        }
        phase = 'list'
        send('{"jsonrpc":"2.0","method":"initialized"}')
        send('{"jsonrpc":"2.0","id":2,"method":"model/list","params":{}}')
        return
      }
      if (phase === 'list') {
        if (msg.id !== 2) return
        if (msg.error) {
          const detail = msg.error && msg.error.message ? `: ${msg.error.message}` : ''
          finish({ status: 'failed', reason: `model/list failed${detail}` })
          return
        }
        const models = msg.result && msg.result.models
        if (!Array.isArray(models) || models.length === 0) {
          finish({ status: 'failed', reason: 'model/list returned no models' })
          return
        }
        const ids = idsOf(models)
        if (ids.length === 0) {
          finish({ status: 'failed', reason: 'model/list returned no models' })
          return
        }
        finish({ status: 'ok', ids })
      }
    }

    try {
      child = spawn(command, SERVE_ARGS, { env, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      if (err && (err.code === 'ENOENT' || /ENOENT/i.test(String(err.message)))) {
        finish({ status: 'not-installed', reason: notInstalledReason(command) })
      } else {
        finish({ status: 'failed', reason: err && err.message ? err.message : String(err) })
      }
      return
    }

    if (!child || typeof child.on !== 'function') {
      finish({ status: 'failed', reason: 'could not start muse serve' })
      return
    }

    // The server may exit before it reads: a write to a closed pipe raises
    // EPIPE as an async error, which must never crash the caller.
    const swallow = (stream) => {
      if (stream && typeof stream.on === 'function') stream.on('error', () => {})
    }
    swallow(child.stdin)
    swallow(child.stdout)
    swallow(child.stderr)

    if (child.stdout && typeof child.stdout.setEncoding === 'function') child.stdout.setEncoding('utf8')
    if (child.stdout && typeof child.stdout.on === 'function') {
      child.stdout.on('data', (chunk) => {
        buffer += String(chunk)
        let idx
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 1)
          onLine(line)
          if (settled) {
            buffer = ''
            return
          }
        }
      })
    }
    if (child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', () => {})
    }
    child.on('error', (err) => {
      if (err && (err.code === 'ENOENT' || /ENOENT/i.test(String(err && err.message)))) {
        finish({ status: 'not-installed', reason: notInstalledReason(command) })
      } else {
        finish({ status: 'failed', reason: err && err.message ? err.message : String(err) })
      }
    })
    child.on('close', (code) => {
      if (settled) return
      finish({ status: 'failed', reason: code === 0 ? 'muse serve exited before answering' : `muse serve exited with code ${code}` })
    })

    send(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"aether","version":"${clientVersion}"}}}`)
  })
}

module.exports = { listMuseModels }
