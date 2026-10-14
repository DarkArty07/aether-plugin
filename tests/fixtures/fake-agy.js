#!/usr/bin/env node
'use strict'

// A stand-in for the agy CLI in tests. It acts out the directives it finds in its prompt, one per
// line, each starting with "FAKE-AGY: ", and answers in agy 1.3.2's JSON shape (2026-10-08).
//
//   write <relative path> <text...>     writes "<text>\n" under the working directory
//   write-abs <absolute path> <text...> writes "<text>\n" to an absolute path
//   copy <absolute path> <relative path>  copies a file into the working directory
//   commit <message...>                 git add -A and git commit in the working directory
//   sleep <seconds>                     waits before answering
//   detach <pid file> <seconds>         starts `sleep <seconds>` in a session of its own, as agy starts
//                                       its commands, and writes its pid to <pid file>
//   env <absolute path>                 writes its environment there, as a JSON object
//   answer <json>                       the structured output
//   usage <input> <output> <thinking> <cacheRead>   this turn's tokens (default 1000 200 0 500)
//   exit-error [<text...>]              agy's answer to an invalid model: exit 1, status ERROR, with
//                                       <text> as its error (default: model not found: <model>)
//   stderr <text...>                    the stderr line of exit-error (default: Error: model not found)
//   timeout                             agy's answer to a print timeout: exit 0, empty response
//   new-conversation                    a resume that silently starts a new conversation
//
// "/usage" as the prompt prints the quota. AETHER_FAKE_AGY_QUOTA_FILE, when it exists, holds
// { "<group name>": [<5h remaining>, <weekly remaining>, <5h reset>, <weekly reset>] }, the resets being optional (null
// or missing gives the old fixed times); otherwise every window is at 0.9.
// AETHER_FAKE_AGY_LOG, when set, gets one JSON line per call: { argv, cwd, marker, files, head }.
// AETHER_FAKE_AGY_STATE, when set, is a directory that keeps each conversation's running usage.

const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? null : argv[i + 1]
}
const zero = () => ({ input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 0 })
const print = (value) => process.stdout.write(`${JSON.stringify(value)}\n`)

function log() {
  if (!process.env.AETHER_FAKE_AGY_LOG) return
  const tmp = path.join(process.cwd(), '.aether-tmp')
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
  fs.appendFileSync(
    process.env.AETHER_FAKE_AGY_LOG,
    `${JSON.stringify({
      argv,
      cwd: process.cwd(),
      marker: process.env.AETHER_LANE_CALL || null,
      files: fs.existsSync(tmp) ? fs.readdirSync(tmp).sort() : [],
      head: head.status === 0 ? head.stdout.trim() : null,
    })}\n`,
  )
}

log()

if (argv[0] === '--version') {
  process.stdout.write('agy 1.3.2\n')
  process.exit(0)
}

const prompt = flag('-p') || ''

if (prompt === '/usage') {
  const file = process.env.AETHER_FAKE_AGY_QUOTA_FILE
  const quota = file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { 'Gemini Models': [0.9, 0.9], 'Claude and GPT models': [0.9, 0.9] }
  const groups = Object.entries(quota).map(([name, [fiveHour, weekly, fiveHourReset, weeklyReset]]) => ({
    name,
    buckets: [
      { id: `${name}-weekly`, window: 'weekly', remaining_fraction: weekly, reset_time: weeklyReset ?? '2026-10-14T03:35:44Z' },
      { id: `${name}-5h`, window: '5h', remaining_fraction: fiveHour, reset_time: fiveHourReset ?? '2026-10-09T05:53:31Z' },
    ],
  }))
  print({ conversation_id: '', status: 'SUCCESS', response: 'quota', usage: zero(), command: { name: 'usage', data: { groups } } })
  process.exit(0)
}

let structured = null
let turn = [1000, 200, 0, 500]
let mode = 'answer'
let errorText = null
let stderrText = 'Error: model not found'
let fresh = false
for (const line of prompt.split('\n')) {
  if (!line.startsWith('FAKE-AGY: ')) continue
  const [verb, ...rest] = line.slice('FAKE-AGY: '.length).split(' ')
  if (verb === 'write' || verb === 'write-abs') {
    const target = verb === 'write' ? path.join(process.cwd(), rest[0]) : rest[0]
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, `${rest.slice(1).join(' ')}\n`)
  } else if (verb === 'copy') {
    const target = path.join(process.cwd(), rest[1])
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(rest[0], target)
  } else if (verb === 'commit') {
    spawnSync('git', ['add', '-A'], { encoding: 'utf8' })
    spawnSync('git', ['commit', '-q', '-m', rest.join(' ')], { encoding: 'utf8' })
  } else if (verb === 'sleep') {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(rest[0]) * 1000)
  } else if (verb === 'detach') {
    const child = spawn('sleep', [rest[1]], { detached: true, stdio: 'ignore' })
    fs.writeFileSync(rest[0], `${child.pid}\n`)
    child.unref()
  } else if (verb === 'env') {
    fs.writeFileSync(rest[0], JSON.stringify(process.env))
  } else if (verb === 'answer') {
    structured = JSON.parse(rest.join(' '))
  } else if (verb === 'usage') {
    turn = rest.map(Number)
  } else if (verb === 'exit-error' || verb === 'timeout') {
    mode = verb
    if (verb === 'exit-error' && rest.length > 0) errorText = rest.join(' ')
  } else if (verb === 'stderr') {
    stderrText = rest.join(' ')
  } else if (verb === 'new-conversation') {
    fresh = true
  }
}

if (mode === 'exit-error') {
  print({ conversation_id: '', status: 'ERROR', error: errorText ?? `model not found: ${flag('--model')}`, response: '', usage: zero() })
  process.stderr.write(`${stderrText}\n`)
  process.exit(1)
}

const asked = flag('--conversation')
const id = asked && !fresh ? asked : `conv-${process.pid}-${Date.now()}`
if (asked && fresh) process.stderr.write(`[agy] conversation ${asked} not found, starting a new conversation\n`)

// Usage is cumulative per conversation, as agy reports it.
let totals = turn
if (process.env.AETHER_FAKE_AGY_STATE) {
  const file = path.join(process.env.AETHER_FAKE_AGY_STATE, `${id}.json`)
  const before = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [0, 0, 0, 0]
  totals = before.map((value, i) => value + turn[i])
  fs.writeFileSync(file, JSON.stringify(totals))
}
const [input, output, thinking, cacheRead] = totals
const usage = { input_tokens: input, output_tokens: output, thinking_tokens: thinking, cache_read_tokens: cacheRead, total_tokens: input + output }

if (mode === 'timeout') {
  print({ conversation_id: id, status: 'SUCCESS', response: '', duration_seconds: 10, num_turns: 1, usage })
  process.stderr.write('[agy] print timeout 10s reached, returning partial output\n')
  process.exit(0)
}

const answer = { conversation_id: id, status: 'SUCCESS', response: structured ? JSON.stringify({ ...structured, toolAction: 'respond', toolSummary: 'done' }) : 'done', duration_seconds: 1, num_turns: 1, usage }
if (structured) answer.structured_output = structured
print(answer)
