#!/usr/bin/env node
'use strict'

// A stand-in for `grok agent stdio` in tests. It speaks ACP, JSON-RPC 2.0 with one message per line, and answers with
// the lines grok 1.0.52 printed on 2026-10-14 (grok-acp-billing.jsonl): the answer to initialize, a notification, and
// the answer to _x.ai/billing. AETHER_FAKE_ACP_MODE says how it behaves:
//   answer (default)        answers both requests
//   garbage                 prints a line that is not JSON before its answer to initialize
//   silent                  never answers _x.ai/billing
//   error                   answers _x.ai/billing with a JSON-RPC error
//   no-config               answers _x.ai/billing with a result that has no config
//   exit-after-initialize   answers initialize and exits
//   stubborn                never answers _x.ai/billing, ignores SIGTERM (and logs that it got it), does not exit when its
//                           input ends, and starts a child in its group that ignores SIGTERM and carries no marker
//   leaver                  as stubborn, but the agent itself exits on SIGTERM, leaving its child (no marker) in its group
//   escaper                 as stubborn, but its child is in a session of its own and carries the marker
// AETHER_FAKE_ACP_LOG, when set, gets one JSON line when it starts ({ argv, cwd, cwdFiles, pid, pgid, updater, marker,
// secret }), one for each request it reads ({ request, params }), and in the three stubborn modes one for its child
// ({ child }) and one for each SIGTERM ({ signal }).
// The period in the fixture ended in October 2026. To answer for a period that is still running, and to leave in grok's
// log the line the real grok leaves when it answers, a test sets:
//   AETHER_FAKE_ACP_END_IN_HOURS   the answer's currentPeriod.end is this many hours from now
//   AETHER_FAKE_ACP_LOG_LINES      a file that gets a `billing: fetched credits config` line, as grok's unified.jsonl does

const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const { spawn } = require('node:child_process')

const [initialize, notification, billing] = fs.readFileSync(path.join(__dirname, 'grok-acp-billing.jsonl'), 'utf8').trim().split('\n')
const mode = process.env.AETHER_FAKE_ACP_MODE || 'answer'
const log = (entry) => {
  if (process.env.AETHER_FAKE_ACP_LOG) fs.appendFileSync(process.env.AETHER_FAKE_ACP_LOG, `${JSON.stringify(entry)}\n`)
}
const out = (text) => process.stdout.write(`${text}\n`)

log({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  cwdFiles: fs.readdirSync(process.cwd()),
  pid: process.pid,
  pgid: Number(fs.readFileSync('/proc/self/stat', 'utf8').split(') ')[1].split(' ')[2]),
  updater: process.env.GROK_DISABLE_AUTOUPDATER ?? null,
  marker: process.env.AETHER_LANE_CALL ?? null,
  secret: process.env.XAI_API_KEY ?? null,
})

if (mode === 'stubborn' || mode === 'leaver' || mode === 'escaper') {
  process.on('SIGTERM', () => {
    log({ signal: 'SIGTERM' })
    if (mode === 'leaver') process.exit(0)
  })
  setInterval(() => {}, 1000)
  const env = { ...process.env }
  if (mode !== 'escaper') delete env.AETHER_LANE_CALL
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { detached: mode === 'escaper', stdio: 'ignore', env })
  log({ child: child.pid })
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  log({ request: message.method, params: message.params, id: message.id })
  if (message.method === 'initialize') {
    if (mode === 'garbage') out('this line is not json')
    out(initialize)
    out(notification)
    if (mode === 'exit-after-initialize') process.exit(0)
  } else if (message.method === '_x.ai/billing') {
    if (mode === 'silent' || mode === 'stubborn' || mode === 'leaver' || mode === 'escaper') return
    if (mode === 'error') return out(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } }))
    if (mode === 'no-config') return out(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { subscription_tier: 'SuperGrok' } }))
    const hours = Number(process.env.AETHER_FAKE_ACP_END_IN_HOURS)
    let answer = billing
    if (process.env.AETHER_FAKE_ACP_END_IN_HOURS !== undefined && Number.isFinite(hours)) {
      const parsed = JSON.parse(billing)
      const end = new Date(Date.now() + hours * 3600 * 1000).toISOString()
      parsed.result.config.currentPeriod.end = end
      parsed.result.config.billingPeriodEnd = end
      answer = JSON.stringify(parsed)
    }
    if (process.env.AETHER_FAKE_ACP_LOG_LINES) {
      const entry = { ts: new Date().toISOString(), src: 'shell', pid: process.pid, ver: '1.0.52', lvl: 'info', msg: 'billing: fetched credits config', ctx: { config: JSON.parse(answer).result.config } }
      fs.mkdirSync(path.dirname(process.env.AETHER_FAKE_ACP_LOG_LINES), { recursive: true })
      fs.appendFileSync(process.env.AETHER_FAKE_ACP_LOG_LINES, `${JSON.stringify(entry)}\n`)
    }
    out(answer)
  }
})
