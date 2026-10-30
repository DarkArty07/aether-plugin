#!/usr/bin/env node
'use strict'

// A stand-in for the codex CLI in tests (`codex exec --json ...` and `codex app-server`).
// Family: test fixture.

const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const { execFileSync } = require('node:child_process')

const argv = process.argv.slice(2)

function readScript() {
  const source = process.env.AETHER_FAKE_CODEX_SCRIPT
  if (!source) return {}
  let parsed
  try {
    parsed = JSON.parse(source)
  } catch {
    return {}
  }
  if (!Array.isArray(parsed)) return parsed
  const stateFile = process.env.AETHER_FAKE_CODEX_STATE
  let index = 0
  if (stateFile) {
    try {
      index = parseInt(fs.readFileSync(stateFile, 'utf8').trim(), 10)
      if (Number.isNaN(index)) index = 0
    } catch {
      index = 0
    }
    try {
      fs.writeFileSync(stateFile, String(index + 1))
    } catch {}
  }
  return parsed[index] ?? {}
}

async function handleExec() {
  const script = readScript()
  if (process.env.AETHER_FAKE_CODEX_LOG) {
    const entry = {
      kind: 'exec',
      argv,
      cwd: process.cwd(),
      home: process.env.HOME ?? null,
      apiKey: process.env.OPENAI_API_KEY ?? null,
    }
    fs.appendFileSync(process.env.AETHER_FAKE_CODEX_LOG, `${JSON.stringify(entry)}\n`)
  }
  if (script.files) {
    for (const [file, text] of Object.entries(script.files)) {
      const target = path.resolve(process.cwd(), file)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, text)
    }
  }
  if (typeof script.commit === 'string') {
    execFileSync('git', ['add', '-A'], { cwd: process.cwd(), stdio: 'ignore' })
    execFileSync('git', ['commit', '-q', '-m', script.commit], { cwd: process.cwd(), stdio: 'ignore' })
  }
  if (Number.isFinite(script.sleepMs) && script.sleepMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, script.sleepMs))
  }
  if (script.stdout !== undefined) {
    process.stdout.write(script.stdout)
  } else {
    const answer = typeof script.answer === 'string' ? script.answer : '{"ok":true}'
    const events = [
      JSON.stringify({ type: 'thread.started', thread_id: 't1' }),
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: answer } }),
      JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 1000, cached_input_tokens: 800, cache_write_input_tokens: 0, output_tokens: 200, reasoning_output_tokens: 0 },
      }),
    ]
    process.stdout.write(`${events.join('\n')}\n`)
  }
  if (script.stderr) {
    process.stderr.write(script.stderr)
  }
  process.exit(script.exit ?? 0)
}

function handleAppServer() {
  if (process.env.AETHER_FAKE_CODEX_PID) {
    fs.writeFileSync(process.env.AETHER_FAKE_CODEX_PID, String(process.pid))
  }
  if (process.env.AETHER_FAKE_CODEX_APPSERVER === 'exit') {
    process.exit(3)
  }
  const methods = []
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let message
    try {
      message = JSON.parse(trimmed)
    } catch {
      return
    }
    if (message.method) methods.push(message.method)
    if (process.env.AETHER_FAKE_CODEX_LOG) {
      const entry = { kind: 'app-server', methods: [...methods], apiKey: process.env.OPENAI_API_KEY ?? null }
      fs.appendFileSync(process.env.AETHER_FAKE_CODEX_LOG, `${JSON.stringify(entry)}\n`)
    }
    if (process.env.AETHER_FAKE_CODEX_APPSERVER === 'hang') {
      return
    }
    if (message.method === 'initialize') {
      process.stdout.write(`${JSON.stringify({ id: message.id, result: { userAgent: 'fake' } })}\n`)
    } else if (message.method === 'initialized') {
      // nothing
    } else if (message.method === 'account/rateLimits/read') {
      if (process.env.AETHER_FAKE_CODEX_APPSERVER === 'error') {
        process.stdout.write(`${JSON.stringify({ id: message.id, error: { code: -32000, message: 'not signed in' } })}\n`)
      } else {
        const file = process.env.AETHER_FAKE_CODEX_RATE_LIMITS
        let result = {}
        if (file) {
          try {
            result = JSON.parse(fs.readFileSync(file, 'utf8'))
          } catch {}
        }
        process.stdout.write(`${JSON.stringify({ id: message.id, result })}\n`)
      }
    }
  })
}

if (argv[0] === '--version') {
  process.stdout.write('codex-cli 0.166.0\n')
} else if (argv[0] === 'exec') {
  handleExec()
} else if (argv[0] === 'app-server') {
  handleAppServer()
} else {
  process.stderr.write(`unknown command: ${argv[0] || ''}\n`)
  process.exit(2)
}
